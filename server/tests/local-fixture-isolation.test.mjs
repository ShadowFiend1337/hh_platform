import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareLocalAccounts, localAccountPassword, localAccountFixtures } from '../../scripts/local-accounts.mjs';
import { createAssessmentServer } from '../server.mjs';
import { accountsShareRealm, isLocalFixtureAccount } from '../local-fixtures.mjs';
import { createAttempt, digest, evaluate } from '../assessment.mjs';
import { createInitialState } from '../../frontend/src/model.ts';

test('fixture identity requires the exact immutable account tuple, not editable fields or claimed flags', () => {
  for (const account of localAccountFixtures) assert.equal(isLocalFixtureAccount(account), true);
  for (const account of localAccountFixtures) assert.equal(isLocalFixtureAccount({ ...account, login: account.login.toUpperCase() }), true);
  const fixture = localAccountFixtures[0];
  for (const account of [null, {}, { ...fixture, role: 'employer' }, { ...fixture, login: 'another_candidate' },
    { ...fixture, email: 'actual-person@example.org' }, { testAccount: true, synthetic: true }]) {
    assert.equal(isLocalFixtureAccount(account), false);
  }
  assert.equal(accountsShareRealm(localAccountFixtures[0], localAccountFixtures[1]), true);
  assert.equal(accountsShareRealm(localAccountFixtures[0], { role: 'employer' }), false);
  assert.equal(accountsShareRealm({ role: 'candidate' }, { role: 'employer' }), true);
  assert.equal(accountsShareRealm(null, null), false);
});

