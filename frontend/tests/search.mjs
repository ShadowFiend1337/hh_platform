import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { createInitialState } from '../src/model.ts';
import { defaultSearchFilters, normalizeSearchFilters } from '../../shared/search.ts';
import { directoryCandidates } from '../../server/directory-seed.mjs';

// Authored fictional data only. All browser sessions and API mocks are isolated.
const base = process.env.PREDEL_URL || 'http://127.0.0.1:5173';
const require = createRequire(import.meta.url);
const browser = await chromium.launch({ headless: true });
const contexts = [];
const errors = [];
const example = 'человек который понимает структуру электроники и поможет разобраться с зарплатой до 200 тысяч';
const queryOf = url => new URL(url).searchParams.get('q');
const filtersOf = url => JSON.parse(new URL(url).searchParams.get('filters') || '{}');
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function context(options = {}) {
  const result = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', ...options });
  contexts.push(result);
  return result;
}
function watch(page) {
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
}
async function complete(page) {
  await page.locator('.candidate-list[aria-busy="false"]').waitFor();
}
async function count(page, expected) {
  await page.waitForFunction(value => document.querySelectorAll('.candidate-row').length === value, expected);
}
async function audit(page) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const violations = await page.evaluate(async () => (await window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
  })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })));
  assert.deepEqual(violations, [], 'Accessibility violations: ' + JSON.stringify(violations));
}
async function submit(page, query) {
  await page.getByRole('textbox', { name: 'Потребность работодателя' }).fill(query);
  const requested = page.waitForResponse(response => new URL(response.url()).pathname === '/api/directory/search' && queryOf(response.url()) === query);
  await page.getByRole('button', { name: 'Подобрать', exact: true }).click();
  await requested;
  await complete(page);
}

