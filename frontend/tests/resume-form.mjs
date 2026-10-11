import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { professionalRoleOptions } from '../../shared/catalog.ts';
import { register } from './helpers/accounts.mjs';
import { startIsolatedService } from './helpers/isolated-service.mjs';
import { answerExam, answerKey, startExam } from './helpers/exam.mjs';

const isolated = await startIsolatedService({ authEnv: { API_RATE_LIMIT_PER_MINUTE: '3000' } });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());
page.setDefaultTimeout(20000);

async function saved() {
  await page.waitForFunction(() => ['saved', 'error'].includes(document.querySelector('.main-content')?.dataset.syncStatus));
  assert.equal(await page.locator('.main-content').getAttribute('data-sync-status'), 'saved');
}
async function state() { return (await (await context.request.get(isolated.base + '/api/platform/state')).json()).state; }
async function upload(lines) {
  await page.getByLabel('Файл резюме', { exact: true }).setInputFiles({ name: 'structured-fixture.txt', mimeType: 'text/plain', buffer: Buffer.from(lines.join('\n')) });
  await page.locator('.resume-import[aria-busy="false"]').waitFor();
  assert.equal(await page.locator('.resume-import [role="alert"]').count(), 0);
}
async function addCustomStack(field, name) {
  await field.getByRole('searchbox').fill(name);
  await field.getByRole('button', { name: `Добавить «${name}»`, exact: true }).click();
  assert.equal(await field.getByRole('checkbox', { name, exact: true }).isChecked(), true);
}
const fixture = [
  'Иван Тестовый', 'Frontend developer Junior', 'resume.fixture@example.invalid', 'Опыт работы: 2 года',
  'Навыки: TypeScript, JavaScript, React', 'Софт-скиллы: Коммуникация, Работа в команде',
  'Опыт работы', 'Компания: Example Studio', 'Период: Январь 2024 — Декабрь 2025', 'Задачи: Разработал интерфейсы каталога.',
  'Pet-проекты', 'Название: Планировщик', 'Описание: Приложение для планирования встреч.', 'Стек: React, TypeScript',
  'Достижения', '• Победитель хакатона 2025', 'Интересы', '• Алгоритмы',
];

