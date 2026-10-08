import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, existsSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAssessmentServer } from '../server.mjs';
import { createAttempt, evaluate } from '../assessment.mjs';
import { createInitialState } from '../../frontend/src/model.ts';

const city = 'Проверочный город анкеты';
const failure = status => error => error.status === status;
class PublicationEncoder {
  info = { status: 'ready', name: 'Publication access test encoder', version: 'unconfirmed-publication-test-v1',
    dimension: 2, trained: false, threshold: 0.35 };
  async start() { return this.info; }
  async encode(texts) { return texts.map(value => /^Frontend разработчик(?:\n|$)/u.test(value) ? [0, 1]
    : /ПОНИЖЕННАЯ СХОЖЕСТЬ/u.test(value) ? [0.6, 0.8] : [1, 0]); }
  close() {}
}
async function fixture(t, { dbPath = ':memory:', clearCatalog = true } = {}) {
  const codes = new Map();
  const service = createAssessmentServer({ dbPath, authEnv: {},
    authMailer: async ({ email, code }) => { codes.set(email, code); return { delivery: 'development' }; } });
  service.directory.encoder.close(); service.directory.encoder = new PublicationEncoder();
  if (clearCatalog) service.directory.store.db.prepare('DELETE FROM directory_candidates').run();
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  let closed = false;
  const close = async () => {
    if (closed) return; closed = true;
    await new Promise(resolve => { service.server.close(resolve); service.server.closeAllConnections(); });
  };
  t.after(close);
  const base = `http://127.0.0.1:${service.server.address().port}`;
  async function register(role, suffix) {
    const login = `unconfirmed.${suffix}`, email = `${login}@example.invalid`;
    await service.auth.requestRegistration({ role, login, email, password: 'Publication isolated 349!', consent: true,
      ...(role === 'candidate' ? { name: `Кандидат ${suffix}` } : { companyName: `Компания ${suffix}` }) },
    createHash('sha256').update(`isolated visitor ${suffix}`).digest('hex'));
    const account = service.auth.verifyRegistration({ email, code: codes.get(email) });
    const signed = service.auth.createSession(account);
    const owner = account.platform_owner;
    return { owner, account, login, email, name: `Кандидат ${suffix}`,
      async api(path, method = 'GET', input) {
        const response = await fetch(base + path, { method, headers: { Origin: base,
          Cookie: `predel_account_session=${signed.token}`, 'X-Platform-Identity': `auth:${account.id}`,
          ...(input === undefined ? {} : { 'Content-Type': 'application/json' }) },
          body: input === undefined ? undefined : JSON.stringify(input) });
        return { status: response.status, data: await response.json() };
      } };
  }
  return { service, register, base, close };
}
function candidateState(actor, changes = {}, { confirmed = false, correct = true } = {}, service) {
  const time = Date.now();
  const survey = { id: `survey-${actor.login}`, date: new Date(time).toISOString(), industry: 'ИТ',
    professionalRole: 'Frontend разработчик', specialization: 'Frontend', desiredGrade: 'Junior',
    experience: '1 год', stack: ['React', 'TypeScript'], softSkills: ['Работа в команде'] };
  const state = createInitialState();
  Object.assign(state.profile, survey, { id: 'candidate-anna', name: actor.name, email: actor.email,
    phone: '+7 000 000-00-00', city, consent: true, visible: true, bio: 'Создаю пользовательские формы.',
    surveyCompletedAt: survey.date });
  state.surveys = [survey];
  if (confirmed) {
    const attempt = createAttempt(survey, '', [], time);
    service.store.insert(attempt, actor.owner, 'isolated-publication-proof');
    const graded = evaluate(attempt, attempt.questions.map(question => ({ questionId: question.id,
      optionId: correct ? question.correctOptionId : question.options.find(item => item.id !== question.correctOptionId).id })), time + 1000);
    service.store.complete(attempt.id, graded.answerDigest, graded.result);
    state.history = [graded.result];
    if (correct) state.profile.confirmed = { specialization: graded.result.specialization, grade: graded.result.grade,
      score: graded.result.score, date: graded.result.date, surveyId: survey.id };
  }
  Object.assign(state.profile, changes);
  return state;
}
function saveCandidate(service, actor, changes, proof) {
  const saved = service.platform.save(actor.owner, candidateState(actor, changes, proof, service), 0, 'candidate');
  return { saved, id: service.directory.store.forOwner(actor.owner).id };
}
function saveEmployer(service, actor) {
  const state = createInitialState(); Object.assign(state.company, { name: `Компания ${actor.login}`, contact: actor.email });
  return service.platform.save(actor.owner, state, 0, 'employer');
}

