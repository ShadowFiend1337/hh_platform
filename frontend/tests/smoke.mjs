import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const base = process.env.PREDEL_URL || 'http://127.0.0.1:5173';
const output = resolve('test-results');
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

try {
  await page.goto(base);
  await page.locator('.hero-art img').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.hero-art img').evaluate(image => image.decode());
  await page.screenshot({ path: resolve(output, 'landing-desktop.png'), fullPage: false });
  await noOverflow(page);
  await audit(page);
  await page.locator('.hero-actions').getByRole('button', { name: 'Попробовать', exact: true }).click();
  await rows(7);
  assert.equal(new URL(page.url()).pathname, '/app');
  await page.goBack();
  await page.locator('.landing').waitFor();
  await page.goForward();
  await rows(7);
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
  await rows(3);
  await page.getByRole('button', { name: 'Сохранить подборку', exact: true }).click();
  await page.getByLabel('Есть достижения ФСП').check();
  await rows(1);
  await page.getByRole('button', { name: 'Подборки', exact: true }).click();
  await page.locator('.saved-item').getByRole('button', { name: 'Frontend Middle React TypeScript', exact: true }).click();
  await rows(3);
  await tab('Приглашения');
  await tab('Кандидаты');
  await rows(3);
  assert.equal(await page.getByRole('textbox', { name: 'Потребность работодателя' }).inputValue(), 'Frontend Middle React TypeScript');
  await page.getByRole('button', { name: 'Очистить поиск', exact: true }).click();
  await rows(7);
  console.log('PASS Query, filters, FSP and saved selection');

  await page.getByRole('button', { name: /^Анна Морозова/ }).click();
  assert.equal(await page.locator('dialog a[href="mailto:anna@example.com"]').count(), 0);
  assert.equal(await page.getByText('Откроются после принятия приглашения', { exact: true }).isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog').count(), 0);
  assert.equal(await page.getByRole('button', { name: /^Анна Морозова/ }).evaluate(element => document.activeElement === element), true);
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
  assert.equal(await page.getByRole('heading', { name: 'Грейд не подтверждён', exact: true }).isVisible(), true);
  assert.equal(await page.getByText('Ваша категория Frontend · Middle сохранена.', { exact: true }).isVisible(), true);
  await tab('Профиль');
  await page.getByLabel('Предполагаемый грейд').selectOption('Junior');
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  assert.equal(await page.locator('.category-status strong').textContent(), 'Middle', 'Self reported grade cannot replace confirmed grade');
  await tab('Тестирование');
  await page.getByRole('button', { name: 'Начать тест', exact: true }).click();
  await completeExam(juniorAnswers, true);
  assert.equal(await page.getByRole('heading', { name: 'Грейд подтверждён', exact: true }).isVisible(), true);
  await page.getByRole('button', { name: 'К профилю', exact: true }).click();
  assert.equal(await page.locator('.category-status strong').textContent(), 'Junior');
  await tab('Тестирование');
  await page.getByLabel('Предполагаемый грейд').selectOption('Middle');
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
  assert.equal(await mobile.locator('.candidate-row').count(), 3);
  await noOverflow(mobile);
  await audit(mobile);
  await mobile.getByRole('button', { name: /^Анна Морозова/ }).click();
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
  }
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

  await page.evaluate(() => localStorage.setItem('predel:platform:v1', '{broken'));
  await page.goto(base + '?role=employer&tab=candidates');
  await rows(7);
  assert.deepEqual(errors, [], 'Browser runtime errors');
  console.log('PASS Recovery from corrupted storage, no browser errors');
} finally {
  await context.close();
  await browser.close();
}
