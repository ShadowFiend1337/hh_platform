import assert from 'node:assert/strict';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { specializationOptions, industryOptions } from '../../shared/catalog.ts';
import { gradeOptions } from '../../shared/grading.ts';
// Server fixtures are used only by Node tests, never imported by application code.
import { programs } from '../../server/bank.mjs';

const base = process.env.PREDEL_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error'
  && !(new URL(message.location().url || base).pathname === '/api/auth/me' && message.text().includes('401'))) errors.push(message.text()); });
await mkdir(resolve('test-results'), { recursive: true });

async function auditMobile() {
  await page.setViewportSize({ width: 320, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'New direction labels must fit mobile');
  await page.addScriptTag({ path: createRequire(import.meta.url).resolve('axe-core/axe.min.js') });
  const issues = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => item.id));
  assert.deepEqual(issues, []);
}
async function waitForSaved(target = page) {
  await target.waitForFunction(() => ['saved', 'error'].includes(document.querySelector('.main-content')?.getAttribute('data-sync-status')));
  assert.equal(await target.locator('.main-content').getAttribute('data-sync-status'), 'saved', 'Server persistence failed');
}

try {
  await page.goto(base + '/app?role=candidate');
  const specialization = page.getByRole('combobox', { name: 'Специализация', exact: true });
  const industry = page.getByRole('combobox', { name: 'Отрасль', exact: true });
  await specialization.waitFor();
  assert.equal(await specialization.locator('option').count(), specializationOptions.length + 1);
  assert.equal(await industry.locator('option').count(), industryOptions.length + 1);
  assert.deepEqual(await page.getByLabel('Предполагаемый грейд').locator('option').evaluateAll(options => options.slice(1).map(option => ({ value: option.value, label: option.textContent }))), gradeOptions);
  for (const { value } of specializationOptions) for (const { value: grade } of gradeOptions) {
    const response = await context.request.get(`${base}/api/assessment/program?specialization=${value}&grade=${grade}`);
    assert.equal(response.status(), 200, `${value}/${grade}`);
    const program = await response.json();
    assert.equal(program.questionCount, 6);
    assert.equal(program.topics.length, 3);
    assert(program.examples.length > 0, `${value}/${grade} needs an example`);
    assert.equal(JSON.stringify(program).includes('correctOptionId'), false);
  }
  if (process.env.PREDEL_RESUMES) {
    const folder = process.env.PREDEL_RESUMES;
    const files = (await readdir(folder)).filter(name => name.toLowerCase().endsWith('.pdf')).sort();
    for (let index = 0; index < files.length; index++) {
      const bytes = await readFile(resolve(folder, files[index]));
      const diagnostics = await page.evaluate(async data => {
        const { readResume } = await import('/src/resume.ts');
        const file = new File([Uint8Array.from(atob(data), value => value.charCodeAt(0))], 'sample.pdf', { type: 'application/pdf' });
        const result = await readResume(file);
        return { fieldCount: Object.keys(result.fields).length, specialization: result.fields.specialization ?? null,
          grade: result.fields.desiredGrade ?? null, pages: result.pages, method: result.method };
      }, bytes.toString('base64'));
      assert(diagnostics.fieldCount > 0);
      console.log(JSON.stringify({ document: index + 1, ...diagnostics }));
    }
  }
  await page.locator('input[type="file"]').setInputFiles({ name: 'ml-resume.txt', mimeType: 'text/plain',
    buffer: Buffer.from('Иван Соколов\nML Engineer Middle\nivan.ml@example.com\nОтрасль: Наука\nОпыт работы: 2 года\nНавыки: Python, PyTorch\nСофт-скиллы: Коммуникация') });
  await page.waitForFunction(() => document.querySelector('[name="specialization"]')?.value === 'ML');
  assert.equal(await industry.inputValue(), 'Наука');
  assert.equal(await page.getByLabel('Предполагаемый грейд').inputValue(), 'Middle');
  assert.equal(await page.getByLabel('Согласен на обработку персональных данных', { exact: true }).isChecked(), false);
  await page.screenshot({ path: resolve('test-results/directions-desktop.png'), fullPage: true });
  await specialization.selectOption('Security');
  await industry.selectOption('Транспорт и логистика');
  await auditMobile();
  await page.screenshot({ path: resolve('test-results/directions-mobile.png'), fullPage: true });
  await specialization.selectOption('ML');
  await industry.selectOption('Наука');
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByLabel('Согласен на обработку персональных данных', { exact: true }).check();
  await page.getByLabel('Показывать профиль работодателям', { exact: true }).check();
  await page.getByRole('button', { name: 'К тесту', exact: true }).click();
  await page.getByRole('button', { name: 'Начать тест', exact: true }).waitFor();
  assert.match(await page.locator('.assessment-category').textContent(), /ML и Data Science/);
  await page.locator('.vacancy-builder summary').click();
  await page.locator('.vacancy-examples button').first().click();
  const attemptResponse = page.waitForResponse(response => response.url().endsWith('/api/assessment/attempts') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Начать тест', exact: true }).click();
  const attempt = await (await attemptResponse).json();
  assert.equal(attempt.specialization, 'ML');
  assert.equal(attempt.questions.length, 6);
  assert(attempt.vacancy.matchedSkills.length > 0);
  assert.equal(JSON.stringify(attempt).includes('correctOptionId'), false);
  const key = new Map(programs.ML.Middle.families.flatMap(family => family.variants.map(variant => [variant.text, variant.options[variant.correct]])));
  for (let index = 0; index < 6; index++) {
    await page.locator(`.exam-progress[aria-valuenow="${index + 1}"]`).waitFor();
    const answer = key.get(await page.locator('.question-text').textContent());
    assert(answer, 'ML questions must come from the ML bank');
    const choices = page.locator('.answer-option');
    const texts = await choices.locator('span').allTextContents();
    const chosen = texts.findIndex(text => text.trim() === answer);
    assert(chosen >= 0);
    await choices.nth(chosen).click();
    await page.getByRole('button', { name: index === 5 ? 'Завершить тест' : 'Далее', exact: true }).click();
  }
  await page.getByRole('heading', { name: 'Грейд подтверждён', exact: true }).waitFor();
  await page.getByRole('button', { name: 'К профилю', exact: true }).click();
  await page.getByRole('heading', { name: 'Мой профиль', exact: true }).waitFor();
  assert.equal(await page.getByRole('combobox', { name: 'Специализация', exact: true }).inputValue(), 'ML');
  await waitForSaved();
  await page.reload();
  assert.equal(await page.getByRole('combobox', { name: 'Отрасль', exact: true }).inputValue(), 'Наука');
  await page.goto(base + '/app?role=employer');
  await page.getByRole('textbox', { name: 'Потребность работодателя' }).fill('ML Middle Python PyTorch');
  await page.getByRole('button', { name: 'Подобрать', exact: true }).click();
  const ownRow = page.locator('.candidate-row').filter({ hasText: 'Иван Соколов' });
  await ownRow.waitFor();
  assert.match(await ownRow.textContent(), /машинному обучению/);
  assert.deepEqual(errors, []);
  console.log('PASS 14 directions, 25 industries, all 70 grade programs, resume import, ML category, SQLite persistence, matching and mobile accessibility');
} finally {
  await context.request.delete(base + '/api/platform/state');
  await browser.close();
}
