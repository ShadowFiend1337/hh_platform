import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { createInitialState } from '../src/model.ts';

// Real local API and fictional accounts only. The development mailbox is
// ignored by Git; this test never uses personal addresses or an email service.
const base = process.env.PREDEL_URL || 'http://127.0.0.1:5173';
const require = createRequire(import.meta.url);
const browser = await chromium.launch({ headless: true });
const contexts = [];
const errors = [];
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const candidate = { role: 'candidate', login: 'candidate.' + suffix, email: 'candidate.' + suffix + '@example.invalid', name: 'Тестовый кандидат', password: 'LocalFixture927!' };
const employer = { role: 'employer', login: 'employer.' + suffix, email: 'employer.' + suffix + '@example.invalid', companyName: 'Тестовая компания', password: 'LocalFixture328!' };

async function context() {
  const result = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  contexts.push(result);
  return result;
}
async function page(context) {
  const result = await context.newPage();
  result.setDefaultTimeout(20000);
  result.on('pageerror', error => errors.push(error.message));
  return result;
}
async function snapshot(context) {
  const response = await context.request.get(base + '/api/platform/state');
  assert.equal(response.status(), 200);
  return { ...(await response.json()), identity: response.headers()['x-platform-identity'] };
}
async function save(context, state) {
  const previous = await snapshot(context);
  const response = await context.request.put(base + '/api/platform/state', {
    headers: { 'X-Platform-Identity': previous.identity }, data: { state, baseRevision: previous.revision },
  });
  assert.equal(response.status(), 200, await response.text());
  return response.json();
}
async function codeFor(email) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const messages = (await readFile(new URL('../../server/data/mail.log', import.meta.url), 'utf8')).trim().split(/\r?\n/u).filter(Boolean).map(line => JSON.parse(line));
      const message = messages.findLast(item => item.email === email);
      if (message) { assert.match(message.code, /^\d{6}$/u); return message.code; }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('The fictional registration did not enter the local development mailbox.');
}
async function register(page, account) {
  await page.goto(base + '/auth?mode=register&role=' + account.role);
  await page.getByRole('heading', { name: 'Регистрация', exact: true }).waitFor();
  await page.getByLabel(account.role === 'candidate' ? 'Ваше имя' : 'Название компании', { exact: true }).fill(account.name || account.companyName);
  await page.getByLabel('Логин', { exact: false }).fill(account.login);
  await page.getByLabel('Эл. почта', { exact: true }).fill(account.email);
  await page.getByLabel('Пароль', { exact: true }).fill(account.password);
  await page.getByLabel('Повторите пароль', { exact: true }).fill(account.password);
  await page.getByRole('checkbox', { name: /Согласен на обработку персональных данных/u }).check();
  const requested = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/register/request-code');
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  const response = await requested;
  assert.equal(response.status(), 202, await response.text());
  assert.equal(response.request().postDataJSON().consent, true);
  const body = await response.json();
  assert.equal(body.delivery, 'development', 'Run auth browser verification on the local development mailer, without external delivery.');
  assert.equal(body.code, undefined, 'Verification secrets must not appear in the public API.');
  await page.getByRole('heading', { name: 'Подтвердите почту', exact: true }).waitFor();
  const code = await codeFor(account.email);
  const wrong = ((Number(code[0]) + 1) % 10) + code.slice(1);
  await page.getByLabel('Код подтверждения').fill(wrong);
  await page.getByRole('button', { name: 'Подтвердить почту', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(new URL(page.url()).pathname, '/auth', 'An invalid code must not open a cabinet.');
  await page.getByLabel('Код подтверждения').fill(code);
  await page.getByRole('button', { name: 'Подтвердить почту', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/app' && url.searchParams.get('role') === account.role);
  await page.locator('.main-content[data-sync-status="saved"]').waitFor();
  const me = await page.request.get(base + '/api/auth/me');
  assert.equal(me.status(), 200);
  const actual = (await me.json()).account;
  assert.equal(actual.email, account.email);
  assert.equal(actual.role, account.role);
  return actual;
}
async function login(page, account) {
  await page.goto(base + '/auth?mode=login');
  await page.getByRole('heading', { name: 'Вход', exact: true }).waitFor();
  await page.getByLabel('Логин или эл. почта', { exact: true }).fill(account.login);
  await page.getByLabel('Пароль', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/app' && url.searchParams.get('role') === account.role);
  await page.locator('.main-content[data-sync-status="saved"]').waitFor();
}
async function audit(page) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const issues = await page.evaluate(async () => (await window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
  })).violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })));
  assert.deepEqual(issues, []);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'The auth form must fit the viewport.');
}

