import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { directoryCandidates, legacyDirectoryCandidates } from '../../server/directory-seed.mjs';
import { startIsolatedService } from './helpers/isolated-service.mjs';

// Real authentication, API, SQLite and UI; email stays in memory. Canonical
// fictional profiles are reshaped only in this disposable database. A fixed
// encoder tests the recommendation plumbing, not the neural model's quality.
const isolated = await startIsolatedService();
const { base, service, codes } = isolated;
service.directory.encoder.close();
let encodeCalls = 0;
service.directory.encoder = {
  info: { status: 'ready', name: 'Hiring needs UI fixture', version: 'hiring-needs-ui-fixture',
    dimension: 2, trained: false, threshold: 0.5 },
  async start() { return this.info; },
  async encode(texts) { encodeCalls++; return texts.map(() => [1, 0]); },
  close() {},
};
const seeds = [...directoryCandidates, ...legacyDirectoryCandidates];
for (let index = 0; index < seeds.length; index++) {
  const specialization = index < 45 ? 'Frontend' : index < 55 ? 'Backend' : 'ML';
  const grade = index < 45 ? 'Middle' : index < 55 ? 'Junior' : 'Senior';
  const score = index < 45 ? 100 : index < 55 ? 90 : 85;
  const person = { ...seeds[index], name: `Демо специалист ${String(index).padStart(3, '0')}`,
    specialization, desiredGrade: grade, professionalRole: specialization,
    confirmed: { ...seeds[index].confirmed, specialization, grade, score },
    stack: specialization === 'Frontend' ? ['React', 'TypeScript'] : ['Python'],
    bio: 'Развиваю продукт для пользователей и обрабатываю заявки.',
    workHistory: 'Работал над улучшением продукта и обработкой заявок.',
    city: 'Москва', industry: 'ИТ', salaryFrom: 150000, salaryTo: 180000,
    achievements: [], visible: index < 65, consent: true, synthetic: true };
  service.directory.store.upsert(person, null, true);
}

const browser = await chromium.launch();
const contexts = [];
const errors = [];
const requests = [];
const releasePending = [];
const artifacts = fileURLToPath(new URL('../../server/data/', import.meta.url));
const require = createRequire(import.meta.url);
const firstNeed = { title: 'Развитие продукта', team: 'Команда продукта: пять специалистов.',
  tasks: 'Улучшать продукт для пользователей и обрабатывать заявки.' };
const secondNeed = { title: 'Обработка заявок', team: 'Команда внутренних сервисов.',
  tasks: 'Обрабатывать заявки и сохранять изменения.', specialization: 'Backend', grade: 'Junior', stack: 'Python' };

