import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { createInitialState } from '../src/model.ts';
import { normalizeSearchFilters } from '../../shared/search.ts';

// Author-created fictional profiles and isolated API state; no personal resume data.
const base = process.env.PREDEL_URL || 'http://127.0.0.1:5173';
const require = createRequire(import.meta.url);
const browser = await chromium.launch({ headless: true });
const contexts = [];
const errors = [];
const date = '2026-10-07T09:00:00.000Z';
const electronics = new Set([2, 32, 64]);
const people = Array.from({ length: 65 }, (_, index) => {
  const specialization = electronics.has(index) ? 'Embedded' : index % 2 ? 'Backend' : 'Frontend';
  return {
    id: `swipe-fixture-${index}`, name: `Тестовый специалист ${index + 1}`,
    specialization, desiredGrade: 'Middle',
    confirmed: { specialization, grade: 'Middle', score: 85, date },
    gradeChangedAt: date, surveyCompletedAt: date,
    industry: 'ИТ', professionalRole: specialization === 'Embedded' ? 'Инженер электроники' : 'Разработчик',
    stack: specialization === 'Embedded' ? ['C', 'STM32'] : specialization === 'Backend' ? ['Python', 'SQL'] : ['React', 'TypeScript'],
    softSkills: [], city: index % 2 ? 'Казань' : 'Москва', format: 'Удалённо', experience: '4 года',
    experienceMonths: 48, salaryFrom: 150000, salaryTo: 180000,
    employmentType: 'Полная занятость', languageCodes: ['ru', 'en'],
    bio: specialization === 'Embedded' ? 'Разбираю электрические схемы и подключаю датчики.' : 'Разрабатываю и проверяю рабочие сервисы.',
    workHistory: 'Вымышленный учебный проект: проектирование, проверка и выпуск продукта.',
    careerAchievements: 'Завершил вымышленный учебный проект.', education: 'Тестовый университет',
    portfolio: '', languages: 'Английский B2', email: '', phone: '', fspId: '', achievements: [],
    visible: true, consent: true, synthetic: true,
  };
});
const personId = index => people[index].id;
const clone = value => structuredClone(value);
const decision = (index, value) => ({ candidateId: personId(index), decision: value, date });

