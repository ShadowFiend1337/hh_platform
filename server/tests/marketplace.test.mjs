import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInitialState } from '../../frontend/src/model.ts';
import { specializationOptions, isSpecialization } from '../../shared/catalog.ts';
import { isGrade } from '../../shared/grading.ts';
import { DirectoryStore } from '../directory-store.mjs';
import { PlatformService } from '../platform.mjs';
import { MarketplaceService } from '../marketplace.mjs';
import { openStore } from '../store.mjs';
import { createAssessmentServer } from '../server.mjs';

const employer = '11111111111111111111111111111111';
const candidate = '22222222222222222222222222222222';
const outsider = '33333333333333333333333333333333';
const candidateId = `user-${candidate.slice(0, 20)}`;
const time = Date.parse('2026-10-07T09:00:00.000Z');
const valid = () => ({ title: 'Разработчик форм', description: 'Создавать доступные формы кабинета.', specialization: 'Frontend',
  grade: 'Junior', stack: ['React', 'TypeScript'], city: 'Казань', format: 'Удалённо', salaryFrom: 100000, salaryTo: 150000 });
const status = code => error => error.status === code;
function state(person = false) {
  const result = createInitialState();
  result.company.name = 'Вымышленная компания'; result.company.contact = 'company@example.com';
  if (person) Object.assign(result.profile, { name: 'Вымышленный кандидат', email: 'private@example.com', phone: '+7 000 000-00-00',
    bio: 'Разрабатываю доступные интерфейсы.', consent: true, visible: false });
  return result;
}
function fixture(t, { seeds = false } = {}) {
  const store = new DirectoryStore(':memory:');
  const assessments = openStore(':memory:');
  let clock = time;
  const platform = new PlatformService(store, assessments, { now: () => clock });
  const marketplace = new MarketplaceService(store, { now: () => clock, seeds });
  t.after(() => { assessments.close(); store.close(); });
  return { store, assessments, platform, marketplace, setTime: value => { clock = value; } };
}

test('fresh owners can read empty private lists without creating a profile or gaining mutation access', t => {
  const { store, platform, marketplace } = fixture(t);
  platform.save(employer, state(), 0);
  const vacancy = marketplace.publish(employer, valid());
  assert.deepEqual(marketplace.vacancies(outsider, { own: true }).items, []);
  assert.deepEqual(marketplace.applications(outsider, 'employer').items, []);
  assert.deepEqual(marketplace.applications(outsider, 'candidate').items, []);
  assert.equal(store.forOwner(outsider), undefined);
  assert.throws(() => marketplace.publish(outsider, valid()), status(409));
  assert.throws(() => marketplace.apply(outsider, vacancy.id, {}), status(409));
  assert.throws(() => marketplace.applications(null, 'candidate'), status(401));
  assert.throws(() => marketplace.vacancies(null, { own: true }), status(401));
  assert.throws(() => marketplace.applications(outsider, 'invalid'), status(400));
});

test('seed companies keep internal provenance, cover every catalog role and show concise descriptions', t => {
  const { store, marketplace } = fixture(t, { seeds: true });
  const companies = marketplace.companies({ limit: 100 }).items;
  assert(companies.length >= 15, 'The demo world offers many companies');
  const vacancies = companies.flatMap(company => company.vacancies);
  assert(companies.every(company => company.synthetic && company.description && !/Вымышлен|демонстрац/iu.test(company.description)));
  assert(vacancies.every(vacancy => vacancy.synthetic && vacancy.currency === 'RUB' && vacancy.status === 'open'
    && vacancy.salaryFrom > 0 && vacancy.salaryFrom <= vacancy.salaryTo && isSpecialization(vacancy.specialization) && isGrade(vacancy.grade)));
  assert.deepEqual([...new Set(vacancies.map(vacancy => vacancy.specialization))].sort(), specializationOptions.map(item => item.value).sort());
  new MarketplaceService(store, { seeds: true });
  assert.equal(marketplace.vacancies(null).items.length, vacancies.length, 'Restart does not duplicate seed vacancies');
  assert.throws(() => marketplace.edit(outsider, vacancies[0].id, { status: 'closed' }), status(409));
});

