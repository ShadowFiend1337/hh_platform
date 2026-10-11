import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DirectoryStore } from '../directory-store.mjs';
import { PlatformService } from '../platform.mjs';
import { openStore } from '../store.mjs';
import { createAttempt, evaluate } from '../assessment.mjs';
import { defaultSearchFilters } from '../../shared/search.ts';
import { createInitialState } from '../../frontend/src/model.ts';

const time = Date.parse('2026-10-06T09:00:00.000Z');
const date = new Date(time).toISOString();
const ownerA = '11111111111111111111111111111111';
const ownerB = '22222222222222222222222222222222';
const ownerC = '33333333333333333333333333333333';
const idA = `user-${ownerA.slice(0, 20)}`;
const idB = `user-${ownerB.slice(0, 20)}`;
function initial() {
  return { version: 2,
    profile: { id: 'candidate-anna', name: '', email: '', phone: '', specialization: 'Frontend', desiredGrade: 'Junior',
      confirmed: null, stack: [], industry: '', professionalRole: '', softSkills: [], surveyCompletedAt: null,
      experience: '', city: '', format: 'Удалённо', bio: '', careerAchievements: '', education: '', workHistory: '',
      portfolio: '', languages: '', fspId: '', achievements: [], visible: false, consent: false },
    company: { id: 'company-line', name: 'Учебная компания', industry: 'ИТ', website: 'https://example.com',
      contact: 'employer@example.com', description: 'Вымышленная компания для теста.' },
    invitations: [], history: [], surveys: [], savedSearches: [] };
}
function fixture(t, seeds = []) {
  const store = new DirectoryStore(':memory:', seeds);
  const assessments = openStore(':memory:');
  let clock = time;
  const platform = new PlatformService(store, assessments, { now: () => clock });
  t.after(() => { assessments.close(); store.close(); });
  return { store, assessments, platform, setTime: value => { clock = value; } };
}
function completed(assessments, owner, { grade = 'Junior', passed = true, at = time, id = `survey-${owner.slice(0, 2)}-${at}`, score = 100 } = {}) {
  const survey = { id, date: new Date(at).toISOString(), industry: 'ИТ', professionalRole: 'Frontend разработчик',
    specialization: 'Frontend', desiredGrade: grade, experience: '3 года 4 месяца', stack: ['React', 'TypeScript'], softSkills: [] };
  const attempt = createAttempt(survey, '', [], at);
  assessments.insert(attempt, owner, 'not-a-public-token');
  let correctCount = passed ? score === 83 ? 10 : 12 : 0;
  const answers = attempt.questions.map(question => ({ questionId: question.id,
    optionId: correctCount-- > 0 ? question.correctOptionId : question.options.find(option => option.id !== question.correctOptionId).id }));
  const evaluated = evaluate(attempt, answers, at + 1000);
  assessments.complete(attempt.id, evaluated.answerDigest, evaluated.result);
  return { survey, result: evaluated.result };
}
function candidateState(proof, { email = 'candidate@example.com', name = 'Тестовый Кандидат' } = {}) {
  const state = initial();
  state.surveys = [proof.survey]; state.history = [proof.result];
  state.profile = { ...state.profile, ...proof.survey, id: 'candidate-anna', name, email, phone: '+7 000 000-00-00',
    bio: 'Делаю доступные интерфейсы.', workHistory: `Вымышленный проект. Для личной связи ${email}.`,
    surveyCompletedAt: proof.survey.date, visible: true, consent: true,
    confirmed: { specialization: proof.result.specialization, grade: proof.result.grade, score: proof.result.score,
      date: proof.result.date, surveyId: proof.survey.id } };
  delete state.profile.date;
  return state;
}
function invitation(candidateId, id = 'invitation-test') {
  return { id, candidateId, companyId: 'stolen-company', company: 'Чужая компания', title: 'Frontend разработчик',
    description: 'Вымышленное предложение: разрабатывать формы и кабинет.', contact: 'employer@example.com',
    salaryFrom: 120000, salaryTo: 180000, status: 'sent', date: '1900-01-01' };
}
function errorStatus(status) { return error => error.status === status; }

test('SQLite owns state, account identities and saved search order; raw files never enter snapshots', t => {
  const { platform, store, assessments } = fixture(t);
  assert.deepEqual(platform.read(ownerA), { state: null, revision: 0, directoryPeople: [] });
  const state = initial();
  state.profile.id = 'demo-embedded-1'; state.company.id = 'company-somebody';
  state.savedSearches = [
    { id: 'search-b', title: 'Электроника', query: 'Объяснить устройство платы', filters: { ...defaultSearchFilters, specialization: 'Embedded', salaryMax: 200000 } },
    { id: 'search-a', title: 'Удалённо', query: '', filters: { ...defaultSearchFilters, format: 'Удалённо' } },
  ];
  const saved = platform.save(ownerA, state, 0);
  assert.equal(saved.revision, 1);
  assert.equal(saved.state.profile.id, 'candidate-anna'); assert.equal(saved.state.company.id, 'company-line');
  assert.equal(store.forOwner(ownerA).id, idA);
  const recovered = new PlatformService(store, assessments).read(ownerA);
  assert.deepEqual(recovered.state.savedSearches.map(item => item.id), ['search-b', 'search-a']);
  assert.equal(recovered.state.savedSearches[0].filters.specialization, 'Embedded');
  assert.throws(() => platform.save(ownerA, { ...state, resumeFile: 'raw PDF bytes' }, 1), errorStatus(400));
  assert.equal(platform.read(ownerA).revision, 1);
});

