import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { answerExam, answerKey, startExam } from './helpers/exam.mjs';
import { register } from './helpers/accounts.mjs';
import { startIsolatedService } from './helpers/isolated-service.mjs';

// Registered candidate on a disposable service.
const isolated = await startIsolatedService();
const { base } = isolated;
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
await register(context, isolated, 'candidate', 'soft.skills');
const page = await context.newPage();
page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.setDefaultTimeout(15000);

async function state() {
  const response = await context.request.get(base + '/api/platform/state');
  assert.equal(response.status(), 200);
  return (await response.json()).state;
}
async function saved() {
  await page.waitForFunction(() => ['saved', 'error'].includes(document.querySelector('.main-content')?.dataset.syncStatus));
  assert.equal(await page.locator('.main-content').getAttribute('data-sync-status'), 'saved');
}

try {
  await page.goto(base + '/app?role=candidate&tab=onboarding');
  await page.getByRole('heading', { name: 'Анкета', exact: true }).waitFor();
  await saved();
  await page.getByLabel('Лидерство', { exact: true }).check();
  await page.getByLabel('Файл резюме').setInputFiles({ name: 'synthetic-skills.txt', mimeType: 'text/plain',
    buffer: Buffer.from(['Алексей Тестовый', 'Frontend developer Junior', 'synthetic-skills@example.com', 'Отрасль: ИТ',
      'Опыт работы: 1 год', 'Навыки: React, TypeScript', 'Софт-скиллы: Коммуникация, Работа в команде, Критическое мышление',
      'Pet-проекты', 'Название: Сервис расписания', 'Описание: Формы планирования встреч.', 'Стек: React, TypeScript',
      'Интересы', 'Обучаю начинающих разработчиков.'].join('\n')) });
  await page.locator('.resume-import[aria-busy="false"]').waitFor();
  assert.equal(await page.locator('.resume-import [role="alert"]').count(), 0);
  for (const skill of ['Коммуникация', 'Работа в команде', 'Лидерство', 'Критическое мышление']) {
    assert.equal(await page.getByLabel(skill, { exact: true }).isChecked(), true, 'Import merges parsed and manually selected skills');
  }
  assert.equal(await page.getByLabel('Самоорганизация', { exact: true }).isChecked(), false);
  assert.equal(await page.getByLabel('Согласен на обработку персональных данных', { exact: true }).isChecked(), false);
  assert.equal(await page.getByLabel('Название проекта 1', { exact: true }).inputValue(), 'Сервис расписания');
  assert.match(await page.getByRole('region', { name: 'Интересы / дополнительно', exact: true }).textContent(), /Обучаю начинающих разработчиков/);
  assert.equal(await page.locator('select[name="professionalRole"] option').filter({ hasText: /^Специалист по машинному обучению$/ }).count(), 1);
  await page.getByLabel('Роль в команде', { exact: true }).selectOption('Frontend-разработчик');
  await page.getByLabel('Согласен на обработку персональных данных', { exact: true }).check();
  await page.getByRole('button', { name: 'К тесту', exact: true }).click();
  await page.getByRole('button', { name: 'Начать тест', exact: true }).waitFor();
  await saved();
  const expected = ['Коммуникация', 'Лидерство', 'Работа в команде', 'Критическое мышление'].sort();
  let current = await state();
  assert.deepEqual([...current.profile.softSkills].sort(), expected);
  assert.deepEqual([...current.surveys[0].softSkills].sort(), expected);
  assert.equal(current.profile.petProjects[0].name, 'Сервис расписания');
  assert.match(current.profile.interests.join('\n'), /Обучаю начинающих разработчиков/);
  assert.equal(current.profile.bio.includes('Обучаю начинающих разработчиков'), false);
  await page.reload();
  await page.getByRole('button', { name: 'Начать тест', exact: true }).waitFor();
  const requestPromise = page.waitForRequest(request => request.url().endsWith('/api/assessment/attempts') && request.method() === 'POST');
  await startExam(page);
  assert.deepEqual([...(await requestPromise).postDataJSON().survey.softSkills].sort(), expected, 'The test uses the saved self-assessment');
  await answerExam(page, answerKey('Frontend', 'Junior'));
  await page.getByRole('button', { name: 'К профилю', exact: true }).click();
  await page.getByRole('heading', { name: 'Мой профиль', exact: true }).waitFor();
  await saved();
  await page.reload();
  await page.getByRole('heading', { name: 'Мой профиль', exact: true }).waitFor();
  assert.equal(await page.getByLabel('Лидерство', { exact: true }).isChecked(), true);
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
  const section = page.locator('.candidate-details section').filter({ has: page.getByRole('heading', { name: /Софт-скиллы/ }) });
  assert.match(await section.textContent(), /Самооценка/);
  for (const skill of expected) assert.ok((await section.locator('.tag').allTextContents()).includes(skill));
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByLabel('Лидерство', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  await page.getByText('Профиль сохранён', { exact: true }).waitFor();
  await saved();
  current = await state();
  assert.deepEqual([...current.profile.softSkills].sort(), expected.filter(skill => skill !== 'Лидерство'));
  assert.deepEqual([...current.surveys[0].softSkills].sort(), expected, 'Editing the profile preserves the completed questionnaire snapshot');
  assert.equal(current.profile.surveyCompletedAt, null, 'New self-assessment requires a new questionnaire before a new test');
  assert.equal(current.profile.confirmed.grade, 'Junior', 'Editing self-reported skills does not confer or clear a verified grade');
  await page.reload();
  await page.getByRole('heading', { name: 'Анкета', exact: true }).waitFor();
  assert.equal(await page.getByLabel('Лидерство', { exact: true }).isChecked(), false);
  await page.setViewportSize({ width: 320, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await page.addScriptTag({ path: createRequire(import.meta.url).resolve('axe-core/axe.min.js') });
  const issues = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(issue => issue.id));
  assert.deepEqual(issues, []);
  assert.deepEqual(errors, []);
  console.log('PASS optional self-assessment: resume merge, saved questionnaire, real test, reload, preview, edit and 320px accessibility');
} finally {
  await context.close();
  await browser.close();
  await isolated.close();
}
