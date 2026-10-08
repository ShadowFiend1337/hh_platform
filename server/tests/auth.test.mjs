import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuthError, AuthService, createVerificationMailer, hashPassword, passwordMatches, validateRegistration } from '../auth.mjs';
import { createInitialState } from '../../frontend/src/model.ts';
import { digest } from '../assessment.mjs';

const initialTime = Date.parse('2026-10-07T09:00:00.000Z');
const ownerA = 'a'.repeat(64);
const ownerB = 'b'.repeat(64);
const password = 'example password';
const registration = (overrides = {}) => ({ email: 'candidate@example.com', login: 'candidate', password,
  role: 'candidate', name: 'Example Candidate', consent: true, privacyVersion: PRIVACY_POLICY_VERSION, ...overrides });
const status = expected => error => error instanceof AuthError && error.status === expected;

function fixture(t, options = {}) {
  let clock = initialTime;
  const emails = [];
  const auth = new AuthService(':memory:', { now: () => clock, env: {},
    mailer: async message => { emails.push(message); }, ...options });
  t.after(() => auth.close());
  return { auth, emails, advance: ms => { clock += ms; } };
}

test('registration validates role and rejects forged fields before storing credentials', () => {
  const valid = validateRegistration(registration({ email: ' Candidate@Example.com ', login: 'Candidate' }));
  assert.equal(valid.email, 'candidate@example.com');
  assert.equal(valid.loginNormalized, 'candidate');
  for (const changes of [{ role: 'administrator' }, { confirmed: true }, { email: 'invalid' }, { password: 'short' },
    { login: 'ab' }, { companyName: 'Wrong role' }, { consent: undefined }, { consent: false }, { consent: 'true' }]) {
    assert.throws(() => validateRegistration(registration(changes)), status(400));
  }
  assert.throws(() => validateRegistration(registration({ role: 'employer', companyName: 'Example Company' })), status(400));
  assert.equal(validateRegistration({ email: 'employer@example.com', login: 'employer', password,
    role: 'employer', companyName: 'Example Company', consent: true, privacyVersion: PRIVACY_POLICY_VERSION }).role, 'employer');
});

test('password hashes are salted and invalid or altered credentials never authenticate', async () => {
  const first = await hashPassword(password), second = await hashPassword(password);
  assert.notEqual(first, second);
  assert(!first.includes(password));
  assert.equal(await passwordMatches(password, first), true);
  assert.equal(await passwordMatches('wrong password', first), false);
  assert.equal(await passwordMatches(password, 'scrypt$99999999$8$1$salt$hash'), false);
  assert.equal(await passwordMatches(password, 'invalid'), false);
});

test('accounts exist only after email confirmation and registration codes are single use', async t => {
  const { auth, emails } = fixture(t);
  const result = await auth.requestRegistration(registration(), ownerA);
  assert.deepEqual(Object.keys(result).sort(), ['delivery', 'email', 'expiresAt']);
  assert.equal(result.delivery, 'email');
  assert.equal(auth.store.db.prepare('SELECT COUNT(*) AS n FROM auth_accounts').get().n, 0);
  assert.equal(emails.length, 1);
  assert.match(emails[0].code, /^\d{6}$/u);
  const pending = auth.store.db.prepare('SELECT * FROM auth_pending_registrations').get();
  assert.notEqual(pending.code_hash, emails[0].code);
  assert.notEqual(pending.password_hash, password);
  await assert.rejects(auth.login({ loginOrEmail: 'candidate', password }), status(401));
  const account = auth.verifyRegistration({ email: result.email, code: emails[0].code });
  assert.match(account.platform_owner, /^[a-f0-9]{64}$/u);
  assert.notEqual(account.platform_owner, ownerA);
  assert.equal(account.role, 'candidate');
  assert.equal(auth.store.db.prepare('SELECT COUNT(*) AS n FROM auth_pending_registrations').get().n, 0);
  assert.throws(() => auth.verifyRegistration({ email: result.email, code: emails[0].code }), status(400));
});