test('compare-and-swap rejects stale tabs and failed transactions leave their prior snapshot intact', t => {
  const { platform, store } = fixture(t);
  const saved = platform.save(ownerA, initial(), 0);
  const changed = structuredClone(saved.state); changed.company.name = 'Новое имя';
  platform.save(ownerA, changed, 1);
  assert.throws(() => platform.save(ownerA, saved.state, 1), errorStatus(409));
  const invalid = platform.read(ownerA).state;
  invalid.invitations.push(invitation('does-not-exist'));
  assert.throws(() => platform.save(ownerA, invalid, 2), errorStatus(404));
  assert.equal(platform.read(ownerA).revision, 2);
  assert.equal(platform.read(ownerA).state.company.name, 'Новое имя');
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM platform_invitations').get().n, 0);
});

test('private profile creation needs consent even when an empty company account already exists', t => {
  const { platform, assessments } = fixture(t);
  const personal = initial(); personal.profile.name = 'Тестовый Кандидат'; personal.profile.email = 'test@example.com';
  assert.throws(() => platform.save(ownerA, personal, 0), errorStatus(400));
  assert.equal(platform.read(ownerA).state, null);
  platform.save(ownerA, initial(), 0);
  assert.throws(() => platform.save(ownerA, personal, 1), errorStatus(400));
  const hiddenSurvey = initial(); hiddenSurvey.surveys = [completed(assessments, ownerA).survey];
  assert.throws(() => platform.save(ownerA, hiddenSurvey, 1), errorStatus(400), 'A blank profile cannot bypass consent through its survey collection');
  personal.profile.consent = true;
  const saved = platform.save(ownerA, personal, 1);
  saved.state.profile.consent = false;
  const revoked = platform.save(ownerA, saved.state, saved.revision);
  assert.equal(revoked.state.profile.email, 'test@example.com');
});

test('forged history, another session proof, FSP badges and synthetic flags cannot confirm a published questionnaire', t => {
  const { platform, store, assessments } = fixture(t);
  const stolen = completed(assessments, ownerB);
  const state = candidateState(stolen);
  state.profile.fspId = 'REAL-FSP'; state.profile.achievements = [{ title: 'Чемпион', result: 'Победитель', year: '2026' }];
  state.profile.synthetic = true;
  const saved = platform.save(ownerA, state, 0);
  assert.equal(saved.state.profile.confirmed.grade, 'Junior', 'Unverifiable legacy data may remain private');
  assert.deepEqual(saved.state.history, []);
  assert.equal(saved.state.profile.fspId, 'REAL-FSP', 'A self-reported external ID does not grant verified achievements');
  assert.deepEqual(saved.state.profile.achievements, []);
  assert.equal(saved.state.profile.synthetic, false);
  assert.equal(store.forOwner(ownerA).eligible, 1, 'A completed questionnaire is publishable as self-reported');
  assert.equal(store.forOwner(ownerA).grade, '');
  assert.equal(store.forOwner(ownerA).score, 0);
  assert.equal(JSON.parse(store.forOwner(ownerA).public_payload).confirmed, null);
  assert.equal(store.matching(defaultSearchFilters).length, 1);
});

test('external federation IDs persist and changing one clears server-owned evidence', t => {
  const { platform, store } = fixture(t);
  const state = initial();
  state.profile.consent = true;
  state.profile.fspId = 'participant-first';
  const first = platform.save(ownerA, state, 0, 'candidate');
  assert.equal(platform.read(ownerA).state.profile.fspId, 'participant-first');
  const stored = store.db.prepare('SELECT profile FROM platform_accounts WHERE owner=?').get(ownerA);
  const withEvidence = JSON.parse(stored.profile);
  withEvidence.achievements = [{ title: 'Серверное достижение', result: 'Участник', year: '2026' }];
  store.db.prepare('UPDATE platform_accounts SET profile=? WHERE owner=?').run(JSON.stringify(withEvidence), ownerA);
  const changed = structuredClone(first.state);
  changed.profile.fspId = 'participant-second';
  const second = platform.save(ownerA, changed, first.revision, 'candidate');
  assert.equal(second.state.profile.fspId, 'participant-second');
  assert.deepEqual(second.state.profile.achievements, []);
  const invalid = structuredClone(second.state);
  invalid.profile.fspId = 'x'.repeat(101);
  assert.throws(() => platform.save(ownerA, invalid, second.revision, 'candidate'), errorStatus(400));
  assert.equal(platform.read(ownerA).state.profile.fspId, 'participant-second');
});

