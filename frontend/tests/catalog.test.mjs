import test from 'node:test';
import assert from 'node:assert/strict';
import { specializationOptions, specializationNames, industryOptions, detectSpecialization, professionalRoleOptions, normalizeProfessionalRole, softSkillOptions } from '../../shared/catalog.ts';
import { createInitialState, currentSurvey, emptyFilters } from '../src/model.ts';
import { DirectoryStore } from '../../server/directory-store.mjs';

function matching(profile, filters = emptyFilters) {
  const store = new DirectoryStore(':memory:');
  try {
    // PlatformService validates the actual assessment proof; these tests cover
    // exact SQL category/skill restrictions after that eligibility decision.
    store.upsert(profile, 'catalog-test', Boolean(profile.confirmed && profile.surveyCompletedAt));
    return store.matching(filters);
  } finally { store.close(); }
}

test('every displayed direction has a stable ID and matching professional label', () => {
  assert.equal(specializationOptions.length, 14);
  assert.equal(new Set(specializationOptions.map(item => item.value)).size, 14);
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
  assert.equal(detectSpecialization('Инженер по электронике'), 'Embedded');
  assert.equal(detectSpecialization('Разработка прошивок STM32'), 'Embedded');
  assert.equal(detectSpecialization('Firmware engineer'), 'Embedded');
  assert.equal(detectSpecialization('Frontend для магазина электроники'), 'Frontend');
  assert.equal(detectSpecialization('C++ STM32'), undefined);
});

test('selectable IT roles cover each supported direction and preserve ambiguous input for review', () => {
  assert.equal(professionalRoleOptions.length, 47);
  assert.equal(new Set(professionalRoleOptions).size, 47);
  for (const { role } of specializationOptions) assert.ok(professionalRoleOptions.includes(role), role);
  assert.equal(normalizeProfessionalRole('Python Backend-разработчик'), 'Backend-разработчик');
  assert.equal(normalizeProfessionalRole('Разработчик интерфейсов'), 'Frontend-разработчик');
  assert.equal(normalizeProfessionalRole('SRE Engineer'), 'SRE-инженер');
  assert.equal(normalizeProfessionalRole('Firmware engineer'), 'Разработчик прошивок');
  assert.equal(normalizeProfessionalRole('Разработчик', 'Frontend'), 'Frontend-разработчик');
  assert.equal(normalizeProfessionalRole('UX Designer / Backend Developer'), '');
  assert.equal(normalizeProfessionalRole('Неизвестная должность'), '');
});

test('expanded optional self-assessment keeps the original skills and distinct new competencies', () => {
  assert.equal(softSkillOptions.length, 25);
  assert.equal(new Set(softSkillOptions).size, 25);
  for (const skill of ['Коммуникация', 'Работа в команде', 'Самоорганизация', 'Решение задач', 'Лидерство',
    'Критическое мышление', 'Наставничество', 'Разрешение конфликтов']) assert.ok(softSkillOptions.includes(skill), skill);
  assert.deepEqual(createInitialState().profile.softSkills, [], 'The larger pool does not force self-assessment');
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
  assert.equal(matching(state.profile, { ...emptyFilters, specialization: 'ML', grade: 'Junior', stack: ['Python', 'PyTorch'] }).length, 1);
  assert.equal(matching(state.profile, { ...emptyFilters, specialization: 'ML', grade: 'Junior', stack: ['TensorFlow'] }).length, 0);
  assert.equal(matching(state.profile, { ...emptyFilters, specialization: 'Backend' }).length, 0);
  assert.equal(matching({ ...state.profile, visible: false }, { ...emptyFilters, specialization: 'ML' }).length, 0);
  assert.equal(matching({ ...state.profile, confirmed: null }, { ...emptyFilters, specialization: 'ML' }).length, 0);
  state.profile.industry = 'Транспорт и логистика';
  assert.equal(currentSurvey(state), undefined, 'Professional changes require a new survey');
});

test('SQL is a standalone skill and does not match the letters inside PostgreSQL', () => {
  const state = createInitialState();
  const date = new Date().toISOString();
  const profile = { ...state.profile, specialization: 'Backend', stack: ['PostgreSQL'], visible: true, consent: true,
    surveyCompletedAt: date, confirmed: { specialization: 'Backend', grade: 'Junior', score: 83, date } };
  assert.equal(matching(profile, { ...emptyFilters, specialization: 'Backend', stack: ['PostgreSQL'] }).length, 1);
  assert.equal(matching(profile, { ...emptyFilters, specialization: 'Backend', stack: ['SQL'] }).length, 0);
});

test('React Native does not require React unless React is also requested separately', () => {
  const state = createInitialState();
  const date = new Date().toISOString();
  const profile = { ...state.profile, specialization: 'Mobile', stack: ['React Native'], visible: true, consent: true,
    surveyCompletedAt: date, confirmed: { specialization: 'Mobile', grade: 'Junior', score: 83, date } };
  assert.equal(matching(profile, { ...emptyFilters, specialization: 'Mobile', stack: ['React Native'] }).length, 1);
  assert.equal(matching(profile, { ...emptyFilters, specialization: 'Mobile', stack: ['React', 'React Native'] }).length, 0);
});
