import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DirectoryStore } from '../directory-store.mjs';
import { IntegrationService, normalizeEvidence } from '../integrations/service.mjs';
import { DemoFspProvider, FspProvider, ProviderError, remoteJson, trustedUrl } from '../integrations/providers.mjs';
import { createAssessmentServer } from '../server.mjs';
import { createInitialState } from '../../frontend/src/model.ts';
import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';

const ownerA = 'a'.repeat(64), ownerB = 'b'.repeat(64);
const time = Date.parse('2026-10-07T09:00:00.000Z');
const achievement = (changes = {}) => ({ id: 'competition-1', title: 'Официальное соревнование', discipline: 'algorithms',
  occurredAt: '2026-09-01T00:00:00.000Z', result: 'Финалист', place: 3, participation: 'individual', teamRole: null,
  sourceUrl: 'https://federation.example/events/1', status: 'active', ...changes });
function liveProvider(overrides = {}) {
  return { id: 'fsp', name: 'ФСП', enabled: true, mode: 'live', auth: 'oidc', issuer: 'https://id.federation.example',
    authorize: async ({ state }) => 'https://id.federation.example/authorize?state=' + state,
    exchange: async (code) => ({ subject: 'https://id.federation.example#' + code, externalId: 'FSP-' + code, identityVerified: true,
      credentials: { accessToken: 'SECRET_ACCESS', refreshToken: 'SECRET_REFRESH' } }),
    load: async connection => ({ subject: connection.subject, externalId: connection.externalId, achievements: [achievement()] }), ...overrides };
}
function account(store, owner, consent = true) {
  const profile = { ...createInitialState().profile, name: 'Кандидат', email: 'candidate@example.com', consent, visible: true };
  store.db.prepare('INSERT INTO platform_accounts VALUES(?,?,?,?,?,?)').run(owner, 'public-' + owner[0], 1, JSON.stringify(profile), '{}', new Date(time).toISOString());
  store.upsert({ ...profile, id: 'public-' + owner[0] }, owner, true);
}
function fixture(t, { providers = [new DemoFspProvider()], path = ':memory:', env = {}, ...options } = {}) {
  const store = new DirectoryStore(path); let clock = time;
  account(store, ownerA); account(store, ownerB);
  const service = new IntegrationService(store, { dbPath: path, providers, env, now: () => clock, automatic: false, retryDelayMs: 1, ...options });
  t.after(() => { service.close(); store.close(); });
  return { service, store, advance: ms => { clock += ms; } };
}
async function settled(service, owner, id) {
  for (let i = 0; i < 100; i++) {
    const job = service.job(owner, id); if (!['queued', 'running'].includes(job.status)) return job;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Worker did not finish');
}
async function connectLive(service, owner = ownerA, code = 'alice') {
  const pending = await service.connect(owner, 'fsp', { consent: true });
  const state = new URL(pending.authorizationUrl).searchParams.get('state');
  return { ...(await service.callback(owner, 'fsp', { state, code })), state };
}
const status = n => error => error.status === n;

test('demo evidence is explicit, encrypted, owner-isolated, deduplicated and never raises FSP ranking', async t => {
  const { service, store } = fixture(t);
  await assert.rejects(service.connect(ownerA, 'fsp-demo', { consent: false }), status(400));
  const result = await service.connect(ownerA, 'fsp-demo', { consent: true });
  const simultaneous = service.sync(ownerA, 'fsp-demo'); assert.equal(simultaneous.id, result.job.id);
  assert.equal((await settled(service, ownerA, result.job.id)).status, 'succeeded');
  assert.equal(service.evidence(ownerA).items[0].status, 'demo');
  assert.equal(service.evidence(ownerA).items[0].identityVerified, false);
  assert.equal(store.forOwner(ownerA).fsp, 0);
  assert.equal(service.evidence(ownerB).items.length, 0);
  assert.throws(() => service.job(ownerB, result.job.id), status(404));
  assert(!JSON.stringify(service.connections(ownerA)).includes('credentials'));
  const encrypted = store.db.prepare('SELECT credentials FROM integration_connections').get().credentials;
  assert(!encrypted.includes('scenario'));
  await settled(service, ownerA, service.sync(ownerA, 'fsp-demo').id);
  assert.equal(service.evidence(ownerA).items.length, 1);
  const running = service.sync(ownerA, 'fsp-demo'); service.disconnect(ownerA, 'fsp-demo');
  assert.equal(service.job(ownerA, running.id).status, 'cancelled');
  assert.equal(service.evidence(ownerA).items.length, 0);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM integration_connections').get().n, 0);
});

test('OAuth state is bound to owner, expires, is single-use and cannot steal a linked subject', async t => {
  const { service, store, advance } = fixture(t, { providers: [liveProvider()] });
  const pending = await service.connect(ownerA, 'fsp', { consent: true });
  const state = new URL(pending.authorizationUrl).searchParams.get('state');
  await assert.rejects(service.callback(ownerB, 'fsp', { state, code: 'alice' }), status(400));
  const result = await service.callback(ownerA, 'fsp', { state, code: 'alice' });
  await assert.rejects(service.callback(ownerA, 'fsp', { state, code: 'alice' }), status(400));
  await settled(service, ownerA, result.job.id);
  const encrypted = store.db.prepare('SELECT credentials FROM integration_connections').get().credentials;
  assert(!encrypted.includes('SECRET_ACCESS')); assert(!encrypted.includes('SECRET_REFRESH'));
  assert.equal(service.evidence(ownerA).items[0].status, 'verified');
  assert.equal(store.forOwner(ownerA).fsp, 1);
  assert.equal(service.employerEvidence(ownerB, 'public-a').items[0].externalRecordId, undefined);
  const other = await service.connect(ownerB, 'fsp', { consent: true });
  await assert.rejects(service.callback(ownerB, 'fsp', { state: new URL(other.authorizationUrl).searchParams.get('state'), code: 'alice' }), status(409));
  service.disconnect(ownerA, 'fsp');
  assert.equal(store.forOwner(ownerA).fsp, 0);
  const expired = await service.connect(ownerA, 'fsp', { consent: true }); advance(600001);
  await assert.rejects(service.callback(ownerA, 'fsp', { state: new URL(expired.authorizationUrl).searchParams.get('state'), code: 'alice' }), status(400));
});

test('snapshots revoke missing achievements, preserve last success on error, and expire verification', async t => {
  let records = [achievement()], fail = false;
  const { service, store, advance } = fixture(t, { providers: [liveProvider({ load: async c => {
    if (fail) throw new ProviderError('source_unavailable', true);
    return { subject: c.subject, externalId: c.externalId, achievements: records };
  } })] });
  const linked = await connectLive(service); await settled(service, ownerA, linked.job.id);
  const checkedAt = service.evidence(ownerA).items[0].checkedAt;
  fail = true;
  const job = await settled(service, ownerA, service.sync(ownerA, 'fsp').id);
  assert.equal(job.status, 'failed'); assert.equal(job.attempts, 3);
  assert.equal(service.evidence(ownerA).items[0].checkedAt, checkedAt);
  assert.equal(service.evidence(ownerA).items[0].status, 'stale'); assert.equal(store.forOwner(ownerA).fsp, 0);
  fail = false; records = [];
  assert.equal((await settled(service, ownerA, service.sync(ownerA, 'fsp').id)).resultCount, 0);
  assert.equal(service.evidence(ownerA).items[0].status, 'revoked');
  records = [achievement()]; await settled(service, ownerA, service.sync(ownerA, 'fsp').id);
  advance(7 * 86400000 + 1);
  assert.equal(service.evidence(ownerA).items[0].status, 'stale');
  store.upsert({ ...JSON.parse(store.db.prepare('SELECT profile FROM platform_accounts WHERE owner=?').get(ownerA).profile), id: 'public-a' }, ownerA, true);
  assert.equal(store.forOwner(ownerA).fsp, 0);
});

test('invalid or cross-account upstream records never partially commit or grant verification', async t => {
  let records = [achievement()], mismatch = false;
  const { service } = fixture(t, { providers: [liveProvider({ load: async c => ({ subject: mismatch ? 'wrong' : c.subject, externalId: c.externalId, achievements: records }) })] });
  const linked = await connectLive(service); await settled(service, ownerA, linked.job.id);
  records = [achievement(), achievement({ id: 'bad', place: -1 })];
  assert.equal((await settled(service, ownerA, service.sync(ownerA, 'fsp').id)).error, 'invalid_source_response');
  assert.equal(service.evidence(ownerA).items.length, 1);
  mismatch = true;
  assert.equal((await settled(service, ownerA, service.sync(ownerA, 'fsp').id)).error, 'identity_mismatch');
  assert.equal(service.connections(ownerA).connections[0].status, 'reauthorization_required');
});

test('disconnect or consent withdrawal during an upstream request prevents late publication', async t => {
  let finish;
  const provider = liveProvider({ load: c => new Promise(resolve => { finish = () => resolve({ subject: c.subject, externalId: c.externalId, achievements: [achievement()] }); }) });
  const { service, store } = fixture(t, { providers: [provider] });
  const linked = await connectLive(service);
  while (!finish) await new Promise(resolve => setTimeout(resolve, 1));
  service.disconnect(ownerA, 'fsp'); finish();
  assert.equal((await settled(service, ownerA, linked.job.id)).status, 'cancelled');
  assert.equal(service.evidence(ownerA).items.length, 0);
  finish = null; const again = await connectLive(service);
  while (!finish) await new Promise(resolve => setTimeout(resolve, 1));
  const profile = JSON.parse(store.db.prepare('SELECT profile FROM platform_accounts WHERE owner=?').get(ownerA).profile);
  store.db.prepare('UPDATE platform_accounts SET profile=? WHERE owner=?').run(JSON.stringify({ ...profile, consent: false }), ownerA);
  finish(); await settled(service, ownerA, again.job.id);
  assert.equal(service.evidence(ownerA).items.length, 0);
  await assert.rejects(service.connect(ownerA, 'fsp-demo', { consent: true }), status(409));
});

test('signed webhooks are replay-safe, bind identity, revoke evidence and remove credentials', async t => {
  const secret = 'webhook-test-secret';
  const { service, store, advance } = fixture(t, { providers: [liveProvider()], env: { FSP_WEBHOOK_SECRET: secret } });
  const linked = await connectLive(service); await settled(service, ownerA, linked.job.id);
  const event = { id: 'event-1', type: 'identity.revoked', subject: 'alice', fspId: 'FSP-alice' };
  const raw = Buffer.from(JSON.stringify(event)), timestamp = String(time / 1000);
  const headers = { 'x-integration-timestamp': timestamp, 'x-integration-signature': 'v1=' + createHmac('sha256', secret).update(timestamp + '.').update(raw).digest('hex') };
  assert.throws(() => service.webhook(raw, { ...headers, 'x-integration-signature': 'v1=' + '0'.repeat(64) }), status(401));
  assert.equal(service.webhook(raw, headers).status, 'accepted');
  assert.equal(service.webhook(raw, headers).status, 'accepted');
  assert.equal(service.evidence(ownerA).items[0].status, 'revoked'); assert.equal(store.forOwner(ownerA).fsp, 0);
  assert.deepEqual(service.unseal(store.db.prepare('SELECT credentials FROM integration_connections').get().credentials), {});
  const changed = Buffer.from(JSON.stringify({ ...event, type: 'achievements.changed' }));
  const changedHeaders = { ...headers, 'x-integration-signature': 'v1=' + createHmac('sha256', secret).update(timestamp + '.').update(changed).digest('hex') };
  assert.throws(() => service.webhook(changed, changedHeaders), status(409));
  advance(301000); assert.throws(() => service.webhook(raw, headers), status(401));
});

test('evidence rules distinguish team participation and never infer a professional grade', () => {
  const row = normalizeEvidence(achievement({ participation: 'team', teamRole: 'Разработчик' }), { id: 'connection', identity_verified: 1 }, liveProvider(), () => time);
  assert.equal(row.skills[0].scope, 'team_result'); assert.equal(row.grade, undefined);
  assert.throws(() => normalizeEvidence(achievement({ sourceUrl: 'javascript:alert(1)' }), { id: 'c' }, liveProvider(), () => time), ProviderError);
});

test('queued work and encrypted credentials survive restart with the same operator key', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'predel-integrations-'));
  const path = join(dir, 'store.sqlite'); const env = { INTEGRATION_ENCRYPTION_KEY: '1'.repeat(64) };
  let store = new DirectoryStore(path); account(store, ownerA);
  let service = new IntegrationService(store, { dbPath: path, env, providers: [new DemoFspProvider()], automatic: false });
  const linked = await service.connect(ownerA, 'fsp-demo', { consent: true }); service.close(); store.close();
  store = new DirectoryStore(path); service = new IntegrationService(store, { dbPath: path, env, providers: [new DemoFspProvider()], automatic: false });
  t.after(() => { service.close(); store.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 2, retryDelay: 30 }); });
  assert.equal((await settled(service, ownerA, linked.job.id)).status, 'succeeded');
  assert.equal(service.evidence(ownerA).items.length, 1);
});