async function actor(login) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
  contexts.push(context);
  const account = { role: 'employer', login, email: `${login}@example.invalid`,
    companyName: `Проверочная команда ${login}`, password: 'HiringNeedsFixture973!' };
  const requested = await context.request.post(base + '/api/auth/register/request-code', { data: { ...account, consent: true } });
  assert.equal(requested.status(), 202, await requested.text());
  assert.match(codes.get(account.email), /^\d{6}$/u);
  const verified = await context.request.post(base + '/api/auth/register/verify', {
    data: { email: account.email, code: codes.get(account.email) },
  });
  assert.equal(verified.status(), 201, await verified.text());
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/api/directory/search') requests.push(url);
  });
  await page.goto(base + '/app?role=employer');
  await ready(page);
  return { context, page };
}
async function ready(page) {
  await page.locator('.main-content[data-sync-status="saved"]').waitFor();
  await page.locator('.candidate-list[aria-busy="false"]').waitFor();
  assert.equal(await page.locator('.directory-error').count(), 0);
}
async function snapshot(context) {
  const response = await context.request.get(base + '/api/platform/state');
  assert.equal(response.status(), 200, await response.text());
  return response.json();
}
async function openNeeds(page) {
  const button = page.getByRole('button', { name: 'Потребности', exact: true });
  if (await button.getAttribute('aria-expanded') !== 'true') await button.click();
}
async function fillNeed(page, need) {
  await page.getByLabel('Название потребности', { exact: true }).fill(need.title);
  await page.getByLabel('Команда', { exact: true }).fill(need.team);
  await page.getByLabel('Задачи', { exact: true }).fill(need.tasks);
  await page.getByLabel('Специализация потребности', { exact: true }).selectOption(need.specialization || '');
  await page.getByLabel('Грейд потребности', { exact: true }).selectOption(need.grade || '');
  await page.getByLabel('Стек потребности', { exact: true }).fill(need.stack || '');
}
async function saveNeed(page, need) {
  await fillNeed(page, need);
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/platform/state'
    && response.status() === 200
    && response.request().method() === 'PUT'
    && response.request().postDataJSON()?.state?.hiringNeeds?.some(item => item.title === need.title && item.tasks === need.tasks));
  await page.getByRole('button', { name: 'Сохранить потребность', exact: true }).click();
  const response = await saved;
  assert.equal(response.status(), 200, await response.text());
  await ready(page);
}
async function searchChange(page, action, predicate = () => true) {
  const pending = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/directory/search' && predicate(url);
  });
  const [, response] = await Promise.all([action(), pending]);
  assert.equal(response.status(), 200, await response.text());
  const result = await response.json();
  await ready(page);
  return result;
}
const categoryOf = url => JSON.parse(url.searchParams.get('category') || 'null');
const filtersOf = url => JSON.parse(url.searchParams.get('filters') || '{}');
const categories = page => page.getByRole('region', { name: 'Рекомендованные категории', exact: true });
async function visibleCount(page, expected) {
  await page.waitForFunction(count => document.querySelectorAll('.candidate-row').length === count, expected);
}
function categoryCounts(result) {
  return result.categories.map(item => [item.specialization, item.grade, item.count]);
}
async function auditNeeds(page) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const violations = await page.evaluate(async () => (await window.axe.run({ include: [
    ['.hiring-needs'], ['.recommended-categories'],
  ] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations
    .map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })));
  assert.deepEqual(violations, [], 'Hiring need/category accessibility violations: ' + JSON.stringify(violations));
}