async function setup(t) {
  const folder = await mkdtemp(join(tmpdir(), 'predel-local-isolation-')), dbPath = join(folder, 'fixture.sqlite');
  // Explicit CLI preparation uses its internal mailbox; never the user's DB.
  await prepareLocalAccounts(dbPath);
  const codes = new Map();
  const service = createAssessmentServer({ dbPath, authEnv: {},
    authMailer: async ({ email, code }) => { codes.set(email, code); } });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => { service.server.close(resolve); service.server.closeAllConnections(); });
    await rm(folder, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${service.server.address().port}`;
  function browser() {
    const cookies = new Map(); let identity;
    const client = async (path, method = 'GET', input) => {
      const response = await fetch(base + path, { method, headers: {
        Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        ...(input === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(identity ? { 'X-Platform-Identity': identity } : {}),
      }, body: input === undefined ? undefined : JSON.stringify(input) });
      for (const value of response.headers.getSetCookie()) {
        const [key, token] = value.split(';')[0].split('=');
        if (token) cookies.set(key, token); else cookies.delete(key);
      }
      identity = response.headers.get('X-Platform-Identity') || identity;
      return { status: response.status, data: await response.json() };
    };
    client.owner = () => service.auth.accountForToken(cookies.get('predel_account_session'))?.platformOwner;
    return client;
  }
  async function register(role) {
    const client = browser(), login = 'regular_' + role, email = login + '@example.invalid';
    assert.equal((await client('/api/auth/register/request-code', 'POST', { role, login, email,
      password: 'IsolatedLocalAccounts927!', consent: true,
      ...(role === 'candidate' ? { name: 'Зарегистрированный проверочный кандидат' }
        : { companyName: 'Зарегистрированная проверочная компания' }) })).status, 202);
    const response = await client('/api/auth/register/verify', 'POST', { email, code: codes.get(email) });
    assert.equal(response.status, 201); assert.equal(response.data.account.testAccount, undefined);
    await client('/api/platform/state');
    return client;
  }
  async function local(role) {
    const client = browser(), response = await client('/api/auth/login', 'POST', {
      loginOrEmail: 'local_' + role, password: localAccountPassword,
    });
    assert.equal(response.status, 200); assert.equal(response.data.account.testAccount, true);
    await client('/api/platform/state');
    return client;
  }
  return { service, register, local };
}

function ordinaryProfile(service, owner) {
  const state = createInitialState(), date = new Date().toISOString();
  const survey = { id: 'regular-profile-survey', date, industry: 'ИТ', professionalRole: 'Frontend разработчик',
    specialization: 'Frontend', desiredGrade: 'Junior', experience: '1 год', stack: ['React'], softSkills: [] };
  // Server-owned fixture completion, not a claim of professional qualification.
  const attempt = createAttempt(survey);
  service.store.insert(attempt, owner, digest('isolated-regular-test-result'));
  const graded = evaluate(attempt, attempt.questions.map(question => ({ questionId: question.id, optionId: question.correctOptionId })));
  service.store.complete(attempt.id, graded.answerDigest, graded.result);
  Object.assign(state.profile, survey, { name: 'Проверочный обычный кандидат', email: 'person@example.invalid',
    city: 'Обычный город', bio: 'Разрабатываю формы.', consent: true, visible: true, synthetic: true,
    surveyCompletedAt: date, confirmed: { specialization: graded.result.specialization, grade: graded.result.grade,
      score: graded.result.score, date: graded.result.date, surveyId: survey.id } });
  state.surveys = [survey]; state.history = [graded.result];
  return state;
}

const vacancy = { title: 'Проверочная вакансия', description: 'Разработка форм.', specialization: 'Frontend', grade: 'Junior',
  city: 'Обычный город', format: 'Удалённо', stack: ['React'], salaryFrom: 100000, salaryTo: 150000 };
function invitation(id, candidateId) {
  return { id, candidateId, companyId: 'company-line', company: 'Проверочная компания', title: 'Проверочное предложение',
    description: 'Изолированные условия.', contact: 'company@example.invalid', salaryFrom: 100000, salaryTo: 150000,
    status: 'accepted', date: new Date().toISOString() };
}

test('registered local accounts stay in an explicitly marked realm despite old rows and forged legacy cross-realm links', async t => {
  const f = await setup(t), localCandidate = await f.local('candidate'), localEmployer = await f.local('employer');
  const realCandidate = await f.register('candidate'), realEmployer = await f.register('employer');
  const localPerson = f.service.directory.store.forOwner(localCandidate.owner());
  assert.equal(localPerson.synthetic, 0, 'The CLI produces the historical row this fix must recognise');
  const localCompanies = await localCandidate('/api/companies');
  assert.equal(localCompanies.data.total, 1); assert.equal(localCompanies.data.items[0].synthetic, true);
  const localVacancy = localCompanies.data.items[0].vacancies[0]; assert.equal(localVacancy.synthetic, true);
  const localFound = await localEmployer('/api/directory/search?limit=50');
  assert.deepEqual(localFound.data.items.map(item => item.person.id), [localPerson.id]);
  assert.equal(localFound.data.items[0].person.synthetic, true);
  assert.equal((await localCandidate('/api/platform/state')).data.state.profile.synthetic, true);
  assert.equal(f.service.auth.accountForPlatformOwner(localCandidate.owner()).testAccount, true);
  assert.deepEqual((await realEmployer('/api/directory/search?limit=50')).data.items, []);
  assert.deepEqual((await realEmployer('/api/directory/options')).data.cities, []);
  assert.deepEqual((await realCandidate('/api/companies')).data.items, []);
  assert.deepEqual((await realCandidate('/api/vacancies')).data.items, []);
  for (const path of ['/api/companies/' + localVacancy.companyId, '/api/vacancies/' + localVacancy.id]) {
    assert.equal((await realCandidate(path)).status, 404);
  }
  let saved = await realCandidate('/api/platform/state', 'PUT', { state: ordinaryProfile(f.service, realCandidate.owner()), baseRevision: 0 });
  assert.equal(saved.status, 200); assert.equal(saved.data.state.profile.synthetic, false, 'Client synthetic cannot confer fixture authority');
  const realPerson = f.service.directory.store.forOwner(realCandidate.owner());
  const companyState = createInitialState(); Object.assign(companyState.company, { name: 'Обычная компания', contact: 'company@example.invalid' });
  assert.equal((await realEmployer('/api/platform/state', 'PUT', { state: companyState, baseRevision: 0 })).status, 200);
  const realPublished = await realEmployer('/api/vacancies', 'POST', vacancy);
  assert.equal(realPublished.status, 201); assert.equal(realPublished.data.synthetic, false);
  assert.deepEqual((await realEmployer('/api/directory/search?limit=50')).data.items.map(item => item.person.id), [realPerson.id]);
  assert.deepEqual((await localEmployer('/api/directory/search?limit=50')).data.items.map(item => item.person.id), [localPerson.id]);
  assert.equal((await realCandidate('/api/vacancies/' + localVacancy.id + '/applications', 'POST', {})).status, 404);
  assert.equal((await localCandidate('/api/vacancies/' + realPublished.data.id + '/applications', 'POST', {})).status, 404);

  // A pre-existing accepted invitation/application must not bridge the realms.
  const db = f.service.directory.store.db, date = new Date().toISOString();
  for (const [sender, recipient, id] of [[realEmployer.owner(), localPerson.id, 'real-to-test'],
    [localEmployer.owner(), realPerson.id, 'test-to-real']]) {
    db.prepare('INSERT INTO platform_invitations VALUES(?,?,?,?,?,?)')
      .run(id, sender, recipient, 'accepted', date, JSON.stringify(invitation(id, recipient)));
    db.prepare('INSERT INTO platform_candidate_decisions VALUES(?,?,?,?)').run(sender, recipient, 'liked', date);
  }
  for (const [person, owner, listing, id] of [[localPerson, localCandidate.owner(), realPublished.data, 'test-to-real-application'],
    [realPerson, realCandidate.owner(), localVacancy, 'real-to-test-application']]) {
    db.prepare('INSERT INTO marketplace_applications VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(id, listing.id, listing.companyId, owner, person.id, 'sent', date, null, '', JSON.stringify(listing));
  }
  for (const [client, id, applicationId] of [[realEmployer, localPerson.id, 'test-to-real-application'],
    [localEmployer, realPerson.id, 'real-to-test-application']]) {
    const snapshot = await client('/api/platform/state');
    assert(!snapshot.data.state.invitations.some(item => item.candidateId === id));
    assert(!snapshot.data.state.candidateDecisions.some(item => item.candidateId === id));
    assert(!snapshot.data.directoryPeople.some(person => person.id === id)); assert(!snapshot.data.contactCandidateIds.includes(id));
    assert.equal((await client('/api/directory/' + id + '/contacts')).status, 404);
    assert.deepEqual((await client('/api/applications?role=employer')).data.items, []);
    assert.equal((await client('/api/applications/' + applicationId, 'PATCH', { status: 'accepted' })).status, 404);
  }
  assert.deepEqual((await realCandidate('/api/platform/state')).data.state.invitations, []);
  assert.equal((await localCandidate('/api/platform/state')).data.state.invitations.length, 1, 'Only the original same-realm invitation remains');
  assert.deepEqual((await realCandidate('/api/applications?role=candidate')).data.items, []);

  // A fixture can still use its own legitimate invitation and application.
  let snapshot = await localCandidate('/api/platform/state');
  snapshot.data.state.invitations[0].status = 'accepted'; snapshot.data.state.profile.synthetic = false;
  snapshot.data.state.profile.name = 'Изменённое имя'; snapshot.data.state.profile.email = 'changed@example.invalid';
  saved = await localCandidate('/api/platform/state', 'PUT', { state: snapshot.data.state, baseRevision: snapshot.data.revision });
  assert.equal(saved.status, 200); assert.equal(saved.data.state.profile.synthetic, true);
  assert.equal(f.service.directory.store.forOwner(localCandidate.owner()).synthetic, 1);
  assert.equal((await localEmployer('/api/directory/' + localPerson.id + '/contacts')).data.email, 'changed@example.invalid');
  assert.equal((await realEmployer('/api/directory/' + localPerson.id + '/contacts')).status, 404);
  const applied = await localCandidate('/api/vacancies/' + localVacancy.id + '/applications', 'POST', {});
  assert.equal(applied.status, 201); assert.equal(applied.data.synthetic, true); assert.equal(applied.data.vacancy.synthetic, true);
  assert.equal(applied.data.candidate.synthetic, true);
  const incoming = await localEmployer('/api/applications?role=employer');
  assert.deepEqual(incoming.data.items.map(item => item.id), [applied.data.id]);
  assert.equal(incoming.data.items[0].candidate.synthetic, true);
  assert.equal((await localEmployer('/api/applications/' + applied.data.id, 'PATCH', { status: 'accepted' })).status, 200);
  assert.equal((await localEmployer('/api/companies/' + realPublished.data.companyId)).status, 404);
  assert.equal((await localEmployer('/api/vacancies/demo-company-vector-vacancy-1')).status, 404);
});