test('OIDC checks RSA signature, issuer, audience, nonce and expiry; PKCE goes to token endpoint', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const env = { FSP_OIDC_ISSUER: 'https://id.federation.example', FSP_API_BASE_URL: 'https://api.federation.example', FSP_CLIENT_ID: 'predel',
    FSP_CLIENT_SECRET: 'secret', FSP_REDIRECT_URI: 'https://predel.example/api/integrations/fsp/callback', INTEGRATION_ENCRYPTION_KEY: '1'.repeat(64) };
  const claims = { iss: env.FSP_OIDC_ISSUER, sub: 'alice', aud: 'predel', nonce: 'nonce', iat: time / 1000, exp: time / 1000 + 300 };
  const jwt = (changes = {}) => {
    const a = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })).toString('base64url');
    const b = Buffer.from(JSON.stringify({ ...claims, ...changes })).toString('base64url');
    return `${a}.${b}.${sign('RSA-SHA256', Buffer.from(`${a}.${b}`), privateKey).toString('base64url')}`;
  };
  let token = jwt(); let sentVerifier;
  const metadata = { issuer: env.FSP_OIDC_ISSUER, authorization_endpoint: env.FSP_OIDC_ISSUER + '/authorize', token_endpoint: env.FSP_OIDC_ISSUER + '/token', jwks_uri: env.FSP_OIDC_ISSUER + '/keys' };
  const fetcher = async (url, options) => {
    let result;
    if (String(url).endsWith('openid-configuration')) result = metadata;
    else if (String(url).endsWith('/keys')) result = { keys: [jwk] };
    else if (String(url).endsWith('/token')) { sentVerifier = options.body.get('code_verifier'); result = { access_token: 'access', token_type: 'Bearer', expires_in: 300, refresh_token: 'refresh', id_token: token }; }
    else result = { subject: 'alice', fspId: 'FSP-alice' };
    assert.equal(options.redirect, 'error'); return Response.json(result);
  };
  const provider = new FspProvider(env, { fetcher, now: () => time });
  const authUrl = new URL(await provider.authorize({ state: 'state', nonce: 'nonce', challenge: 'challenge' }));
  assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.equal((await provider.exchange('code', { nonce: 'nonce', verifier: 'verifier' })).identityVerified, true);
  assert.equal(sentVerifier, 'verifier');
  for (const changes of [{ iss: 'https://wrong.example' }, { aud: 'other' }, { nonce: 'wrong' }, { exp: time / 1000 }, { sub: '' }, { aud: ['predel','other'], azp: 'other' }]) {
    token = jwt(changes); await assert.rejects(provider.exchange('code', { nonce: 'nonce', verifier: 'verifier' }), ProviderError);
  }
  token = jwt(); const parts = token.split('.'); parts[2] = 'A'.repeat(parts[2].length);
  await assert.rejects(provider.verifyIdentity(parts.join('.'), 'nonce', metadata), ProviderError);
});

