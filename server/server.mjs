import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from './store.mjs';
import { annulledResult, createAttempt, digest, emptyProgress, evaluate, extendBorderline, integrityKinds, maxDepartures, programInfo, provisionalScore, publicAttempt,
  recordAnswer, RequestError, retakeLock, retryDays, validateSurvey } from './assessment.mjs';
import { programs } from './bank.mjs';
import { ItemBank } from './item-bank.mjs';
import { ItemGenerationQueue } from './item-generator.mjs';
import { createLlmClient, LlmError } from './llm.mjs';
import { anchorPassport, generateAnchoredVariant, AnchoredGenerationError } from './anchored-generator.mjs';
import { AnchoredVariantStore } from './anchored-variant-store.mjs';
import { createAssistant } from './assistant.mjs';
import { applyProxyFromEnv } from './proxy.mjs';
import { FspIdService, FSP_ID_PROVIDER } from './fsp-id.mjs';
import { localFixtureLogins, localFixturePassword } from './local-fixtures.mjs';
import { PRIVACY_POLICY_VERSION } from '../shared/privacy.ts';
import { DirectoryService } from './directory.mjs';
import { PlatformService } from './platform.mjs';
import { MarketplaceService } from './marketplace.mjs';
import { RefreshTaskService } from './refresh-tasks.mjs';
import { createTaskReviewer } from './task-review.mjs';
import { platformOpenApi, swaggerPage } from './openapi.mjs';
import { AuthError, AuthService } from './auth.mjs';
import { FspIntegrationService } from './fsp-integration.mjs';
import { IntegrationService } from './integrations/service.mjs';
import { claimRoutes } from './integrations/claims-http.mjs';
import { callbackPage, readWebhook, integrationRoutes } from './integrations/http.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cookieName = 'predel_session';
const authCookieName = 'predel_account_session';
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.gz': 'application/gzip',
  '.bcmap': 'application/octet-stream', '.ttf': 'font/ttf', '.pfb': 'application/octet-stream',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};