try {
  const first = await context();
  const firstPage = await page(first);
  const guest = createInitialState();
  Object.assign(guest.profile, { name: 'Гостевой черновик', email: 'guest@example.invalid', consent: true, bio: 'Гостевой текст не принадлежит новому аккаунту.' });
  await save(first, guest);
  await firstPage.goto(base + '/auth?mode=register&role=candidate');
  await firstPage.getByRole('heading', { name: 'Регистрация', exact: true }).waitFor();
  await firstPage.setViewportSize({ width: 320, height: 800 });
  await audit(firstPage);
  await firstPage.setViewportSize({ width: 1440, height: 1000 });
  const verifiedCandidate = await register(firstPage, candidate);
  await firstPage.getByLabel('Имя и фамилия', { exact: true }).waitFor();
  assert.equal(await firstPage.getByLabel('Имя и фамилия', { exact: true }).inputValue(), candidate.name);
  assert.equal(await firstPage.getByLabel('Email', { exact: true }).inputValue(), candidate.email);
  const fresh = await snapshot(first);
  assert.equal(fresh.identity, 'auth:' + verifiedCandidate.id);
  assert.ok(!fresh.state || fresh.state.profile.bio !== guest.profile.bio, 'Registration must not inherit the guest profile.');
  assert.equal(await firstPage.locator('.role-control').count(), 0, 'Verified users cannot switch their account role.');
  await firstPage.goto(base + '/app?role=employer&tab=company');
  await firstPage.waitForURL(url => url.searchParams.get('role') === 'candidate');
  const candidateState = (await snapshot(first)).state || createInitialState();
  Object.assign(candidateState.profile, { name: candidate.name, email: candidate.email, consent: true, bio: 'Сохранённое описание кандидата на другом устройстве.' });
  await save(first, candidateState);
  console.log('PASS Email confirmation, isolated registration, prefilled questionnaire and fixed candidate role');

  const second = await context();
  const secondPage = await page(second);
  await login(secondPage, candidate);
  assert.equal((await snapshot(second)).state.profile.bio, candidateState.profile.bio);
  const authCookie = (await second.cookies()).find(cookie => cookie.name === 'predel_account_session');
  assert.ok(authCookie?.httpOnly && authCookie.sameSite === 'Strict');
  console.log('PASS Login from another browser restores the same private cabinet');

  const company = await context();
  const companyPage = await page(company);
  const verifiedEmployer = await register(companyPage, employer);
  await companyPage.getByRole('button', { name: 'Предельный режим', exact: true }).waitFor();
  await companyPage.getByRole('button', { name: 'Предельный режим', exact: true }).click();
  assert.equal(await companyPage.getByRole('button', { name: 'Предельный режим', exact: true }).getAttribute('aria-pressed'), 'true');
  await companyPage.goto(base + '/app?role=candidate&tab=profile');
  await companyPage.waitForURL(url => url.searchParams.get('role') === 'employer');
  assert.equal(await companyPage.locator('.role-control').count(), 0);
  const companyState = await snapshot(company);
  assert.equal(companyState.identity, 'auth:' + verifiedEmployer.id);
  assert.notEqual(companyState.state?.profile.bio, candidateState.profile.bio);
  console.log('PASS Employer registration preserves ordinary and swipe views with its own role');

  await companyPage.getByRole('button', { name: 'Выйти', exact: true }).click();
  await companyPage.waitForURL(url => url.pathname === '/');
  assert.equal((await company.request.get(base + '/api/auth/me')).status(), 401);
  await login(companyPage, candidate);
  assert.equal((await snapshot(company)).state.profile.bio, candidateState.profile.bio);
  assert.notEqual((await snapshot(company)).state.company.name, employer.companyName, 'A previous employer cache must not replace candidate cabinet data.');
  assert.deepEqual(errors, []);
  console.log('PASS Logout and switching accounts clear the previous account cache');
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
