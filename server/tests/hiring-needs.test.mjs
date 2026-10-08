import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DirectoryStore } from '../directory-store.mjs';
import { PlatformService } from '../platform.mjs';
import { createAssessmentServer } from '../server.mjs';
import { openStore } from '../store.mjs';
import { defaultSearchFilters } from '../../shared/search.ts';

const ownerA = '11111111111111111111111111111111';
const ownerB = '22222222222222222222222222222222';
const candidateOwner = '33333333333333333333333333333333';
const accounts = new Map([
  [ownerA, { role: 'employer', username: 'employer-a@example.test' }],
  [ownerB, { role: 'employer', username: 'employer-b@example.test' }],
  [candidateOwner, { role: 'candidate', username: 'candidate@example.test' }],
]);
const accountForOwner = owner => accounts.get(owner);
const status = expected => error => error.status === expected;
function initial() {
  return { version: 2, profile: {}, company: {}, invitations: [], history: [], surveys: [], savedSearches: [] };
}
function need(id = 'embedded-team', overrides = {}) {
  return { id, title: 'Инженер электроники', team: 'Разработчик прошивки и инженер платы',
    tasks: 'Разрабатывать электронику и объяснять устройство печатных плат.',
    filters: { ...defaultSearchFilters, specialization: 'Embedded', grade: 'Middle', stack: ['C++'], salaryMax: 200000 }, ...overrides };
}
function fixture(t, options = {}) {
  const store = new DirectoryStore(':memory:');
  const assessments = openStore(':memory:');
  const platform = new PlatformService(store, assessments, { accountForOwner, ...options });
  t.after(() => { assessments.close(); store.close(); });
  return { store, assessments, platform };
}

test('employer needs are separate ordered SQLite entities and survive a service and database restart', t => {
  const path = join(tmpdir(), `predel-hiring-needs-${randomUUID()}.sqlite`);
  let store = new DirectoryStore(path);
  const assessments = openStore(':memory:');
  t.after(() => {
    assessments.close(); store.close();
    for (const suffix of ['', '-wal', '-shm']) if (existsSync(path + suffix)) unlinkSync(path + suffix);
  });
  const platform = new PlatformService(store, assessments, { accountForOwner });
  const state = initial();
  state.hiringNeeds = [need('second'), need('first', { title: 'Frontend команда', tasks: '', team: '',
    filters: { specialization: 'Frontend', stack: [' React ', 'React', ' TypeScript '], grade: 'Junior', city: ' Казань ' } })];
  const saved = platform.save(ownerA, state, 0);
  assert.deepEqual(saved.state.hiringNeeds.map(item => item.id), ['second', 'first']);
  assert.equal(saved.state.hiringNeeds[1].filters.city, 'Казань');
  assert.deepEqual(saved.state.hiringNeeds[1].filters.stack, ['React', 'TypeScript']);
  assert.equal(saved.state.hiringNeeds[1].filters.salaryMax, null);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM platform_hiring_needs WHERE owner=?').get(ownerA).count, 2);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM marketplace_vacancies').get().count, 0,
    'A private hiring need is not published as a vacancy');
  store.close(); store = new DirectoryStore(path);
  const recovered = new PlatformService(store, assessments, { accountForOwner }).read(ownerA);
  assert.equal(recovered.revision, saved.revision);
  assert.deepEqual(recovered.state.hiringNeeds, saved.state.hiringNeeds);
});

