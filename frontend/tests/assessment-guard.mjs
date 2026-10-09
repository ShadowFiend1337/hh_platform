import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { programs } from '../../server/bank.mjs';
import { startIsolatedService } from './helpers/isolated-service.mjs';

// Real registration, attempt and grading, with a disposable database and an
// in-memory mail transport. This test never reaches SMTP or the working store.
const isolated = await startIsolatedService();
const { base, codes } = isolated;
const require = createRequire(import.meta.url);
let browser;
let context;
const errors = [];
const outbound = [];
const account = { role: 'candidate', login: 'guard.candidate', name: 'Проверка тестирования',
  email: 'guard.candidate@example.invalid', password: 'FixtureGuard927!', consent: true, privacyVersion: PRIVACY_POLICY_VERSION };
const keys = new Map(programs.Frontend.Junior.families.flatMap(family =>
  family.variants.map(variant => [variant.text, variant.options[variant.correct]])));

async function registeredPage(fixtureAccount = account) {
  const requested = await context.request.post(base + '/api/auth/register/request-code', { data: fixtureAccount });
  assert.equal(requested.status(), 202, await requested.text());
  const code = codes.get(fixtureAccount.email);
  const verified = await context.request.post(base + '/api/auth/register/verify', { data: { email: fixtureAccount.email, code } });
  assert.equal(verified.status(), 201, await verified.text());
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());
  await page.goto(base + '/app?role=candidate&tab=onboarding');
  await page.getByRole('heading', { name: 'Анкета', exact: true }).waitFor();
  await page.locator('.onboarding-form [name="industry"]').selectOption('ИТ');
  await page.locator('.onboarding-form [name="professionalRole"]').fill('Frontend-разработчик');
  await page.locator('.onboarding-form [name="specialization"]').selectOption('Frontend');
  await page.locator('.onboarding-form [name="desiredGrade"]').selectOption('Junior');
  await page.locator('.onboarding-form [name="stack"]').fill('React, TypeScript');
  await page.locator('.onboarding-form [name="experience"]').fill('1 год');
  await page.getByLabel('Согласен на обработку персональных данных', { exact: true }).check();
  await page.getByRole('button', { name: 'К тесту', exact: true }).click();
  await page.getByRole('button', { name: 'Начать тест', exact: true }).waitFor();
  await page.locator('.main-content[data-sync-status="saved"]').waitFor();
  return page;
}

async function start(page) {
  const button = page.getByRole('button', { name: 'Начать тест', exact: true });
  assert.equal(await button.isDisabled(), true, 'The test starts only after the rules are accepted');
  await page.getByLabel('Ознакомлен с правилами и готов начать').check();
  const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/assessment/attempts'
    && response.request().method() === 'POST');
  await button.click();
  const actual = await response;
  assert.equal(actual.status(), 201, await actual.text());
  const attempt = await actual.json();
  assert.equal(attempt.questions.length, 1, 'Only the first question is delivered');
  assert.equal(attempt.questionCount, 12);
  await page.locator('.exam-protected-content .question-text').waitFor();
  return attempt;
}

async function dispatch(page, selector, type, options = {}) {
  return page.locator(selector).first().evaluate((element, { type, options }) => {
    const event = type === 'keydown' ? new KeyboardEvent(type, { bubbles: true, cancelable: true, ...options })
      : new Event(type, { bubbles: true, cancelable: true });
    return element.dispatchEvent(event);
  }, { type, options });
}

async function questionVisible(page) {
  await page.locator('.exam-protected-content .question-text').waitFor();
  assert.equal(await page.locator('.exam-focus-cover').count(), 0);
}

async function covered(page) {
  await page.getByRole('heading', { name: 'Вы покинули тест', exact: true }).waitFor();
  assert.equal(await page.locator('.question-text,.answer-options').count(), 0,
    'A paused question and its choices are removed from the DOM, not covered visually');
}