test('incorrect codes eventually invalidate the registration and expired codes cannot create accounts', async t => {
  const { auth, emails, advance } = fixture(t, { codeTtlMinutes: 1 });
  await auth.requestRegistration(registration(), ownerA);
  const wrong = emails[0].code === '000000' ? '000001' : '000000';
  for (let attempt = 0; attempt < 4; attempt++) {
    assert.throws(() => auth.verifyRegistration({ email: emails[0].email, code: wrong }), status(400));
  }
  assert.throws(() => auth.verifyRegistration({ email: emails[0].email, code: wrong }), status(429));
  assert.throws(() => auth.verifyRegistration({ email: emails[0].email, code: emails[0].code }), status(400));
  await auth.requestRegistration(registration(), ownerA);
  advance(60_001);
  assert.throws(() => auth.verifyRegistration({ email: emails[1].email, code: emails[1].code }), status(400));
  assert.equal(auth.store.db.prepare('SELECT COUNT(*) AS n FROM auth_accounts').get().n, 0);
});

test('live pending logins are unique but expired reservations are freed atomically', async t => {
  const { auth, advance, emails } = fixture(t, { codeTtlMinutes: 1 });
  await auth.requestRegistration(registration(), ownerA);
  await assert.rejects(auth.requestRegistration(registration({ email: 'other@example.com' }), ownerB), status(409));
  advance(60_001);
  await auth.requestRegistration(registration({ email: 'other@example.com' }), ownerB);
  assert.equal(emails.at(-1).email, 'other@example.com');
  assert.equal(auth.store.db.prepare('SELECT COUNT(*) AS n FROM auth_pending_registrations').get().n, 1);
  const account = auth.verifyRegistration({ email: 'other@example.com', code: emails.at(-1).code });
  assert.notEqual(account.platform_owner, ownerB);
});

test('confirmed email and login are unique while shared-browser signups receive separate cabinets', async t => {
  const { auth, emails } = fixture(t);
  await auth.requestRegistration(registration(), ownerA);
  const first = auth.verifyRegistration({ email: emails[0].email, code: emails[0].code });
  await assert.rejects(auth.requestRegistration(registration({ login: 'different' }), ownerB), status(409));
  await assert.rejects(auth.requestRegistration(registration({ email: 'different@example.com' }), ownerB), status(409));
  await auth.requestRegistration(registration({ email: 'different@example.com', login: 'different' }), ownerA);
  const second = auth.verifyRegistration({ email: emails[1].email, code: emails[1].code });
  assert.notEqual(first.platform_owner, second.platform_owner);
  assert.equal(auth.accountForPlatformOwner(ownerA), null);
});

test('login keeps account identity across devices while session expiry and logout revoke individual tokens', async t => {
  const { auth, emails, advance } = fixture(t, { sessionDays: 1 });
  await auth.requestRegistration(registration({ login: 'Candidate' }), ownerA);
  const account = auth.verifyRegistration({ email: emails[0].email, code: emails[0].code });
  const first = auth.createSession(account);
  const byLogin = await auth.login({ loginOrEmail: 'CANDIDATE', password });
  const byEmail = await auth.login({ loginOrEmail: 'CANDIDATE@EXAMPLE.COM', password });
  const second = auth.createSession(byEmail);
  assert.equal(byLogin.id, account.id);
  assert.equal(byEmail.platform_owner, account.platform_owner);
  assert.notEqual(first.token, second.token);
  assert.equal(auth.accountForToken(second.token).platformOwner, account.platform_owner);
  assert(!JSON.stringify(second.account).includes('password'));
  assert(!JSON.stringify(second.account).includes('platform_owner'));
  assert.notEqual(auth.store.db.prepare('SELECT token_hash FROM auth_sessions LIMIT 1').get().token_hash, first.token);
  auth.revokeToken(first.token);
  assert.equal(auth.accountForToken(first.token), null);
  assert.equal(auth.accountForToken(second.token).account.id, account.id);
  advance(86_400_001);
  assert.equal(auth.accountForToken(second.token), null);
  await assert.rejects(auth.login({ loginOrEmail: 'candidate', password: 'incorrect password' }), status(401));
});