test('published grade and score come from a passed owned result; contacts stay out of directory payload', t => {
  const { platform, store, assessments } = fixture(t);
  const proof = completed(assessments, ownerA, { score: 83 });
  const state = candidateState(proof); state.profile.confirmed.score = 100;
  state.history[0] = { ...proof.result, score: 100, passed: true };
  const saved = platform.save(ownerA, state, 0);
  assert.equal(saved.state.profile.confirmed.score, 83);
  assert.equal(saved.state.history[0].score, 83);
  assert.equal(saved.state.profile.experienceMonths, 40);
  assert.equal(store.forOwner(ownerA).eligible, 1);
  const publicPayload = JSON.parse(store.forOwner(ownerA).public_payload);
  assert.equal(publicPayload.email, ''); assert.equal(publicPayload.phone, '');
  assert(!JSON.stringify(publicPayload).includes(state.profile.email));
  assert.deepEqual(platform.contacts(ownerA, 'candidate-anna'), { email: state.profile.email, phone: state.profile.phone });
  assert.throws(() => platform.contacts(ownerB, idA), errorStatus(403));
});

test('a failed later attempt preserves the passed category; history is reconstructed from server completions', t => {
  const { platform, store, assessments, setTime } = fixture(t);
  const passed = completed(assessments, ownerA);
  platform.save(ownerA, candidateState(passed), 0);
  setTime(time + 10000);
  const failed = completed(assessments, ownerA, { grade: 'Middle', passed: false, at: time + 10000 });
  const input = platform.read(ownerA).state;
  input.profile.confirmed = null; input.profile.desiredGrade = 'Middle';
  input.surveys.push(failed.survey); input.history = [];
  const saved = platform.save(ownerA, input, 1);
  assert.equal(saved.state.profile.confirmed.grade, 'Junior');
  assert.equal(saved.state.profile.confirmed.date, passed.result.date);
  assert.equal(saved.state.history.length, 2); assert(saved.state.history.some(item => !item.passed));
  assert.equal(store.forOwner(ownerA).eligible, 1);
});

test('a passed category outlives the limited recent history without exposing its private proof reference', t => {
  const { platform, store, assessments } = fixture(t);
  const passed = completed(assessments, ownerA);
  platform.save(ownerA, candidateState(passed), 0);
  completed(assessments, ownerA, { passed: false, at: time + 10000 });
  const limited = new PlatformService(store, { ...assessments,
    completed: owner => assessments.completed(owner).filter(row => row.id !== passed.result.id) }, { now: () => time + 10000 });
  const current = limited.read(ownerA);
  assert.equal(current.state.history.length, 1);
  assert.equal(current.state.profile._proofId, undefined);
  const saved = limited.save(ownerA, current.state, current.revision);
  assert.equal(saved.state.profile.confirmed.grade, 'Junior');
  assert.equal(store.forOwner(ownerA).eligible, 1);
  assert(!Object.hasOwn(saved.state.profile, '_proofId'));
  assert(!store.forOwner(ownerA).public_payload.includes('_proofId'));
});

test('a category switch cannot bypass the server 90 day boundary by forging gradeChangedAt', t => {
  const { platform, assessments, setTime } = fixture(t);
  // The interval applies to all passing scores.
  const first = completed(assessments, ownerA, { score: 83 });
  const original = platform.save(ownerA, candidateState(first), 0);
  const second = completed(assessments, ownerA, { grade: 'Middle', at: time + 5000, score: 83 });
  const input = candidateState(second); input.profile.gradeChangedAt = '1900-01-01';
  input.surveys.push(...original.state.surveys);
  assert.throws(() => platform.save(ownerA, input, 1), errorStatus(409));
  assert.equal(platform.read(ownerA).state.profile.confirmed.grade, 'Junior');
  setTime(time + 90 * 86400000);
  const saved = platform.save(ownerA, input, 1);
  assert.equal(saved.state.profile.confirmed.grade, 'Middle');
  assert.equal(saved.state.profile.confirmed.date, second.result.date);
  assert.equal(saved.state.profile.gradeChangedAt, new Date(time + 90 * 86400000).toISOString());
  const anotherOldProof = completed(assessments, ownerA, { grade: 'Senior', at: time + 15000 });
  setTime(time + 90 * 86400000 + 100000);
  const replay = candidateState(anotherOldProof); replay.surveys.push(...saved.state.surveys);
  assert.throws(() => platform.save(ownerA, replay, saved.revision), errorStatus(409),
    'Replaying a second old proof cannot cause another immediate category change');
});

