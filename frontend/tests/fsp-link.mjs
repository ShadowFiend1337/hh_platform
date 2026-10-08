import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { createAttempt, digest, evaluate } from '../../server/assessment.mjs';
import { createInitialState } from '../src/model.ts';
import { startIsolatedService } from './helpers/isolated-service.mjs';

const isolated = await startIsolatedService();
const { base, service, codes } = isolated;
// The actual API and SQLite remain in memory; keep the employer's controlled
// filter result independent from the unrelated canonical catalog UI test.
service.directory.store.db.prepare('DELETE FROM directory_candidates WHERE owner IS NULL').run();
const browser = await chromium.launch();
const contexts = [];
const errors = [];
const require = createRequire(import.meta.url);
const artifacts = fileURLToPath(new URL('../../server/data/fsp-link-ui/', import.meta.url));
async function register(role, login) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  contexts.push(context);
  const account = { role, login, email: `${login}@example.invalid`, password: 'Fsp UI isolated 482!', consent: true,
    ...(role === 'candidate' ? { name: login.endsWith('fake') ? 'Кандидат неподтверждённых достижений' : 'Кандидат демонстрации ФСП' } : { companyName: 'Компания демонстрации ФСП' }) };
  const requested = await context.request.post(base + '/api/auth/register/request-code', { data: account });
  assert.equal(requested.status(), 202, await requested.text());
  assert.match(codes.get(account.email), /^\d{6}$/u);
  const verified = await context.request.post(base + '/api/auth/register/verify', { data: { email: account.email, code: codes.get(account.email) } });
  assert.equal(verified.status(), 201, await verified.text());
  const token = (await context.cookies(base + '/api/platform/state')).find(item => item.name === 'predel_account_session').value;
  const owner = service.auth.accountForToken(token).platformOwner;
  return { context, account, owner };
}
function seedCandidate(actor) {
  const now = Date.now();
  const survey = { id: `fsp-ui-survey-${actor.account.login}`, date: new Date(now).toISOString(), industry: 'ИТ', professionalRole: 'Frontend разработчик',
    specialization: 'Frontend', desiredGrade: 'Junior', experience: '1 год', stack: ['React', 'TypeScript'], softSkills: [] };
  const attempt = createAttempt(survey, '', [], now);
  service.store.insert(attempt, actor.owner, digest('fsp-ui-private-test-token'));
  const graded = evaluate(attempt, attempt.questions.map(question => ({ questionId: question.id, optionId: question.correctOptionId })), now + 1000);
  service.store.complete(attempt.id, graded.answerDigest, graded.result);
  const state = createInitialState();
  Object.assign(state.profile, survey, { id: 'candidate-anna', name: actor.account.name, email: actor.account.email,
    visible: true, consent: true, bio: 'Разрабатываю формы на React.', surveyCompletedAt: survey.date,
    confirmed: { specialization: graded.result.specialization, grade: graded.result.grade, score: graded.result.score,
      date: graded.result.date, surveyId: survey.id } });
  state.surveys = [survey]; state.history = [graded.result];
  service.platform.save(actor.owner, state, 0, 'candidate');
}
async function snapshot(actor) {
  const response = await actor.context.request.get(base + '/api/platform/state');
  assert.equal(response.status(), 200, await response.text());
  return { ...(await response.json()), identity: response.headers()['x-platform-identity'] };
}
async function filtered(employer) {
  const response = await employer.context.request.get(base + '/api/directory/search?filters=' + encodeURIComponent(JSON.stringify({ fsp: true })));
  assert.equal(response.status(), 200, await response.text()); return response.json();
}

