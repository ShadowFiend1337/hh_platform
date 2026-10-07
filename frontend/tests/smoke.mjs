import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
// Node-only fixtures; they are never served or bundled with the browser app.
import { programs } from '../../server/bank.mjs';
import { defaultSearchFilters, normalizeSearchFilters } from '../../shared/search.ts';

const require = createRequire(import.meta.url);
const base = process.env.PREDEL_URL || 'http://127.0.0.1:5173';
const output = resolve('test-results');
const storageKey = 'predel:platform:v2';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const contexts = [context];
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error'
  && !(new URL(message.location().url || base).pathname === '/api/auth/me' && message.text().includes('401'))) errors.push(message.text()); });
page.setDefaultTimeout(15000);

async function rows(expected) {
  await page.waitForFunction(count => document.querySelectorAll('.candidate-row').length === count, expected);
}
async function saved(target = page) {
  await target.waitForFunction(() => {
    const status = document.querySelector('.main-content')?.getAttribute('data-sync-status');
    return status === 'saved' || status === 'error';
  });
  assert.equal(await target.locator('.main-content').getAttribute('data-sync-status'), 'saved', 'Server persistence failed');
  assert.equal(await target.locator('.data-status').count(), 0, 'Successful saves must not leave a status banner');
  assert.equal(await target.getByText('Изменения сохранены', { exact: true }).count(), 0, 'Successful saves must stay visually silent');
  assert.equal(await target.locator('.data-error').count(), 0, 'Successful saves must clear persistence errors');
}
async function persist(action, target = page) {
  const response = target.waitForResponse(value => new URL(value.url()).pathname === '/api/platform/state' && value.request().method() === 'PUT');
  await action();
  assert.equal((await response).status(), 200, 'The server must accept the changes');
  await saved(target);
}
async function directoryResults(target = page, expectedTotal) {
  const search = await target.evaluate(() => JSON.parse(sessionStorage.getItem('predel:search') || '{}'));
  const response = await target.request.get(base + '/api/directory/search?' + new URLSearchParams({ q: search.query || '', filters: JSON.stringify(normalizeSearchFilters(search.filters)), limit: '30', offset: '0' }));
  assert.equal(response.status(), 200, 'Directory data must come from the actual server');
  const result = await response.json();
  if (expectedTotal !== undefined) assert.equal(result.total, expectedTotal);
  const expected = result.items.map(item => item.person.name);
  await target.waitForFunction(({ expected, total }) => {
    const list = document.querySelector('.candidate-list');
    const names = [...document.querySelectorAll('.person-link')].map(element => element.textContent);
    return list?.getAttribute('aria-busy') === 'false' && JSON.stringify(names) === JSON.stringify(expected)
      && document.querySelector('.list-heading > span')?.textContent.startsWith(total + ' ');
  }, { expected, total: result.total });
  return result;
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

const answerKey = grade => new Map(programs.Frontend[grade].families.flatMap(family => family.variants.map(variant => [variant.text, variant.options[variant.correct]])));
const middleAnswers = answerKey('Middle');
async function completeExam(answerSet, correct) {
  for (let index = 0; index < 6; index++) {
    await page.locator('.exam-progress[aria-valuenow="' + (index + 1) + '"]').waitFor();
    const choices = page.locator('.answer-option');
    const texts = await choices.locator('span').allTextContents();
    const expected = answerSet.get(await page.locator('.question-text').textContent());
    assert.ok(expected, 'Question must belong to the server fixture bank');
    const chosen = texts.findIndex(text => (text.trim() === expected) === correct);
    assert.ok(chosen >= 0, 'Expected an answer option for this program');
    await choices.nth(chosen).click();
    await page.getByRole('button', { name: index === 5 ? 'Завершить тест' : 'Далее', exact: true }).click();
  }
  await page.locator('.assessment-result').waitFor();
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
  await target.getByLabel('Общий стаж', { exact: true }).fill('3 года');
  await target.getByLabel('Город', { exact: true }).fill('Москва');
  await target.getByLabel('Согласен на обработку персональных данных', { exact: true }).check();
}

try {
  // Persist a private initial state before browsing so migration cannot cancel pagination.
  const existing = await (await context.request.get(base + '/api/platform/state')).json();
  if (!existing.state) {
    const { createInitialState } = await import('../src/model.ts');
    assert.equal((await context.request.put(base + '/api/platform/state', { data: { state: createInitialState(), baseRevision: existing.revision } })).status(), 200);
  }
  const baseline = await (await context.request.get(base + '/api/directory/search?' + new URLSearchParams({ q: '', filters: JSON.stringify(defaultSearchFilters), limit: '30', offset: '0' }))).json();
  assert.ok(baseline.total >= 146, 'The directory includes the full fictional corpus');
  await page.goto(base);
  await page.locator('.hero-art img').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.hero-art img').evaluate(image => image.decode());
  await page.screenshot({ path: resolve(output, 'landing-desktop.png'), fullPage: false });
  await noOverflow(page);
  await audit(page);
  await page.locator('.hero-actions').getByRole('button', { name: 'Попробовать', exact: true }).click();
  await rows(30);
  assert.equal(new URL(page.url()).pathname, '/app');
  await page.goBack();
  await page.locator('.landing').waitFor();
  await page.goForward();
  await rows(30);
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
  const selected = await directoryResults();
  assert.ok(selected.total > 0 && selected.items.every(item => item.person.confirmed.specialization === 'Frontend' && item.person.confirmed.grade === 'Middle'));
  await persist(() => page.getByRole('button', { name: 'Сохранить подборку', exact: true }).click());
  await page.getByLabel('Есть достижения ФСП').check();
  const fspSelected = await directoryResults();
  assert.ok(fspSelected.total > 0 && fspSelected.items.every(item => item.person.achievements.length > 0));
  await page.getByRole('button', { name: 'Подборки', exact: true }).click();
  await page.locator('.saved-item').getByRole('button', { name: 'Frontend Middle React TypeScript', exact: true }).click();
  await directoryResults(page, selected.total);
  await tab('Приглашения');
  await tab('Кандидаты');
  await directoryResults(page, selected.total);
  assert.equal(await page.getByRole('textbox', { name: 'Потребность работодателя' }).inputValue(), 'Frontend Middle React TypeScript');
  await page.getByRole('button', { name: 'Очистить поиск', exact: true }).click();
  await directoryResults(page, baseline.total);
  console.log('PASS Query, filters, FSP and saved selection');

  await role('Кандидат');
  await page.getByRole('heading', { name: 'Анкета', exact: true }).waitFor();
  await page.goto(base + '/app?role=candidate&tab=invitations');
  await page.getByRole('heading', { name: 'Анкета', exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Анкета', exact: true }).isVisible(), true, 'A direct link cannot skip the questionnaire');
  assert.equal(await page.getByLabel('Показывать профиль работодателям', { exact: true }).isChecked(), false);
  await page.getByRole('button', { name: 'К тесту', exact: true }).click();
  assert.equal(await page.getByRole('heading', { name: 'Анкета', exact: true }).isVisible(), true, 'Required answers prevent an empty submission');
  await fillSurvey();
  assert.equal(await page.locator('input[name="softSkills"]').count(), 5, 'The questionnaire offers optional self-reported skills');
  await noOverflow(page);
  await page.screenshot({ path: resolve(output, 'onboarding-desktop.png'), fullPage: true });
  await audit(page);
  await persist(() => page.getByRole('button', { name: 'К тесту', exact: true }).click());
  await page.getByRole('button', { name: 'Начать тест', exact: true }).waitFor();
  await saved();
  let current = await state();
  assert.equal(current.profile.confirmed, null);
  assert.equal(current.profile.visible, false);
  assert.equal(current.surveys.length, 1);
  assert.deepEqual(current.profile.softSkills, [], 'Self-reported soft skills can remain empty');
  assert.deepEqual(current.surveys[0].softSkills, []);
  assert.equal(current.history.length, 0);
  assert.equal(current.invitations.length, 0);
  await page.goto(base + '/app?role=candidate&tab=profile');
  await page.getByRole('button', { name: 'Начать тест', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Начать тест', exact: true }).waitFor();
  current = await state();
  assert.deepEqual(current.profile.softSkills, []);
  assert.equal(current.profile.surveyCompletedAt, current.surveys[0].date, 'Empty soft skills preserve the completed questionnaire after reload');
  await page.getByRole('button', { name: 'Начать тест', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Далее', exact: true }).isDisabled(), true);
  await completeExam(middleAnswers, false);
  await saved();
  await page.getByRole('heading', { name: 'Грейд не подтверждён', exact: true }).waitFor();
  current = await state();
  assert.equal(current.profile.confirmed, null, 'First failure cannot confirm a category');
  assert.equal(current.history.length, 1);
  assert.equal(current.history[0].surveyId, current.surveys[0].id);
  await role('Работодатель');
  await directoryResults(page, baseline.total);
  await role('Кандидат');
  await page.getByRole('button', { name: 'Начать тест', exact: true }).click();
  await completeExam(middleAnswers, true);
  await saved();
  await page.getByRole('heading', { name: 'Грейд подтверждён', exact: true }).waitFor();
  current = await state();
  assert.equal(current.profile.confirmed.grade, 'Middle');
  assert.equal(current.history.length, 2);
  assert.ok(current.history.every(result => result.surveyId === current.surveys[0].id));
  assert.equal(new URL(page.url()).searchParams.get('tab'), 'assessment', 'A direct profile entry retains the test result until the candidate continues');
  const surveyDate = current.profile.surveyCompletedAt;
  await page.getByRole('button', { name: 'К профилю', exact: true }).click();
  assert.equal(await page.locator('input[name="softSkills"]').count(), 5, 'Self-reported skills can be edited in the profile');
  assert.equal(await page.getByRole('combobox', { name: 'Отрасль', exact: true }).inputValue(), 'ИТ');
  assert.equal(await page.getByLabel('Роль в команде', { exact: true }).inputValue(), 'Разработчик');
  await role('Работодатель');
  await directoryResults(page, baseline.total);
  assert.equal(await page.getByRole('button', { name: /^Анна Морозова/ }).count(), 0, 'Passing does not publish the profile automatically');
  await role('Кандидат');
  await page.getByLabel('Город', { exact: true }).fill('');
  await page.getByLabel('Показывать профиль работодателям', { exact: true }).check();
  await persist(() => page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click());
  assert.equal((await state()).profile.surveyCompletedAt, surveyDate, 'Editing an optional city or privacy preserves the completed questionnaire');
  await page.getByLabel('Город', { exact: true }).fill('Москва');
  await persist(() => page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click());
  await role('Работодатель');
  await directoryResults(page, baseline.total + 1);
  console.log('PASS Mandatory questionnaire, first failure, category confirmation, persistence and publication consent');

  await page.getByRole('combobox', { name: 'Специализация', exact: true }).selectOption('Frontend');
  await page.locator('.segmented').getByRole('button', { name: 'Middle', exact: true }).click();
  await page.locator('.stack-filters').getByRole('button', { name: 'CSS', exact: true }).click();
  await page.locator('.directory-extra summary').click();
  await page.getByRole('combobox', { name: 'Город', exact: true }).selectOption('Москва');
  const inviteSelection = await directoryResults();
  assert.ok(inviteSelection.items.some(item => item.person.name === 'Михаил Соколов') && inviteSelection.items.some(item => item.person.name === 'Анна Морозова'));

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
  await persist(() => page.getByRole('button', { name: 'Отправить приглашение', exact: true }).click());
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
  await persist(() => page.getByRole('button', { name: 'Отправить приглашение', exact: true }).click());
  await tab('Приглашения');
  assert.equal(await page.locator('.invitation-card').count(), 2);
  assert.equal(await page.locator('a[href="mailto:anna@example.com"]').count(), 0);
  console.log('PASS Required salary, invalid range and outgoing invitation');

  await role('Кандидат');
  await tab('Приглашения');
  assert.equal(await page.locator('.invitation-card').count(), 1, 'Candidate only sees own invitation');
  await persist(() => page.getByRole('button', { name: 'Принять', exact: true }).click());
  await page.locator('.status-accepted').waitFor();
  await role('Работодатель');
  await tab('Приглашения');
  assert.equal(await page.locator('a[href="mailto:anna@example.com"]').count(), 1);
  await page.reload();
  await page.locator('a[href="mailto:anna@example.com"]').waitFor();
  assert.equal(await page.locator('a[href="mailto:anna@example.com"]').count(), 1);
  console.log('PASS Shared statuses, contact disclosure and persistence');

  await role('Кандидат');
  await page.getByLabel('Показывать профиль работодателям').uncheck();
  await persist(() => page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click());
  await role('Работодатель');
  await page.locator('.filter-heading').getByRole('button', { name: 'Сбросить', exact: true }).click();
  await directoryResults(page, baseline.total);
  assert.equal(await page.getByRole('button', { name: /^Анна Морозова/ }).count(), 0);
  await role('Кандидат');
  await page.getByLabel('Показывать профиль работодателям').check();
  await persist(() => page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click());
  await tab('Тестирование');
  await page.getByRole('button', { name: 'Начать тест', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Далее', exact: true }).isDisabled(), true);
  await completeExam(middleAnswers, false);
  await saved();
  await page.getByRole('heading', { name: 'Грейд не подтверждён', exact: true }).waitFor();
  assert.equal(await page.getByText('Ваша категория Frontend · Middle сохранена.', { exact: true }).isVisible(), true);
  await page.getByRole('button', { name: 'Изменить анкету', exact: true }).click();
  await page.getByRole('combobox', { name: 'Предполагаемый грейд', exact: true }).selectOption('Junior');
  await persist(() => page.getByRole('button', { name: 'К тесту', exact: true }).click());
  assert.equal((await state()).profile.confirmed.grade, 'Middle', 'Self reported grade cannot replace confirmed grade');
  assert.equal(await page.getByRole('button', { name: 'Начать тест', exact: true }).isDisabled(), true, 'A new category is locked for 90 days after confirmation');
  await page.evaluate(key => {
    const stored = JSON.parse(localStorage.getItem(key));
    stored.profile.gradeChangedAt = new Date(Date.now() - 100 * 86400000).toISOString();
    localStorage.setItem(key, JSON.stringify(stored));
  }, storageKey);
  await page.reload();
  await page.getByRole('button', { name: 'Начать тест', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Начать тест', exact: true }).isDisabled(), true);
  assert.equal((await state()).profile.gradeChangedAt, current.profile.gradeChangedAt, 'The server restores its confirmation timestamp after cache tampering');
  assert.equal((await state()).profile.confirmed.grade, 'Middle');
  console.log('PASS Privacy, failed attempt, category lock and server authority over cache tampering');

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  contexts.push(mobileContext);
  const mobile = await mobileContext.newPage();
  mobile.on('pageerror', error => errors.push(error.message));
  await mobile.goto(base);
  await mobile.evaluate(() => document.fonts.ready);
  await mobile.locator('.hero-art img').evaluate(image => image.decode());
  await mobile.screenshot({ path: resolve(output, 'landing-mobile.png'), fullPage: false });
  await noOverflow(mobile);
  await mobile.getByRole('button', { name: 'Открыть меню', exact: true }).click();
  await mobile.locator('.mobile-menu').getByRole('link', { name: 'Возможности', exact: true }).click();
  assert.equal(await mobile.locator('.mobile-menu').count(), 0);
  await mobile.locator('.hero-actions').getByRole('button', { name: 'Попробовать', exact: true }).click();
  await directoryResults(mobile);
  await noOverflow(mobile);
  await mobile.screenshot({ path: resolve(output, 'mobile.png'), fullPage: true });
  await mobile.getByRole('button', { name: 'Фильтры', exact: true }).click();
  await mobile.locator('.filters').getByLabel('Специализация').selectOption('Frontend');
  await mobile.locator('.filter-group').getByRole('button', { name: 'Middle', exact: true }).click();
  const mobileSelection = await directoryResults(mobile);
  assert.ok(mobileSelection.total > 0 && mobileSelection.items.every(item => item.person.confirmed.specialization === 'Frontend' && item.person.confirmed.grade === 'Middle'));
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
    if (route.includes('role=candidate')) {
      await mobile.getByRole('heading', { name: 'Анкета', exact: true }).waitFor();
      assert.equal(await mobile.getByRole('heading', { name: 'Анкета', exact: true }).isVisible(), true);
    }
    if (route.includes('tab=company')) await mobile.getByRole('heading', { name: 'Компания', exact: true }).waitFor();
    await noOverflow(mobile);
  }
  await mobile.goto(base + '/app?role=candidate&tab=profile');
  await mobile.getByRole('heading', { name: 'Анкета', exact: true }).waitFor();
  await fillSurvey(mobile);
  assert.equal(await mobile.locator('input[name="softSkills"]').count(), 5);
  await noOverflow(mobile);
  await mobile.screenshot({ path: resolve(output, 'onboarding-mobile.png'), fullPage: true });
  await audit(mobile);
  await persist(() => mobile.getByRole('button', { name: 'К тесту', exact: true }).click(), mobile);
  await mobile.getByRole('button', { name: 'Начать тест', exact: true }).waitFor();
  await noOverflow(mobile);
  await mobileContext.request.delete(base + '/api/platform/state');
  await mobileContext.close();
  console.log('PASS Mobile 390px, 320px and keyboard dialog');

  await page.locator('.site-header .brand').click();
  await page.getByLabel('Кого вы ищете?').fill('Backend Middle Python PostgreSQL');
  await page.locator('.brief-toolbar').getByRole('button', { name: 'Попробовать', exact: true }).click();
  const landingSelected = await directoryResults();
  assert.ok(landingSelected.total > 0 && landingSelected.items.every(item => item.person.confirmed.specialization === 'Backend' && item.person.confirmed.grade === 'Middle'));
  assert.equal(await page.getByRole('textbox', { name: 'Потребность работодателя' }).inputValue(), 'Backend Middle Python PostgreSQL');
  await page.getByRole('button', { name: 'Очистить поиск', exact: true }).click();
  await directoryResults(page, baseline.total + 1);
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
  await page.locator('.profile-form').waitFor();
  assert.equal(await page.getByLabel('Email', { exact: true }).inputValue(), 'anna@example.com', 'The canonical server state overrides tampered legacy cache');
  current = await state();
  assert.equal(current.version, 2);
  assert.equal(current.profile.confirmed.grade, 'Middle', 'Only the server-earned category is restored');
  assert.equal(current.history.length, completedProfile.history.length);
  assert.equal(current.invitations.length, completedProfile.invitations.length);
  assert.equal(current.savedSearches.length, completedProfile.savedSearches.length);
  console.log('PASS Server restoration of contacts, earned category, history and invitations');

  const migrationContext = await browser.newContext({ reducedMotion: 'reduce' });
  contexts.push(migrationContext);
  const legacy = { ...completedProfile, version: 1, profile: { ...completedProfile.profile, visible: false, email: 'edited@example.com' }, invitations: [], savedSearches: [] };
  delete legacy.surveys;
  for (const key of ['industry', 'professionalRole', 'softSkills', 'surveyCompletedAt']) delete legacy.profile[key];
  const legacyDate = new Date().toISOString();
  legacy.profile.confirmed = { specialization: 'Frontend', grade: 'Middle', score: 86, date: legacyDate };
  legacy.history = [{ id: 'test-initial', specialization: 'Frontend', grade: 'Middle', score: 86, date: legacyDate, passed: true }];
  await migrationContext.addInitScript(value => localStorage.setItem('predel:platform:v1', JSON.stringify(value)), legacy);
  const migration = await migrationContext.newPage();
  await migration.goto(base + '/app?role=candidate&tab=profile');
  await migration.getByRole('heading', { name: 'Анкета', exact: true }).waitFor();
  await migration.locator('.main-content[data-sync-status="error"]').waitFor();
  await migration.locator('.data-error').getByRole('button', { name: 'Повторить сохранение', exact: true }).waitFor();
  assert.equal(await migration.locator('.data-error').getAttribute('role'), 'alert');
  assert.match(await migration.locator('.data-error').textContent(), /Для сохранения личной анкеты необходимо согласие/u);
  assert.equal(await migration.getByLabel('Email', { exact: true }).inputValue(), 'edited@example.com', 'An unconsented legacy draft stays editable locally');
  assert.equal(await migration.getByLabel('Согласен на обработку персональных данных', { exact: true }).isChecked(), false, 'Synthetic legacy consent is never accepted automatically');
  assert.equal((await (await migrationContext.request.get(base + '/api/platform/state')).json()).state, null, 'The server rejects private legacy contacts before explicit consent');
  await migration.getByRole('combobox', { name: 'Отрасль', exact: true }).selectOption('ИТ');
  await migration.getByLabel('Роль в команде', { exact: true }).fill('Разработчик');
  await migration.getByRole('combobox', { name: 'Специализация', exact: true }).selectOption('Frontend');
  await migration.getByRole('combobox', { name: 'Предполагаемый грейд', exact: true }).selectOption('Middle');
  await migration.getByLabel('Согласен на обработку персональных данных', { exact: true }).check();
  assert.equal(await migration.locator('.onboarding-form').evaluate(form => form.checkValidity()), true);
  await persist(() => migration.getByRole('button', { name: 'К тесту', exact: true }).click(), migration);
  const migrated = await (await migrationContext.request.get(base + '/api/platform/state')).json();
  assert.equal(migrated.state.profile.email, 'edited@example.com', 'Explicit consent permits the private edited contact to migrate');
  assert.equal(migrated.state.profile.consent, true);
  assert.equal(migrated.state.profile.confirmed, null, 'An old synthetic category is not a server assessment');
  assert.equal(migrated.state.history.length, 0);
  assert.equal(migrated.state.profile.visible, false);
  console.log('PASS Isolated legacy migration requires explicit consent and rejects a synthetic qualification');
  await migrationContext.request.delete(base + '/api/platform/state');
  await migrationContext.close();

  await page.evaluate(key => localStorage.setItem(key, '{broken'), storageKey);
  await page.goto(base + '?role=employer&tab=candidates');
  await directoryResults(page, baseline.total + 1);
  assert.equal((await state()).profile.email, 'anna@example.com', 'Corrupted cache must recover the canonical profile');
  assert.deepEqual(errors, [], 'Browser runtime errors');
  console.log('PASS Recovery from corrupted storage, no browser errors');
} finally {
  await Promise.all(contexts.map(context => context.request.delete(base + '/api/platform/state').catch(() => {})));
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
}