test('publishing, editing and closing operate only on the owning company and public catalog shows open jobs', t => {
  const { platform, marketplace } = fixture(t);
  assert.throws(() => marketplace.publish(employer, valid()), status(409));
  platform.save(employer, state(), 0); platform.save(outsider, state(), 0);
  const published = marketplace.publish(employer, valid());
  assert.equal(published.companyId, `company-${employer.slice(0, 20)}`);
  assert.equal(published.company, 'Вымышленная компания'); assert.equal(published.synthetic, false);
  assert.equal(marketplace.companies().items[0].vacancies[0].id, published.id);
  assert.equal(marketplace.vacancies(employer, { own: true }).items.length, 1);
  assert.deepEqual(marketplace.vacancies(outsider, { own: true }).items, []);
  assert.throws(() => marketplace.edit(outsider, published.id, valid()), status(404));
  const edited = marketplace.edit(employer, published.id, { ...valid(), title: 'Новая роль', stack: ['Vue'], salaryFrom: 120000, salaryTo: 180000 });
  assert.deepEqual(edited.stack, ['Vue']); assert.equal(edited.title, 'Новая роль');
  const closed = marketplace.edit(employer, published.id, { status: 'closed' });
  assert.equal(closed.status, 'closed'); assert.deepEqual(marketplace.companies().items, []);
  assert.equal(marketplace.vacancies(employer, { own: true }).items[0].status, 'closed');
  assert.throws(() => marketplace.vacancy(outsider, published.id), status(404));
  assert.throws(() => marketplace.edit(employer, published.id, valid()), status(409));
  assert.throws(() => marketplace.edit(employer, published.id, { status: 'open' }), status(400));
});

test('company pagination reaches the complete catalog and queries match Russian text and vacancy skills', t => {
  const { platform, marketplace } = fixture(t);
  for (let index = 0; index < 17; index++) {
    const owner = `paged-owner-${String(index).padStart(3, '0')}`;
    const account = state(); account.company.name = `Компания ${String(index).padStart(3, '0')}`;
    platform.save(owner, account, 0);
    marketplace.publish(owner, { ...valid(), title: index === 13 ? 'Инженер электроники' : valid().title,
      stack: index === 13 ? ['STM32'] : valid().stack });
  }
  const first = marketplace.companies({ limit: 12 });
  assert.equal(first.total, 17); assert.equal(first.offset, 0); assert.equal(first.limit, 12);
  assert.equal(first.items.length, 12); assert.equal(first.nextOffset, 12);
  const second = marketplace.companies({ limit: 12, offset: first.nextOffset });
  assert.equal(second.items.length, 5); assert.equal(second.nextOffset, null);
  assert.equal(new Set([...first.items, ...second.items].map(company => company.id)).size, 17);
  assert.equal(marketplace.companies({ q: 'кОмПаНиЯ 013' }).items[0].name, 'Компания 013');
  assert.equal(marketplace.companies({ q: 'ЭЛЕКТРОНИКИ' }).items[0].name, 'Компания 013');
  assert.equal(marketplace.companies({ q: 'stm32' }).items[0].name, 'Компания 013');
  assert.equal(marketplace.companies({ q: '%' }).total, 0, 'Query punctuation is literal, not a SQL wildcard');
  assert.equal(marketplace.companies({ offset: 100 }).nextOffset, null);
  for (const input of [{ offset: -1 }, { offset: 0.5 }, { limit: 0 }, { limit: 101 }, { q: 'x'.repeat(401) }]) {
    assert.throws(() => marketplace.companies(input), status(400));
  }
});

test('company profile saves update the live catalog without changing company snapshots in applications', t => {
  const { platform, marketplace } = fixture(t);
  platform.save(employer, state(), 0); platform.save(candidate, state(true), 0);
  const vacancy = marketplace.publish(employer, valid());
  const application = marketplace.apply(candidate, vacancy.id, {});
  const account = platform.read(employer); account.state.company.name = 'Новое название';
  platform.save(employer, account.state, account.revision);
  assert.equal(marketplace.companies().items[0].name, 'Новое название');
  assert.equal(marketplace.vacancy(candidate, vacancy.id).company, 'Новое название');
  assert.equal(marketplace.applications(candidate, 'candidate').items[0].vacancy.company, application.vacancy.company);
});

