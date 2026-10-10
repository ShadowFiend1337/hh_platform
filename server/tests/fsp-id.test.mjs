import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createAssessmentServer } from '../server.mjs';
import { fspParticipants } from '../fsp-id.mjs';
import { prepareLocalAccounts } from '../../scripts/local-accounts.mjs';

async function start(t, authEnv = {}) {
  const service = createAssessmentServer({ dbPath: ':memory:', authEnv, authMailer: async () => {} });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { service.server.close(resolve); service.server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${service.server.address().port}`;
  const cookies = new Map();
  const request = async (path, { method = 'GET', body, form } = {}) => {
    const response = await fetch(base + path, { method, redirect: 'manual', headers: { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
      ...(body ? { 'Content-Type': 'application/json' } : form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: body ? JSON.stringify(body) : form ? new URLSearchParams(form).toString() : undefined });
    for (const value of response.headers.getSetCookie()) { const [key, token] = value.split(';')[0].split('='); if (token) cookies.set(key, token); else cookies.delete(key); }
    const type = response.headers.get('content-type') || '';
    return { status: response.status, location: response.headers.get('location'), data: type.includes('json') ? await response.json() : await response.text() };
  };
  return { service, request };
}

async function signIn(request, participant) {
  const started = await request('/api/auth/fsp/start');
  assert.equal(started.status, 302);
  const authorize = new URL(started.location, 'http://local');
  assert.equal(authorize.pathname, '/api/fsp-id/realms/fsp/protocol/openid-connect/auth');
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  const page = await request(authorize.pathname + authorize.search);
  assert.equal(page.status, 200); assert.match(page.data, /ФСП ID/u); assert.match(page.data, new RegExp(participant.name, 'u'));
  const consent = await request(authorize.pathname, { method: 'POST', form: { ...Object.fromEntries(authorize.searchParams), participant: participant.sub, decision: 'allow' } });
  assert.equal(consent.status, 302);
  const callback = new URL(consent.location, 'http://local');
  assert.equal(callback.pathname, '/api/auth/fsp/callback');
  return request(callback.pathname + callback.search);
}

test('FSP ID sign-in: PKCE code flow, consented account with imported achievements, then direct sign-in', async t => {
  const { service, request } = await start(t);
  const participant = fspParticipants[0];
  const callback = await signIn(request, participant);
  const ticket = new URL(callback.location, 'http://local').searchParams.get('ticket');
  assert.match(callback.location, /^\/auth\?mode=fsp&ticket=/u);
  const preview = await request('/api/auth/fsp/ticket?ticket=' + encodeURIComponent(ticket));
  assert.equal(preview.data.name, participant.name); assert.equal(preview.data.fspId, participant.fspId);
  assert.equal(preview.data.achievements.length, participant.achievements.length);
  assert.equal((await request('/api/auth/fsp/complete', { method: 'POST', body: { ticket, login: preview.data.suggestedLogin, consent: false, privacyVersion: PRIVACY_POLICY_VERSION } })).status, 400);
  const created = await request('/api/auth/fsp/complete', { method: 'POST', body: { ticket, login: preview.data.suggestedLogin, consent: true, privacyVersion: PRIVACY_POLICY_VERSION } });
  assert.equal(created.status, 201); assert.equal(created.data.account.role, 'candidate'); assert.equal(created.data.account.email, participant.email);
  const state = await request('/api/platform/state');
  assert.equal(state.data.state.profile.fspId, participant.fspId);
  assert.deepEqual(state.data.state.profile.achievements.map(item => item.title), participant.achievements.map(item => item.title));
  assert.equal(state.data.state.profile.confirmed, null, 'FSP results never confirm a grade');
  assert.equal((await request('/api/auth/fsp/complete', { method: 'POST', body: { ticket, login: 'another.login', consent: true, privacyVersion: PRIVACY_POLICY_VERSION } })).status, 410);
  await request('/api/auth/logout', { method: 'POST', body: {} });
  const again = await signIn(request, participant);
  assert.equal(again.location, '/app?role=candidate', 'A linked FSP ID signs in directly');
  assert.equal((await request('/api/auth/me')).data.account.email, participant.email);
  assert.equal(service.auth.federatedAccount('fsp-id', participant.sub).email, participant.email);
});

test('FSP ID rejects a forged state, a cancelled consent and the participant without history still works', async t => {
  const { request } = await start(t);
  const started = await request('/api/auth/fsp/start');
  const authorize = new URL(started.location, 'http://local');
  const consent = await request(authorize.pathname, { method: 'POST', form: { ...Object.fromEntries(authorize.searchParams), state: 'forged', participant: fspParticipants[1].sub, decision: 'allow' } });
  const forged = await request(new URL(consent.location, 'http://local').pathname + new URL(consent.location, 'http://local').search);
  assert.equal(forged.location, '/auth?mode=login&fsp=failed');
  const denied = await request('/api/auth/fsp/start').then(response => new URL(response.location, 'http://local'));
  const cancel = await request(denied.pathname, { method: 'POST', form: { ...Object.fromEntries(denied.searchParams), participant: fspParticipants[1].sub, decision: 'deny' } });
  const cancelled = await request(new URL(cancel.location, 'http://local').pathname + new URL(cancel.location, 'http://local').search);
  assert.equal(cancelled.location, '/auth?mode=login&fsp=cancelled');
  const empty = fspParticipants.find(item => !item.achievements.length);
  const callback = await signIn(request, empty);
  const ticket = new URL(callback.location, 'http://local').searchParams.get('ticket');
  const preview = await request('/api/auth/fsp/ticket?ticket=' + encodeURIComponent(ticket));
  assert.deepEqual(preview.data.achievements, []);
  assert.equal((await request('/api/auth/fsp/complete', { method: 'POST', body: { ticket, login: preview.data.suggestedLogin, consent: true, privacyVersion: PRIVACY_POLICY_VERSION } })).status, 201);
  assert.deepEqual((await request('/api/platform/state')).data.state.profile.achievements, [], 'No FSP history is handled without errors');
});

test('demo accounts are listed only when they exist and never in production', async t => {
  const { service, request } = await start(t);
  assert.deepEqual((await request('/api/auth/demo-accounts')).data.accounts, []);
  await prepareLocalAccounts(':memory:').catch(() => {});
  const production = await start(t, { APP_ENV: 'production' });
  assert.deepEqual((await production.request('/api/auth/demo-accounts')).data.accounts, []);
  assert.equal((await production.request('/api/fsp-id/realms/fsp/.well-known/openid-configuration')).status, 404);
  assert.equal((await request('/api/fsp-id/realms/fsp/.well-known/openid-configuration')).data.code_challenge_methods_supported[0], 'S256');
  assert.ok(service);
});
