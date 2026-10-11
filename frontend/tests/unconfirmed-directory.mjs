import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createAttempt, evaluate } from '../../server/assessment.mjs';
import { createInitialState } from '../src/model.ts';
import { startIsolatedService } from './helpers/isolated-service.mjs';
import { answerExam, answerKey, startExam } from './helpers/exam.mjs';

const isolated = await startIsolatedService();
const { base, service, codes } = isolated;
service.directory.store.db.prepare('DELETE FROM directory_candidates').run();
service.directory.encoder.close();
service.directory.encoder = { info: { status: 'ready', name: 'Publication UI test encoder', version: 'unconfirmed-ui-v1',
  dimension: 2, trained: false, threshold: 0.35 }, async start() { return this.info; },
  async encode(texts) { return texts.map(text => /^Frontend разработчик(?:\n|$)/u.test(text) ? [0, 1]
    : /ПОНИЖЕННАЯ СХОЖЕСТЬ/u.test(text) ? [0.6, 0.8] : [1, 0]); }, close() {} };
const browser = await chromium.launch();
const contexts = [], errors = [];
const artifacts = fileURLToPath(new URL('../../server/data/unconfirmed-directory-ui/', import.meta.url));
async function register(role, suffix) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
  contexts.push(context);
  const login = `publication.ui.${suffix}`;
  const account = { role, login, email: `${login}@example.invalid`, password: 'Publication UI isolated 193!', consent: true, privacyVersion: PRIVACY_POLICY_VERSION,
    ...(role === 'candidate' ? { name: `Кандидат ${suffix}` } : { companyName: 'Компания проверки анкеты' }) };
  const requested = await context.request.post(base + '/api/auth/register/request-code', { data: account });
  assert.equal(requested.status(), 202, await requested.text());
  const verified = await context.request.post(base + '/api/auth/register/verify', { data: { email: account.email, code: codes.get(account.email) } });
  assert.equal(verified.status(), 201, await verified.text());
  const token = (await context.cookies(base + '/api/platform/state')).find(item => item.name === 'predel_account_session').value;
  const owner = service.auth.accountForToken(token).platformOwner;
  return { context, account, owner };
}
function seed(actor, { confirmed = false, visible = true, complete = true, legacyClaim = false, grade = 'Senior' } = {}) {
  const time = Date.now();
  const survey = { id: `survey-${actor.account.login}`, date: new Date(time).toISOString(), industry: 'ИТ',
    professionalRole: 'Frontend разработчик', specialization: 'Frontend', desiredGrade: confirmed ? 'Junior' : grade,
    experience: '1 год', stack: ['React', 'TypeScript'], softSkills: ['Работа в команде'] };
  const state = createInitialState();
  Object.assign(state.profile, survey, { id: 'candidate-anna', name: actor.account.name, email: actor.account.email,
    consent: true, visible, city: 'Город проверки интерфейса', bio: confirmed ? 'ПОНИЖЕННАЯ СХОЖЕСТЬ. Создаю пользовательские формы.' : 'Создаю пользовательские формы.',
    surveyCompletedAt: complete ? survey.date : null });
  state.surveys = complete ? [survey] : [];
  if (confirmed) {
    const attempt = createAttempt(survey, '', [], time);
    service.store.insert(attempt, actor.owner, 'publication-ui-private-proof');
    const graded = evaluate(attempt, attempt.questions.map(question => ({ questionId: question.id, optionId: question.correctOptionId })), time + 1000);
    service.store.complete(attempt.id, graded.answerDigest, graded.result);
    state.history = [graded.result]; state.profile.confirmed = { specialization: graded.result.specialization, grade: graded.result.grade,
      score: graded.result.score, date: graded.result.date, surveyId: survey.id };
  }
  if (legacyClaim) state.profile.confirmed = { specialization: 'Frontend', grade: 'Senior', score: 100,
    date: new Date(time).toISOString(), surveyId: survey.id };
  service.platform.save(actor.owner, state, 0, 'candidate');
}
async function ready(page) {
  await page.locator('.main-content[data-sync-status="saved"]').waitFor();
  await page.locator('.candidate-list[aria-busy="false"]').waitFor();
  assert.equal(await page.locator('.directory-error').count(), 0);
}
async function change(page, action, predicate = () => true) {
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === '/api/directory/search' && predicate(new URL(response.url())));
  const [, response] = await Promise.all([action(), pending]);
  assert.equal(response.status(), 200, await response.text()); const result = await response.json();
  await ready(page); return result;
}

