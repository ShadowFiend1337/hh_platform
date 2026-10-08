import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { programs } from '../../server/bank.mjs';
import { startIsolatedService } from './helpers/isolated-service.mjs';

// The candidate, questions and grading use the real local API. Registration mail
// and the database remain in memory; the browser cannot access external hosts.
const isolated = await startIsolatedService();
const { base, codes } = isolated;
const require = createRequire(import.meta.url);
const storageKey = 'predel:assessment:v1';
const screenshots = fileURLToPath(new URL('../../server/data/code-editor-ui/', import.meta.url));
const answerKeys = new Map(programs.ML.Junior.families.flatMap(family =>
  family.variants.map(variant => [variant.text, variant.options[variant.correct]])));
const errors = [];
const outbound = [];
const submissions = [];
let browser;
let context;
let page;

function editor() {
  return page.locator('.cm-content[contenteditable="true"][role="textbox"][aria-label="Черновик кода"]');
}

async function editorSource() {
  return editor().evaluate(element => [...element.querySelectorAll('.cm-line')].map(line => {
    const text = line.cloneNode(true);
    text.querySelectorAll('.cm-placeholder').forEach(placeholder => placeholder.remove());
    return text.textContent;
  }).join('\n'));
}

async function replaceSource(source) {
  await editor().focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText(source);
  await page.waitForFunction(expected => {
    const lines = [...document.querySelectorAll('.cm-content .cm-line')].map(line => line.textContent);
    return lines.join('\n') === expected;
  }, source);
}

async function waitDraft(questionId, source, language) {
  try {
    await page.waitForFunction(({ storageKey, questionId, source, language }) => {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      const draft = saved?.codeDrafts?.[questionId];
      return draft?.source === source && draft?.language === language;
    }, { storageKey, questionId, source, language });
  } catch (error) {
    const actual = await page.evaluate(({ storageKey, questionId }) => ({
      draft: JSON.parse(sessionStorage.getItem(storageKey) || 'null')?.codeDrafts?.[questionId],
      source: [...document.querySelectorAll('.cm-content .cm-line')].map(line => line.textContent).join('\n'),
      focus: document.activeElement?.className,
      shortcuts: window.__codeEditorDebugKeyboard,
    }), { storageKey, questionId });
    throw new Error('Expected saved draft ' + JSON.stringify({ questionId, source, language })
      + ', actual ' + JSON.stringify(actual), { cause: error });
  }
}

async function readAttempt(attempt) {
  const response = await context.request.get(base + '/api/assessment/attempts/' + attempt.id,
    { headers: { 'X-Attempt-Token': attempt.token } });
  assert.equal(response.status(), 200, await response.text());
  return response.json();
}

async function answerCurrent() {
  const expected = answerKeys.get(await page.locator('.question-text').textContent());
  assert.ok(expected, 'The real ML question belongs to the private fixture bank');
  const options = await page.locator('.answer-option span').allTextContents();
  const index = options.findIndex(text => text.trim() === expected);
  assert.ok(index >= 0);
  await page.locator('.answer-option').nth(index).getByRole('radio').check();
}

async function restoredEditor() {
  // Reload can leave the existing question guard paused. Resume through its
  // ordinary UI; never inject an attempt or bypass ownership/token checks.
  await page.waitForFunction(() => document.querySelector('.cm-content') || document.querySelector('.exam-focus-cover'));
  if (await page.locator('.exam-focus-cover').count()) {
    await page.getByRole('button', { name: 'Продолжить тест', exact: true }).click();
  }
  await editor().waitFor();
}