test('consecutive confident results cannot promote Junior to Senior within the change interval', t => {
  const { platform, assessments, setTime } = fixture(t);
  const junior = completed(assessments, ownerA);
  const saved = platform.save(ownerA, candidateState(junior), 0);
  assert.equal(saved.state.profile.confirmed.score, 100);
  const senior = completed(assessments, ownerA, { grade: 'Senior', at: time + 4000 });
  const skip = candidateState(senior); skip.surveys.push(...saved.state.surveys);
  assert.throws(() => platform.save(ownerA, skip, saved.revision), errorStatus(409));
  const middle = completed(assessments, ownerA, { grade: 'Middle', at: time + 5000 });
  const next = candidateState(middle); next.surveys.push(...saved.state.surveys);
  next.profile.gradeChangedAt = '1900-01-01';
  setTime(time + 90 * 86400000 - 1);
  assert.throws(() => platform.save(ownerA, next, saved.revision), errorStatus(409));
  assert.equal(platform.read(ownerA).state.profile.confirmed.grade, 'Junior');
  setTime(time + 90 * 86400000);
  const promoted = platform.save(ownerA, next, saved.revision);
  assert.equal(promoted.state.profile.confirmed.grade, 'Middle');
  assert.equal(promoted.state.profile.gradeChangedAt, new Date(time + 90 * 86400000).toISOString());
  assert.equal(promoted.state.profile.confirmed.score, 100);
  const again = candidateState(senior); again.surveys.push(...promoted.state.surveys);
  again.profile.gradeChangedAt = '1900-01-01';
  setTime(time + 180 * 86400000 - 1);
  assert.throws(() => platform.save(ownerA, again, promoted.revision), errorStatus(409));
  assert.equal(platform.read(ownerA).state.profile.confirmed.grade, 'Middle');
  setTime(time + 180 * 86400000);
  const final = platform.save(ownerA, again, promoted.revision);
  assert.equal(final.state.profile.confirmed.grade, 'Senior');
  assert.equal(final.state.profile.gradeChangedAt, new Date(time + 180 * 86400000).toISOString());
});

test('first assignment uses server time even for an old proof; repeating the same category does not restart the interval', t => {
  const { platform, assessments, setTime } = fixture(t);
  const old = completed(assessments, ownerA, { at: time - 100 * 86400000, score: 83 });
  const saved = platform.save(ownerA, candidateState(old), 0);
  assert.equal(saved.state.profile.confirmed.date, old.result.date);
  assert.equal(saved.state.profile.gradeChangedAt, date);
  const otherOld = completed(assessments, ownerA, { grade: 'Middle', at: time - 99 * 86400000 });
  const change = candidateState(otherOld); change.surveys.push(...saved.state.surveys);
  assert.throws(() => platform.save(ownerA, change, saved.revision), errorStatus(409));
  setTime(time + 11000);
  const repeated = completed(assessments, ownerA, { at: time + 10000 });
  const repeat = candidateState(repeated); repeat.surveys.push(...saved.state.surveys);
  const next = platform.save(ownerA, repeat, saved.revision);
  assert.equal(next.state.profile.confirmed.date, repeated.result.date);
  assert.equal(next.state.profile.gradeChangedAt, date);
});

test('new invitations use the sender account and server time and require an available recipient', t => {
  const { platform, assessments } = fixture(t);
  const proof = completed(assessments, ownerB);
  platform.save(ownerB, candidateState(proof, { email: 'recipient@example.com' }), 0);
  const employer = initial(); employer.company.name = 'Моя компания'; employer.invitations = [invitation(idB)];
  const saved = platform.save(ownerA, employer, 0);
  const invite = saved.state.invitations[0];
  assert.equal(invite.company, 'Моя компания'); assert.equal(invite.companyId, 'company-line'); assert.equal(invite.date, date);
  assert.equal(invite.candidateId, idB); assert.equal(invite.status, 'sent');
  assert.equal(saved.directoryPeople.length, 1); assert.equal(saved.directoryPeople[0].email, '');
  assert.equal(platform.read(ownerB).revision, 2, 'Recipient tabs are invalidated by a new invitation');
  const accepted = initial(); accepted.invitations = [invitation(idB, 'forged-acceptance')]; accepted.invitations[0].status = 'accepted';
  assert.throws(() => platform.save(ownerC, accepted, 0), errorStatus(403));
  assert.equal(platform.read(ownerC).state, null, 'An invalid creation rolls back its account insertion');
});

test('only the recipient can view or answer an invitation; contacts require its accepted answer', t => {
  const { platform, assessments } = fixture(t);
  const proof = completed(assessments, ownerB);
  const person = candidateState(proof, { email: 'recipient@example.com' });
  person.profile.portfolio = 'https://example.com/private-portfolio';
  platform.save(ownerB, person, 0);
  const employer = initial(); employer.invitations = [invitation(idB)];
  platform.save(ownerA, employer, 0);
  const forged = platform.read(ownerA).state; forged.invitations[0].status = 'accepted';
  assert.throws(() => platform.save(ownerA, forged, 1), errorStatus(403));
  assert.throws(() => platform.contacts(ownerA, idB), errorStatus(403));
  assert.equal(platform.read(ownerA).directoryPeople.find(item => item.id === idB).portfolio, '');
  let recipient = platform.read(ownerB);
  assert.equal(recipient.state.invitations[0].candidateId, 'candidate-anna');
  recipient.state.invitations[0].status = 'viewed';
  recipient = platform.save(ownerB, recipient.state, recipient.revision);
  assert.equal(platform.read(ownerA).state.invitations[0].status, 'viewed');
  recipient.state.invitations[0].status = 'accepted';
  recipient = platform.save(ownerB, recipient.state, recipient.revision);
  assert.equal(platform.read(ownerA).state.invitations[0].status, 'accepted');
  assert.deepEqual(platform.contacts(ownerA, idB), { email: 'recipient@example.com', phone: '+7 000 000-00-00', portfolio: person.profile.portfolio });
  assert.throws(() => platform.contacts(ownerC, idB), errorStatus(403));
  const tampered = platform.read(ownerA); tampered.state.invitations[0].salaryFrom = 1;
  assert.throws(() => platform.save(ownerA, tampered.state, tampered.revision), errorStatus(403));
  recipient.state.invitations[0].status = 'rejected';
  assert.throws(() => platform.save(ownerB, recipient.state, recipient.revision), errorStatus(403));
});