export function createAssessmentServer({ dbPath = resolve(root, 'server/data/assessment.sqlite'), now = Date.now, webOrigin = process.env.WEB_ORIGIN, secureCookie = process.env.COOKIE_SECURE === '1', distPath = resolve(root, 'frontend/dist'), authEnv = process.env, authMailer, authCodeTtlMinutes, authSessionDays, integrationOptions = {}, llm: llmOverride } = {}) {
  const store = openStore(dbPath);
  const bank = new ItemBank(store.db, { programs, now });
  const variants = new AnchoredVariantStore(store.db, { now });
  let variantGenerationRunning = false;
  let llm;
  try { llm = llmOverride || createLlmClient({ env: authEnv }); }
  catch (error) { console.error('OpenRouter:', error.message); llm = createLlmClient({ env: {} }); }
  // Background generation only for the real process environment, never for isolated test servers.
  const assistant = createAssistant({ llm });
  const fspId = new FspIdService({ env: authEnv, now });
  const production = [authEnv.APP_ENV, authEnv.NODE_ENV].includes('production');
  const generation = new ItemGenerationQueue({ llm, bank, enabled: authEnv === process.env && authEnv.ITEM_BANK_AUTOGEN !== '0' });
  const auth = new AuthService(dbPath, { now, env: authEnv, mailer: authMailer, codeTtlMinutes: authCodeTtlMinutes, sessionDays: authSessionDays, database: store.db });
  const accountForOwner = owner => typeof owner === 'string' ? auth.accountForPlatformOwner(owner) : null;
  const directory = new DirectoryService(dbPath, { accountForOwner, database: store.db });
  const platform = new PlatformService(directory.store, store, { now, accountForOwner });
  const fsp = new FspIntegrationService(directory.store, { now, accountForOwner, env: authEnv });
  platform.profileSource = (owner, person) => fsp.applyProfile(owner, person);
  fsp.publishProfile = (owner, person) => platform.publication(owner, person).person;
  const marketplace = new MarketplaceService(directory.store, { now, accountForOwner });
  const tasks = new RefreshTaskService(directory.store, { now, accountForOwner });
  const taskReviewer = createTaskReviewer({ llm });
  directory.freshness = candidateId => tasks.freshnessFor(candidateId);
  const integrations = new IntegrationService(directory.store, { dbPath, env: authEnv, now, ...integrationOptions, projectProfile: (owner, profile) => platform.publication(owner, profile), candidateAccessible: (owner, row) => platform.candidateAccessible(owner, row), reservedProviders: ['fsp-demo'] });
  directory.fspEvidence = person => integrations.rankingFspEvidence(person);
  const limits = new Map();
  // Per-address budget for all API calls; offices behind one NAT may need a higher value.
  const requestsPerMinute = Math.max(30, Number(authEnv.API_RATE_LIMIT_PER_MINUTE) || 180);
  const integritySummary = ({ departures, blockedCopies, blockedActions, fullscreenExits }) => ({ departures, blockedCopies, blockedActions, fullscreenExits });
  function send(response, status, value) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(JSON.stringify(value));
  }
  function limit(key, maximum, period) {
    const time = now();
    if (limits.size > 5000) for (const [entry, value] of limits) if (value.until <= time) limits.delete(entry);
    const previous = limits.get(key);
    const value = previous && previous.until > time ? previous : { count: 0, until: time + period };
    value.count++; limits.set(key, value);
    if (value.count > maximum) throw new RequestError(429, 'Слишком много запросов. Попробуйте позже.');
  }
  async function body(request, maximum = 20000) {
    if (!String(request.headers['content-type'] || '').startsWith('application/json')) throw new RequestError(415, 'Ожидается JSON.');
    if (Number(request.headers['content-length']) > maximum) throw new RequestError(413, 'Запрос слишком большой.');
    let length = 0; const chunks = [];
    for await (const chunk of request) { length += chunk.length; if (length > maximum) throw new RequestError(413, 'Запрос слишком большой.'); chunks.push(chunk); }
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      return value;
    } catch { throw new RequestError(400, 'Некорректный JSON.'); }
  }
  async function rawBody(request, maximum = 8192) {
    let length = 0; const chunks = [];
    for await (const chunk of request) { length += chunk.length; if (length > maximum) throw new RequestError(413, 'Запрос слишком большой.'); chunks.push(chunk); }
    return Buffer.concat(chunks).toString('utf8');
  }
  function redirect(response, location) {
    response.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
    response.end();
  }
  function html(response, status, content) {
    response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'" });
    response.end(content);
  }
  async function signInFederated(response, user) {
    // Existing link: sign in. Same e-mail without a link: password sign-in is required first.
    const linked = auth.federatedAccount(FSP_ID_PROVIDER, user.sub);
    if (linked) {
      const created = auth.createSession(linked);
      setAuthCookie(response, created.token, created.maxAge);
      return redirect(response, '/app?role=' + linked.role);
    }
    if (auth.store.accountByEmail(String(user.email || '').toLocaleLowerCase('en-US'))) return redirect(response, '/auth?mode=login&fsp=exists');
    return redirect(response, '/auth?mode=fsp&ticket=' + encodeURIComponent(fspId.createTicket(user)));
  }
  function cookie(request, name) {
    return String(request.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(name + '='))?.slice(name.length + 1);
  }
  function setCookie(response, value) {
    const current = response.getHeader('Set-Cookie');
    response.setHeader('Set-Cookie', current ? [...(Array.isArray(current) ? current : [current]), value] : value);
  }
  function expireCookie(response, name) {
    setCookie(response, name + '=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0' + (secureCookie ? '; Secure' : ''));
  }
  function setAuthCookie(response, token, maxAge) {
    setCookie(response, authCookieName + '=' + token + '; Path=/api; HttpOnly; SameSite=Strict; Max-Age=' + maxAge + (secureCookie ? '; Secure' : ''));
  }
  function owner(request, response) {
    const authToken = cookie(request, authCookieName);
    const signedIn = auth.accountForToken(authToken);
    if (signedIn) return { owner: signedIn.platformOwner, account: signedIn.account, authToken };
    const supplied = cookie(request, cookieName);
    if (supplied && /^[a-f0-9]{64}$/.test(supplied)) {
      const anonymousOwner = digest(supplied);
      // A pre-registration cookie is deliberately no longer enough to reopen
      // an account after its auth session is removed.
      if (!auth.accountForPlatformOwner(anonymousOwner)) return { owner: anonymousOwner, account: null, authToken: null };
      expireCookie(response, cookieName);
    }
    const session = randomBytes(32).toString('hex');
    setCookie(response, cookieName + '=' + session + '; Path=/api; HttpOnly; SameSite=Strict; Max-Age=2592000' + (secureCookie ? '; Secure' : ''));
    return { owner: digest(session), account: null, authToken: null };
  }
  function authorized(id, session, token) {
    const row = store.get(id);
    if (!row || row.owner !== session) throw new RequestError(404, 'Попытка не найдена.');
    if (typeof token !== 'string' || token.length !== 64 || !timingSafeEqual(Buffer.from(digest(token)), Buffer.from(row.token_hash))) throw new RequestError(403, 'Нет доступа к попытке.');
    if (!row.result && now() >= Date.parse(row.expires_at)) throw new RequestError(410, 'Время теста истекло. Начните новую попытку.');
    return row;
  }
  function allowRole(identity, role, message) {
    if (!identity.account) throw new RequestError(401, 'Войдите в аккаунт.');
    if (identity.account.role !== role) throw new RequestError(403, message);
  }
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        limit('requests:' + request.socket.remoteAddress, requestsPerMinute, 60000);
        const origin = request.headers.origin;
        const allowed = new Set([(secureCookie ? 'https://' : 'http://') + request.headers.host,
          ...(webOrigin ? [webOrigin] : ['http://127.0.0.1:5173', 'http://127.0.0.1:4173', 'http://localhost:5173', 'http://localhost:4173'])]);
        if (origin && !allowed.has(origin)) throw new RequestError(403, 'Источник запроса не разрешён.');
        if (request.method === 'GET' && url.pathname === '/api/health') return send(response, 200, { status: 'ok' });
        if (url.pathname === '/api/openapi.json' && request.method === 'GET') return send(response, 200, platformOpenApi());
        if (url.pathname === '/api/docs' && request.method === 'GET') {
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'; script-src https://cdn.jsdelivr.net 'unsafe-inline'; style-src https://cdn.jsdelivr.net 'unsafe-inline'; "
              + "img-src 'self' data: https://cdn.jsdelivr.net; font-src https://cdn.jsdelivr.net data:; connect-src 'self'; frame-ancestors 'none'" });
          return response.end(swaggerPage());
        }
        if (url.pathname === '/api/integrations/openapi.json' && request.method === 'GET') {
          return send(response, 200, JSON.parse(await readFile(resolve(root, 'docs/api/integrations.openapi.json'), 'utf8')));
        }
        if (['/api/integrations/fsp/callback','/api/integrations/github/callback'].includes(url.pathname) && request.method === 'GET') return callbackPage(response);
        if (url.pathname === '/api/integrations/fsp/webhook' && request.method === 'POST') {
          limit('integration-webhook:' + request.socket.remoteAddress, 60, 60000);
          return send(response, 202, integrations.webhook(await readWebhook(request), request.headers));
        }
        if (url.pathname === '/api/auth/demo-accounts' && request.method === 'GET') {
          // Team test accounts for reviewers; the list exists only outside production.
          const accounts = production || authEnv.DEMO_ACCOUNTS === '0' ? [] : localFixtureLogins
            .filter(item => auth.store.accountByIdentifier(item.login.toLocaleLowerCase('ru-RU')))
            .map(item => ({ ...item, password: localFixturePassword }));
          return send(response, 200, { accounts, fspId: fspId.info() });
        }
        if (url.pathname.startsWith('/api/fsp-id/realms/fsp/')) {
          if (!fspId.mockEnabled) throw new RequestError(404, 'Страница не найдена.');
          const path = url.pathname.slice('/api/fsp-id/realms/fsp'.length);
          if (path === '/.well-known/openid-configuration' && request.method === 'GET') {
            return send(response, 200, fspId.discovery((secureCookie ? 'https://' : 'http://') + request.headers.host));
          }
          if (path === '/protocol/openid-connect/auth') {
            if (request.method === 'GET') return html(response, 200, fspId.authorizePage(url.searchParams));
            if (request.method === 'POST') {
              limit('fsp-id-auth:' + request.socket.remoteAddress, 30, 600000);
              const form = new URLSearchParams(await rawBody(request));
              const result = fspId.authorizeSubmit(form);
              return result.location ? redirect(response, result.location) : html(response, 400, fspId.authorizePage(form));
            }
          }
          if (path === '/protocol/openid-connect/token' && request.method === 'POST') {
            const form = new URLSearchParams(await rawBody(request));
            try { return send(response, 200, fspId.mockToken({ code: form.get('code'), verifier: form.get('code_verifier'), redirectUri: form.get('redirect_uri') })); }
            catch { return send(response, 400, { error: 'invalid_grant' }); }
          }
          if (path === '/protocol/openid-connect/userinfo' && request.method === 'GET') {
            const info = fspId.mockUserinfo(String(request.headers.authorization || '').replace(/^Bearer\s+/iu, ''));
            return info ? send(response, 200, info) : send(response, 401, { error: 'invalid_token' });
          }
          throw new RequestError(404, 'Страница не найдена.');
        }
        if (url.pathname === '/api/auth/fsp/start' && request.method === 'GET') {
          if (!fspId.enabled) return redirect(response, '/auth?mode=login&fsp=off');
          limit('fsp-start:' + request.socket.remoteAddress, 30, 600000);
          const started = fspId.start();
          setCookie(response, 'predel_fsp_state=' + started.state + '; Path=/api/auth/fsp; HttpOnly; SameSite=Lax; Max-Age=600' + (secureCookie ? '; Secure' : ''));
          return redirect(response, started.url);
        }
        if (url.pathname === '/api/auth/fsp/callback' && request.method === 'GET') {
          setCookie(response, 'predel_fsp_state=; Path=/api/auth/fsp; HttpOnly; SameSite=Lax; Max-Age=0' + (secureCookie ? '; Secure' : ''));
          let user;
          try {
            user = await fspId.complete({ code: url.searchParams.get('code'), state: url.searchParams.get('state'),
              cookieState: cookie(request, 'predel_fsp_state'), error: url.searchParams.get('error') });
          } catch (error) {
            return redirect(response, '/auth?mode=login&fsp=' + (url.searchParams.get('error') ? 'cancelled' : 'failed'));
          }
          return signInFederated(response, user);
        }
        if (url.pathname === '/api/auth/fsp/ticket' && request.method === 'GET') {
          const user = fspId.ticket(url.searchParams.get('ticket') || '');
          if (!user) throw new RequestError(410, 'Сессия входа через ФСП ID истекла. Войдите заново.');
          return send(response, 200, { name: user.name, email: user.email, fspId: user.fsp_id || null, city: user.city || '',
            achievements: Array.isArray(user.fsp_achievements) ? user.fsp_achievements.map(({ title, result, year }) => ({ title, result, year })) : [],
            suggestedLogin: auth.suggestLogin(user.email) });
        }
        if (url.pathname === '/api/auth/fsp/complete' && request.method === 'POST') {
          limit('fsp-complete:' + request.socket.remoteAddress, 20, 600000);
          const input = await body(request, 4096);
          if (Object.keys(input).some(key => !['ticket', 'login', 'consent', 'privacyVersion'].includes(key))) throw new RequestError(400, 'Недопустимые поля запроса.');
          const user = fspId.ticket(String(input.ticket || ''));
          if (!user) throw new RequestError(410, 'Сессия входа через ФСП ID истекла. Войдите заново.');
          const account = await auth.createFederatedAccount({ provider: FSP_ID_PROVIDER, subject: user.sub, email: user.email, name: user.name,
            login: input.login, consent: input.consent, privacyVersion: input.privacyVersion });
          fspId.ticket(String(input.ticket), { consume: true });
          // The new cabinet starts with consented FSP data; the questionnaire and test are still required.
          const state = { version: 2, profile: { id: 'candidate-anna', name: user.name, email: account.email, phone: '', bio: '', city: user.city || '',
            format: 'Удалённо', careerAchievements: '', education: '', workHistory: '', portfolio: '', languages: '', industry: '', professionalRole: '',
            softSkills: [], surveyCompletedAt: null, specialization: 'Frontend', desiredGrade: 'Junior', confirmed: null, stack: [], experience: '',
            fspId: user.fsp_id || '', achievements: [], visible: false, consent: true },
            company: { id: 'company-line', name: 'Линия', industry: 'Продуктовая разработка', website: 'https://example.com', contact: 'team@example.com', description: 'Разрабатываем цифровые продукты для бизнеса.' },
            invitations: [], history: [], surveys: [], savedSearches: [], hiringNeeds: [], candidateDecisions: [] };
          platform.save(account.platform_owner, state, 0, 'candidate');
          if (user.fsp_id) fsp.connectIdentity(account.platform_owner, user);
          const created = auth.createSession(account);
          setAuthCookie(response, created.token, created.maxAge);
          return send(response, 201, { account: created.account });
        }
        const identity = owner(request, response);
        const session = identity.owner;
        if (await claimRoutes({ request, response, url, identity, integrations, body, send, limit })) return;
        if (await integrationRoutes({ request, response, url, identity, integrations, body, send, limit })) return;
        if (url.pathname === '/api/auth/register/request-code') {
          if (request.method !== 'POST') throw new RequestError(405, 'Метод не поддерживается.');
          limit('auth-code-ip:' + request.socket.remoteAddress, 12, 600000);
          const input = await body(request);
          const email = typeof input.email === 'string' ? input.email.normalize('NFKC').trim().toLocaleLowerCase('en-US') : '';
          if (email) limit('auth-code-email:' + email, 4, 600000);
          const result = await auth.requestRegistration(input, session);
          return send(response, 202, { status: 'code_sent', email: result.email, expiresAt: result.expiresAt, delivery: result.delivery });
        }
        if (url.pathname === '/api/auth/register/verify') {
          if (request.method !== 'POST') throw new RequestError(405, 'Метод не поддерживается.');
          limit('auth-verify-ip:' + request.socket.remoteAddress, 20, 600000);
          const account = auth.verifyRegistration(await body(request));
          const created = auth.createSession(account);
          setAuthCookie(response, created.token, created.maxAge);
          return send(response, 201, { account: created.account });
        }
        if (url.pathname === '/api/auth/login') {
          if (request.method !== 'POST') throw new RequestError(405, 'Метод не поддерживается.');
          limit('auth-login-ip:' + request.socket.remoteAddress, 20, 600000);
          const account = await auth.login(await body(request));
          const created = auth.createSession(account);
          setAuthCookie(response, created.token, created.maxAge);
          return send(response, 200, { account: created.account });
        }
        if (url.pathname === '/api/auth/me') {
          if (request.method !== 'GET') throw new RequestError(405, 'Метод не поддерживается.');
          if (!identity.account) throw new RequestError(401, 'Войдите в аккаунт.');
          return send(response, 200, { account: identity.account });
        }
        if (url.pathname === '/api/auth/logout') {
          if (request.method !== 'POST') throw new RequestError(405, 'Метод не поддерживается.');
          auth.revokeToken(identity.authToken);
          expireCookie(response, authCookieName);
          expireCookie(response, cookieName);
          return send(response, 200, { status: 'signed_out' });
        }
        if (!identity.account) throw new RequestError(401, 'Войдите в аккаунт.');
        if (url.pathname === '/api/assistant/info' && request.method === 'GET') return send(response, 200, assistant.info());
        if (url.pathname === '/api/assistant/chat') {
          if (request.method !== 'POST') throw new RequestError(405, 'Метод не поддерживается.');
          // The assistant must not become a hint channel during an attempt.
          if (identity.account.role === 'candidate' && store.activeAttempt(session, new Date(now()).toISOString())) {
            throw new RequestError(409, 'Помощник недоступен во время теста.');
          }
          limit('assistant:' + identity.account.id, 20, 600000);
          return send(response, 200, await assistant.reply(identity.account.role, await body(request, 30000)));
        }
        if (url.pathname === '/api/auth/account') {
          if (request.method !== 'DELETE') throw new RequestError(405, 'Метод не поддерживается.');
          if (request.headers['x-platform-identity'] !== 'auth:' + identity.account.id) {
            throw new RequestError(409, 'Аккаунт изменился. Обновите страницу.');
          }
          const deletedAt = new Date(now()).toISOString();
          directory.store.transaction(() => {
            platform.delete(session, { withinTransaction: true, deleteAssessmentRecords: true });
            directory.store.db.prepare('DELETE FROM fsp_demo_connections WHERE owner=?').run(session);
            auth.store.eraseAccount(session, directory.store.db, deletedAt);
          });
          expireCookie(response, authCookieName);
          expireCookie(response, cookieName);
          return send(response, 200, { status: 'deleted', deletedAt });
        }
        if (request.method === 'GET' && url.pathname === '/api/assessment/program') {
          allowRole(identity, 'candidate', 'Тестирование доступно соискателю.');
          return send(response, 200, programInfo(url.searchParams.get('specialization'), url.searchParams.get('grade'), bank, { retryDays: retryDays(authEnv) }));
        }
        if (url.pathname === '/api/platform/state') {
          const identityScope = identity.account ? 'auth:' + identity.account.id : 'anonymous:' + session;
          response.setHeader('X-Platform-Identity', identityScope);
          if (['PUT', 'DELETE'].includes(request.method)) {
            const expected = request.headers['x-platform-identity'];
            if (expected !== undefined && expected !== identityScope || identity.account && expected === undefined) {
              throw new RequestError(409, 'Аккаунт изменился. Обновите страницу.');
            }
          }
          if (request.method === 'GET') return send(response, 200, platform.read(session));
          if (request.method === 'DELETE') {
            throw new RequestError(403, 'Историю анкеты нельзя удалить отдельно от аккаунта.');
          }
          if (request.method === 'PUT') {
            const input = await body(request, 1000000);
            if (Object.keys(input).some(key => !['state', 'baseRevision'].includes(key))) throw new RequestError(400, 'Недопустимые поля запроса.');
            const saved = platform.save(session, input.state, input.baseRevision, identity.account?.role || null);
            if (saved.state && !saved.state.profile.consent) { integrations.removeOwner(session); return send(response, 200, platform.read(session)); }
            return send(response, 200, saved);
          }
          throw new RequestError(405, 'Метод не поддерживается.');
        }
        if (url.pathname === '/api/integrations/fsp-demo' || /^\/api\/integrations\/fsp-demo\/(connect|sync)$/.test(url.pathname)) {
          allowRole(identity, 'candidate', 'Привязка ФСП доступна соискателю.');
          const identityScope = 'auth:' + identity.account.id;
          response.setHeader('X-Platform-Identity', identityScope);
          if (request.method === 'GET' && url.pathname === '/api/integrations/fsp-demo') return send(response, 200, fsp.read(session));
          if (request.headers['x-platform-identity'] !== identityScope) throw new RequestError(409, 'Аккаунт изменился. Обновите страницу.');
          limit('fsp:' + session, 12, 60000);
          if (request.method === 'POST' && url.pathname.endsWith('/connect')) return send(response, 200, fsp.connect(session, await body(request)));
          if (request.method === 'POST' && url.pathname.endsWith('/sync')) return send(response, 200, fsp.sync(session, await body(request)));
          if (request.method === 'DELETE' && url.pathname === '/api/integrations/fsp-demo') return send(response, 200, fsp.disconnect(session, await body(request)));
          throw new RequestError(405, 'Метод не поддерживается.');
        }
        const contacts = /^\/api\/directory\/([^/]+)\/contacts$/.exec(url.pathname);
        if (request.method === 'GET' && contacts) return send(response, 200, platform.contacts(session, decodeURIComponent(contacts[1])));
        if (request.method === 'GET' && url.pathname === '/api/directory/options') {
          if (identity.account?.role === 'candidate') throw new RequestError(403, 'Поиск кандидатов доступен работодателю.');
          return send(response, 200, directory.options(session));
        }
        if (request.method === 'GET' && url.pathname === '/api/directory/search') {
          if (identity.account?.role === 'candidate') throw new RequestError(403, 'Поиск кандидатов доступен работодателю.');
          let filters;
          try { filters = JSON.parse(url.searchParams.get('filters') || '{}'); }
          catch { throw new RequestError(400, 'Некорректные фильтры.'); }
          let category;
          try { category = JSON.parse(url.searchParams.get('category') || 'null'); }
          catch { throw new RequestError(400, 'Некорректная категория подборки.'); }
          return send(response, 200, await directory.search(url.searchParams.get('q') || '', filters,
            { owner: session, category, limit: Number(url.searchParams.get('limit') || 30), offset: Number(url.searchParams.get('offset') || 0) }));
        }
        if (request.method === 'GET' && url.pathname === '/api/companies') return send(response, 200, marketplace.companies({ owner: session,
          offset: Number(url.searchParams.get('offset') || 0), limit: Number(url.searchParams.get('limit') || 12), q: url.searchParams.get('q') || '' }));
        const company = /^\/api\/companies\/([^/]+)$/.exec(url.pathname);
        if (request.method === 'GET' && company) return send(response, 200, marketplace.company(decodeURIComponent(company[1]), session));
        if (url.pathname === '/api/vacancies') {
          if (request.method === 'GET') {
            if (url.searchParams.get('own') === '1') allowRole(identity, 'employer', 'Вакансии компании доступны работодателю.');
            return send(response, 200, marketplace.vacancies(session, { own: url.searchParams.get('own') === '1' }));
          }
          if (request.method === 'POST') {
            allowRole(identity, 'employer', 'Публиковать вакансии может только работодатель.');
            return send(response, 201, marketplace.publish(session, await body(request)));
          }
          throw new RequestError(405, 'Метод не поддерживается.');
        }
        const application = /^\/api\/vacancies\/([^/]+)\/applications$/.exec(url.pathname);
        if (request.method === 'POST' && application) {
          allowRole(identity, 'candidate', 'Откликаться может только соискатель.');
          return send(response, 201, marketplace.apply(session, decodeURIComponent(application[1]), await body(request)));
        }
        const vacancy = /^\/api\/vacancies\/([^/]+)$/.exec(url.pathname);
        if (vacancy) {
          if (request.method === 'GET') return send(response, 200, marketplace.vacancy(session, decodeURIComponent(vacancy[1])));
          if (request.method === 'PATCH') {
            allowRole(identity, 'employer', 'Редактировать вакансии может только работодатель.');
            return send(response, 200, marketplace.edit(session, decodeURIComponent(vacancy[1]), await body(request)));
          }
          throw new RequestError(405, 'Метод не поддерживается.');
        }
        if (request.method === 'GET' && url.pathname === '/api/applications') {
          const requestedRole = url.searchParams.get('role') || identity.account?.role;
          if (identity.account && requestedRole !== identity.account.role) throw new RequestError(403, 'Отклики для этой роли недоступны.');
          return send(response, 200, marketplace.applications(session, requestedRole));
        }
        if (url.pathname === '/api/tasks') {
          if (!identity.account) throw new RequestError(401, 'Войдите в аккаунт.');
          if (request.method === 'GET') return send(response, 200, tasks.list(session, identity.account.role,
            { offset: Number(url.searchParams.get('offset') || 0), limit: Number(url.searchParams.get('limit') || 30) }));
          if (request.method === 'POST') {
            allowRole(identity, 'employer', 'Назначать задания может только работодатель.');
            limit('tasks:' + session, 60, 3600000);
            return send(response, 201, tasks.assign(session, await body(request)));
          }
          throw new RequestError(405, 'Метод не поддерживается.');
        }
        if (request.method === 'GET' && url.pathname === '/api/tasks/candidates') {
          allowRole(identity, 'employer', 'Назначать задания может только работодатель.');
          return send(response, 200, tasks.eligible(session));
        }
        const taskAction = /^\/api\/tasks\/([^/]+)\/(answer|review|ai-review)$/.exec(url.pathname);
        if (taskAction) {
          if (request.method !== 'POST') throw new RequestError(405, 'Метод не поддерживается.');
          const id = decodeURIComponent(taskAction[1]);
          if (taskAction[2] === 'answer') {
            allowRole(identity, 'candidate', 'Отвечать на задания может только соискатель.');
            return send(response, 200, tasks.answer(session, id, await body(request, 30000)));
          }
          allowRole(identity, 'employer', 'Проверять задания может только работодатель.');
          if (taskAction[2] === 'review') return send(response, 200, tasks.review(session, id, await body(request)));
          const task = tasks.reviewable(session, id);
          limit('task-review:' + session, 20, 600000);
          return send(response, 200, await taskReviewer.review(task));
        }
        const answer = /^\/api\/applications\/([^/]+)$/.exec(url.pathname);
        if (request.method === 'PATCH' && answer) {
          allowRole(identity, 'employer', 'Ответить на отклик может только работодатель.');
          return send(response, 200, marketplace.respond(session, decodeURIComponent(answer[1]), await body(request)));
        }
        if (request.method === 'POST' && url.pathname === '/api/assessment/attempts') {
          if (identity.account?.role === 'employer') throw new RequestError(403, 'Тестирование доступно соискателю.');
          const input = await body(request);
          if (Object.keys(input).some(key => !['survey', 'vacancyDescription'].includes(key))) throw new RequestError(400, 'Недопустимые поля запроса.');
          limit('starts:' + request.socket.remoteAddress, 40, 3600000);
          if (store.countSince(session, new Date(now() - 3600000).toISOString()) >= 20) throw new RequestError(429, 'Слишком много попыток. Попробуйте позже.');
          const survey = validateSurvey(input.survey);
          const lock = retakeLock(store.completed(session), survey.specialization, survey.desiredGrade, now(), retryDays(authEnv));
          if (lock) {
            const lower = lock.lowerGrades.length ? ' Тест на грейд ниже доступен сразу.' : '';
            throw new RequestError(409, `Повторить тест на этот грейд можно с ${new Date(lock.until).toLocaleDateString('ru-RU')}.${lower}`, { retryAt: lock.until, lowerGrades: lock.lowerGrades });
          }
          const previous = store.recent(session, survey.specialization, survey.desiredGrade);
          const attempt = createAttempt(survey, input.vacancyDescription, previous, now(), { bank });
          const token = randomBytes(32).toString('hex');
          store.insert(attempt, session, digest(token));
          bank.recordExposure(attempt.questions.map(question => question.variantId));
          generation.ensure([...new Set(attempt.questions.filter(question => !question.pilot).map(question => question.familyId))]);
          return send(response, 201, { ...publicAttempt(attempt, emptyProgress(attempt)), token, serverNow: new Date(now()).toISOString(), integrity: store.integrity(attempt.id) });
        }
        const integrity = /^\/api\/assessment\/attempts\/([a-f0-9-]{36})\/integrity$/.exec(url.pathname);
        if (integrity && request.method === 'POST') {
          allowRole(identity, 'candidate', 'Тестирование доступно соискателю.');
          const input = await body(request, 2048);
          if (Object.keys(input).some(key => !['token', 'event'].includes(key))) throw new RequestError(400, 'Недопустимые поля события.');
          const row = authorized(integrity[1], session, input.token);
          if (row.result) throw new RequestError(409, 'Тест уже завершён.');
          const event = input.event;
          if (!event || typeof event !== 'object' || Array.isArray(event)
            || Object.keys(event).some(key => !['id', 'kind'].includes(key))
            || typeof event.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(event.id)
            || !integrityKinds.includes(event.kind)) {
            throw new RequestError(400, 'Некорректное событие контроля теста.');
          }
          const saved = store.recordIntegrity(row.id, event, new Date(now()).toISOString());
          if (saved === 'conflict') throw new RequestError(409, 'Событие уже сохранено с другим типом.');
          if (saved === 'limit') throw new RequestError(429, 'Достигнут лимит событий контроля теста.');
          const summary = store.integrity(row.id);
          if (summary.departures >= maxDepartures) {
            // Repeated departures annul the attempt on the server; the client cannot undo it.
            store.complete(row.id, 'annulled', annulledResult(row.attempt, now(), integritySummary(summary)));
            return send(response, 200, { ...summary, remaining: 0, annulled: true, result: store.get(row.id).result });
          }
          return send(response, 200, { ...summary, remaining: maxDepartures - summary.departures, annulled: false });
        }
        const answerRoute = /^\/api\/assessment\/attempts\/([a-f0-9-]{36})\/answer$/.exec(url.pathname);
        if (answerRoute && request.method === 'POST') {
          allowRole(identity, 'candidate', 'Тестирование доступно соискателю.');
          const input = await body(request, 4096);
          let row = authorized(answerRoute[1], session, input.token);
          if (row.result) throw new RequestError(409, row.result.annulled ? 'Попытка аннулирована из-за нарушений.' : 'Тест уже завершён.');
          if (row.attempt.delivery !== 'sequential') throw new RequestError(409, 'Эта попытка принимает ответы целиком.');
          let recorded = recordAnswer(row.attempt, row.progress, input, now());
          if (recorded.changed && !store.saveProgress(row.id, recorded.progress, row.progress)) {
            row = store.get(row.id);
            recorded = recordAnswer(row.attempt, row.progress, input, now());
            if (recorded.changed && !store.saveProgress(row.id, recorded.progress, row.progress)) throw new RequestError(409, 'Ответ уже обрабатывается. Повторите.');
          }
          let attempt = row.attempt, progress = recorded.progress;
          let complete = Object.keys(progress.answers).length === attempt.questions.length;
          let extended = false;
          if (complete) {
            const longer = extendBorderline(attempt, provisionalScore(attempt, progress), { bank, recent: store.recent(session, attempt.specialization, attempt.grade).filter(item => item.id !== attempt.id), now: now() });
            if (longer) {
              progress = { ...progress, revealedAt: { ...progress.revealedAt, [longer.questions[attempt.questions.length].id]: new Date(now()).toISOString() } };
              if (store.extend(row.id, longer, progress)) {
                bank.recordExposure(longer.questions.slice(attempt.questions.length).map(question => question.variantId));
                attempt = longer; complete = false; extended = true;
              }
            }
          }
          return send(response, 200, { ...publicAttempt(attempt, progress), complete, extended,
            serverNow: new Date(now()).toISOString(), integrity: store.integrity(row.id), status: 'active' });
        }
        const match = /^\/api\/assessment\/attempts\/([a-f0-9-]{36})(\/submit)?$/.exec(url.pathname);
        if (match && !match[2] && request.method === 'GET') {
          allowRole(identity, 'candidate', 'Тестирование доступно соискателю.');
          const row = authorized(match[1], session, request.headers['x-attempt-token']);
          return send(response, 200, { ...publicAttempt(row.attempt, row.progress), serverNow: new Date(now()).toISOString(), integrity: store.integrity(row.id), status: row.result ? 'completed' : 'active', ...(row.result ? { result: row.result } : {}) });
        }
        if (match?.[2] && request.method === 'POST') {
          allowRole(identity, 'candidate', 'Тестирование доступно соискателю.');
          const input = await body(request);
          if (Object.keys(input).some(key => !['token', 'answers'].includes(key))) throw new RequestError(400, 'Недопустимые поля ответа.');
          const row = authorized(match[1], session, input.token);
          if (row.result?.annulled) return send(response, 200, row.result);
          const evaluated = evaluate(row.attempt, input.answers, row.result ? Date.parse(row.result.date) : now(),
            { progress: row.progress, integrity: integritySummary(store.integrity(row.id)) });
          if (row.result) {
            if (row.answer_digest !== evaluated.answerDigest) throw new RequestError(409, 'Попытка уже проверена. Ответы менять нельзя.');
            return send(response, 200, row.result);
          }
          if (!store.complete(row.id, evaluated.answerDigest, evaluated.result)) {
            const saved = store.get(row.id);
            if (saved.result?.annulled) return send(response, 200, saved.result);
            if (saved.answer_digest !== evaluated.answerDigest) throw new RequestError(409, 'Попытка уже проверена. Ответы менять нельзя.');
            return send(response, 200, saved.result);
          }
          bank.recordResponses(evaluated.responses, evaluated.result.score);
          return send(response, 200, evaluated.result);
        }
        if (url.pathname.startsWith('/api/review-bank/variants')) {
          if (!identity.account?.canModerate) throw new RequestError(403, 'Авторские варианты доступны модератору.');
          if (request.method === 'GET' && url.pathname === '/api/review-bank/variants') {
            return send(response, 200, { items: variants.list({ anchorId: url.searchParams.get('anchorId') || undefined,
              grade: url.searchParams.get('grade') || undefined }), generator: { configured: llm.configured, running: variantGenerationRunning,
              mode: 'anchored', llmCallsPerVariant: 1, certificationEnabled: false } });
          }
          if (request.method === 'POST' && url.pathname === '/api/review-bank/variants/generate') {
            const input = await body(request, 1024);
            if (Object.keys(input).length !== 1 || typeof input.anchorId !== 'string') throw new RequestError(400, 'Укажите только anchorId из нового банка.');
            try { anchorPassport(input.anchorId); } catch { throw new RequestError(400, 'Неизвестный кейс нового банка.'); }
            if (!llm.configured) throw new RequestError(503, 'Добавьте OPENROUTER_API_KEY в серверный .env.');
            if (variantGenerationRunning) throw new RequestError(409, 'Генератор занят.');
            limit('anchored-generate:' + session, 10, 3600000);
            variantGenerationRunning = true;
            const controller = new AbortController();
            const disconnect = () => { if (!response.writableEnded) controller.abort(); };
            response.once('close', disconnect);
            try {
              const result = await generateAnchoredVariant({ llm, anchorId: input.anchorId,
                existingScenarios: variants.scenarios(input.anchorId), now, signal: controller.signal });
              if (!result.accepted) { variants.log(input.anchorId, 'rejected-structure', result.reasons); return send(response, 422, result); }
              return send(response, 201, variants.save(result.candidate));
            } catch (error) {
              if (error instanceof LlmError || error instanceof AnchoredGenerationError) {
                variants.log(input.anchorId, 'failed', [error.code]);
                throw new RequestError(503, error.message);
              }
              throw error;
            } finally { response.off('close', disconnect); variantGenerationRunning = false; }
          }
          const variantRoute = /^\/api\/review-bank\/variants\/(variant-[a-f0-9-]{36})(\/review)?$/.exec(url.pathname);
          if (variantRoute && request.method === 'GET' && !variantRoute[2]) {
            const item = variants.get(variantRoute[1]);
            if (!item) throw new RequestError(404, 'Вариант не найден.');
            return send(response, 200, item);
          }
          if (variantRoute?.[2] && request.method === 'POST') {
            const input = await body(request, 8192);
            if (Object.keys(input).some(key => !['decision', 'checks', 'rationale'].includes(key))) throw new RequestError(400, 'Укажите только decision, checks и rationale.');
            try { return send(response, 200, variants.review(variantRoute[1], input, 'expert:' + identity.account.login)); }
            catch { throw new RequestError(400, 'Нужны решение, независимая проверка всех критериев и обоснование; вариант с начатым пилотом заблокирован.'); }
          }
          throw new RequestError(404, 'Страница не найдена.');
        }
        if (url.pathname.startsWith('/api/item-bank/')) {
          if (!identity.account?.canModerate) throw new RequestError(403, 'Банк заданий доступен модератору.');
          if (request.method === 'GET' && url.pathname === '/api/item-bank/items') {
            const filters = { specialization: url.searchParams.get('specialization') || undefined, grade: url.searchParams.get('grade') || undefined,
              status: url.searchParams.get('status') || undefined };
            return send(response, 200, { items: bank.list(filters), summary: bank.summary(filters.specialization, filters.grade),
              generator: { configured: llm.configured, models: llm.models, queued: generation.queue.length, running: Boolean(generation.running) } });
          }
          const reviewRoute = /^\/api\/item-bank\/items\/(gen-[a-f0-9-]{36})\/review$/.exec(url.pathname);
          if (reviewRoute && request.method === 'POST') {
            const input = await body(request, 4096);
            if (!['approve', 'reject'].includes(input.decision)) throw new RequestError(400, 'Укажите решение: approve или reject.');
            const item = bank.row(reviewRoute[1]);
            if (!item) throw new RequestError(404, 'Задание не найдено.');
            bank.setStatus(item.id, input.decision === 'approve' ? 'active' : 'rejected', { decidedBy: 'expert:' + identity.account.login,
              reason: typeof input.note === 'string' && input.note.trim() ? input.note.slice(0, 500) : (input.decision === 'approve' ? 'Одобрено экспертом.' : 'Отклонено экспертом.') });
            return send(response, 200, bank.row(item.id));
          }
          if (request.method === 'POST' && url.pathname === '/api/item-bank/generate') {
            const input = await body(request, 2048);
            const program = Object.hasOwn(programs, input.specialization) && Object.hasOwn(programs[input.specialization], input.grade) ? programs[input.specialization][input.grade] : null;
            if (!program) throw new RequestError(400, 'Выберите специализацию и грейд.');
            if (!llm.configured) throw new RequestError(503, 'Добавьте OPENROUTER_API_KEY в .env, чтобы генерировать задания.');
            limit('item-generate:' + session, 10, 3600000);
            const before = generation.queue.length;
            for (const family of program.families) if (!generation.queue.includes(family.id)) generation.queue.push(family.id);
            generation.enabled = true; generation.kick();
            return send(response, 202, { queued: generation.queue.length - before, families: program.families.length });
          }
          throw new RequestError(404, 'Страница не найдена.');
        }
        throw new RequestError(404, 'Страница не найдена.');
      }
      if (!['GET', 'HEAD'].includes(request.method)) throw new RequestError(405, 'Метод не поддерживается.');
      const path = decodeURIComponent(url.pathname);
      const file = ['/', '/app', '/auth', '/privacy', '/moderation'].includes(path) ? resolve(distPath, 'index.html') : resolve(distPath, '.' + path);
      const within = relative(distPath, file);
      if (within.startsWith('..') || within.includes(':') || !mime[extname(file)]) throw new RequestError(404, 'Страница не найдена.');
      let content;
      try { content = await readFile(file); } catch { throw new RequestError(404, 'Страница не найдена.'); }
      response.writeHead(200, { 'Content-Type': mime[extname(file)], 'Cache-Control': extname(file) === '.html' || path.startsWith('/resume-assets/') ? 'no-cache' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (!response.headersSent) send(response, error instanceof RequestError || error instanceof AuthError ? error.status : 500, { error: error instanceof RequestError || error instanceof AuthError ? error.message : 'Сервис временно недоступен. Попробуйте снова.', ...(error instanceof RequestError && error.details ? error.details : {}) });
      else response.end();
      if (!(error instanceof RequestError) && !(error instanceof AuthError)) console.error('Assessment service error:', error.message);
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.on('close', () => { integrations.close(); auth.close(); directory.close(); store.close(); });
  return { server, store, directory, platform, marketplace, auth, fsp, integrations, bank, llm, generation, variants };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (typeof process.loadEnvFile === 'function') {
    try { process.loadEnvFile(resolve(root, '.env')); }
    catch (error) { if (error?.code !== 'ENOENT') console.error('Cannot load .env:', error.message); }
  }
  const proxy = applyProxyFromEnv();
  if (proxy) console.log('Outbound proxy: ' + proxy.replace(/\/\/[^@/]*@/u, '//***@'));
  const port = Number(process.env.PORT || 8787);
  const { server, directory } = createAssessmentServer({ dbPath: process.env.ASSESSMENT_DB || undefined });
  server.listen(port, process.env.HOST || '127.0.0.1', () => {
    console.log('Assessment server: http://' + (process.env.HOST || '127.0.0.1') + ':' + port);
    void directory.ensureIndex().catch(() => console.log('Semantic model is unavailable. Run npm run train:search.'));
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}