try {
  await register(context, isolated, 'candidate', 'resume.structured');
  await page.goto(isolated.base + '/app?role=candidate&tab=onboarding');
  await page.getByRole('heading', { name: 'Анкета', exact: true }).waitFor();
  await saved();
  assert.equal(await page.getByLabel('Отрасль', { exact: true }).count(), 0);
  assert.equal(await page.locator('select[name="professionalRole"] option').count(), professionalRoleOptions.length + 1);
  await upload(fixture);
  assert.equal(await page.getByLabel('Роль в команде', { exact: true }).inputValue(), 'Frontend-разработчик');
  assert.equal(await page.getByLabel('Компания 1', { exact: true }).inputValue(), 'Example Studio');
  assert.match(await page.getByLabel('Период работы 1', { exact: true }).inputValue(), /2024.*2025/);
  assert.match(await page.getByLabel('Задачи 1', { exact: true }).inputValue(), /интерфейсы каталога/);
  assert.equal(await page.getByLabel('Название проекта 1', { exact: true }).inputValue(), 'Планировщик');
  assert.match(await page.getByLabel('Описание проекта 1', { exact: true }).inputValue(), /планирования встреч/);
  const mainStack = page.locator('.competency-field').first();
  assert.ok(await mainStack.getByRole('checkbox').count() <= 21, 'The initial catalog remains compact');
  await mainStack.getByRole('searchbox').fill('TS');
  assert.equal(await mainStack.getByRole('checkbox', { name: 'TypeScript', exact: true }).isChecked(), true);
  assert.match(await mainStack.getByRole('status').textContent(), /Уже выбрано: TypeScript/);
  await mainStack.getByRole('searchbox').fill('postgres');
  assert.equal(await mainStack.getByRole('checkbox', { name: 'PostgreSQL', exact: true }).isVisible(), true);
  assert.equal(await mainStack.getByRole('checkbox', { name: 'TypeScript', exact: true }).isVisible(), true, 'Selected skills remain visible for unrelated searches');
  for (const skill of ['C', 'R', 'Go']) {
    await mainStack.getByRole('searchbox').fill(skill);
    assert.equal((await mainStack.locator('.competency-results .competency-chip').first().textContent()).trim(), skill);
    assert.ok(await mainStack.locator('.competency-results').getByRole('checkbox').count() <= 40);
  }
  await mainStack.getByRole('searchbox').fill('a');
  assert.ok(await mainStack.locator('.competency-results').getByRole('checkbox').count() <= 40);
  await mainStack.getByRole('searchbox').fill('Unknown Fixture Tech');
  assert.match(await mainStack.getByRole('status').textContent(), /Совпадений нет/);
  assert.equal(await mainStack.getByRole('checkbox', { name: 'TypeScript', exact: true }).isVisible(), true);
  const customButton = mainStack.getByRole('button', { name: 'Добавить «Unknown Fixture Tech»', exact: true });
  assert.equal(await customButton.isVisible(), true);
  assert.ok(parseFloat(await customButton.evaluate(button => getComputedStyle(button).borderRadius)) >= 20, 'Manual add button has an ellipse shape');
  await mainStack.getByRole('button', { name: 'Очистить поиск: Стек', exact: true }).click();
  await mainStack.getByRole('button', { name: 'Все компетенции', exact: true }).click();
  assert.ok(await mainStack.getByRole('checkbox').count() > 40);
  await mainStack.getByRole('button', { name: 'Свернуть список', exact: true }).click();
  assert.ok(await mainStack.getByRole('checkbox').count() <= 21);
  await addCustomStack(mainStack, 'Custom UI Tech');
  await mainStack.getByRole('checkbox', { name: 'Custom UI Tech', exact: true }).uncheck();
  assert.equal(await mainStack.getByRole('checkbox', { name: 'Custom UI Tech', exact: true }).count(), 0, 'Removing a custom chip removes it from the compact selection');
  await addCustomStack(mainStack, 'Custom UI Tech');
  const projects = page.getByRole('region', { name: 'Pet-проекты', exact: true });
  await addCustomStack(projects.locator('.competency-field').first(), 'Custom Project Tech');
  const achievements = page.getByRole('region', { name: 'Достижения', exact: true });
  assert.match(await achievements.textContent(), /Победитель хакатона/);
  assert.doesNotMatch(await achievements.textContent(), /Алгоритмы/);
  await achievements.getByRole('button', { name: 'Редактировать достижение 1', exact: true }).click();
  await achievements.getByLabel('Редактировать достижение', { exact: true }).fill('Финалист хакатона 2025');
  await achievements.getByRole('button', { name: 'Готово', exact: true }).click();
  const interests = page.getByRole('region', { name: 'Интересы / дополнительно', exact: true });
  await interests.getByLabel('Добавить интерес', { exact: true }).fill('Архитектура систем');
  await interests.getByRole('button', { name: 'Добавить', exact: true }).click();
  await interests.getByLabel('Добавить интерес', { exact: true }).fill('Временный интерес');
  await interests.getByRole('button', { name: 'Добавить', exact: true }).click();
  await interests.getByRole('button', { name: 'Удалить интерес 3', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить место работы', exact: true }).click();
  await page.getByLabel('Период работы 2', { exact: true }).fill('Январь 2026 — настоящее время');
  await page.getByLabel('Компания 2', { exact: true }).fill('Second Studio');
  await page.getByLabel('Задачи 2', { exact: true }).fill('Подготовил дизайн-систему.');
  await page.getByRole('button', { name: 'Добавить pet-проект', exact: true }).click();
  await page.getByLabel('Название проекта 2', { exact: true }).fill('Учебный каталог');
  await page.getByLabel('Описание проекта 2', { exact: true }).fill('Фильтры и поиск.');
  await projects.locator('.competency-field').nth(1).getByRole('checkbox', { name: 'React', exact: true }).check();
  await page.getByLabel('Согласен на обработку персональных данных', { exact: true }).check();
  await page.getByRole('button', { name: 'К тесту', exact: true }).click();
  await page.getByRole('button', { name: 'Начать тест', exact: true }).waitFor();
  await saved();
  let current = await state();
  assert.equal(current.profile.workExperiences.length, 2);
  assert.equal(current.profile.petProjects.length, 2);
  assert.ok(current.profile.stack.includes('Custom UI Tech'));
  assert.ok(current.profile.petProjects[0].stack.includes('Custom Project Tech'));
  assert.deepEqual(current.profile.achievementItems, ['Финалист хакатона 2025']);
  assert.deepEqual(current.profile.interests, ['Алгоритмы', 'Архитектура систем']);
  assert.doesNotMatch(current.profile.careerAchievements, /Алгоритмы/);
  assert.doesNotMatch(current.profile.workHistory, /Планировщик/);
  const snapshot = JSON.stringify(current.surveys[0]);
  await page.reload();
  await page.getByRole('button', { name: 'Начать тест', exact: true }).waitFor();
  await startExam(page);
  await answerExam(page, answerKey('Frontend', 'Junior'));
  await page.getByRole('button', { name: 'К профилю', exact: true }).click();
  await page.getByRole('heading', { name: 'Мой профиль', exact: true }).waitFor();
  await saved();
  assert.equal(await page.getByRole('button', { name: 'Добавить резюме', exact: true }).isVisible(), true, 'Resume import remains visible in the personal profile');
  assert.equal(await page.getByLabel('Отрасль', { exact: true }).count(), 0);
  const confirmed = (await state()).profile.confirmed;
  await upload(fixture.map(line => line.replace('Example Studio', 'Imported Studio')));
  await page.getByLabel('Компания 1', { exact: true }).fill('Отредактированная компания');
  await page.getByLabel('Описание проекта 1', { exact: true }).fill('Дополненное описание проекта.');
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  await page.getByText('Профиль сохранён', { exact: true }).waitFor();
  await saved();
  current = await state();
  assert.equal(current.profile.workExperiences[0].company, 'Отредактированная компания');
  assert.equal(current.profile.petProjects[0].description, 'Дополненное описание проекта.');
  assert.equal(JSON.stringify(current.surveys[0]), snapshot, 'Editing the profile preserves the historical questionnaire');
  assert.deepEqual(current.profile.confirmed, confirmed, 'Resume editing never confers or changes qualification');
  await page.reload();
  // Changing self-reported stack can require a fresh questionnaire; both screens share these fields.
  await page.getByLabel('Компания 1', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Компания 1', { exact: true }).inputValue(), 'Отредактированная компания');
  assert.equal(await page.getByLabel('Описание проекта 1', { exact: true }).inputValue(), 'Дополненное описание проекта.');
  await page.setViewportSize({ width: 320, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  const wrapped = await page.locator('.competency-field').first().locator('.competency-chip').evaluateAll(chips => new Set(chips.map(chip => Math.round(chip.getBoundingClientRect().top))).size > 1);
  assert.equal(wrapped, true, 'Competency ellipses wrap over multiple rows on mobile');
  await page.addScriptTag({ path: createRequire(import.meta.url).resolve('axe-core/axe.min.js') });
  const issues = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(issue => issue.id));
  assert.deepEqual(issues, []);
  assert.deepEqual(errors, []);
  console.log('PASS structured resume: import, custom stacks, edits, repeated work/projects, separate chips, profile upload, historical snapshot, reload and mobile accessibility');
} finally {
  await context.close(); await browser.close(); await isolated.close();
}
