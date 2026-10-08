import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssessmentServer } from '../server.mjs';
import { createInitialState } from '../../frontend/src/model.ts';

test('FSP demonstration routes require a candidate session and protect ownership, CSRF identity and profile revisions', async t => {
  const codes = new Map();
  const service = createAssessmentServer({ dbPath: ':memory:', authEnv: {},
    authMailer: async ({ email, code }) => { codes.set(email, code); return { delivery: 'development' }; } });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { service.server.close(resolve); service.server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${service.server.address().port}`;
  function browser() {
    const cookies = new Map(); let identity;
    return async (path, method = 'GET', input, headers = {}) => {
      const response = await fetch(base + path, { method, headers: { Origin: base,
        Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        ...(input === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(identity ? { 'X-Platform-Identity': identity } : {}), ...headers,
      }, body: input === undefined ? undefined : JSON.stringify(input) });
      for (const value of response.headers.getSetCookie()) {
        const [key, token] = value.split(';')[0].split('=');
        if (token) cookies.set(key, token); else cookies.delete(key);
      }
      identity = response.headers.get('X-Platform-Identity') || identity;
      return { status: response.status, data: await response.json() };
    };
  }
  async function register(client, role, login) {
    const email = `${login}@example.invalid`;
    assert.equal((await client('/api/auth/register/request-code', 'POST', { role, email, login,
      password: 'Fsp isolated password 928!', consent: true,
      ...(role === 'candidate' ? { name: 'Кандидат проверки ФСП' } : { companyName: 'Компания проверки ФСП' }) })).status, 202);
    assert.equal((await client('/api/auth/register/verify', 'POST', { email, code: codes.get(email) })).status, 201);
    const current = await client('/api/platform/state');
    const state = createInitialState();
    if (role === 'candidate') Object.assign(state.profile, { name: 'Кандидат проверки ФСП', email,
      professionalRole: 'Frontend разработчик', stack: ['React'], consent: true, visible: true });
    else Object.assign(state.company, { name: 'Компания проверки ФСП', contact: email });
    assert.equal((await client('/api/platform/state', 'PUT', { state, baseRevision: current.data.revision })).status, 200);
  }
  const guest = browser(), candidate = browser(), other = browser(), employer = browser();
  assert.equal((await guest('/api/integrations/fsp-demo')).status, 401);
  await register(candidate, 'candidate', 'fsp.http.candidate');
  await register(other, 'candidate', 'fsp.http.other');
  await register(employer, 'employer', 'fsp.http.employer');
  assert.equal((await employer('/api/integrations/fsp-demo')).status, 403);
  assert.equal((await employer('/api/integrations/fsp-demo/connect', 'POST', { baseRevision: 1, consent: true })).status, 403);
  const before = await candidate('/api/integrations/fsp-demo');
  assert.equal(before.status, 200); assert.equal(before.data.connection, null);
  assert.equal((await candidate('/api/integrations/fsp-demo/connect', 'POST', { baseRevision: 1, consent: true },
    { 'X-Platform-Identity': 'auth:someone-else' })).status, 409);
  assert.equal((await candidate('/api/integrations/fsp-demo/connect', 'POST', { baseRevision: 1, consent: true },
    { Origin: 'https://foreign.example.invalid' })).status, 403);
  assert.equal((await candidate('/api/integrations/fsp-demo/connect', 'POST',
    { baseRevision: 1, consent: true, externalId: 'STOLEN-FSP' })).status, 400);
  const linked = await candidate('/api/integrations/fsp-demo/connect', 'POST', { baseRevision: 1, consent: true });
  assert([200, 201].includes(linked.status)); assert.equal(linked.data.profile.achievements.length, 1);
  assert.equal(linked.data.connection.identityVerified, false); assert.equal(linked.data.profile.fspEvidence.mode, 'demo');
  const another = await other('/api/integrations/fsp-demo?owner=fsp.http.candidate');
  assert.equal(another.status, 200); assert.equal(another.data.connection, null);
  assert.equal((await other('/api/integrations/fsp-demo/sync', 'POST',
    { baseRevision: 1, owner: 'fsp.http.candidate' })).status, 400);
  assert.equal((await candidate('/api/integrations/fsp-demo/sync', 'POST', { baseRevision: 1 })).status, 409);
  const updated = await candidate('/api/integrations/fsp-demo/sync', 'POST', { baseRevision: linked.data.revision });
  assert.equal(updated.status, 200); assert.equal(updated.data.profile.achievements.length, 1);
  const snapshot = await candidate('/api/platform/state');
  assert.equal(snapshot.data.state.profile.fspEvidence.identityVerified, false);
  assert.equal(snapshot.data.state.profile.achievements[0].title, updated.data.evidence[0].title);
  const clear = await candidate('/api/integrations/fsp-demo', 'DELETE', { baseRevision: updated.data.revision });
  assert.equal(clear.status, 200); assert.equal(clear.data.connection, null);
  assert.equal(clear.data.profile.fspId, ''); assert.deepEqual(clear.data.profile.achievements, []);
  assert.equal((await candidate('/api/integrations/fsp-demo/sync', 'POST', { baseRevision: clear.data.revision })).status, 409);
});