test('provider pagination validates identity and refresh rotation is persisted before resource failure', async () => {
  const env = { FSP_OIDC_ISSUER: 'https://id.federation.example', FSP_API_BASE_URL: 'https://api.federation.example', FSP_CLIENT_ID: 'predel', FSP_CLIENT_SECRET: 'secret',
    FSP_REDIRECT_URI: 'https://predel.example/api/integrations/fsp/callback', INTEGRATION_ENCRYPTION_KEY: '1'.repeat(64) };
  let rotated, failing = false;
  const provider = new FspProvider(env, { now: () => time, fetcher: async url => {
    const path = new URL(url).pathname;
    if (path.endsWith('openid-configuration')) return Response.json({ issuer: env.FSP_OIDC_ISSUER, authorization_endpoint: env.FSP_OIDC_ISSUER + '/auth', token_endpoint: env.FSP_OIDC_ISSUER + '/token', jwks_uri: env.FSP_OIDC_ISSUER + '/keys' });
    if (path === '/token') return Response.json({ access_token: 'new', refresh_token: 'rotated', token_type: 'Bearer', expires_in: 300 });
    if (failing) return new Response('', { status: 503 });
    if (path === '/v1/me') return Response.json({ subject: 'alice', fspId: 'FSP-alice' });
    return Response.json({ subject: 'alice', fspId: 'FSP-alice', items: [achievement({ id: new URL(url).searchParams.has('cursor') ? '2' : '1' })], nextCursor: new URL(url).searchParams.has('cursor') ? null : 'page2' });
  } });
  const connection = { subject: env.FSP_OIDC_ISSUER + '#alice', externalId: 'FSP-alice', credentials: { accessToken: 'old', refreshToken: 'old-refresh', expiresAt: new Date(time - 1).toISOString() } };
  assert.equal((await provider.load(connection, value => { rotated = value; })).achievements.length, 2);
  assert.equal(rotated.refreshToken, 'rotated');
  rotated = null; failing = true;
  await assert.rejects(provider.load(connection, value => { rotated = value; }), ProviderError);
  assert.equal(rotated.refreshToken, 'rotated');
});