async function session(initialDecisions = [], options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce', ...options });
  contexts.push(context);
  const backend = { state: { ...createInitialState(), candidateDecisions: clone(initialDecisions) }, revision: 1,
    searches: [], puts: [], contactReads: [] };
  await context.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === '/api/auth/me') { await route.fulfill({ status: 401, json: { error: 'Гостевой кабинет.' } }); return; }
    let payload;
    if (url.pathname === '/api/platform/state') {
      if (request.method() === 'PUT') {
        payload = request.postDataJSON();
        backend.puts.push(clone(payload));
        if (payload.baseRevision !== backend.revision) {
          await route.fulfill({ status: 409, json: { error: 'Данные изменились.' } }); return;
        }
        backend.state = clone(payload.state); backend.revision++;
      } else if (request.method() === 'DELETE') {
        backend.state = createInitialState(); backend.revision++;
      }
      payload = { state: backend.state, revision: backend.revision, directoryPeople: people };
    } else if (url.pathname === '/api/directory/options') {
      payload = { cities: ['Москва', 'Казань'], industries: ['ИТ'],
        languages: [{ value: 'ru', label: 'Русский' }, { value: 'en', label: 'Английский' }], employmentTypes: ['Полная занятость'] };
    } else if (url.pathname === '/api/directory/search') {
      const query = url.searchParams.get('q') || '', filters = normalizeSearchFilters(JSON.parse(url.searchParams.get('filters') || '{}'));
      const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 30);
      backend.searches.push({ query, filters, offset, limit });
      const selected = people.filter(person => (!filters.specialization || person.specialization === filters.specialization)
        && (!filters.city || person.city === filters.city)
        && (!query || query.includes('схем') && person.specialization === 'Embedded'));
      payload = { items: selected.slice(offset, offset + limit).map((person, index) => ({ person, rank: offset + index + 1,
        semanticScore: query ? 0.7 : null, reason: 'Соответствующие задачи из опыта. Вымышленный профиль.' })),
        query, total: selected.length, offset, limit, interpreted: {}, effectiveFilters: filters,
        model: { status: 'ready', trained: true, name: 'Тестовая модель', version: 'fixture', dimension: 312 }, warnings: [] };
    } else if (url.pathname.endsWith('/contacts')) {
      backend.contactReads.push(url.pathname);
      await route.fulfill({ status: 403, json: { error: 'Контакты скрыты.' } }); return;
    } else {
      throw new Error('Unexpected mock API request: ' + url.pathname);
    }
    await route.fulfill({ json: payload }).catch(() => {});
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/app?role=employer');
  await ready(page);
  return { page, backend };
}
async function ready(page) {
  await page.locator('.candidate-list[aria-busy="false"]').waitFor();
  await page.waitForFunction(() => ['saved', 'error'].includes(document.querySelector('.main-content')?.getAttribute('data-sync-status')));
  assert.equal(await page.locator('.main-content').getAttribute('data-sync-status'), 'saved', 'The platform state must be saved');
}
async function card(page, index) {
  await page.locator(`.swipe-card[data-candidate-id="${personId(index)}"]`).waitFor();
  assert.equal(await page.locator('.swipe-card').count(), 1, 'The feed shows one actionable card');
}
async function mode(page, name) {
  await page.getByRole('button', { name, exact: true }).click();
  assert.equal(await page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed'), 'true');
}
async function change(page, action, predicate) {
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/platform/state'
    && response.request().method() === 'PUT' && predicate(response.request().postDataJSON()?.state));
  await action();
  assert.equal((await saved).status(), 200, 'The decision must reach the API');
  await ready(page);
}
function hasDecision(state, index, value) {
  const item = state?.candidateDecisions?.find(item => item.candidateId === personId(index));
  return value === undefined ? !item : item?.decision === value;
}
async function choose(page, index, value, action) {
  await change(page, action || (() => page.getByRole('button', { name: value === 'liked' ? 'Нравится' : 'Пропустить', exact: true }).click()),
    state => hasDecision(state, index, value));
}
async function gesture(page, dx, dy = 0) {
  const bounds = await page.locator('.swipe-card').boundingBox();
  assert.ok(bounds, 'A card must be visible before dragging');
  const start = { x: bounds.x + bounds.width / 2, y: bounds.y + Math.min(bounds.height - 25, 120) };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 14 });
  await page.mouse.up();
}
async function touchGesture(page, dx) {
  await page.locator('.swipe-card').scrollIntoViewIfNeeded();
  const bounds = await page.locator('.swipe-card').boundingBox();
  // Start on the card background; the name is a separate profile button.
  const x = bounds.x + bounds.width / 2, y = bounds.y + 60;
  const client = await page.context().newCDPSession(page);
  try {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 0 }] });
    for (let step = 1; step <= 8; step++) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * step / 8, y, id: 0 }] });
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await client.detach(); }
}
async function audit(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'The 320px layout must not overflow');
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const violations = await page.evaluate(async () => (await window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
  })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })));
  assert.deepEqual(violations, [], 'Accessibility violations: ' + JSON.stringify(violations));
}

