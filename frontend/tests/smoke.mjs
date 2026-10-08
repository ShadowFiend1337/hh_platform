import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
// Node-only fixtures; they are never served or bundled with the browser app.
import { programs } from '../../server/bank.mjs';
import { directoryCandidates } from '../../server/directory-seed.mjs';
import { normalizeSearchFilters } from '../../shared/search.ts';
import { createInitialState } from '../src/model.ts';
import { startIsolatedService } from './helpers/isolated-service.mjs';

const require = createRequire(import.meta.url);
const isolated = await startIsolatedService();
const base = isolated.base;
const output = resolve('test-results');
const storageKey = 'predel:platform:v2';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const contexts = [context];
let page = await context.newPage();
const guestPage = page;
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const candidateName = 'Анна Морозова ' + suffix;
const otherName = 'Михаил Соколов ' + suffix;
const actors = new Map();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error'
  && !(new URL(message.location().url || base).pathname === '/api/auth/me' && message.text().includes('401'))) errors.push(message.text()); });
page.setDefaultTimeout(90000);
let apiBudgetQueue = Promise.resolve();
let nextBrowserApiRequest = 0;
let pacingReported = false;
await prepareContext(context);

async function prepareContext(target) {
  target.setDefaultTimeout(90000);
  target.on('response', response => {
    if (new URL(response.url()).pathname.startsWith('/api/') && response.status() === 429) {
      errors.push('Unexpected API rate limit: ' + new URL(response.url()).pathname);
    }
  });
  // This smoke drives several browser devices much faster than a person.
  // Reserve a shared budget below the real per-IP limit, leaving room for
  // explicit API fixtures and assertions. Runtime security remains unchanged.
  await target.route('**/api/**', async route => {
    const reserve = apiBudgetQueue.then(async () => {
      const delay = nextBrowserApiRequest - Date.now();
      if (delay > 0) {
        if (!pacingReported) {
          console.log('PACE Browser smoke respects the shared local API request limit');
          pacingReported = true;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      // Evenly spaced requests avoid a long burst pause exceeding the
      // application's own request timeout during login or assessment loading.
      nextBrowserApiRequest = Date.now() + 600;
    });
    apiBudgetQueue = reserve;
    await reserve;
    await route.continue();
  });
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
  const response = await target.request.get(base + '/api/directory/search?' + new URLSearchParams({ q: search.query || '', filters: JSON.stringify(normalizeSearchFilters(search.filters)), limit: '30', offset: '0' }), { timeout: 130000 });
  assert.equal(response.status(), 200, 'Directory data must come from the actual server');
  const result = await response.json();
  if (expectedTotal !== undefined) assert.equal(result.total, expectedTotal);
  const expected = result.items.map(item => item.person.name);
  await target.waitForFunction(({ expected, total }) => {
    const list = document.querySelector('.candidate-list');
    const names = [...document.querySelectorAll('.person-link')].map(element => element.textContent);
    return Boolean(document.querySelector('.directory-error')) || list?.getAttribute('aria-busy') === 'false' && JSON.stringify(names) === JSON.stringify(expected)
      && document.querySelector('.list-heading > span')?.textContent.startsWith(total + ' ');
  }, { expected, total: result.total }, { timeout: 130000 });
  assert.equal(await target.locator('.directory-error').count(), 0,
    'A successful directory API response must also reach the UI: ' + (await target.locator('.directory-error').allTextContents()).join(' '));
  return result;
}
async function role(next) {
  const actor = actors.get(next);
  assert.ok(actor, 'Each role uses its own verified account.');
  page = actor.page;
  const accountRole = next === 'Кандидат' ? 'candidate' : 'employer';
  await page.goto(base + '/app?role=' + accountRole + '&tab=' + (accountRole === 'candidate' ? 'profile' : 'candidates'));
  await saved();
  assert.equal(await page.locator('.role-control').count(), 0, 'Verified account roles cannot be switched in the interface');
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

async function state(target = page) {
  return target.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
}

async function fillSurvey(target = page, name = candidateName, email = 'anna@example.com') {
  await target.getByLabel('Имя и фамилия', { exact: true }).fill(name);
  await target.getByLabel('Email', { exact: true }).fill(email);
  await target.getByRole('combobox', { name: 'Отрасль', exact: true }).selectOption('ИТ');
  await target.getByLabel('Роль в команде', { exact: true }).fill('Разработчик');
  await target.getByRole('combobox', { name: 'Специализация', exact: true }).selectOption('Frontend');
  await target.getByRole('combobox', { name: 'Предполагаемый грейд', exact: true }).selectOption('Middle');
  await target.getByLabel('Стек', { exact: true }).fill('React, TypeScript, CSS');
  await target.getByLabel('Общий стаж', { exact: true }).fill('3 года');
  await target.getByLabel('Город', { exact: true }).fill('Москва');
  await target.getByLabel('Места работы и проекты', { exact: true }).fill('Разработка веб-приложений на React и TypeScript. Адаптивная HTML и CSS верстка, доступные формы, дизайн-система компонентов и оптимизация загрузки страниц.');
  await target.locator('.onboarding-details summary').click();
  await target.getByLabel('О себе', { exact: true }).fill('Frontend-разработчик. Создаю интерфейсы веб-приложений на React и TypeScript, доступные формы и адаптивную CSS верстку.');
  await target.locator('.onboarding-details summary').click();
  await target.getByLabel('Согласен на обработку персональных данных', { exact: true }).check();
}

async function registeredActor(role, label, name, suppliedContext) {
  const actorContext = suppliedContext || await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  if (!suppliedContext) { contexts.push(actorContext); await prepareContext(actorContext); }
  const email = label + '.' + suffix + '@example.invalid';
  const requested = await actorContext.request.post(base + '/api/auth/register/request-code', {
    data: { role, login: label + '.' + suffix, email, password: 'LocalSmoke927!', consent: true, privacyVersion: PRIVACY_POLICY_VERSION,
      ...(role === 'candidate' ? { name } : { companyName: name }) },
  });
  assert.equal(requested.status(), 202, await requested.text());
  const delivery = await requested.json();
  assert.equal(delivery.delivery, 'development', 'Smoke verification uses only its in-memory mailbox.');
  assert.equal(delivery.code, undefined, 'The verification code is not a public API response.');
  const code = isolated.codes.get(email);
  assert.match(code || '', /^\d{6}$/u, 'The isolated fictional registration must receive its private code.');
  const verified = await actorContext.request.post(base + '/api/auth/register/verify', { data: { email, code } });
  assert.equal(verified.status(), 201, await verified.text());
  const actorPage = await actorContext.newPage();
  actorPage.setDefaultTimeout(90000);
  actorPage.on('pageerror', error => errors.push(error.message));
  const initialized = role === 'employer' ? actorPage.waitForResponse(response => new URL(response.url()).pathname === '/api/platform/state'
    && response.request().method() === 'PUT' && response.status() === 200
    && response.request().postDataJSON()?.state.company.contact === email) : Promise.resolve();
  await actorPage.goto(base + '/app?role=' + role + '&tab=' + (role === 'candidate' ? 'profile' : 'candidates'));
  await initialized;
  await saved(actorPage);
  const actor = { context: actorContext, page: actorPage, email, login: label + '.' + suffix, password: 'LocalSmoke927!' };
  return actor;
}

async function localFixture(role) {
  const fixtureContext = await browser.newContext();
  contexts.push(fixtureContext);
  const email = role === 'candidate' ? 'candidate@local.example.test' : 'employer@local.example.test';
  const input = { role, login: 'local_' + role, email, password: 'LocalFixture927!', consent: true, privacyVersion: PRIVACY_POLICY_VERSION,
    ...(role === 'candidate' ? { name: 'Изолированный локальный профиль' } : { companyName: 'Изолированная локальная команда' }) };
  const requested = await fixtureContext.request.post(base + '/api/auth/register/request-code', { data: input });
  assert.equal(requested.status(), 202, await requested.text());
  const verified = await fixtureContext.request.post(base + '/api/auth/register/verify', {
    data: { email, code: isolated.codes.get(email) },
  });
  assert.equal(verified.status(), 201, await verified.text());
  const token = (await fixtureContext.cookies(base + '/api/platform/state')).find(cookie => cookie.name === 'predel_account_session')?.value;
  const identity = isolated.service.auth.accountForToken(token);
  assert(identity?.platformOwner);
  return { context: fixtureContext, owner: identity.platformOwner };
}

try {
  assert.equal((await context.request.get(base + '/api/platform/state')).status(), 401);
  assert.equal((await context.request.get(base + '/api/directory/search')).status(), 401);
  assert.equal((await context.request.put(base + '/api/platform/state', { data: { state: createInitialState(), baseRevision: 0 } })).status(), 401);
  await page.goto(base);
  await page.locator('.hero-art img').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.hero-art img').evaluate(image => image.decode());
  await page.screenshot({ path: resolve(output, 'landing-desktop.png'), fullPage: false });
  await noOverflow(page);
  await audit(page);
  await page.locator('.landing-partners img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
  assert.equal(await page.locator('.landing-partners img').evaluateAll(images => images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0)), true);
  await page.locator('.hero-actions').getByRole('button', { name: 'Попробовать', exact: true }).click();
  await page.getByRole('heading', { name: 'Регистрация', exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/auth');
  assert.equal(await page.locator('.candidate-row').count(), 0);
  await page.goBack();
  await page.locator('.landing').waitFor();
  await page.goForward();
  await page.getByRole('heading', { name: 'Регистрация', exact: true }).waitFor();
  console.log('PASS Original landing, registration-only Try entry and browser history');
  await page.evaluate(() => document.fonts.ready);
  await noOverflow(page);
  await page.screenshot({ path: resolve(output, 'desktop.png'), fullPage: true });
  await audit(page);
  console.log('PASS Desktop landing and signup assets and accessibility');

  // Real publication and invitations belong to separately verified accounts.
  // A second candidate lets the smoke prove that incoming invitations are private.
  const other = await registeredActor('candidate', 'smoke.other', otherName);
  page = other.page;
  await fillSurvey(page, otherName, 'other.' + suffix + '@example.invalid');
  await persist(() => page.getByRole('button', { name: 'К тесту', exact: true }).click());
  await page.getByRole('button', { name: 'Начать тест', exact: true }).click();
  await completeExam(middleAnswers, true);
  await saved();
  await page.getByRole('button', { name: 'К профилю', exact: true }).click();
  await page.getByLabel('Показывать профиль работодателям', { exact: true }).check();
  await persist(() => page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click());
  const candidateActor = await registeredActor('candidate', 'smoke.candidate', candidateName);
  const employerActor = await registeredActor('employer', 'smoke.employer', 'Компания проверки');
  const localCandidate = await localFixture('candidate');
  const localEmployer = await localFixture('employer');
  const localProfile = { ...directoryCandidates[0], id: 'smoke-local-candidate', name: 'Изолированный локальный профиль',
    city: 'Учебный город локальных аккаунтов', synthetic: true, visible: true, consent: true };
  isolated.service.directory.store.upsert(localProfile, localCandidate.owner, true);
  const localDirectory = await localEmployer.context.request.get(base + '/api/directory/search');
  assert.equal(localDirectory.status(), 200);
  const localResult = await localDirectory.json();
  assert.deepEqual(localResult.items.map(item => item.person.id), [localProfile.id], 'Local teaching accounts have a separate interactive pool.');
  actors.set('Кандидат', candidateActor);
  actors.set('Работодатель', employerActor);
  page = employerActor.page;
  const baseline = await directoryResults();
  const registeredPoolResponse = await employerActor.context.request.get(base + '/api/directory/search?' + new URLSearchParams({
    filters: JSON.stringify({ specialization: 'Frontend', grade: 'Middle', stack: ['React', 'TypeScript'] }),
    limit: '50', offset: '0',
  }));
  assert.equal(registeredPoolResponse.status(), 200);
  const registeredPool = await registeredPoolResponse.json();
  assert.ok(registeredPool.total <= registeredPool.items.length, 'The targeted fixture category fits in one full page.');
  const publishedOther = registeredPool.items.find(item => item.person.name === otherName);
  assert.ok(publishedOther && !publishedOther.person.synthetic && !publishedOther.person.demoProfile,
    'The registered and consenting candidate remains available alongside labelled catalog examples.');
  assert.ok(baseline.items.some(item => item.person.demoProfile), 'The built-in demo catalog is available after employer registration.');
  assert.ok(baseline.items.every(item => !item.person.synthetic || item.person.demoProfile === true),
    'Only server-marked ownerless catalog examples may be synthetic in the ordinary employer pool.');
  assert.ok(baseline.items.every(item => !item.person.email && !item.person.phone), 'The directory omits unrevealed contacts.');
  const outsideRealm = await employerActor.context.request.get(base + '/api/directory/search?' + new URLSearchParams({
    filters: JSON.stringify({ city: localProfile.city }), limit: '30', offset: '0',
  }));
  assert.equal(outsideRealm.status(), 200);
  assert.equal((await outsideRealm.json()).total, 0,
    'An ordinary verified employer cannot enter the interactive local-account pool.');
  for (const item of baseline.items.filter(item => item.person.demoProfile)) {
    const row = page.locator('.candidate-row').filter({ has: page.locator('.person-link', { hasText: item.person.name }) });
    assert.equal(await row.getByText('Демо', { exact: true }).count(), 1);
    assert.equal(await row.getByRole('button', { name: 'Пригласить', exact: true }).count(), 0, 'Catalog examples cannot receive invitations.');
  }
  const demo = baseline.items.find(item => item.person.demoProfile).person;
  assert.equal((await employerActor.context.request.get(base + '/api/directory/' + encodeURIComponent(demo.id) + '/contacts')).status(), 404,
    'A catalog example has no disclosable contacts.');
  assert.equal((await candidateActor.context.request.get(base + '/api/directory/search')).status(), 403, 'A candidate account cannot read another candidate directory.');
  await candidateActor.page.goto(base + '/app?role=employer&tab=candidates');
  await candidateActor.page.waitForURL(url => url.searchParams.get('role') === 'candidate');
  assert.equal(await candidateActor.page.locator('.role-control').count(), 0, 'The candidate URL cannot change the verified account role.');
  console.log('PASS Verified roles, registered candidates, protected demo catalog and isolated local accounts');
  await page.evaluate(() => document.fonts.ready);
  await noOverflow(page); await audit(page);
  const explanation = page.locator('.match-details').first();
  await explanation.locator('summary').click();
  assert.equal(await explanation.locator('p').isVisible(), true, 'Matching explanation remains available');
  await explanation.locator('summary').click();
  await page.screenshot({ path: resolve(output, 'desktop.png'), fullPage: true });

  await page.getByRole('textbox', { name: 'Потребность работодателя' }).fill('Frontend Middle React TypeScript');
  await page.getByRole('button', { name: 'Подобрать', exact: true }).click();
  const selected = await directoryResults();
  assert.ok(selected.total > 0 && selected.items.every(item => item.person.confirmed.specialization === 'Frontend' && item.person.confirmed.grade === 'Middle'));
  assert.equal(selected.model.trained, true, 'Category recommendations in this smoke use the actual trained search pipeline.');
  assert.equal(selected.total, selected.items.length, 'The targeted semantic category fits in one page for an exhaustive admission check.');
  const admittedCategories = new Map();
  for (const item of selected.items) {
    const confirmed = item.person.confirmed;
    const key = confirmed.specialization + ':' + confirmed.grade;
    admittedCategories.set(key, (admittedCategories.get(key) || 0) + 1);
  }
  assert.deepEqual(selected.categories.map(category => [category.specialization + ':' + category.grade, category.count]),
    [...admittedCategories], 'Recommendations use the confirmed categories of exactly the model-admitted profiles.');
  for (const category of selected.categories) {
    assert(category.candidateIds.length > 0 && category.candidateIds.length <= 3);
    assert(category.candidateIds.every(id => selected.items.some(item => item.person.id === id
      && item.person.confirmed.specialization === category.specialization && item.person.confirmed.grade === category.grade)));
  }
  const semanticCategory = selected.categories[0];
  const categoryRequested = page.waitForResponse(response => {
    const url = new URL(response.url());
    const category = JSON.parse(url.searchParams.get('category') || 'null');
    return url.pathname === '/api/directory/search' && category?.specialization === semanticCategory.specialization
      && category.grade === semanticCategory.grade;
  });
  await page.getByRole('region', { name: 'Рекомендованные категории', exact: true }).getByRole('button', {
    name: /^Frontend-разработчик · Middle ·/u,
  }).click();
  const categoryResponse = await categoryRequested;
  assert.equal(categoryResponse.status(), 200);
  const categoryResult = await categoryResponse.json();
  assert.deepEqual(categoryResult.selectedCategory, { specialization: semanticCategory.specialization, grade: semanticCategory.grade });
  assert.deepEqual(categoryResult.effectiveFilters, selected.effectiveFilters, 'Choosing a recommendation preserves the original hard constraints.');
  assert.equal(categoryResult.total, semanticCategory.count);
  const clearCategory = page.waitForResponse(response => new URL(response.url()).pathname === '/api/directory/search'
    && !new URL(response.url()).searchParams.has('category'));
  await page.getByRole('button', { name: 'Все категории', exact: true }).click();
  assert.equal((await clearCategory).status(), 200);
  await directoryResults(page, selected.total);
  await persist(() => page.getByRole('button', { name: 'Сохранить подборку', exact: true }).click());
  await page.getByLabel('Есть достижения ФСП').check();
  const fspSelected = await directoryResults();
  assert.ok(fspSelected.total > 0, 'The FSP filter retains clearly labelled fictional achievements in the demo catalog.');
  assert.ok(fspSelected.items.every(item => item.person.demoProfile && item.person.synthetic && item.person.achievements.length > 0));
  assert.equal(fspSelected.items.some(item => item.person.id === publishedOther.person.id), false,
    'An entered real profile does not manufacture a verified federation achievement.');
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
  assert.equal(await page.locator('input[name="softSkills"]:visible').count(), 5, 'The questionnaire offers common skills without expanding additional choices');
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
  assert.equal(await page.locator('input[name="softSkills"]:visible').count(), 5, 'Common self-reported skills can be edited in the profile');
  assert.equal(await page.getByRole('combobox', { name: 'Отрасль', exact: true }).inputValue(), 'ИТ');
  assert.equal(await page.getByLabel('Роль в команде', { exact: true }).inputValue(), 'Разработчик');
  await role('Работодатель');
  await directoryResults(page, baseline.total);
  assert.equal(await page.locator('.person-link').filter({ hasText: candidateName }).count(), 0, 'Passing does not publish the profile automatically');
  await role('Кандидат');
  await page.getByLabel('Город', { exact: true }).fill('');
  await page.getByLabel('Показывать профиль работодателям', { exact: true }).check();
  await persist(() => page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click());
  assert.equal((await state()).profile.surveyCompletedAt, surveyDate, 'Editing an optional city or privacy preserves the completed questionnaire');
  await page.getByLabel('Город', { exact: true }).fill('Москва');
  await persist(() => page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click());
  await role('Работодатель');
  await directoryResults(page, baseline.total + 1);
  assert.equal((await context.request.get(base + '/api/directory/search')).status(), 401, 'Published profiles remain unavailable to a guest.');
  assert.equal(await guestPage.locator('.candidate-row').count(), 0);
  console.log('PASS Mandatory questionnaire, first failure, category confirmation, persistence and publication consent');

  await page.getByRole('combobox', { name: 'Специализация', exact: true }).selectOption('Frontend');
  await page.locator('.segmented').getByRole('button', { name: 'Middle', exact: true }).click();
  await page.locator('.stack-filters').getByRole('button', { name: 'CSS', exact: true }).click();
  await page.locator('.directory-extra summary').click();
  await page.getByRole('combobox', { name: 'Город', exact: true }).selectOption('Москва');
  const inviteSelection = await directoryResults();
  assert.ok(inviteSelection.items.some(item => item.person.name === otherName) && inviteSelection.items.some(item => item.person.name === candidateName));
  const realCandidate = inviteSelection.items.find(item => item.person.name === candidateName).person;
  assert.equal(realCandidate.email, '', 'Directory payloads do not send unrevealed candidate email to the browser.');
  const contactUrl = base + '/api/directory/' + encodeURIComponent(realCandidate.id) + '/contacts';
  assert.equal((await employerActor.context.request.get(contactUrl)).status(), 403, 'The employer API cannot reveal a contact before acceptance.');
  assert.equal((await context.request.get(contactUrl)).status(), 401, 'The guest API cannot address real candidate contacts.');
  assert.equal((await other.context.request.get(contactUrl)).status(), 404, 'Another candidate cannot address another private contact.');

  await page.locator('.person-link').filter({ hasText: candidateName }).click();
  assert.equal(await page.locator('dialog a[href="mailto:anna@example.com"]').count(), 0);
  assert.equal(await page.getByText('Откроются после принятия приглашения', { exact: true }).isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog').count(), 0);
  assert.equal(await page.locator('.person-link').filter({ hasText: candidateName }).evaluate(element => document.activeElement === element), true);
  await page.locator('.candidate-row').filter({ hasText: candidateName }).getByRole('button', { name: 'Пригласить', exact: true }).click();
  await page.locator('input[name="salaryFrom"]').fill('180000');
  await page.locator('input[name="salaryTo"]').fill('240000');
  await page.getByLabel('Условия и задачи').fill('Разработка интерфейса продукта на React и TypeScript.');
  await persist(() => page.getByRole('button', { name: 'Отправить приглашение', exact: true }).click());
  await page.locator('.candidate-row').filter({ hasText: otherName }).getByRole('button', { name: 'Пригласить', exact: true }).click();
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
  await page.locator('a[href="mailto:anna@example.com"]').waitFor();
  assert.equal(await page.locator('a[href="mailto:anna@example.com"]').count(), 1);
  await page.reload();
  await page.locator('a[href="mailto:anna@example.com"]').waitFor();
  assert.equal(await page.locator('a[href="mailto:anna@example.com"]').count(), 1);
  const disclosed = await employerActor.context.request.get(contactUrl);
  assert.equal(disclosed.status(), 200);
  assert.equal((await disclosed.json()).email, 'anna@example.com');
  assert.equal((await context.request.get(contactUrl)).status(), 401, 'Acceptance does not grant contact access to guests.');
  assert.equal((await other.context.request.get(contactUrl)).status(), 404, 'Acceptance does not grant contact access to other candidates.');
  await other.page.goto(base + '/app?role=candidate&tab=invitations');
  await other.page.locator('.invitation-card').waitFor();
  assert.equal(await other.page.locator('.invitation-card').count(), 1, 'The other candidate receives only their own invitation.');
  assert.equal(await other.page.locator('a[href="mailto:anna@example.com"]').count(), 0, 'Another candidate cannot receive the accepted candidate contact.');
  await persist(() => other.page.getByRole('button', { name: 'Отклонить', exact: true }).click(), other.page);
  await other.page.locator('.status-rejected').waitFor();
  await page.reload();
  await page.locator('.status-rejected').waitFor();
  assert.equal(await page.locator('.status-accepted').count(), 1);
  const rejectedContactUrl = base + '/api/directory/' + encodeURIComponent(inviteSelection.items.find(item => item.person.name === otherName).person.id) + '/contacts';
  assert.equal((await employerActor.context.request.get(rejectedContactUrl)).status(), 403, 'Rejection never discloses the other candidate contact.');
  console.log('PASS Shared statuses, contact disclosure and persistence');

  await role('Кандидат');
  await page.getByLabel('Согласен на обработку персональных данных', { exact: true }).uncheck();
  await persist(() => page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click());
  assert.equal((await state()).profile.consent, false);
  assert.equal((await employerActor.context.request.get(contactUrl)).status(), 403, 'Revoking consent immediately closes previously accepted contacts.');
  await role('Работодатель');
  await directoryResults(page, inviteSelection.total - 1);
  assert.equal(await page.locator('.person-link').filter({ hasText: candidateName }).count(), 0);
  await role('Кандидат');
  await page.getByLabel('Согласен на обработку персональных данных', { exact: true }).check();
  await page.getByLabel('Показывать профиль работодателям').check();
  await persist(() => page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click());
  assert.equal((await employerActor.context.request.get(contactUrl)).status(), 200, 'The same accepted offer regains access only after renewed consent.');
  await page.getByLabel('Показывать профиль работодателям').uncheck();
  await persist(() => page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click());
  await role('Работодатель');
  await page.locator('.filter-heading').getByRole('button', { name: 'Сбросить', exact: true }).click();
  await directoryResults(page, baseline.total);
  assert.equal(await page.locator('.person-link').filter({ hasText: candidateName }).count(), 0);
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
  await prepareContext(mobileContext);
  let mobile = await mobileContext.newPage();
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
  await mobile.getByRole('heading', { name: 'Регистрация', exact: true }).waitFor();
  assert.equal(await mobile.locator('.candidate-row').count(), 0);
  assert.equal((await mobileContext.request.get(base + '/api/directory/search')).status(), 401);
  await noOverflow(mobile); await audit(mobile);
  assert.equal((await mobileContext.request.post(base + '/api/auth/login', { data: {
    loginOrEmail: employerActor.login, password: employerActor.password,
  } })).status(), 200);
  await mobile.goto(base + '/app?role=employer&tab=candidates');
  await saved(mobile);
  await directoryResults(mobile);
  await noOverflow(mobile);
  await mobile.screenshot({ path: resolve(output, 'mobile.png'), fullPage: true });
  await mobile.getByRole('button', { name: 'Фильтры', exact: true }).click();
  await mobile.locator('.filters').getByLabel('Специализация').selectOption('Frontend');
  await mobile.locator('.filter-group').getByRole('button', { name: 'Middle', exact: true }).click();
  const mobileSelection = await directoryResults(mobile);
  assert.ok(mobileSelection.total > 0 && mobileSelection.items.every(item => item.person.confirmed.specialization === 'Frontend' && item.person.confirmed.grade === 'Middle'));
  assert.ok(mobileSelection.items.some(item => item.person.name === otherName), 'The registered candidate remains available through the mobile category filter.');
  await noOverflow(mobile);
  await audit(mobile);
  await mobile.locator('.person-link').filter({ hasText: otherName }).click();
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
      await mobile.waitForURL(url => url.searchParams.get('role') === 'employer');
      assert.equal(await mobile.locator('.role-control').count(), 0, 'A mobile URL cannot change the verified employer role.');
    }
    if (route.includes('tab=company')) await mobile.getByRole('heading', { name: 'Компания', exact: true }).waitFor();
    await noOverflow(mobile);
  }
  await mobile.close();
  assert.equal((await mobileContext.request.post(base + '/api/auth/logout')).status(), 200);
  const mobileCandidate = await registeredActor('candidate', 'smoke.mobile', 'Кандидат мобильной проверки', mobileContext);
  mobile = mobileCandidate.page;
  await mobile.setViewportSize({ width: 320, height: 750 });
  await mobile.getByRole('heading', { name: 'Анкета', exact: true }).waitFor();
  await fillSurvey(mobile);
  assert.equal(await mobile.locator('input[name="softSkills"]:visible').count(), 5);
  await noOverflow(mobile);
  await mobile.screenshot({ path: resolve(output, 'onboarding-mobile.png'), fullPage: true });
  await audit(mobile);
  await persist(() => mobile.getByRole('button', { name: 'К тесту', exact: true }).click(), mobile);
  await mobile.getByRole('button', { name: 'Начать тест', exact: true }).waitFor();
  await noOverflow(mobile);
  const mobileSnapshot = await mobileContext.request.get(base + '/api/platform/state');
  assert.equal((await mobileContext.request.delete(base + '/api/platform/state', { headers: {
    'X-Platform-Identity': mobileSnapshot.headers()['x-platform-identity'],
  } })).status(), 200);
  await mobileContext.close();
  console.log('PASS Mobile 390px, 320px and keyboard dialog');

  await role('Работодатель');
  await page.locator('.site-header .brand').click();
  await page.getByLabel('Кого вы ищете?').fill('Frontend Middle React CSS');
  await page.locator('.brief-toolbar').getByRole('button', { name: 'Попробовать', exact: true }).click();
  const landingSelected = await directoryResults();
  assert.ok(landingSelected.total > 0 && landingSelected.items.every(item => item.person.confirmed.specialization === 'Frontend' && item.person.confirmed.grade === 'Middle'),
    'The task-rich fixture must support the carried semantic request: ' + JSON.stringify({ interpreted: landingSelected.interpreted, effectiveFilters: landingSelected.effectiveFilters, warnings: landingSelected.warnings }));
  assert.equal(await page.getByRole('textbox', { name: 'Потребность работодателя' }).inputValue(), 'Frontend Middle React CSS');
  await page.getByRole('button', { name: 'Очистить поиск', exact: true }).click();
  await directoryResults(page, baseline.total + 1);
  console.log('PASS Landing request is carried into the workspace');

  await role('Кандидат');
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
  await prepareContext(migrationContext);
  const legacy = { ...completedProfile, version: 1, profile: { ...completedProfile.profile, visible: false, email: 'edited@example.com' }, invitations: [], savedSearches: [] };
  delete legacy.surveys;
  for (const key of ['industry', 'professionalRole', 'softSkills', 'surveyCompletedAt']) delete legacy.profile[key];
  const legacyDate = new Date().toISOString();
  legacy.profile.confirmed = { specialization: 'Frontend', grade: 'Middle', score: 86, date: legacyDate };
  legacy.history = [{ id: 'test-initial', specialization: 'Frontend', grade: 'Middle', score: 86, date: legacyDate, passed: true }];
  await migrationContext.addInitScript(value => {
    if (sessionStorage.getItem('smoke:legacy-seeded')) return;
    sessionStorage.setItem('smoke:legacy-seeded', 'true');
    localStorage.setItem('predel:platform:v1', JSON.stringify(value));
  }, legacy);
  const migration = await migrationContext.newPage();
  let guestSaves = 0;
  migration.on('request', request => {
    if (new URL(request.url()).pathname === '/api/platform/state' && request.method() === 'PUT') guestSaves++;
  });
  await migration.goto(base + '/app?role=candidate&tab=profile');
  await migration.getByRole('heading', { name: 'Регистрация', exact: true }).waitFor();
  assert.equal(await migration.locator('.candidate-row, .profile-form, .onboarding-form').count(), 0);
  assert.equal(guestSaves, 0, 'A guest draft must never be sent to the server.');
  assert.equal((await migrationContext.request.get(base + '/api/platform/state')).status(), 401);
  assert.equal((await migrationContext.request.put(base + '/api/platform/state', { data: { state: legacy, baseRevision: 0 } })).status(), 401);
  assert.equal(await migration.evaluate(() => localStorage.getItem('predel:platform:v1')), null, 'Private guest cache is discarded.');
  assert.equal(await migration.evaluate(key => localStorage.getItem(key), storageKey), null);
  await noOverflow(migration); await audit(migration);
  await migration.close();
  const freshActor = await registeredActor('candidate', 'smoke.fresh', 'Новый кандидат проверки', migrationContext);
  const freshPage = freshActor.page;
  await freshPage.getByRole('heading', { name: 'Анкета', exact: true }).waitFor();
  assert.equal(await freshPage.getByLabel('Имя и фамилия', { exact: true }).inputValue(), 'Новый кандидат проверки');
  assert.equal(await freshPage.getByLabel('Email', { exact: true }).inputValue(), freshActor.email, 'Verified account fields replace unrelated guest contacts.');
  assert.equal(await freshPage.getByLabel('Согласен на обработку персональных данных', { exact: true }).isChecked(), false);
  assert.equal((await (await migrationContext.request.get(base + '/api/platform/state')).json()).state, null,
    'No private profile is stored before this candidate submits their own consent.');
  const clean = await state(freshPage);
  assert.equal(clean.profile.confirmed, null);
  assert.equal(clean.profile.bio, '');
  assert.equal(clean.profile.visible, false);
  assert.deepEqual(clean.profile.softSkills, []);
  assert.deepEqual(clean.history, []);
  assert.deepEqual(clean.surveys, []);
  assert.deepEqual(clean.invitations, []);
  assert.notEqual(clean.profile.email, 'edited@example.com');
  await fillSurvey(freshPage, 'Новый кандидат проверки', freshActor.email);
  await persist(() => freshPage.getByRole('button', { name: 'К тесту', exact: true }).click(), freshPage);
  const migrated = await (await migrationContext.request.get(base + '/api/platform/state')).json();
  assert.equal(migrated.state.profile.email, freshActor.email);
  assert.equal(migrated.state.profile.consent, true);
  assert.equal(migrated.state.profile.confirmed, null, 'Discarded guest qualifications are never migrated into the account.');
  assert.equal(migrated.state.history.length, 0);
  assert.equal(migrated.state.profile.visible, false);
  console.log('PASS Guest cache cannot migrate; verified onboarding starts with explicit personal consent');
  await migrationContext.close();

  await page.evaluate(key => localStorage.setItem(key, '{broken'), storageKey);
  await page.goto(base + '/app?role=employer&tab=candidates');
  await page.waitForURL(url => url.searchParams.get('role') === 'candidate');
  await page.locator('.profile-form').waitFor();
  await saved();
  assert.equal((await page.request.get(base + '/api/directory/search')).status(), 403, 'Cache corruption does not grant employer permissions.');
  assert.equal((await state()).profile.email, 'anna@example.com', 'Corrupted cache must recover the canonical profile');
  assert.deepEqual(errors, [], 'Browser runtime errors');
  console.log('PASS Recovery from corrupted storage, no browser errors');
} catch (error) {
  console.error('SMOKE assertion', error);
  console.error('SMOKE page contexts', await Promise.all(contexts.flatMap(context => context.pages()).map(async target => ({
    route: target.url(), headings: await target.locator('h1, h2').allTextContents(),
    alerts: await target.getByRole('alert').allTextContents(), statuses: await target.getByRole('status').allTextContents(),
  }))));
  console.error('SMOKE failure context', {
    route: page.url(), headings: await page.locator('h1, h2').allTextContents(),
    syncStatus: await page.evaluate(() => document.querySelector('.main-content')?.getAttribute('data-sync-status') || null),
    profile: await page.evaluate(key => {
      let value;
      try { value = JSON.parse(localStorage.getItem(key) || 'null'); } catch { return 'corrupted'; }
      return value ? { desiredGrade: value.profile.desiredGrade, confirmedGrade: value.profile.confirmed?.grade,
        surveyCompletedAt: value.profile.surveyCompletedAt, surveyGrades: value.surveys?.map(survey => survey.desiredGrade) } : null;
    }, storageKey),
  });
  throw error;
} finally {
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
  await isolated.close();
}