test('failed email delivery releases its pending login without deleting a newer concurrent request', async t => {
  const { auth } = fixture(t, { mailer: async () => { throw new AuthError(503, 'Mail unavailable'); } });
  await assert.rejects(auth.requestRegistration(registration(), ownerA), status(503));
  assert.equal(auth.store.db.prepare('SELECT COUNT(*) AS n FROM auth_pending_registrations').get().n, 0);
  let failFirst;
  let firstStarted;
  const started = new Promise(resolve => { firstStarted = resolve; });
  const wait = new Promise((_, reject) => { failFirst = reject; });
  let requests = 0;
  const delivered = [];
  auth.mailer = async message => {
    requests++;
    if (requests === 1) { firstStarted(); await wait; }
    else delivered.push(message);
  };
  const earlier = auth.requestRegistration(registration(), ownerA);
  const rejected = assert.rejects(earlier, status(503));
  await started;
  await auth.requestRegistration(registration(), ownerB);
  failFirst(new AuthError(503, 'First delivery failed'));
  await rejected;
  const account = auth.verifyRegistration({ email: delivered[0].email, code: delivered[0].code });
  assert.notEqual(account.platform_owner, ownerB);
});

test('development email codes stay server-side and both production environment settings require SMTP', async () => {
  const logs = [];
  const logger = { info: line => logs.push(line), error: () => {} };
  const delivery = await createVerificationMailer({ env: {}, logger, mailLogPath: null })({ email: 'candidate@example.com', code: '123456' });
  assert.equal(delivery.delivery, 'development');
  assert.equal(logs.length, 1);
  for (const env of [{ APP_ENV: 'production' }, { NODE_ENV: 'production' }, { APP_ENV: ' Production ' },
    { APP_ENV: 'development', NODE_ENV: 'production' }]) {
    await assert.rejects(createVerificationMailer({ env, logger })({ email: 'candidate@example.com', code: '123456' }), status(503));
  }
  assert.equal(logs.length, 1);
  await assert.rejects(createVerificationMailer({ env: { SMTP_HOST: '127.0.0.1' }, logger })(
    { email: 'candidate@example.com', code: '123456' }), status(503));
});

test('local development mail is saved only to the configured private log and never leaks through the response', async t => {
  const path = join(tmpdir(), `predel-local-mail-${randomUUID()}.log`);
  t.after(() => { if (existsSync(path)) unlinkSync(path); });
  const logs = [];
  const logger = { info: line => logs.push(line), error: () => {} };
  const { auth } = fixture(t, { mailer: createVerificationMailer({ env: {}, logger, mailLogPath: path }) });
  const result = await auth.requestRegistration(registration(), ownerA);
  assert.equal(result.delivery, 'development');
  const stored = JSON.parse(readFileSync(path, 'utf8').trim());
  assert.equal(stored.email, 'candidate@example.com');
  assert.match(stored.code, /^\d{6}$/u);
  assert.equal(stored.expiresAt, result.expiresAt);
  assert(!JSON.stringify(result).includes(stored.code));
  assert(!logs.join('\n').includes(stored.code));
  assert.equal(auth.verifyRegistration({ email: stored.email, code: stored.code }).role, 'candidate');
  const missingPath = path + '.production';
  await assert.rejects(createVerificationMailer({ env: { APP_ENV: 'production' }, logger, mailLogPath: missingPath })(
    { email: 'candidate@example.com', code: '123456' }), status(503));
  assert.equal(existsSync(missingPath), false);
});

test('an unresponsive SMTP relay times out and releases the TCP connection', async t => {
  const sockets = new Set();
  const relay = createServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise(resolve => relay.listen(0, '127.0.0.1', resolve));
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => relay.close(resolve)); });
  const env = { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(relay.address().port), SMTP_TLS: 'none',
    SMTP_USER: 'local', SMTP_PASSWORD: 'local', SMTP_FROM: 'no-reply@example.com', SMTP_TIMEOUT_MS: '1000' };
  const mailer = createVerificationMailer({ env, logger: { error: () => {} } });
  const began = performance.now();
  await assert.rejects(mailer({ email: 'candidate@example.com', code: '123456' }), status(503));
  assert(performance.now() - began < 5_000, 'SMTP timeout must bound the whole delivery');
});

