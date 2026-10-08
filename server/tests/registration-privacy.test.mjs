import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssessmentServer } from '../server.mjs';
import { validateRegistration } from '../auth.mjs';
import { createInitialState } from '../../frontend/src/model.ts';
import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';

const password = 'Privacy isolated fixture 927!';
const initialTime = Date.parse('2026-10-08T12:00:00.000Z');
const registration = (login, role = 'candidate') => ({ role, login, email: login + '@example.invalid', password,
  consent: true, privacyVersion: PRIVACY_POLICY_VERSION,
  ...(role === 'candidate' ? { name: 'Ромашов Фёдор Викторович' } : { companyName: 'Проверочная компания' }) });

async function fixture(t) {
  let clock = initialTime;
  const codes = new Map();
  const provider = { id: 'privacy-fixture', name: 'Isolated source', mode: 'demo', auth: 'demo', enabled: true,
    connect: owner => ({ subject: 'isolated:' + owner, externalId: 'fixture:' + owner, identityVerified: false, credentials: {} }),
    load: async connection => ({ subject: connection.subject, externalId: connection.external_id, achievements: [{
      id: 'isolated-achievement', title: 'Изолированное соревнование', discipline: 'algorithms',
      occurredAt: '2026-09-01T00:00:00.000Z', result: 'Финалист', place: 3, participation: 'individual',
      teamRole: null, sourceUrl: null, status: 'active',
    }] }) };
  const service = createAssessmentServer({ dbPath: ':memory:', authEnv: {}, now: () => clock,
    authMailer: async ({ email, code }) => { codes.set(email, code); return { delivery: 'development' }; },
    integrationOptions: { automatic: false, providers: [provider] } });
  assert.equal(service.store.db, service.directory.store.db);
  assert.equal(service.store.db, service.auth.store.db);
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { service.server.close(resolve); service.server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${service.server.address().port}`;
  function client() {
    const cookies = new Map();
    let identity;
    return {
      get identity() { return identity; },
      async request(path, method = 'GET', value, headers = {}) {
        const response = await fetch(base + path, { method, headers: { Origin: base,
          Cookie: [...cookies].map(([key, item]) => `${key}=${item}`).join('; '),
          ...(identity ? { 'X-Platform-Identity': identity } : {}),
          ...(value === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
          body: value === undefined ? undefined : JSON.stringify(value) });
        for (const cookie of response.headers.getSetCookie()) {
          const [key, item] = cookie.split(';')[0].split('=');
          if (item) cookies.set(key, item); else cookies.delete(key);
        }
        identity = response.headers.get('X-Platform-Identity') || identity;
        return { status: response.status, data: await response.json(), headers: response.headers };
      },
    };
  }
  async function register(login, role = 'candidate', verificationDelay = 0) {
    const actor = client(), input = registration(login, role);
    const requested = await actor.request('/api/auth/register/request-code', 'POST', input);
    assert.equal(requested.status, 202, JSON.stringify(requested.data));
    clock += verificationDelay;
    const verified = await actor.request('/api/auth/register/verify', 'POST', { email: input.email, code: codes.get(input.email) });
    assert.equal(verified.status, 201, JSON.stringify(verified.data));
    assert.equal((await actor.request('/api/platform/state')).status, 200);
    const owner = service.auth.store.accountByIdentifier(input.login).platform_owner;
    return { ...actor, request: actor.request.bind(actor), account: verified.data.account, owner, input };
  }
  return { service, db: service.store.db, codes, client, register, advance: ms => { clock += ms; }, now: () => clock };
}

function candidateState(actor) {
  const state = createInitialState();
  const survey = { id: 'privacy-survey', date: new Date(initialTime).toISOString(), industry: 'ИТ',
    professionalRole: 'Frontend разработчик', specialization: 'Frontend', desiredGrade: 'Junior',
    experience: '1 год', stack: ['React'], softSkills: [], workHistory: 'Исходный опыт кандидата' };
  Object.assign(state.profile, survey, { id: 'candidate-anna', name: actor.input.name, email: actor.input.email,
    consent: true, visible: true, confirmed: null, surveyCompletedAt: survey.date });
  state.surveys = [survey];
  return state;
}

async function save(actor, state) {
  const previous = await actor.request('/api/platform/state');
  assert.equal(previous.status, 200);
  const response = await actor.request('/api/platform/state', 'PUT', { state, baseRevision: previous.data.revision });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  return response.data;
}

test('registration requires explicit consent to the current policy and records its original UTC time', async t => {
  const input = registration('privacy-version');
  for (const change of [{ consent: false }, { consent: 'true' }, { privacyVersion: undefined }, { privacyVersion: 'outdated' }]) {
    assert.throws(() => validateRegistration({ ...input, ...change }), error => error.status === 400);
  }
  const f = await fixture(t), actor = await f.register(input.login, 'candidate', 60_000);
  const event = f.db.prepare('SELECT * FROM privacy_consent_events WHERE owner=?').get(actor.owner);
  assert.equal(event.scope, 'registration');
  assert.equal(event.accepted, 1);
  assert.equal(event.policy_version, PRIVACY_POLICY_VERSION);
  assert.equal(event.occurred_at, new Date(initialTime).toISOString());
  const account = f.db.prepare('SELECT * FROM auth_accounts WHERE id=?').get(actor.account.id);
  assert.equal(account.created_at, new Date(initialTime + 60_000).toISOString());
});

test('questionnaire history is immutable while profile edits, new questionnaires and consent withdrawal remain possible', async t => {
  const f = await fixture(t), actor = await f.register('privacy-history');
  const original = await save(actor, candidateState(actor));
  for (const surveys of [[], [{ ...original.state.surveys[0], experience: '5 лет' }],
    [{ ...original.state.surveys[0], workHistory: 'Переписанный исходный опыт' }]]) {
    const denied = await actor.request('/api/platform/state', 'PUT', {
      state: { ...original.state, surveys }, baseRevision: original.revision,
    });
    assert.equal(denied.status, 403, JSON.stringify(denied.data));
    const unchanged = (await actor.request('/api/platform/state')).data;
    assert.equal(unchanged.revision, original.revision);
    assert.deepEqual(unchanged.state.surveys, original.state.surveys);
  }
  const current = structuredClone(original.state);
  current.profile.bio = 'Новый текст профиля';
  current.surveys.unshift({ ...current.surveys[0], id: 'privacy-new-survey', experience: '5 лет' });
  const updated = await save(actor, current);
  assert.equal(updated.state.profile.bio, current.profile.bio);
  assert.equal(updated.state.surveys.length, 2);
  assert.deepEqual(updated.state.surveys.find(item => item.id === 'privacy-survey'), original.state.surveys[0]);
  for (const consent of [true, false, false, true]) {
    f.advance(1000);
    current.profile.consent = consent;
    await save(actor, current);
  }
  const events = f.db.prepare("SELECT * FROM privacy_consent_events WHERE owner=? AND scope='profile' ORDER BY rowid").all(actor.owner);
  assert.deepEqual(events.map(event => event.accepted), [1, 0, 1]);
  assert(events.every(event => event.policy_version === PRIVACY_POLICY_VERSION && event.occurred_at.endsWith('Z')));
});

test('profile reset cannot erase immutable questionnaires while retaining an active account', async t => {
  const f = await fixture(t), actor = await f.register('privacy-reset');
  const original = await save(actor, candidateState(actor));
  const denied = await actor.request('/api/platform/state', 'DELETE');
  assert.equal(denied.status, 403, JSON.stringify(denied.data));
  const recovered = await actor.request('/api/platform/state');
  assert.equal(recovered.status, 200);
  assert.equal(recovered.data.revision, original.revision);
  assert.deepEqual(recovered.data.state, original.state);
  assert.equal((await actor.request('/api/auth/me')).status, 200);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM platform_surveys WHERE owner=?').get(actor.owner).n, 1);
});

test('verification requires renewed consent when a pending registration uses an old or unknown policy', async t => {
  const f = await fixture(t), actor = f.client();
  for (const [index, version] of ['outdated', null].entries()) {
    const input = registration('privacy-policy-change-' + index);
    assert.equal((await actor.request('/api/auth/register/request-code', 'POST', input)).status, 202);
    f.db.prepare('UPDATE auth_pending_registrations SET privacy_version=? WHERE email=?').run(version, input.email);
    const rejected = await actor.request('/api/auth/register/verify', 'POST', { email: input.email, code: f.codes.get(input.email) });
    assert.equal(rejected.status, 409, JSON.stringify(rejected.data));
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM auth_pending_registrations WHERE email=?').get(input.email).n, 0);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM auth_accounts WHERE email=?').get(input.email).n, 0);
  }
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM privacy_consent_events').get().n, 0);
});

test('account deletion without a saved profile still removes registration and every device session', async t => {
  const f = await fixture(t), actor = await f.register('privacy-empty');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM platform_accounts WHERE owner=?').get(actor.owner).n, 0);
  const second = f.client();
  assert.equal((await second.request('/api/auth/login', 'POST', { login: actor.input.login, password })).status, 200);
  assert.equal((await second.request('/api/platform/state')).status, 200);
  const wrong = await actor.request('/api/auth/account', 'DELETE', undefined, { 'X-Platform-Identity': 'auth:another-account' });
  assert.equal(wrong.status, 409);
  assert.equal((await actor.request('/api/auth/me')).status, 200);
  const deleted = await actor.request('/api/auth/account', 'DELETE');
  assert.equal(deleted.status, 200, JSON.stringify(deleted.data));
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM auth_accounts WHERE id=?').get(actor.account.id).n, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM auth_sessions WHERE account_id=?').get(actor.account.id).n, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM privacy_consent_events WHERE owner=?').get(actor.owner).n, 0);
  assert.equal((await second.request('/api/platform/state')).status, 401);
  assert.equal((await second.request('/api/auth/login', 'POST', { login: actor.input.login, password })).status, 401);
  const receipt = f.db.prepare('SELECT * FROM account_deletions').get();
  assert.deepEqual(Object.keys(receipt).sort(), ['deleted_at', 'id']);
  assert.equal(receipt.deleted_at, deleted.data.deletedAt);
  assert.match(receipt.id, /^[a-f0-9]{32}$/u);
});

test('failed account deletion rolls back history, sessions, external evidence and cross-account invitations', async t => {
  const f = await fixture(t), actor = await f.register('privacy-rollback'), employer = await f.register('privacy-employer', 'employer');
  const state = candidateState(actor);
  await save(actor, state);
  const started = await actor.request('/api/assessment/attempts', 'POST', { survey: state.surveys[0] });
  assert.equal(started.status, 201);
  const internal = f.service.store.get(started.data.id).attempt;
  const graded = await actor.request(`/api/assessment/attempts/${started.data.id}/submit`, 'POST', {
    token: started.data.token, answers: internal.questions.map(question => ({ questionId: question.id, optionId: question.correctOptionId })),
  });
  assert.equal(graded.status, 200);
  assert.equal(graded.data.passed, true);
  state.history = [graded.data];
  state.profile.confirmed = { specialization: graded.data.specialization, grade: graded.data.grade,
    score: graded.data.score, date: graded.data.date, surveyId: state.surveys[0].id };
  let snapshot = await save(actor, state);
  f.service.store.recordIntegrity(started.data.id, { id: 'privacy-copy', kind: 'copy_blocked' }, new Date(f.now()).toISOString());
  f.service.fsp.connect(actor.owner, { consent: true, scenario: 'achievements', baseRevision: snapshot.revision });
  await f.service.integrations.connect(actor.owner, 'privacy-fixture', { consent: true });
  await f.service.integrations.drain();
  const record = f.service.integrations.fspCatalog.search('Ромашов Федор').items[0];
  const claim = f.service.integrations.claims.submit(actor.owner, actor.account.id, {
    recordId: record.id, consent: true, statement: 'Изолированная проверка удаления материалов заявки.',
    links: ['https://materials.example.invalid/fixture'],
  });
  const publicId = f.service.directory.store.forOwner(actor.owner).id;
  const employerState = createInitialState();
  employerState.company.name = employer.input.companyName;
  employerState.company.contact = employer.input.email;
  employerState.invitations = [{ id: 'privacy-invitation', candidateId: publicId, companyId: employerState.company.id,
    company: employerState.company.name, title: 'Проверочное предложение', description: 'Изолированный пример',
    contact: employer.input.email, salaryFrom: 100000, salaryTo: 150000, status: 'sent', date: new Date(f.now()).toISOString() }];
  await save(employer, employerState);
  const counts = () => ({
    account: f.db.prepare('SELECT COUNT(*) AS n FROM auth_accounts WHERE id=?').get(actor.account.id).n,
    sessions: f.db.prepare('SELECT COUNT(*) AS n FROM auth_sessions WHERE account_id=?').get(actor.account.id).n,
    profile: f.db.prepare('SELECT COUNT(*) AS n FROM platform_accounts WHERE owner=?').get(actor.owner).n,
    surveys: f.db.prepare('SELECT COUNT(*) AS n FROM platform_surveys WHERE owner=?').get(actor.owner).n,
    attempts: f.db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE owner=?').get(actor.owner).n,
    integrity: f.db.prepare('SELECT COUNT(*) AS n FROM attempt_integrity_events WHERE attempt_id=?').get(started.data.id).n,
    consent: f.db.prepare('SELECT COUNT(*) AS n FROM privacy_consent_events WHERE owner=?').get(actor.owner).n,
    demo: f.db.prepare('SELECT COUNT(*) AS n FROM fsp_demo_connections WHERE owner=?').get(actor.owner).n,
    connections: f.db.prepare('SELECT COUNT(*) AS n FROM integration_connections WHERE owner=?').get(actor.owner).n,
    evidence: f.db.prepare('SELECT COUNT(*) AS n FROM integration_evidence').get().n,
    jobs: f.db.prepare('SELECT COUNT(*) AS n FROM integration_jobs WHERE owner=?').get(actor.owner).n,
    claims: f.db.prepare('SELECT COUNT(*) AS n FROM achievement_claims WHERE owner=?').get(actor.owner).n,
    audit: f.db.prepare('SELECT COUNT(*) AS n FROM achievement_claim_audit WHERE claim_id=?').get(claim.id).n,
    invitations: f.db.prepare('SELECT COUNT(*) AS n FROM platform_invitations WHERE candidate_id=?').get(publicId).n,
    receipts: f.db.prepare('SELECT COUNT(*) AS n FROM account_deletions').get().n,
  });
  const before = counts();
  assert(Object.entries(before).filter(([key]) => key !== 'receipts').every(([, value]) => value > 0), JSON.stringify(before));
  const employerRevision = (await employer.request('/api/platform/state')).data.revision;
  f.db.exec("CREATE TRIGGER privacy_failure BEFORE DELETE ON auth_accounts BEGIN SELECT RAISE(ABORT, 'isolated deletion failure'); END;");
  const failed = await actor.request('/api/auth/account', 'DELETE');
  assert.equal(failed.status, 500);
  assert.deepEqual(counts(), before);
  assert.equal((await actor.request('/api/auth/me')).status, 200);
  assert.equal((await employer.request('/api/platform/state')).data.revision, employerRevision);
  f.db.exec('DROP TRIGGER privacy_failure');
  const deleted = await actor.request('/api/auth/account', 'DELETE');
  assert.equal(deleted.status, 200, JSON.stringify(deleted.data));
  const after = counts();
  assert.equal(after.receipts, 1);
  delete after.receipts;
  assert(Object.values(after).every(value => value === 0), JSON.stringify(after));
  const remaining = await employer.request('/api/platform/state');
  assert(remaining.data.revision > employerRevision);
  assert.deepEqual(remaining.data.state.invitations, []);
});
