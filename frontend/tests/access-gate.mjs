import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { createInitialState } from '../src/model.ts';
import { startIsolatedService } from './helpers/isolated-service.mjs';
import { answerExam, answerKey, startExam } from './helpers/exam.mjs';

// Real application, cookies and private SQLite stores; only the mail transport
// is replaced. No SMTP, development mailbox or persistent account is touched.
const fixture = await startIsolatedService();
const { base, service, codes } = fixture;
const browser = await chromium.launch();
const contexts = [];
const errors = [];
const candidate = { role: 'candidate', login: 'access.candidate', email: 'access.candidate@example.invalid', name: 'Тестовый зарегистрированный кандидат', password: 'FixtureCandidate928!' };
const employer = { role: 'employer', login: 'access.employer', email: 'access.employer@example.invalid', companyName: 'Тестовая зарегистрированная команда', password: 'FixtureEmployer329!' };

async function newContext({ poison = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  contexts.push(context);
  const cached = createInitialState();
  const survey = { id: 'stale-questionnaire', date: new Date().toISOString(), industry: 'ИТ', professionalRole: 'Кэш чужого кабинета',
    specialization: 'Frontend', desiredGrade: 'Junior', stack: ['React'], experience: '1 год', softSkills: [] };
  Object.assign(cached.profile, survey, { id: cached.profile.id, name: 'Кэш чужого кабинета', email: 'stale@example.invalid', consent: true,
    surveyCompletedAt: survey.date, confirmed: { specialization: 'Frontend', grade: 'Junior', score: 100, date: survey.date } });
  cached.surveys = [survey];
  await context.addInitScript(({ poison, cached }) => {
    window.__protectedFlashes = [];
    if (poison) {
      localStorage.setItem('predel:account:v1', 'anonymous');
      localStorage.setItem('predel:platform:v2', JSON.stringify(cached));
      localStorage.setItem('predel:sync:v1', JSON.stringify({ baseline: cached, draftHash: JSON.stringify(cached), dirty: true }));
    }
    new MutationObserver(() => {
      for (const element of document.querySelectorAll('.app-shell,.candidate-list,.onboarding-form,.profile-form')) {
        window.__protectedFlashes.push(element.className);
      }
    }).observe(document, { subtree: true, childList: true });
  }, { poison, cached });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  const requests = [];
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/')) requests.push({ pathname, method: request.method() });
  });
  return { context, page, requests };
}
async function snapshot(context) {
  const response = await context.request.get(base + '/api/platform/state');
  assert.equal(response.status(), 200, await response.text());
  return { ...await response.json(), identity: response.headers()['x-platform-identity'] };
}
async function saved(page) {
  await page.locator('.main-content[data-sync-status="saved"]').waitFor();
}
async function refresh(page) {
  const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/platform/state' && response.request().method() === 'GET');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const actual = await response;
  assert.equal(actual.status(), 200);
  return actual.json();
}
async function downloadedPdfText(page, dialog) {
  const downloaded = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'PDF-профиль', exact: true }).click();
  const stream = await (await downloaded).createReadStream(), chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  return page.evaluate(async bytes => {
    const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/resume-assets/pdf/pdf.worker.min.mjs';
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes), cMapUrl: '/resume-assets/pdf/cmaps/', cMapPacked: true,
      standardFontDataUrl: '/resume-assets/pdf/standard_fonts/', wasmUrl: '/resume-assets/pdf/wasm/' });
    try {
      const document = await task.promise, texts = [];
      for (let index = 1; index <= document.numPages; index++) {
        const sheet = await document.getPage(index), content = await sheet.getTextContent();
        texts.push(content.items.map(item => item.str || '').join(' ')); sheet.cleanup();
      }
      return texts.join('\n');
    } finally { await task.destroy(); }
  }, [...bytes]);
}
async function assertGuestScreen(actor) {
  await actor.page.getByRole('heading', { name: 'Регистрация', exact: true }).waitFor();
  const url = new URL(actor.page.url());
  assert.equal(url.pathname, '/auth');
  assert.equal(url.searchParams.get('mode'), 'register');
  assert.equal(await actor.page.locator('.app-shell,.candidate-list,.onboarding-form,.profile-form').count(), 0);
  assert.deepEqual(await actor.page.evaluate(() => window.__protectedFlashes), [], 'A guest must never briefly see a cached cabinet');
  assert.deepEqual(actor.requests, [], 'Guest landing and registration must not read or save business data');
}
async function register(actor, account) {
  await actor.page.goto(base + '/auth?mode=register&role=' + account.role);
  await actor.page.getByRole('heading', { name: 'Регистрация', exact: true }).waitFor();
  await actor.page.getByLabel(account.role === 'candidate' ? 'Ваше имя' : 'Название компании', { exact: true }).fill(account.name || account.companyName);
  await actor.page.getByLabel('Логин', { exact: false }).fill(account.login);
  await actor.page.getByLabel('Эл. почта', { exact: true }).fill(account.email);
  await actor.page.getByLabel('Пароль', { exact: true }).fill(account.password);
  await actor.page.getByLabel('Повторите пароль', { exact: true }).fill(account.password);
  await actor.page.getByRole('checkbox', { name: /Согласен на обработку персональных данных/u }).check();
  const requested = actor.page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/register/request-code');
  await actor.page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  const response = await requested;
  assert.equal(response.status(), 202, await response.text());
  assert.equal((await response.json()).code, undefined);
  await actor.page.getByRole('heading', { name: 'Подтвердите почту', exact: true }).waitFor();
  const code = codes.get(account.email);
  assert.match(code, /^\d{6}$/u);
  const wrong = String((Number(code[0]) + 1) % 10) + code.slice(1);
  await actor.page.getByLabel('Код подтверждения').fill(wrong);
  await actor.page.getByRole('button', { name: 'Подтвердить почту', exact: true }).click();
  await actor.page.getByRole('alert').waitFor();
  assert.equal(new URL(actor.page.url()).pathname, '/auth');
  assert.equal((await actor.context.request.get(base + '/api/platform/state')).status(), 401);
  await actor.page.getByLabel('Код подтверждения').fill(code);
  await actor.page.getByRole('button', { name: 'Подтвердить почту', exact: true }).click();
  await actor.page.waitForURL(url => url.pathname === '/app' && url.searchParams.get('role') === account.role);
  await saved(actor.page);
  const me = await actor.context.request.get(base + '/api/auth/me');
  assert.equal(me.status(), 200);
  assert.equal((await me.json()).account.email, account.email);
}

