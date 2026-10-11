import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCandidatePage } from '../src/candidate-navigation.ts';

function result(overrides = {}) {
  return { id: 'fixture-attempt', date: '2026-10-11T00:00:00Z', specialization: 'Frontend', grade: 'Junior',
    score: 85, passed: false, surveyId: 'fixture-survey', ...overrides };
}

test('a completed pending attempt allows the profile and its history without confirming qualification', () => {
  const history = [result({ pending: true, closedScore: 85, openCount: 2, openAnswered: 2 })];
  const previous = structuredClone(history);
  assert.equal(resolveCandidatePage('profile', true, null, history), 'profile');
  assert.equal(resolveCandidatePage('assessment', true, null, history), 'assessment');
  assert.deepEqual(history, previous, 'Navigation never changes a pending score or promotes it to a passed result');
  assert.equal(history[0].passed, false);
  assert.equal(history[0].pending, true);
});

test('pending, passed and invitation navigation still require a complete questionnaire', () => {
  const confirmed = { specialization: 'Frontend', grade: 'Junior', score: 85, date: '2026-10-11T00:00:00Z' };
  for (const history of [[result({ pending: true })], [result({ passed: true })]]) {
    for (const page of ['profile', 'assessment', 'invitations']) assert.equal(resolveCandidatePage(page, false, confirmed, history), 'onboarding');
  }
});

test('annulled or invalidated pending attempts do not unlock the profile', () => {
  for (const flag of ['annulled', 'invalidated']) {
    assert.equal(resolveCandidatePage('profile', true, null, [result({ pending: true, [flag]: true })]), 'assessment');
  }
  assert.equal(resolveCandidatePage('profile', true, null, []), 'assessment');
  assert.equal(resolveCandidatePage('profile', true, null, [result({ closedScore: 100, openAnswered: 2 })]), 'assessment');
  assert.equal(resolveCandidatePage('profile', true, null, [result({ pending: false })]), 'assessment');
});

test('a valid pending attempt remains usable alongside old rejected or annulled attempts', () => {
  const history = [result({ pending: true, invalidated: true }), result({ id: 'valid-pending', pending: true }), result({ id: 'failed', score: 40 })];
  assert.equal(resolveCandidatePage('profile', true, null, history), 'profile');
});

test('onboarding and invitations keep their existing availability after completing the questionnaire', () => {
  for (const page of ['onboarding', 'invitations']) assert.equal(resolveCandidatePage(page, true, null, []), page);
});

test('a claimed confirmed category still needs its matching successful historical result', () => {
  const confirmed = { specialization: 'Frontend', grade: 'Junior', score: 85, date: '2026-10-11T00:00:00Z' };
  assert.equal(resolveCandidatePage('profile', true, confirmed, []), 'assessment');
  assert.equal(resolveCandidatePage('profile', true, confirmed, [result({ passed: true, score: 84 })]), 'assessment');
  assert.equal(resolveCandidatePage('profile', true, confirmed, [result({ passed: true })]), 'profile');
});