try {
  const candidate = await register('candidate', 'fsp.ui.candidate');
  const employer = await register('employer', 'fsp.ui.employer');
  const fake = await register('candidate', 'fsp.ui.fake');
  seedCandidate(candidate);
  seedCandidate(fake);
  const company = createInitialState(); Object.assign(company.company, { name: employer.account.companyName, contact: employer.account.email });
  service.platform.save(employer.owner, company, 0, 'employer');
  const page = await candidate.context.newPage(); page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(20000);
  let redundantWrites = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/platform/state' && request.method() === 'PUT') redundantWrites++; });
  await page.goto(base + '/?role=candidate&tab=profile');
  await page.locator('.main-content[data-sync-status="saved"]').waitFor();
  const attach = page.getByRole('button', { name: 'Привязать ФСП', exact: true });
  await attach.waitFor();
  assert.equal((await filtered(employer)).total, 0);
  assert.equal(await page.getByLabel('ID участника', { exact: true }).count(), 0);
  await attach.click();
  const dialog = page.getByRole('dialog');
  assert.equal(await dialog.getByRole('button', { name: 'Привязать', exact: true }).isDisabled(), true);
  await dialog.getByLabel('Привязать демонстрационный аккаунт и загрузить вымышленные достижения').check();
  await dialog.getByRole('button', { name: 'Привязать', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.locator('.fsp-evidence-list strong').filter({ hasText: 'Демонстрационное соревнование ФСП' }).waitFor();
  await page.locator('.main-content[data-sync-status="saved"]').waitFor();
  let state = await snapshot(candidate);
  assert.equal(state.state.profile.achievements.length, 1); assert.equal(state.state.profile.fspEvidence.identityVerified, false);
  assert.equal(state.state.profile.fspEvidence.mode, 'demo');
  const search = await employer.context.request.get(base + '/api/directory/search?filters=' + encodeURIComponent(JSON.stringify({ fsp: true })));
  assert.equal(search.status(), 200, await search.text());
  const item = (await search.json()).items.find(result => result.person.name === candidate.account.name);
  assert.ok(item, 'A real registered candidate with an explicit demo binding must be searchable by the achievement filter');
  assert.equal(item.person.fspEvidence.mode, 'demo'); assert.equal(item.person.fspEvidence.identityVerified, false);
  assert.equal(item.person.fspId, '');
  assert.notEqual(item.person.demoProfile, true); assert.notEqual(item.person.synthetic, true);
  await page.reload();
  await page.locator('.fsp-evidence-list strong').filter({ hasText: 'Демонстрационное соревнование ФСП' }).waitFor();
  assert.equal((await snapshot(candidate)).state.profile.fspEvidence.activeCount, 1);
  const employerPage = await employer.context.newPage();
  employerPage.on('pageerror', error => errors.push(error.message));
  await employerPage.goto(base + '/app?role=employer');
  await employerPage.locator('.candidate-list[aria-busy="false"]').waitFor();
  const employerSearch = employerPage.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/directory/search' && JSON.parse(url.searchParams.get('filters') || '{}').fsp === true;
  });
  await employerPage.getByRole('checkbox', { name: 'Есть достижения ФСП', exact: true }).check();
  assert.equal((await employerSearch).status(), 200);
  await employerPage.locator('.candidate-list[aria-busy="false"]').waitFor();
  const row = employerPage.locator('.candidate-row').filter({ hasText: candidate.account.name });
  await row.waitFor();
  assert.equal(await row.getByText('Демо', { exact: true }).count(), 0);
  assert.match(await row.locator('.fsp-tag').textContent(), /ФСП · демо/u);
  assert.equal(await row.getByRole('button', { name: 'Пригласить', exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await page.locator('.main-content[data-sync-status="saved"]').waitFor();
  await page.getByRole('button', { name: 'Отвязать', exact: true }).click();
  await attach.waitFor();
  state = await snapshot(candidate);
  assert.equal(state.state.profile.fspId, ''); assert.deepEqual(state.state.profile.achievements, []);
  assert.equal(service.directory.store.forOwner(candidate.owner).fsp, 0);
  assert.equal(redundantWrites, 0, 'Provider mutations must refresh the shared baseline without a redundant profile PUT');
  assert.equal((await filtered(employer)).total, 0);
  await page.reload(); await attach.waitFor();
  assert.equal(await page.locator('.fsp-evidence-list').count(), 0);
  await attach.click();
  await dialog.getByRole('combobox', { name: /Демоаккаунт/u }).selectOption('empty');
  await dialog.getByLabel('Привязать демонстрационный аккаунт и загрузить вымышленные достижения').check();
  await dialog.getByRole('button', { name: 'Привязать', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.locator('.fsp-link').getByText('Источник не вернул достижений.', { exact: true }).waitFor();
  assert.equal((await snapshot(candidate)).state.profile.fspEvidence.activeCount, 0);
  assert.equal((await filtered(employer)).total, 0);
  await page.getByRole('button', { name: 'Отвязать', exact: true }).click();
  await attach.waitFor();
  await attach.click();
  await dialog.getByRole('combobox', { name: /Демоаккаунт/u }).selectOption('revoked');
  await dialog.getByLabel('Привязать демонстрационный аккаунт и загрузить вымышленные достижения').check();
  await dialog.getByRole('button', { name: 'Привязать', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.locator('.fsp-evidence-list').getByText(/Отозвано/).waitFor();
  state = await snapshot(candidate);
  assert.deepEqual(state.state.profile.achievements, []); assert.equal(state.state.profile.fspEvidence.revokedCount, 1);
  assert.equal(service.directory.store.forOwner(candidate.owner).fsp, 0);
  assert.equal((await filtered(employer)).total, 0);
  await page.reload();
  await page.locator('.fsp-evidence-list').getByText(/Отозвано/).waitFor();
  await page.getByRole('button', { name: 'Отвязать', exact: true }).click();
  await attach.waitFor();

  const forged = await snapshot(fake);
  forged.state.profile.fspId = item.person.id;
  forged.state.profile.achievements = [{ title: 'Поддельный титул ФСП', result: 'Чемпион', year: '2026', verified: true }];
  forged.state.profile.fspEvidence = { provider: 'fsp-demo', mode: 'demo', identityVerified: true, activeCount: 100 };
  const fakeWrite = await fake.context.request.put(base + '/api/platform/state', {
    headers: { 'X-Platform-Identity': forged.identity }, data: { state: forged.state, baseRevision: forged.revision },
  });
  assert.equal(fakeWrite.status(), 200, await fakeWrite.text());
  const ignored = await fakeWrite.json();
  assert.deepEqual(ignored.state.profile.achievements, []);
  assert.equal(ignored.state.profile.fspEvidence ?? null, null);
  assert.equal((await filtered(employer)).total, 0, 'Client-written provider flags and achievements cannot forge the server signal');
  assert.equal((await employer.context.request.get(base + '/api/integrations/fsp-demo')).status(), 403);
  assert.equal((await (await fake.context.request.get(base + '/api/integrations/fsp-demo')).json()).connection, null);

  await attach.click();
  await dialog.getByRole('combobox', { name: /Демоаккаунт/u }).selectOption('achievements');
  await dialog.getByLabel('Привязать демонстрационный аккаунт и загрузить вымышленные достижения').check();
  await dialog.getByRole('button', { name: 'Привязать', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.locator('.fsp-evidence-list strong').waitFor();
  await page.locator('.profile-form textarea[name="bio"]').fill('Разрабатываю доступные формы и интерфейсы на React.');
  const profileWrite = page.waitForResponse(response => new URL(response.url()).pathname === '/api/platform/state'
    && response.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  assert.equal((await profileWrite).status(), 200);
  await page.locator('.main-content[data-sync-status="saved"]').waitFor();
  const normallyEdited = await snapshot(candidate);
  assert.equal(normallyEdited.state.profile.fspEvidence.activeCount, 1);
  assert.equal(normallyEdited.state.profile.fspEvidence.identityVerified, false);
  assert.equal(normallyEdited.state.profile.achievements[0].title, 'Демонстрационное соревнование ФСП');
  assert.equal(normallyEdited.state.profile.bio, 'Разрабатываю доступные формы и интерфейсы на React.');
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const violations = await page.evaluate(async () => (await window.axe.run({ include: [['.fsp-link']] },
    { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })));
  assert.deepEqual(violations, [], 'FSP control accessibility: ' + JSON.stringify(violations));
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: artifacts + '/profile.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.fsp-link').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: artifacts + '/profile-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Отвязать', exact: true }).click();
  await attach.waitFor();
  await page.reload(); await attach.waitFor();
  assert.equal((await filtered(employer)).total, 0);
  assert.deepEqual(errors, []);
  console.log('FSP UI: authenticated demo binding, directory filter, truthful provenance, refresh, persistence, disconnect, empty/revoked evidence, forgery protection and responsive accessible controls passed.');
} finally {
  for (const context of contexts) await context.close();
  await browser.close(); await isolated.close();
}
