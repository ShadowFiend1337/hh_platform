import assert from 'node:assert/strict';
import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';
import { createServer } from 'node:http';
import { createHash, generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { createAssessmentServer } from '../../server/server.mjs';
import { createInitialState } from '../src/model.ts';
import { FspProvider, DemoFspProvider } from '../../server/integrations/providers.mjs';

// Fully isolated app/database/mailbox and fictional federation. No real email,
// external provider or local user database participates in this verification.
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'browser-fixture', alg: 'RS256', use: 'sig' };
const codes = new Map(), authorizations = new Map();
let issuer, base, callbackCookie;
const upstream = createServer(async (req, res) => {
  const url = new URL(req.url, issuer);
  res.setHeader('Content-Type', 'application/json');
  if (url.pathname === '/.well-known/openid-configuration') return res.end(JSON.stringify({ issuer,
    authorization_endpoint: issuer + '/authorize', token_endpoint: issuer + '/token', jwks_uri: issuer + '/keys' }));
  if (url.pathname === '/keys') return res.end(JSON.stringify({ keys: [jwk] }));
  if (url.pathname === '/authorize') {
    const code = randomUUID(); authorizations.set(code, Object.fromEntries(url.searchParams));
    const callback = new URL(url.searchParams.get('redirect_uri')); callback.searchParams.set('state', url.searchParams.get('state')); callback.searchParams.set('code', code);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(`<a href="${callback.href.replaceAll('&', '&amp;')}">Продолжить подключение</a>`);
  }
  if (url.pathname === '/token') {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const fields = new URLSearchParams(Buffer.concat(chunks).toString()); const pending = authorizations.get(fields.get('code'));
    if (!pending || pending.code_challenge !== createHash('sha256').update(fields.get('code_verifier')).digest('base64url')) { res.statusCode = 400; return res.end('{}'); }
    authorizations.delete(fields.get('code'));
    const seconds = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid })).toString('base64url');
    const claims = Buffer.from(JSON.stringify({ iss: issuer, sub: 'browser-candidate', aud: 'predel-browser', nonce: pending.nonce, iat: seconds, exp: seconds + 300 })).toString('base64url');
    const idToken = `${header}.${claims}.${sign('RSA-SHA256', Buffer.from(`${header}.${claims}`), privateKey).toString('base64url')}`;
    return res.end(JSON.stringify({ access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_in: 300, token_type: 'Bearer', id_token: idToken }));
  }
  if (req.headers.authorization !== 'Bearer fixture-access') { res.statusCode = 401; return res.end('{}'); }
  if (url.pathname === '/v1/me') return res.end(JSON.stringify({ subject: 'browser-candidate', fspId: 'FSP-BROWSER' }));
  if (url.pathname === '/v1/me/achievements') return res.end(JSON.stringify({ subject: 'browser-candidate', fspId: 'FSP-BROWSER', nextCursor: null, items: [{
    id: 'browser-competition', title: 'Тестовое официальное соревнование', discipline: 'algorithms', occurredAt: '2026-09-01T00:00:00.000Z',
    result: 'Финалист', place: 3, participation: 'team', teamRole: 'Разработчик', sourceUrl: null, status: 'active',
  }] }));
  res.statusCode = 404; res.end('{}');
});
await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
// localhost provider -> 127.0.0.1 app is a different site, exercising Strict.
issuer = 'http://localhost:' + upstream.address().port;
const provider = new FspProvider({});
const app = createAssessmentServer({ dbPath: ':memory:', authEnv: {}, authMailer: async ({ email, code }) => codes.set(email, code),
  integrationOptions: { providers: [provider, Object.assign(new DemoFspProvider(), { id: 'test-demo' })], automatic: false, retryDelayMs: 1 } });
