import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createAttempt, digest, evaluate } from '../../server/assessment.mjs';
import { createInitialState } from '../src/model.ts';
import { startIsolatedService } from './helpers/isolated-service.mjs';

// Real registration, cookies, catalog and persistence in disposable SQLite.
// Mail stays in memory. The deterministic encoder checks the semantic request
// path and access scope, never the quality of the deployed neural model.
const isolated = await startIsolatedService();
const { base, service, codes } = isolated;
let encodeCalls = 0;
service.directory.encoder.close();
service.directory.encoder = {
  info: { status: 'ready', name: 'Isolated UI test encoder', version: 'demo-catalog-ui-fixture', dimension: 2,
    trained: false, threshold: 0.5 },
  async start() { return this.info; },
  async encode(texts) { encodeCalls++; return texts.map(() => [1, 0]); },
  close() {},
};
const browser = await chromium.launch();
const contexts = [];
const errors = [];
const employer = { role: 'employer', login: 'catalog.employer', email: 'catalog.employer@example.invalid',
  companyName: 'Проверочная команда каталога', password: 'CatalogEmployer927!' };

async function actor() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  const contactRequests = [];
  page.on('request', request => {
    if (/\/api\/directory\/[^/]+\/contacts$/u.test(new URL(request.url()).pathname)) contactRequests.push(request.url());
  });
  return { context, page, contactRequests };
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
async function register(page, account) {
  await page.goto(base + '/auth?mode=register&role=' + account.role);
  await page.getByRole('heading', { name: 'Регистрация', exact: true }).waitFor();
  await page.getByLabel('Название компании', { exact: true }).fill(account.companyName);
  await page.getByLabel('Логин', { exact: false }).fill(account.login);
  await page.getByLabel('Эл. почта', { exact: true }).fill(account.email);
  await page.getByLabel('Пароль', { exact: true }).fill(account.password);
  await page.getByLabel('Повторите пароль', { exact: true }).fill(account.password);
  await page.getByRole('checkbox', { name: /Согласен на обработку персональных данных/u }).check();
  const requested = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/register/request-code');
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  assert.equal((await requested).status(), 202);
  await page.getByRole('heading', { name: 'Подтвердите почту', exact: true }).waitFor();
  assert.match(codes.get(account.email), /^\d{6}$/u);
  await page.getByLabel('Код подтверждения').fill(codes.get(account.email));
  await page.getByRole('button', { name: 'Подтвердить почту', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/app' && url.searchParams.get('role') === account.role);
  await ready(page);
}
async function searchChange(page, action, predicate = () => true) {
  const pending = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/directory/search' && predicate(url);
  });
  const [, response] = await Promise.all([action(), pending]);
  assert.equal(response.status(), 200, await response.text());
  const data = await response.json();
  await ready(page);
  return data;
}
async function assertDemoRows(page) {
  const rows = page.locator('.candidate-row');
  assert.ok(await rows.count() > 0, 'A newly registered employer must have a usable catalog');
  for (const row of await rows.all()) assert.equal(await row.getByText('Демо', { exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Пригласить', exact: true }).count(), 0);
  assert.equal(await page.locator('.candidate-list a[href^="mailto:"],.candidate-list a[href^="tel:"]').count(), 0);
}
async function decide(page, name) {
  const id = await page.locator('.swipe-card').getAttribute('data-candidate-id');
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/platform/state'
    && response.request().method() === 'PUT');
  await page.getByRole('button', { name, exact: true }).click();
  assert.equal((await saved).status(), 200);
  await ready(page);
  return id;
}
async function registerApi(context, account) {
  const requested = await context.request.post(base + '/api/auth/register/request-code', { data: { ...account, consent: true, privacyVersion: PRIVACY_POLICY_VERSION } });
  assert.equal(requested.status(), 202, await requested.text());
  const verified = await context.request.post(base + '/api/auth/register/verify', {
    data: { email: account.email, code: codes.get(account.email) },
  });
  assert.equal(verified.status(), 201, await verified.text());
  const cookies = await context.cookies(base + '/api/platform/state');
  const token = cookies.find(cookie => cookie.name === 'predel_account_session')?.value;
  const identity = service.auth.accountForToken(token);
  assert.ok(identity?.platformOwner);
  return identity.platformOwner;
}

try {
  const ordinary = await actor();
  await register(ordinary.page, employer);
  const initial = await ordinary.context.request.get(base + '/api/directory/search');
  assert.equal(initial.status(), 200);
  const catalog = await initial.json();
  assert.ok(catalog.total > catalog.limit, 'The seed catalog remains available beyond the first page');
  assert.ok(catalog.items.every(item => item.person.demoProfile === true && item.person.synthetic === true));
  assert.ok(catalog.items.every(item => !item.person.email && !item.person.phone));
  await assertDemoRows(ordinary.page);
  const pageItems = await ordinary.page.locator('.candidate-row').count();
  await searchChange(ordinary.page, () => ordinary.page.getByRole('button', { name: 'Показать ещё', exact: true }).click(),
    url => Number(url.searchParams.get('offset')) > 0);
  assert.ok(await ordinary.page.locator('.candidate-row').count() > pageItems);
  await assertDemoRows(ordinary.page);

  const frontend = await searchChange(ordinary.page, () => ordinary.page.getByRole('combobox', { name: 'Специализация', exact: true }).selectOption('Frontend'));
  assert.ok(frontend.total > 0 && frontend.total < catalog.total);
  assert.ok(frontend.items.every(item => item.person.specialization === 'Frontend'));
  await ordinary.page.getByText('Дополнительные фильтры', { exact: true }).click();
  const moscow = await searchChange(ordinary.page, () => ordinary.page.getByRole('combobox', { name: 'Город', exact: true }).selectOption('Москва'));
  assert.ok(moscow.total > 0);
  assert.ok(moscow.items.every(item => item.person.specialization === 'Frontend' && item.person.city === 'Москва'));
  assert.equal(encodeCalls, 0, 'Filter-only browsing must not require a model');
  await assertDemoRows(ordinary.page);

  await ordinary.page.getByLabel('Потребность работодателя').fill('Создавать удобные формы');
  const semantic = await searchChange(ordinary.page, () => ordinary.page.getByRole('button', { name: 'Подобрать', exact: true }).click(),
    url => url.searchParams.get('q') === 'Создавать удобные формы');
  assert.ok(encodeCalls > 0);
  assert.ok(semantic.items.length > 0 && semantic.items.every(item => item.person.demoProfile && item.semanticScore !== null));
  await assertDemoRows(ordinary.page);

  const demoWithAchievements = semantic.items.find(item => item.person.achievements.length > 0)?.person;
  assert.ok(demoWithAchievements, 'The filtered catalog must include a demo with fictional FSP achievements');
  const demoRow = ordinary.page.locator('.candidate-row').filter({ has: ordinary.page.locator('.person-link', { hasText: demoWithAchievements.name }) });
  assert.equal(await demoRow.locator('.fsp-tag').count(), 1, 'The card medal has corresponding achievements');
  assert.equal(await demoRow.locator('.fsp-tag').getAttribute('title'), 'ФСП · демо: вымышленные результаты');
  await demoRow.locator('.person-link').click();
  const dialog = ordinary.page.getByRole('dialog');
  await dialog.waitFor();
  assert.equal(await dialog.getByText('Демо', { exact: true }).count(), 1);
  assert.equal(await dialog.getByRole('heading', { name: 'ФСП · демо', exact: true }).count(), 1);
  for (const achievement of demoWithAchievements.achievements) {
    assert.equal(await dialog.getByText(achievement.title, { exact: true }).count(), 1);
    assert.equal(await dialog.getByText(`${achievement.result} · ${achievement.year}`, { exact: true }).count(), 1);
  }
  assert.equal(await dialog.getByText('Истории ФСП пока нет', { exact: true }).count(), 0);
  assert.equal(await dialog.getByText('Недоступны для демопрофиля', { exact: true }).count(), 1);
  assert.equal(await dialog.getByRole('button', { name: 'Пригласить', exact: true }).count(), 0);
  assert.equal(await dialog.locator('a[href^="mailto:"],a[href^="tel:"]').count(), 0);
  const downloaded = ordinary.page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'PDF-профиль', exact: true }).click();
  const stream = await (await downloaded).createReadStream(), chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  const pdfText = await ordinary.page.evaluate(async bytes => {
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
  assert.match(pdfText, /демонстрацион/iu);
  assert.match(pdfText, /ФСП · демо/u);
  for (const achievement of demoWithAchievements.achievements) {
    assert.ok(pdfText.includes(achievement.title), 'PDF preserves the same fictional achievement as the displayed profile');
    assert.ok(pdfText.includes(achievement.result), 'PDF preserves the fictional result and demo provenance');
  }
  assert.match(pdfText, /Недоступны для демопрофиля/u);
  assert(!pdfText.includes('@'), 'The exported demo PDF does not reveal email contacts');
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  assert.deepEqual(ordinary.contactRequests, [], 'Inspecting a demo must never request its contacts');

  await searchChange(ordinary.page, () => ordinary.page.getByRole('button', { name: 'Очистить поиск', exact: true }).click(), url => !url.searchParams.get('q'));
  await searchChange(ordinary.page, () => ordinary.page.getByRole('button', { name: 'Сбросить', exact: true }).click());
  await ordinary.page.getByRole('button', { name: 'Предельный режим', exact: true }).click();
  await ordinary.page.locator('.swipe-card').waitFor();
  assert.equal(await ordinary.page.locator('.swipe-card').getByText('Демо', { exact: true }).count(), 1);
  assert.equal(await ordinary.page.getByRole('button', { name: 'Пригласить', exact: true }).count(), 0);
  const likedId = await decide(ordinary.page, 'Нравится');
  const passedId = await decide(ordinary.page, 'Пропустить');
  assert.notEqual(likedId, passedId);
  await ordinary.page.reload();
  await ready(ordinary.page);
  const persisted = (await snapshot(ordinary.context)).state.candidateDecisions;
  assert.ok(persisted.some(item => item.candidateId === likedId && item.decision === 'liked'));
  assert.ok(persisted.some(item => item.candidateId === passedId && item.decision === 'passed'));
  assert.notEqual(await ordinary.page.locator('.swipe-card').getAttribute('data-candidate-id'), likedId);
  assert.notEqual(await ordinary.page.locator('.swipe-card').getAttribute('data-candidate-id'), passedId);
  await ordinary.page.getByRole('button', { name: 'Избранные кандидаты', exact: true }).click();
  await ordinary.page.locator(`.swipe-card[data-candidate-id="${likedId}"]`).waitFor();
  assert.equal(await ordinary.page.getByRole('button', { name: 'Пригласить', exact: true }).count(), 0);

  // A registered synthetic local candidate is an interactive fixture account,
  // not an ownerless catalog example: the client must retain its workflow.
  const candidate = await actor();
  const owner = await registerApi(candidate.context, { role: 'candidate', login: 'local_candidate',
    email: 'candidate@local.example.test', name: 'Тестовый локальный кандидат', password: 'CatalogCandidate927!' });
  const state = createInitialState();
  const survey = { id: 'demo-catalog-local-survey', date: new Date().toISOString(), industry: 'ИТ', professionalRole: 'Frontend разработчик',
    specialization: 'Frontend', desiredGrade: 'Junior', experience: '1 год', stack: ['React'], softSkills: [] };
  const attempt = createAttempt(survey);
  service.store.insert(attempt, owner, digest('demo-catalog-local-fixture-result'));
  const evaluated = evaluate(attempt, attempt.questions.map(question => ({ questionId: question.id, optionId: question.correctOptionId })));
  service.store.complete(attempt.id, evaluated.answerDigest, evaluated.result);
  Object.assign(state.profile, survey, { name: 'Тестовый локальный кандидат', email: 'candidate@local.example.test',
    bio: 'Изолированный учебный интерфейс.', city: 'Москва', consent: true, visible: true, surveyCompletedAt: survey.date,
    confirmed: { specialization: evaluated.result.specialization, grade: evaluated.result.grade, score: evaluated.result.score,
      date: evaluated.result.date, surveyId: survey.id } });
  state.surveys = [survey]; state.history = [evaluated.result];
  service.platform.save(owner, state, 0, 'candidate');
  const local = await actor();
  await registerApi(local.context, { role: 'employer', login: 'local_employer', email: 'employer@local.example.test',
    companyName: 'Локальная проверочная команда', password: 'CatalogLocalEmployer927!' });
  await local.page.goto(base + '/app?role=employer');
  await ready(local.page);
  const localResult = await local.context.request.get(base + '/api/directory/search');
  const localPeople = (await localResult.json()).items;
  assert.equal(localPeople.length, 1);
  assert.equal(localPeople[0].person.synthetic, true);
  assert.notEqual(localPeople[0].person.demoProfile, true);
  assert.equal(await local.page.getByRole('button', { name: 'Пригласить', exact: true }).count(), 1);
  await local.page.getByRole('button', { name: 'Пригласить', exact: true }).click();
  await local.page.getByRole('dialog').getByRole('button', { name: 'Отправить приглашение', exact: true }).waitFor();
  assert.equal(await local.page.getByRole('dialog').getByRole('button', { name: 'Отправить приглашение', exact: true }).isEnabled(), true);

  await ordinary.page.getByRole('button', { name: 'Обычный режим', exact: true }).click();
  const artifacts = fileURLToPath(new URL('../../server/data/demo-catalog-ui/', import.meta.url));
  await mkdir(artifacts, { recursive: true });
  await ordinary.page.screenshot({ path: artifacts + '/catalog.png', fullPage: true });
  await ordinary.page.screenshot({ path: artifacts + '/catalog-viewport.png' });
  assert.deepEqual(errors, []);
  console.log('PASS Registered employer demo catalog, filters, semantic request, protected profiles, persistent swipe decisions and local fixture invitations');
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
  await isolated.close();
}
