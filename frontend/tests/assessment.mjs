import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { answerKey, startExam } from './helpers/exam.mjs';
import { startIsolatedService } from './helpers/isolated-service.mjs';

// Registered candidate on a disposable service: vacancy-based attempt, private bank
// isolation, accessibility, restore after reload and a submit retry without a false failure.
const isolated = await startIsolatedService();
const { base, codes } = isolated;
const require = createRequire(import.meta.url);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const errors = [];
let injectedFailure = false;

async function audit(page) {
  await page.setViewportSize({ width: 320, height: 750 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Assessment overflows on mobile');
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const issues = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }))
    .violations.map(item => item.id));
  assert.deepEqual(issues, []);
  await page.setViewportSize({ width: 1440, height: 1000 });
}

try {
  const account = { role: 'candidate', login: 'assessment.flow', name: 'Проверка теста', email: 'assessment.flow@example.invalid',
    password: 'AssessmentFlow927!', consent: true, privacyVersion: PRIVACY_POLICY_VERSION };
  assert.equal((await context.request.post(base + '/api/auth/register/request-code', { data: account })).status(), 202);
  assert.equal((await context.request.post(base + '/api/auth/register/verify', { data: { email: account.email, code: codes.get(account.email) } })).status(), 201);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());
  page.on('console', message => {
    if (message.type() === 'error' && !(injectedFailure && message.text().includes('503'))) errors.push(message.text());
  });
  await page.goto(base + '/app?role=candidate&tab=onboarding');
  await page.locator('.onboarding-form [name="industry"]').selectOption('ИТ');
  await page.locator('.onboarding-form [name="professionalRole"]').fill('Frontend-разработчик');
  await page.locator('.onboarding-form [name="specialization"]').selectOption('Frontend');
  await page.locator('.onboarding-form [name="desiredGrade"]').selectOption('Middle');
  await page.locator('.onboarding-form [name="stack"]').fill('React, CSS');
  await page.locator('.onboarding-form [name="experience"]').fill('3 года');
  await page.getByLabel('Согласен на обработку персональных данных', { exact: true }).check();
  await page.getByRole('button', { name: 'К тесту', exact: true }).click();
  await page.getByRole('button', { name: 'Начать тест', exact: true }).waitFor();
  await page.locator('.main-content[data-sync-status="saved"]').waitFor();

  // A vacancy example steers the choice of items toward its skills.
  await page.locator('.vacancy-builder summary').click();
  await page.locator('.vacancy-examples button').last().click();
  assert.match(await page.getByLabel('Описание вакансии').inputValue(), /React/u);
  await page.screenshot({ path: resolve('test-results', 'assessment-vacancy.png'), fullPage: true });
  await audit(page);

  const attempt = await startExam(page);
  assert.equal(attempt.questions.length, 1, 'Questions are delivered one at a time');
  assert.equal(attempt.questionCount, 12);
  assert.ok(attempt.vacancy.matchedSkills.includes('React'));
  const payload = JSON.stringify(attempt);
  for (const forbidden of ['correctOptionId', 'familyId', 'variantId', '"correct"']) assert.ok(!payload.includes(forbidden), 'Private key leaked: ' + forbidden);
  assert.ok(!(await (await context.request.get(base + '/server/bank.mjs')).text()).includes('export const bankVersion'), 'SPA fallback never serves the bank');
  const bankPath = resolve('../server/bank.mjs').replaceAll('\\', '/');
  assert.ok([403, 404].includes((await context.request.get(base + '/@fs/' + bankPath)).status()), 'Private source is denied');

  // An answer is locked; after a reload the attempt resumes on the next question.
  const key = answerKey('Frontend', 'Middle');
  const answerCurrent = async () => {
    const text = (await page.locator('.question-text').textContent()).trim();
    const options = (await page.locator('.answer-option span').allTextContents()).map(item => item.trim());
    await page.locator('.answer-option').nth(Math.max(0, options.indexOf(key.get(text)))).click();
    return text;
  };
  const first = await answerCurrent();
  await page.getByRole('button', { name: 'Ответить', exact: true }).click();
  await page.locator('.exam-progress[aria-valuenow="2"]').waitFor();
  const second = (await page.locator('.question-text').textContent()).trim();
  assert.notEqual(second, first);
  await page.reload();
  await page.locator('.exam-progress[aria-valuenow="2"]').waitFor();
  // Leaving the page counts as a departure: the question stays hidden until the candidate returns.
  await page.getByText('Нарушение 1 из 3.').waitFor();
  await page.getByRole('button', { name: 'Вернуться к тесту' }).click();
  assert.equal((await page.locator('.question-text').textContent()).trim(), second, 'Reload restores the current question');
  assert.equal(await page.getByRole('button', { name: 'Назад' }).count(), 0, 'There is no way back to a locked answer');

  // The last answer is stored; a failed submit leaves a retry panel instead of a failed result.
  for (let index = 1; ; index++) {
    await page.locator(`.exam-progress[aria-valuenow="${index + 1}"]`).waitFor();
    const total = Number(await page.locator('.exam-progress').getAttribute('aria-valuemax'));
    await answerCurrent();
    if (index === total - 1) {
      injectedFailure = true;
      await page.route('**/api/assessment/attempts/*/submit', route => route.fulfill({ status: 503, contentType: 'application/json',
        body: JSON.stringify({ error: 'Сервис временно недоступен. Попробуйте снова.' }) }));
      await page.getByRole('button', { name: 'Завершить тест', exact: true }).click();
      break;
    }
    await page.getByRole('button', { name: 'Ответить', exact: true }).click();
  }
  await page.getByRole('heading', { name: 'Все ответы сохранены' }).waitFor();
  const history = await context.request.get(base + '/api/platform/state').then(response => response.json());
  assert.equal(history.state.history.length, 0, 'A transport failure never becomes a failed result');
  await page.unroute('**/api/assessment/attempts/*/submit');
  injectedFailure = false;
  await page.getByRole('button', { name: 'Получить результат', exact: true }).click();
  await page.getByRole('heading', { name: 'Грейд подтверждён', exact: true }).waitFor();
  assert.equal(await page.locator('.competency-results > div').count(), 3);
  await page.screenshot({ path: resolve('test-results', 'assessment-result.png'), fullPage: true });
  await audit(page);
  assert.deepEqual(errors, []);
  console.log('PASS Vacancy-based attempt, private bank isolation, locked answers with resume, submit retry and accessible screens');
} finally {
  await context.close(); await browser.close(); await isolated.close();
}
