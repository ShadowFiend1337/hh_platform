import assert from 'node:assert/strict';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { specializationOptions, industryOptions } from '../../shared/catalog.ts';
import { gradeOptions } from '../../shared/grading.ts';
import { answerExam, answerKey, startExam } from './helpers/exam.mjs';
import { register, useFixedEncoder } from './helpers/accounts.mjs';
import { startIsolatedService } from './helpers/isolated-service.mjs';

// All directions and programs, resume import into the questionnaire, an ML attempt,
// persistence and the employer finding the new profile, on a disposable service.
const isolated = await startIsolatedService({ authEnv: { API_RATE_LIMIT_PER_MINUTE: '3000' } });
useFixedEncoder(isolated.service);
const { base } = isolated;
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
const errors = [];
await mkdir(resolve('test-results'), { recursive: true });

async function auditMobile(page) {
  await page.setViewportSize({ width: 320, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Direction labels must fit mobile');
  await page.addScriptTag({ path: createRequire(import.meta.url).resolve('axe-core/axe.min.js') });
  const issues = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }))
    .violations.map(item => item.id));
  assert.deepEqual(issues, []);
}

try {
  await register(context, isolated, 'candidate', 'directions.candidate');
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());
  await page.goto(base + '/app?role=candidate&tab=onboarding');
  const specialization = page.getByRole('combobox', { name: 'Специализация', exact: true });
  const industry = page.getByRole('combobox', { name: 'Отрасль', exact: true });
  await specialization.waitFor();
  assert.equal(await specialization.locator('option').count(), specializationOptions.length + 1);
  assert.equal(await industry.locator('option').count(), industryOptions.length + 1);
  assert.deepEqual(await page.getByLabel('Предполагаемый грейд').locator('option').evaluateAll(options => options.slice(1)
    .map(option => ({ value: option.value, label: option.textContent }))), gradeOptions);
  for (const { value } of specializationOptions) for (const { value: grade } of gradeOptions) {
    const response = await context.request.get(`${base}/api/assessment/program?specialization=${value}&grade=${grade}`);
    assert.equal(response.status(), 200, `${value}/${grade}`);
    const program = await response.json();
    assert.equal(program.questionCount, 12);
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
  await page.getByLabel('Файл резюме').setInputFiles({ name: 'ml-resume.txt', mimeType: 'text/plain',
    buffer: Buffer.from('Иван Соколов\nML Engineer Middle\nivan.ml@example.com\nОтрасль: Наука\nОпыт работы: 2 года\nНавыки: Python, PyTorch\nСофт-скиллы: Коммуникация') });
  await page.waitForFunction(() => document.querySelector('[name="specialization"]')?.value === 'ML');
  assert.equal(await industry.inputValue(), 'Наука');
  assert.equal(await page.getByLabel('Предполагаемый грейд').inputValue(), 'Middle');
  assert.equal(await page.getByLabel('Согласен на обработку персональных данных', { exact: true }).isChecked(), false, 'Consent is never pre-filled');
  await page.screenshot({ path: resolve('test-results/directions-desktop.png'), fullPage: true });
  await specialization.selectOption('Security');
  await industry.selectOption('Транспорт и логистика');
  await auditMobile(page);
  await page.screenshot({ path: resolve('test-results/directions-mobile.png'), fullPage: true });
  await specialization.selectOption('ML');
  await industry.selectOption('Наука');
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByLabel('Согласен на обработку персональных данных', { exact: true }).check();
  await page.getByLabel('Показывать профиль работодателям', { exact: true }).check();
  await page.getByRole('button', { name: 'К тесту', exact: true }).click();
  await page.getByRole('button', { name: 'Начать тест', exact: true }).waitFor();
  assert.match(await page.locator('.assessment-category').textContent(), /ML и Data Science/u);
  await page.locator('.vacancy-builder summary').click();
  await page.locator('.vacancy-examples button').first().click();
  const attempt = await startExam(page);
  assert.equal(attempt.specialization, 'ML');
  assert(attempt.vacancy.matchedSkills.length > 0);
  assert.equal(JSON.stringify(attempt).includes('correctOptionId'), false);
  await answerExam(page, answerKey('ML', 'Middle'));
  await page.getByRole('heading', { name: 'Грейд подтверждён', exact: true }).waitFor();
  await page.getByRole('button', { name: 'К профилю', exact: true }).click();
  await page.getByRole('heading', { name: 'Мой профиль', exact: true }).waitFor();
  await page.locator('.main-content[data-sync-status="saved"]').waitFor();
  await page.reload();
  assert.equal(await page.getByRole('combobox', { name: 'Отрасль', exact: true }).inputValue(), 'Наука');

  const employerContext = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
  await register(employerContext, isolated, 'employer', 'directions.employer');
  const employer = await employerContext.newPage();
  employer.setDefaultTimeout(15000);
  employer.on('pageerror', error => errors.push(error.message));
  await employer.goto(base + '/app?role=employer&tab=candidates');
  await employer.getByRole('textbox', { name: 'Потребность работодателя' }).fill('ML Middle Python PyTorch');
  await employer.getByRole('button', { name: 'Подобрать', exact: true }).click();
  await employer.getByRole('group', { name: 'Грейд', exact: true }).getByRole('button', { name: 'Middle', exact: true }).click();
  const own = employer.locator('.candidate-row').filter({ hasText: 'Иван Соколов' });
  await own.waitFor();
  assert.match(await own.textContent(), /машинному обучению|ML/u);
  assert.deepEqual(errors, []);
  console.log('PASS 14 directions, all 70 programs, resume import, ML category, persistence, employer search and mobile accessibility');
} finally {
  await browser.close();
  await isolated.close();
}