try {
  assert.deepEqual(normalizeSearchFilters({ specialization: 'Frontend', grade: 'Middle', format: '', stack: ['React'], fsp: true }), {
    ...defaultSearchFilters, specialization: 'Frontend', grade: 'Middle', stack: ['React'], fsp: true,
  }, 'Older saved searches acquire neutral new defaults');
  assert.equal(normalizeSearchFilters({ minScore: 101, experienceMin: -1 }).minScore, null);

  if (process.env.PREDEL_SEARCH_MOCK_ONLY !== '1') {
  const live = await context();
  const params = new URLSearchParams({ q: example, filters: '{}', limit: '30', offset: '0' });
  const exampleResponse = await live.request.get(base + '/api/directory/search?' + params, { timeout: 90000 });
  assert.equal(exampleResponse.status(), 200, 'The real trained model must serve the original electronics example');
  const exampleResults = await exampleResponse.json();
  assert.equal(exampleResults.model.status, 'ready');
  assert.equal(exampleResults.model.trained, true);
  assert.equal(exampleResults.interpreted.salaryMax, 200000);
  const names = exampleResults.items.map(item => item.person.name);
  assert.ok(names.includes('Иван Лопатин') && names.includes('Дарья Пайвина'), 'Electronics specialists from the actual SQL corpus must be found');
  assert.ok(exampleResults.items.every(item => item.person.specialization === 'Embedded' && item.person.salaryFrom <= 200000));

  const people = [];
  let offset = 0, total = Infinity;
  while (offset < total) {
    const response = await live.request.get(base + '/api/directory/search?' + new URLSearchParams({ q: '', filters: '{}', limit: '30', offset: String(offset) }));
    assert.equal(response.status(), 200);
    const result = await response.json();
    total = result.total;
    assert.ok(result.items.length > 0, 'Pagination must make progress');
    people.push(...result.items.map(item => item.person));
    offset += result.items.length;
  }
  assert.equal(new Set(people.map(person => person.id)).size, total);
  assert.equal(people.filter(person => person.synthetic).length, 146);
  assert.equal(new Set(people.filter(person => person.synthetic).map(person => person.specialization)).size, 14);
  console.log('PASS Actual trained encoder, electronics example, 146 fictional profiles and 14 directions');

  // Prime canonical state before pagination: initial migration must not cancel a page request.
  const initialPlatform = await (await live.request.get(base + '/api/platform/state')).json();
  if (!initialPlatform.state) {
    const persisted = await live.request.put(base + '/api/platform/state', { data: { state: createInitialState(), baseRevision: initialPlatform.revision } });
    assert.equal(persisted.status(), 200);
  }

  const page = await live.newPage(); watch(page);
  const requests = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/directory/search') requests.push(request.url()); });
  await page.goto(base + '/app'); await complete(page); await count(page, 30);
  let visible = 30;
  while (visible < total) {
    await page.getByRole('button', { name: 'Показать ещё', exact: true }).click();
    visible = Math.min(visible + 30, total);
    await count(page, visible); await complete(page);
  }
  assert.equal(await page.getByRole('button', { name: 'Показать ещё', exact: true }).count(), 0);
  const beforeDraft = requests.length;
  await page.getByRole('textbox', { name: 'Потребность работодателя' }).fill(example);
  await pause(350);
  assert.equal(requests.length, beforeDraft, 'Typing a draft must not run semantic search');
  await submit(page, example);
  assert.ok((await page.locator('.person-link').allTextContents()).some(name => name.includes('Иван Лопатин')));
  assert.match(await page.locator('.directory-interpretation').textContent(), /Зарплата до 200\s000 ₽/u);
  assert.equal(await page.locator('.directory-demo').count(), exampleResults.items.length);
  await page.locator('.match-details').first().locator('summary').click();
  assert.match(await page.locator('.match-details').first().locator('p').textContent(), /Вымышленный профиль/u);
  await page.locator('.match-details').first().locator('summary').click();
  await page.getByRole('button', { name: 'Очистить поиск', exact: true }).click();
  await page.getByRole('combobox', { name: 'Специализация', exact: true }).selectOption('Embedded');
  await page.locator('.directory-extra summary').click();
  await page.getByRole('combobox', { name: 'Город', exact: true }).selectOption('Екатеринбург');
  await page.getByRole('combobox', { name: 'Отрасль', exact: true }).selectOption('Наука');
  await page.getByLabel('Зарплата до, ₽/мес.', { exact: true }).fill('200000');
  await page.getByLabel('Стаж от, лет', { exact: true }).fill('5');
  await page.getByLabel('Стаж до, лет', { exact: true }).fill('8');
  await page.locator('.stack-filters').getByRole('button', { name: 'STM32', exact: true }).click();
  await page.getByRole('combobox', { name: 'Занятость', exact: true }).selectOption('Частичная занятость');
  await page.getByRole('combobox', { name: 'Язык', exact: true }).selectOption('en');
  await page.getByLabel('Есть портфолио', { exact: true }).check();
  const filtered = page.waitForResponse(response => {
    if (new URL(response.url()).pathname !== '/api/directory/search') return false;
    const filters = filtersOf(response.url());
    return filters.minScore === 90 && filters.experienceMin === 60 && filters.experienceMax === 96;
  });
  await page.getByLabel('Баллы теста от', { exact: true }).fill('90');
  const filteredResult = await (await filtered).json();
  await complete(page); await count(page, 1);
  assert.equal(filteredResult.items[0].person.name, 'Дарья Пайвина');
  assert.match(await page.locator('.person-link').textContent(), /Дарья Пайвина/u);
  await page.getByLabel('Баллы теста от', { exact: true }).fill('101');
  assert.equal(await page.getByLabel('Баллы теста от', { exact: true }).inputValue(), '100', 'Out-of-range score must remain consistent with the sent filter');
  await complete(page);
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/platform/state'
    && response.request().method() === 'PUT' && response.request().postDataJSON()?.state?.savedSearches?.[0]?.filters?.minScore === 100);
  await page.getByRole('button', { name: 'Сохранить подборку', exact: true }).click();
  await saved;
  await page.reload(); await complete(page); await count(page, 1);
  assert.equal(await page.getByLabel('Стаж от, лет', { exact: true }).inputValue(), '5');
  assert.equal(await page.getByLabel('Баллы теста от', { exact: true }).inputValue(), '100');
  console.log('PASS API-backed pagination, explicit query submission, salary/experience/city/stack/language/portfolio/score and reload');
  }

  const mocked = await context();
  let platform = createInitialState(), revision = 0;
  const mockPeople = Array.from({ length: 65 }, (_, index) => ({ ...directoryCandidates[0], id: 'test-demo-' + index, name: 'Демо специалист ' + index }));
  platform.invitations.push({ id: 'test-invitation', candidateId: mockPeople[0].id, companyId: platform.company.id, company: platform.company.name, title: 'Синтетическое предложение', description: '', contact: 'demo@example.com', salaryFrom: 100000, salaryTo: 200000, status: 'sent', date: '2026-10-06' });
  await mocked.addInitScript(state => { localStorage.setItem('predel:platform:v2', JSON.stringify(state)); }, platform);
  await mocked.route('**/api/platform/state', async route => {
    if (route.request().method() === 'PUT') { platform = route.request().postDataJSON().state; revision++; }
    await route.fulfill({ json: { state: platform, revision, directoryPeople: mockPeople } });
  });
  await mocked.route('**/api/directory/options', route => route.fulfill({ json: { cities: ['Москва', 'Казань'], industries: ['ИТ'], languages: [{ value: 'en', label: 'Английский' }], employmentTypes: ['Полная занятость'] } }));
  let fail = true;
  let shiftedPagination = false;
  const mockRequests = [];
  await mocked.route('**/api/directory/search?*', async route => {
    const url = new URL(route.request().url()), query = queryOf(url), offset = Number(url.searchParams.get('offset'));
    mockRequests.push({ query, filters: filtersOf(url), offset });
    if (query === 'долгий') await pause(700);
    if (query === 'сбой' && fail) { fail = false; return route.fulfill({ status: 503, json: { error: 'Поиск по смыслу недоступен. Повторите запрос.' } }).catch(() => {}); }
    const selected = query ? [{ ...mockPeople[0], name: query === 'новый' ? 'Новый результат' : 'Повторный результат' }]
      : shiftedPagination ? [{ ...mockPeople[0], id: 'inserted-first', name: 'Новый демонстрационный специалист' }, ...mockPeople] : mockPeople;
    await route.fulfill({ json: { items: selected.slice(offset, offset + 30).map(person => ({ person, reason: 'Серверное основание из опыта кандидата. Вымышленный профиль.', semanticScore: query ? 0.7 : null, rank: 1 })), total: selected.length, offset, limit: 30, query, interpreted: {}, model: { status: 'ready', trained: true, name: 'Тестовая модель', version: 'fixture', dimension: 312 }, warnings: [] } }).catch(() => {});
  });
  const race = await mocked.newPage(); watch(race);
  await race.goto(base + '/app'); await complete(race); await count(race, 30);
  assert.equal(await race.locator('.candidate-row').first().getByRole('button', { name: 'Отправлено', exact: true }).isDisabled(), true);
  shiftedPagination = true;
  await race.getByRole('button', { name: 'Показать ещё', exact: true }).click();
  await complete(race); await count(race, 59);
  await race.getByRole('button', { name: 'Показать ещё', exact: true }).click();
  await complete(race); await count(race, 65);
  assert.deepEqual(mockRequests.filter(request => request.offset > 0).map(request => request.offset), [30, 60], 'Raw offsets progress despite a duplicate caused by a rank change');
  assert.equal(await race.getByRole('button', { name: 'Показать ещё', exact: true }).count(), 0, 'Pagination stops after consuming the raw last page');
  await race.getByRole('button', { name: 'Обновить подборку', exact: true }).click();
  await complete(race); await count(race, 30);
  assert.match(await race.locator('.person-link').first().textContent(), /Новый демонстрационный/u, 'A refreshed first page includes the newly ranked profile');
  console.log('PASS Changed ranking, advancing raw page offset, bounded append and explicit refresh');
  await race.locator('.directory-extra summary').click();
  const beforeFilters = mockRequests.length;
  await race.getByRole('combobox', { name: 'Город', exact: true }).selectOption('Москва');
  await race.getByRole('combobox', { name: 'Город', exact: true }).selectOption('Казань');
  await complete(race);
  assert.equal(mockRequests.length, beforeFilters + 1, 'Rapid filter changes produce one debounced request');
  assert.equal(mockRequests.at(-1).filters.city, 'Казань');
  await race.getByRole('textbox', { name: 'Потребность работодателя' }).fill('долгий');
  const slowRequest = race.waitForRequest(request => new URL(request.url()).pathname === '/api/directory/search' && queryOf(request.url()) === 'долгий');
  await race.getByRole('button', { name: 'Подобрать', exact: true }).click();
  await slowRequest;
  await submit(race, 'новый'); await count(race, 1);
  await pause(800);
  assert.match(await race.locator('.person-link').textContent(), /Новый результат/u, 'An old slow response cannot overwrite a later query');
  await submit(race, 'сбой');
  assert.match(await race.getByRole('alert').textContent(), /Поиск по смыслу недоступен/u);
  assert.match(await race.locator('.person-link').textContent(), /Новый результат/u, '503 retains the last server result without local fallback');
  assert.equal(await race.locator('.candidate-row').count(), 1);
  const retried = race.waitForResponse(response => new URL(response.url()).pathname === '/api/directory/search' && queryOf(response.url()) === 'сбой');
  await race.getByRole('button', { name: 'Повторить поиск', exact: true }).click();
  await retried;
  await complete(race);
  assert.match(await race.locator('.person-link').textContent(), /Повторный результат/u);
  console.log('PASS Debounced filters, cancelled response races, pending invitation, unavailable model and explicit retry');

  await race.setViewportSize({ width: 320, height: 900 });
  await race.getByRole('button', { name: /^Фильтры/u }).click();
  assert.equal(await race.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, '320px layout must not overflow');
  await race.locator('.match-details').first().locator('summary').click();
  const bounds = await race.locator('.match-details').first().locator('p').boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 321, 'Evidence fits the narrow viewport');
  await audit(race);
  console.log('PASS 320px filters, evidence and accessibility');

  await race.setViewportSize({ width: 1440, height: 1000 });
  await race.goto(base + '/app?role=candidate&tab=onboarding');
  await race.locator('.onboarding-form').waitFor();
  await race.getByLabel('Имя и фамилия', { exact: true }).fill('Синтетический кандидат');
  await race.getByLabel('Email', { exact: true }).fill('demo@example.com');
  await race.getByRole('combobox', { name: 'Отрасль', exact: true }).selectOption('ИТ');
  await race.getByLabel('Роль в команде', { exact: true }).fill('Инженер');
  await race.getByRole('combobox', { name: 'Специализация', exact: true }).selectOption('Embedded');
  await race.getByRole('combobox', { name: 'Предполагаемый грейд', exact: true }).selectOption('Middle');
  await race.getByLabel('Стек', { exact: true }).fill('C, STM32');
  await race.getByLabel('Общий стаж', { exact: true }).fill('3 года 4 месяца');
  await race.getByLabel('Желаемая зарплата от, ₽/мес.', { exact: true }).fill('200000');
  await race.getByLabel('Желаемая зарплата до, ₽/мес.', { exact: true }).fill('150000');
  await race.getByRole('combobox', { name: 'Занятость', exact: true }).selectOption('Частичная занятость');
  await race.locator('.onboarding-details summary').click();
  await race.getByLabel('Языки', { exact: true }).fill('Русский — родной; английский B2; немецкий B1');
  await race.getByLabel('Согласен на обработку персональных данных', { exact: true }).check();
  await race.getByRole('button', { name: 'К тесту', exact: true }).click();
  assert.match(await race.locator('.form-error').textContent(), /Нижняя граница/u);
  assert.equal(platform.profile.name, '', 'Invalid salary range must not commit the questionnaire');
  await race.getByLabel('Желаемая зарплата до, ₽/мес.', { exact: true }).fill('250000');
  const preferencesSaved = race.waitForResponse(response => new URL(response.url()).pathname === '/api/platform/state'
    && response.request().method() === 'PUT' && response.request().postDataJSON()?.state?.profile?.salaryFrom === 200000);
  await race.getByRole('button', { name: 'К тесту', exact: true }).click();
  await preferencesSaved;
  assert.equal(platform.profile.salaryTo, 250000);
  assert.equal(platform.profile.employmentType, 'Частичная занятость');
  assert.equal(platform.profile.experienceMonths, 40);
  assert.deepEqual(platform.profile.languageCodes, ['ru', 'en', 'de']);
  assert.equal(Object.hasOwn(platform.surveys[0], 'salaryFrom'), false, 'Preferences must not leak into the assessment contract');
  console.log('PASS Questionnaire salary validation, explicit preference save and exact experience/language indexing');
  // A declared demo qualification is a mock fixture, never an actual assessment result.
  platform.profile.confirmed = { specialization: 'Embedded', grade: 'Middle', score: 85, date: platform.profile.surveyCompletedAt, synthetic: true };
  platform.profile.synthetic = true;
  await race.goto(base + '/app?role=candidate&tab=profile');
  await race.locator('.profile-form').waitFor();
  await race.getByLabel('Желаемая зарплата от, ₽/мес.', { exact: true }).fill('180000');
  await race.getByLabel('Желаемая зарплата до, ₽/мес.', { exact: true }).fill('');
  await race.getByLabel('Общий стаж', { exact: true }).fill('До 5 лет');
  await race.locator('.onboarding-details summary').click();
  await race.getByLabel('Языки', { exact: true }).fill('Французский B1');
  assert.match(await race.locator('#profile-experience-help').textContent(), /точную продолжительность/u);
  const profileSaved = race.waitForResponse(response => new URL(response.url()).pathname === '/api/platform/state'
    && response.request().method() === 'PUT' && response.request().postDataJSON()?.state?.profile?.salaryFrom === 180000);
  await race.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  await profileSaved;
  assert.equal(platform.profile.salaryTo, null);
  assert.equal(platform.profile.experienceMonths, null, 'An approximate duration must clear the previous precise index');
  assert.deepEqual(platform.profile.languageCodes, ['fr']);
  console.log('PASS Profile preference changes and unknown experience remain explicit');
  assert.deepEqual(errors, [], 'No browser runtime errors');
} finally {
  await Promise.all(contexts.map(context => context.request.delete(base + '/api/platform/state').catch(() => {})));
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
}