test('remote transport rejects unsafe URLs, limits response sizes and classifies retries', async () => {
  for (const url of ['http://external.example', 'https://user:password@external.example', 'file:///etc/passwd', 'javascript:alert(1)']) assert.throws(() => trustedUrl(url));
  assert.equal(trustedUrl('http://127.0.0.1:9999', { development: true }).protocol, 'http:');
  await assert.rejects(remoteJson('https://source.example', {}, async () => new Response('x'.repeat(1_000_001))), error => error.code === 'invalid_source_response');
  await assert.rejects(remoteJson('https://source.example', {}, async () => new Response('', { status: 429, headers: { 'Retry-After': '1' } })), error => error.retryable && error.retryAfter === 1);
});

async function httpFixture(t) {
  const codes = new Map(); const service = createAssessmentServer({ dbPath: ':memory:', authEnv: {},
    authMailer: async ({ email, code }) => codes.set(email, code), integrationOptions: { automatic: false, retryDelayMs: 1,
      providers: [Object.assign(new DemoFspProvider(), { id: 'test-demo' })] } });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { service.server.close(resolve); service.server.closeAllConnections(); }));
  const base = 'http://127.0.0.1:' + service.server.address().port;
  const browser = () => {
    const cookies = new Map(); let identity;
    return async (path, method = 'GET', input, overrides = {}) => {
      const response = await fetch(base + path, { method, headers: { Origin: base, Cookie: [...cookies].map(([k,v]) => k + '=' + v).join('; '),
        ...(input === undefined ? {} : { 'Content-Type': 'application/json' }), ...(identity ? { 'X-Platform-Identity': identity } : {}), ...overrides },
        body: input === undefined ? undefined : JSON.stringify(input) });
      for (const cookie of response.headers.getSetCookie()) { const [k,v] = cookie.split(';')[0].split('='); cookies.set(k,v); }
      identity = response.headers.get('X-Platform-Identity') || identity;
      const data = response.headers.get('content-type').includes('json') ? await response.json() : await response.text();
      return { status: response.status, data, headers: response.headers };
    };
  };
  async function register(client, role, login, suppliedEmail) {
    const email = suppliedEmail || login + '@example.com';
    assert.equal((await client('/api/auth/register/request-code', 'POST', { role, email, login, password: 'test integration password', consent: true, privacyVersion: PRIVACY_POLICY_VERSION,
      ...(role === 'candidate' ? { name: 'Кандидат' } : { companyName: 'Компания' }) })).status, 202);
    await client('/api/auth/register/verify', 'POST', { email, code: codes.get(email) });
    const current = await client('/api/platform/state');
    const state = createInitialState();
    if (role === 'candidate') state.profile = { ...state.profile, name: 'Кандидат', email, consent: true };
    assert.equal((await client('/api/platform/state', 'PUT', { state, baseRevision: current.data.revision })).status, 200);
  }
  return { ...service, browser, register, base };
}