try {
  const first = await actor('needs.first');
  const { page, context } = first;
  const initialResponse = await context.request.get(base + '/api/directory/search');
  assert.equal(initialResponse.status(), 200);
  const initial = await initialResponse.json();
  assert.equal(initial.total, 65);
  assert.equal(initial.items.length, 30);
  assert.deepEqual(categoryCounts(initial), [['Frontend', 'Middle', 45], ['Backend', 'Junior', 10], ['ML', 'Senior', 10]]);
  await visibleCount(page, 30);
  await categories(page).getByRole('button', { name: /^Frontend-разработчик · Middle · 45/u }).waitFor();
  await categories(page).getByRole('button', { name: /^Backend-разработчик · Junior · 10/u }).waitFor();
  assert(initial.items.every(item => item.person.confirmed.specialization === 'Frontend'),
    'The second category is recommended even when none of its candidates is on page one');

  const frontCategory = { specialization: 'Frontend', grade: 'Middle' };
  const selected = await searchChange(page, () => categories(page).getByRole('button', { name: /^Frontend-разработчик · Middle · 45/u }).click(),
    url => categoryOf(url)?.specialization === 'Frontend' && Number(url.searchParams.get('offset')) === 0);
  assert.equal(selected.total, 45);
  assert.deepEqual(selected.selectedCategory, frontCategory);
  assert.equal(selected.effectiveFilters.specialization, '', 'Category browsing is independent of the saved brief filters');
  assert.deepEqual(categoryCounts(selected), categoryCounts(initial));
  assert(selected.items.every(item => item.person.confirmed.specialization === 'Frontend' && item.person.confirmed.grade === 'Middle'));
  const additional = await searchChange(page, () => page.getByRole('button', { name: 'Показать ещё', exact: true }).click(),
    url => Number(url.searchParams.get('offset')) === 30 && categoryOf(url)?.specialization === 'Frontend');
  assert.equal(additional.items.length, 15);
  await visibleCount(page, 45);
  assert.equal(await page.getByRole('button', { name: 'Показать ещё', exact: true }).count(), 0);
  await searchChange(page, () => categories(page).getByRole('button', { name: 'Все категории', exact: true }).click(),
    url => categoryOf(url) === null && Number(url.searchParams.get('offset')) === 0);
  await visibleCount(page, 30);
  assert.equal(encodeCalls, 0, 'Filter/category-only browsing does not start the model');

  await page.getByText('Дополнительные фильтры', { exact: true }).click();
  await searchChange(page, () => page.getByLabel('Зарплата до, ₽/мес.', { exact: true }).fill('180000'),
    url => filtersOf(url).salaryMax === 180000);
  await openNeeds(page);
  await page.getByRole('button', { name: 'Новая потребность', exact: true }).click();
  await saveNeed(page, firstNeed);
  const firstSaved = (await snapshot(context)).state.hiringNeeds;
  assert.equal(firstSaved.length, 1);
  assert.equal(firstSaved[0].team, firstNeed.team);
  assert.equal(firstSaved[0].filters.salaryMax, 180000, 'Creating a brief preserves the current additional filters');
  const firstId = firstSaved[0].id;
  assert(firstId);
  await searchChange(page, () => page.getByRole('button', { name: `Подобрать для ${firstNeed.title}`, exact: true }).click(),
    url => (url.searchParams.get('q') || '').includes(firstNeed.tasks));
  assert(encodeCalls > 0, 'Choosing a saved need goes through the semantic search API');
  await visibleCount(page, 30);
  await page.reload();
  await ready(page);
  await openNeeds(page);
  assert.equal(await page.getByRole('button', { name: `Подобрать для ${firstNeed.title}`, exact: true }).count(), 1);
  assert.equal((await snapshot(context)).state.hiringNeeds[0].id, firstId);

  await page.getByRole('button', { name: `Изменить потребность ${firstNeed.title}`, exact: true }).click();
  assert.equal(await page.getByLabel('Команда', { exact: true }).inputValue(), firstNeed.team);
  const editedNeed = { ...firstNeed, title: 'Развитие кабинета', team: 'Команда продукта: семь специалистов.' };
  await saveNeed(page, editedNeed);
  const edited = (await snapshot(context)).state.hiringNeeds;
  assert.equal(edited.length, 1);
  assert.equal(edited[0].id, firstId, 'Editing keeps the same saved entity');
  assert.equal(edited[0].team, editedNeed.team);

  await page.getByRole('button', { name: 'Новая потребность', exact: true }).click();
  await saveNeed(page, secondNeed);
  assert.equal((await snapshot(context)).state.hiringNeeds.length, 2);
  const backend = await searchChange(page, () => page.getByRole('button', { name: `Подобрать для ${secondNeed.title}`, exact: true }).click(),
    url => filtersOf(url).specialization === 'Backend' && filtersOf(url).grade === 'Junior');
  assert.equal(backend.total, 10);
  assert.equal(backend.selectedCategory, null, 'Switching needs clears a category from the previous selection');
  assert.deepEqual(backend.effectiveFilters.stack, ['Python']);
  assert(backend.items.every(item => item.person.confirmed.specialization === 'Backend' && item.person.confirmed.grade === 'Junior'));
  await visibleCount(page, 10);
  const firstAgain = await searchChange(page, () => page.getByRole('button', { name: `Подобрать для ${editedNeed.title}`, exact: true }).click(),
    url => filtersOf(url).specialization === '' && filtersOf(url).grade === '');
  assert.equal(firstAgain.total, 65);
  assert.deepEqual(firstAgain.effectiveFilters.stack, []);
  assert.equal(firstAgain.effectiveFilters.salaryMax, 180000);
  await visibleCount(page, 30);

  const second = await actor('needs.second');
  await openNeeds(second.page);
  assert.deepEqual((await snapshot(second.context)).state.hiringNeeds || [], [], 'Saved employer needs are private to their owner');
  assert.equal(await second.page.getByRole('button', { name: `Подобрать для ${editedNeed.title}`, exact: true }).count(), 0);
  assert.equal(await second.page.getByRole('button', { name: `Подобрать для ${secondNeed.title}`, exact: true }).count(), 0);

  const deleted = page.waitForResponse(response => new URL(response.url()).pathname === '/api/platform/state'
    && response.request().method() === 'PUT'
    && response.request().postDataJSON()?.state?.hiringNeeds?.length === 1);
  await page.getByRole('button', { name: `Удалить потребность ${secondNeed.title}`, exact: true }).click();
  assert.equal((await deleted).status(), 200);
  await ready(page);
  await page.reload(); await ready(page); await openNeeds(page);
  const afterDeletion = (await snapshot(context)).state.hiringNeeds;
  assert.deepEqual(afterDeletion.map(item => item.id), [firstId]);
  assert.equal(await page.getByRole('button', { name: `Подобрать для ${secondNeed.title}`, exact: true }).count(), 0);

  // A second device creates a need while this page edits an existing one.
  // The UI must rebase its stale revision without dropping either change.
  const remoteSnapshot = await context.request.get(base + '/api/platform/state');
  const remoteBase = await remoteSnapshot.json();
  const remoteNeed = { ...remoteBase.state.hiringNeeds[0], id: 'remote-team-need', title: 'Задача другого устройства' };
  const remoteWrite = await context.request.put(base + '/api/platform/state', {
    headers: { 'X-Platform-Identity': remoteSnapshot.headers()['x-platform-identity'] },
    data: { state: { ...remoteBase.state, hiringNeeds: [remoteNeed, ...remoteBase.state.hiringNeeds] }, baseRevision: remoteBase.revision },
  });
  assert.equal(remoteWrite.status(), 200, await remoteWrite.text());
  await page.getByRole('button', { name: `Изменить потребность ${editedNeed.title}`, exact: true }).click();
  const concurrentEdit = { ...editedNeed, team: 'Команда продукта: восемь специалистов.' };
  await saveNeed(page, concurrentEdit);
  const rebased = (await snapshot(context)).state.hiringNeeds;
  assert.equal(rebased.length, 2);
  assert.equal(rebased.find(item => item.id === firstId).team, concurrentEdit.team);
  assert.equal(rebased.find(item => item.id === remoteNeed.id).title, remoteNeed.title);
  const mergeCases = await page.evaluate(async ({ baseline, remoteNeed }) => {
    const { rebaseState } = await import('/src/platform-api.ts');
    const localEdit = structuredClone(baseline), remote = structuredClone(baseline);
    localEdit.hiringNeeds[0].team = 'Локальная правка';
    remote.hiringNeeds.push(remoteNeed);
    const edited = rebaseState(localEdit, baseline, remote);
    const deleted = rebaseState({ ...baseline, hiringNeeds: [] }, baseline, remote);
    const legacy = structuredClone(baseline); delete legacy.hiringNeeds;
    return { edited: edited.hiringNeeds, deleted: deleted.hiringNeeds, legacy: rebaseState(legacy, baseline, remote).hiringNeeds };
  }, { baseline: { ...remoteBase.state, hiringNeeds: [remoteBase.state.hiringNeeds[0]] }, remoteNeed });
  assert.equal(mergeCases.edited.find(item => item.id === firstId).team, 'Локальная правка');
  assert.deepEqual(mergeCases.deleted.map(item => item.id), [remoteNeed.id]);
  assert.deepEqual(new Set(mergeCases.legacy.map(item => item.id)), new Set([firstId, remoteNeed.id]));

  // Use the persisted brief at phone sizes; recommendations and the expanded
  // editor must remain operable without horizontal scrolling.
  await mkdir(artifacts, { recursive: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('button', { name: `Изменить потребность ${editedNeed.title}`, exact: true }).click();
    assert.equal(await page.getByLabel('Название потребности', { exact: true }).inputValue(), editedNeed.title);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert.equal(overflow, false, `Hiring need editor overflows at ${width}px`);
    if (width === 390) {
      await auditNeeds(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: artifacts + '/hiring-needs-mobile.png' });
    }
    await page.getByRole('button', { name: 'Отмена', exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false,
      `Recommendation cards overflow at ${width}px`);
  }

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole('button', { name: `Изменить потребность ${editedNeed.title}`, exact: true }).click();
  await auditNeeds(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: artifacts + '/hiring-needs-desktop.png' });
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  const slowQuery = 'Развивать заявки.', freshQuery = 'Обрабатывать заявки.';
  let releaseSlow;
  const slowGate = new Promise(resolve => { releaseSlow = resolve; });
  releasePending.push(releaseSlow);
  let slowStarted, slowFinished;
  const started = new Promise(resolve => { slowStarted = resolve; });
  const finished = new Promise(resolve => { slowFinished = resolve; });
  await page.route('**/api/directory/search?*', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('q') !== slowQuery) return route.continue();
    try {
      const response = await route.fetch();
      const stale = await response.json();
      stale.categories = stale.categories.map(item => ({ ...item, count: 999 }));
      stale.items = stale.items.map(item => ({ ...item, person: { ...item.person, name: 'Просроченная карточка' } }));
      slowStarted();
      await slowGate;
      await route.fulfill({ response, json: stale }).catch(() => {});
    } finally { slowFinished(); }
  });
  await page.getByLabel('Потребность работодателя', { exact: true }).fill(slowQuery);
  await page.getByRole('button', { name: 'Подобрать', exact: true }).click();
  await started;
  assert.equal(await categories(page).count(), 0, 'Recommendations from a preceding query are hidden while the new query is pending');
  // Native AbortSignal.timeout is not guaranteed to follow Playwright's fake
  // clock. Cross the former 30-second deadline in real time: a slow search
  // stays pending and remains cancellable instead of showing a false error.
  await new Promise(resolve => setTimeout(resolve, 31000));
  assert.equal(await page.locator('.directory-error').count(), 0, 'A valid slow search must survive the former 30-second deadline');
  assert.equal(await page.locator('.candidate-list').getAttribute('aria-busy'), 'true');
  const fresh = await searchChange(page, async () => {
    await page.getByLabel('Потребность работодателя', { exact: true }).fill(freshQuery);
    await page.getByRole('button', { name: 'Подобрать', exact: true }).click();
  }, url => url.searchParams.get('q') === freshQuery);
  assert.equal(fresh.total, 65);
  releaseSlow(); await finished;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.getByText('Просроченная карточка', { exact: true }).count(), 0);
  assert.equal(await categories(page).getByRole('button', { name: /999/u }).count(), 0, 'A late obsolete response cannot restore recommendations');
  await page.unroute('**/api/directory/search?*');

  let failCategory = true;
  await page.route('**/api/directory/search?*', async route => {
    if (failCategory && categoryOf(new URL(route.request().url()))?.specialization === 'Frontend') {
      failCategory = false;
      return route.fulfill({ status: 503, json: { error: 'Категория временно недоступна.' } });
    }
    return route.continue();
  });
  const failed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/directory/search' && response.status() === 503);
  await categories(page).getByRole('button', { name: /^Frontend-разработчик · Middle · 45/u }).click();
  await failed;
  await page.getByRole('alert').filter({ hasText: 'Категория временно недоступна.' }).waitFor();
  assert.equal(await categories(page).count(), 0, 'An error must not label retained earlier profiles as current recommendations');
  const recovered = await searchChange(page, () => page.getByRole('button', { name: 'Сбросить категорию', exact: true }).click(),
    url => categoryOf(url) === null);
  assert.equal(recovered.total, 65);
  assert.equal(recovered.selectedCategory, null);
  await page.unroute('**/api/directory/search?*');
  assert(requests.some(url => categoryOf(url)?.specialization === 'Frontend' && Number(url.searchParams.get('offset')) === 30));
  assert.deepEqual(errors, []);
  console.log('PASS Saved employer needs, reload/edit/switch/delete/owner isolation, concurrent rebase, full-result category counts, category pagination, obsolete/error recovery, mobile layout and accessibility');
} finally {
  for (const release of releasePending) release();
  for (const context of contexts) await context.close();
  await browser.close();
  await isolated.close();
}