test('consent revocation removes publication and contact access while retaining the private account until deletion', t => {
  const { platform, store, assessments } = fixture(t);
  const proof = completed(assessments, ownerB);
  platform.save(ownerB, candidateState(proof, { email: 'recipient@example.com' }), 0);
  const employer = initial(); employer.invitations = [invitation(idB)]; platform.save(ownerA, employer, 0);
  let recipient = platform.read(ownerB); recipient.state.invitations[0].status = 'accepted';
  recipient = platform.save(ownerB, recipient.state, recipient.revision);
  recipient.state.profile.consent = false;
  platform.save(ownerB, recipient.state, recipient.revision);
  assert.throws(() => platform.contacts(ownerA, idB), errorStatus(403));
  assert.equal(store.matching(defaultSearchFilters).length, 0);
  assert.equal(platform.read(ownerA).directoryPeople.length, 0);
  assert.equal(platform.read(ownerB).state.profile.email, 'recipient@example.com');
});

test('account deletion removes related invitations, private collections, indexes and assessment data, preserving other accounts', t => {
  const { platform, store, assessments } = fixture(t);
  const proof = completed(assessments, ownerB);
  const candidate = candidateState(proof); candidate.savedSearches = [{ id: 's', title: 'Поиск', query: '', filters: defaultSearchFilters }];
  platform.save(ownerB, candidate, 0);
  const employer = initial(); employer.invitations = [invitation(idB)]; platform.save(ownerA, employer, 0);
  const activeB = createAttempt(proof.survey, '', [], time + 10000);
  const activeA = createAttempt({ ...proof.survey, id: 'other-active-survey' }, '', [], time + 10000);
  assessments.insert(activeB, ownerB, 'private-token-b');
  assessments.insert(activeA, ownerA, 'private-token-a');
  store.putVector(store.forOwner(ownerB), 'test', [1, 0, 0]);
  const senderRevision = platform.read(ownerA).revision;
  assert.deepEqual(platform.delete(ownerB), { state: null, revision: 0, directoryPeople: [] });
  assert.equal(store.get(idB), undefined);
  for (const table of ['platform_surveys', 'platform_searches', 'platform_invitations', 'directory_vectors', 'directory_skills', 'directory_languages']) {
    assert.equal(store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, table);
  }
  assert.equal(assessments.get(proof.result.id), null);
  assert.equal(assessments.get(activeB.id), null);
  assert(assessments.get(activeA.id));
  assert.equal(assessments.get(activeA.id).owner, ownerA);
  assert.equal(platform.read(ownerB).state, null);
  assert(platform.read(ownerA).state); assert.equal(platform.read(ownerA).revision, senderRevision + 1);
  assert.deepEqual(platform.read(ownerA).state.invitations, []);
  assert.throws(() => platform.contacts(ownerA, idB), errorStatus(404));
});

test('bounded validation rejects malformed values without losing a long permitted work history', t => {
  const { platform, assessments } = fixture(t);
  const proof = completed(assessments, ownerA);
  const state = candidateState(proof); state.profile.workHistory = 'Учебный опыт. '.repeat(1000);
  const saved = platform.save(ownerA, state, 0);
  assert.equal(saved.state.profile.workHistory, state.profile.workHistory.trim());
  for (const mutate of [
    value => { value.profile.salaryFrom = -1; },
    value => { value.profile.salaryFrom = 200000; value.profile.salaryTo = 100000; },
    value => { value.profile.experienceMonths = 0.5; },
    value => { value.profile.languageCodes = ['xx']; },
    value => { value.profile.availableFrom = '2026-02-31'; },
    value => { value.profile.portfolio = 'javascript:alert(1)'; },
    value => { value.profile.workHistory = 'x'.repeat(20001); },
    value => { value.surveys = [value.surveys[0], value.surveys[0]]; },
    value => { value.savedSearches = [{ id: 'bad', title: 'Bad', query: '', filters: { ...defaultSearchFilters, minScore: 101 } }]; },
  ]) {
    const invalid = structuredClone(saved.state); mutate(invalid);
    assert.throws(() => platform.save(ownerA, invalid, saved.revision), errorStatus(400));
  }
  assert.equal(platform.read(ownerA).revision, saved.revision);
});