test('a private candidate explicitly applies, only that employer sees contacts, and the offer snapshot is immutable', t => {
  const { store, platform, marketplace } = fixture(t);
  platform.save(employer, state(), 0); platform.save(candidate, state(true), 0); platform.save(outsider, state(), 0);
  const vacancy = marketplace.publish(employer, valid());
  assert.throws(() => platform.contacts(employer, candidateId), status(403));
  const employerRevision = platform.read(employer).revision;
  const application = marketplace.apply(candidate, vacancy.id, { message: 'Готов обсудить задачи.' });
  assert.equal(application.candidateId, 'candidate-anna'); assert.equal(application.status, 'sent');
  assert.equal(application.message, 'Готов обсудить задачи.');
  assert.equal(platform.read(employer).revision, employerRevision + 1);
  assert.equal(store.forOwner(candidate).eligible, 0); assert.equal(store.forOwner(candidate).visible, 0);
  const incoming = marketplace.applications(employer, 'employer').items[0];
  assert.equal(incoming.candidateId, candidateId); assert.equal(incoming.candidate.name, 'Вымышленный кандидат');
  assert.equal(incoming.candidate.email, ''); assert.equal(incoming.candidate.phone, '');
  assert.deepEqual(platform.contacts(employer, candidateId), { email: 'private@example.com', phone: '+7 000 000-00-00' });
  assert.throws(() => platform.contacts(outsider, candidateId), status(403));
  const snapshot = platform.read(employer);
  assert.deepEqual(snapshot.contactCandidateIds, [candidateId]);
  assert.equal(snapshot.directoryPeople[0].id, candidateId);
  assert.equal(snapshot.directoryPeople[0].email, '');
  assert.deepEqual(marketplace.applications(outsider, 'employer').items, []);
  assert.throws(() => marketplace.apply(candidate, vacancy.id, {}), status(409));
  marketplace.edit(employer, vacancy.id, { ...valid(), salaryFrom: 200000, salaryTo: 300000, title: 'Другая вакансия' });
  marketplace.edit(employer, vacancy.id, { status: 'closed' });
  const recovered = marketplace.applications(candidate, 'candidate').items[0];
  assert.deepEqual(recovered.vacancy, application.vacancy);
  assert.equal(recovered.vacancy.status, 'open'); assert.equal(recovered.vacancy.salaryFrom, 100000);
});

test('employer answers belong to their company, are final and invalidate the applicant snapshot', t => {
  const { platform, marketplace, setTime } = fixture(t);
  platform.save(employer, state(), 0); platform.save(candidate, state(true), 0); platform.save(outsider, state(), 0);
  const vacancy = marketplace.publish(employer, valid());
  const application = marketplace.apply(candidate, vacancy.id, {});
  assert.throws(() => marketplace.respond(candidate, application.id, { status: 'accepted' }), status(404));
  assert.throws(() => marketplace.respond(outsider, application.id, { status: 'rejected' }), status(404));
  assert.throws(() => marketplace.respond(employer, application.id, { status: 'sent' }), status(400));
  const revision = platform.read(candidate).revision;
  setTime(time + 1000);
  const accepted = marketplace.respond(employer, application.id, { status: 'accepted' });
  assert.equal(accepted.respondedAt, new Date(time + 1000).toISOString());
  assert.equal(platform.read(candidate).revision, revision + 1);
  assert.equal(marketplace.applications(candidate, 'candidate').items[0].status, 'accepted');
  setTime(time + 2000);
  assert.deepEqual(marketplace.respond(employer, application.id, { status: 'accepted' }), accepted, 'The same response is idempotent');
  assert.equal(platform.read(candidate).revision, revision + 1);
  assert.throws(() => marketplace.respond(employer, application.id, { status: 'rejected' }), status(409));
});

test('consent withdrawal hides applicant data and contacts immediately without destroying the application', t => {
  const { platform, marketplace } = fixture(t);
  platform.save(employer, state(), 0); platform.save(candidate, state(true), 0);
  const vacancy = marketplace.publish(employer, valid()); marketplace.apply(candidate, vacancy.id, {});
  const account = platform.read(candidate); account.state.profile.consent = false;
  platform.save(candidate, account.state, account.revision);
  assert.equal(marketplace.applications(employer, 'employer').items[0].candidate, null);
  assert.equal(marketplace.applications(candidate, 'candidate').items[0].candidate.name, 'Вымышленный кандидат');
  assert.throws(() => platform.contacts(employer, candidateId), status(403));
  assert.deepEqual(platform.read(employer).contactCandidateIds, []);
  assert.deepEqual(platform.read(employer).directoryPeople, []);
  assert.throws(() => marketplace.apply(candidate, marketplace.publish(employer, valid()).id, {}), status(400));
});

