import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssessmentServer } from '../server.mjs';
import { directoryCandidates, legacyDirectoryCandidates } from '../directory-seed.mjs';
import { createInitialState } from '../../frontend/src/model.ts';

const builtInSeeds = [...directoryCandidates, ...legacyDirectoryCandidates];
const builtInIds = new Set(builtInSeeds.map(person => person.id));
const password = 'IsolatedCatalogPassword827!';
const sorted = values => [...values].sort();

async function setup(t) {
  const codes = new Map();
  // This HTTP service and its mailbox exist only inside this test. No real
  // SMTP settings, credentials, user accounts or persistent database are used.
  const service = createAssessmentServer({ dbPath: ':memory:', authEnv: {},
    authMailer: async ({ email, code }) => { codes.set(email, code); } });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => {
    service.server.close(resolve);
    service.server.closeAllConnections();
  }));
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
    client.owner = () => service.auth.accountForToken(cookies.get('predel_account_session'))?.platformOwner;
    return client;
  }
  async function register(role, login) {
    const client = browser(), email = `${login}@example.invalid`;
    const requested = await client('/api/auth/register/request-code', 'POST', {
      role, login, email, password, consent: true, privacyVersion: PRIVACY_POLICY_VERSION,
      ...(role === 'candidate' ? { name: 'Проверочный кандидат каталога' }
        : { companyName: 'Проверочная компания каталога' }),
    });
    assert.equal(requested.status, 202);
    assert.equal((await client('/api/auth/register/verify', 'POST', { email, code: codes.get(email) })).status, 201);
    assert.equal((await client('/api/platform/state')).status, 200);
    return client;
  }
  async function catalogue(client, filters = {}) {
    const people = [], limit = 17;
    let total;
    for (let offset = 0;; offset += limit) {
      const response = await client('/api/directory/search?limit=' + limit + '&offset=' + offset
        + '&filters=' + encodeURIComponent(JSON.stringify(filters)));
      assert.equal(response.status, 200);
      const page = response.data;
      assert.equal(page.offset, offset);
      assert.equal(page.limit, limit);
      total ??= page.total;
      assert.equal(page.total, total, 'A stable catalogue has the same total on every page');
      people.push(...page.items.map(item => item.person));
      if (people.length >= total) break;
      assert.equal(page.items.length, limit, 'Intermediate catalogue pages must not be empty or truncated');
    }
    assert.equal(people.length, total);
    assert.equal(new Set(people.map(person => person.id)).size, total, 'Pagination cannot repeat candidates');
    return people;
  }
  return { service, browser, register, catalogue };
}

function invitation(candidateId, id = 'forbidden-demo-invitation') {
  return { id, candidateId, companyId: 'company-line', company: 'Проверочная компания каталога',
    title: 'Проверочное предложение', description: 'Разработка доступных форм.', contact: 'company@example.invalid',
    salaryFrom: 100000, salaryTo: 150000, status: 'sent', date: new Date().toISOString() };
}