test('candidate decisions survive SQLite reopen and do not send invitations or disclose contacts', t => {
  const path = join(tmpdir(), `predel-decisions-${randomUUID()}.sqlite`);
  let store = new DirectoryStore(path);
  const assessments = openStore(':memory:');
  t.after(() => {
    assessments.close(); store.close();
    for (const suffix of ['', '-wal', '-shm']) if (existsSync(path + suffix)) unlinkSync(path + suffix);
  });
  let platform = new PlatformService(store, assessments, { now: () => time });
  const proof = completed(assessments, ownerB);
  platform.save(ownerB, candidateState(proof, { email: 'private@example.com' }), 0);
  const employer = initial();
  employer.candidateDecisions = [{ candidateId: idB, decision: 'liked', date: '1900-01-01' }];
  const saved = platform.save(ownerA, employer, 0);
  assert.deepEqual(saved.state.candidateDecisions, [{ candidateId: idB, decision: 'liked', date }]);
  assert.deepEqual(saved.state.invitations, []);
  assert.equal(saved.directoryPeople[0].email, '');
  assert.equal(saved.directoryPeople[0].phone, '');
  assert(!JSON.stringify(saved.directoryPeople).includes('private@example.com'));
  assert.throws(() => platform.contacts(ownerA, idB), errorStatus(403));
  store.close(); store = new DirectoryStore(path);
  platform = new PlatformService(store, assessments);
  assert.deepEqual(platform.read(ownerA).state.candidateDecisions, saved.state.candidateDecisions);
  assert.deepEqual(platform.read(ownerB).state.candidateDecisions, []);
  assert.equal(store.forOwner(ownerB).eligible, 1, 'Decisions do not alter candidate qualification');
});

test('candidate decisions are owned separately; undo and a replacement keep unrelated collections', t => {
  const { platform, assessments, setTime } = fixture(t);
  platform.save(ownerB, candidateState(completed(assessments, ownerB)), 0);
  const employer = initial();
  employer.savedSearches = [{ id: 'kept-search', title: 'Поиск', query: '', filters: defaultSearchFilters }];
  employer.candidateDecisions = [{ candidateId: idB, decision: 'liked', date }];
  let saved = platform.save(ownerA, employer, 0);
  const other = initial(); other.candidateDecisions = [{ candidateId: idB, decision: 'passed', date }];
  platform.save(ownerC, other, 0);
  setTime(time + 1000);
  saved.state.candidateDecisions[0].date = '1900-01-01';
  saved = platform.save(ownerA, saved.state, saved.revision);
  assert.equal(saved.state.candidateDecisions[0].date, date, 'Replaying an unchanged decision keeps its original date');
  saved.state.candidateDecisions[0].decision = 'passed';
  saved = platform.save(ownerA, saved.state, saved.revision);
  assert.equal(saved.state.candidateDecisions[0].date, new Date(time + 1000).toISOString());
  assert.equal(saved.directoryPeople.length, 0, 'Passed profiles do not populate favourites');
  saved.state.candidateDecisions = [];
  saved = platform.save(ownerA, saved.state, saved.revision);
  assert.deepEqual(saved.state.candidateDecisions, []);
  assert.equal(saved.state.savedSearches[0].id, 'kept-search');
  assert.equal(platform.read(ownerC).state.candidateDecisions[0].decision, 'passed');
});

test('older snapshots preserve candidate decisions and empty legacy accounts start without decisions', t => {
  const { platform, assessments } = fixture(t);
  platform.save(ownerB, candidateState(completed(assessments, ownerB)), 0);
  const employer = initial(); employer.candidateDecisions = [{ candidateId: idB, decision: 'liked', date }];
  const saved = platform.save(ownerA, employer, 0);
  const legacy = structuredClone(saved.state); delete legacy.candidateDecisions;
  legacy.company.name = 'Изменённая компания';
  const next = platform.save(ownerA, legacy, saved.revision);
  assert.deepEqual(next.state.candidateDecisions, saved.state.candidateDecisions);
  assert.equal(next.state.company.name, 'Изменённая компания');
  assert.deepEqual(platform.save(ownerC, initial(), 0).state.candidateDecisions, []);
});