async function publishQuestionnaire(client, { confirmed = null } = {}) {
  const current = await client('/api/platform/state');
  const survey = { id: 'integration-survey', date: new Date().toISOString(), industry: 'ИТ', professionalRole: 'Frontend разработчик',
    specialization: 'Frontend', desiredGrade: 'Junior', experience: '1 год', stack: ['React'], softSkills: [] };
  Object.assign(current.data.state.profile, survey, { id: 'candidate-anna', visible: true, surveyCompletedAt: survey.date, confirmed });
  current.data.state.surveys = [survey];
  const saved = await client('/api/platform/state', 'PUT', { state: current.data.state, baseRevision: current.data.revision });
  assert.equal(saved.status, 200);
  return saved;
}

test('integration refreshes never publish a privately retained category without assessment proof', async t => {
  const { browser, register, integrations } = await httpFixture(t);
  const candidate = browser(); await register(candidate, 'candidate', 'unproven-category');
  await publishQuestionnaire(candidate, { confirmed: { specialization: 'Frontend', grade: 'Senior', score: 100,
    date: new Date().toISOString(), surveyId: 'unproven-survey' } });
  const account = integrations.db.prepare('SELECT * FROM platform_accounts').get();
  assert.equal(JSON.parse(account.profile).confirmed.grade, 'Senior', 'Legacy category remains private.');
  const assertUnconfirmed = () => {
    const row = integrations.store.forOwner(account.owner);
    assert.equal(row.eligible, 1); assert.equal(row.grade, '');
    assert.equal(JSON.parse(row.public_payload).confirmed, null);
  };
  assertUnconfirmed();
  const linked = await candidate('/api/integrations/test-demo/connect', 'POST', { consent: true });
  assert.equal(linked.status, 202); await settled(integrations, account.owner, linked.data.job.id);
  assertUnconfirmed();
  const revision = integrations.db.prepare('SELECT revision FROM platform_accounts WHERE owner=?').get(account.owner).revision;
  integrations.tick(); assertUnconfirmed();
  assert.equal(integrations.db.prepare('SELECT revision FROM platform_accounts WHERE owner=?').get(account.owner).revision, revision);
  assert.equal((await candidate('/api/integrations/test-demo', 'DELETE')).status, 200); assertUnconfirmed();
});