test('a configured SMTP relay receives a real confirmation message and reports email delivery', async t => {
  const sockets = new Set(), messages = [], commands = [];
  const relay = createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    socket.write('220 local relay ready\r\n');
    let buffer = '', message = [], receiving = false;
    socket.on('data', bytes => {
      buffer += bytes.toString('utf8');
      let marker;
      while ((marker = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, marker); buffer = buffer.slice(marker + 2);
        if (receiving) {
          if (line === '.') { messages.push(message.join('\n')); message = []; receiving = false; socket.write('250 queued\r\n'); }
          else message.push(line);
        } else {
          commands.push(line.split(' ', 1)[0]);
          if (line.startsWith('EHLO')) socket.write('250-local relay\r\n250 AUTH PLAIN\r\n');
          else if (line.startsWith('AUTH PLAIN')) socket.write('235 authenticated\r\n');
          else if (line.startsWith('MAIL FROM:') || line.startsWith('RCPT TO:')) socket.write('250 accepted\r\n');
          else if (line === 'DATA') { receiving = true; socket.write('354 send message\r\n'); }
          else if (line === 'QUIT') socket.end('221 goodbye\r\n');
          else socket.write('500 unknown command\r\n');
        }
      }
    });
  });
  await new Promise(resolve => relay.listen(0, '127.0.0.1', resolve));
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => relay.close(resolve)); });
  const mailer = createVerificationMailer({ env: { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(relay.address().port),
    SMTP_TLS: 'none', SMTP_USER: 'local', SMTP_PASSWORD: 'local', SMTP_FROM: 'no-reply@example.com' },
  logger: { error: error => assert.fail(error) } });
  const result = await mailer({ email: 'candidate@example.com', code: '123456' });
  assert.equal(result.delivery, 'email');
  assert.deepEqual(commands, ['EHLO', 'AUTH', 'MAIL', 'RCPT', 'DATA', 'QUIT']);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /To: candidate@example\.com/u);
  assert.match(messages[0], /Content-Type: text\/plain; charset=UTF-8/u);
  assert.match(messages[0], /123456/u);
});

function client(base, cookieValues = new Map()) {
  return async (path, { method = 'GET', body, headers = {} } = {}) => {
    const response = await fetch(base + path, { method,
      headers: { Cookie: [...cookieValues].map(([key, value]) => `${key}=${value}`).join('; '),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    for (const raw of response.headers.getSetCookie()) {
      const [name, value] = raw.split(';', 1)[0].split('=');
      if (/Max-Age=0(?:;|$)/iu.test(raw)) cookieValues.delete(name); else cookieValues.set(name, value);
    }
    return { status: response.status, headers: response.headers, payload: await response.json() };
  };
}

async function httpFixture(t, options = {}) {
  const { createAssessmentServer } = await import('../server.mjs');
  const path = join(tmpdir(), `predel-auth-test-${randomUUID()}.sqlite`);
  const emails = [];
  const service = createAssessmentServer({ dbPath: path, authEnv: {},
    authMailer: async message => { emails.push(message); }, ...options });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => service.server.close(resolve));
    for (const suffix of ['', '-wal', '-shm']) if (existsSync(path + suffix)) unlinkSync(path + suffix);
  });
  return { ...service, emails, base: `http://127.0.0.1:${service.server.address().port}` };
}