test('decision validation rejects own profiles, unavailable candidates, forged fields and unbounded lists atomically', t => {
  const { platform, store, assessments } = fixture(t);
  platform.save(ownerB, candidateState(completed(assessments, ownerB)), 0);
  const saved = platform.save(ownerA, initial(), 0);
  for (const [decision, status] of [
    [{ candidateId: 'candidate-anna', decision: 'liked', date }, 400],
    [{ candidateId: idA, decision: 'passed', date }, 400],
    [{ candidateId: 'missing-person', decision: 'liked', date }, 404],
    [{ candidateId: idB, decision: 'accepted', date }, 400],
    [{ candidateId: idB, decision: 'liked', date: 'broken-date' }, 400],
    [{ candidateId: idB, decision: 'liked', date, owner: ownerC }, 400],
    [{ candidateId: '', decision: 'liked', date }, 400],
  ]) {
    const input = structuredClone(saved.state); input.company.name = 'Не должно сохраниться'; input.candidateDecisions = [decision];
    assert.throws(() => platform.save(ownerA, input, saved.revision), errorStatus(status));
  }
  for (const items of [[{ candidateId: idB, decision: 'liked', date }, { candidateId: idB, decision: 'passed', date }],
    Array.from({ length: 2001 }, (_, index) => ({ candidateId: `person-${index}`, decision: 'liked', date })), null]) {
    assert.throws(() => platform.save(ownerA, { ...saved.state, candidateDecisions: items }, saved.revision), errorStatus(400));
  }
  const hidden = platform.read(ownerB); hidden.state.profile.visible = false;
  platform.save(ownerB, hidden.state, hidden.revision);
  assert.throws(() => platform.save(ownerA, { ...saved.state, candidateDecisions: [{ candidateId: idB, decision: 'liked', date }] }, saved.revision), errorStatus(404));
  assert.equal(platform.read(ownerA).revision, saved.revision);
  assert.equal(platform.read(ownerA).state.company.name, saved.state.company.name);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM platform_candidate_decisions').get().n, 0);
});

test('revoked candidate publication hides liked profile but permits unrelated saves and undo', t => {
  const { platform, assessments } = fixture(t);
  platform.save(ownerB, candidateState(completed(assessments, ownerB)), 0);
  const employer = initial(); employer.candidateDecisions = [{ candidateId: idB, decision: 'liked', date }];
  platform.save(ownerA, employer, 0);
  const recipient = platform.read(ownerB); recipient.state.profile.consent = false;
  platform.save(ownerB, recipient.state, recipient.revision);
  let saved = platform.read(ownerA);
  assert.equal(saved.directoryPeople.length, 0);
  saved.state.company.name = 'Другое название';
  saved = platform.save(ownerA, saved.state, saved.revision);
  assert.equal(saved.state.candidateDecisions.length, 1);
  saved.state.candidateDecisions = [];
  assert.deepEqual(platform.save(ownerA, saved.state, saved.revision).state.candidateDecisions, []);
});

test('candidate deletion cascades decisions and invalidates deciding accounts before a stale snapshot can resurrect them', t => {
  const { platform, store, assessments } = fixture(t);
  platform.save(ownerB, candidateState(completed(assessments, ownerB)), 0);
  const employer = initial(); employer.candidateDecisions = [{ candidateId: idB, decision: 'liked', date }];
  const saved = platform.save(ownerA, employer, 0);
  platform.delete(ownerB);
  const refreshed = platform.read(ownerA);
  assert.equal(refreshed.revision, saved.revision + 1);
  assert.deepEqual(refreshed.state.candidateDecisions, []);
  assert.deepEqual(refreshed.directoryPeople, []);
  assert.throws(() => platform.save(ownerA, saved.state, saved.revision), errorStatus(409));
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM platform_candidate_decisions').get().n, 0);
});

test('deleting an employer removes only its decisions and keeps the candidate and other employers', t => {
  const { platform, store, assessments } = fixture(t);
  platform.save(ownerB, candidateState(completed(assessments, ownerB)), 0);
  const employer = initial(); employer.candidateDecisions = [{ candidateId: idB, decision: 'liked', date }];
  platform.save(ownerA, employer, 0); platform.save(ownerC, employer, 0);
  platform.delete(ownerA);
  assert(store.get(idB));
  assert.deepEqual(platform.read(ownerC).state.candidateDecisions, [{ candidateId: idB, decision: 'liked', date }]);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM platform_candidate_decisions WHERE owner=?').get(ownerA).n, 0);
});


test('resume blocks survive save, history snapshots and candidate projections without granting proof', t => {
  const { platform, store, assessments } = fixture(t);
  const proof = completed(assessments, ownerA);
  const state = candidateState(proof);
  const fields = { workExperiences: [{ period: '2024-01 — 2025-02', company: 'Лаборатория', tasks: 'API и очереди' }],
    petProjects: [{ name: 'Телеметрия', description: 'MQTT и датчики', stack: ['ESP32', 'Python'] }],
    achievementItems: ['Призёр хакатона'], interests: ['Робототехника'] };
  Object.assign(state.profile, fields, { careerAchievements: 'Устаревшее', workHistory: 'Устаревшее' });
  Object.assign(state.surveys[0], structuredClone(fields));
  const saved = platform.save(ownerA, state, 0);
  for (const key of Object.keys(fields)) {
    assert.deepEqual(saved.state.profile[key], fields[key]);
    assert.deepEqual(saved.state.surveys[0][key], fields[key]);
    assert.deepEqual(JSON.parse(store.forOwner(ownerA).public_payload)[key], fields[key]);
  }
  assert.equal(saved.state.profile.workHistory, 'Лаборатория\n2024-01 — 2025-02\nAPI и очереди');
  assert.equal(saved.state.profile.careerAchievements, 'Призёр хакатона');
  assert.deepEqual(saved.state.profile.achievements, []);
  const changed = structuredClone(saved.state);
  changed.profile.petProjects[0].description = 'Новое описание';
  const next = platform.save(ownerA, changed, saved.revision);
  assert.equal(next.state.profile.petProjects[0].description, 'Новое описание');
  assert.equal(next.state.surveys[0].petProjects[0].description, 'MQTT и датчики');
  const rewritten = structuredClone(next.state); rewritten.surveys[0].interests.push('Изменённая история');
  assert.throws(() => platform.save(ownerA, rewritten, next.revision), errorStatus(403));
});