test('evidence uses the same real and local account access policy as candidate profiles', async t => {
  const { browser, register, integrations } = await httpFixture(t);
  const candidate = browser(), localCandidate = browser(), employer = browser(), localEmployer = browser();
  await register(candidate, 'candidate', 'real-evidence');
  await register(localCandidate, 'candidate', 'local_candidate', 'candidate@local.example.test');
  await register(employer, 'employer', 'real-employer');
  await register(localEmployer, 'employer', 'local_employer', 'employer@local.example.test');
  await publishQuestionnaire(candidate); await publishQuestionnaire(localCandidate);
  for (const client of [candidate, localCandidate]) {
    const linked = await client('/api/integrations/test-demo/connect', 'POST', { consent: true }); assert.equal(linked.status, 202);
    const job = integrations.db.prepare('SELECT owner FROM integration_jobs WHERE id=?').get(linked.data.job.id);
    await settled(integrations, job.owner, linked.data.job.id);
  }
  const accounts = integrations.db.prepare('SELECT public_id,profile FROM platform_accounts').all();
  const realId = accounts.find(row => JSON.parse(row.profile).email === 'real-evidence@example.com').public_id;
  const localId = accounts.find(row => JSON.parse(row.profile).email === 'candidate@local.example.test').public_id;
  assert.equal((await employer('/api/directory/' + realId + '/evidence')).status, 200);
  assert.equal((await employer('/api/directory/' + localId + '/evidence')).status, 404);
  assert.equal((await localEmployer('/api/directory/' + localId + '/evidence')).status, 200);
  assert.equal((await localEmployer('/api/directory/' + realId + '/evidence')).status, 404);
});