test('a newly confirmed employer can browse every built-in demo on a clean database without opening guest or candidate access', async t => {
  const f = await setup(t), guest = f.browser();
  for (const path of ['/api/directory/search', '/api/directory/options', '/api/platform/state']) {
    const response = await guest(path);
    assert.equal(response.status, 401);
    assert.deepEqual(Object.keys(response.data), ['error']);
  }
  const employer = await f.register('employer', 'catalog.employer');
  assert.equal((await employer('/api/platform/state')).data.state, null, 'No company setup is needed to browse');
  const people = await f.catalogue(employer);
  assert.ok(people.length > 0, 'A clean authenticated stand must have a usable catalogue');
  assert.deepEqual(sorted(people.map(person => person.id)), sorted(builtInIds));
  for (const person of people) {
    assert.equal(person.demoProfile, true);
    assert.equal(person.synthetic, true);
    assert.equal(person.email, '');
    assert.equal(person.phone, '');
    assert.equal(person.fspId, '');
    assert.equal(Object.hasOwn(person, 'owner'), false);
  }
  const options = await employer('/api/directory/options');
  assert.equal(options.status, 200);
  assert.deepEqual(sorted(options.data.cities), sorted(new Set(builtInSeeds.map(person => person.city).filter(Boolean))));
  assert.deepEqual(sorted(options.data.industries), sorted(new Set(builtInSeeds.map(person => person.industry).filter(Boolean))));
  const filtered = await f.catalogue(employer, { specialization: 'Frontend', grade: 'Middle', city: 'Москва' });
  assert.deepEqual(sorted(filtered.map(person => person.id)), sorted(builtInSeeds.filter(person =>
    person.confirmed.specialization === 'Frontend' && person.confirmed.grade === 'Middle' && person.city === 'Москва').map(person => person.id)));
  const candidate = await f.register('candidate', 'catalog.candidate');
  assert.equal((await candidate('/api/directory/search')).status, 403);
  assert.equal((await candidate('/api/directory/options')).status, 403);
  assert.equal((await guest('/api/directory/search')).status, 401, 'Another user registering does not upgrade the old guest cookie');
});

test('the demo exception cannot be obtained by arbitrary ownerless profiles, abandoned owners or editable payload flags', async t => {
  const f = await setup(t), employer = await f.register('employer', 'catalog.provenance');
  const db = f.service.directory.store.db, sample = builtInSeeds[0];
  f.service.directory.store.upsert({ ...structuredClone(sample), id: 'unknown-ownerless-demo', city: 'Частный город неизвестного профиля',
    demoProfile: true, synthetic: true }, null, true);
  f.service.directory.store.upsert({ ...structuredClone(sample), id: 'abandoned-guest-profile', city: 'Частный город прежнего гостя',
    demoProfile: true, synthetic: true }, 'not-a-registered-owner', true);
  const ownerAttached = builtInSeeds[1].id, nonSynthetic = builtInSeeds[2].id;
  db.prepare('UPDATE directory_candidates SET owner=? WHERE id=?').run('another-abandoned-owner', ownerAttached);
  db.prepare('UPDATE directory_candidates SET synthetic=0 WHERE id=?').run(nonSynthetic);
  const row = f.service.directory.store.get(sample.id);
  const altered = { ...JSON.parse(row.public_payload), demoProfile: false, synthetic: false };
  db.prepare('UPDATE directory_candidates SET public_payload=? WHERE id=?').run(JSON.stringify(altered), sample.id);
  const people = await f.catalogue(employer);
  assert.deepEqual(sorted(people.map(person => person.id)), sorted([...builtInIds].filter(id => id !== ownerAttached && id !== nonSynthetic)));
  const trusted = people.find(person => person.id === sample.id);
  assert.equal(trusted.demoProfile, true, 'The server computes the read-only flag from trusted row provenance');
  assert.equal(trusted.synthetic, true, 'Stored public JSON cannot hide the built-in fictional origin');
  const options = await employer('/api/directory/options');
  assert(!options.data.cities.includes('Частный город неизвестного профиля'));
  assert(!options.data.cities.includes('Частный город прежнего гостя'));
  for (const id of ['unknown-ownerless-demo', 'abandoned-guest-profile', sample.id]) {
    assert.equal((await employer('/api/directory/' + id + '/contacts')).status, 404);
  }
});