test('published completed questionnaire is visible to an ordinary employer without inventing a confirmed grade or test score', async t => {
  const { service, register, base } = await fixture(t);
  const candidate = await register('candidate', 'visible');
  const employer = await register('employer', 'viewer');
  const { id } = saveCandidate(service, candidate);
  const found = await service.directory.search('', { city }, { owner: employer.owner });
  assert.equal(found.total, 1); assert.equal(found.items[0].person.id, id);
  assert.equal(found.items[0].person.confirmed, null); assert.equal(found.items[0].person.desiredGrade, 'Junior');
  assert.equal(found.items[0].explanation.category.status, 'unconfirmed');
  assert.equal(found.items[0].explanation.test.status, 'absent'); assert.equal(found.items[0].explanation.test.score, null);
  const row = service.directory.store.forOwner(candidate.owner);
  assert.equal(row.eligible, 1); assert.equal(row.grade, ''); assert.equal(row.score, 0);
  assert.deepEqual(found.categories, []);
  assert.equal(found.items[0].person.email, ''); assert.equal(found.items[0].person.phone, '');
  assert.equal((await fetch(base + '/api/directory/search')).status, 401);
  assert.equal((await candidate.api('/api/directory/search')).status, 403);
  assert.equal((await employer.api('/api/directory/search?filters=' + encodeURIComponent(JSON.stringify({ city })))).status, 200);
});

test('hidden, unconsented, incomplete and anonymous legacy questionnaires stay outside results and options', async t => {
  const { service, register } = await fixture(t);
  const employer = await register('employer', 'hidden.viewer');
  const publicActor = await register('candidate', 'public'); saveCandidate(service, publicActor);
  for (const [suffix, change] of [['hidden', { visible: false, city: 'Скрытый город' }],
    ['incomplete', { surveyCompletedAt: null, city: 'Неполный город' }],
    ['missing.role', { professionalRole: '', city: 'Город без роли' }],
    ['missing.skills', { stack: [], city: 'Город без навыков' }],
    ['missing.name', { name: '', city: 'Город без имени' }],
    ['stale.survey', { experience: '2 года', city: 'Город старой анкеты' }]]) {
    const actor = await register('candidate', suffix); saveCandidate(service, actor, change);
  }
  const revoked = await register('candidate', 'unconsented');
  let snapshot = saveCandidate(service, revoked, { city: 'Город без согласия' }).saved;
  snapshot.state.profile.consent = false; snapshot.state.profile.visible = false;
  service.platform.save(revoked.owner, snapshot.state, snapshot.revision, 'candidate');
  const legacy = candidateState(publicActor).profile;
  service.directory.store.upsert({ ...legacy, id: 'orphan-legacy-questionnaire', city: 'Анонимный город' }, 'expired-anonymous-session', true);
  const found = await service.directory.search('', {}, { owner: employer.owner });
  assert.deepEqual(found.items.map(item => item.person.name), [publicActor.name]);
  assert.deepEqual(service.directory.options(employer.owner).cities, [city]);
});

