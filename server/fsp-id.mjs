// Sign-in with FSP ID. FSP ID will run on Keycloak, so the platform acts as an
// OpenID Connect relying party: authorization code flow with PKCE (S256), state
// bound to a short HttpOnly cookie, nonce in the ID token. No combat access was
// provided (Q&A), so a built-in mock Keycloak realm "fsp" serves fictional
// participants; setting FSP_ID_ISSUER/FSP_ID_CLIENT_ID/FSP_ID_CLIENT_SECRET/
// FSP_ID_REDIRECT_URI switches the same flow to a real Keycloak (docs/fsp_id.md).
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const FSP_ID_PROVIDER = 'fsp-id';
const realmPath = '/api/fsp-id/realms/fsp';
const clientId = 'predel';
const callbackPath = '/api/auth/fsp/callback';
const ttl = 10 * 60000;
const base64url = value => Buffer.from(value).toString('base64url');
const sha256 = value => createHash('sha256').update(value).digest();

/** Fictional FSP participants of the mock realm; one has no competition history. */
export const fspParticipants = Object.freeze([
  { sub: 'f5c1d0a2-7b54-4f3e-9a11-1c0de0fsp001', fspId: 'FSP-104512', name: 'Илья Соколов', email: 'ilya.sokolov@fsp-id.example', city: 'Казань',
    summary: 'Продуктовое программирование · победитель', achievements: [
      { id: 'cr-2025-product', title: 'Чемпионат России по спортивному программированию', discipline: 'Продуктовое программирование', result: 'Победитель', year: '2025', level: 'Всероссийский', team: 'Команда «Сигма»' },
      { id: 'reg-2024-product', title: 'Региональные соревнования ФСП, Республика Татарстан', discipline: 'Продуктовое программирование', result: '2 место', year: '2024', level: 'Региональный', team: 'Команда «Сигма»' },
    ] },
  { sub: 'a91e7c44-0d2b-4b8a-8f6e-1c0de0fsp002', fspId: 'FSP-208733', name: 'Мария Кузнецова', email: 'maria.kuznetsova@fsp-id.example', city: 'Новосибирск',
    summary: 'Алгоритмическое программирование · призёр', achievements: [
      { id: 'cup-2025-algo', title: 'Кубок России по спортивному программированию', discipline: 'Алгоритмическое программирование', result: '3 место', year: '2025', level: 'Всероссийский', team: 'Личный зачёт' },
    ] },
  { sub: '3c7b2e19-55aa-4d0f-b6c3-1c0de0fsp003', fspId: 'FSP-315904', name: 'Даниил Орлов', email: 'daniil.orlov@fsp-id.example', city: 'Санкт-Петербург',
    summary: 'Информационная безопасность · финалист', achievements: [
      { id: 'cr-2025-security', title: 'Чемпионат России по информационной безопасности', discipline: 'Информационная безопасность', result: 'Финалист', year: '2025', level: 'Всероссийский', team: 'Команда «Ноль доверия»' },
      { id: 'reg-2023-security', title: 'Межрегиональные соревнования ФСП', discipline: 'Информационная безопасность', result: 'Участник', year: '2023', level: 'Межрегиональный', team: 'Команда «Ноль доверия»' },
    ] },
  { sub: 'd2f0a8b6-91c3-4e57-8b1a-1c0de0fsp004', fspId: 'FSP-420118', name: 'Екатерина Лебедева', email: 'ekaterina.lebedeva@fsp-id.example', city: 'Москва',
    summary: 'Новый участник · результатов пока нет', achievements: [] },
]);

export function participantByFspId(fspId) {
  return fspParticipants.find(item => item.fspId === fspId) || null;
}