app.server.on('request', req => { if (req.method === 'GET' && req.url.startsWith('/api/integrations/fsp/callback')) callbackCookie = req.headers.cookie || ''; });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
base = 'http://127.0.0.1:' + app.server.address().port;
Object.assign(provider, new FspProvider({ APP_ENV: 'development', FSP_OIDC_ISSUER: issuer, FSP_API_BASE_URL: issuer,
  FSP_CLIENT_ID: 'predel-browser', FSP_CLIENT_SECRET: 'fixture-secret', FSP_REDIRECT_URI: base + '/api/integrations/fsp/callback', INTEGRATION_ENCRYPTION_KEY: '1'.repeat(64) }));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
  const email = 'integration-browser@example.invalid', password = 'browser test password';
  const api = context.request;
  assert.equal((await api.post(base + '/api/auth/register/request-code', { data: { role: 'candidate', name: 'Тестовый кандидат', email, login: 'integration-browser', password, consent: true, privacyVersion: PRIVACY_POLICY_VERSION } })).status(), 202);
  assert.equal((await api.post(base + '/api/auth/register/verify', { data: { email, code: codes.get(email) } })).status(), 201);
  async function read() { const response = await api.get(base + '/api/platform/state'); return { ...await response.json(), identity: response.headers()['x-platform-identity'] }; }
  async function save(state) { const snapshot = await read(); const response = await api.put(base + '/api/platform/state', { headers: { 'X-Platform-Identity': snapshot.identity }, data: { state, baseRevision: snapshot.revision } }); assert.equal(response.status(), 200, await response.text()); return response.json(); }
  const state = createInitialState(); const survey = { id: 'integration-browser-survey', date: new Date().toISOString(), industry: 'ИТ', professionalRole: 'Frontend разработчик', specialization: 'Frontend', desiredGrade: 'Junior', experience: '1 год', stack: ['React'], softSkills: [] };
  Object.assign(state.profile, survey, { id: 'candidate-anna', name: 'Тестовый кандидат', email, consent: true, visible: true, surveyCompletedAt: survey.date }); state.surveys = [survey];
  await save(state);
  const attemptResponse = await api.post(base + '/api/assessment/attempts', { data: { survey, vacancyDescription: '' } }); const attempt = await attemptResponse.json(); assert.equal(attemptResponse.status(), 201);
  const internal = app.store.get(attempt.id).attempt;
  const resultResponse = await api.post(base + `/api/assessment/attempts/${attempt.id}/submit`, { data: { token: attempt.token, answers: internal.questions.map(q => ({ questionId: q.id, optionId: q.correctOptionId })) } });
  const result = await resultResponse.json(); assert(result.passed);
  state.history = [result]; state.profile.confirmed = { specialization: result.specialization, grade: result.grade, score: result.score, date: result.date, surveyId: survey.id }; await save(state);
  const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/app?role=candidate&tab=profile');
  const panel = page.locator('.integration-panel'); await panel.getByRole('heading', { name: 'Внешние подтверждения' }).waitFor();
  const publicSearch = panel.locator('.integration-source').filter({ has: page.getByRole('heading', {name: 'Результаты из открытых источников', exact:true}) });
  await publicSearch.getByLabel('Имя участника или команда').fill('Ромашов Федор');
  await publicSearch.getByRole('button', {name: 'Найти результат'}).click();
  await publicSearch.getByText('Ромашов Фёдор Викторович', {exact:true}).waitFor();
  await publicSearch.getByText('Публичная запись · Принадлежность аккаунту не подтверждена', {exact:true}).waitFor();
  assert.equal((await api.get(base + '/api/profile/evidence')).status(),200);
  assert.deepEqual((await (await api.get(base + '/api/profile/evidence')).json()).items,[]);
  await page.screenshot({path:'/tmp/hh-fsp-public-search.png',fullPage:true});
  await publicSearch.getByLabel('Имя участника или команда').fill('Несуществующий Участник');
  await publicSearch.getByRole('button', {name: 'Найти результат'}).click();
  await publicSearch.getByText('Совпадений в текущем каталоге нет. Это не означает отсутствия участия в соревнованиях.',{exact:true}).waitFor();
  const demo = panel.locator('.integration-source').filter({ has: page.getByRole('heading', { name: 'ФСП — демонстрационный источник', exact: true }) });
  assert.equal(await demo.getByRole('button', { name: 'Подключить', exact: true }).isEnabled(), false);
  await panel.getByRole('checkbox').check(); await demo.getByRole('button', { name: 'Подключить', exact: true }).click();
  await panel.getByText(/^Демонстрационные данные ·/u).waitFor();
  const owner = app.directory.store.db.prepare('SELECT owner FROM integration_connections WHERE provider=?').get('test-demo').owner;
  assert(app.auth.accountForPlatformOwner(owner)); assert.equal(app.directory.store.forOwner(owner).fsp, 0);
  await page.reload(); await panel.getByText(/^Демонстрационные данные ·/u).waitFor();
  await demo.getByRole('button', { name: 'Отключить и удалить данные' }).click();
  await demo.getByRole('button', { name: 'Подключить', exact: true }).waitFor();
  await demo.getByLabel('Демонстрационный сценарий').selectOption('empty'); await panel.getByRole('checkbox').check();
  await demo.getByRole('button', { name: 'Подключить', exact: true }).click();
  await panel.getByText('Обновление завершено: получено записей — 0', { exact: true }).waitFor();
  assert.equal(await panel.locator('.evidence-list .achievement').count(), 0);
  await demo.getByRole('button', { name: 'Отключить и удалить данные' }).click();
  await demo.getByRole('button', { name: 'Подключить', exact: true }).waitFor();
  await panel.getByRole('checkbox').check();
  const live = panel.locator('.integration-source').filter({ has: page.getByRole('heading', { name: 'ФСП', exact: true }) });
  await live.getByRole('button', { name: 'Подключить', exact: true }).click();
  await page.getByRole('link', { name: 'Продолжить подключение' }).click();
  await page.waitForURL(base + '/app?role=candidate&tab=profile');
  await panel.getByText(/^Подтверждено источником ·/u).waitFor();
  assert(!callbackCookie.includes('predel_account_session='), 'Cross-site callback must not rely on Strict cookie on the initial navigation.');
  assert.equal(app.directory.store.forOwner(owner).fsp, 1);
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByText(/^Подтверждено источником ·/u).waitFor();
  await dialog.getByText('Командный результат · Разработчик', { exact: true }).waitFor();
  await page.screenshot({ path: '/tmp/hh-integrations-profile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Integration browser flow passed: public protocol search/empty results without attribution, demo, empty history, reload, deletion, real OIDC/PKCE fixture across sites, Strict callback, team evidence and preview.');
} finally {
  await browser?.close();
  await new Promise(resolve => { app.server.close(resolve); app.server.closeAllConnections(); });
  await new Promise(resolve => { upstream.close(resolve); upstream.closeAllConnections(); });
}
