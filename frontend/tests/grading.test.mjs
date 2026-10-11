import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeOptions, gradeLabels, isGrade, detectGrade } from '../../shared/grading.ts';
import { parseResumeText } from '../src/resume-parser.ts';
import { categoryChangeUnlock, createInitialState, currentSurvey, emptyFilters } from '../src/model.ts';
import { DirectoryStore } from '../../server/directory-store.mjs';

test('every category change waits 90 days even after a confident result', () => {
  const profile = createInitialState().profile;
  const date = '2026-10-11T09:00:00.000Z';
  const changedAt = '2026-10-10T09:00:00.000Z';
  assert.equal(categoryChangeUnlock(profile, 'Frontend', 'Senior'), 0, 'First confirmation has no waiting period');
  for (const score of [70, 89, 90, 100]) {
    profile.confirmed = { specialization: 'Frontend', grade: 'Junior', score, date };
    profile.gradeChangedAt = changedAt;
    const until = Date.parse(changedAt) + 90 * 86400000;
    for (const grade of ['Intern', 'Middle', 'Senior', 'Lead']) {
      assert.equal(categoryChangeUnlock(profile, 'Frontend', grade), until);
    }
    assert.equal(categoryChangeUnlock(profile, 'Backend', 'Junior'), until);
    assert.equal(categoryChangeUnlock(profile, 'Frontend', 'Junior'), 0, 'Repeating the same category stays available');
    delete profile.gradeChangedAt;
    assert.equal(categoryChangeUnlock(profile, 'Frontend', 'Middle'), Date.parse(date) + 90 * 86400000);
  }
});

test('all five grades share stable IDs, readable labels and explicit resume aliases', () => {
  assert.deepEqual(gradeOptions.map(item => item.value), ['Intern', 'Junior', 'Middle', 'Senior', 'Lead']);
  assert.equal(gradeLabels.Intern, 'Стажёр');
  for (const { value, label } of gradeOptions) {
    assert.equal(isGrade(value), true);
    assert.equal(detectGrade(label), value);
    assert.equal(parseResumeText(`Иван Соколов\nFrontend developer ${value}`).desiredGrade, value);
    assert.equal(parseResumeText(`Иван Соколов\nGrade: ${label}`).desiredGrade, value);
  }
  for (const [text, grade] of [['Стажер', 'Intern'], ['trainee', 'Intern'], ['Сеньор', 'Senior'], ['Team Lead', 'Lead'], ['техлид', 'Lead']]) assert.equal(detectGrade(text), grade);
  assert.equal(detectGrade('Senior / Lead'), undefined);
  assert.equal(detectGrade('leadership skills'), undefined);
  assert.equal(isGrade('Principal'), false);
});

test('explicit grade overrides the headline and past jobs or years cannot assign it', () => {
  assert.equal(parseResumeText('Иван Соколов\nFrontend Senior\nГрейд: Lead').desiredGrade, 'Lead');
  assert.equal(parseResumeText('Иван Соколов\nFrontend Lead\nГрейд: Principal').desiredGrade, undefined);
  assert.equal(parseResumeText('Иван Соколов\nFrontend developer\nОпыт работы: 15 лет\nSenior разработчик в старой компании').desiredGrade, undefined);
});

test('each grade survives a completed survey and SQL matches only its confirmed category', () => {
  for (const { value: grade } of gradeOptions) {
    const state = createInitialState();
    const date = '2026-10-06T10:00:00.000Z';
    const survey = { id: `grade-${grade}`, date, industry: 'ИТ', professionalRole: 'Frontend developer', specialization: 'Frontend',
      desiredGrade: grade, stack: ['React'], experience: 'Без опыта', softSkills: [] };
    state.profile = { ...state.profile, ...survey, id: state.profile.id, name: 'Иван Соколов', email: 'test@example.com',
      surveyCompletedAt: date, visible: true, consent: true, confirmed: { specialization: 'Frontend', grade, score: 100, date } };
    state.surveys = [survey];
    assert.equal(currentSurvey(state)?.desiredGrade, grade);
    const store = new DirectoryStore(':memory:');
    try {
      store.upsert(state.profile, 'grade-test', true);
      assert.equal(store.matching({ ...emptyFilters, specialization: 'Frontend', grade }).length, 1);
      for (const { value: other } of gradeOptions.filter(item => item.value !== grade)) {
        assert.equal(store.matching({ ...emptyFilters, grade: other }).length, 0);
      }
      state.profile.desiredGrade = grade === 'Junior' ? 'Senior' : 'Junior';
      store.upsert(state.profile, 'grade-test', true);
      assert.equal(store.matching({ ...emptyFilters, grade }).length, 1, 'Self-reported grade cannot change the verified filter');
      store.upsert({ ...state.profile, confirmed: null }, 'grade-test', false);
      assert.equal(store.matching({ ...emptyFilters, grade }).length, 0);
    } finally { store.close(); }
  }
});
