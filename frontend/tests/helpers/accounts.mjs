import assert from 'node:assert/strict';
import { PRIVACY_POLICY_VERSION } from '../../../shared/privacy.ts';

/** Registers and signs in a fictional account inside a browser context of an isolated service. */
export async function register(context, { base, codes }, role, login, extra = {}) {
  const email = `${login}@example.invalid`;
  const data = { role, login, email, password: 'IsolatedFixture927!', consent: true, privacyVersion: PRIVACY_POLICY_VERSION,
    ...(role === 'candidate' ? { name: 'Вымышленный кандидат' } : { companyName: 'Вымышленная компания' }), ...extra };
  const requested = await context.request.post(base + '/api/auth/register/request-code', { data });
  assert.equal(requested.status(), 202, await requested.text());
  const verified = await context.request.post(base + '/api/auth/register/verify', { data: { email, code: codes.get(email) } });
  assert.equal(verified.status(), 201, await verified.text());
  return (await verified.json()).account;
}

/** Creates a separate moderator account (as `npm run moderator -- create` does) and signs it in inside the context. */
export async function moderator(context, { base, service }, login) {
  const password = 'IsolatedFixture927!';
  const account = await service.auth.createModerator({ login, email: `${login}@example.invalid`, password, actor: 'browser-fixture' });
  const signedIn = await context.request.post(base + '/api/auth/login', { data: { loginOrEmail: login, password } });
  assert.equal(signedIn.status(), 200, await signedIn.text());
  return account;
}

/** A fixed encoder: every profile passes semantic admission, so UI tests do not depend on model weights. */
export function useFixedEncoder(service) {
  service.directory.encoder.close();
  service.directory.encoder = {
    info: { status: 'ready', name: 'UI fixture encoder', version: 'ui-fixture-encoder', dimension: 2, trained: false, threshold: 0.5 },
    async start() { return this.info; }, async encode(texts) { return texts.map(() => [1, 0]); }, close() {},
  };
}