async function syntheticLoss(page) {
  // Headless browsers cannot reliably hide a document; synthetic events verify the handler contract.
  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

async function syntheticReturn(page) {
  await page.evaluate(() => {
    delete document.hidden;
    delete document.visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await covered(page);
  await page.getByRole('button', { name: 'Вернуться к тесту', exact: true }).click();
  await questionVisible(page);
}

async function answerCurrent(page, correct = true) {
  const expected = keys.get(await page.locator('.question-text').textContent());
  const options = page.locator('.answer-option');
  const texts = (await options.locator('span').allTextContents()).map(text => text.trim());
  const index = expected ? texts.findIndex(text => (text === expected) === correct) : 0;
  const radio = options.nth(Math.max(0, index)).getByRole('radio');
  await radio.focus();
  await page.keyboard.press('Space');
  assert.equal(await radio.isChecked(), true, 'Native keyboard answer selection remains available');
  const position = await page.locator('.exam-progress').getAttribute('aria-valuenow');
  const last = Number(position) === 12;
  await page.getByRole('button', { name: last ? 'Завершить тест' : 'Ответить', exact: true }).click();
  if (!last) await page.locator(`.exam-progress[aria-valuenow="${Number(position) + 1}"]`).waitFor();
}

async function readAttempt(attempt) {
  const response = await context.request.get(base + '/api/assessment/attempts/' + attempt.id, { headers: { 'X-Attempt-Token': attempt.token } });
  assert.equal(response.status(), 200, await response.text());
  return response.json();
}

async function waitIntegrity(attempt, condition, description) {
  let actual;
  for (let index = 0; index < 25; index++) {
    actual = await readAttempt(attempt);
    if (condition(actual.integrity, actual)) return actual;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.fail(description + ': ' + JSON.stringify(actual.integrity));
}

async function auditAccessibility(page, label) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const issues = await page.evaluate(async () => (await window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
  })).violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })));
  assert.deepEqual(issues, [], label + ' has no automated accessibility violations');
}

async function localContext() {
  const value = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await value.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.hostname !== '127.0.0.1') {
      outbound.push(url.origin);
      await route.abort();
    } else await route.continue();
  });
  return value;
}