/** Evidence rows in the format of the FSP integration (provider-owned, active). */
export function participantEvidence(participant) {
  return participant.achievements.map(item => ({ id: item.id, title: item.title, result: item.result, year: item.year,
    discipline: item.discipline, level: item.level, participation: item.team === 'Личный зачёт' ? 'individual' : 'team',
    status: 'active', source: 'fsp-id-demo', identityVerified: true }));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function loginPage({ query, error = '' }) {
  const hidden = ['client_id', 'redirect_uri', 'response_type', 'scope', 'state', 'nonce', 'code_challenge', 'code_challenge_method']
    .map(key => `<input type="hidden" name="${key}" value="${escapeHtml(query.get(key) || '')}">`).join('');
  const people = fspParticipants.map((item, index) => `<label class="person"><input type="radio" name="participant" value="${escapeHtml(item.sub)}" ${index === 0 ? 'checked' : ''}>
    <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.fspId)} · ${escapeHtml(item.summary)}</small></span></label>`).join('');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ФСП ID · вход</title><style>
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f1fa;font-family:Manrope,-apple-system,'Segoe UI',sans-serif;color:#221a33}
main{width:min(440px,calc(100vw - 32px));background:#fff;border-radius:18px;box-shadow:0 20px 50px #3d1a7a1f;overflow:hidden}
header{background:linear-gradient(135deg,#4a1a8c,#7b2fd0);color:#fff;padding:22px 26px}header b{font-size:22px;letter-spacing:-.02em}header p{margin:6px 0 0;font-size:13px;opacity:.85}
form{padding:22px 26px 24px}h1{font-size:17px;margin:0 0 4px}.hint{font-size:12px;color:#6b6280;margin:0 0 16px;line-height:1.5}
.person{display:flex;gap:12px;align-items:center;padding:12px 14px;border:1px solid #e6e0f0;border-radius:12px;margin-bottom:8px;cursor:pointer}
.person:has(input:checked){border-color:#7b2fd0;background:#f8f4ff}.person strong{display:block;font-size:14px}.person small{display:block;font-size:12px;color:#6b6280;margin-top:2px}
input[type=radio]{accent-color:#7b2fd0;width:16px;height:16px;flex-shrink:0}
.actions{display:flex;gap:10px;margin-top:16px}button{flex:1;height:44px;border:0;border-radius:10px;font:inherit;font-weight:700;cursor:pointer}
.primary{background:#7b2fd0;color:#fff}.secondary{background:#f1edf8;color:#4a1a8c}.error{background:#fff1f3;color:#a3002a;border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:12px}
footer{font-size:11px;color:#8a82a0;padding:0 26px 18px;line-height:1.5}
</style></head><body><main><header><b>ФСП ID</b><p>Единый вход на ресурсы Федерации спортивного программирования · тестовый стенд</p></header>
<form method="post">${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ''}<h1>Выберите участника</h1>
<p class="hint">Это имитация Keycloak ФСП ID: участники и их результаты вымышленные. Платформа predel запрашивает ФИО, e-mail и результаты соревнований.</p>
${hidden}${people}<div class="actions"><button class="secondary" name="decision" value="deny" type="submit">Отмена</button><button class="primary" name="decision" value="allow" type="submit">Войти и разрешить доступ</button></div></form>
<footer>OpenID Connect · realm «fsp» · клиент «${clientId}». Боевой стенд ФСП подключается переменными FSP_ID_*.</footer></main></body></html>`;
}

export class FspIdService {
  constructor({ env = process.env, now = Date.now } = {}) {
    this.now = now;
    this.real = env.FSP_ID_ISSUER ? { issuer: env.FSP_ID_ISSUER.replace(/\/$/u, ''), clientId: env.FSP_ID_CLIENT_ID || '',
      clientSecret: env.FSP_ID_CLIENT_SECRET || '', redirectUri: env.FSP_ID_REDIRECT_URI || '' } : null;
    this.mockEnabled = !this.real && ![env.APP_ENV, env.NODE_ENV].includes('production') && env.INTEGRATION_DEMO !== '0';
    this.secret = randomBytes(32);
    this.states = new Map(); this.codes = new Map(); this.tokens = new Map(); this.tickets = new Map();
  }

  get enabled() { return Boolean(this.real || this.mockEnabled); }

  info() { return { enabled: this.enabled, mode: this.real ? 'keycloak' : this.mockEnabled ? 'demo' : 'off' }; }

  prune() {
    const time = this.now();
    for (const map of [this.states, this.codes, this.tokens, this.tickets]) for (const [key, value] of map) if (value.expires <= time) map.delete(key);
  }

  /** Starts sign-in: returns the authorization URL and the state cookie value. */
  start() {
    if (!this.enabled) throw new Error('FSP ID disabled');
    this.prune();
    const state = base64url(randomBytes(24)), nonce = base64url(randomBytes(16)), verifier = base64url(randomBytes(32));
    this.states.set(state, { nonce, verifier, expires: this.now() + ttl });
    const params = new URLSearchParams({ client_id: this.real?.clientId || clientId, redirect_uri: this.real?.redirectUri || callbackPath,
      response_type: 'code', scope: 'openid email profile fsp_achievements', state, nonce,
      code_challenge: base64url(sha256(verifier)), code_challenge_method: 'S256' });
    const authorize = this.real ? `${this.real.issuer}/protocol/openid-connect/auth` : `${realmPath}/protocol/openid-connect/auth`;
    return { url: `${authorize}?${params}`, state };
  }

  // ---- Mock Keycloak realm -------------------------------------------------
  discovery(origin) {
    const issuer = origin + realmPath;
    return { issuer, authorization_endpoint: `${issuer}/protocol/openid-connect/auth`, token_endpoint: `${issuer}/protocol/openid-connect/token`,
      userinfo_endpoint: `${issuer}/protocol/openid-connect/userinfo`, response_types_supported: ['code'], grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'], scopes_supported: ['openid', 'email', 'profile', 'fsp_achievements'],
      id_token_signing_alg_values_supported: ['HS256'], subject_types_supported: ['public'] };
  }

  authorizePage(query) { return loginPage({ query }); }

  /** Mock consent form submission: returns the redirect location. */
  authorizeSubmit(form) {
    const redirectUri = form.get('redirect_uri');
    if (form.get('client_id') !== clientId || redirectUri !== callbackPath) return { error: 'Неизвестный клиент или адрес возврата.' };
    if (form.get('response_type') !== 'code' || form.get('code_challenge_method') !== 'S256' || !form.get('code_challenge') || !form.get('state')) {
      return { error: 'Некорректный запрос авторизации.' };
    }
    const target = new URLSearchParams({ state: form.get('state') });
    if (form.get('decision') !== 'allow') { target.set('error', 'access_denied'); return { location: `${redirectUri}?${target}` }; }
    const participant = fspParticipants.find(item => item.sub === form.get('participant'));
    if (!participant) return { error: 'Выберите участника.' };
    const code = base64url(randomBytes(24));
    this.codes.set(code, { sub: participant.sub, challenge: form.get('code_challenge'), nonce: form.get('nonce') || '', redirectUri, expires: this.now() + 60000 });
    target.set('code', code);
    return { location: `${redirectUri}?${target}` };
  }

  /** Token endpoint of the mock realm (authorization_code + PKCE). */
  mockToken({ code, verifier, redirectUri }) {
    const grant = this.codes.get(code);
    this.codes.delete(code);
    if (!grant || grant.expires <= this.now() || grant.redirectUri !== redirectUri) throw new Error('invalid_grant');
    const challenge = base64url(sha256(verifier || ''));
    if (challenge.length !== grant.challenge.length || !timingSafeEqual(Buffer.from(challenge), Buffer.from(grant.challenge))) throw new Error('invalid_grant');
    const participant = fspParticipants.find(item => item.sub === grant.sub);
    const accessToken = base64url(randomBytes(32));
    this.tokens.set(accessToken, { sub: participant.sub, expires: this.now() + 300000 });
    const iat = Math.floor(this.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = base64url(JSON.stringify({ iss: realmPath, aud: clientId, sub: participant.sub, iat, exp: iat + 300, nonce: grant.nonce,
      email: participant.email, email_verified: true, name: participant.name, fsp_id: participant.fspId }));
    const signature = createHmac('sha256', this.secret).update(`${header}.${payload}`).digest('base64url');
    return { access_token: accessToken, token_type: 'Bearer', expires_in: 300, id_token: `${header}.${payload}.${signature}` };
  }

  mockUserinfo(accessToken) {
    const token = this.tokens.get(accessToken);
    if (!token || token.expires <= this.now()) return null;
    const participant = fspParticipants.find(item => item.sub === token.sub);
    return { sub: participant.sub, email: participant.email, email_verified: true, name: participant.name, preferred_username: participant.fspId.toLowerCase(),
      fsp_id: participant.fspId, city: participant.city, fsp_achievements: participant.achievements };
  }

  verifyIdToken(idToken, nonce) {
    const [header, payload, signature] = String(idToken).split('.');
    const expected = createHmac('sha256', this.secret).update(`${header}.${payload}`).digest('base64url');
    if (!signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return claims.aud === clientId && claims.nonce === nonce && claims.exp * 1000 > this.now() ? claims : null;
  }

  // ---- Relying party ---------------------------------------------------------
  /** Exchanges the code and returns verified user info, or throws a user-facing error. */
  async complete({ code, state, cookieState, error }) {
    this.prune();
    if (error) throw new Error('Вход через ФСП ID отменён.');
    const saved = state && cookieState === state ? this.states.get(state) : null;
    this.states.delete(state);
    if (!saved) throw new Error('Сессия входа через ФСП ID устарела. Попробуйте ещё раз.');
    if (!this.real) {
      const tokens = this.mockToken({ code, verifier: saved.verifier, redirectUri: callbackPath });
      if (!this.verifyIdToken(tokens.id_token, saved.nonce)) throw new Error('ФСП ID вернул недействительный токен.');
      return { provider: FSP_ID_PROVIDER, ...this.mockUserinfo(tokens.access_token) };
    }
    // Real Keycloak: confidential client; user info is read over TLS with the access token.
    const tokenResponse = await fetch(`${this.real.issuer}/protocol/openid-connect/token`, { method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code,
        redirect_uri: this.real.redirectUri, client_id: this.real.clientId, client_secret: this.real.clientSecret, code_verifier: saved.verifier }) });
    if (!tokenResponse.ok) throw new Error('ФСП ID не подтвердил вход.');
    const tokens = await tokenResponse.json();
    const info = await fetch(`${this.real.issuer}/protocol/openid-connect/userinfo`, { headers: { Authorization: 'Bearer ' + tokens.access_token }, redirect: 'error' });
    if (!info.ok) throw new Error('ФСП ID не вернул данные участника.');
    const user = await info.json();
    return { provider: FSP_ID_PROVIDER, ...user };
  }

  createTicket(user) {
    const ticket = base64url(randomBytes(24));
    this.tickets.set(ticket, { user, expires: this.now() + ttl });
    return ticket;
  }

  ticket(id, { consume = false } = {}) {
    this.prune();
    const value = this.tickets.get(id);
    if (consume) this.tickets.delete(id);
    return value?.user || null;
  }
}
