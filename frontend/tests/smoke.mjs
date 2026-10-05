import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const base = process.env.PREDEL_URL || 'http://127.0.0.1:5173';
const output = resolve('test-results');
const storageKey = 'predel:platform:v2';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.setDefaultTimeout(15000);

async function rows(expected) {
  await page.waitForFunction(count => document.querySelectorAll('.candidate-row').length === count, expected);
}
async function role(next) {
  await page.locator('.role-button').click();
  await page.locator('.role-menu').getByRole('button', { name: next, exact: true }).click();
}
async function tab(name) {
  await page.locator('.main-nav').getByRole('link', { name: new RegExp('^' + name) }).click();
}
async function noOverflow(target) {
  assert.equal(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Horizontal overflow');
}
async function audit(target) {
  await target.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const violations = await target.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
    return result.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => node.target) }));
  });
  assert.deepEqual(violations, [], 'Accessibility violations: ' + JSON.stringify(violations));
}

const juniorAnswers = new Set([
  'button type="button"', 'Связать label for и input id', 'main',
  'Содержимое, padding и border', 'flex-wrap: wrap', '.card', 'map', 'Promise', 'false',
]);
const middleAnswers = new Set([
  'Состояние может привязаться к другому элементу',
  'setCount(previous => previous + 1)', 'Функцию удаления подписки',
  'Отменять прошлый запрос и проверять актуальность результата', 'Отклонится', 'Promise.allSettled',
  'Управлять фокусом, Escape и возвратом фокуса',
  'Сначала измерить обновления профилировщиком', 'Выводить текст обычным JSX без HTML-вставки',
]);
async function completeExam(answerSet, correct) {
  for (let index = 0; index < 6; index++) {
    const choices = page.locator('.answer-option');
    const texts = await choices.locator('span').allTextContents();
    const chosen = texts.findIndex(text => answerSet.has(text.trim()) === correct);
    assert.ok(chosen >= 0, 'Expected an answer option for this program');
    await choices.nth(chosen).click();
    await page.getByRole('button', { name: index === 5 ? 'Завершить тест' : 'Далее', exact: true }).click();
  }
}

async function state() {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
}

async function fillSurvey(target = page) {
  await target.getByLabel('Имя и фамилия', { exact: true }).fill('Анна Морозова');
  await target.getByLabel('Email', { exact: true }).fill('anna@example.com');
  await target.getByRole('combobox', { name: 'Отрасль', exact: true }).selectOption('ИТ');
  await target.getByLabel('Роль в команде', { exact: true }).fill('Разработчик');
  await target.getByRole('combobox', { name: 'Специализация', exact: true }).selectOption('Frontend');
  await target.getByRole('combobox', { name: 'Предполагаемый грейд', exact: true }).selectOption('Middle');
  await target.getByLabel('Стек', { exact: true }).fill('React, TypeScript, CSS');
  await target.getByLabel('Опыт работы', { exact: true }).fill('3 года');
  await target.getByLabel('Город', { exact: true }).fill('Москва');
  await target.getByLabel('Согласен на обработку данных', { exact: true }).check();
}