try {
  browser = await chromium.launch({ headless: true });
  context = await localContext();
  const page = await registeredPage();
  await auditAccessibility(page, 'Assessment setup');
  assert.equal(await dispatch(page, '.page-heading h1', 'copy'), true, 'Copying is ordinary before the test starts');
  assert.equal(await page.locator('.assistant-launcher').count(), 1, 'The assistant is available before the test');
  const attempt = await start(page);
  assert.equal(await page.locator('.assistant-launcher, .assistant-panel').count(), 0, 'The assistant is hidden during the attempt');
  assert.deepEqual(attempt.integrity, { departures: 0, blockedCopies: 0, blockedActions: 0, fullscreenExits: 0, lastEventAt: null });
  assert.equal(await page.getByRole('button', { name: 'Назад', exact: true }).count(), 0, 'There is no way back to a locked answer');
  assert.ok(await page.locator('.exam-protected-content').evaluate(element => getComputedStyle(element).backgroundImage.includes('svg')),
    'The question area carries the attempt watermark');

  // During the attempt clipboard, context menu and developer shortcuts are blocked on the whole page.
  for (const type of ['copy', 'cut', 'paste', 'contextmenu', 'dragstart']) {
    assert.equal(await dispatch(page, '.question-text', type), false, `${type} is blocked on the question`);
    assert.equal(await dispatch(page, '.page-heading h1', type), false, `${type} is blocked elsewhere on the page`);
  }
  for (const options of [{ key: 'c', ctrlKey: true }, { key: 'v', ctrlKey: true }, { key: 'p', ctrlKey: true }, { key: 'F12' }, { key: 'i', ctrlKey: true, shiftKey: true }]) {
    assert.equal(await dispatch(page, '.question-text', 'keydown', options), false, JSON.stringify(options) + ' is blocked');
  }
  assert.equal(await dispatch(page, '.question-text', 'keydown', { key: 'Tab' }), true, 'Keyboard navigation stays available');
  await waitIntegrity(attempt, value => value.blockedCopies > 0 && value.blockedActions > 0, 'Blocked actions are persisted as signals');

  const profileLink = page.locator('.main-nav').getByRole('link', { name: 'Профиль', exact: true });
  assert.equal(await profileLink.getAttribute('aria-disabled'), 'true');
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await questionVisible(page);
  assert.equal((await context.request.get(base + '/api/auth/me')).status(), 200, 'Logout is blocked during the attempt');

  await answerCurrent(page);
  await syntheticLoss(page);
  await covered(page);
  await waitIntegrity(attempt, value => value.departures === 1, 'Blur and hidden from one interruption are one departure');
  await page.getByText('Нарушение 1 из 3.', { exact: false }).waitFor();
  await auditAccessibility(page, 'Paused assessment');
  await syntheticReturn(page);
  await page.locator('.exam-strikes', { hasText: 'Нарушений 1 из 3' }).waitFor();

  await syntheticLoss(page);
  await covered(page);
  await waitIntegrity(attempt, value => value.departures === 2, 'A separate interruption is a separate departure');
  await page.reload();
  await covered(page);
  await page.getByRole('button', { name: 'Вернуться к тесту', exact: true }).click();
  await questionVisible(page);

  for (let index = 1; index < 12; index++) await answerCurrent(page);
  await page.getByRole('heading', { name: 'Грейд подтверждён', exact: true }).waitFor();
  const completed = await readAttempt(attempt);
  assert.equal(completed.result.score, 100, 'Two warned departures do not change the score');
  assert.equal(completed.result.integrity.departures, 2);
  assert.equal(await dispatch(page, '.assessment-result h2', 'copy'), true, 'Restrictions end with the attempt');
  assert.equal(await profileLink.getAttribute('aria-disabled'), null);

  // A second candidate leaves three times: the server annuls the attempt.
  await context.close();
  context = await localContext();
  const annulPage = await registeredPage({ ...account, login: 'guard.annul', email: 'guard.annul@example.invalid', name: 'Проверка аннулирования' });
  const annulled = await start(annulPage);
  for (let index = 0; index < 3; index++) {
    await syntheticLoss(annulPage);
    if (index < 2) {
      await covered(annulPage);
      await waitIntegrity(annulled, value => value.departures === index + 1, 'Departure ' + (index + 1));
      await syntheticReturn(annulPage);
    }
  }
  await annulPage.getByRole('heading', { name: 'Попытка аннулирована', exact: true }).waitFor();
  const server = await readAttempt(annulled);
  assert.equal(server.status, 'completed'); assert.equal(server.result.annulled, true); assert.equal(server.result.passed, false);
  await annulPage.getByRole('button', { name: 'К программе теста', exact: true }).click();
  await annulPage.locator('.inline-notice', { hasText: 'Повтор на этот грейд' }).waitFor();
  assert.equal(await annulPage.getByRole('button', { name: 'Начать тест', exact: true }).isDisabled(), true);
  const state = await (await context.request.get(base + '/api/platform/state')).json();
  assert.equal(state.state.history[0].annulled, true, 'The annulled attempt is part of the history');
  assert.equal(state.state.profile.confirmed, null, 'An annulled attempt never confirms a grade');

  assert.deepEqual(errors, []);
  assert.deepEqual(outbound, [], 'The browser scenario must remain entirely local');
  console.log('PASS Proctored sequential test: rules gate, blocked clipboard/shortcuts, warned departures, reload, full pass and annulment after three departures');
} finally {
  await context?.close();
  await browser?.close();
  await isolated.close();
}