test('HTTP API enforces accounts, role, consent, tab identity, owner-only jobs and public contracts', async t => {
  const { browser, register, integrations } = await httpFixture(t);
  const guest = browser(), candidate = browser(), other = browser(), employer = browser();
  assert.equal((await guest('/api/integrations/providers')).status, 200);
  assert.equal((await guest('/api/integrations')).status, 401);
  assert.equal((await guest('/api/integrations/fsp-public/search?name=Ромашов%20Федор')).status, 401);
  await register(candidate, 'candidate', 'candidate'); await register(other, 'candidate', 'another'); await register(employer, 'employer', 'employer');
  assert.equal((await employer('/api/integrations')).status, 403);
  assert.equal((await employer('/api/integrations/fsp-public/search?name=Ромашов%20Федор')).status, 403);
  const publicResult = await candidate('/api/integrations/fsp-public/search?name=Ромашов%20Федор');
  assert.equal(publicResult.status, 200); assert.equal(publicResult.data.items[0].identityVerified, false);
  assert.equal((await candidate('/api/profile/evidence')).data.items.length, 0);
  assert.equal((await candidate('/api/integrations/fsp-public/search?name=Ромашов%20Федор&url=https://other.example')).status, 400);
  assert.equal((await candidate('/api/integrations/test-demo/connect', 'POST', { consent: true }, { 'X-Platform-Identity': 'auth:wrong' })).status, 409);
  const linked = await candidate('/api/integrations/test-demo/connect', 'POST', { consent: true }); assert.equal(linked.status, 202);
  assert.equal((await other('/api/integration-jobs/' + linked.data.job.id)).status, 404);
  while (['queued','running'].includes((await candidate('/api/integration-jobs/' + linked.data.job.id)).data.status)) await new Promise(resolve => setTimeout(resolve, 5));
  const evidence = await candidate('/api/profile/evidence'); assert.equal(evidence.data.items[0].status, 'demo');
  assert.equal((await guest('/api/profile/evidence')).status, 401);
  const callback = await guest('/api/integrations/fsp/callback?code=secret&state=state');
  assert.equal(callback.status, 200); assert.equal(callback.headers.get('referrer-policy'), 'no-referrer');
  assert(callback.data.includes("history.replaceState")); assert(!callback.data.includes('code=secret'));
  const specification = await guest('/api/integrations/openapi.json'); assert.equal(specification.status, 200); assert.equal(specification.data.openapi, '3.1.0');
  assert(!specification.data.paths['/api/integrations/{provider}/connect'].post.parameters[0].schema.enum.includes('fsp-demo'));
  assert(specification.data.components.schemas.FspDemoConnectRequest.required.includes('baseRevision'));
  assert.deepEqual(specification.data.components.schemas.FspDemoConnectRequest.properties.scenario.enum, ['achievements','empty','revoked']);
  assert(specification.data.paths['/api/integrations/fsp-demo/connect'].post.responses['200']);
  integrations.providers.get('test-demo').enabled = false;
  assert.equal((await candidate('/api/integrations/test-demo', 'DELETE')).status, 200, 'A disabled source must still allow deletion of local credentials and evidence.');
  integrations.providers.get('test-demo').enabled = true;
  assert.equal((await candidate('/api/integrations/test-demo/connect', 'POST', { consent: true })).status, 202);
  const current = await candidate('/api/platform/state'); current.data.state.profile.consent = false;
  assert.equal((await candidate('/api/platform/state', 'PUT', { state: current.data.state, baseRevision: current.data.revision })).status, 200);
  assert.equal((await candidate('/api/profile/evidence')).data.items.length, 0);
  assert.equal((await candidate('/api/integrations/fsp-public/search?name=Ромашов%20Федор')).status, 409);
  assert.equal(integrations.db.prepare('SELECT COUNT(*) AS n FROM integration_connections').get().n, 0);
});

test('production disables demonstration sources even when the other environment label is development', async () => {
  const { createProviders } = await import('../integrations/providers.mjs');
  for (const env of [{ APP_ENV: 'production', NODE_ENV: 'development' }, { APP_ENV: 'development', NODE_ENV: 'production' }, { INTEGRATION_DEMO: '0' }]) {
    assert(!createProviders(env).some(provider => provider.mode === 'demo'));
  }
  assert.equal(createProviders({}).find(provider => provider.id === 'fsp').enabled, false);
  assert.throws(() => new FspProvider({ APP_ENV: 'production', FSP_OIDC_ISSUER: 'http://127.0.0.1', FSP_API_BASE_URL: 'https://api.example',
    FSP_CLIENT_ID: 'client', FSP_CLIENT_SECRET: 'secret', FSP_REDIRECT_URI: 'https://app.example/api/integrations/fsp/callback', INTEGRATION_ENCRYPTION_KEY: '1'.repeat(64) }));
});

