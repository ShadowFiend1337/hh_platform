import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { gradeOptions } from '../../shared/grading.ts';
import { answerExam, answerKey, startExam } from './helpers/exam.mjs';
import { register, useFixedEncoder } from './helpers/accounts.mjs';
import { startIsolatedService } from './helpers/isolated-service.mjs';

// Every grade end to end on a disposable service: resume import, server test,
// confirmed category after reload and the employer finding the candidate by grade.
// Six accounts share one test address, so the per-address API budget is raised.
const isolated = await startIsolatedService({ authEnv: { API_RATE_LIMIT_PER_MINUTE: '3000' } });
useFixedEncoder(isolated.service);
const browser = await chromium.launch();
const errors = [];
await mkdir(resolve('test-results'), { recursive: true });

try {
  const employerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await register(employerContext, isolated, 'employer', 'grades.employer');
  const employer = await employerContext.newPage();
  employer.setDefaultTimeout(15000);
  employer.on('pageerror', error => errors.push(error.message));

  for (const { value: grade, label } of gradeOptions) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Europe/Moscow', reducedMotion: 'reduce' });
    await register(context, isolated, 'candidate', 'grades.' + grade.toLowerCase());
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());
    await page.clock.setFixedTime(new Date('2026-10-06T09:00:00+03:00'));
    try {
      await page.goto(isolated.base + '/app?role=candidate&tab=onboarding');
      const buffer = Buffer.from(['Иван Соколов', `Frontend developer ${grade}`, `grade.${grade.toLowerCase()}@example.com`, 'Отрасль: ИТ', 'Навыки: React, TypeScript',
        'Опыт работы', 'Январь 2023 — настоящее время', 'Тестовая компания Север', 'Разработка интерфейсов.',
        'Май 2024 — Март 2025', 'Параллельный тестовый проект', 'Автоматизация тестов.'].join('\n'));
      await page.getByLabel('Файл резюме').setInputFiles({ name: 'synthetic-grade.txt', mimeType: 'text/plain', buffer });
      await page.locator('.resume-import[aria-busy="false"]').waitFor();
      assert.equal(await page.locator('.resume-import [role="alert"]').count(), 0);
      assert.equal(await page.getByLabel('Предполагаемый грейд').inputValue(), grade);
      assert.equal(await page.getByLabel('Общий стаж').inputValue(), '3 года 10 месяцев', 'Overlapping employment must not inflate the total');
      assert.equal(await page.locator('[name="softSkills"]:checked').count(), 0, 'Self-reported skills remain optional');
      await page.getByLabel('Согласен на обработку персональных данных', { exact: true }).check();
      await page.getByLabel('Показывать профиль работодателям', { exact: true }).check();
      await page.getByRole('button', { name: 'К тесту', exact: true }).click();
      await page.getByRole('button', { name: 'Начать тест', exact: true }).waitFor();
      assert.match(await page.locator('.assessment-category').textContent(), new RegExp(label));
      const attempt = await startExam(page);
      assert.equal(attempt.grade, grade);
      await answerExam(page, answerKey('Frontend', grade));
      await page.getByRole('heading', { name: 'Грейд подтверждён', exact: true }).waitFor();
      if (grade !== 'Lead') {
        assert.match(await page.locator('.next-grade-offer').innerText(), /Смена категории доступна с/);
      }
      await page.getByRole('button', { name: 'К профилю', exact: true }).click();
      await page.getByRole('heading', { name: 'Мой профиль', exact: true }).waitFor();
      await page.locator('.main-content[data-sync-status="saved"]').waitFor();
      await page.reload();
      assert.equal(await page.getByLabel('Общий стаж').inputValue(), '3 года 10 месяцев');
      assert.match(await page.locator('.category-status').textContent(), new RegExp(label));
      if (grade === 'Junior') {
        await page.getByRole('button', { name: 'Пройти тест', exact: true }).click();
        await page.getByRole('button', { name: 'Изменить анкету', exact: true }).click();
        await page.getByLabel('Предполагаемый грейд').selectOption('Middle');
        await page.getByRole('button', { name: 'К тесту', exact: true }).click();
        await page.getByLabel('Ознакомлен с правилами и готов начать').check();
        assert.match(await page.locator('.inline-notice').innerText(), /Смена категории доступна с/);
        assert.equal(await page.getByRole('button', { name: 'Начать тест', exact: true }).isDisabled(), true,
          'A confident Junior pass cannot start an immediate promotion to Middle');
        await page.locator('.main-content[data-sync-status="saved"]').waitFor();
        await page.reload();
        await page.getByLabel('Ознакомлен с правилами и готов начать').waitFor();
        assert.equal(await page.getByRole('button', { name: 'Начать тест', exact: true }).isDisabled(), true);
      }
    } finally { await context.close(); }

    await employer.goto(isolated.base + '/app?role=employer&tab=candidates');
    // The page restores the previous search; start each grade from clean filters.
    const reset = employer.locator('.filter-heading').getByRole('button', { name: 'Сбросить' });
    if (await reset.count()) await reset.click();
    await employer.getByRole('textbox', { name: 'Потребность работодателя' }).fill(`Frontend ${label} React TypeScript`);
    await employer.getByRole('button', { name: 'Подобрать', exact: true }).click();
    await employer.getByRole('group', { name: 'Грейд', exact: true }).getByRole('button', { name: label, exact: true }).click();
    const candidate = employer.locator('.candidate-row').filter({ hasText: 'Иван Соколов' });
    await candidate.first().waitFor();
    assert.equal(await candidate.count(), 1, 'Exactly the candidate of this grade');
    assert.match(await candidate.textContent(), new RegExp(label));
    if (grade === 'Lead') {
      await employer.setViewportSize({ width: 320, height: 800 });
      await employer.getByRole('button', { name: /Фильтры/ }).click();
      assert.equal(await employer.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await employer.addScriptTag({ path: createRequire(import.meta.url).resolve('axe-core/axe.min.js') });
      const issues = await employer.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }))
        .violations.map(item => item.id));
      assert.deepEqual(issues, []);
      await employer.screenshot({ path: resolve('test-results', 'grades-mobile.png'), fullPage: true });
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS all five grades: resume dates and overlap, server test, confirmed category, 90-day promotion lock after a confident pass and reload, employer search by grade and mobile filters');
} finally { await browser.close(); await isolated.close(); }