test('older clients omit hiringNeeds without deleting them; an explicit empty collection deletes only the owner needs', t => {
  const { platform } = fixture(t);
  const state = initial(); state.hiringNeeds = [need()];
  const saved = platform.save(ownerA, state, 0);
  platform.save(ownerB, { ...initial(), hiringNeeds: [need()] }, 0);
  const legacy = structuredClone(saved.state); delete legacy.hiringNeeds;
  legacy.company.name = 'Обновлённая компания';
  const changed = platform.save(ownerA, legacy, saved.revision);
  assert.deepEqual(changed.state.hiringNeeds, saved.state.hiringNeeds);
  assert.equal(changed.state.company.name, 'Обновлённая компания');
  const removed = platform.save(ownerA, { ...changed.state, hiringNeeds: [] }, changed.revision);
  assert.deepEqual(removed.state.hiringNeeds, []);
  assert.equal(platform.read(ownerB).state.hiringNeeds.length, 1);
  assert.deepEqual(platform.save(candidateOwner, { ...initial(), hiringNeeds: [] }, 0).state.hiringNeeds, []);
});

test('owners can reuse the same need ID and cannot read or overwrite another employer needs', t => {
  const { platform, store } = fixture(t);
  const own = platform.save(ownerA, { ...initial(), hiringNeeds: [need('same-id')] }, 0);
  const other = platform.save(ownerB, { ...initial(), hiringNeeds: [need('same-id', { title: 'Другая потребность' })] }, 0);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM platform_hiring_needs WHERE id=?').get('same-id').count, 2);
  assert.equal(own.state.hiringNeeds[0].title, 'Инженер электроники');
  assert.equal(other.state.hiringNeeds[0].title, 'Другая потребность');
  const changed = structuredClone(own.state); changed.hiringNeeds[0].title = 'Изменено своим работодателем';
  platform.save(ownerA, changed, own.revision);
  assert.deepEqual(platform.read(ownerB).state.hiringNeeds, other.state.hiringNeeds);
  assert.throws(() => platform.read('unauthenticated-owner'), status(401));
});

test('trusted account role controls need creation even when the caller claims employer role', t => {
  const { platform } = fixture(t);
  assert.throws(() => platform.save(candidateOwner, { ...initial(), hiringNeeds: [need()] }, 0, 'employer'), status(403));
  assert.equal(platform.read(candidateOwner).state, null);
  const candidate = platform.save(candidateOwner, { ...initial(), hiringNeeds: [] }, 0, 'employer');
  assert.deepEqual(candidate.state.hiringNeeds, []);
  assert.throws(() => platform.save(candidateOwner, { ...candidate.state, hiringNeeds: [need()] }, candidate.revision, 'employer'), status(403));
  const employer = platform.save(ownerA, { ...initial(), hiringNeeds: [need()] }, 0, 'candidate');
  assert.equal(employer.state.hiringNeeds.length, 1, 'Trusted employer account overrides the caller role');
});

test('a candidate cannot erase pre-existing needs, while an omitted legacy field preserves them', t => {
  const { platform, store } = fixture(t);
  const saved = platform.save(candidateOwner, initial(), 0);
  store.db.prepare('INSERT INTO platform_hiring_needs VALUES(?,?,?,?)').run(candidateOwner, 'legacy', 0, JSON.stringify(need('legacy')));
  assert.throws(() => platform.save(candidateOwner, { ...saved.state, hiringNeeds: [] }, saved.revision), status(403));
  assert.equal(platform.read(candidateOwner).revision, saved.revision);
  const legacy = structuredClone(saved.state); delete legacy.hiringNeeds;
  assert.equal(platform.save(candidateOwner, legacy, saved.revision).state.hiringNeeds.length, 1);
});

test('stale tabs cannot resurrect deleted needs and failures roll back every collection', t => {
  const { platform, store } = fixture(t);
  const saved = platform.save(ownerA, { ...initial(), hiringNeeds: [need()] }, 0);
  const removed = platform.save(ownerA, { ...saved.state, hiringNeeds: [] }, saved.revision);
  assert.throws(() => platform.save(ownerA, saved.state, saved.revision), status(409));
  const invalid = structuredClone(removed.state);
  invalid.company.name = 'Не должно сохраниться'; invalid.hiringNeeds = [need('rollback')];
  invalid.invitations = [{ id: 'unavailable', candidateId: 'missing', title: 'Инженер', description: 'Проверка транзакции',
    contact: 'employer@example.test', salaryFrom: 100000, salaryTo: 200000, status: 'sent' }];
  assert.throws(() => platform.save(ownerA, invalid, removed.revision), status(404));
  assert.equal(platform.read(ownerA).revision, removed.revision);
  assert.equal(platform.read(ownerA).state.company.name, removed.state.company.name);
  assert.deepEqual(platform.read(ownerA).state.hiringNeeds, []);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM platform_hiring_needs').get().count, 0);
});

