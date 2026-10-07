import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createInitialState } from '../src/model.ts';

// Fictional jobs and isolated API snapshots; applications never reach the real service.
const base = process.env.PREDEL_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL } : {}),
});
const contexts = [];
const errors = [];
const date = '2026-10-07T09:00:00.000Z';
const clone = value => structuredClone(value);
const companyFixtures = Array.from({ length: 13 }, (_, index) => ({
  id: `vacancy-deck-company-${index}`,
  name: index === 0 ? 'Студия интерфейсов' : index === 12 ? 'Дальняя компания' : `Тестовая компания ${index}`,
  industry: 'ИТ', website: '', contact: 'fixture@example.com',
  description: 'Вымышленная компания для проверки предложений.', synthetic: true, vacancies: [],
}));
const vacancyFixtures = Array.from({ length: 15 }, (_, index) => {
  const companyIndex = index < 3 ? 0 : index - 2;
  const company = companyFixtures[companyIndex];
  const specialization = index === 1 ? 'Backend' : 'Frontend';
  const title = index === 0 ? 'Разработчик интерфейсов' : index === 1 ? 'Уникальная серверная роль'
    : index === 2 ? 'Инженер веб-приложений' : `Разработчик продукта ${index}`;
  return {
    id: `vacancy-deck-job-${index}`, companyId: company.id, company: company.name,
    title, specialization, grade: 'Middle', city: 'Москва', format: 'Удалённо',
    salaryFrom: 150000, salaryTo: 200000, currency: 'RUB', status: 'open', date, synthetic: true,
    stack: specialization === 'Backend' ? ['Python', 'PostgreSQL'] : ['React', 'TypeScript'],
    description: `Предложение ${index + 1}: разрабатываем учебный продукт. ${'Проверяем удобство, качество и доступность сервиса. '.repeat(8)}\n\nПоследнее предложение описания ${index + 1} должно быть доступно целиком.`,
  };
});
for (const vacancy of vacancyFixtures) companyFixtures.find(company => company.id === vacancy.companyId).vacancies.push(vacancy);

function fixtureState() {
  const state = createInitialState();
  Object.assign(state.profile, {
    name: 'Тестовый кандидат', email: 'fixture@example.com', consent: true, visible: true,
    industry: 'ИТ', professionalRole: 'Разработчик', stack: ['React'], experience: '3 года', city: 'Москва',
    surveyCompletedAt: date, gradeChangedAt: date,
    confirmed: { specialization: 'Frontend', grade: 'Junior', score: 90, date, surveyId: 'vacancy-deck-survey' },
  });
  state.surveys = [{ id: 'vacancy-deck-survey', date, industry: 'ИТ', professionalRole: 'Разработчик',
    specialization: 'Frontend', desiredGrade: 'Junior', stack: ['React'], softSkills: [], experience: '3 года' }];
  return state;
}
function application(vacancy, message = '') {
  return { id: `vacancy-deck-application-${vacancy.id}`, vacancyId: vacancy.id,
    candidateId: 'candidate-anna', companyId: vacancy.companyId, company: vacancy.company,
    vacancy: clone(vacancy), candidate: null, status: 'sent', date, respondedAt: null, message, synthetic: true };
}

