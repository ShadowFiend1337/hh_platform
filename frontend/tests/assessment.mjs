import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { programs } from '../../server/bank.mjs';

const base = process.env.PREDEL_URL || 'http://127.0.0.1:5173';
const key = 'predel:platform:v2';
const require = createRequire(import.meta.url);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
let injectedFailure = false;
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && !(injectedFailure && message.text().includes('503'))) errors.push(message.text());
});
async function mobileAudit() {
  await page.setViewportSize({ width: 320, height: 750 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Assessment overflows on mobile');
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const issues = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => item.id));
  assert.deepEqual(issues, []);
}
async function waitForSaved(target = page) {
  await target.waitForFunction(() => ['saved', 'error'].includes(document.querySelector('.main-content')?.getAttribute('data-sync-status')));
  assert.equal(await target.locator('.main-content').getAttribute('data-sync-status'), 'saved', 'Server persistence failed');
}
try {
  await page.goto(base + '/app?role=employer');
  await waitForSaved();
  await page.evaluate(async storageKey => {
    const state = JSON.parse(localStorage.getItem(storageKey));
    const survey = { id: crypto.randomUUID(), date: new Date().toISOString(), industry: 'ИТ', professionalRole: 'Разработчик', specialization: 'Frontend', desiredGrade: 'Middle', stack: ['React'], experience: '3 года', softSkills: ['Коммуникация'] };
    state.profile = { ...state.profile, ...survey, id: state.profile.id, name: 'Проверка теста', email: 'test@example.com', consent: true, surveyCompletedAt: survey.date };
    state.surveys = [survey];
    const stored = await (await fetch('/api/platform/state')).json();
    const saved = await fetch('/api/platform/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state, baseRevision: stored.revision }) });
    if (!saved.ok) throw new Error('Unable to prepare consented test profile');
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, key);
  await page.goto(base + '/app?role=candidate&tab=assessment');
  await page.getByRole('button', { name: 'Начать тест', exact: true }).waitFor({ state: 'visible' });
  await page.locator('.vacancy-builder summary').click();
  await page.locator('.vacancy-examples button').last().click();
  assert.match(await page.getByLabel('Описание вакансии').inputValue(), /React/);
  await page.screenshot({ path: resolve('test-results', 'assessment-vacancy.png'), fullPage: true });
  await mobileAudit();
  await page.screenshot({ path: resolve('test-results', 'assessment-vacancy-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/assessment/attempts') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Начать тест', exact: true }).click();
  const attempt = await (await responsePromise).json();
  assert.equal(attempt.questions.length, 6);
  assert.deepEqual(attempt.blueprint.difficultyCounts, { '1': 3, '2': 3 });
  assert.ok(attempt.vacancy.matchedSkills.includes('React'));
  assert.ok(attempt.vacancy.unmatchedSkills.includes('TypeScript'));
  await page.locator('.question-text').waitFor();
  await mobileAudit();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const payload = JSON.stringify(attempt);
  for (const forbidden of ['correctOptionId', 'familyId', 'variantId', '"correct"']) assert.ok(!payload.includes(forbidden), 'Private key leaked: ' + forbidden);
  const bankRequest = await context.request.get(base + '/server/bank.mjs');
  assert.ok(!(await bankRequest.text()).includes('export const bankVersion'), 'SPA fallback must never contain the private module');
  const bankPath = resolve('../server/bank.mjs').replaceAll('\\', '/');
  assert.ok([403, 404].includes(await context.request.get(base + '/@fs/' + bankPath).then(response => response.status())), 'Private source must be denied in development and production');
  const firstText = await page.locator('.question-text').textContent();
  await page.locator('.answer-option').first().click();
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  const secondText = await page.locator('.question-text').textContent();
  await page.reload();
  await page.locator('.question-text').waitFor();
  assert.equal(await page.locator('.question-text').textContent(), secondText);
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  assert.equal(await page.locator('.question-text').textContent(), firstText);
  assert.equal(await page.locator('.answer-option input:checked').count(), 1);
  const answers = new Map(programs.Frontend.Middle.families.flatMap(family => family.variants.map(variant => [variant.text, variant.options[variant.correct]])));
  for (let index = 0; index < 6; index++) {
    const text = await page.locator('.question-text').textContent();
    const expected = answers.get(text);
    assert.ok(expected);
    const options = await page.locator('.answer-option span').allTextContents();
    await page.locator('.answer-option').nth(options.indexOf(expected)).click();
    if (index < 5) await page.getByRole('button', { name: 'Далее', exact: true }).click();
  }
  injectedFailure = true;
  await page.route('**/api/assessment/attempts/*/submit', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Сервис временно недоступен. Попробуйте снова.' }) }));
  await page.getByRole('button', { name: 'Завершить тест', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('.answer-option input:checked').count(), 1);
  assert.equal(await page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)).history.length, key), 0, 'Transport failure cannot become a failed result');
  await page.unroute('**/api/assessment/attempts/*/submit');
  injectedFailure = false;
  await page.getByRole('button', { name: 'Завершить тест', exact: true }).click();
  await page.getByRole('heading', { name: 'Грейд подтверждён', exact: true }).waitFor();
  assert.equal(await page.locator('.competency-results div').count(), 3);
  assert.equal(await page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)).history.length, key), 1);
  await page.screenshot({ path: resolve('test-results', 'assessment-result.png'), fullPage: true });
  await mobileAudit();
  assert.deepEqual(errors, []);
  console.log('PASS Vacancy source, private bank isolation, opaque IDs, resume, server grading and retry without false failure');
} finally { await context.request.delete(base + '/api/platform/state'); await context.close(); await browser.close(); }
