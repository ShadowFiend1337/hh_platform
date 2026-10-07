import { createPublicKey, verify, randomBytes } from 'node:crypto';
import { RequestError } from '../assessment.mjs';

export class ProviderError extends Error {
  constructor(code, retryable = false, retryAfter = 0) { super(code); this.code = code; this.retryable = retryable; this.retryAfter = retryAfter; }
}
export function trustedUrl(value, { development = false, origin } = {}) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid integration URL'); }
  if (url.username || url.password || url.hash || (url.protocol !== 'https:' && !(development && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('Integration URLs require HTTPS (loopback HTTP allowed in development)');
  }
  if (origin && url.origin !== origin) throw new Error('Provider endpoint must use the configured origin');
  return url;
}

// Provider hosts are operator configuration, never user input. Redirects are
// refused so an upstream redirect cannot send credentials to another host.
export async function remoteJson(url, options = {}, fetcher = fetch) {
  let response;
  try { response = await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(10000) }); }
  catch { throw new ProviderError('source_unavailable', true); }
  if (!response.ok) {
    await response.body?.cancel();
    if ([401, 403].includes(response.status)) throw new ProviderError('reauthorization_required');
    if (response.status === 404) throw new ProviderError('identity_not_found');
    const retryAfter = Math.min(60, Math.max(0, Number(response.headers.get('retry-after')) || 0));
    throw new ProviderError(response.status === 429 ? 'rate_limited' : 'source_unavailable', response.status === 429 || response.status >= 500, retryAfter);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ProviderError('invalid_source_response');
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 1_000_000) { await reader.cancel(); throw new ProviderError('invalid_source_response'); }
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (!(error instanceof SyntaxError)) throw new ProviderError('source_unavailable', true);
    throw new ProviderError('invalid_source_response');
  }
}

export class DemoFspProvider {
  id = 'fsp-demo'; name = 'ФСП — демонстрационный источник'; mode = 'demo'; auth = 'demo'; enabled = true;
  connect(owner, scenario = 'achievements') {
    if (!['achievements', 'empty', 'not-found', 'unavailable', 'revoked'].includes(scenario)) throw new RequestError(400, 'Неизвестный демонстрационный сценарий.');
    return { subject: `demo:${owner}`, externalId: `DEMO-${owner.slice(0, 12)}`, credentials: { scenario }, identityVerified: false };
  }
  async load(connection) {
    const scenario = connection.credentials.scenario;
    if (scenario === 'not-found') throw new ProviderError('identity_not_found');
    if (scenario === 'unavailable') throw new ProviderError('source_unavailable', true);
    return { subject: connection.subject, externalId: connection.externalId, achievements: scenario === 'empty' ? [] : [{
      id: 'demo-contest-2026', title: 'Демонстрационное соревнование ФСП', discipline: 'algorithms',
      occurredAt: '2026-09-01T00:00:00.000Z', result: 'Вымышленный финалист', place: 3,
      participation: 'individual', teamRole: null, sourceUrl: null, status: scenario === 'revoked' ? 'revoked' : 'active',
    }] };
  }
}

