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
const requests = [];
const outbound = [];
const isIntegrity = request => /\/api\/assessment\/attempts\/[^/]+\/integrity$/u.test(new URL(request.url()).pathname);
const account = { role: 'candidate', login: 'guard.candidate', name: 'Проверка тестирования',
  email: 'guard.candidate@example.invalid', password: 'FixtureGuard927!', consent: true, privacyVersion: PRIVACY_POLICY_VERSION };
const keys = new Map(programs.Frontend.Junior.families.flatMap(family =>
  family.variants.map(variant => [variant.text, variant.options[variant.correct]])));

async function registeredPage(fixtureAccount = account) {
  const requested = await context.request.post(base + '/api/auth/register/request-code', { data: fixtureAccount });
  assert.equal(requested.status(), 202, await requested.text());
  assert.equal((await requested.json()).delivery, 'development');
  const code = codes.get(fixtureAccount.email);
  assert.match(code, /^\d{6}$/u);
  const verified = await context.request.post(base + '/api/auth/register/verify', { data: { email: fixtureAccount.email, code } });
  assert.equal(verified.status(), 201, await verified.text());
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/assessment/')) requests.push(request);
  });
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
  const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/assessment/attempts'
    && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Начать тест', exact: true }).click();
  const actual = await response;
  assert.equal(actual.status(), 201, await actual.text());
  const attempt = await actual.json();
  assert.ok(attempt.id && attempt.token && attempt.questions.length);
  await page.locator('.exam-protected-content .question-text').waitFor();
  return attempt;
}