async function session({ applied = [], ...options } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce', ...options });
  contexts.push(context);
  const backend = { state: fixtureState(), revision: 1,
    applications: applied.map(index => application(vacancyFixtures[index])), posts: [], companyGets: [], vacancyGets: 0 };
  await context.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === '/api/auth/me') { await route.fulfill({ status: 401, json: { error: 'Гостевой кабинет.' } }); return; }
    let payload;
    if (url.pathname === '/api/platform/state') {
      if (request.method() === 'PUT') {
        const update = request.postDataJSON();
        if (update.baseRevision !== backend.revision) {
          await route.fulfill({ status: 409, json: { error: 'Изменена версия состояния.' } }); return;
        }
        backend.state = clone(update.state); backend.revision++;
      }
      payload = { state: clone(backend.state), revision: backend.revision, directoryPeople: [] };
    } else if (url.pathname === '/api/companies') {
      // The public feed must also include jobs of a company absent from this first catalog page.
      const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 12);
      backend.companyGets.push({ offset, limit });
      payload = { items: clone(companyFixtures.slice(offset, offset + limit)), total: companyFixtures.length,
        offset, limit, nextOffset: offset + limit < companyFixtures.length ? offset + limit : null };
    } else if (url.pathname === '/api/vacancies' && request.method() === 'GET') {
      backend.vacancyGets++;
      payload = { items: clone(vacancyFixtures) };
    } else if (url.pathname === '/api/applications' && request.method() === 'GET') {
      payload = { items: clone(backend.applications) };
    } else if (/^\/api\/vacancies\/[^/]+\/applications$/u.test(url.pathname) && request.method() === 'POST') {
      const vacancy = vacancyFixtures.find(item => item.id === decodeURIComponent(url.pathname.split('/')[3]));
      assert.ok(vacancy, 'Only fixture jobs may receive a test application');
      backend.posts.push({ vacancyId: vacancy.id, body: clone(request.postDataJSON()) });
      if (backend.applications.some(item => item.vacancyId === vacancy.id)) {
        await route.fulfill({ status: 409, json: { error: 'Отклик уже отправлен.' } }); return;
      }
      payload = application(vacancy, request.postDataJSON().message);
      backend.applications.push(clone(payload));
    } else {
      errors.push(`Unexpected mock API request: ${request.method()} ${url.pathname}`);
      await route.fulfill({ status: 404, json: { error: 'Неизвестный тестовый запрос.' } }); return;
    }
    await route.fulfill({ json: payload }).catch(() => {});
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/app?role=candidate&tab=invitations');
  await page.getByRole('button', { name: 'Найти компании', exact: true }).click();
  await page.getByRole('button', { name: 'Предельный режим', exact: true }).waitFor();
  await page.locator('.main-content[data-sync-status="saved"]').waitFor();
  return { context, page, backend };
}
async function mode(page, name) {
  const button = page.getByRole('button', { name, exact: true });
  await button.click();
  assert.equal(await button.getAttribute('aria-pressed'), 'true', 'The selected view is announced');
}
async function card(page, index) {
  const current = page.locator(`.swipe-card.vacancy-deck-card[data-vacancy-id="${vacancyFixtures[index].id}"]`);
  await current.waitFor();
  assert.equal(await page.locator('.swipe-card.vacancy-deck-card').count(), 1, 'Exactly one proposal is actionable');
  await current.getByRole('heading', { name: vacancyFixtures[index].title, exact: true }).waitFor();
  return current;
}
async function counter(page, position, total) {
  const element = page.locator('.vacancy-deck-counter');
  assert.equal(await element.getAttribute('aria-label'), `Предложение ${position} из ${total}`, 'The card position is announced');
  assert.equal((await element.textContent()).trim(), `${position} / ${total}`);
}
async function closeApply(page) {
  const dialog = page.getByRole('dialog', { name: 'Отклик на предложение', exact: true });
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
}
async function applyForm(page, index) {
  const dialog = page.getByRole('dialog', { name: 'Отклик на предложение', exact: true });
  await dialog.waitFor();
  await dialog.getByRole('heading', { name: vacancyFixtures[index].title, exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Отправить отклик', exact: true }).waitFor();
  return dialog;
}
async function gesture(page, dx, dy = 0) {
  await page.evaluate(() => getSelection()?.removeAllRanges());
  const current = page.locator('.swipe-card.vacancy-deck-card');
  await current.scrollIntoViewIfNeeded();
  const bounds = await current.boundingBox();
  assert.ok(bounds, 'A visible proposal is required for dragging');
  // Start in the card's empty padding, outside text selection and interactive controls.
  const x = bounds.x + bounds.width / 2, y = bounds.y + 16;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 }); await page.mouse.up();
}
async function touchGesture(page, dx) {
  const current = page.locator('.swipe-card.vacancy-deck-card');
  await current.scrollIntoViewIfNeeded();
  const bounds = await current.boundingBox();
  assert.ok(bounds);
  const x = bounds.x + bounds.width / 2, y = bounds.y + 60;
  const client = await page.context().newCDPSession(page);
  try {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 0 }] });
    for (let step = 1; step <= 10; step++) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * step / 10, y, id: 0 }] });
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await client.detach(); }
}
async function noOverflow(page, label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true,
    `${label}: the viewport must not overflow horizontally`);
}
async function screenshot(page, name) {
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL(`../test-results/vacancy-deck-${name}.png`, import.meta.url)), fullPage: true });
}

