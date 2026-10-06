import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeOptions, gradeLabels, isGrade, detectGrade } from '../../shared/grading.ts';
import { parseResumeText } from '../src/resume-parser.ts';
import { createInitialState, currentSurvey, emptyFilters, searchCandidates } from '../src/model.ts';

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

test('each grade survives a completed survey and matches only its confirmed category', () => {
  for (const { value: grade, label } of gradeOptions) {
    const state = createInitialState();
    const date = '2026-10-06T10:00:00.000Z';
    const survey = { id: `grade-${grade}`, date, industry: 'ИТ', professionalRole: 'Frontend developer', specialization: 'Frontend',
      desiredGrade: grade, stack: ['React'], experience: 'Без опыта', softSkills: [] };
    state.profile = { ...state.profile, ...survey, id: state.profile.id, name: 'Иван Соколов', email: 'test@example.com',
      surveyCompletedAt: date, visible: true, consent: true, confirmed: { specialization: 'Frontend', grade, score: 100, date } };
    state.surveys = [survey];
    assert.equal(currentSurvey(state)?.desiredGrade, grade);
    assert.equal(searchCandidates([state.profile], emptyFilters, `Frontend ${label}`).length, 1);
    for (const { value: other } of gradeOptions.filter(item => item.value !== grade)) {
      assert.equal(searchCandidates([state.profile], { ...emptyFilters, grade: other }, '').length, 0);
      assert.equal(searchCandidates([state.profile], emptyFilters, `Frontend ${other}`).length, 0);
    }
    assert.equal(searchCandidates([{ ...state.profile, confirmed: null }], emptyFilters, label).length, 0);
  }
});