try {
  const guest = await newContext({ poison: true });
  await guest.page.goto(base + '/');
  await guest.page.locator('.hero').getByRole('button', { name: 'Попробовать', exact: true }).click();
  await assertGuestScreen(guest);
  await guest.page.goto(base + '/');
  await guest.page.getByLabel('Кого вы ищете?', { exact: true }).fill('Разработчик интерфейсов');
  await guest.page.locator('#try').getByRole('button', { name: 'Подобрать специалистов', exact: true }).click();
  await assertGuestScreen(guest);
  assert.equal(new URL(guest.page.url()).searchParams.get('role'), 'employer');
  await guest.page.goto(base + '/');
  await guest.page.locator('.showcase-main').getByRole('button', { name: 'Открыть кабинет', exact: true }).click();
  await assertGuestScreen(guest);
  await guest.page.goto(base + '/');
  await guest.page.locator('.showcase-rail').getByRole('button', { name: 'Профиль', exact: true }).click();
  await guest.page.locator('.showcase-main').getByRole('button', { name: 'Открыть кабинет', exact: true }).click();
  await assertGuestScreen(guest);
  assert.equal(new URL(guest.page.url()).searchParams.get('role'), 'candidate');
  for (const role of ['employer', 'candidate']) {
    await guest.page.goto(base + '/app?role=' + role);
    await assertGuestScreen(guest);
    assert.equal(new URL(guest.page.url()).searchParams.get('role'), role);
  }
  await guest.page.setViewportSize({ width: 320, height: 800 });
  assert.equal(await guest.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await guest.page.addScriptTag({ path: createRequire(import.meta.url).resolve('axe-core/axe.min.js') });
  const issues = await guest.page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(issue => issue.id));
  assert.deepEqual(issues, []);
  const forbidden = [
    ['GET', '/api/platform/state'], ['PUT', '/api/platform/state', { state: createInitialState(), baseRevision: 0 }], ['DELETE', '/api/platform/state'],
    ['GET', '/api/directory/options'], ['GET', '/api/directory/search'], ['GET', '/api/directory/candidate-mikhail/contacts'],
    ['GET', '/api/companies'], ['GET', '/api/companies/demo-company-line'], ['GET', '/api/vacancies'],
    ['GET', '/api/vacancies?own=1'], ['GET', '/api/applications?role=candidate'], ['GET', '/api/applications?role=employer'],
    ['GET', '/api/assessment/program?specialization=Frontend&grade=Junior'], ['POST', '/api/assessment/attempts', { survey: createInitialState().profile }],
    ['POST', '/api/vacancies', {}], ['PATCH', '/api/vacancies/fictional', {}], ['POST', '/api/vacancies/fictional/applications', {}], ['PATCH', '/api/applications/fictional', {}],
  ];
  for (const [method, pathname, data] of forbidden) {
    const response = await guest.context.request.fetch(base + pathname, { method, ...(data === undefined ? {} : { data }) });
    assert.equal(response.status(), 401, `Guest business access: ${method} ${pathname}`);
  }
  assert.equal(service.directory.store.db.prepare('SELECT COUNT(*) AS n FROM platform_accounts').get().n, 0);
  console.log('PASS All landing entry points and direct cabinet links require registration; stale caches never flash, guest HTTP is denied and creates no profile');

  const worker = await newContext();
  await register(worker, candidate);
  await worker.page.getByRole('heading', { name: 'Анкета', exact: true }).waitFor();
  assert.equal(await worker.page.getByLabel('Имя и фамилия', { exact: true }).inputValue(), candidate.name);
  assert.equal(await worker.page.getByLabel('Email', { exact: true }).inputValue(), candidate.email);
  await worker.page.locator('.onboarding-form [name="industry"]').selectOption('ИТ');
  await worker.page.locator('.onboarding-form [name="professionalRole"]').fill('Frontend-разработчик');
  await worker.page.locator('.onboarding-form [name="specialization"]').selectOption('Frontend');
  await worker.page.locator('.onboarding-form [name="desiredGrade"]').selectOption('Junior');
  await worker.page.locator('.onboarding-form [name="stack"]').fill('React, TypeScript');
  await worker.page.locator('.onboarding-form [name="experience"]').fill('1 год');
  await worker.page.getByLabel('Согласен на обработку персональных данных', { exact: true }).check();
  await worker.page.getByLabel('Показывать профиль работодателям', { exact: true }).check();
  await worker.page.getByRole('button', { name: 'К тесту', exact: true }).click();
  await worker.page.getByRole('button', { name: 'Начать тест', exact: true }).waitFor();
  await startExam(worker.page);
  await answerExam(worker.page, answerKey('Frontend', 'Junior'));
  await worker.page.getByRole('button', { name: 'К профилю', exact: true }).click();
  await worker.page.getByRole('heading', { name: 'Мой профиль', exact: true }).waitFor();
  await saved(worker.page);
  assert.equal((await snapshot(worker.context)).state.profile.confirmed.grade, 'Junior');
  assert.equal((await worker.context.request.get(base + '/api/directory/search')).status(), 403);
  await worker.page.goto(base + '/app?role=employer');
  await worker.page.waitForURL(url => url.searchParams.get('role') === 'candidate');
  assert.equal(await worker.page.locator('.candidate-list').count(), 0);

  const company = await newContext();
  await register(company, employer);
  await company.page.getByRole('heading', { name: 'Кандидаты', exact: true }).waitFor();
  await company.page.getByRole('combobox', { name: /Специализация/u }).selectOption('Frontend');
  await company.page.getByRole('button', { name: 'Junior', exact: true }).click();
  await company.page.locator('.candidate-row').filter({ hasText: candidate.name }).waitFor();
  const catalog = await company.context.request.get(base + '/api/directory/search?filters=' + encodeURIComponent(JSON.stringify({ specialization: 'Frontend', grade: 'Junior' })));
  assert.equal(catalog.status(), 200);
  const items = (await catalog.json()).items;
  const person = items.find(item => item.person.name === candidate.name)?.person;
  assert.ok(person);
  assert.ok(!person.synthetic && !person.demoProfile, 'The registered candidate remains separate from demo samples');
  assert.ok(items.some(item => item.person.demoProfile), 'Authenticated employers can search marked catalogue samples');
  assert.ok(items.every(item => !item.person.synthetic || item.person.demoProfile), 'Local account fixtures cannot enter the ordinary catalogue');
  assert.ok(!person.email && !person.phone);
  assert.equal((await company.context.request.get(base + `/api/directory/${person.id}/contacts`)).status(), 403);
  assert.equal((await company.context.request.post(base + '/api/assessment/attempts', { data: {} })).status(), 403);
  await company.page.goto(base + '/app?role=candidate&tab=profile');
  await company.page.waitForURL(url => url.searchParams.get('role') === 'employer');
  const row = company.page.locator('.candidate-row').filter({ hasText: candidate.name });
  await row.getByRole('button', { name: 'Пригласить', exact: true }).click();
  const invite = company.page.getByRole('dialog');
  await invite.getByLabel('Предложение', { exact: true }).fill('Тестовое предложение');
  await invite.getByLabel('Условия и задачи', { exact: true }).fill('Разработка интерфейсов учебного проекта.');
  await invite.getByLabel('От', { exact: true }).fill('90000');
  await invite.getByLabel('До', { exact: true }).fill('120000');
  await invite.getByLabel('Контакт для связи', { exact: true }).fill(employer.email);
  const sent = company.page.waitForResponse(response => new URL(response.url()).pathname === '/api/platform/state'
    && response.request().method() === 'PUT' && response.request().postDataJSON()?.state?.invitations?.some(item => item.title === 'Тестовое предложение'));
  await invite.getByRole('button', { name: 'Отправить приглашение', exact: true }).click();
  assert.equal((await sent).status(), 200);
  await saved(company.page);
  await worker.page.goto(base + '/app?role=candidate&tab=invitations');
  const received = worker.page.locator('.invitation-card').filter({ hasText: 'Тестовое предложение' });
  const accepted = worker.page.waitForResponse(response => new URL(response.url()).pathname === '/api/platform/state'
    && response.request().method() === 'PUT' && response.request().postDataJSON()?.state?.invitations?.some(item => item.title === 'Тестовое предложение' && item.status === 'accepted'));
  await received.getByRole('button', { name: 'Принять', exact: true }).click();
  assert.equal((await accepted).status(), 200);
  await saved(worker.page);
  const contact = await company.context.request.get(base + `/api/directory/${person.id}/contacts`);
  assert.equal(contact.status(), 200);
  assert.equal((await contact.json()).email, candidate.email);
  console.log('PASS Isolated email confirmation, real graded assessment, fixed account roles and contacts opened only after the candidate accepts');

  const allowed = await refresh(company.page);
  assert.ok(allowed.contactCandidateIds.includes(person.id));
  await row.locator('.person-link').click();
  const profile = company.page.getByRole('dialog', { name: 'Профиль кандидата', exact: true });
  await profile.getByRole('link', { name: candidate.email, exact: true }).waitFor();
  assert.ok((await downloadedPdfText(company.page, profile)).includes(candidate.email), 'An authorized downloaded PDF contains the available contact');
  const owned = await snapshot(worker.context);
  owned.state.profile.consent = false; owned.state.profile.visible = false;
  const withdrawn = await worker.context.request.put(base + '/api/platform/state', {
    headers: { 'X-Platform-Identity': owned.identity }, data: { state: owned.state, baseRevision: owned.revision },
  });
  assert.equal(withdrawn.status(), 200, await withdrawn.text());
  assert.equal((await company.context.request.get(base + `/api/directory/${person.id}/contacts`)).status(), 403);
  const revoked = await refresh(company.page);
  assert.ok(!revoked.contactCandidateIds.includes(person.id));
  assert.ok(revoked.state.invitations.some(item => item.candidateId === person.id && item.status === 'accepted'), 'Accepted invitation metadata remains; current consent alone revokes contact authority');
  await profile.waitFor({ state: 'detached' });
  assert.equal(await company.page.locator(`a[href="mailto:${candidate.email}"]`).count(), 0, 'An already open dialog drops its cached private contact');
  assert.equal(await company.page.getByRole('button', { name: 'PDF-профиль', exact: true }).count(), 0, 'The revoked profile cannot export its cached private contact');
  const after = await company.context.request.get(base + '/api/directory/search');
  assert.equal(after.status(), 200);
  assert.ok(!(await after.json()).items.some(item => item.person.id === person.id));
  await company.page.locator('.candidate-row').filter({ hasText: candidate.name }).waitFor({ state: 'detached' });
  console.log('PASS Actual consent withdrawal closes the open employer profile and its further PDF export despite an accepted invitation; refreshed catalog excludes the candidate');

  await company.page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await company.page.waitForURL(url => url.pathname === '/');
  assert.equal((await company.context.request.get(base + '/api/platform/state')).status(), 401);
  company.requests.length = 0;
  await company.page.goto(base + '/app?role=employer');
  await assertGuestScreen(company);
  assert.equal(await company.page.getByText(candidate.name, { exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS Logout removes business access and protects a cached cabinet on re-entry');
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
  await fixture.close();
}