test('need validation rejects malformed, owner-controlled and oversized drafts atomically', t => {
  const { platform } = fixture(t);
  const saved = platform.save(ownerA, { ...initial(), hiringNeeds: [need()] }, 0);
  const invalidNeeds = [
    null, {}, need('', {}), need('id', { title: ' ' }), need('x'.repeat(101)),
    need('id', { title: 'x'.repeat(201) }), need('id', { team: 'x'.repeat(2001) }),
    need('id', { tasks: 'x'.repeat(1201) }), need('id', { owner: ownerB }), need('id', { companyId: 'forged' }),
    need('id', { team: {} }), need('id', { tasks: null }), need('id', { filters: null }),
    need('id', { tasks: ' ', filters: defaultSearchFilters }),
    need('id', { filters: { ...defaultSearchFilters, unknownFilter: true } }),
    need('id', { filters: { ...defaultSearchFilters, specialization: 'unknown' } }),
    need('id', { filters: { ...defaultSearchFilters, grade: 'Expert' } }),
    need('id', { filters: { ...defaultSearchFilters, salaryMax: -1 } }),
    need('id', { filters: { ...defaultSearchFilters, experienceMin: 24, experienceMax: 12 } }),
    need('id', { filters: { ...defaultSearchFilters, minScore: 101 } }),
    need('id', { filters: { ...defaultSearchFilters, stack: ['x'.repeat(81)] } }),
    need('id', { filters: { ...defaultSearchFilters, fsp: 'yes' } }),
  ];
  for (const item of invalidNeeds) {
    const input = { ...saved.state, company: { ...saved.state.company, name: 'Не должно сохраниться' }, hiringNeeds: [item] };
    assert.throws(() => platform.save(ownerA, input, saved.revision), status(400));
  }
  for (const collection of [null, {}, [need('duplicate'), need('duplicate')], Array.from({ length: 21 }, (_, i) => need(`need-${i}`))]) {
    assert.throws(() => platform.save(ownerA, { ...saved.state, hiringNeeds: collection }, saved.revision), status(400));
  }
  assert.equal(platform.read(ownerA).revision, saved.revision);
  assert.deepEqual(platform.read(ownerA).state.hiringNeeds, saved.state.hiringNeeds);
  assert.equal(platform.read(ownerA).state.company.name, saved.state.company.name);
});

test('all twenty bounded needs are accepted and require professional tasks, specialization or stack', t => {
  const { platform } = fixture(t);
  const kinds = [
    { tasks: 'Изучить строение электронной платы', filters: defaultSearchFilters },
    { tasks: '', filters: { ...defaultSearchFilters, specialization: 'Embedded' } },
    { tasks: '', filters: { ...defaultSearchFilters, stack: ['C++'] } },
  ];
  const input = initial(); input.hiringNeeds = Array.from({ length: 20 }, (_, i) => need(`need-${i}`, kinds[i % kinds.length]));
  input.hiringNeeds[0] = need('x'.repeat(100), { title: 'x'.repeat(200), team: 'x'.repeat(2000), tasks: 'x'.repeat(1200) });
  const saved = platform.save(ownerA, input, 0);
  assert.equal(saved.state.hiringNeeds.length, 20);
  assert.deepEqual(saved.state.hiringNeeds.map(item => item.id), input.hiringNeeds.map(item => item.id));
});