test('new resume arrays cannot bypass candidate-only access or the consent requirement', t => {
  const { platform } = fixture(t);
  for (const key of ['petProjects', 'interests', 'achievementItems']) {
    const input = initial();
    input.profile[key] = key === 'petProjects' ? [{ name: 'Личный проект', description: '', stack: [] }] : ['Личная информация'];
    assert.throws(() => platform.save(ownerA, input, 0), errorStatus(400));
    assert.throws(() => platform.save(ownerA, input, 0, 'employer'), errorStatus(403));
  }
});

test('initial-state legacy overrides migrate while explicit empty sections still mean deletion', t => {
  const { platform } = fixture(t);
  const state = createInitialState();
  Object.assign(state.profile, { consent: true, workHistory: 'Legacy employment description',
    careerAchievements: 'Достижения\n• Победитель хакатона\nИнтересы\n• Разработка игр' });
  assert.equal(Object.hasOwn(state.profile, 'workExperiences'), false, 'Factory defaults cannot override later legacy fixture data');
  const saved = platform.save(ownerA, state, 0);
  assert.equal(saved.state.profile.workHistory, 'Legacy employment description');
  assert.deepEqual(saved.state.profile.workExperiences, [{ period: '', company: '', tasks: 'Legacy employment description' }]);
  assert.deepEqual(saved.state.profile.achievementItems, ['Победитель хакатона']);
  assert.deepEqual(saved.state.profile.interests, ['Разработка игр']);
  Object.assign(saved.state.profile, { workExperiences: [], achievementItems: [], interests: [] });
  const cleared = platform.save(ownerA, saved.state, saved.revision);
  assert.equal(cleared.state.profile.workHistory, '');
  assert.equal(cleared.state.profile.careerAchievements, '');
  assert.deepEqual(cleared.state.profile.workExperiences, []);
  assert.deepEqual(cleared.state.profile.achievementItems, []);
});

test('core-only assessment input never replaces the richer saved resume questionnaire', t => {
  const { platform, assessments } = fixture(t);
  const state = createInitialState();
  const core = { id: 'core-only-resume-test', date, industry: 'ИТ', professionalRole: 'Frontend-разработчик',
    specialization: 'Frontend', desiredGrade: 'Junior', experience: '1 год', stack: ['React'], softSkills: [] };
  const richSurvey = { ...core, workExperiences: [{ company: 'Лаборатория', period: '2024-01 — 2025-02', tasks: 'Формы на React' }],
    petProjects: [{ name: 'Редактор', description: 'Компоненты', stack: ['React'] }],
    achievementItems: ['Призёр'], interests: ['Робототехника'] };
  Object.assign(state.profile, richSurvey, { name: 'Кандидат', email: 'resume@example.invalid', consent: true, visible: true, surveyCompletedAt: date });
  state.surveys = [richSurvey];
  const before = platform.save(ownerA, state, 0);
  const attempt = createAttempt(core); assessments.insert(attempt, ownerA, 'private-token');
  const graded = evaluate(attempt, attempt.questions.map(question => ({ questionId: question.id, optionId: question.correctOptionId })), time + 1000);
  assessments.complete(attempt.id, graded.answerDigest, graded.result);
  assert.equal(Object.hasOwn(attempt.survey, 'petProjects'), false, 'The test receives the core contract only');
  const after = structuredClone(before.state);
  after.history = [graded.result];
  after.profile.confirmed = { specialization: graded.result.specialization, grade: graded.result.grade, score: graded.result.score,
    date: graded.result.date, surveyId: core.id };
  const saved = platform.save(ownerA, after, before.revision);
  for (const key of ['workExperiences', 'petProjects', 'achievementItems', 'interests']) {
    assert.deepEqual(saved.state.surveys[0][key], richSurvey[key]);
  }
});

test('maximum legacy history can be read and saved repeatedly without truncation', t => {
  const { platform, assessments } = fixture(t);
  const state = candidateState(completed(assessments, ownerA));
  state.profile.workHistory = 'x'.repeat(19992) + 'ХВОСТ123';
  let saved = platform.save(ownerA, state, 0);
  for (let index = 0; index < 3; index++) {
    assert.equal(saved.state.profile.workHistory, state.profile.workHistory);
    assert.equal(saved.state.profile.workExperiences.map(entry => entry.tasks).join(''), state.profile.workHistory);
    saved = platform.save(ownerA, saved.state, saved.revision);
  }
});
