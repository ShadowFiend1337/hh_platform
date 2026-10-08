import assert from 'node:assert/strict';
import test from 'node:test';
import { getOpenProgram, openBankReview, openFamilies, openSources, sampleOpenQuestions } from '../open-bank.mjs';
import { openGrades, openGroups, openSpecializations, validateOpenBank } from '../open-bank/schema.mjs';

test('Each catalog program has balanced authoring coverage with actual tier conditions and private rubrics', () => {
  for (const specialization of openSpecializations) for (const grade of openGrades) {
    const program = getOpenProgram(specialization, grade);
    assert.equal(program.review.approvedForCertification, false);
    for (const group of openGroups) assert.ok(program.questions.filter(question => question.group === group).length >= 10);
    for (const question of program.questions) {
      assert.ok(question.prompt.includes(openFamilies.find(family => family.id === question.familyId).levels[grade].task));
      assert.ok(question.referenceAnswer.level.length);
      assert.deepEqual(Object.keys(question.rubric.find(criterion => criterion.id === 'level-depth').anchors), ['0', '1', '2', '3']);
      assert.ok(question.acceptableAlternatives.length && question.criticalErrors.length);
      assert.ok(question.sources.every(source => source.url.startsWith('https://')));
    }
  }
  assert.equal(openBankReview.independentlyReviewed, false);
  assert.equal(openBankReview.empiricallyCalibrated, false);
});

test('Another form and another grade respect disclosed family exclusions; exhausted coverage fails explicitly', () => {
  for (const specialization of openSpecializations) {
    const first = sampleOpenQuestions(specialization, 'Junior');
    const excludedFamilyIds = first.questions.map(question => question.familyId);
    const nextGrade = sampleOpenQuestions(specialization, 'Senior', { excludedFamilyIds });
    assert.equal(first.purpose, 'author-preview');
    assert.equal(first.questions.length, 20);
    assert.equal(nextGrade.questions.length, 20);
    assert.equal(new Set([...excludedFamilyIds, ...nextGrade.questions.map(question => question.familyId)]).size, 40);
    for (const group of openGroups) assert.equal(nextGrade.questions.filter(question => question.group === group).length, 5);
    const all = getOpenProgram(specialization, 'Middle').questions.map(question => question.familyId);
    assert.throws(() => sampleOpenQuestions(specialization, 'Middle', { excludedFamilyIds: all }), /Not enough unseen families/u);
  }
  assert.throws(() => getOpenProgram('InventedRole', 'Lead'), RangeError);
  assert.throws(() => getOpenProgram('ML', 'Expert'), RangeError);
  assert.throws(() => sampleOpenQuestions('ML', 'Junior', { perGroup: -1 }), RangeError);
});

test('A private snapshot cannot mutate the source corpus or another preview', () => {
  const sample = sampleOpenQuestions('ML', 'Middle');
  const question = sample.questions[0];
  assert.throws(() => { question.referenceAnswer.level = 'replaced'; }, TypeError);
  assert.throws(() => { question.rubric[0].anchors[2] = 'always pass'; }, TypeError);
  assert.throws(() => { question.sources[0].url = 'https://forged.example.test'; }, TypeError);
  assert.throws(() => sample.questions.pop(), TypeError);
  assert.equal(getOpenProgram('ML', 'Middle').questions.find(item => item.id === question.id).referenceAnswer.level, question.referenceAnswer.level);
});

test('Provenance, concrete tier expectations and scenario deduplication reject corrupt authoring imports', () => {
  const missingSource = structuredClone(openFamilies);
  missingSource[0].sourceIds = ['invented-unverified-source'];
  assert.ok(validateOpenBank(missingSource, openSources).some(error => error.includes('unknown source')));
  const duplicateScenario = structuredClone(openFamilies);
  duplicateScenario[1].prompt = duplicateScenario[0].prompt;
  assert.ok(validateOpenBank(duplicateScenario, openSources).some(error => error.includes('duplicate scenario')));
  const clonedLevels = structuredClone(openFamilies);
  clonedLevels[0].levels.Lead = { ...clonedLevels[0].levels.Intern };
  assert.ok(validateOpenBank(clonedLevels, openSources).some(error => error.includes('grade scenarios must differ')));
  const fabricatedVerification = structuredClone(openSources);
  fabricatedVerification[0].verification = 'trusted';
  assert.ok(validateOpenBank(openFamilies, fabricatedVerification).some(error => error.includes('verification')));
});