test('personal demo preferences survive a new login while invitations, forged legacy links and contacts remain unavailable', async t => {
  const f = await setup(t), login = 'catalog.preferences', employer = await f.register('employer', login);
  const demoId = builtInSeeds[0].id, date = new Date().toISOString(), state = createInitialState();
  state.candidateDecisions = [{ candidateId: demoId, decision: 'liked', date }];
  const saved = await employer('/api/platform/state', 'PUT', { state, baseRevision: 0 });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.directoryPeople.find(person => person.id === demoId)?.demoProfile, true);
  assert.deepEqual(saved.data.contactCandidateIds, []);
  const anotherBrowser = f.browser();
  assert.equal((await anotherBrowser('/api/auth/login', 'POST', { loginOrEmail: login, password })).status, 200);
  const restored = await anotherBrowser('/api/platform/state');
  assert.equal(restored.data.state.candidateDecisions[0].candidateId, demoId);
  assert.equal(restored.data.directoryPeople.find(person => person.id === demoId)?.demoProfile, true);
  const before = structuredClone(restored.data);
  restored.data.state.invitations.push(invitation(demoId));
  const attempted = await anotherBrowser('/api/platform/state', 'PUT', { state: restored.data.state, baseRevision: restored.data.revision });
  assert.equal(attempted.status, 404);
  assert.deepEqual((await anotherBrowser('/api/platform/state')).data, before, 'A failed invitation rolls back all state changes');
  const db = f.service.directory.store.db, forged = { ...invitation(demoId, 'legacy-demo-accepted'), status: 'accepted' };
  db.prepare('INSERT INTO platform_invitations VALUES(?,?,?,?,?,?)')
    .run(forged.id, employer.owner(), demoId, forged.status, date, JSON.stringify(forged));
  const published = await anotherBrowser('/api/vacancies', 'POST', { title: 'Проверочная вакансия',
    description: 'Разработка доступных форм.', specialization: 'Frontend', grade: 'Junior', city: 'Москва',
    format: 'Удалённо', stack: ['React'], salaryFrom: 100000, salaryTo: 150000 });
  assert.equal(published.status, 201);
  // Even inconsistent legacy rows must not make a read-only demo a real
  // applicant or confer contact authority through the snapshot's ID list.
  db.prepare('INSERT INTO marketplace_applications VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run('legacy-demo-application', published.data.id, published.data.companyId, employer.owner(), demoId,
      'sent', date, null, '', JSON.stringify(published.data));
  const safe = await anotherBrowser('/api/platform/state');
  assert.deepEqual(safe.data.state.invitations, [], 'Old forged accepted links cannot turn an ownerless demo into a participant');
  assert.deepEqual(safe.data.contactCandidateIds, []);
  assert.deepEqual((await anotherBrowser('/api/applications?role=employer')).data.items, []);
  assert.equal((await anotherBrowser('/api/directory/' + demoId + '/contacts')).status, 404);
  safe.data.state.invitations.push(forged);
  assert.equal((await anotherBrowser('/api/platform/state', 'PUT', { state: safe.data.state, baseRevision: safe.data.revision })).status, 403);
});

test('semantic results apply the same demo policy and recheck it after the worker completes', async t => {
  const f = await setup(t), employer = await f.register('employer', 'catalog.semantic');
  const demo = directoryCandidates.find(person => person.id === 'demo-frontend-1');
  assert.ok(demo);
  f.service.directory.store.db.prepare('UPDATE directory_candidates SET eligible=0 WHERE id<>?').run(demo.id);
  const encoder = { info: { version: 'catalog-policy-fixture', dimension: 2, threshold: 0.5, reranker: { threshold: 0.5 } },
    start: async () => {}, close() {}, encode: async texts => texts.map(() => [1, 0]),
    rerank: async (_query, texts) => texts.map(() => 0.9) };
  // No model quality claim: this deterministic worker only exercises the
  // authenticated HTTP path, DTO provenance and post-worker access checks.
  f.service.directory.encoder = encoder;
  const path = '/api/directory/search?q=' + encodeURIComponent('создать доступную форму');
  const found = await employer(path);
  assert.equal(found.status, 200);
  assert.deepEqual(found.data.items.map(item => item.person.id), [demo.id]);
  assert.equal(found.data.items[0].person.demoProfile, true);
  encoder.rerank = async (_query, texts) => {
    f.service.directory.store.db.prepare('UPDATE directory_candidates SET owner=? WHERE id=?').run('unregistered-during-worker', demo.id);
    return texts.map(() => 0.9);
  };
  const withdrawn = await employer(path);
  assert.equal(withdrawn.status, 200);
  assert.deepEqual(withdrawn.data.items, []);
  assert.equal(withdrawn.data.total, 0);
});