try {
  await page.goto(base);
  await page.locator('.hero-art img').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.hero-art img').evaluate(image => image.decode());
  await page.screenshot({ path: resolve(output, 'landing-desktop.png'), fullPage: false });
  await noOverflow(page);
  await audit(page);
  await page.locator('.hero-actions').getByRole('button', { name: 'Попробовать', exact: true }).click();
  await rows(6);
  assert.equal(new URL(page.url()).pathname, '/app');
  await page.goBack();
  await page.locator('.landing').waitFor();
  await page.goForward();
  await rows(6);
  console.log('PASS Original landing, Try entry and browser history');
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('.partner-logos img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), true);
  await noOverflow(page);
  await page.screenshot({ path: resolve(output, 'desktop.png'), fullPage: true });
  await audit(page);
  const explanation = page.locator('.match-details').first();
  await explanation.locator('summary').click();
  assert.equal(await explanation.locator('p').isVisible(), true, 'Matching explanation remains available');
  await explanation.locator('summary').click();
  console.log('PASS Desktop, assets and accessibility');

  await page.getByRole('textbox', { name: 'Потребность работодателя' }).fill('Frontend Middle React TypeScript');
  await page.getByRole('button', { name: 'Подобрать', exact: true }).click();
  await rows(2);
  await page.getByRole('button', { name: 'Сохранить подборку', exact: true }).click();
  await page.getByLabel('Есть достижения ФСП').check();
  await rows(1);
  await page.getByRole('button', { name: 'Подборки', exact: true }).click();
  await page.locator('.saved-item').getByRole('button', { name: 'Frontend Middle React TypeScript', exact: true }).click();
  await rows(2);
  await tab('Приглашения');
  await tab('Кандидаты');
  await rows(2);
  assert.equal(await page.getByRole('textbox', { name: 'Потребность работодателя' }).inputValue(), 'Frontend Middle React TypeScript');
  await page.getByRole('button', { name: 'Очистить поиск', exact: true }).click();
  await rows(6);
  console.log('PASS Query, filters, FSP and saved selection');

  await role('Кандидат');
  await page.getByRole('heading', { name: 'Анкета', exact: true }).waitFor();
  await page.goto(base + '/app?role=candidate&tab=invitations');
  assert.equal(await page.getByRole('heading', { name: 'Анкета', exact: true }).isVisible(), true, 'A direct link cannot skip the questionnaire');
  assert.equal(await page.getByLabel('Показывать профиль работодателям', { exact: true }).isChecked(), false);
  await page.getByRole('button', { name: 'К тесту', exact: true }).click();
  assert.equal(await page.getByRole('heading', { name: 'Анкета', exact: true }).isVisible(), true, 'Required answers prevent an empty submission');
  await fillSurvey();
  await page.getByRole('button', { name: 'К тесту', exact: true }).click();
  assert.equal(await page.getByRole('heading', { name: 'Анкета', exact: true }).isVisible(), true, 'A soft skill is required');
  await page.getByLabel('Коммуникация', { exact: true }).check();
  await page.getByLabel('Работа в команде', { exact: true }).check();
  await noOverflow(page);
  await page.screenshot({ path: resolve(output, 'onboarding-desktop.png'), fullPage: true });
  await audit(page);
  await page.getByRole('button', { name: 'К тесту', exact: true }).click();
  await page.getByRole('button', { name: 'Начать тест', exact: true }).waitFor();
  let current = await state();
  assert.equal(current.profile.confirmed, null);
  assert.equal(current.profile.visible, false);
  assert.equal(current.surveys.length, 1);
  assert.deepEqual(current.profile.softSkills, ['Коммуникация', 'Работа в команде']);
  assert.equal(current.history.length, 0);
  assert.equal(current.invitations.length, 0);
  await page.goto(base + '/app?role=candidate&tab=profile');
  await page.getByRole('button', { name: 'Начать тест', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Начать тест', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Далее', exact: true }).isDisabled(), true);
  await completeExam(middleAnswers, false);
  await page.getByRole('heading', { name: 'Грейд не подтверждён', exact: true }).waitFor();
  current = await state();
  assert.equal(current.profile.confirmed, null, 'First failure cannot confirm a category');
  assert.equal(current.history.length, 1);
  assert.equal(current.history[0].surveyId, current.surveys[0].id);
  await role('Работодатель');
  await rows(6);
  await role('Кандидат');
  await page.getByRole('button', { name: 'Начать тест', exact: true }).click();
  await completeExam(middleAnswers, true);
  await page.getByRole('heading', { name: 'Грейд подтверждён', exact: true }).waitFor();
  current = await state();
  assert.equal(current.profile.confirmed.grade, 'Middle');
  assert.equal(current.history.length, 2);
  assert.ok(current.history.every(result => result.surveyId === current.surveys[0].id));
  assert.equal(new URL(page.url()).searchParams.get('tab'), 'assessment', 'A direct profile entry retains the test result until the candidate continues');
  const surveyDate = current.profile.surveyCompletedAt;
  await page.getByRole('button', { name: 'К профилю', exact: true }).click();
  assert.equal(await page.getByRole('combobox', { name: 'Отрасль', exact: true }).inputValue(), 'ИТ');
  assert.equal(await page.getByLabel('Роль в команде', { exact: true }).inputValue(), 'Разработчик');
  await role('Работодатель');
  await rows(6);
  assert.equal(await page.getByRole('button', { name: /^Анна Морозова/ }).count(), 0, 'Passing does not publish the profile automatically');
  await role('Кандидат');
  await page.getByLabel('Город', { exact: true }).fill('');
  await page.getByLabel('Показывать профиль работодателям', { exact: true }).check();
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  assert.equal((await state()).profile.surveyCompletedAt, surveyDate, 'Editing an optional city or privacy preserves the completed questionnaire');
  await role('Работодатель');
  await rows(7);
  console.log('PASS Mandatory questionnaire, first failure, category confirmation, persistence and publication consent');

  await page.getByRole('button', { name: /^Анна Морозова/ }).click();
  assert.equal(await page.locator('dialog a[href="mailto:anna@example.com"]').count(), 0);
  assert.equal(await page.getByText('Откроются после принятия приглашения', { exact: true }).isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog').count(), 0);
  assert.equal(await page.getByRole('button', { name: /^Анна Морозова/ }).evaluate(element => document.activeElement === element), true);
  await page.locator('.candidate-row').filter({ hasText: 'Анна Морозова' }).getByRole('button', { name: 'Пригласить', exact: true }).click();
  await page.locator('input[name="salaryFrom"]').fill('180000');
  await page.locator('input[name="salaryTo"]').fill('240000');
  await page.getByLabel('Условия и задачи').fill('Разработка интерфейса продукта на React и TypeScript.');
  await page.getByRole('button', { name: 'Отправить приглашение', exact: true }).click();
  await page.locator('.candidate-row').filter({ hasText: 'Михаил Соколов' }).getByRole('button', { name: 'Пригласить', exact: true }).click();
  await page.getByRole('button', { name: 'Отправить приглашение', exact: true }).click();
  assert.equal(await page.locator('dialog').count(), 1);
  await page.locator('input[name="salaryFrom"]').fill('250000');
  await page.locator('input[name="salaryTo"]').fill('100000');
  await page.getByLabel('Условия и задачи').fill('Разработка интерфейсов на React. Удалённая работа.');
  await page.getByRole('button', { name: 'Отправить приглашение', exact: true }).click();
  assert.equal(await page.getByRole('alert').isVisible(), true);
  await page.locator('input[name="salaryFrom"]').fill('180000');
  await page.locator('input[name="salaryTo"]').fill('240000');
  await page.getByRole('button', { name: 'Отправить приглашение', exact: true }).click();
  await tab('Приглашения');
  assert.equal(await page.locator('.invitation-card').count(), 2);
  assert.equal(await page.locator('a[href="mailto:anna@example.com"]').count(), 0);
  console.log('PASS Required salary, invalid range and outgoing invitation');

  await role('Кандидат');
  await tab('Приглашения');
  assert.equal(await page.locator('.invitation-card').count(), 1, 'Candidate only sees own invitation');
  await page.getByRole('button', { name: 'Принять', exact: true }).click();
  await page.locator('.status-accepted').waitFor();
  await role('Работодатель');
  await tab('Приглашения');
  assert.equal(await page.locator('a[href="mailto:anna@example.com"]').count(), 1);
  await page.reload();
  assert.equal(await page.locator('a[href="mailto:anna@example.com"]').count(), 1);
  console.log('PASS Shared statuses, contact disclosure and persistence');

  await role('Кандидат');
  await page.getByLabel('Показывать профиль работодателям').uncheck();
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  await role('Работодатель');
  await rows(6);
  assert.equal(await page.getByRole('button', { name: /^Анна Морозова/ }).count(), 0);
  await role('Кандидат');
  await page.getByLabel('Показывать профиль работодателям').check();
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  await tab('Тестирование');
  await page.getByRole('button', { name: 'Начать тест', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Далее', exact: true }).isDisabled(), true);
  await completeExam(middleAnswers, false);
  await page.getByRole('heading', { name: 'Грейд не подтверждён', exact: true }).waitFor();
  assert.equal(await page.getByText('Ваша категория Frontend · Middle сохранена.', { exact: true }).isVisible(), true);
  await page.getByRole('button', { name: 'Изменить анкету', exact: true }).click();
  await page.getByRole('combobox', { name: 'Предполагаемый грейд', exact: true }).selectOption('Junior');
  await page.getByRole('button', { name: 'К тесту', exact: true }).click();
  assert.equal((await state()).profile.confirmed.grade, 'Middle', 'Self reported grade cannot replace confirmed grade');
  assert.equal(await page.getByRole('button', { name: 'Начать тест', exact: true }).isDisabled(), true, 'A new category is locked for 90 days after confirmation');
  await page.evaluate(key => {
    const stored = JSON.parse(localStorage.getItem(key));
    stored.profile.gradeChangedAt = new Date(Date.now() - 100 * 86400000).toISOString();
    localStorage.setItem(key, JSON.stringify(stored));
  }, storageKey);
  await page.reload();
  await page.getByRole('button', { name: 'Начать тест', exact: true }).click();
  await completeExam(juniorAnswers, true);
  await page.getByRole('heading', { name: 'Грейд подтверждён', exact: true }).waitFor();
  await page.getByRole('button', { name: 'К профилю', exact: true }).click();
  assert.equal(await page.locator('.category-status strong').textContent(), 'Junior');
  await tab('Тестирование');
  await page.getByRole('button', { name: 'Изменить анкету', exact: true }).click();
  await page.getByRole('combobox', { name: 'Предполагаемый грейд', exact: true }).selectOption('Middle');
  await page.getByRole('button', { name: 'К тесту', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Начать тест', exact: true }).isDisabled(), true);
  console.log('PASS Privacy, failed attempt, confirmed category and 90 day interval');

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const mobile = await mobileContext.newPage();
  await mobile.goto(base);
  await mobile.evaluate(() => document.fonts.ready);
  await mobile.locator('.hero-art img').evaluate(image => image.decode());
  await mobile.screenshot({ path: resolve(output, 'landing-mobile.png'), fullPage: false });
  await noOverflow(mobile);
  await mobile.getByRole('button', { name: 'Открыть меню', exact: true }).click();
  await mobile.locator('.mobile-menu').getByRole('link', { name: 'Возможности', exact: true }).click();
  assert.equal(await mobile.locator('.mobile-menu').count(), 0);
  await mobile.locator('.hero-actions').getByRole('button', { name: 'Попробовать', exact: true }).click();
  await noOverflow(mobile);
  await mobile.screenshot({ path: resolve(output, 'mobile.png'), fullPage: true });
  await mobile.getByRole('button', { name: 'Фильтры', exact: true }).click();
  await mobile.locator('.filters').getByLabel('Специализация').selectOption('Frontend');
  await mobile.locator('.filter-group').getByRole('button', { name: 'Middle', exact: true }).click();
  assert.equal(await mobile.locator('.candidate-row').count(), 2);
  await noOverflow(mobile);
  await audit(mobile);
  await mobile.getByRole('button', { name: /^Михаил Соколов/ }).click();
  await noOverflow(mobile);
  await mobile.screenshot({ path: resolve(output, 'mobile-profile.png'), fullPage: true });
  await mobile.keyboard.press('Escape');
  await mobile.setViewportSize({ width: 320, height: 750 });
  await mobile.locator('.match-details').first().locator('summary').click();
  await noOverflow(mobile);
  await mobile.locator('.match-details').last().locator('summary').click();
  const noteBounds = await mobile.locator('.match-details').last().locator('p').boundingBox();
  const listBounds = await mobile.locator('.candidate-list').boundingBox();
  assert.ok(noteBounds && listBounds && noteBounds.x >= listBounds.x && noteBounds.x + noteBounds.width <= listBounds.x + listBounds.width
    && noteBounds.y >= listBounds.y && noteBounds.y + noteBounds.height <= listBounds.y + listBounds.height, 'Explanation is not clipped by the result list');
  for (const route of ['/', '/app?role=candidate&tab=profile', '/app?role=candidate&tab=assessment', '/app?role=candidate&tab=invitations', '/app?role=employer&tab=company']) {
    await mobile.goto(base + route);
    await mobile.evaluate(() => document.fonts.ready);
    await noOverflow(mobile);
    if (route.includes('role=candidate')) {
      assert.equal(await mobile.getByRole('heading', { name: 'Анкета', exact: true }).isVisible(), true);
    }
  }
  await mobile.goto(base + '/app?role=candidate&tab=profile');
  await fillSurvey(mobile);
  await mobile.getByLabel('Коммуникация', { exact: true }).check();
  await noOverflow(mobile);
  await mobile.screenshot({ path: resolve(output, 'onboarding-mobile.png'), fullPage: true });
  await audit(mobile);
  await mobile.getByRole('button', { name: 'К тесту', exact: true }).click();
  await mobile.getByRole('button', { name: 'Начать тест', exact: true }).waitFor();
  await noOverflow(mobile);
  await mobileContext.close();
  console.log('PASS Mobile 390px, 320px and keyboard dialog');

  await page.locator('.site-header .brand').click();
  await page.getByLabel('Кого вы ищете?').fill('Backend Middle Python PostgreSQL');
  await page.locator('.brief-toolbar').getByRole('button', { name: 'Попробовать', exact: true }).click();
  await rows(1);
  assert.equal(await page.getByRole('textbox', { name: 'Потребность работодателя' }).inputValue(), 'Backend Middle Python PostgreSQL');
  await page.getByRole('button', { name: 'Очистить поиск', exact: true }).click();
  await rows(7);
  console.log('PASS Landing request is carried into the workspace');

  const completedProfile = await state();
  await page.evaluate(key => {
    const stored = JSON.parse(localStorage.getItem(key));
    const legacy = { ...stored, version: 1 };
    delete legacy.surveys;
    delete legacy.profile.industry;
    delete legacy.profile.professionalRole;
    delete legacy.profile.softSkills;
    delete legacy.profile.surveyCompletedAt;
    legacy.profile.email = 'edited@example.com';
    const seedDate = new Date().toISOString();
    legacy.profile.confirmed = { specialization: 'Frontend', grade: 'Middle', score: 86, date: seedDate };
    legacy.history = [{ id: 'test-initial', specialization: 'Frontend', grade: 'Middle', score: 86, date: seedDate, passed: true }];
    localStorage.setItem('predel:platform:v1', JSON.stringify(legacy));
    localStorage.removeItem(key);
  }, storageKey);
  await page.goto(base + '/app?role=candidate&tab=profile');
  await page.getByRole('heading', { name: 'Анкета', exact: true }).waitFor();
  assert.equal(await page.getByLabel('Email', { exact: true }).inputValue(), 'edited@example.com', 'Migration preserves edited contacts');
  current = await state();
  assert.equal(current.version, 2);
  assert.equal(current.profile.confirmed, null, 'Migration removes a synthetic initial category');
  assert.equal(current.history.length, 0);
  assert.equal(current.invitations.length, 2, 'Migration preserves invitations');
  assert.equal(current.savedSearches.length, 1, 'Migration preserves saved searches');
  console.log('PASS Legacy migration preserves edits while requiring a real questionnaire and test');

  await page.evaluate(({ key, completed }) => {
    const legacy = { ...completed, version: 1 };
    delete legacy.surveys;
    delete legacy.profile.industry;
    delete legacy.profile.professionalRole;
    delete legacy.profile.softSkills;
    delete legacy.profile.surveyCompletedAt;
    localStorage.setItem('predel:platform:v1', JSON.stringify(legacy));
    localStorage.removeItem(key);
  }, { key: storageKey, completed: completedProfile });
  await page.reload();
  await page.getByRole('heading', { name: 'Анкета', exact: true }).waitFor();
  current = await state();
  assert.equal(current.profile.confirmed.grade, 'Junior', 'Migration preserves a category earned through a real attempt');
  assert.equal(current.history.length, completedProfile.history.length, 'Migration preserves real test history');
  assert.equal(current.invitations.length, completedProfile.invitations.length);
  console.log('PASS Legacy migration preserves earned categories and test history');

  await page.evaluate(key => localStorage.setItem(key, '{broken'), storageKey);
  await page.goto(base + '?role=employer&tab=candidates');
  await rows(6);
  assert.deepEqual(errors, [], 'Browser runtime errors');
  console.log('PASS Recovery from corrupted storage, no browser errors');
} finally {
  await context.close();
  await browser.close();
}
