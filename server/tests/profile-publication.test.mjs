import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttempt, evaluate } from '../assessment.mjs';
import { profilePublication, completedPublicationSurvey, verifiedProfileConfirmation, confirmedFirst,
  confirmationOrdering, CONFIRMATION_ORDER_POLICY } from '../profile-publication.mjs';

const owner = 'candidate-owner';
const time = Date.parse('2026-10-08T09:00:00.000Z');
const survey = { id: 'questionnaire-owned', date: new Date(time).toISOString(), industry: 'ИТ',
  professionalRole: 'Frontend разработчик', specialization: 'Frontend', desiredGrade: 'Junior',
  stack: ['React', 'TypeScript'], experience: 'Без опыта', softSkills: ['Работа в команде'] };
const person = { ...survey, id: 'candidate-public', name: 'Тестовый Кандидат', email: 'candidate@example.test',
  consent: true, visible: true, confirmed: null, surveyCompletedAt: survey.date };

function proof(passed = true) {
  const attempt = createAttempt(survey, '', [], time);
  const answers = attempt.questions.map(question => ({ questionId: question.id,
    optionId: passed ? question.correctOptionId : question.options.find(option => option.id !== question.correctOptionId).id }));
  return { id: attempt.id, owner, attempt, result: evaluate(attempt, answers, time + 1000).result };
}

test('completed questionnaire can be published before a test without claiming a confirmed grade', () => {
  const publication = profilePublication(person, { owner, surveys: [survey] });
  assert.equal(publication.eligible, true);
  assert.equal(publication.published, true);
  assert.equal(publication.status, 'unconfirmed');
  assert.equal(publication.person.confirmed, null);
  assert.equal(publication.person.desiredGrade, 'Junior', 'Self-reported grade remains a distinct preference');
  assert.equal(person.confirmed, null);
});

test('failed attempt leaves a published questionnaire unconfirmed and does not fabricate a result', () => {
  const failed = proof(false);
  assert.equal(failed.result.passed, false);
  const publication = profilePublication(person, { owner, proof: failed, surveys: [survey] });
  assert.equal(publication.published, true);
  assert.equal(publication.person.confirmed, null);
  assert.equal(verifiedProfileConfirmation(failed, owner), null);
});

test('incomplete or outdated questionnaire cannot publish an unconfirmed profile', () => {
  for (const change of [{ name: '' }, { email: 'bad' }, { professionalRole: '' }, { stack: [] },
    { industry: '' }, { experience: '' }, { specialization: 'Unknown' }, { desiredGrade: 'Unknown' },
    { surveyCompletedAt: null }, { stack: ['React'] }, { softSkills: [] }, { desiredGrade: 'Middle' }]) {
    const publication = profilePublication({ ...person, ...change }, { owner, surveys: [survey] });
    assert.equal(publication.eligible, false, JSON.stringify(change));
    assert.equal(publication.published, false);
  }
  assert.equal(profilePublication(person, { owner, surveys: [] }).eligible, false);
  assert.equal(completedPublicationSurvey(person, [{ ...survey, id: '' }]), null);
});

test('consent and visibility remain mandatory independently of completed survey or proof', () => {
  for (const value of [{ ...person, consent: false }, { ...person, visible: false }]) {
    assert.equal(profilePublication(value, { owner, surveys: [survey] }).published, false);
    assert.equal(profilePublication(value, { owner, proof: proof() }).published, false);
  }
});

test('only a passed owned server attempt controls the public grade and score', () => {
  const owned = proof();
  const client = { ...person, confirmed: { specialization: 'Security', grade: 'Lead', score: 100 }, _proofId: 'private-reference' };
  const publication = profilePublication(client, { owner, proof: owned, surveys: [survey] });
  assert.equal(publication.status, 'confirmed');
  assert.equal(publication.published, true);
  assert.equal(publication.person.confirmed.specialization, 'Frontend');
  assert.equal(publication.person.confirmed.grade, 'Junior');
  assert.equal(publication.person.confirmed.score, owned.result.score);
  assert.equal(publication.person._proofId, undefined);
  assert.equal(client.confirmed.grade, 'Lead', 'Projection does not overwrite the private source object');
  assert.equal(profilePublication(client, { owner, surveys: [survey] }).person.confirmed, null);
});

