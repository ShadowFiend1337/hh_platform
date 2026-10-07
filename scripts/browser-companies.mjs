import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// The integration uses its own fictional company, profiles, and owner cookies.
// It talks to the actual service; no API mocks or imported resume files.
const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const base = process.env.PREDEL_URL || 'http://127.0.0.1:5173';
const runId = Date.now().toString(36);
const fixture = {
  company: 'Тестовая компания ' + runId,
  companyEmail: `company.${runId}@example.com`,
  candidate: 'Тестовый кандидат ' + runId,
  candidateEmail: `candidate.${runId}@example.com`,
  vacancy: 'Инженер интерфейсов ' + runId,
  closedVacancy: 'Закрытая тестовая позиция ' + runId,
};
const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL } : {}),
});
const contexts = [];
const errors = [];

async function session() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
  contexts.push(context);
  // Initialize an independent HttpOnly owner cookie before opening the page.
  const response = await context.request.get(base + '/api/platform/state');
  assert.equal(response.status(), 200);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  return { context, page };
}
async function synced(page) {
  await page.waitForFunction(() => ['saved', 'error'].includes(document.querySelector('.main-content')?.getAttribute('data-sync-status')));
  assert.equal(await page.locator('.main-content').getAttribute('data-sync-status'), 'saved', 'The service must save the current profile');
}
function apiResponse(page, path, method = 'GET', predicate = () => true) {
  return page.waitForResponse(response => new URL(response.url()).pathname === path
    && response.request().method() === method && predicate(response));
}
async function get(context, path) {
  const response = await context.request.get(base + path);
  assert.equal(response.status(), 200, 'GET ' + path);
  return response.json();
}
async function audit(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'The company view must fit 320px');
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const violations = await page.evaluate(async () => (await window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
  })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })));
  assert.deepEqual(violations, [], 'Accessibility violations: ' + JSON.stringify(violations));
}
async function publish(page, title) {
  await page.getByRole('button', { name: 'Добавить предложение', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Добавить предложение', exact: true });
  await dialog.getByLabel('Название позиции', { exact: true }).fill(title);
  await dialog.getByLabel('Описание предложения', { exact: true }).fill('Разработка интерфейсов, проверка форм и доступности. Вымышленная учебная позиция.');
  await dialog.getByLabel('Зарплата от, ₽', { exact: true }).fill('120000');
  await dialog.getByLabel('Зарплата до, ₽', { exact: true }).fill('160000');
  await dialog.getByRole('combobox', { name: 'Специализация', exact: true }).selectOption('Frontend');
  await dialog.getByRole('combobox', { name: 'Грейд', exact: true }).selectOption('Junior');
  await dialog.getByLabel('Город', { exact: true }).fill('Москва');
  await dialog.getByRole('combobox', { name: 'Формат работы', exact: true }).selectOption('Удалённо');
  await dialog.getByLabel('Стек', { exact: true }).fill('React, TypeScript');
  const created = apiResponse(page, '/api/vacancies', 'POST');
  await dialog.getByRole('button', { name: 'Опубликовать', exact: true }).click();
  const response = await created;
  assert.equal(response.status(), 201, 'A published position must be created by the actual API');
  const vacancy = await response.json();
  assert.equal(vacancy.title, title);
  assert.equal(vacancy.salaryFrom, 120000); assert.equal(vacancy.salaryTo, 160000);
  await page.locator(`.company-offer-card[data-vacancy-id="${vacancy.id}"]`).waitFor();
  return vacancy;
}
async function candidateProfile({ page, context }) {
  await page.goto(base + '/app?role=candidate&tab=onboarding');
  await page.locator('.onboarding-form').waitFor(); await synced(page);
  await page.getByLabel('Имя и фамилия', { exact: true }).fill(fixture.candidate);
  await page.getByLabel('Email', { exact: true }).fill(fixture.candidateEmail);
  await page.getByRole('combobox', { name: 'Отрасль', exact: true }).selectOption('ИТ');
  await page.getByLabel('Роль в команде', { exact: true }).fill('Разработчик интерфейсов');
  await page.getByRole('combobox', { name: 'Специализация', exact: true }).selectOption('Frontend');
  await page.getByRole('combobox', { name: 'Предполагаемый грейд', exact: true }).selectOption('Junior');
  await page.getByLabel('Стек', { exact: true }).fill('React, TypeScript');
  await page.getByLabel('Общий стаж', { exact: true }).fill('Без опыта');
  await page.getByLabel('Согласен на обработку персональных данных', { exact: true }).check();
  const saved = apiResponse(page, '/api/platform/state', 'PUT', response =>
    response.request().postDataJSON()?.state?.profile?.email === fixture.candidateEmail);
  await page.getByRole('button', { name: 'К тесту', exact: true }).click();
  assert.equal((await saved).status(), 200); await synced(page);
  const current = await get(context, '/api/platform/state');
  assert.equal(current.state.profile.confirmed, null, 'An application must not require a fabricated qualification');
  assert.equal(current.state.profile.visible, false, 'An application must not require public profile publication');
}
async function invitations(page) {
  await page.locator('.main-nav').getByRole('link', { name: /^Приглашения/u }).click();
}
function companyCard(page) {
  return page.locator('.company-card').filter({ has: page.getByRole('heading', { name: fixture.company, exact: true }) });
}
function vacancyCard(page, title) {
  return page.locator('.vacancy-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}
function applicationCard(page, id) { return page.locator(`.application-card[data-application-id="${id}"]`); }
async function openCompany(page) {
  await page.getByLabel('Компания или направление', { exact: true }).fill(fixture.company);
  await companyCard(page).getByRole('button', { name: 'Посмотреть предложения', exact: true }).click();
  await page.getByRole('dialog', { name: fixture.company, exact: true }).waitFor();
}

try {
  const employer = await session();
  const candidate = await session();
  const unrelated = await session();
  const owners = await Promise.all(contexts.map(context => context.cookies(base + '/api/platform/state')));
  const cookies = owners.map(items => items.find(cookie => cookie.name === 'predel_session')?.value);
  assert.ok(cookies.every(Boolean) && new Set(cookies).size === 3, 'Owner sessions must be isolated');

  await unrelated.page.goto(base + '/app?role=employer&tab=company');
  await synced(unrelated.page);

  await employer.page.goto(base + '/app?role=employer&tab=company');
  await synced(employer.page);
  await employer.page.getByLabel('Название', { exact: true }).fill(fixture.company);
  await employer.page.getByLabel('Направление', { exact: true }).fill('Продуктовая разработка');
  await employer.page.getByLabel('Сайт', { exact: true }).fill('https://example.com');
  await employer.page.getByLabel('Контактный email', { exact: true }).fill(fixture.companyEmail);
  await employer.page.getByRole('textbox', { name: 'О компании', exact: true }).fill('Вымышленная компания для проверки публикации и откликов.');
  const companySaved = apiResponse(employer.page, '/api/platform/state', 'PUT', response =>
    response.request().postDataJSON()?.state?.company?.name === fixture.company);
  await employer.page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  assert.equal((await companySaved).status(), 200); await synced(employer.page);
  const companyState = await get(employer.context, '/api/platform/state');
  assert.equal(companyState.state.company.name, fixture.company);

  const vacancy = await publish(employer.page, fixture.vacancy);
  const closedVacancy = await publish(employer.page, fixture.closedVacancy);
  const ownVacancies = await get(employer.context, '/api/vacancies?own=1');
  assert.ok(ownVacancies.items.some(item => item.id === vacancy.id && item.status === 'open'));
  assert.ok(ownVacancies.items.some(item => item.id === closedVacancy.id && item.status === 'open'));
  const publishedCompanies = await get(candidate.context, '/api/companies');
  const publishedCompany = publishedCompanies.items.find(item => item.name === fixture.company);
  assert.ok(publishedCompany, 'The public directory must contain a company with published positions');
  assert.ok(publishedCompany.vacancies.some(item => item.id === vacancy.id));
  console.log('PASS Independent owner sessions, company save and actual vacancy publication with salary');

  await candidateProfile(candidate);
  await invitations(candidate.page);
  const directoryLoaded = apiResponse(candidate.page, '/api/companies');
  await candidate.page.getByRole('button', { name: 'Найти компании', exact: true }).click();
  assert.equal((await directoryLoaded).status(), 200);
  await openCompany(candidate.page);
  assert.match(await vacancyCard(candidate.page, fixture.vacancy).textContent(), /120\s000.*160\s000/u, 'The candidate sees the offered salary');
  await vacancyCard(candidate.page, fixture.vacancy).getByRole('button', { name: 'Откликнуться', exact: true }).click();
  const applyDialog = candidate.page.getByRole('dialog', { name: 'Отклик на предложение', exact: true });
  await applyDialog.getByLabel('Сообщение', { exact: true }).fill('Готов обсудить задачи интерфейса. Вымышленный отклик для интеграционной проверки.');
  const applied = apiResponse(candidate.page, `/api/vacancies/${vacancy.id}/applications`, 'POST');
  await applyDialog.getByRole('button', { name: 'Отправить отклик', exact: true }).click();
  const applicationResponse = await applied;
  assert.equal(applicationResponse.status(), 201);
  const application = await applicationResponse.json();
  assert.equal(application.status, 'sent'); assert.equal(application.vacancyId, vacancy.id);
  assert.equal(application.candidateId, 'candidate-anna', 'A candidate gets only the own-ID alias');
  await vacancyCard(candidate.page, fixture.vacancy).getByRole('button', { name: 'Отклик отправлен', exact: true }).waitFor();
  assert.equal(await vacancyCard(candidate.page, fixture.vacancy).getByRole('button', { name: 'Отклик отправлен', exact: true }).isDisabled(), true);
  const duplicate = await candidate.context.request.post(base + `/api/vacancies/${vacancy.id}/applications`, { data: { message: 'Повторный тестовый отклик' } });
  assert.equal(duplicate.status(), 409, 'A duplicate application is rejected by the service');
  const outgoing = await get(candidate.context, '/api/applications?role=candidate');
  assert.equal(outgoing.items.filter(item => item.vacancyId === vacancy.id).length, 1);
  assert.equal(outgoing.items[0].vacancy.salaryFrom, 120000); assert.equal(outgoing.items[0].vacancy.salaryTo, 160000);
  await candidate.page.getByRole('dialog', { name: fixture.company, exact: true }).getByRole('button', { name: 'Закрыть', exact: true }).click();
  await candidate.page.getByRole('button', { name: 'Предложения', exact: true }).click();
  await applicationCard(candidate.page, application.id).waitFor();
  assert.equal(await applicationCard(candidate.page, application.id).locator('.application-status').textContent(), 'На рассмотрении');
  assert.match(await applicationCard(candidate.page, application.id).textContent(), new RegExp(fixture.vacancy, 'u'));
  await candidate.page.reload(); await synced(candidate.page);
  await candidate.page.getByRole('button', { name: 'Предложения', exact: true }).click();
  await applicationCard(candidate.page, application.id).waitFor();
  console.log('PASS Candidate company discovery and explicit application without a test, duplicate protection and reload');

  await invitations(employer.page);
  await employer.page.getByRole('button', { name: 'Отклики', exact: true }).click();
  await applicationCard(employer.page, application.id).waitFor();
  assert.equal(await applicationCard(employer.page, application.id).locator('.application-status').textContent(), 'На рассмотрении');
  const incoming = await get(employer.context, '/api/applications?role=employer');
  const received = incoming.items.find(item => item.id === application.id);
  assert.ok(received && received.candidate?.name === fixture.candidate, 'Only the addressed company receives the applicant profile');
  assert.notEqual(received.candidateId, 'candidate-anna', 'The employer uses the real addressed profile ID');
  assert.equal(received.candidate?.email || '', '', 'Application lists do not embed private contact details');
  const unrelatedApplications = await get(unrelated.context, '/api/applications?role=employer');
  assert.equal(unrelatedApplications.items.some(item => item.id === application.id), false, 'Other owners cannot list this application');
  const noContacts = await unrelated.context.request.get(base + `/api/directory/${received.candidateId}/contacts`);
  assert.ok([403, 404].includes(noContacts.status()), 'Other owners cannot read applicant contacts');
  const disclosed = await get(employer.context, `/api/directory/${received.candidateId}/contacts`);
  assert.equal(disclosed.email, fixture.candidateEmail, 'The addressed employer receives consented contacts');
  await applicationCard(employer.page, application.id).getByRole('button', { name: 'Профиль', exact: true }).click();
  await employer.page.getByRole('dialog', { name: 'Профиль кандидата', exact: true }).waitFor();
  await employer.page.getByRole('dialog').getByRole('link', { name: fixture.candidateEmail, exact: true }).waitFor();
  await employer.page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
  const answered = apiResponse(employer.page, `/api/applications/${application.id}`, 'PATCH');
  await applicationCard(employer.page, application.id).getByRole('button', { name: 'Принять', exact: true }).click();
  const response = await answered;
  assert.equal(response.status(), 200); assert.equal((await response.json()).status, 'accepted');
  await employer.page.reload(); await synced(employer.page);
  await employer.page.getByRole('button', { name: 'Отклики', exact: true }).click();
  await applicationCard(employer.page, application.id).waitFor();
  await candidate.page.reload(); await synced(candidate.page);
  await candidate.page.getByRole('button', { name: 'Предложения', exact: true }).click();
  await applicationCard(candidate.page, application.id).waitFor();
  assert.equal((await get(candidate.context, '/api/applications?role=candidate')).items.find(item => item.id === application.id).status, 'accepted');
  assert.equal(await applicationCard(candidate.page, application.id).locator('.application-status').textContent(), 'Отклик принят', 'The candidate sees the company response');
  console.log('PASS Employer receives the application, recipient-only contacts, actual response and reload on both sides');

  // Keep the candidate's open company dialog stale while the employer closes a position.
  await candidate.page.getByRole('button', { name: 'Найти компании', exact: true }).click(); await openCompany(candidate.page);
  await vacancyCard(candidate.page, fixture.closedVacancy).getByRole('button', { name: 'Откликнуться', exact: true }).waitFor();
  await employer.page.locator('.main-nav').getByRole('link', { name: 'Компания', exact: true }).click();
  const closing = employer.page.locator(`.company-offer-card[data-vacancy-id="${closedVacancy.id}"]`);
  await closing.getByRole('button', { name: 'Закрыть позицию', exact: true }).click();
  const closeDialog = employer.page.getByRole('dialog', { name: 'Закрыть позицию', exact: true });
  const closed = apiResponse(employer.page, `/api/vacancies/${closedVacancy.id}`, 'PATCH');
  await closeDialog.getByRole('button', { name: 'Закрыть позицию', exact: true }).click();
  assert.equal((await closed).status(), 200);
  await closing.getByText('Закрыта', { exact: true }).waitFor();
  await vacancyCard(candidate.page, fixture.closedVacancy).getByRole('button', { name: 'Откликнуться', exact: true }).click();
  const staleDialog = candidate.page.getByRole('dialog', { name: 'Отклик на предложение', exact: true });
  const rejected = apiResponse(candidate.page, `/api/vacancies/${closedVacancy.id}/applications`, 'POST');
  await staleDialog.getByRole('button', { name: 'Отправить отклик', exact: true }).click();
  assert.equal((await rejected).status(), 409, 'The service rejects an application to a newly closed position');
  await staleDialog.getByRole('alert').waitFor();
  assert.equal((await get(candidate.context, '/api/applications?role=candidate')).items.some(item => item.vacancyId === closedVacancy.id), false);
  await staleDialog.getByRole('button', { name: '← К предложениям', exact: true }).click();
  await candidate.page.getByRole('dialog', { name: fixture.company, exact: true }).getByRole('button', { name: 'Закрыть', exact: true }).click();
  await candidate.page.reload(); await synced(candidate.page);
  await candidate.page.getByRole('button', { name: 'Найти компании', exact: true }).click(); await openCompany(candidate.page);
  assert.equal(await vacancyCard(candidate.page, fixture.closedVacancy).count(), 0, 'A fresh company view excludes the closed position');
  assert.equal((await get(employer.context, '/api/vacancies?own=1')).items.find(item => item.id === closedVacancy.id).status, 'closed');
  console.log('PASS Closed-position persistence and stale-page rejection without a phantom application');

  await candidate.page.setViewportSize({ width: 320, height: 900 }); await audit(candidate.page);
  await candidate.page.getByRole('dialog', { name: fixture.company, exact: true }).getByRole('button', { name: 'Закрыть', exact: true }).click();
  await audit(candidate.page);
  await candidate.page.getByRole('button', { name: 'Предложения', exact: true }).click();
  await applicationCard(candidate.page, application.id).waitFor(); await audit(candidate.page);
  await employer.page.setViewportSize({ width: 320, height: 900 }); await audit(employer.page);
  console.log('PASS 320px company directory, offer dialog, candidate applications and employer positions accessibility');
  assert.deepEqual(errors, [], 'No browser runtime errors');
} finally {
  // These cookies belong only to this test. Never delete another user's state.
  const cleanup = await Promise.allSettled(contexts.map(context => context.request.delete(base + '/api/platform/state')));
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
  for (const result of cleanup) if (result.status === 'fulfilled') assert.equal(result.value.status(), 200, 'Test session cleanup');
}