try {
  const interactive = await session(), { page, backend } = interactive;
  assert.equal(await page.getByRole('button', { name: 'Обычный режим', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.company-card').count(), 12, 'The ordinary catalog keeps its first page');
  await mode(page, 'Предельный режим');
  const first = await card(page, 0);
  await counter(page, 1, 15);
  assert.ok(backend.vacancyGets > 0, 'The proposal feed is loaded independently of the company page');
  await first.locator('summary').filter({ hasText: 'Полное описание' }).click();
  const description = first.locator('details p');
  assert.equal(await description.isVisible(), true, 'The complete description can be expanded');
  assert.equal(await description.textContent(), vacancyFixtures[0].description, 'The whole proposal description is available');
  assert.equal(await description.evaluate(element => getComputedStyle(element).webkitLineClamp), 'none', 'The expanded description must not be clamped');
  await first.locator('summary').filter({ hasText: 'Полное описание' }).click();
  await screenshot(page, 'desktop');
  await gesture(page, 10, 95); await card(page, 0);
  await gesture(page, -220); await card(page, 1);
  await counter(page, 2, 15);
  await page.getByRole('button', { name: 'Вернуть карточку', exact: true }).click(); await card(page, 0);
  await first.press('ArrowLeft'); await card(page, 1);
  assert.equal(await page.locator('.swipe-card.vacancy-deck-card').evaluate(element => element === document.activeElement), true,
    'Keyboard navigation keeps focus on the next proposal');
  await page.locator('.swipe-card.vacancy-deck-card').press('ArrowRight');
  await applyForm(page, 1);
  assert.deepEqual(backend.posts, [], 'A right arrow opens a form and sends no application');
  await closeApply(page); await card(page, 1);
  await page.getByRole('button', { name: 'Откликнуться', exact: true }).click();
  const dialog = await applyForm(page, 1);
  assert.deepEqual(backend.posts, [], 'Opening an application from the card sends no request');
  await dialog.getByRole('textbox', { name: 'Сообщение', exact: true }).fill('Тестовый отклик на отдельное предложение.');
  const sent = page.waitForResponse(response => response.request().method() === 'POST'
    && new URL(response.url()).pathname === `/api/vacancies/${vacancyFixtures[1].id}/applications`);
  await dialog.getByRole('button', { name: 'Отправить отклик', exact: true }).click();
  assert.equal((await sent).status(), 200);
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.swipe-card.vacancy-deck-card').evaluate(element => element === document.activeElement), true,
    'After submitting, keyboard browsing can continue from the proposal card');
  assert.equal(await page.getByRole('button', { name: 'Отклик отправлен', exact: true }).isDisabled(), true,
    'A newly submitted proposal is immediately protected against duplicate applications');
  assert.deepEqual(backend.posts, [{ vacancyId: vacancyFixtures[1].id, body: { message: 'Тестовый отклик на отдельное предложение.' } }]);
  await mode(page, 'Обычный режим');
  assert.equal(await page.locator('.company-card').count(), 12);
  await mode(page, 'Предельный режим');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('predel:company-mode')), 'deck', 'The view preference is stored');
  await page.reload();
  await page.getByRole('button', { name: 'Найти компании', exact: true }).click();
  await page.locator('.swipe-card.vacancy-deck-card').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Предельный режим', exact: true }).getAttribute('aria-pressed'), 'true', 'Refresh preserves proposal mode');
  console.log('PASS Individual proposals, full descriptions, mouse and keyboard navigation, undo, explicit application and persisted mode');

  const pagination = await session();
  await mode(pagination.page, 'Предельный режим');
  const seen = [];
  for (let index = 0; index < vacancyFixtures.length; index++) {
    const current = await card(pagination.page, index);
    seen.push(await current.getAttribute('data-vacancy-id'));
    await pagination.page.getByRole('button', { name: 'Пропустить', exact: true }).click();
  }
  await pagination.page.getByText('Все предложения просмотрены', { exact: true }).waitFor();
  assert.deepEqual(seen, vacancyFixtures.map(item => item.id), 'Every role, including three from one employer and a company beyond the first catalog page, appears exactly once');
  assert.deepEqual(pagination.backend.posts, [], 'Browsing the complete feed sends no applications');
  await pagination.page.getByRole('button', { name: 'Вернуть карточку', exact: true }).click(); await card(pagination.page, 14);
  await pagination.page.getByRole('button', { name: 'Пропустить', exact: true }).click();
  await pagination.page.getByRole('button', { name: 'Посмотреть снова', exact: true }).click(); await card(pagination.page, 0);
  console.log('PASS Complete feed beyond the company first page, unique proposals, finite end, undo and reset');

  const filtered = await session();
  await mode(filtered.page, 'Предельный режим'); await card(filtered.page, 0);
  const search = filtered.page.getByRole('textbox', { name: 'Компания или направление', exact: true });
  await search.fill(vacancyFixtures[1].title); await card(filtered.page, 1);
  await counter(filtered.page, 1, 1);
  await filtered.page.getByRole('button', { name: 'Пропустить', exact: true }).click();
  await filtered.page.getByText('Все предложения просмотрены', { exact: true }).waitFor();
  assert.equal(await filtered.page.locator('.swipe-card.vacancy-deck-card').count(), 0, 'Matching one role does not include its employer\'s other roles');
  await search.fill('Дальняя компания'); await card(filtered.page, 14);
  await search.fill(''); await card(filtered.page, 0);
  assert.deepEqual(filtered.backend.posts, []);
  console.log('PASS Search filters individual roles and finds employers absent from the first catalog page');

  const duplicate = await session({ applied: [0] });
  await mode(duplicate.page, 'Предельный режим');
  const appliedCard = await card(duplicate.page, 0);
  assert.equal(await appliedCard.getByRole('button', { name: 'Отклик отправлен', exact: true }).isDisabled(), true);
  await appliedCard.press('ArrowRight'); await card(duplicate.page, 0);
  assert.equal(await duplicate.page.getByRole('dialog').count(), 0, 'An applied proposal cannot open a duplicate application');
  assert.deepEqual(duplicate.backend.posts, []);
  await duplicate.page.getByRole('button', { name: 'Пропустить', exact: true }).click(); await card(duplicate.page, 1);
  console.log('PASS Existing applications stay visible and cannot be submitted twice');

  const mobile = await session({ viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true });
  await mode(mobile.page, 'Предельный режим'); await card(mobile.page, 0);
  await noOverflow(mobile.page, '390px proposal card');
  await screenshot(mobile.page, 'mobile-390');
  await touchGesture(mobile.page, -140); await card(mobile.page, 1);
  await mobile.page.getByRole('button', { name: 'Вернуть карточку', exact: true }).click(); await card(mobile.page, 0);
  await touchGesture(mobile.page, 140); await applyForm(mobile.page, 0);
  await noOverflow(mobile.page, '390px application dialog');
  assert.deepEqual(mobile.backend.posts, [], 'A native right swipe requires explicit submit');
  await closeApply(mobile.page);
  await mobile.page.setViewportSize({ width: 320, height: 900 }); await card(mobile.page, 0);
  await noOverflow(mobile.page, '320px proposal card');
  await screenshot(mobile.page, 'mobile-320');
  await mobile.page.getByRole('button', { name: 'Откликнуться', exact: true }).click(); await applyForm(mobile.page, 0);
  await noOverflow(mobile.page, '320px application dialog');
  await closeApply(mobile.page);
  await mode(mobile.page, 'Обычный режим'); await noOverflow(mobile.page, '320px ordinary catalog');
  console.log('PASS Native touch navigation and 390px/320px layouts including application dialogs');
  assert.deepEqual(errors, [], 'No uncaught browser errors or unexpected API requests');
} finally {
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
}
