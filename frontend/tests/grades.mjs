import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { gradeOptions } from '../../shared/grading.ts';
// Answer fixtures are used by Node tests only, never by the application bundle.
import { programs } from '../../server/bank.mjs';

const base = process.env.PREDEL_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const errors = [];
await mkdir(resolve('test-results'), { recursive: true });

async function waitForSaved(page) {
  await page.waitForFunction(() => ['saved', 'error'].includes(document.querySelector('.main-content')?.getAttribute('data-sync-status')));
  assert.equal(await page.locator('.main-content').getAttribute('data-sync-status'), 'saved', 'Server persistence failed');
}

try {
  for (const { value: grade, label } of gradeOptions) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Europe/Moscow', reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-10-06T09:00:00+03:00'));
    try {
      await page.goto(base + '/app?role=candidate');
      const buffer = Buffer.from(['Иван Соколов', `Frontend developer ${grade}`, 'grade.test@example.com', 'Отрасль: ИТ', 'Навыки: React, TypeScript',
        'Опыт работы', 'Январь 2023 — настоящее время', 'Тестовая компания Север', 'Разработка интерфейсов.',
        'Май 2024 — Март 2025', 'Параллельный тестовый проект', 'Автоматизация тестов.'].join('\n'));
      await page.getByLabel('Файл резюме').setInputFiles({ name: 'synthetic-grade.txt', mimeType: 'text/plain', buffer });
      await page.locator('.resume-import[aria-busy="false"]').waitFor();
      assert.equal(await page.locator('.resume-import [role="alert"]').count(), 0);
      assert.equal(await page.getByLabel('Предполагаемый грейд').inputValue(), grade);
      assert.equal(await page.getByLabel('Общий стаж').inputValue(), '3 года 10 месяцев', 'Overlapping employment must not inflate the total');
      assert.equal(await page.locator('[name="softSkills"]').count(), 0);
      await page.getByLabel('Согласен на обработку персональных данных', { exact: true }).check();
      await page.getByLabel('Показывать профиль работодателям', { exact: true }).check();
      await page.getByRole('button', { name: 'К тесту', exact: true }).click();
      await page.getByRole('button', { name: 'Начать тест', exact: true }).waitFor();
      assert.match(await page.locator('.assessment-category').textContent(), new RegExp(label));
      const attemptResponse = page.waitForResponse(response => response.url().endsWith('/api/assessment/attempts') && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Начать тест', exact: true }).click();
      const response = await attemptResponse;
      assert.equal(response.status(), 201);
      const attempt = await response.json();
      assert.equal(attempt.grade, grade);
      const keys = new Map(programs.Frontend[grade].families.flatMap(family => family.variants.map(variant => [variant.text, variant.options[variant.correct]])));
      for (let index = 0; index < attempt.questions.length; index++) {
        await page.locator(`.exam-progress[aria-valuenow="${index + 1}"]`).waitFor();
        const correct = keys.get(await page.locator('.question-text').textContent());
        assert(correct, `Missing answer fixture for ${grade}`);
        const choices = page.locator('.answer-option');
        const texts = await choices.locator('span').allTextContents();
        const answer = texts.findIndex(text => text.trim() === correct);
        assert(answer >= 0);
        await choices.nth(answer).click();
        await page.getByRole('button', { name: index === attempt.questions.length - 1 ? 'Завершить тест' : 'Далее', exact: true }).click();
      }
      await page.getByRole('heading', { name: 'Грейд подтверждён', exact: true }).waitFor();
      await page.getByRole('button', { name: 'К профилю', exact: true }).click();
      await page.getByRole('heading', { name: 'Мой профиль', exact: true }).waitFor();
      await waitForSaved(page);
      await page.reload();
      assert.equal(await page.getByLabel('Предполагаемый грейд').inputValue(), grade);
      assert.equal(await page.getByLabel('Общий стаж').inputValue(), '3 года 10 месяцев');
      assert.match(await page.locator('.category-status').textContent(), new RegExp(label));
      await page.goto(base + '/app?role=employer');
      await page.getByRole('textbox', { name: 'Потребность работодателя' }).fill(`Frontend ${label} React TypeScript`);
      await page.getByRole('button', { name: 'Подобрать', exact: true }).click();
      const candidate = page.locator('.candidate-row').filter({ hasText: 'Иван Соколов' });
      await candidate.waitFor();
      assert.match(await candidate.textContent(), new RegExp(label));
      await page.getByRole('group', { name: 'Грейд', exact: true }).getByRole('button', { name: label, exact: true }).click();
      assert.equal(await candidate.count(), 1);
      if (grade === 'Lead') {
        await page.setViewportSize({ width: 320, height: 800 });
        await page.getByRole('button', { name: /Фильтры/ }).click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        await page.addScriptTag({ path: createRequire(import.meta.url).resolve('axe-core/axe.min.js') });
        const issues = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => item.id));
        assert.deepEqual(issues, []);
        await page.screenshot({ path: resolve('test-results', 'grades-mobile.png'), fullPage: true });
      }
    } finally { await context.request.delete(base + '/api/platform/state'); await context.close(); }
  }
  assert.deepEqual(errors, []);
  console.log('PASS all five grades: resume dates and overlap, self-assessment, server test, confirmed category, reload, employer search and mobile filters');
} finally { await browser.close(); }
