import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCandidatePage } from '../src/candidate-navigation.ts';

test('a completed questionnaire opens the personal profile without a confirmed category or successful test', () => {
  assert.equal(resolveCandidatePage('profile', true), 'profile');
});

test('candidate tabs still require a complete questionnaire', () => {
  for (const page of ['profile', 'assessment', 'invitations', 'onboarding']) {
    assert.equal(resolveCandidatePage(page, false), 'onboarding');
  }
});

test('every candidate tab keeps its requested route after the questionnaire', () => {
  for (const page of ['profile', 'assessment', 'invitations', 'onboarding']) {
    assert.equal(resolveCandidatePage(page, true), page);
  }
});
