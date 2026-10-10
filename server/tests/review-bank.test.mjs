import test from 'node:test';
import assert from 'node:assert/strict';
import { specializationOptions, stackOptions } from '../../shared/catalog.ts';
import { getReviewProgram, reviewCoverage, reviewGrades, reviewQuestions, reviewSheet, reviewSources,
  sampleReviewQuestions, validateReviewBank } from '../review-bank.mjs';

test('research corpus covers every filter specialization and skill without certifying a draft', () => {
  assert.deepEqual(validateReviewBank(), []);
  const coverage = reviewCoverage();
  assert.equal(coverage.total, 165);
  assert.equal(coverage.competencies, 33);
  for (const specialization of specializationOptions) for (const grade of reviewGrades) {
    const program = getReviewProgram(specialization.value, grade);
    assert.ok(program.questions.length > 0);
    assert.equal(program.review.approvedForCertification, false);
    assert.equal(program.review.active, false);
  }
  for (const skill of stackOptions) assert.ok(reviewQuestions.some(question => question.testedSkills.includes(skill)), skill);
  assert.ok(reviewQuestions.some(question => question.answerFormat === 'case'));
  assert.ok(reviewQuestions.some(question => question.answerFormat === 'code'));
});

test('provenance, missing levels, fake active status and numeric-only clones fail validation', () => {
  const withoutSource = structuredClone(reviewQuestions);
  withoutSource[0].sourceIds = ['missing-source'];
  assert.ok(validateReviewBank(withoutSource).some(error => error.includes('unresolvable source')));
  assert.ok(validateReviewBank(reviewQuestions.slice(1)).some(error => error.includes('competency/grade')));
  const enabled = structuredClone(reviewQuestions);
  enabled[0].review.approvedForCertification = true;
  assert.ok(validateReviewBank(enabled).some(error => error.includes('must not certify')));
  const missingRubric = structuredClone(reviewQuestions);
  delete missingRubric[0].rubric;
  assert.ok(validateReviewBank(missingRubric).some(error => error.includes('incomplete rubric')));
  const cloned = structuredClone(reviewQuestions);
  cloned[1].prompt = cloned[0].prompt.replace(/\d/gu, '9');
  assert.ok(validateReviewBank(cloned).some(error => error.includes('numeric-only duplicate')));
  const unverified = structuredClone(reviewSources);
  unverified[0].verification = 'index-only'; unverified[0].evidence = '';
  assert.ok(validateReviewBank(reviewQuestions, unverified).some(error => error.includes('verification limit')));
});

test('author sheets omit private solutions, rubrics and future generation hints', () => {
  for (const question of reviewQuestions) {
    const sheet = reviewSheet(question);
    for (const key of ['solutionPath', 'intent', 'rubric', 'criticalErrors', 'generationContract']) assert.equal(Object.hasOwn(sheet, key), false);
    assert.equal(sheet.prompt, question.prompt);
    assert.throws(() => { sheet.testedSkills.push('secret'); }, TypeError);
  }
  assert.throws(() => { reviewQuestions[0].rubric[0].expected = 'altered'; }, TypeError);
});

test('random author samples contain distinct competencies and validate their parameters', () => {
  for (const grade of reviewGrades) {
    for (let run = 0; run < 30; run++) {
      const questions = sampleReviewQuestions(grade);
      assert.equal(questions.length, 3);
      assert.equal(new Set(questions.map(question => question.competency)).size, 3);
      assert.ok(questions.every(question => question.grade === grade));
    }
    assert.equal(sampleReviewQuestions(grade, 3, { randomIndex: () => 0 })[0].id, `research:mathematics:${grade}`);
  }
  assert.throws(() => sampleReviewQuestions('Unknown'), RangeError);
  assert.throws(() => sampleReviewQuestions('Intern', 34), RangeError);
  assert.throws(() => sampleReviewQuestions('Intern', 1, { randomIndex: () => -1 }), RangeError);
  assert.throws(() => getReviewProgram('Unknown', 'Intern'), RangeError);
});