test('deleting a candidate cascades applications and invalidates the employer while retaining the job', t => {
  const { store, platform, marketplace } = fixture(t);
  platform.save(employer, state(), 0); platform.save(candidate, state(true), 0);
  const vacancy = marketplace.publish(employer, valid()); marketplace.apply(candidate, vacancy.id, {});
  const revision = platform.read(employer).revision;
  platform.delete(candidate);
  assert.deepEqual(marketplace.applications(employer, 'employer').items, []);
  assert.equal(platform.read(employer).revision, revision + 1);
  assert.equal(marketplace.vacancy(employer, vacancy.id).id, vacancy.id);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM marketplace_applications').get().n, 0);
  assert.throws(() => platform.contacts(employer, candidateId), status(404));
});

test('deleting an employer cascades their company, vacancies, skills and applications and invalidates applicants', t => {
  const { store, platform, marketplace } = fixture(t);
  platform.save(employer, state(), 0); platform.save(candidate, state(true), 0);
  const vacancy = marketplace.publish(employer, valid()); marketplace.apply(candidate, vacancy.id, {});
  const revision = platform.read(candidate).revision;
  platform.delete(employer);
  assert.equal(platform.read(candidate).revision, revision + 1);
  assert.deepEqual(marketplace.applications(candidate, 'candidate').items, []);
  for (const table of ['marketplace_vacancies', 'marketplace_vacancy_skills', 'marketplace_applications']) {
    assert.equal(store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, table);
  }
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM marketplace_companies WHERE owner=?').get(employer).n, 0);
  assert(store.forOwner(candidate));
});

test('validation rejects forged identities, missing salaries, closed jobs and self applications without writes', t => {
  const { store, platform, marketplace } = fixture(t);
  platform.save(employer, state(true), 0); platform.save(candidate, state(true), 0);
  for (const mutate of [value => { value.salaryFrom = null; }, value => { value.salaryFrom = 0; },
    value => { value.salaryTo = 90000; }, value => { value.salaryTo = 150000.5; }, value => { value.currency = 'USD'; },
    value => { value.companyId = 'stolen-company'; }, value => { value.synthetic = true; },
    value => { value.specialization = 'Wrong'; }, value => { value.grade = 'Wrong'; }, value => { value.stack = ['x'.repeat(81)]; }]) {
    const value = valid(); mutate(value);
    assert.throws(() => marketplace.publish(employer, value), status(400));
  }
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM marketplace_vacancies').get().n, 0);
  const vacancy = marketplace.publish(employer, valid());
  assert.throws(() => marketplace.apply(employer, vacancy.id, {}), status(403));
  assert.throws(() => marketplace.apply(candidate, vacancy.id, { candidateId: 'forged' }), status(400));
  assert.throws(() => marketplace.apply(candidate, vacancy.id, { message: 'x'.repeat(2001) }), status(400));
  marketplace.edit(employer, vacancy.id, { status: 'closed' });
  assert.throws(() => marketplace.apply(candidate, vacancy.id, {}), status(409));
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM marketplace_applications').get().n, 0);
});

test('vacancies, skills and immutable applications survive database reopen', t => {
  const path = join(tmpdir(), `predel-marketplace-${randomUUID()}.sqlite`);
  let store = new DirectoryStore(path);
  const assessments = openStore(':memory:');
  t.after(() => {
    assessments.close(); store.close();
    for (const suffix of ['', '-wal', '-shm']) if (existsSync(path + suffix)) unlinkSync(path + suffix);
  });
  const platform = new PlatformService(store, assessments), marketplace = new MarketplaceService(store, { seeds: false });
  platform.save(employer, state(), 0); platform.save(candidate, state(true), 0);
  const vacancy = marketplace.publish(employer, valid()), application = marketplace.apply(candidate, vacancy.id, {});
  store.close(); store = new DirectoryStore(path);
  const reopened = new MarketplaceService(store, { seeds: false });
  assert.deepEqual(reopened.vacancy(candidate, vacancy.id), vacancy);
  assert.deepEqual(reopened.applications(candidate, 'candidate').items[0], application);
});