test('deleting the owner cascades its needs and preserves unrelated employer needs', t => {
  const { platform, store } = fixture(t);
  platform.save(ownerA, { ...initial(), hiringNeeds: [need()] }, 0);
  const other = platform.save(ownerB, { ...initial(), hiringNeeds: [need()] }, 0);
  platform.delete(ownerA);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM platform_hiring_needs WHERE owner=?').get(ownerA).count, 0);
  assert.deepEqual(platform.read(ownerA), { state: null, revision: 0, directoryPeople: [] });
  assert.deepEqual(platform.read(ownerB).state.hiringNeeds, other.state.hiringNeeds);
  assert.equal(platform.read(ownerB).revision, other.revision);
});

test('HTTP needs require the current authenticated employer identity and cannot cross accounts or stale revisions', async t => {
  const codes = new Map();
  const service = createAssessmentServer({ dbPath: ':memory:', authEnv: {},
    authMailer: async ({ email, code }) => { codes.set(email, code); } });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { service.server.close(resolve); service.server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${service.server.address().port}`;
  function browser() {
    const cookies = new Map();
    let identity;
    const client = async (path, method = 'GET', input, headers = {}) => {
      const response = await fetch(base + path, { method, headers: {
        Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        ...(input === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(identity ? { 'X-Platform-Identity': identity } : {}), ...headers,
      }, body: input === undefined ? undefined : JSON.stringify(input) });
      for (const value of response.headers.getSetCookie()) {
        const [key, token] = value.split(';')[0].split('=');
        if (token) cookies.set(key, token); else cookies.delete(key);
      }
      identity = response.headers.get('X-Platform-Identity') || identity;
      return { status: response.status, data: await response.json(), identity };
    };
    return client;
  }
  async function register(role, login) {
    const client = browser(), email = `${login}@example.invalid`;
    assert.equal((await client('/api/auth/register/request-code', 'POST', {
      role, login, email, password: 'PrivateHiringNeedPassword847!', consent: true,
      ...(role === 'candidate' ? { name: 'Проверочный кандидат' } : { companyName: 'Проверочная компания' }),
    })).status, 202);
    assert.equal((await client('/api/auth/register/verify', 'POST', { email, code: codes.get(email) })).status, 201);
    assert.equal((await client('/api/platform/state')).status, 200);
    return client;
  }
  const guest = browser();
  assert.equal((await guest('/api/platform/state', 'PUT', { state: { ...initial(), hiringNeeds: [need()] }, baseRevision: 0 })).status, 401);
  const employer = await register('employer', 'hiring.employer');
  const otherEmployer = await register('employer', 'hiring.other');
  const candidate = await register('candidate', 'hiring.candidate');
  const candidateIdentity = (await candidate('/api/platform/state')).identity;
  const saved = await employer('/api/platform/state', 'PUT', { state: { ...initial(), hiringNeeds: [need()] }, baseRevision: 0 });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.state.hiringNeeds.length, 1);
  assert.equal((await otherEmployer('/api/platform/state')).data.state, null);
  assert.equal((await candidate('/api/platform/state', 'PUT', { state: { ...initial(), hiringNeeds: [need()] }, baseRevision: 0 },
    { 'X-User-Role': 'employer' })).status, 403);
  assert.equal((await candidate('/api/platform/state')).data.state, null);
  assert.equal((await employer('/api/platform/state', 'PUT', { state: saved.data.state, baseRevision: saved.data.revision },
    { 'X-Platform-Identity': candidateIdentity })).status, 409);
  const next = await employer('/api/platform/state', 'PUT', {
    state: { ...saved.data.state, hiringNeeds: [] }, baseRevision: saved.data.revision,
  });
  assert.equal(next.status, 200);
  assert.equal((await employer('/api/platform/state', 'PUT', { state: saved.data.state, baseRevision: saved.data.revision })).status, 409);
  assert.deepEqual((await employer('/api/platform/state')).data.state.hiringNeeds, []);
});