test('confirmed profiles precede unconfirmed profiles before pagination for filter and semantic searches', async t => {
  const { service, register } = await fixture(t);
  const employer = await register('employer', 'ordering.viewer');
  const a = await register('candidate', 'a.unconfirmed');
  const b = await register('candidate', 'b.confirmed');
  const c = await register('candidate', 'c.unconfirmed');
  const d = await register('candidate', 'd.confirmed');
  const ua = saveCandidate(service, a), uc = saveCandidate(service, c);
  const cb = saveCandidate(service, b, { bio: 'ПОНИЖЕННАЯ СХОЖЕСТЬ. Создаю пользовательские формы.' }, { confirmed: true });
  const cd = saveCandidate(service, d, { bio: 'ПОНИЖЕННАЯ СХОЖЕСТЬ. Создаю пользовательские формы.' }, { confirmed: true });
  for (const query of ['', 'Создавать пользовательские формы']) {
    const full = await service.directory.search(query, { city }, { owner: employer.owner });
    assert.equal(full.total, 4);
    assert(full.items.slice(0, 2).every(item => item.person.confirmed));
    assert(full.items.slice(2).every(item => item.person.confirmed === null));
    assert.equal(full.model.confirmationOrderPolicy.version, 'confirmed-first-stable-partition-v1');
    for (const [position, item] of full.items.entries()) {
      const priority = item.explanation.ordering.confirmationPriority;
      assert.equal(priority.applied, true);
      assert.equal(priority.mixedGroups, true);
      assert.equal(priority.group, position < 2 ? 'confirmed' : 'unconfirmed');
      assert.match(item.reason, position < 2 ? /подтверждённой категорией показаны первыми/u : /после кандидатов с подтверждённой/u);
    }
    if (query) assert(full.items.at(-1).semanticScore > full.items[0].semanticScore, 'Confirmation partition must apply even when unconfirmed cosine is higher');
    const pages = [];
    for (let offset = 0; offset < 4; offset++) {
      const page = await service.directory.search(query, { city }, { owner: employer.owner, offset, limit: 1 });
      assert.equal(page.total, 4); pages.push(page.items[0].person.id);
      assert.deepEqual(page.items[0].explanation, full.items[offset].explanation, 'Global priority is explained before pagination');
    }
    assert.deepEqual(pages, full.items.map(item => item.person.id));
    assert.deepEqual(new Set(full.items.map(item => item.person.id)), new Set([ua.id, uc.id, cb.id, cd.id]));
    assert.equal(full.categories.length, 1); assert.equal(full.categories[0].count, 2);
    assert(full.categories[0].candidateIds.every(id => [cb.id, cd.id].includes(id)));
    const narrowed = await service.directory.search(query, { city }, { owner: employer.owner,
      category: { specialization: 'Frontend', grade: 'Junior' } });
    assert.equal(narrowed.total, 2); assert(narrowed.items.every(item => item.person.confirmed));
  }
  for (const filter of [{ grade: 'Junior' }, { minScore: 1 }]) {
    const result = await service.directory.search('', { city, ...filter }, { owner: employer.owner });
    assert.equal(result.total, 2); assert(result.items.every(item => item.person.confirmed));
  }
});

test('failed or forged test history and FSP flags never create a public confirmation', async t => {
  const { service, register } = await fixture(t);
  const employer = await register('employer', 'proof.viewer');
  const actual = await register('candidate', 'actual.proof');
  const real = saveCandidate(service, actual, {}, { confirmed: true });
  const forged = await register('candidate', 'forged.proof');
  const state = candidateState(forged);
  state.profile.confirmed = structuredClone(real.saved.state.profile.confirmed);
  state.profile.fspId = 'CLAIMED-FSP-ID';
  state.profile.achievements = [{ title: 'Поддельное достижение', result: 'Победитель', year: '2026' }];
  state.profile.fspEvidence = { mode: 'live', identityVerified: true, activeCount: 100 };
  state.history = [...real.saved.state.history, { id: 'invented-successful-attempt', passed: true, score: 100 }];
  const saved = service.platform.save(forged.owner, state, 0, 'candidate');
  assert.equal(saved.state.history.length, 0);
  const row = service.directory.store.forOwner(forged.owner);
  assert.equal(row.eligible, 1); assert.equal(row.grade, ''); assert.equal(row.score, 0); assert.equal(row.fsp, 0);
  const person = JSON.parse(row.public_payload);
  assert.equal(person.confirmed, null); assert.deepEqual(person.achievements, []); assert.equal(person.fspEvidence, undefined);
  const failed = await register('candidate', 'failed.proof');
  saveCandidate(service, failed, {}, { confirmed: true, correct: false });
  const result = await service.directory.search('', { city }, { owner: employer.owner });
  assert.equal(result.total, 3); assert(result.items.find(item => item.person.id === row.id).person.confirmed === null);
  assert.equal(result.items.find(item => item.person.name === failed.name).person.confirmed, null);
  assert.equal(result.categories[0].count, 1);
  const fsp = await service.fsp.connect(forged.owner, { baseRevision: saved.revision, consent: true });
  assert.equal(fsp.profile.fspEvidence.mode, 'demo');
  const after = service.directory.store.forOwner(forged.owner);
  assert.equal(JSON.parse(after.public_payload).confirmed, null); assert.equal(after.score, 0); assert.equal(after.grade, '');
});