test('HTTP marketplace flow is session-owned, no-store and keeps contact access scoped to the applied company', async t => {
  const codes = new Map();
  const service = createAssessmentServer({ dbPath: ':memory:', authEnv: {}, authMailer: async ({ email, code }) => { codes.set(email, code); } });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { service.server.close(resolve); service.server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${service.server.address().port}`;
  function session() {
    const cookies = new Map();
    let identity;
    return async (path, method = 'GET', input) => {
      const response = await fetch(base + path, { method, headers: { Cookie: [...cookies].map(([key, token]) => `${key}=${token}`).join('; '),
        ...(identity ? { 'X-Platform-Identity': identity } : {}),
        ...(input !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: input === undefined ? undefined : JSON.stringify(input) });
      for (const value of response.headers.getSetCookie()) {
        const [key, token] = value.split(';')[0].split('=');
        if (token) cookies.set(key, token); else cookies.delete(key);
      }
      identity = response.headers.get('x-platform-identity') || identity;
      return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
    };
  }
  async function register(client, role, login) {
    const email = `${login}@example.test`;
    assert.equal((await client('/api/auth/register/request-code', 'POST', {
      role, email, login, password: 'marketplace fixture password', consent: true, privacyVersion: PRIVACY_POLICY_VERSION,
      ...(role === 'candidate' ? { name: 'Вымышленный кандидат' } : { companyName: 'Вымышленная компания' }),
    })).status, 202);
    assert.equal((await client('/api/auth/register/verify', 'POST', { email, code: codes.get(email) })).status, 201);
    assert.equal((await client('/api/platform/state')).status, 200);
  }
  const employerSession = session(), candidateSession = session(), outsiderSession = session();
  await register(employerSession, 'employer', 'marketplace-owner');
  await register(candidateSession, 'candidate', 'marketplace-candidate');
  await register(outsiderSession, 'employer', 'marketplace-outsider');
  assert.equal((await employerSession('/api/vacancies', 'POST', valid())).status, 409);
  await employerSession('/api/platform/state', 'PUT', { state: state(), baseRevision: 0 });
  await candidateSession('/api/platform/state', 'PUT', { state: state(true), baseRevision: 0 });
  const published = await employerSession('/api/vacancies', 'POST', valid());
  assert.equal(published.status, 201); assert.equal(published.cache, 'no-store');
  assert.equal((await outsiderSession(`/api/vacancies/${published.data.id}`, 'PATCH', { status: 'closed' })).status, 409);
  const applied = await candidateSession(`/api/vacancies/${published.data.id}/applications`, 'POST', { message: 'Тестовый отклик' });
  assert.equal(applied.status, 201); assert.equal(applied.cache, 'no-store');
  assert.equal((await candidateSession(`/api/vacancies/${published.data.id}/applications`, 'POST', {})).status, 409);
  const incoming = await employerSession('/api/applications?role=employer');
  assert.equal(incoming.data.items.length, 1);
  const personId = incoming.data.items[0].candidateId;
  assert.equal((await employerSession(`/api/directory/${personId}/contacts`)).status, 200);
  assert.equal((await outsiderSession(`/api/directory/${personId}/contacts`)).status, 403);
  assert.equal((await candidateSession(`/api/applications/${applied.data.id}`, 'PATCH', { status: 'accepted' })).status, 403);
  assert.equal((await employerSession(`/api/applications/${applied.data.id}`, 'PATCH', { status: 'accepted' })).status, 200);
  assert.equal((await candidateSession('/api/applications?role=candidate')).data.items[0].status, 'accepted');
  const saved = (await candidateSession('/api/platform/state')).data;
  saved.state.profile.consent = false;
  assert.equal((await candidateSession('/api/platform/state', 'PUT', { state: saved.state, baseRevision: saved.revision })).status, 200);
  assert.equal((await employerSession(`/api/directory/${personId}/contacts`)).status, 403);
  assert.equal((await employerSession('/api/applications?role=employer')).data.items[0].candidate, null);
});
