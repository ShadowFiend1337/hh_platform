import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssessmentServer } from '../server.mjs';
import { DirectoryService } from '../directory.mjs';
import { directoryCandidates, legacyDirectoryCandidates } from '../directory-seed.mjs';
import { createAttempt, digest, evaluate } from '../assessment.mjs';
import { createInitialState } from '../../frontend/src/model.ts';

const vacancy = () => ({ title: 'Разработка кабинета', description: 'Разрабатывать доступные формы и API кабинета.',
  specialization: 'Frontend', grade: 'Junior', city: 'Закрытый город компании', format: 'Удалённо',
  stack: ['React', 'TypeScript'], salaryFrom: 100000, salaryTo: 150000 });

async function fixture(t, options = {}) {
  const codes = new Map();
  const service = createAssessmentServer({ dbPath: ':memory:', authEnv: {},
    authMailer: async ({ email, code }) => { codes.set(email, code); }, ...options });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { service.server.close(resolve); service.server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${service.server.address().port}`;
  function browser(cookies = new Map()) {
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
    client.cookies = cookies;
    return client;
  }
  async function register(role, login) {
    const client = browser(), email = `${login}@example.test`;
    assert.equal((await client('/api/auth/register/request-code', 'POST', {
      role, login, email, password: 'demo isolation fixture password', consent: true, privacyVersion: PRIVACY_POLICY_VERSION,
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

test('all business endpoints reject a guest before revealing data or accepting any mutation', async t => {
  const f = await fixture(t), guest = f.browser();
  const reads = ['/api/platform/state', '/api/directory/search', '/api/directory/options', '/api/directory/candidate-mikhail/contacts',
    '/api/companies', '/api/companies/demo-company-vector', '/api/vacancies', '/api/vacancies?own=1',
    '/api/vacancies/demo-company-vector-vacancy-1', '/api/applications?role=candidate', '/api/applications?role=employer',
    '/api/assessment/program?specialization=Frontend&grade=Junior', '/api/assessment/attempts/11111111-1111-1111-1111-111111111111'];
  for (const path of reads) {
    const response = await guest(path);
    assert.equal(response.status, 401, path); assert.deepEqual(Object.keys(response.data), ['error']);
    assert(!JSON.stringify(response.data).includes('Михаил'));
  }
  const writes = [
    ['/api/platform/state', 'PUT', { state: f.company(), baseRevision: 0 }], ['/api/platform/state', 'DELETE'],
    ['/api/vacancies', 'POST', vacancy()], ['/api/vacancies/demo-company-vector-vacancy-1', 'PATCH', { status: 'closed' }],
    ['/api/vacancies/demo-company-vector-vacancy-1/applications', 'POST', {}], ['/api/applications/unknown', 'PATCH', { status: 'accepted' }],
    ['/api/assessment/attempts', 'POST', {}], ['/api/assessment/attempts/11111111-1111-1111-1111-111111111111/submit', 'POST', {}],
  ];
  for (const [path, method, body] of writes) assert.equal((await guest(path, method, body)).status, 401, path);
  assert.equal(f.service.directory.store.db.prepare('SELECT COUNT(*) AS n FROM platform_accounts').get().n, 0);
  assert.equal(f.service.directory.store.db.prepare('SELECT COUNT(*) AS n FROM marketplace_applications').get().n, 0);
  assert.equal(f.service.store.countSince(guest.owner(), '1970-01-01T00:00:00.000Z'), 0);
  assert.equal((await guest('/api/health')).status, 200);
  assert.equal((await guest('/api/auth/me')).status, 401);
  assert.equal((await guest('/api/auth/logout', 'POST', {})).status, 200);
});

test('registered employer sees real candidates and registered candidate cannot open the candidate catalogue', async t => {
  const f = await fixture(t), employer = await f.register('employer', 'isolation-employer'), candidate = await f.register('candidate', 'isolation-candidate');
  assert.equal((await candidate('/api/platform/state', 'PUT', { state: f.person(candidate.owner(), 'Зарегистрированный профиль', 'Закрытый город кандидата'), baseRevision: 0 })).status, 200);
  const real = await employer('/api/directory/search?limit=50');
  assert.equal(real.status, 200); assert.equal(real.data.total, directoryCandidates.length + legacyDirectoryCandidates.length + 1);
  const filtered = await employer('/api/directory/search?filters=' + encodeURIComponent(JSON.stringify({ city: 'Закрытый город кандидата' })));
  assert.equal(filtered.data.total, 1); assert.equal(filtered.data.items[0].person.name, 'Зарегистрированный профиль');
  assert(!filtered.data.items[0].person.synthetic); assert(!filtered.data.items[0].person.demoProfile); assert(!filtered.data.items[0].person.email);
  assert((await employer('/api/directory/options')).data.cities.includes('Закрытый город кандидата'));
  assert.equal((await candidate('/api/directory/search')).status, 403);
  assert.equal((await candidate('/api/directory/options')).status, 403);
  assert.equal((await employer('/api/assessment/attempts', 'POST', {})).status, 403);
  assert.equal((await candidate('/api/assessment/program?specialization=Frontend&grade=Junior')).status, 200);
  assert.equal((await employer('/api/assessment/program?specialization=Frontend&grade=Junior')).status, 403);
});

test('legacy anonymous profiles, invitations and decisions stay inaccessible with the old cookie', async t => {
  const f = await fixture(t), candidate = await f.register('candidate', 'legacy-candidate'), employer = await f.register('employer', 'legacy-employer'), guest = f.browser();
  assert.equal((await guest('/api/platform/state')).status, 401);
  await candidate('/api/platform/state', 'PUT', { state: f.person(candidate.owner(), 'Закрытый legacy профиль', 'Казань'), baseRevision: 0 });
  await employer('/api/platform/state', 'PUT', { state: f.company(), baseRevision: 0 });
  const owner = guest.owner(), legacyId = `user-${owner.slice(0, 20)}`, legacy = f.person(owner, 'Старая личная демо-анкета', 'Частный город демо'), date = new Date().toISOString();
  f.service.directory.store.db.prepare('INSERT INTO platform_accounts VALUES(?,?,?,?,?,?)')
    .run(owner, legacyId, 1, JSON.stringify(legacy.profile), JSON.stringify(legacy.company), date);
  f.service.directory.store.upsert({ ...legacy.profile, id: legacyId }, owner, true);
  const personId = f.service.directory.store.forOwner(candidate.owner()).id;
  f.service.directory.store.db.prepare('INSERT INTO platform_invitations VALUES(?,?,?,?,?,?)')
    .run('old-demo-invitation', owner, personId, 'accepted', date, JSON.stringify(f.invitation(personId, 'old-demo-invitation')));
  f.service.directory.store.db.prepare('INSERT INTO platform_candidate_decisions VALUES(?,?,?,?)').run(owner, personId, 'liked', date);
  assert.equal((await guest('/api/platform/state')).status, 401);
  assert.equal((await guest('/api/platform/state', 'DELETE')).status, 401);
  assert.equal((await guest(`/api/directory/${personId}/contacts`)).status, 401);
  assert.deepEqual((await candidate('/api/platform/state')).data.state.invitations, []);
  const found = await employer('/api/directory/search?limit=50');
  assert.equal(found.data.total, directoryCandidates.length + legacyDirectoryCandidates.length + 1); assert(!JSON.stringify(found.data).includes('Старая личная демо-анкета'));
  assert(!JSON.stringify((await employer('/api/directory/options')).data).includes('Частный город демо'));
  assert(f.service.directory.store.forOwner(owner), 'guest cannot delete a legacy profile through the public API');
});

test('registered marketplace and contacts work while guests and other registered roles cannot mutate them', async t => {
  const f = await fixture(t), employer = await f.register('employer', 'market-isolation-employer'), candidate = await f.register('candidate', 'market-isolation-candidate'), guest = f.browser();
  await employer('/api/platform/state', 'PUT', { state: f.company(), baseRevision: 0 });
  await candidate('/api/platform/state', 'PUT', { state: f.person(candidate.owner(), 'Кандидат отклика', 'Казань'), baseRevision: 0 });
  const published = await employer('/api/vacancies', 'POST', vacancy());
  assert.equal(published.status, 201);
  const realVacancy = published.data, realCompanies = await candidate('/api/companies');
  assert.equal(realCompanies.status, 200);
  assert.deepEqual(realCompanies.data.items.filter(item => !item.synthetic).map(item => item.id), [realVacancy.companyId]);
  assert(realCompanies.data.items.filter(item => item.synthetic).every(item => item.id.startsWith('demo-company-')), 'Only built-in demo companies accompany real ones');
  assert.equal(realCompanies.data.items[0].id, realVacancy.companyId, 'Real companies precede demo companies');
  assert.equal((await candidate(`/api/companies/${realVacancy.companyId}`)).status, 200);
  assert.equal((await guest(`/api/companies/${realVacancy.companyId}`)).status, 401);
  assert.equal((await guest(`/api/vacancies/${realVacancy.id}`)).status, 401);
  assert.equal((await guest(`/api/vacancies/${realVacancy.id}/applications`, 'POST', {})).status, 401);
  assert.equal((await candidate('/api/vacancies', 'POST', vacancy())).status, 403);
  assert.equal((await employer(`/api/vacancies/${realVacancy.id}/applications`, 'POST', {})).status, 403);
  const applied = await candidate(`/api/vacancies/${realVacancy.id}/applications`, 'POST', {});
  assert.equal(applied.status, 201);
  const incoming = await employer('/api/applications?role=employer');
  assert.equal(incoming.data.items.length, 1); assert.equal(incoming.data.items[0].candidate.name, 'Кандидат отклика');
  assert.equal((await candidate('/api/applications?role=employer')).status, 403);
  assert.equal((await employer(`/api/applications/${applied.data.id}`, 'PATCH', { status: 'accepted' })).status, 200);
  assert.equal((await employer(`/api/directory/${incoming.data.items[0].candidateId}/contacts`)).status, 200);
  assert.equal((await guest(`/api/directory/${incoming.data.items[0].candidateId}/contacts`)).status, 401);
});

test('old anonymous applications never restore applicant or contact access for a registered employer', async t => {
  const f = await fixture(t), employer = await f.register('employer', 'legacy-market-employer'), guest = f.browser();
  await guest('/api/auth/me');
  await employer('/api/platform/state', 'PUT', { state: f.company(), baseRevision: 0 });
  const owner = guest.owner(), personId = `user-${owner.slice(0, 20)}`, state = f.person(owner, 'Частный старый демо-кандидат', 'Казань');
  f.service.directory.store.db.prepare('INSERT INTO platform_accounts VALUES(?,?,?,?,?,?)')
    .run(owner, personId, 1, JSON.stringify(state.profile), JSON.stringify(state.company), new Date().toISOString());
  f.service.directory.store.upsert({ ...state.profile, id: personId }, owner, true);
  const published = await employer('/api/vacancies', 'POST', vacancy());
  assert.equal(published.status, 201);
  f.service.directory.store.db.prepare('INSERT INTO marketplace_applications VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run('legacy-cross-scope-application', published.data.id, published.data.companyId, owner, personId,
      'sent', new Date().toISOString(), null, 'Учебная старая запись', JSON.stringify(published.data));
  assert.equal((await guest('/api/applications?role=candidate')).status, 401);
  assert.deepEqual((await employer('/api/applications?role=employer')).data.items, []);
  const snapshot = await employer('/api/platform/state');
  assert.deepEqual(snapshot.data.directoryPeople, []); assert.deepEqual(snapshot.data.contactCandidateIds, []);
  assert.equal((await employer(`/api/directory/${personId}/contacts`)).status, 404);
  assert.equal((await employer('/api/applications/legacy-cross-scope-application', 'PATCH', { status: 'accepted' })).status, 404);
});

test('logout, revoked cookies and expired sessions cannot reopen business data; fresh login restores the same account', async t => {
  let time = Date.parse('2026-10-07T09:00:00.000Z');
  const f = await fixture(t, { now: () => time, authSessionDays: 1 }), candidate = await f.register('candidate', 'session-boundary-candidate');
  const state = createInitialState();
  Object.assign(state.profile, { name: 'Частная анкета', email: 'private@example.test', consent: true });
  assert.equal((await candidate('/api/platform/state', 'PUT', { state, baseRevision: 0 })).status, 200);
  const staleCookies = new Map(candidate.cookies), expired = f.browser(staleCookies);
  time += 86400000;
  assert.equal((await expired('/api/platform/state')).status, 401);
  assert.equal((await expired('/api/directory/search')).status, 401);
  assert.equal((await expired('/api/platform/state', 'DELETE')).status, 401);
  assert.equal((await candidate('/api/auth/login', 'POST', { loginOrEmail: 'session-boundary-candidate@example.test', password: 'demo isolation fixture password' })).status, 200);
  assert.equal((await candidate('/api/platform/state')).data.state.profile.name, 'Частная анкета');
  const revoked = f.browser(new Map(candidate.cookies));
  assert.equal((await candidate('/api/auth/logout', 'POST', {})).status, 200);
  assert.equal((await candidate('/api/platform/state')).status, 401);
  assert.equal((await revoked('/api/platform/state')).status, 401);
  assert.equal((await revoked('/api/assessment/program?specialization=Frontend&grade=Junior')).status, 401);
});

test('configured service methods fail closed without a registered owner and semantic freshness never leaks a withdrawn account', async t => {
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
  await assert.rejects(directory.search('создать доступную форму', {}, { owner: 'demo-guest' }), error => error.status === 401);
  assert.throws(() => directory.options('demo-guest'), error => error.status === 401);
  const real = await directory.search('создать доступную форму', {}, { owner: 'real-employer' });
  assert.deepEqual(real.items.map(item => item.person.id), ['real-person']);
  encoder.rerank = async (_query, texts) => { accounts.delete('real-candidate'); return texts.map(() => 0.9); };
  assert.deepEqual((await directory.search('создать доступную форму', {}, { owner: 'real-employer' })).items, []);
  const f = await fixture(t), guest = f.browser(); await guest('/api/auth/me');
  assert.throws(() => f.service.platform.read(guest.owner()), error => error.status === 401);
  assert.throws(() => f.service.platform.save(guest.owner(), f.company(), 0), error => error.status === 401);
  assert.throws(() => f.service.platform.delete(guest.owner()), error => error.status === 401);
  assert.throws(() => f.service.marketplace.companies({ owner: guest.owner() }), error => error.status === 401);
  assert.throws(() => f.service.marketplace.vacancies(guest.owner()), error => error.status === 401);
});
