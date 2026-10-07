import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssessmentServer } from '../server.mjs';
import { DirectoryService } from '../directory.mjs';
import { createAttempt, digest, evaluate } from '../assessment.mjs';
import { createInitialState } from '../../frontend/src/model.ts';

const vacancy = () => ({ title: 'Разработка кабинета', description: 'Разрабатывать доступные формы и API кабинета.',
  specialization: 'Frontend', grade: 'Junior', city: 'Закрытый город компании', format: 'Удалённо',
  stack: ['React', 'TypeScript'], salaryFrom: 100000, salaryTo: 150000 });

async function fixture(t) {
  const codes = new Map();
  const service = createAssessmentServer({ dbPath: ':memory:', authEnv: {},
    authMailer: async ({ email, code }) => { codes.set(email, code); } });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { service.server.close(resolve); service.server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${service.server.address().port}`;
  function browser() {
    const cookies = new Map();
    let identity;
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
    client.owner = () => service.auth.accountForToken(cookies.get('predel_account_session'))?.platformOwner
      || digest(cookies.get('predel_session'));
    return client;
  }
  async function register(role, login) {
    const client = browser(), email = `${login}@example.test`;
    assert.equal((await client('/api/auth/register/request-code', 'POST', {
      role, login, email, password: 'demo isolation fixture password', consent: true,
      ...(role === 'candidate' ? { name: 'Вымышленный зарегистрированный кандидат' } : { companyName: 'Вымышленная зарегистрированная компания' }),
    })).status, 202);
    assert.equal((await client('/api/auth/register/verify', 'POST', { email, code: codes.get(email) })).status, 201);
    await client('/api/platform/state');
    return client;
  }
  function person(owner, name, city) {
    const state = createInitialState(), date = new Date().toISOString();
    const survey = { id: `survey-${owner.slice(0, 20)}`, date, industry: 'ИТ', professionalRole: 'Frontend разработчик',
      specialization: 'Frontend', desiredGrade: 'Junior', experience: '1 год', stack: ['React', 'TypeScript'], softSkills: [] };
    const attempt = createAttempt(survey, '', [], Date.now());
    service.store.insert(attempt, owner, digest('fixture-attempt-token'));
    const graded = evaluate(attempt, attempt.questions.map(question => ({ questionId: question.id, optionId: question.correctOptionId })), Date.now());
    service.store.complete(attempt.id, graded.answerDigest, graded.result);
    Object.assign(state.profile, survey, { id: 'candidate-anna', name, city, email: `${owner.slice(0, 10)}@example.test`,
      phone: '+7 000 000-00-00', consent: true, visible: true, bio: 'Разрабатываю доступные формы кабинета.',
      surveyCompletedAt: date, confirmed: { specialization: graded.result.specialization, grade: graded.result.grade,
        score: graded.result.score, date: graded.result.date, surveyId: survey.id } });
    state.surveys = [survey]; state.history = [graded.result];
    return state;
  }
  function company() {
    const state = createInitialState();
    Object.assign(state.company, { name: 'Вымышленная зарегистрированная компания', contact: 'company@example.test' });
    return state;
  }
  function invitation(candidateId, id = 'isolation-invitation') {
    return { id, candidateId, companyId: 'company-line', company: 'Вымышленная компания', title: 'Разработка форм',
      description: 'Создание доступного кабинета.', contact: 'company@example.test', salaryFrom: 100000, salaryTo: 150000,
      status: 'sent', date: new Date().toISOString() };
  }
  return { service, browser, register, person, company, invitation };
}

test('demo catalogue and option values stay separate from registered and anonymous personal profiles', async t => {
  const f = await fixture(t), employer = await f.register('employer', 'isolation-employer'), candidate = await f.register('candidate', 'isolation-candidate');
  const guest = f.browser(), otherGuest = f.browser();
  await guest('/api/platform/state'); await otherGuest('/api/platform/state');
  assert.equal((await candidate('/api/platform/state', 'PUT', { state: f.person(candidate.owner(), 'Зарегистрированный профиль', 'Закрытый город кандидата'), baseRevision: 0 })).status, 200);
  assert.equal((await otherGuest('/api/platform/state', 'PUT', { state: f.person(otherGuest.owner(), 'Личная демо-анкета', 'Личный город демо'), baseRevision: 0 })).status, 200);
  const demo = await guest('/api/directory/search?limit=50'), real = await employer('/api/directory/search?limit=50');
  assert.equal(demo.status, 200); assert(demo.data.total > 0);
  assert(demo.data.items.every(item => item.person.synthetic === true));
  assert(!JSON.stringify(demo.data).includes('Зарегистрированный профиль'));
  assert(!JSON.stringify(demo.data).includes('Личная демо-анкета'));
  assert.equal(real.data.total, 1); assert.equal(real.data.items[0].person.name, 'Зарегистрированный профиль');
  assert(!real.data.items[0].person.synthetic);
  const demoOptions = await guest('/api/directory/options'), realOptions = await employer('/api/directory/options');
  assert(!demoOptions.data.cities.includes('Закрытый город кандидата'));
  assert(!demoOptions.data.cities.includes('Личный город демо'));
  assert.deepEqual(realOptions.data.cities, ['Закрытый город кандидата']);
  assert.equal((await candidate('/api/directory/search')).status, 403);
  assert.equal((await candidate('/api/directory/options')).status, 403);
  assert.equal((await candidate('/api/auth/logout', 'POST', {})).status, 200);
  const loggedOut = await candidate('/api/directory/search');
  assert(loggedOut.data.items.every(item => item.person.synthetic === true));
});

test('demo retains its own questionnaire, decisions and synthetic invitation while rejecting real recipients', async t => {
  const f = await fixture(t), candidate = await f.register('candidate', 'isolation-recipient'), guest = f.browser();
  await guest('/api/platform/state');
  const real = await candidate('/api/platform/state', 'PUT', { state: f.person(candidate.owner(), 'Закрытый получатель', 'Казань'), baseRevision: 0 });
  assert.equal(real.status, 200);
  const personId = f.service.directory.store.forOwner(candidate.owner()).id;
  const state = f.company();
  state.invitations = [f.invitation(personId)];
  assert.equal((await guest('/api/platform/state', 'PUT', { state, baseRevision: 0 })).status, 404);
  assert.deepEqual((await candidate('/api/platform/state')).data.state.invitations, []);
  assert.equal((await guest(`/api/directory/${personId}/contacts`)).status, 404);
  const own = f.person(guest.owner(), 'Собственная демо-анкета', 'Казань');
  own.candidateDecisions = [{ candidateId: 'candidate-mikhail', decision: 'liked', date: new Date().toISOString() }];
  own.invitations = [f.invitation('candidate-mikhail', 'demo-synthetic-invitation')];
  const saved = await guest('/api/platform/state', 'PUT', { state: own, baseRevision: 0 });
  assert.equal(saved.status, 200); assert.equal(saved.data.state.candidateDecisions.length, 1);
  assert.equal(saved.data.state.invitations.length, 1);
  assert.equal(saved.data.directoryPeople.find(person => person.id === 'candidate-mikhail')?.synthetic, true);
  assert.equal((await guest('/api/directory/candidate-anna/contacts')).status, 200);
  saved.data.state.candidateDecisions.push({ candidateId: personId, decision: 'liked', date: new Date().toISOString() });
  assert.equal((await guest('/api/platform/state', 'PUT', { state: saved.data.state, baseRevision: saved.data.revision })).status, 404);
  assert.equal((await guest('/api/platform/state', 'DELETE')).status, 200);
});

test('legacy demo-to-real invitation and decision cannot leak through snapshots or accepted contacts', async t => {
  const f = await fixture(t), candidate = await f.register('candidate', 'legacy-candidate'), guest = f.browser();
  await guest('/api/platform/state');
  await candidate('/api/platform/state', 'PUT', { state: f.person(candidate.owner(), 'Закрытый legacy профиль', 'Казань'), baseRevision: 0 });
  const saved = await guest('/api/platform/state', 'PUT', { state: f.company(), baseRevision: 0 });
  const personId = f.service.directory.store.forOwner(candidate.owner()).id, date = new Date().toISOString();
  // Reproduce old stored relations without weakening production HTTP guards.
  f.service.directory.store.db.prepare('INSERT INTO platform_invitations VALUES(?,?,?,?,?,?)')
    .run('old-demo-invitation', guest.owner(), personId, 'accepted', date, JSON.stringify(f.invitation(personId, 'old-demo-invitation')));
  f.service.directory.store.db.prepare('INSERT INTO platform_candidate_decisions VALUES(?,?,?,?)').run(guest.owner(), personId, 'liked', date);
  const read = await guest('/api/platform/state');
  assert.equal(saved.status, 200); assert.deepEqual(read.data.state.invitations, []);
  assert.deepEqual(read.data.state.candidateDecisions, []); assert.deepEqual(read.data.directoryPeople, []);
  assert.deepEqual(read.data.contactCandidateIds, []);
  assert.deepEqual((await candidate('/api/platform/state')).data.state.invitations, []);
  assert.equal((await guest(`/api/directory/${personId}/contacts`)).status, 404);
});

test('demo companies and applications are synthetic; registered vacancies require verified employer', async t => {
  const f = await fixture(t), employer = await f.register('employer', 'market-isolation-employer'), candidate = await f.register('candidate', 'market-isolation-candidate'), guest = f.browser();
  await guest('/api/platform/state');
  await employer('/api/platform/state', 'PUT', { state: f.company(), baseRevision: 0 });
  await candidate('/api/platform/state', 'PUT', { state: f.person(candidate.owner(), 'Кандидат отклика', 'Казань'), baseRevision: 0 });
  await guest('/api/platform/state', 'PUT', { state: f.person(guest.owner(), 'Демо кандидат отклика', 'Казань'), baseRevision: 0 });
  const published = await employer('/api/vacancies', 'POST', vacancy());
  assert.equal(published.status, 201);
  const realVacancy = published.data, demoCompanies = await guest('/api/companies'), realCompanies = await candidate('/api/companies');
  assert(demoCompanies.data.items.length > 0); assert(demoCompanies.data.items.every(company => company.synthetic));
  assert.equal(realCompanies.data.total, 1); assert.equal(realCompanies.data.items[0].id, realVacancy.companyId);
  assert.equal((await guest(`/api/companies/${realVacancy.companyId}`)).status, 404);
  assert.equal((await guest(`/api/vacancies/${realVacancy.id}`)).status, 404);
  assert((await guest('/api/vacancies')).data.items.every(item => item.synthetic));
  assert.equal((await guest('/api/vacancies', 'POST', vacancy())).status, 401);
  assert.equal((await guest(`/api/vacancies/${realVacancy.id}`, 'PATCH', { status: 'closed' })).status, 401);
  assert.equal((await guest(`/api/vacancies/${realVacancy.id}/applications`, 'POST', {})).status, 404);
  assert.equal((await candidate('/api/vacancies', 'POST', vacancy())).status, 403);
  const demoVacancy = demoCompanies.data.items[0].vacancies[0];
  const appliedDemo = await guest(`/api/vacancies/${demoVacancy.id}/applications`, 'POST', { message: 'Учебный отклик' });
  assert.equal(appliedDemo.status, 201); assert.equal(appliedDemo.data.synthetic, true);
  assert.equal((await guest('/api/applications?role=candidate')).data.items.length, 1);
  assert.equal((await candidate(`/api/vacancies/${demoVacancy.id}/applications`, 'POST', {})).status, 404);
  const appliedReal = await candidate(`/api/vacancies/${realVacancy.id}/applications`, 'POST', {});
  assert.equal(appliedReal.status, 201);
  const incoming = await employer('/api/applications?role=employer');
  assert.equal(incoming.data.items.length, 1); assert.equal(incoming.data.items[0].candidate.name, 'Кандидат отклика');
  assert.equal((await guest(`/api/applications/${appliedReal.data.id}`, 'PATCH', { status: 'accepted' })).status, 401);
  assert.equal((await employer(`/api/applications/${appliedReal.data.id}`, 'PATCH', { status: 'accepted' })).status, 200);
  const personId = incoming.data.items[0].candidateId;
  assert.equal((await employer(`/api/directory/${personId}/contacts`)).status, 200);
  assert.equal((await guest(`/api/directory/${personId}/contacts`)).status, 404);
});

test('old anonymous applications to a real company cannot restore applicant or contact access', async t => {
  const f = await fixture(t), employer = await f.register('employer', 'legacy-market-employer'), guest = f.browser();
  await guest('/api/platform/state');
  await employer('/api/platform/state', 'PUT', { state: f.company(), baseRevision: 0 });
  await guest('/api/platform/state', 'PUT', { state: f.person(guest.owner(), 'Частный старый демо-кандидат', 'Казань'), baseRevision: 0 });
  const published = await employer('/api/vacancies', 'POST', vacancy()), personId = f.service.directory.store.forOwner(guest.owner()).id;
  assert.equal(published.status, 201);
  f.service.directory.store.db.prepare('INSERT INTO marketplace_applications VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run('legacy-cross-scope-application', published.data.id, published.data.companyId, guest.owner(), personId,
      'sent', new Date().toISOString(), null, 'Учебная старая запись', JSON.stringify(published.data));
  assert.deepEqual((await guest('/api/applications?role=candidate')).data.items, []);
  assert.deepEqual((await employer('/api/applications?role=employer')).data.items, []);
  const snapshot = await employer('/api/platform/state');
  assert.deepEqual(snapshot.data.directoryPeople, []); assert.deepEqual(snapshot.data.contactCandidateIds, []);
  assert.equal((await employer(`/api/directory/${personId}/contacts`)).status, 404);
  assert.equal((await employer('/api/applications/legacy-cross-scope-application', 'PATCH', { status: 'accepted' })).status, 404);
  assert.equal((await guest(`/api/applications/legacy-cross-scope-application`, 'PATCH', { status: 'accepted' })).status, 401);
});

test('semantic admission and its final freshness check preserve demo and registered account boundaries', async t => {
  const accounts = new Map([['real-employer', { role: 'employer' }], ['real-candidate', { role: 'candidate' }]]);
  function profile(id, name, synthetic = false) {
    return { ...createInitialState().profile, id, name, professionalRole: 'Frontend разработчик',
      specialization: 'Frontend', stack: ['React'], bio: 'Разрабатывать доступные формы кабинета.',
      confirmed: { specialization: 'Frontend', grade: 'Junior', score: 90, date: new Date().toISOString() },
      synthetic, visible: true, consent: true };
  }
  const encoder = { info: { version: 'isolation-fixture', dimension: 2, threshold: 0.5,
    reranker: { threshold: 0.5 } }, start: async () => {}, close() {},
    encode: async texts => texts.map(() => [1, 0]), rerank: async (_query, texts) => texts.map(() => 0.9) };
  const directory = new DirectoryService(':memory:', { seeds: [profile('demo-person', 'Учебный профиль', true)], encoder,
    accountForOwner: owner => accounts.get(owner) || null });
  t.after(() => directory.close());
  directory.store.upsert(profile('real-person', 'Зарегистрированный профиль'), 'real-candidate', true);
  directory.store.upsert(profile('guest-person', 'Частная демо-анкета'), 'other-guest', true);
  const demo = await directory.search('создать доступную форму', {}, { owner: 'demo-guest' });
  assert.deepEqual(demo.items.map(item => item.person.id), ['demo-person']);
  const real = await directory.search('создать доступную форму', {}, { owner: 'real-employer' });
  assert.deepEqual(real.items.map(item => item.person.id), ['real-person']);
  encoder.rerank = async (_query, texts) => { accounts.delete('real-candidate'); return texts.map(() => 0.9); };
  const withdrawn = await directory.search('создать доступную форму', {}, { owner: 'real-employer' });
  assert.deepEqual(withdrawn.items, []);
});