test('foreign or internally inconsistent results never become public confirmation', () => {
  const original = proof();
  for (const changed of [
    { ...original, owner: 'another-owner' },
    { ...original, id: 'another-attempt' },
    { ...original, result: { ...original.result, score: 69 } },
    { ...original, result: { ...original.result, score: 101 } },
    { ...original, result: { ...original.result, score: 99.5 } },
    { ...original, result: { ...original.result, grade: 'Senior' } },
    { ...original, result: { ...original.result, specialization: 'Backend' } },
    { ...original, result: { ...original.result, surveyId: 'another-questionnaire' } },
    { ...original, result: { ...original.result, date: 'invalid' } },
  ]) {
    assert.equal(verifiedProfileConfirmation(changed, owner), null);
    assert.equal(profilePublication(person, { owner, proof: changed, surveys: [survey] }).person.confirmed, null);
  }
});

test('an earlier valid category survives a new questionnaire pending or failed test', () => {
  const earlier = proof();
  const next = { ...person, desiredGrade: 'Middle', surveyCompletedAt: null };
  const publication = profilePublication(next, { owner, proof: earlier });
  assert.equal(publication.published, true);
  assert.equal(publication.person.confirmed.grade, 'Junior');
  assert.equal(publication.person.desiredGrade, 'Middle');
});

test('confirmed-first partition preserves score, admission and relative order within each group', () => {
  const u1 = { person: { id: 'unconfirmed-first', confirmed: null }, rank: 100 };
  const c1 = { person: { id: 'confirmed-first', confirmed: { grade: 'Junior', score: 83 } }, rank: 20 };
  const u2 = { person: { id: 'unconfirmed-second', confirmed: null }, rank: 19 };
  const c2 = { person: { id: 'confirmed-second', confirmed: { grade: 'Senior', score: 100 } }, rank: 18 };
  const input = [u1, c1, u2, c2];
  const ordered = confirmedFirst(input);
  assert.deepEqual(ordered, [c1, c2, u1, u2]);
  assert.deepEqual(input, [u1, c1, u2, c2]);
  assert.deepEqual(ordered.map(item => item.rank), [20, 18, 100, 19]);
  for (const item of input) assert(ordered.includes(item), 'Partition never admits or removes candidates');
});

test('publication priority records actual movement without modifying or exporting candidate objects', () => {
  const unconfirmed = { person: { confirmed: null }, rank: 9 };
  const confirmed = { person: { confirmed: { grade: 'Junior', score: 80 } }, rank: 1 };
  const input = [unconfirmed, confirmed], snapshot = structuredClone(input);
  assert.equal(confirmationOrdering(confirmed), null);
  const ordered = confirmedFirst(input);
  assert.deepEqual(input, snapshot);
  assert.deepEqual(ordered, [confirmed, unconfirmed]);
  assert.deepEqual(confirmationOrdering(confirmed), { policy: CONFIRMATION_ORDER_POLICY.version,
    group: 'confirmed', mixedGroups: true, changedPosition: true });
  assert.equal(confirmationOrdering(unconfirmed).group, 'unconfirmed');
  assert.equal(confirmationOrdering(unconfirmed).changedPosition, true);
  assert.equal(confirmationOrdering({ ...confirmed }), null, 'Copying public fields cannot claim execution');
  assert.equal(Object.isFrozen(confirmationOrdering(confirmed)), true);
  confirmedFirst([confirmed]);
  assert.equal(confirmationOrdering(confirmed).mixedGroups, false);
  assert.equal(confirmationOrdering(confirmed).changedPosition, false);
  assert.deepEqual(confirmedFirst([]), []);
});
