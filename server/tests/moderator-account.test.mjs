import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';
import { AuthStore } from '../auth.mjs';
import { createAssessmentServer } from '../server.mjs';

test('an old two-role database keeps its accounts, gains the moderator role and ends employer moderation', t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE auth_accounts (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, login TEXT NOT NULL, login_normalized TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK(role IN ('candidate','employer')), name TEXT NOT NULL, company_name TEXT NOT NULL, password_hash TEXT NOT NULL,
      platform_owner TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;
    CREATE TABLE auth_moderator_grants (account_id TEXT PRIMARY KEY REFERENCES auth_accounts(id) ON DELETE CASCADE, granted_at TEXT NOT NULL, granted_by TEXT NOT NULL) STRICT;
    CREATE TABLE auth_moderator_audit (id INTEGER PRIMARY KEY, account_id TEXT NOT NULL, action TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL) STRICT;
    CREATE TABLE auth_sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES auth_accounts(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL) STRICT;
    INSERT INTO auth_accounts VALUES ('e1','boss@example.test','boss','boss','employer','','Компания','hash','owner-e1','2026-01-01','2026-01-01');
    INSERT INTO auth_moderator_grants VALUES ('e1','2026-01-01','local-operator');
    INSERT INTO auth_sessions VALUES ('token','e1','2026-01-01','2099-01-01');`);
  const store = new AuthStore(':memory:', { database: db });
  assert.match(db.prepare(`SELECT sql FROM sqlite_master WHERE name='auth_accounts'`).get().sql, /'moderator'/u);
  assert.equal(store.accountByIdentifier('boss').company_name, 'Компания');
  assert.equal(store.canModerate('e1'), false, 'An employer grant ends');
  assert.equal(db.prepare(`SELECT action FROM auth_moderator_audit WHERE account_id='e1'`).get().action, 'revoke');
  assert.equal(store.accountBySession('token', '2026-06-01').id, 'e1', 'Sessions keep their account');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  db.prepare(`DELETE FROM auth_accounts WHERE id='e1'`).run();
  assert.equal(db.prepare('SELECT count(*) AS n FROM auth_sessions').get().n, 0, 'Foreign keys still cascade after the rebuild');
  new AuthStore(':memory:', { database: db });
});

test('a moderator account works only in the moderator cabinet and cannot be registered or granted to an employer', async t => {
  const codes = new Map();
  const service = createAssessmentServer({ dbPath: ':memory:', authEnv: {}, authMailer: async ({ email, code }) => { codes.set(email, code); } });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { service.server.close(resolve); service.server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${service.server.address().port}`;
  const client = () => {
    const cookies = new Map();
    return async (path, method = 'GET', input) => {
      const response = await fetch(base + path, { method, headers: { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        ...(input === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: input === undefined ? undefined : JSON.stringify(input) });
      for (const value of response.headers.getSetCookie()) { const [key, token] = value.split(';')[0].split('='); if (token) cookies.set(key, token); }
      return { status: response.status, data: await response.json() };
    };
  };
  const guest = client();
  const signup = { role: 'moderator', login: 'self.moderator', email: 'self.moderator@example.test', password: 'Moderator fixture 2026',
    consent: true, privacyVersion: PRIVACY_POLICY_VERSION, name: 'Самозванец' };
  assert.equal((await guest('/api/auth/register/request-code', 'POST', signup)).status, 400, 'Signup never creates a moderator');

  const employer = client(), email = 'hiring@example.test';
  await employer('/api/auth/register/request-code', 'POST', { role: 'employer', login: 'hiring', email, password: 'Moderator fixture 2026',
    consent: true, privacyVersion: PRIVACY_POLICY_VERSION, companyName: 'Компания' });
  const hiring = (await employer('/api/auth/register/verify', 'POST', { email, code: codes.get(email) })).data.account;
  assert.throws(() => service.auth.store.setModerator(hiring.id, true), error => error.status === 409);
  assert.equal((await employer('/api/moderation/assessments')).status, 403);

  const created = await service.auth.createModerator({ login: 'staff', email: 'staff@example.test', name: 'Анна Экспертова', password: 'Moderator fixture 2026', actor: 'test' });
  await assert.rejects(service.auth.createModerator({ login: 'hiring', email: 'other@example.test', password: 'Moderator fixture 2026' }), error => error.status === 409);
  const moderator = client();
  const signedIn = await moderator('/api/auth/login', 'POST', { loginOrEmail: 'staff', password: 'Moderator fixture 2026' });
  assert.equal(signedIn.status, 200);
  assert.deepEqual([signedIn.data.account.role, signedIn.data.account.canModerate, signedIn.data.account.name], ['moderator', true, 'Анна Экспертова']);
  for (const path of ['/api/moderation/assessments', '/api/item-bank/items', '/api/review-bank/variants', '/api/moderation/claims', '/api/auth/me']) {
    assert.equal((await moderator(path)).status, 200, path);
  }
  for (const path of ['/api/platform/state', '/api/directory/search?q=react', '/api/directory/options', '/api/companies', '/api/vacancies',
    '/api/applications', '/api/tasks', '/api/assistant/info', '/api/achievement-claims', '/api/profile/evidence']) {
    assert.equal((await moderator(path)).status, 403, path);
  }
  service.auth.store.setModerator(created.id, false, 'test');
  assert.equal((await moderator('/api/moderation/assessments')).status, 403, 'A suspended moderator loses access at once');
  assert.equal((await moderator('/api/auth/me')).data.account.canModerate, false);
  service.auth.store.setModerator(created.id, true, 'test');
  assert.equal((await moderator('/api/moderation/assessments')).status, 200);
});
