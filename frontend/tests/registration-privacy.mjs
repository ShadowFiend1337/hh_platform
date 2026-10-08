import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createInitialState } from '../src/model.ts';
import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';
import { startIsolatedService } from './helpers/isolated-service.mjs';

const isolated = await startIsolatedService();
const browser = await chromium.launch({ headless: true });
const contexts = [];
const errors = [];
const account = { role: 'candidate', login: 'privacy.browser.candidate', email: 'privacy.browser@example.invalid',
  name: 'Проверка приватности', password: 'Isolated privacy 927!' };
try {
  const context = await browser.newContext(); contexts.push(context);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(isolated.base + '/auth?mode=register&role=candidate');
  await page.getByLabel('Ваше имя', { exact: true }).fill(account.name);
  await page.getByLabel('Логин', { exact: false }).fill(account.login);
  await page.getByLabel('Эл. почта', { exact: true }).fill(account.email);
  await page.getByLabel('Пароль', { exact: true }).fill(account.password);
  await page.getByLabel('Повторите пароль', { exact: true }).fill(account.password);
  await page.getByRole('checkbox', { name: /Согласен на обработку персональных данных/u }).check();
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/register/request-code');
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  const requested = await pending;
  assert.equal(requested.status(), 202, await requested.text());
  assert.equal(requested.request().postDataJSON().consent, true);
  assert.equal(requested.request().postDataJSON().privacyVersion, PRIVACY_POLICY_VERSION);
  assert.equal((await requested.json()).code, undefined);
  await page.getByLabel('Код подтверждения').fill(isolated.codes.get(account.email));
  await page.getByRole('button', { name: 'Подтвердить почту', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/app');
  await page.locator('.main-content[data-sync-status="saved"]').waitFor();

  const previousResponse = await context.request.get(isolated.base + '/api/platform/state');
  assert.equal(previousResponse.status(), 200, await previousResponse.text());
  const previous = await previousResponse.json();
  const identity = previousResponse.headers()['x-platform-identity'];
  const survey = { id: 'browser-privacy-survey', date: new Date().toISOString(), industry: 'ИТ',
    professionalRole: 'Frontend разработчик', specialization: 'Frontend', desiredGrade: 'Junior',
    experience: '1 год', stack: ['React'], softSkills: [], workHistory: 'Исходный опыт кандидата' };
  const state = createInitialState();
  Object.assign(state.profile, survey, { id: 'candidate-anna', name: account.name, email: account.email,
    consent: true, visible: false, confirmed: null, surveyCompletedAt: survey.date });
  state.surveys = [survey];
  const savedResponse = await context.request.put(isolated.base + '/api/platform/state', {
    headers: { 'X-Platform-Identity': identity }, data: { state, baseRevision: previous.revision },
  });
  assert.equal(savedResponse.status(), 200, await savedResponse.text());
  const saved = await savedResponse.json();
  for (const surveys of [[], [{ ...saved.state.surveys[0], workHistory: 'Изменённый старый опыт' }]]) {
    const rejected = await context.request.put(isolated.base + '/api/platform/state', {
      headers: { 'X-Platform-Identity': identity }, data: { state: { ...saved.state, surveys }, baseRevision: saved.revision },
    });
    assert([403, 409].includes(rejected.status()), await rejected.text());
    assert.match((await rejected.json()).error, /анкеты.*изменять|анкету.*изменить|анкету.*удалить/u);
  }

  const otherDevice = await browser.newContext(); contexts.push(otherDevice);
  const login = await otherDevice.request.post(isolated.base + '/api/auth/login', {
    data: { login: account.login, password: account.password },
  });
  assert.equal(login.status(), 200, await login.text());
  await page.goto(isolated.base + '/privacy');
  await page.getByRole('button', { name: 'Удалить аккаунт и данные', exact: true }).click();
  await page.getByText('Удалить аккаунт и все связанные с ним данные?', { exact: true }).waitFor();
  const deletion = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/account');
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  const deleted = await deletion;
  assert.equal(deleted.status(), 200, await deleted.text());
  assert.equal(deleted.request().headers()['x-platform-identity'], identity);
  assert.match((await deleted.json()).deletedAt, /Z$/u);
  await page.getByText(/Аккаунт и связанные данные удалены.*время Москвы/u).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Удалить аккаунт и данные', exact: true }).count(), 0);
  const revoked = await otherDevice.request.get(isolated.base + '/api/platform/state');
  assert.equal(revoked.status(), 401, await revoked.text());
  await page.getByRole('button', { name: 'На главную', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/');
  assert.deepEqual(errors, []);
  console.log('Versioned registration, immutable questionnaire and account deletion browser checks passed.');
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
  await isolated.close();
}