async function auditMobile() {
  await page.setViewportSize({ width: 320, height: 750 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true,
    'A long code line must not expand the mobile page horizontally');
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const issues = await page.evaluate(async () => (await window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
  })).violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })));
  assert.deepEqual(issues, [], 'The active assessment and code editor have no automated accessibility violations');
  await page.screenshot({ path: screenshots + '/ml-editor-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
}

try {
  await mkdir(screenshots, { recursive: true });
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce',
    permissions: ['clipboard-read', 'clipboard-write'] });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.hostname !== '127.0.0.1') {
      outbound.push(url.origin);
      await route.abort();
    } else await route.continue();
  });
  const account = { role: 'candidate', login: 'code.editor.ml', name: 'Проверка редактора ML',
    email: 'code.editor.ml@example.invalid', password: 'FixtureCode927!', consent: true, privacyVersion: PRIVACY_POLICY_VERSION };
  const requested = await context.request.post(base + '/api/auth/register/request-code', { data: account });
  assert.equal(requested.status(), 202, await requested.text());
  assert.equal((await requested.json()).delivery, 'development');
  const code = codes.get(account.email);
  assert.match(code, /^\d{6}$/u);
  const verified = await context.request.post(base + '/api/auth/register/verify', { data: { email: account.email, code } });
  assert.equal(verified.status(), 201, await verified.text());

  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());
  page.on('request', request => {
    if (/\/api\/assessment\/attempts\/[^/]+\/submit$/u.test(new URL(request.url()).pathname)) {
      submissions.push(request.postDataJSON());
    }
  });
  await page.goto(base + '/app?role=candidate&tab=onboarding');
  await page.getByRole('heading', { name: 'Анкета', exact: true }).waitFor();
  await page.locator('.onboarding-form [name="industry"]').selectOption('ИТ');
  await page.locator('.onboarding-form [name="professionalRole"]').fill('ML-инженер');
  await page.locator('.onboarding-form [name="specialization"]').selectOption('ML');
  await page.locator('.onboarding-form [name="desiredGrade"]').selectOption('Junior');
  await page.locator('.onboarding-form [name="stack"]').fill('Python, PyTorch');
  await page.locator('.onboarding-form [name="experience"]').fill('1 год');
  await page.getByLabel('Согласен на обработку персональных данных', { exact: true }).check();
  await page.getByRole('button', { name: 'К тесту', exact: true }).click();
  await page.locator('.main-content[data-sync-status="saved"]').waitFor();
  const started = page.waitForResponse(response => new URL(response.url()).pathname === '/api/assessment/attempts'
    && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Начать тест', exact: true }).click();
  const response = await started;
  assert.equal(response.status(), 201, await response.text());
  const attempt = await response.json();
  assert.equal(attempt.specialization, 'ML');
  assert.ok(attempt.id && attempt.token && attempt.questions.length > 1);
  const firstId = attempt.questions[0].id;
  const secondId = attempt.questions[1].id;
  await editor().waitFor();
  const panel = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Черновик кода' }) });
  assert.notEqual(await panel.getAttribute('open'), null, 'ML opens its code draft by default');
  assert.equal(await editor().evaluate(element => element.closest('.exam-protected-content') === null), true,
    'Owned code is outside the protected question and answer choices');
  assert.deepEqual(await page.getByLabel('Язык кода', { exact: true }).evaluate(select =>
    [...select.options].map(option => option.value)), ['python', 'javascript', 'typescript', 'sql', 'text']);
  assert.equal(await page.getByLabel('Язык кода', { exact: true }).inputValue(), 'python');

  const firstSource = 'def twice(value):\n    return value * 2';
  const indented = '    def twice(value):\n        return value * 2';
  await replaceSource(firstSource);
  await waitDraft(firstId, firstSource, 'python');
  await page.evaluate(() => {
    window.__codeEditorDebugKeyboard = [];
    document.addEventListener('keydown', event => {
      queueMicrotask(() => window.__codeEditorDebugKeyboard.push({ key: event.key, code: event.code,
        ctrl: event.ctrlKey, shift: event.shiftKey, prevented: event.defaultPrevented }));
    });
  });
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Tab');
  await waitDraft(firstId, indented, 'python');
  assert.equal(await editorSource(), indented, 'Tab indents the selected Python lines by four spaces');
  await page.keyboard.press('Control+z');
  await waitDraft(firstId, firstSource, 'python');
  // Playwright requires an uppercase Z to emit the real shifted character.
  // Lowercase z with shift=true can match CodeMirror's unshifted undo binding.
  await page.keyboard.press('Control+Shift+Z');
  await waitDraft(firstId, indented, 'python');
  await page.keyboard.press('Shift+Tab');
  await waitDraft(firstId, firstSource, 'python');

  const beforeOwnedClipboard = (await readAttempt(attempt)).integrity.blockedCopies;
  await editor().focus();
  await page.keyboard.press('Control+a');
  assert.match(await page.evaluate(() => window.getSelection()?.toString() || ''), /return value \* 2/u,
    'The candidate can select their own code');
  await page.keyboard.press('Control+c');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), firstSource,
    'The real clipboard receives the selected owned code');
  await page.keyboard.press('Control+x');
  await waitDraft(firstId, '', 'python');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), firstSource);
  await page.keyboard.press('Control+z');
  await waitDraft(firstId, firstSource, 'python');
  assert.equal((await readAttempt(attempt)).integrity.blockedCopies, beforeOwnedClipboard,
    'Copy and cut of owned code do not create protected-question copy events');

  await page.evaluate(() => {
    window.__codeQuestionCopies = [];
    document.addEventListener('keydown', event => {
      if (event.ctrlKey && event.key.toLowerCase() === 'c') {
        queueMicrotask(() => window.__codeQuestionCopies.push(event.defaultPrevented));
      }
    });
  });
  const blocked = page.waitForResponse(response => /\/api\/assessment\/attempts\/[^/]+\/integrity$/u.test(new URL(response.url()).pathname)
    && response.request().method() === 'POST');
  await page.locator('.answer-option input').first().focus();
  await page.keyboard.press('Control+c');
  assert.deepEqual(await page.evaluate(() => window.__codeQuestionCopies), [true],
    'The real copy shortcut remains cancelled inside the question choices');
  assert.equal((await blocked).status(), 200);
  assert.ok((await readAttempt(attempt)).integrity.blockedCopies > beforeOwnedClipboard);

  await editor().focus();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  const escapedFocus = await page.evaluate(() => ({ inside: Boolean(document.activeElement?.closest('.cm-editor')),
    tag: document.activeElement?.tagName, className: document.activeElement?.className,
    shortcuts: window.__codeEditorDebugKeyboard.slice(-3) }));
  assert.equal(escapedFocus.inside, false,
    'Escape followed by Tab exits the code editor using the keyboard: ' + JSON.stringify(escapedFocus));
  assert.equal(await page.getByRole('button', { name: 'Далее', exact: true }).isEnabled(), false,
    'A code draft cannot replace the required multiple-choice answer');
  await page.getByLabel('Язык кода', { exact: true }).selectOption('typescript');
  await waitDraft(firstId, firstSource, 'typescript');
  assert.equal(await editorSource(), firstSource, 'Changing syntax highlighting preserves the code');
  await answerCurrent();
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  await page.locator('.exam-progress[aria-valuenow="2"]').waitFor();
  assert.equal(await editorSource(), '', 'A new question starts with its own empty code draft');
  assert.equal(await page.getByLabel('Язык кода', { exact: true }).inputValue(), 'python');

  const secondSource = "SELECT '" + 'row_'.repeat(75) + "' AS example\nFROM events;";
  await page.getByLabel('Язык кода', { exact: true }).selectOption('sql');
  await replaceSource(secondSource);
  await waitDraft(secondId, secondSource, 'sql');
  await answerCurrent();
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await page.locator('.exam-progress[aria-valuenow="1"]').waitFor();
  assert.equal(await editorSource(), firstSource);
  assert.equal(await page.getByLabel('Язык кода', { exact: true }).inputValue(), 'typescript');
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  await page.locator('.exam-progress[aria-valuenow="2"]').waitFor();
  assert.equal(await editorSource(), secondSource);
  await page.reload();
  await restoredEditor();
  assert.equal(await page.locator('.exam-progress').getAttribute('aria-valuenow'), '2');
  assert.equal(await editorSource(), secondSource, 'Reload restores the code for the current question');
  assert.equal(await page.getByLabel('Язык кода', { exact: true }).inputValue(), 'sql');
  const resumed = await readAttempt(attempt);
  assert.equal(resumed.id, attempt.id);
  assert.equal(resumed.status, 'active');
  await waitDraft(firstId, firstSource, 'typescript');
  await waitDraft(secondId, secondSource, 'sql');

  // Simulate a real Storage write failure, rather than reporting success from a
  // stubbed save helper. Only this assessment key is affected.
  await page.evaluate(storageKey => {
    window.__codeStorageSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === storageKey) throw new DOMException('Fixture storage quota', 'QuotaExceededError');
      return window.__codeStorageSetItem.call(this, key, value);
    };
  }, storageKey);
  const unsavedSource = secondSource + '\n-- available in memory';
  await replaceSource(unsavedSource);
  await page.getByText('Черновик не сохранён. Оставьте вкладку открытой.', { exact: true }).waitFor();
  assert.equal(await editorSource(), unsavedSource, 'A storage failure leaves the code usable in memory');
  assert.equal(await page.evaluate(({ storageKey, secondId }) =>
    JSON.parse(sessionStorage.getItem(storageKey)).codeDrafts[secondId].source, { storageKey, secondId }), secondSource,
  'The last durable draft is not falsely replaced after storage rejects the write');
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  assert.equal(await editorSource(), unsavedSource, 'In-memory drafts survive question navigation when storage is unavailable');
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__codeStorageSetItem;
    delete window.__codeStorageSetItem;
  });
  await replaceSource(secondSource);
  await waitDraft(secondId, secondSource, 'sql');
  await page.getByText('Черновик не сохранён. Оставьте вкладку открытой.', { exact: true }).waitFor({ state: 'hidden' });

  await page.evaluate(value => navigator.clipboard.writeText(value), 'x'.repeat(12001));
  await editor().focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+v');
  await page.getByRole('alert').filter({ hasText: 'Не удалось вставить код: максимум 12000 символов.' }).waitFor();
  assert.equal(await editorSource(), secondSource, 'An oversized paste is rejected without truncating or losing the existing code');
  await waitDraft(secondId, secondSource, 'sql');
  await auditMobile();

  for (let index = 1; index < attempt.questions.length; index++) {
    await page.locator(`.exam-progress[aria-valuenow="${index + 1}"]`).waitFor();
    await answerCurrent();
    if (index < attempt.questions.length - 1) await page.getByRole('button', { name: 'Далее', exact: true }).click();
  }
  const lastId = attempt.questions.at(-1).id;
  const lastSource = '# A bounded ML inference draft\nwith torch.no_grad():\n    outputs = model(batch.to(device))';
  await replaceSource(lastSource);
  await waitDraft(lastId, lastSource, 'python');
  await page.screenshot({ path: screenshots + '/ml-editor-desktop.png', fullPage: true });
  let injectedFailure = false;
  await page.route('**/api/assessment/attempts/*/submit', async route => {
    if (!injectedFailure) {
      injectedFailure = true;
      await route.fulfill({ status: 503, contentType: 'application/json',
        body: JSON.stringify({ error: 'Сервис временно недоступен. Попробуйте снова.' }) });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Завершить тест', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Сервис временно недоступен. Попробуйте снова.' }).waitFor();
  assert.equal(await editorSource(), lastSource, 'A transient submission failure retains the code editor and its text');
  await waitDraft(firstId, firstSource, 'typescript');
  await waitDraft(secondId, secondSource, 'sql');
  await waitDraft(lastId, lastSource, 'python');
  assert.equal(await page.locator('.answer-option input:checked').count(), 1);
  const failedSubmit = await readAttempt(attempt);
  assert.equal(failedSubmit.status, 'active');
  assert.equal(failedSubmit.result, undefined, 'A transport failure cannot become a failed assessment result');

  await page.getByRole('button', { name: 'Завершить тест', exact: true }).click();
  await page.getByRole('heading', { name: 'Грейд подтверждён', exact: true }).waitFor();
  assert.equal(submissions.length, 2);
  for (const submission of submissions) {
    assert.deepEqual(Object.keys(submission).sort(), ['answers', 'token'], 'Code drafts stay local and are not submitted');
    assert.equal(submission.token, attempt.token);
    assert.equal(submission.answers.length, attempt.questions.length);
    for (const answer of submission.answers) {
      assert.deepEqual(Object.keys(answer).sort(), ['optionId', 'questionId']);
      const question = attempt.questions.find(question => question.id === answer.questionId);
      assert.ok(question?.options.some(option => option.id === answer.optionId));
    }
  }
  const completed = await readAttempt(attempt);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.result.score, 100, 'The existing multiple-choice grading remains unchanged by owned code or blocked copies');
  assert.equal(await page.evaluate(storageKey => sessionStorage.getItem(storageKey), storageKey), null,
    'A successful result clears the saved attempt and all code drafts');
  assert.equal(await page.locator('.cm-editor').count(), 0);

  // An optional lazy editor chunk can fail to load while the real assessment
  // remains usable. A new page has a fresh module graph and its own storage.
  await page.locator('.main-content[data-sync-status="saved"]').waitFor();
  const failedPage = await context.newPage();
  failedPage.setDefaultTimeout(15000);
  const failedPageErrors = [];
  let failedModules = 0;
  failedPage.on('pageerror', error => failedPageErrors.push(error.message));
  failedPage.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());
  await failedPage.route('**/src/components/CodeEditor.tsx*', async route => {
    failedModules++;
    await route.abort('failed');
  });
  await failedPage.goto(base + '/app?role=candidate&tab=assessment');
  await failedPage.getByRole('button', { name: 'Начать тест', exact: true }).waitFor();
  const failedPageStarted = failedPage.waitForResponse(response => new URL(response.url()).pathname === '/api/assessment/attempts'
    && response.request().method() === 'POST');
  await failedPage.getByRole('button', { name: 'Начать тест', exact: true }).click();
  const failedPageResponse = await failedPageStarted;
  assert.equal(failedPageResponse.status(), 201, await failedPageResponse.text());
  const fallbackAttempt = await failedPageResponse.json();
  assert.equal(fallbackAttempt.specialization, 'ML');
  assert.notEqual(fallbackAttempt.id, attempt.id);
  await failedPage.getByText('Редактор недоступен. Можно продолжить тест с вариантами ответа.', { exact: true }).waitFor();
  assert.ok(failedModules > 0, 'The fallback comes from a real failed CodeEditor module request');
  assert.equal(await failedPage.locator('.cm-editor').count(), 0);
  assert.equal(await failedPage.locator('.exam-protected-content .question-text').count(), 1,
    'A failed optional editor does not unmount the question or choices');
  assert.equal(await failedPage.getByRole('button', { name: 'Далее', exact: true }).isEnabled(), false);
  await failedPage.locator('.answer-option').first().getByRole('radio').check();
  await failedPage.getByRole('button', { name: 'Далее', exact: true }).click();
  await failedPage.locator('.exam-progress[aria-valuenow="2"]').waitFor();
  assert.equal(await failedPage.locator('.answer-option input').count(), fallbackAttempt.questions[1].options.length);
  const fallbackSaved = await failedPage.evaluate(storageKey => JSON.parse(sessionStorage.getItem(storageKey)), storageKey);
  assert.equal(fallbackSaved.id, fallbackAttempt.id);
  assert.equal(fallbackSaved.index, 1);
  assert.ok(fallbackSaved.answers[fallbackAttempt.questions[0].id],
    'The ordinary saved assessment continues to retain selected answers during module failure');
  const fallbackServerAttempt = await readAttempt(fallbackAttempt);
  assert.equal(fallbackServerAttempt.status, 'active');
  assert.ok(failedPageErrors.every(message => /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/iu.test(message)),
    'Only the deliberately failed lazy module may report an error on the fallback page');
  await failedPage.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(outbound, [], 'The regression scenario stays entirely local');
  console.log('PASS Owned ML code: indentation, undo/redo, clipboard and keyboard exit; question copies remain blocked');
  console.log('PASS Independent language/source drafts, reload, storage failure, oversized paste, mobile accessibility and option-only submit/retry cleanup');
  console.log('PASS A real failed optional editor module leaves questions, answers, navigation and the owned attempt usable');
  console.log('Screenshots: server/data/code-editor-ui/ml-editor-desktop.png and ml-editor-mobile.png');
} finally {
  await context?.close();
  await browser?.close();
  await isolated.close();
}