// Proposed FSP API v1; the actual federation contract must be agreed before
// enabling this adapter. OIDC proves identity; the resource API proves results.
export class FspProvider {
  id = 'fsp'; name = 'ФСП'; mode = 'live'; auth = 'oidc';
  constructor(env = process.env, { fetcher = fetch, now = Date.now } = {}) {
    this.fetcher = fetcher; this.now = now;
    this.enabled = Boolean(env.FSP_OIDC_ISSUER && env.FSP_CLIENT_ID && env.FSP_CLIENT_SECRET && env.FSP_API_BASE_URL && env.FSP_REDIRECT_URI && env.INTEGRATION_ENCRYPTION_KEY);
    if (!this.enabled) return;
    this.development = env.APP_ENV !== 'production' && env.NODE_ENV !== 'production';
    this.issuer = trustedUrl(env.FSP_OIDC_ISSUER, { development: this.development }).href.replace(/\/$/u, '');
    this.apiBase = trustedUrl(env.FSP_API_BASE_URL, { development: this.development }).href.replace(/\/$/u, '');
    this.redirectUri = trustedUrl(env.FSP_REDIRECT_URI, { development: this.development }).href;
    if (new URL(this.redirectUri).pathname !== '/api/integrations/fsp/callback' || new URL(this.redirectUri).search) throw new Error('Invalid FSP callback URL');
    this.clientId = env.FSP_CLIENT_ID; this.clientSecret = env.FSP_CLIENT_SECRET;
    this.scope = 'openid profile fsp:achievements:read';
  }
  async discovery() {
    const metadata = await remoteJson(`${this.issuer}/.well-known/openid-configuration`, {}, this.fetcher);
    if (metadata.issuer !== this.issuer) throw new ProviderError('invalid_source_response');
    try {
      for (const key of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
        trustedUrl(metadata[key], { development: this.development, origin: new URL(this.issuer).origin });
      }
    } catch { throw new ProviderError('invalid_source_response'); }
    return metadata;
  }
  async authorize({ state, nonce, challenge }) {
    const metadata = await this.discovery();
    const url = new URL(metadata.authorization_endpoint);
    for (const [key, value] of Object.entries({ response_type: 'code', client_id: this.clientId, redirect_uri: this.redirectUri,
      scope: this.scope, state, nonce, code_challenge: challenge, code_challenge_method: 'S256' })) url.searchParams.set(key, value);
    return url.href;
  }
  async token(metadata, fields) {
    const result = await remoteJson(metadata.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...fields, client_id: this.clientId, client_secret: this.clientSecret }) }, this.fetcher);
    if (typeof result.access_token !== 'string' || !result.access_token || result.access_token.length > 16000
      || String(result.token_type).toLowerCase() !== 'bearer' || !Number.isFinite(result.expires_in) || result.expires_in <= 0
      || result.refresh_token !== undefined && (typeof result.refresh_token !== 'string' || result.refresh_token.length > 16000)) throw new ProviderError('invalid_source_response');
    return { accessToken: result.access_token, refreshToken: result.refresh_token || null,
      expiresAt: new Date(this.now() + result.expires_in * 1000).toISOString(), idToken: result.id_token };
  }
  async verifyIdentity(token, nonce, metadata) {
    try {
      if (typeof token !== 'string' || token.length > 32000) throw new Error();
      const parts = token.split('.'); if (parts.length !== 3) throw new Error();
      const header = JSON.parse(Buffer.from(parts[0], 'base64url')); const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
      if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error();
      const keys = await remoteJson(metadata.jwks_uri, {}, this.fetcher);
      const key = keys.keys?.find(item => item.kid === header.kid && item.kty === 'RSA' && (!item.use || item.use === 'sig') && (!item.alg || item.alg === 'RS256'));
      if (!key || !verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) throw new Error();
      const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      const seconds = this.now() / 1000;
      if (claims.iss !== this.issuer || !audience.includes(this.clientId) || audience.length > 1 && claims.azp !== this.clientId
        || claims.azp !== undefined && claims.azp !== this.clientId || claims.nonce !== nonce
        || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255
        || !Number.isFinite(claims.exp) || claims.exp <= seconds || !Number.isFinite(claims.iat) || claims.iat > seconds + 60
        || claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > seconds + 60)) throw new Error();
      return claims.sub;
    } catch { throw new ProviderError('invalid_identity'); }
  }
  async exchange(code, pending) {
    const metadata = await this.discovery();
    const credentials = await this.token(metadata, { grant_type: 'authorization_code', code, redirect_uri: this.redirectUri, code_verifier: pending.verifier });
    const subject = await this.verifyIdentity(credentials.idToken, pending.nonce, metadata);
    delete credentials.idToken;
    const me = await this.me(credentials);
    if (me.subject !== subject) throw new ProviderError('identity_mismatch');
    return { subject: `${this.issuer}#${subject}`, externalId: me.fspId, credentials, identityVerified: true };
  }
  async me(credentials) {
    const result = await remoteJson(`${this.apiBase}/v1/me`, { headers: { Authorization: `Bearer ${credentials.accessToken}` } }, this.fetcher);
    if (typeof result.subject !== 'string' || !result.subject || result.subject.length > 255 || typeof result.fspId !== 'string' || !result.fspId || result.fspId.length > 100) throw new ProviderError('invalid_source_response');
    return result;
  }
  async load(connection, persistCredentials) {
    let credentials = connection.credentials;
    if (Date.parse(credentials.expiresAt) <= this.now() + 30000) {
      if (!credentials.refreshToken) throw new ProviderError('reauthorization_required');
      const metadata = await this.discovery();
      const refreshed = await this.token(metadata, { grant_type: 'refresh_token', refresh_token: credentials.refreshToken });
      credentials = { ...refreshed, refreshToken: refreshed.refreshToken || credentials.refreshToken }; delete credentials.idToken;
      // Persist a rotated refresh token before the resource request can fail.
      persistCredentials(credentials);
    }
    const me = await this.me(credentials);
    if (`${this.issuer}#${me.subject}` !== connection.subject || me.fspId !== connection.externalId) throw new ProviderError('identity_mismatch');
    const achievements = []; const seen = new Set(); let cursor;
    for (let page = 0; page < 20; page++) {
      const url = new URL(`${this.apiBase}/v1/me/achievements`); url.searchParams.set('limit', '100'); if (cursor) url.searchParams.set('cursor', cursor);
      const result = await remoteJson(url, { headers: { Authorization: `Bearer ${credentials.accessToken}` } }, this.fetcher);
      if (result.subject !== me.subject || result.fspId !== me.fspId || !Array.isArray(result.items) || result.items.length > 100) throw new ProviderError('invalid_source_response');
      achievements.push(...result.items);
      if (result.nextCursor === null) return { subject: connection.subject, externalId: connection.externalId, achievements };
      if (typeof result.nextCursor !== 'string' || !result.nextCursor || result.nextCursor.length > 1000 || seen.has(result.nextCursor)) throw new ProviderError('invalid_source_response');
      cursor = result.nextCursor; seen.add(cursor);
    }
    throw new ProviderError('invalid_source_response');
  }
}
export function createProviders(env = process.env, options = {}) {
  const providers = [new FspProvider(env, options)];
  if (env.APP_ENV !== 'production' && env.NODE_ENV !== 'production' && env.INTEGRATION_DEMO !== '0') providers.push(new DemoFspProvider());
  return providers;
}
export const secretToken = () => randomBytes(32).toString('base64url');
