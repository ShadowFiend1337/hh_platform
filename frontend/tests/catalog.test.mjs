import test from 'node:test';
import assert from 'node:assert/strict';
import { specializationOptions, specializationNames, industryOptions, detectSpecialization } from '../../shared/catalog.ts';
import { createInitialState, currentSurvey, emptyFilters, searchCandidates } from '../src/model.ts';

test('every displayed direction has a stable ID and matching professional label', () => {
  assert.equal(specializationOptions.length, 13);
  assert.equal(new Set(specializationOptions.map(item => item.value)).size, 13);
  assert.equal(industryOptions.length, 25);
  assert.equal(new Set(industryOptions).size, 25);
  for (const { value, label } of specializationOptions) {
    assert.equal(detectSpecialization(label), value, label);
    assert.equal(detectSpecialization(`${value} Middle`), value, value);
    assert.equal(specializationNames[value], label);
  }
  assert.equal(detectSpecialization('HTML CSS'), undefined);
  assert.equal(detectSpecialization('AI Product Manager'), 'ProductManagement');
  assert.equal(detectSpecialization('ML Engineer (Android)'), 'ML');
  assert.equal(detectSpecialization('Data Engineer / DevOps Engineer'), undefined);
  assert.equal(detectSpecialization('UX Designer / Backend Developer'), undefined);
  assert.equal(detectSpecialization('Fullstack Frontend Backend developer'), 'Fullstack');
});

test('ML survey and matching keep category, technology and publication constraints', () => {
  const state = createInitialState();
  const date = new Date().toISOString();
  const survey = { id: 'catalog-survey', date, industry: 'Наука', professionalRole: 'ML Engineer', specialization: 'ML',
    desiredGrade: 'Junior', stack: ['Python', 'PyTorch'], experience: 'Без опыта', softSkills: ['Коммуникация'] };
  state.profile = { ...state.profile, ...survey, id: state.profile.id, name: 'Иван Соколов', email: 'test@example.com',
    surveyCompletedAt: date, visible: true, consent: true, confirmed: { specialization: 'ML', grade: 'Junior', score: 100, date } };
  state.surveys = [survey];
  assert.equal(currentSurvey(state)?.id, survey.id);
  assert.equal(searchCandidates([state.profile], emptyFilters, 'ML Junior Python PyTorch').length, 1);
  assert.equal(searchCandidates([state.profile], emptyFilters, 'ML Junior TensorFlow').length, 0);
  assert.equal(searchCandidates([state.profile], { ...emptyFilters, specialization: 'Backend' }, '').length, 0);
  assert.equal(searchCandidates([{ ...state.profile, visible: false }], emptyFilters, 'ML').length, 0);
  assert.equal(searchCandidates([{ ...state.profile, confirmed: null }], emptyFilters, 'ML').length, 0);
  state.profile.industry = 'Транспорт и логистика';
  assert.equal(currentSurvey(state), undefined, 'Professional changes require a new survey');
});

test('SQL is a standalone skill and does not match the letters inside PostgreSQL', () => {
  const state = createInitialState();
  const date = new Date().toISOString();
  const profile = { ...state.profile, specialization: 'Backend', stack: ['PostgreSQL'], visible: true, consent: true,
    surveyCompletedAt: date, confirmed: { specialization: 'Backend', grade: 'Junior', score: 83, date } };
  assert.equal(searchCandidates([profile], emptyFilters, 'Backend PostgreSQL').length, 1);
  assert.equal(searchCandidates([profile], emptyFilters, 'Backend SQL').length, 0);
});

test('React Native does not require React unless React is also requested separately', () => {
  const state = createInitialState();
  const date = new Date().toISOString();
  const profile = { ...state.profile, specialization: 'Mobile', stack: ['React Native'], visible: true, consent: true,
    surveyCompletedAt: date, confirmed: { specialization: 'Mobile', grade: 'Junior', score: 83, date } };
  assert.equal(searchCandidates([profile], emptyFilters, 'Mobile React Native').length, 1);
  assert.equal(searchCandidates([profile], emptyFilters, 'Mobile React React Native').length, 0);
});