test('HTTP accounts require registration and independent-device login shares only authenticated state', async t => {
  const service = await httpFixture(t);
  const firstCookies = new Map();
  const first = client(service.base, firstCookies);
  const guest = await first('/api/platform/state');
  assert.equal(guest.status, 401);
  const anonymous = firstCookies.get('predel_session');
  const state = createInitialState();
  state.company.name = 'Saved Before Registration';
  assert.equal((await first('/api/platform/state', { method: 'PUT', body: { state, baseRevision: 0 } })).status, 401);
  // A private legacy row cannot be reopened by its old anonymous cookie.
  service.directory.store.db.prepare('INSERT INTO platform_accounts VALUES(?,?,?,?,?,?)')
    .run(digest(anonymous), `user-${digest(anonymous).slice(0, 20)}`, 1, JSON.stringify(state.profile), JSON.stringify(state.company), new Date(initialTime).toISOString());
  const requested = await first('/api/auth/register/request-code', { method: 'POST', body: registration() });
  assert.equal(requested.status, 202);
  assert(!JSON.stringify(requested.payload).includes('code"'));
  assert.equal((await first('/api/auth/me')).status, 401);
  const confirmed = await first('/api/auth/register/verify', { method: 'POST',
    body: { email: service.emails[0].email, code: service.emails[0].code } });
  assert.equal(confirmed.status, 201);
  assert.match(confirmed.headers.get('set-cookie'), /predel_account_session=[a-f0-9]{64}/u);
  assert.match(confirmed.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/u);
  const fresh = await first('/api/platform/state');
  assert.equal(fresh.payload.state, null);
  assert.match(fresh.headers.get('x-platform-identity'), /^auth:/u);
  const ownState = createInitialState();
  ownState.profile = { ...ownState.profile, name: 'Authenticated Candidate', email: 'candidate@example.com', consent: true };
  const guestIdentity = `anonymous:${digest(anonymous)}`;
  assert.equal((await first('/api/platform/state', { method: 'PUT', body: { state: ownState, baseRevision: 0 },
    headers: { 'X-Platform-Identity': guestIdentity } })).status, 409);
  assert.equal((await first('/api/platform/state', { method: 'PUT', body: { state: ownState, baseRevision: 0 } })).status, 409);
  assert.equal((await first('/api/platform/state', { method: 'PUT', body: { state: ownState, baseRevision: 0 },
    headers: { 'X-Platform-Identity': fresh.headers.get('x-platform-identity') } })).status, 200);
  const second = client(service.base);
  const signedIn = await second('/api/auth/login', { method: 'POST', body: { loginOrEmail: 'candidate@example.com', password } });
  assert.equal(signedIn.status, 200);
  assert.equal(signedIn.payload.account.id, confirmed.payload.account.id);
  const restored = await second('/api/platform/state');
  assert.equal(restored.payload.state.profile.name, 'Authenticated Candidate');
  assert.notEqual(restored.payload.state.company.name, 'Saved Before Registration');
  assert.equal(restored.headers.get('x-platform-identity'), fresh.headers.get('x-platform-identity'));
  assert.equal((await first('/api/auth/logout', { method: 'POST', body: {} })).status, 200);
  assert.equal((await first('/api/auth/me')).status, 401);
  assert.equal((await second('/api/auth/me')).status, 200);
  const oldAnonymous = client(service.base, new Map([['predel_session', anonymous]]));
  const oldState = await oldAnonymous('/api/platform/state');
  assert.equal(oldState.status, 401);
  assert(!JSON.stringify(oldState.payload).includes('Saved Before Registration'));
  assert.equal((await oldAnonymous('/api/auth/me')).status, 401);
});

test('HTTP registered roles restrict protected actions and anonymous business routes require login', async t => {
  const service = await httpFixture(t);
  const candidate = client(service.base), employer = client(service.base), anonymous = client(service.base);
  async function register(request, input) {
    assert.equal((await request('/api/auth/register/request-code', { method: 'POST', body: input })).status, 202);
    const email = service.emails.at(-1);
    assert.equal((await request('/api/auth/register/verify', { method: 'POST', body: { email: email.email, code: email.code } })).status, 201);
  }
  await register(candidate, registration());
  await register(employer, { email: 'employer@example.com', login: 'employer', password,
    role: 'employer', companyName: 'Example Company', consent: true, privacyVersion: PRIVACY_POLICY_VERSION });
  assert.equal((await candidate('/api/directory/search')).status, 403);
  assert.equal((await employer('/api/assessment/attempts', { method: 'POST', body: {} })).status, 403);
  assert.equal((await anonymous('/api/companies')).status, 401);
  assert.equal((await anonymous('/api/vacancies')).status, 401);
  assert.equal((await anonymous('/api/directory/search')).status, 401);
  assert.equal((await candidate('/api/vacancies', { method: 'POST', body: {} })).status, 403);
  assert.equal((await employer('/api/vacancies/unknown/applications', { method: 'POST', body: {} })).status, 403);
});