test('automatic sync observes daily cadence, expires filters, and removes withdrawn consent', async t => {
  const { service, store, advance } = fixture(t);
  const linked = await service.connect(ownerA, 'fsp-demo', { consent: true }); await settled(service, ownerA, linked.job.id);
  service.tick(); assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM integration_jobs').get().n, 1);
  advance(86400001); service.tick();
  const next = store.db.prepare("SELECT * FROM integration_jobs WHERE status='queued'").get(); assert(next); await settled(service, ownerA, next.id);
  const profile = JSON.parse(store.db.prepare('SELECT profile FROM platform_accounts WHERE owner=?').get(ownerA).profile);
  store.db.prepare('UPDATE platform_accounts SET profile=? WHERE owner=?').run(JSON.stringify({ ...profile, consent: false }), ownerA);
  service.tick(); assert.equal(service.connections(ownerA).connections.length, 0); assert.equal(service.evidence(ownerA).items.length, 0);
});

test('HTTP evidence disclosure checks employer role, publication, consent and owner', async t => {
  const { browser, register, integrations, store: attempts } = await httpFixture(t);
  const candidate = browser(), other = browser(), employer = browser(), guest = browser();
  await register(candidate, 'candidate', 'evidence-candidate'); await register(other, 'candidate', 'evidence-other'); await register(employer, 'employer', 'evidence-employer');
  const survey = { id: 'evidence-survey', date: new Date().toISOString(), industry: 'ИТ', professionalRole: 'Frontend разработчик', specialization: 'Frontend', desiredGrade: 'Junior', experience: '1 год', stack: ['React'], softSkills: [] };
  const current = await candidate('/api/platform/state'); Object.assign(current.data.state.profile, survey, { id: 'candidate-anna', visible: true, surveyCompletedAt: survey.date }); current.data.state.surveys = [survey];
  const initial = await candidate('/api/platform/state', 'PUT', { state: current.data.state, baseRevision: current.data.revision }); assert.equal(initial.status, 200);
  const attempt = await candidate('/api/assessment/attempts', 'POST', { survey, vacancyDescription: '' });
  const privateAttempt = attempts.get(attempt.data.id).attempt;
  const graded = await candidate(`/api/assessment/attempts/${attempt.data.id}/submit`, 'POST', { token: attempt.data.token,
    answers: privateAttempt.questions.map(q => ({ questionId: q.id, optionId: q.correctOptionId })) }); assert(graded.data.passed);
  initial.data.state.history = [graded.data]; initial.data.state.profile.confirmed = { specialization: graded.data.specialization, grade: graded.data.grade, score: graded.data.score, date: graded.data.date, surveyId: survey.id };
  assert.equal((await candidate('/api/platform/state', 'PUT', { state: initial.data.state, baseRevision: initial.data.revision })).status, 200);
  const linked = await candidate('/api/integrations/test-demo/connect', 'POST', { consent: true });
  while (['queued','running'].includes((await candidate('/api/integration-jobs/' + linked.data.job.id)).data.status)) await new Promise(resolve => setTimeout(resolve, 5));
  const owner = integrations.db.prepare('SELECT owner FROM integration_connections').get().owner;
  const id = integrations.store.forOwner(owner).id;
  assert.equal((await candidate('/api/directory/' + id + '/evidence')).status, 200);
  assert.equal((await other('/api/directory/' + id + '/evidence')).status, 403);
  assert.equal((await guest('/api/directory/' + id + '/evidence')).status, 401);
  const allowed = await employer('/api/directory/' + id + '/evidence'); assert.equal(allowed.status, 200);
  assert.equal(allowed.data.items[0].status, 'demo'); assert.equal(allowed.data.items[0].externalRecordId, undefined); assert.equal(allowed.data.items[0].snapshotHash, undefined);
  const snapshot = await candidate('/api/platform/state'); snapshot.data.state.profile.visible = false;
  await candidate('/api/platform/state', 'PUT', { state: snapshot.data.state, baseRevision: snapshot.data.revision });
  assert.equal((await employer('/api/directory/' + id + '/evidence')).status, 404);
  assert.equal((await candidate('/api/directory/' + id + '/evidence')).status, 200);
});