test('unconfirmed visibility does not open contacts; only the candidate accepts an invitation', async t => {
  const { service, register } = await fixture(t);
  const candidate = await register('candidate', 'invitation.recipient');
  const other = await register('candidate', 'invitation.stranger');
  const employer = await register('employer', 'invitation.sender');
  const { id } = saveCandidate(service, candidate);
  let sender = saveEmployer(service, employer);
  assert.throws(() => service.platform.contacts(employer.owner, id), failure(403));
  assert.throws(() => service.platform.contacts(other.owner, id), failure(404));
  sender.state.invitations.push({ id: `invitation-${randomUUID()}`, candidateId: id, companyId: 'company-line',
    company: 'Компания проверки', title: 'Frontend разработчик', description: 'Разрабатывать пользовательские формы.',
    contact: employer.email, salaryFrom: 100000, salaryTo: 150000, status: 'sent', date: new Date().toISOString() });
  sender = service.platform.save(employer.owner, sender.state, sender.revision, 'employer');
  assert.equal(sender.state.invitations.length, 1);
  assert.throws(() => service.platform.contacts(employer.owner, id), failure(403));
  sender.state.invitations[0].status = 'accepted';
  assert.throws(() => service.platform.save(employer.owner, sender.state, sender.revision, 'employer'), failure(403));
  const recipient = service.platform.read(candidate.owner);
  assert.equal(recipient.state.profile.confirmed, null); assert.equal(recipient.state.invitations.length, 1);
  recipient.state.invitations[0].status = 'accepted';
  service.platform.save(candidate.owner, recipient.state, recipient.revision, 'candidate');
  assert.equal(service.platform.contacts(employer.owner, id).email, candidate.email);
});

test('local fixture realms remain isolated when completed unconfirmed questionnaires are published', async t => {
  const { service, register } = await fixture(t);
  const ordinary = await register('employer', 'ordinary.realm');
  const actual = await register('candidate', 'ordinary.candidate'); saveCandidate(service, actual);
  // Use authenticated fixture tuples without touching live demo accounts.
  const localCandidate = await register('candidate', 'local.candidate');
  const localEmployer = await register('employer', 'local.employer');
  service.auth.store.db.prepare('UPDATE auth_accounts SET login=?,login_normalized=?,email=? WHERE id=?')
    .run('local_candidate', 'local_candidate', 'candidate@local.example.test', localCandidate.account.id);
  service.auth.store.db.prepare('UPDATE auth_accounts SET login=?,login_normalized=?,email=? WHERE id=?')
    .run('local_employer', 'local_employer', 'employer@local.example.test', localEmployer.account.id);
  saveCandidate(service, localCandidate);
  const ordinaryResult = await service.directory.search('', { city }, { owner: ordinary.owner });
  const localResult = await service.directory.search('', { city }, { owner: localEmployer.owner });
  assert.deepEqual(ordinaryResult.items.map(item => item.person.name), [actual.name]);
  assert.deepEqual(localResult.items.map(item => item.person.name), [localCandidate.name]);
  assert.equal(localResult.items[0].person.synthetic, true);
});

test('startup backfill republishes a completed questionnaire while stripping an old unproved public category', async t => {
  const directoryPath = mkdtempSync(join(tmpdir(), 'predel-unconfirmed-'));
  const dbPath = join(directoryPath, 'profiles.sqlite');
  let first, second;
  t.after(async () => {
    await second?.close(); await first?.close();
    for (const suffix of ['', '-wal', '-shm']) if (existsSync(dbPath + suffix)) unlinkSync(dbPath + suffix);
    rmdirSync(directoryPath);
  });
  first = await fixture(t, { dbPath });
  const candidate = await first.register('candidate', 'startup.candidate');
  const employer = await first.register('employer', 'startup.viewer');
  const saved = saveCandidate(first.service, candidate, { confirmed: { specialization: 'Frontend', grade: 'Senior', score: 100,
    date: new Date().toISOString() } }).saved;
  const id = first.service.directory.store.forOwner(candidate.owner).id;
  first.service.directory.store.upsert({ ...saved.state.profile, id }, candidate.owner, false);
  assert.equal(first.service.directory.store.get(id).eligible, 0); assert.equal(first.service.directory.store.get(id).score, 100);
  const privateClaim = saved.state.profile.confirmed;
  await first.close();
  second = await fixture(t, { dbPath, clearCatalog: false });
  const row = second.service.directory.store.get(id);
  assert.equal(row.eligible, 1); assert.equal(row.score, 0); assert.equal(row.grade, '');
  assert.equal(JSON.parse(row.public_payload).confirmed, null);
  assert.deepEqual(second.service.platform.read(candidate.owner).state.profile.confirmed, privateClaim);
  const result = await second.service.directory.search('', { city }, { owner: employer.owner });
  assert(result.items.some(item => item.person.id === id && item.person.confirmed === null));
  await second.close();
});