try {
  const candidate = await register('candidate', 'unconfirmed');
  const confirmed = await register('candidate', 'confirmed');
  const hidden = await register('candidate', 'hidden');
  const incomplete = await register('candidate', 'incomplete');
  const legacy = await register('candidate', 'legacy');
  const failed = await register('candidate', 'failed');
  const employer = await register('employer', 'employer');
  seed(candidate); seed(confirmed, { confirmed: true }); seed(hidden, { visible: false }); seed(incomplete, { complete: false });
  seed(legacy, { visible: false, legacyClaim: true });
  seed(failed, { visible: false, grade: 'Junior' });
  const company = createInitialState(); Object.assign(company.company, { name: employer.account.companyName, contact: employer.account.email });
  service.platform.save(employer.owner, company, 0, 'employer');
  const page = await employer.context.newPage(); page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/?role=employer&tab=candidates'); await ready(page);
  const rows = page.locator('.candidate-row');
  assert.equal(await rows.count(), 1, 'The main selection shows only confirmed categories');
  assert.match(await rows.first().innerText(), new RegExp(confirmed.account.name));
  await page.getByLabel('Только анкеты без подтверждённого теста').check();
  await page.locator('.directory-warnings').getByText(/анкеты без успешного теста/u).waitFor();
  await page.waitForFunction(name => [...document.querySelectorAll('.candidate-row')].some(row => row.innerText.includes(name)), candidate.account.name);
  assert.equal(await rows.count(), 1, 'The separate mode shows only questionnaires without a test');
  const unconfirmed = rows.filter({ has: page.getByRole('button', { name: candidate.account.name, exact: true }) });
  assert.equal(await unconfirmed.count(), 1);
  assert.match(await unconfirmed.innerText(), /Грейд не подтверждён/);
  assert.match(await unconfirmed.innerText(), /(?:Желаемый|Предполагаемый)\s*(?:грейд)?\s*[·:]?\s*Senior/i);
  assert.equal(await unconfirmed.locator('.confirmed-icon').count(), 0);
  assert.doesNotMatch(await unconfirmed.locator('.test-score').innerText(), /\b(?:0|100)\s*\//);
  await unconfirmed.getByRole('button', { name: candidate.account.name, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  assert.match(await dialog.innerText(), /Не подтверждён/);
  assert.match(await dialog.innerText(), /Не пройдено/);
  assert.match(await dialog.innerText(), /(?:Желаемый|Предполагаемый)\s*(?:грейд)?\s*[·:]?\s*Senior/i);
  assert.equal(await dialog.locator('a[href^="mailto:"],a[href^="tel:"]').count(), 0);
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  const grade = page.getByRole('group', { name: 'Грейд', exact: true });
  const filtered = await change(page, () => grade.getByRole('button', { name: 'Junior', exact: true }).click(),
    url => JSON.parse(url.searchParams.get('filters')).grade === 'Junior');
  assert.equal(filtered.total, 1); assert.equal(await rows.count(), 1);
  assert.equal(filtered.items[0].person.name, confirmed.account.name);
  await change(page, () => grade.getByRole('button', { name: 'Все', exact: true }).click(),
    url => JSON.parse(url.searchParams.get('filters')).grade === '');
  await page.getByRole('textbox', { name: 'Потребность работодателя' }).fill('Создавать пользовательские формы');
  const semantic = await change(page, () => page.getByRole('button', { name: 'Подобрать', exact: true }).click(),
    url => url.searchParams.get('q') === 'Создавать пользовательские формы');
  assert.equal(semantic.total, 2); assert.equal(semantic.items[0].person.name, confirmed.account.name);
  assert.equal(semantic.items[1].person.name, candidate.account.name);
  assert(semantic.items[1].semanticScore > semantic.items[0].semanticScore);
  assert.equal(semantic.categories[0].count, 1);
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: artifacts + 'employer-unconfirmed.png', fullPage: true });
  const candidatePage = await candidate.context.newPage(); candidatePage.on('pageerror', error => errors.push(error.message));
  await candidatePage.goto(base + '/?role=candidate&tab=profile');
  await candidatePage.getByRole('heading', { name: 'Мой профиль', exact: true }).waitFor();
  assert.match(await candidatePage.locator('.category-status').innerText(), /Не подтверждён/);
  await candidatePage.getByRole('button', { name: 'Привязать ФСП', exact: true }).waitFor();
  await candidatePage.getByRole('button', { name: 'Подтвердить грейд', exact: true }).click();
  await candidatePage.getByRole('heading', { name: 'Тестирование', exact: true }).waitFor();
  await candidatePage.getByRole('button', { name: 'Начать тест', exact: true }).waitFor();
  const legacyPage = await legacy.context.newPage(); legacyPage.on('pageerror', error => errors.push(error.message));
  await legacyPage.goto(base + '/?role=candidate&tab=profile');
  await legacyPage.getByRole('heading', { name: 'Мой профиль', exact: true }).waitFor();
  assert.equal(service.directory.store.forOwner(legacy.owner).grade, '',
    'Reading a personal profile never publishes an unverifiable legacy grade');

  const failedPage = await failed.context.newPage(); failedPage.on('pageerror', error => errors.push(error.message));
  failedPage.setDefaultTimeout(20000);
  failedPage.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());
  await failedPage.goto(base + '/app?role=candidate&tab=assessment');
  const attempt = await startExam(failedPage);
  await answerExam(failedPage, answerKey('Frontend', 'Junior'), { correct: false });
  await failedPage.getByRole('button', { name: 'К профилю', exact: true }).click();
  await failedPage.getByRole('heading', { name: 'Мой профиль', exact: true }).waitFor();
  await failedPage.locator('.main-content[data-sync-status="saved"]').waitFor();
  assert.match(await failedPage.locator('.category-status').innerText(), /Не подтверждён/);
  const entry = failedPage.locator(`[data-result-id="${attempt.id}"]`);
  assert.match(await entry.innerText(), /Не пройден/);
  await entry.click();
  assert.match(await failedPage.getByRole('dialog', { name: 'Результат теста' }).innerText(), /0\/100/);
  await failedPage.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
  await failedPage.getByRole('button', { name: 'Анкеты', exact: true }).click();
  assert.equal(await failedPage.locator('.history-entry[data-survey-id]').count(), 1);

  await failedPage.getByRole('button', { name: 'Привязать ФСП', exact: true }).click();
  const fspDialog = failedPage.getByRole('dialog');
  await fspDialog.getByLabel('Привязать демонстрационный аккаунт и загрузить вымышленные достижения').check();
  await fspDialog.getByRole('button', { name: 'Привязать', exact: true }).click();
  await fspDialog.waitFor({ state: 'hidden' });
  await failedPage.locator('.fsp-evidence-list strong').filter({ hasText: 'Демонстрационное соревнование ФСП' }).waitFor();
  await failedPage.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
  const pdfDialog = failedPage.getByRole('dialog', { name: 'Профиль кандидата' });
  const downloaded = failedPage.waitForEvent('download');
  await pdfDialog.getByRole('button', { name: 'PDF-профиль', exact: true }).click();
  const download = await downloaded;
  assert.match(download.suggestedFilename(), /^predel-.*\.pdf$/u);
  await download.saveAs(artifacts + 'failed-profile.pdf');
  assert.equal((await readFile(artifacts + 'failed-profile.pdf')).subarray(0, 5).toString(), '%PDF-');
  await pdfDialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await failedPage.reload();
  await failedPage.getByRole('heading', { name: 'Мой профиль', exact: true }).waitFor();
  assert.match(await failedPage.locator(`[data-result-id="${attempt.id}"]`).innerText(), /Не пройден/);
  await failedPage.locator('.fsp-evidence-list strong').filter({ hasText: 'Демонстрационное соревнование ФСП' }).waitFor();
  const snapshot = await failed.context.request.get(base + '/api/platform/state').then(response => response.json());
  assert.equal(snapshot.state.profile.confirmed, null);
  assert.equal(snapshot.state.history[0].passed, false);
  assert.equal(snapshot.state.history[0].score, 0);
  await failedPage.screenshot({ path: artifacts + 'candidate-failed-profile.png', fullPage: true });
  const incompletePage = await incomplete.context.newPage();
  await incompletePage.goto(base + '/?role=candidate&tab=assessment');
  await incompletePage.getByRole('heading', { name: 'Анкета', exact: true }).waitFor();
  assert.equal(await incompletePage.getByRole('button', { name: 'Начать тест', exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('Unconfirmed questionnaire UI passed: publication and filters; personal profile before testing and after a real failed attempt, histories, FSP binding, PDF download and reload without confirming a grade.');
} finally {
  for (const context of contexts) await context.close();
  await browser.close(); await isolated.close();
}
