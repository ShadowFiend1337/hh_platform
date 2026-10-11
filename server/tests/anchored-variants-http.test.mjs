import assert from 'node:assert/strict';
import test from 'node:test';
import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';
import { createAssessmentServer } from '../server.mjs';
import { anchoredReply, fixtureAnchorId } from './fixtures/anchored-variant.mjs';
import { independentReviewChecks } from '../anchored-variant-store.mjs';

test('author API keeps keys private, denies spoofed privileges and spends one call per draft', async t => {
  let calls = 0, raw = anchoredReply(); const codes = new Map();
  const service = createAssessmentServer({ dbPath: ':memory:', authEnv: {}, integrationOptions: { automatic: false },
    authMailer: async ({ email, code }) => codes.set(email, code),
    llm: { configured: true, models: { chat: 'qwen/fixture' }, chat: async options => {
      calls++; assert.equal(options.retries, 0); assert.equal(options.fallback, null);
      return { model: 'qwen/fixture', json: raw };
    } } });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { service.server.close(resolve); service.server.closeAllConnections(); }));
  const base = 'http://127.0.0.1:' + service.server.address().port;
  function client() {
    const cookies = new Map();
    return async (path, method = 'GET', input) => {
      const res = await fetch(base + path, { method, headers: { Origin: base,
        Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '), ...(input ? { 'Content-Type': 'application/json' } : {}) },
        body: input ? JSON.stringify(input) : undefined });
      for (const cookie of res.headers.getSetCookie()) { const [k, v] = cookie.split(';')[0].split('='); cookies.set(k, v); }
      return { status: res.status, data: await res.json() };
    };
  }
  async function register(client, login) {
    const email = login + '@example.invalid';
    assert.equal((await client('/api/auth/register/request-code', 'POST', { email, login, role: 'employer',
      password: 'Authoring fixture password 2026', companyName: 'Проверка авторского API', consent: true, privacyVersion: PRIVACY_POLICY_VERSION })).status, 202);
    const result = await client('/api/auth/register/verify', 'POST', { email, code: codes.get(email) });
    assert.equal(result.status, 201); return result.data.account;
  }
  const guest = client(), ordinary = client(), moderator = client(), path = '/api/review-bank/variants';
  assert.equal((await guest(path)).status, 401);
  await register(ordinary, 'variant.ordinary');
  assert.equal((await ordinary(path + '/generate', 'POST', { anchorId: fixtureAnchorId, canModerate: true })).status, 403);
  const expert = await service.auth.createModerator({ login: 'variant.expert', email: 'variant.expert@example.invalid', password: 'Authoring fixture password 2026', actor: 'fixture' });
  assert.equal((await moderator('/api/auth/login', 'POST', { loginOrEmail: 'variant.expert', password: 'Authoring fixture password 2026' })).status, 200);
  assert.equal((await moderator(path)).data.generator.llmCallsPerVariant, 1);
  for (const input of [{ anchorId: 'bad' }, { anchorId: fixtureAnchorId, grade: 'Lead' }, { anchorId: fixtureAnchorId, mode: 'novel' }]) {
    assert.equal((await moderator(path + '/generate', 'POST', input)).status, 400);
  }
  assert.equal(calls, 0);
  const generated = await moderator(path + '/generate', 'POST', { anchorId: fixtureAnchorId });
  assert.equal(generated.status, 201); assert.equal(calls, 1);
  const item = generated.data;
  assert.equal(item.review.active, false); assert.equal(item.passport.grade, 'Middle'); assert(item.content.solution);
  const privateRoute = path + '/' + item.id;
  assert.equal((await ordinary(privateRoute)).status, 403);
  assert.equal((await ordinary(privateRoute + '/review', 'POST', { decision: 'accept' })).status, 403);
  assert.equal((await moderator(privateRoute)).data.sourceUrl, item.sourceUrl);
  assert.equal((await moderator(privateRoute + '/review', 'POST', { decision: 'accept' })).status, 400);
  const reviewed = await moderator(privateRoute + '/review', 'POST', { decision: 'accept',
    checks: Object.fromEntries(independentReviewChecks.map(check => [check, true])),
    rationale: 'Тестовая проверка механизма доступа и сохранения. Это не настоящая предметная экспертиза кейса или эмпирическая калибровка уровня.' });
  assert.equal(reviewed.status, 200); assert.equal(reviewed.data.review.active, false);
  assert.equal(service.store.db.prepare('SELECT count(*) AS n FROM bank_items').get().n, 0);
  raw = { invalid: true };
  const rejected = await moderator(path + '/generate', 'POST', { anchorId: fixtureAnchorId });
  assert.equal(rejected.status, 422); assert.equal(calls, 2);
  assert.equal(service.variants.list().length, 1);
  service.auth.store.setModerator(expert.id, false, 'fixture');
  assert.equal((await moderator(privateRoute)).status, 403);
});