async function eventAllowed(page, selector, type, options = {}) {
  if (!selector.startsWith('.question-text')) {
    // Clipboard/key events follow the current selection/focus in real browsers.
    // Move those outside the protected content before testing an outside action.
    await page.locator(selector).click();
    await page.locator(selector).evaluate(element => {
      window.getSelection()?.removeAllRanges();
      element.setAttribute('tabindex', '-1');
      element.focus();
    });
  }
  return page.locator(selector).evaluate((element, { type, options }) => {
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
  await page.locator('.exam-focus-cover').waitFor();
  await page.getByRole('heading', { name: 'Вернитесь к тесту', exact: true }).waitFor();
  assert.equal(await page.locator('.question-text,.answer-options').count(), 0,
    'A lost-focus question and answer choices must be removed from the DOM, rather than covered visually');
  assert.equal(await page.getByRole('button', { name: 'Далее', exact: true }).count(), 0);
}

async function syntheticLoss(page) {
  // Browser automation cannot consistently make a headless document hidden.
  // Synthetic events verify the repeatable event-handling contract separately
  // from the physical second-page foreground probe below.
  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await covered(page);
}

async function syntheticReturn(page) {
  await page.evaluate(() => {
    delete document.hidden;
    delete document.visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await covered(page);
  await page.getByRole('button', { name: 'Продолжить тест', exact: true }).click();
  await questionVisible(page);
}

async function answerCurrentByKeyboard(page) {
  const expected = keys.get(await page.locator('.question-text').textContent());
  assert.ok(expected, 'The server question belongs to the private fixture bank');
  const options = page.locator('.answer-option');
  const index = (await options.locator('span').allTextContents()).findIndex(text => text.trim() === expected);
  assert.ok(index >= 0);
  const radio = options.nth(index).getByRole('radio');
  await radio.focus();
  await page.keyboard.press('Space');
  assert.equal(await radio.isChecked(), true, 'Native keyboard answer selection remains available');
}

async function readAttempt(attempt) {
  const response = await context.request.get(base + '/api/assessment/attempts/' + attempt.id,
    { headers: { 'X-Attempt-Token': attempt.token } });
  assert.equal(response.status(), 200, await response.text());
  const actual = await response.json();
  assert.equal(actual.id, attempt.id);
  assert.ok(actual.integrity, 'The authorized attempt response includes durable integrity metadata');
  return actual;
}

async function waitIntegrity(attempt, condition, description) {
  let actual;
  for (let index = 0; index < 20; index++) {
    actual = await readAttempt(attempt);
    if (condition(actual.integrity)) return actual.integrity;
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
  assert.equal(await eventAllowed(page, '.page-heading h1', 'copy'), true,
    'Copying outside the active question must remain available');
  const attempt = await start(page);
  assert.deepEqual(attempt.integrity, { departures: 0, blockedCopies: 0, lastEventAt: null });
  const firstQuestion = await page.locator('.question-text').textContent();

  for (const selector of ['.question-text', '.answer-option span']) {
    assert.equal(await page.locator(selector).first().evaluate(element => getComputedStyle(element).userSelect), 'none');
  }
  assert.notEqual(await page.locator('.page-heading h1').evaluate(element => getComputedStyle(element).userSelect), 'none',
    'The rest of the page retains ordinary text selection');
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  const questionBox = await page.locator('.question-text').boundingBox();
  assert.ok(questionBox);
  await page.mouse.move(questionBox.x + 3, questionBox.y + questionBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(questionBox.x + Math.min(questionBox.width - 3, 240),
    questionBox.y + questionBox.height / 2, { steps: 10 });
  await page.mouse.up();
  assert.equal(await page.evaluate(() => window.getSelection()?.toString() || ''), '',
    'A real pointer drag cannot select the question text');
  for (const type of ['copy', 'cut', 'contextmenu', 'dragstart', 'selectstart']) {
    assert.equal(await eventAllowed(page, '.question-text', type), false,
      `The question area blocks the default ${type} action`);
    assert.equal(await eventAllowed(page, '.page-heading h1', type), true,
      `The ${type} restriction is scoped to questions and choices`);
  }
  for (const options of [{ key: 'c', ctrlKey: true }, { key: 'c', metaKey: true }, { key: 'x', ctrlKey: true }]) {
    assert.equal(await eventAllowed(page, '.question-text', 'keydown', options), false);
    assert.equal(await eventAllowed(page, '.page-heading h1', 'keydown', options), true);
  }
  assert.equal(await eventAllowed(page, '.question-text', 'keydown', { key: 'Tab' }), true);
  assert.equal(await eventAllowed(page, '.question-text', 'keydown', { key: 'ArrowDown' }), true);
  await page.evaluate(() => {
    window.__guardKeyboardCopies = [];
    document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        queueMicrotask(() => window.__guardKeyboardCopies.push(event.defaultPrevented));
      }
    });
  });
  await page.locator('.answer-option input').first().focus();
  await page.keyboard.press('Control+c');
  assert.deepEqual(await page.evaluate(() => window.__guardKeyboardCopies), [true],
    'The real browser keyboard copy shortcut is cancelled inside an answer choice');
  await waitIntegrity(attempt, value => value.blockedCopies > 0,
    'A blocked copy action is persisted by the real attempt API');

  const profileLink = page.locator('.main-nav').getByRole('link', { name: 'Профиль', exact: true });
  assert.equal(await profileLink.getAttribute('aria-disabled'), 'true');
  await profileLink.evaluate(element => element.click());
  await page.locator('.brand').click();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await questionVisible(page);
  assert.equal(new URL(page.url()).searchParams.get('tab'), 'assessment',
    'Cabinet navigation, home and logout cannot silently abandon an active attempt');
  assert.equal((await context.request.get(base + '/api/auth/me')).status(), 200,
    'Blocked logout preserves the authenticated session');
  await page.goBack();
  await page.waitForURL(url => url.pathname === '/app' && url.searchParams.get('tab') === 'assessment');
  await questionVisible(page);
  assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('predel:assessment:v1')).id), attempt.id,
    'Browser back navigation retains the active attempt');

  await answerCurrentByKeyboard(page);
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  await page.locator('.exam-progress[aria-valuenow="2"]').waitFor();
  const secondQuestion = await page.locator('.question-text').textContent();
  assert.notEqual(secondQuestion, firstQuestion);

  await syntheticLoss(page);
  const firstLoss = await waitIntegrity(attempt, value => value.departures === 1,
    'Blur and hidden from one interruption must produce one durable departure');
  await page.evaluate(() => {
    delete document.hidden;
    delete document.visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await covered(page);
  await auditAccessibility(page, 'Paused assessment');
  await syntheticReturn(page);
  assert.equal((await readAttempt(attempt)).integrity.departures, firstLoss.departures,
    'Returning to an existing interruption does not create another departure');
  assert.equal(await page.locator('.question-text').textContent(), secondQuestion);
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  assert.equal(await page.locator('.question-text').textContent(), firstQuestion);
  assert.equal(await page.locator('.answer-option input:checked').count(), 1,
    'A focus interruption preserves the answer already selected');

  await syntheticLoss(page);
  const beforeReload = await waitIntegrity(attempt, value => value.departures === 2,
    'A separate interruption creates a separate departure');
  // Reload the real page, preserving its authenticated cookie and sessionStorage.
  // The unload confirmation is accepted above; no private snapshot is injected.
  await page.reload();
  await covered(page);
  const restored = await readAttempt(attempt);
  assert.equal(restored.status, 'active');
  assert.ok(restored.integrity.departures >= beforeReload.departures,
    'Reloading cannot erase recorded focus interruptions');
  assert.ok(restored.integrity.blockedCopies >= beforeReload.blockedCopies,
    'Reloading cannot erase recorded copy actions');
  await page.getByRole('button', { name: 'Продолжить тест', exact: true }).click();
  await questionVisible(page);
  assert.equal(await page.locator('.question-text').textContent(), firstQuestion);
  assert.equal(await page.locator('.answer-option input:checked').count(), 1,
    'Reloading a paused attempt retains its existing answers and current question');

  // Probe an actual second browser page separately. Some headless Chromium
  // builds keep both pages visible; that limitation must not be called a pass.
  await page.evaluate(() => {
    window.__guardForegroundProbe = [];
    window.addEventListener('blur', () => window.__guardForegroundProbe.push('blur'), { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) window.__guardForegroundProbe.push('hidden');
    }, { once: true });
  });
  const otherPage = await context.newPage();
  await otherPage.goto('about:blank');
  await otherPage.bringToFront();
  await page.waitForTimeout(150);
  const foregroundEvents = await page.evaluate(() => window.__guardForegroundProbe);
  await page.bringToFront();
  if (foregroundEvents.length) {
    await covered(page);
    await page.getByRole('button', { name: 'Продолжить тест', exact: true }).click();
    await questionVisible(page);
    console.log('PASS Actual second-page foreground produces a guarded interruption');
  } else {
    console.log('LIMITATION Headless Chromium emitted no blur/hidden when foregrounding another page; repeated focus handling was tested with synthetic DOM events');
  }
  await otherPage.close();

  for (let index = 0; index < attempt.questions.length; index++) {
    await page.locator(`.exam-progress[aria-valuenow="${index + 1}"]`).waitFor();
    await answerCurrentByKeyboard(page);
    await page.getByRole('button', { name: index === attempt.questions.length - 1 ? 'Завершить тест' : 'Далее', exact: true }).click();
  }
  await page.getByRole('heading', { name: 'Грейд подтверждён', exact: true }).waitFor();
  const completed = await readAttempt(attempt);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.result.score, 100,
    'Recorded interruptions and copy actions are signals, not an automatic grade penalty');
  assert.ok(completed.integrity.departures >= beforeReload.departures);
  assert.ok(completed.integrity.blockedCopies > 0);
  assert.equal(await page.locator('.exam-protected-content,.exam-focus-cover').count(), 0);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('predel:assessment:v1')), null);
  assert.equal(await page.evaluate(id => sessionStorage.getItem('predel:assessment:guard:' + id), attempt.id), null,
    'Completion clears the attempt interruption marker');
  assert.equal(await eventAllowed(page, '.assessment-result h2', 'copy'), true);
  assert.equal(await eventAllowed(page, '.assessment-result h2', 'contextmenu'), true);
  assert.equal(await eventAllowed(page, '.assessment-result h2', 'keydown', { key: 'c', ctrlKey: true }), true);
  const completedRequestCount = requests.filter(isIntegrity).length;
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await page.waitForTimeout(250);
  assert.equal(await page.locator('.exam-focus-cover').count(), 0,
    'A finished attempt has no active question guard');
  assert.equal(requests.filter(isIntegrity).length, completedRequestCount,
    'A finished attempt no longer emits guard audit requests');
  assert.equal(await profileLink.getAttribute('aria-disabled'), null);
  await page.getByRole('button', { name: 'К профилю', exact: true }).click();
  await page.getByRole('heading', { name: 'Мой профиль', exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('tab'), 'profile',
    'Completing the attempt releases ordinary cabinet navigation');

  // A separate registered fixture verifies only the UI deadline reaction. The
  // response expiresAt is shortened; the real server clock/deadline is unchanged.
  // Server expiry/authorization are covered by assessment-integrity.test.mjs.
  await context.close();
  context = await localContext();
  const deadlinePage = await registeredPage({ ...account, login: 'guard.deadline',
    email: 'guard.deadline@example.invalid', name: 'Проверка срока теста' });
  // Only the browser wall clock is wrong. performance.now() keeps progressing
  // normally, and the real API clock/grade/deadline are never overridden.
  await deadlinePage.clock.setFixedTime(new Date(Date.now() + 7 * 86400000));
  await deadlinePage.route('**/api/assessment/attempts', async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    const response = await route.fetch();
    assert.equal(response.status(), 201);
    const actual = await response.json();
    await route.fulfill({ response, json: { ...actual, expiresAt: new Date(Date.now() + 4000).toISOString() } });
  });
  const deadlineAttempt = await start(deadlinePage);
  assert.ok(Date.parse(deadlineAttempt.serverNow) < await deadlinePage.evaluate(() => Date.now()),
    'The browser wall clock is ahead of the real server clock');
  await syntheticLoss(deadlinePage);
  await deadlinePage.waitForTimeout(1000);
  await covered(deadlinePage);
  assert.equal(await deadlinePage.evaluate(() => JSON.parse(sessionStorage.getItem('predel:assessment:v1')).id), deadlineAttempt.id,
    'A wrong browser wall clock must not erase the attempt before its monotonic UI deadline');
  await deadlinePage.getByRole('alert').filter({ hasText: 'Время теста истекло. Начните новую попытку.' }).waitFor();
  assert.equal(await deadlinePage.locator('.question-text,.answer-options,.exam-focus-cover,.assessment-result').count(), 0,
    'UI deadline removes the protected question/cover without creating a failed test result');
  assert.equal(await deadlinePage.evaluate(() => sessionStorage.getItem('predel:assessment:v1')), null);
  assert.equal(await deadlinePage.evaluate(id => sessionStorage.getItem('predel:assessment:guard:' + id), deadlineAttempt.id), null);
  const serverAttempt = await readAttempt(deadlineAttempt);
  assert.equal(serverAttempt.status, 'active', 'This fixture simulates a UI deadline, not server expiration');
  assert.equal(serverAttempt.result, undefined);
  assert.ok(Date.parse(serverAttempt.expiresAt) > Date.parse(deadlineAttempt.expiresAt));
  const stateResponse = await context.request.get(base + '/api/platform/state');
  assert.equal(stateResponse.status(), 200);
  assert.deepEqual((await stateResponse.json()).state.history, [], 'UI timeout does not manufacture a failed history record');
  await deadlinePage.evaluate(() => {
    delete document.hidden;
    delete document.visibilityState;
    window.dispatchEvent(new Event('focus'));
  });
  const invitationsLink = deadlinePage.locator('.main-nav').getByRole('link', { name: /^Приглашения/u });
  assert.equal(await invitationsLink.getAttribute('aria-disabled'), null);
  await invitationsLink.click();
  await deadlinePage.waitForURL(url => url.pathname === '/app' && url.searchParams.get('tab') === 'invitations');
  await deadlinePage.getByRole('button', { name: 'Выйти', exact: true }).click();
  await deadlinePage.waitForURL(url => url.pathname === '/');
  assert.equal((await context.request.get(base + '/api/auth/me')).status(), 401,
    'A UI-expired attempt releases logout and navigation');
  assert.deepEqual(errors, []);
  assert.deepEqual(outbound, [], 'The browser scenario must remain entirely local');
  console.log('PASS Automated accessibility on setup/paused screens and monotonic UI deadline cleanup despite a wrong browser wall clock; expiresAt is mocked and real server expiry is tested separately');
  console.log('PASS Scoped question copy restrictions, keyboard answers, explicit focus return and guard cleanup; synthetic events used for repeatable loss handling');
} finally {
  await context?.close();
  await browser?.close();
  await isolated.close();
}