try {
  const interactive = await session(), { page, backend } = interactive;
  assert.equal(await page.getByRole('button', { name: 'Обычный режим', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.candidate-row').count(), 30, 'The ordinary list retains its first page');
  await mode(page, 'Предельный режим'); await card(page, 0);
  await gesture(page, 15, 90);
  await card(page, 0);
  assert.deepEqual(backend.state.candidateDecisions, [], 'Vertical movement is not a decision');
  await choose(page, 0, 'liked', () => gesture(page, 240)); await card(page, 1);
  assert.deepEqual(backend.state.invitations, [], 'A like must not send an invitation');
  assert.deepEqual(backend.contactReads, [], 'A like must not disclose contacts');

  await page.locator('.swipe-card .person-link').click();
  await page.getByRole('dialog', { name: 'Профиль кандидата' }).waitFor();
  assert.equal(await page.locator('.contact-section a[href^="mailto:"]').count(), 0);
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await card(page, 1);
  await page.locator('.swipe-card').getByRole('button', { name: 'Пригласить', exact: true }).click();
  await page.getByRole('dialog', { name: 'Приглашение' }).waitFor();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  assert.deepEqual(backend.state.invitations, [], 'Opening the invitation form must not send it');
  await card(page, 1);
  await choose(page, 1, 'passed', () => page.locator('.swipe-card').press('ArrowLeft')); await card(page, 2);
  assert.equal(await page.locator('.swipe-card').evaluate(element => element === document.activeElement), true,
    'Keyboard browsing keeps focus on the next card');
  await change(page, () => page.getByRole('button', { name: 'Вернуть карточку', exact: true }).click(), state => hasDecision(state, 1, undefined));
  await card(page, 1);
  assert.ok(hasDecision(backend.state, 0, 'liked'), 'Undo preserves other decisions');
  await choose(page, 1, 'liked', () => page.locator('.swipe-card').press('ArrowRight')); await card(page, 2);
  await page.reload(); await ready(page); await card(page, 2);
  assert.equal(await page.getByRole('button', { name: 'Предельный режим', exact: true }).getAttribute('aria-pressed'), 'true', 'Reload preserves the display mode');
  assert.ok(hasDecision(backend.state, 0, 'liked') && hasDecision(backend.state, 1, 'liked'), 'Reload preserves API decisions');
  await page.setViewportSize({ width: 320, height: 900 });
  await audit(page);
  await page.getByRole('button', { name: /^Фильтры/u }).click();
  await audit(page);
  await page.getByRole('button', { name: /^Фильтры/u }).click();
  await page.setViewportSize({ width: 1440, height: 1050 });
  console.log('PASS Pointer gesture, keyboard, undo, isolated likes, profile/invitation actions, reload and mobile accessibility');

  const touch = await session([], { viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true });
  await mode(touch.page, 'Предельный режим'); await card(touch.page, 0);
  await choose(touch.page, 0, 'liked', () => touchGesture(touch.page, 140)); await card(touch.page, 1);
  await choose(touch.page, 1, 'passed', () => touchGesture(touch.page, -140)); await card(touch.page, 2);
  assert.deepEqual(touch.backend.state.invitations, []);
  console.log('PASS Native touchscreen swipes in both directions');

  await mode(page, 'Обычный режим');
  assert.equal(await page.locator('.swipe-card').count(), 0);
  assert.equal(await page.locator('.candidate-row').count(), 30, 'Returning to ordinary mode keeps the familiar complete list');
  assert.ok((await page.locator('.person-link').allTextContents()).includes(people[0].name), 'Liked profiles remain in the ordinary list');
  await mode(page, 'Предельный режим');
  await page.getByRole('button', { name: 'Избранные кандидаты', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Избранные кандидаты', exact: true }).getAttribute('aria-pressed'), 'true');
  await card(page, 0);
  await page.locator('.swipe-card').press('ArrowRight'); await card(page, 1);
  assert.ok(hasDecision(backend.state, 0, 'liked'), 'Browsing a favorite preserves its like');
  await choose(page, 1, 'passed', () => page.locator('.swipe-card').press('ArrowLeft'));
  await page.getByText('Избранное просмотрено', { exact: true }).waitFor();
  await change(page, () => page.getByRole('button', { name: 'Вернуть карточку', exact: true }).click(), state => hasDecision(state, 1, 'liked'));
  await card(page, 1);
  await choose(page, 1, undefined, () => page.getByRole('button', { name: 'Убрать из избранного', exact: true }).click());
  await page.getByText('Избранное просмотрено', { exact: true }).waitFor();
  await change(page, () => page.getByRole('button', { name: 'Вернуть карточку', exact: true }).click(), state => hasDecision(state, 1, 'liked'));
  await card(page, 1);
  await page.locator('.swipe-card').press('ArrowRight');
  await page.getByText('Избранное просмотрено', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Посмотреть снова', exact: true }).click(); await card(page, 0);
  assert.ok(hasDecision(backend.state, 0, 'liked') && hasDecision(backend.state, 1, 'liked'), 'Replaying favorites changes no saved decisions');
  assert.deepEqual(backend.state.invitations, []);
  assert.deepEqual(backend.contactReads, []);
  console.log('PASS Ordinary list preserved, favorite browsing, passing, unliking, restoring a prior like and replay without changing decisions');

  const pagination = await session();
  await mode(pagination.page, 'Предельный режим');
  const seen = [];
  for (let index = 0; index < people.length; index++) {
    await card(pagination.page, index);
    seen.push(await pagination.page.locator('.swipe-card').getAttribute('data-candidate-id'));
    await choose(pagination.page, index, 'passed');
  }
  await pagination.page.getByText('Все карточки просмотрены', { exact: true }).waitFor();
  assert.equal(new Set(seen).size, people.length, 'Each profile is presented exactly once');
  assert.ok(pagination.backend.searches.some(request => request.offset === 30) && pagination.backend.searches.some(request => request.offset === 60), 'The feed loads later API pages automatically');
  assert.equal(pagination.backend.state.candidateDecisions.length, people.length);
  assert.deepEqual(pagination.backend.state.invitations, []);
  console.log('PASS Automatic feed pagination beyond the first page, unique cards and a finite end state');

  const filtered = await session([decision(0, 'liked'), decision(1, 'passed'), decision(32, 'liked')]);
  const specialized = filtered.page.waitForResponse(response => new URL(response.url()).pathname === '/api/directory/search'
    && JSON.parse(new URL(response.url()).searchParams.get('filters') || '{}').specialization === 'Embedded');
  await filtered.page.getByRole('combobox', { name: 'Специализация', exact: true }).selectOption('Embedded'); await specialized;
  await ready(filtered.page);
  await filtered.page.getByRole('textbox', { name: 'Потребность работодателя' }).fill('схемы и датчики');
  const searched = filtered.page.waitForResponse(response => new URL(response.url()).pathname === '/api/directory/search'
    && new URL(response.url()).searchParams.get('q') === 'схемы и датчики');
  await filtered.page.getByRole('button', { name: 'Подобрать', exact: true }).click(); await searched; await ready(filtered.page);
  assert.deepEqual(await filtered.page.locator('.person-link').allTextContents(), [people[2].name, people[32].name, people[64].name]);
  await mode(filtered.page, 'Предельный режим'); await card(filtered.page, 2);
  await choose(filtered.page, 2, 'passed'); await card(filtered.page, 64);
  await choose(filtered.page, 64, 'passed');
  await filtered.page.getByText('Все карточки просмотрены', { exact: true }).waitFor();
  await change(filtered.page, () => filtered.page.getByRole('button', { name: 'Посмотреть снова', exact: true }).click(),
    state => hasDecision(state, 2, undefined) && hasDecision(state, 64, undefined));
  await card(filtered.page, 2);
  assert.ok(hasDecision(filtered.backend.state, 1, 'passed'), 'Replay preserves passes outside the active search');
  assert.ok(hasDecision(filtered.backend.state, 0, 'liked') && hasDecision(filtered.backend.state, 32, 'liked'), 'Replay preserves all likes');
  await filtered.page.getByRole('button', { name: 'Избранные кандидаты', exact: true }).click(); await card(filtered.page, 32);
  assert.equal(filtered.backend.searches.at(-1).query, 'схемы и датчики');
  assert.equal(filtered.backend.searches.at(-1).filters.specialization, 'Embedded');
  console.log('PASS Shared query/filter results, favorites within the selection and scoped replay preserving unrelated decisions');
  assert.deepEqual(errors, [], 'No uncaught browser errors');
} finally {
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
}
