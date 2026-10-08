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
      const family = openFamilies.find(family => family.id === question.familyId);
      assert.ok(question.prompt.includes(family.levels[grade].task));
      const subjectCriteria = family.levels[grade].criteria || family.criteria;
      assert.equal(question.rubricOrigin, family.levels[grade].criteria ? 'grade-specific-author-draft' : 'shared-family-requires-grade-review');
      assert.deepEqual(question.rubric.filter(item => item.id !== 'level-depth').map(item => item.anchors[2]), subjectCriteria.map(item => item.meets));
      if (family.levels[grade].criteria) {
        if (family.levels[grade].referenceAnswer) assert.equal(question.referenceAnswer.scenario, family.levels[grade].referenceAnswer);
        else {
          for (const criterion of subjectCriteria) assert.ok(question.referenceAnswer.scenario.includes(criterion.meets));
          assert.ok(question.referenceAnswer.scenario.includes(family.levels[grade].expected));
        }
      }
      assert.ok(question.referenceAnswer.level.length);
      assert.deepEqual(Object.keys(question.rubric.find(criterion => criterion.id === 'level-depth').anchors), ['0', '1', '2', '3']);
      assert.ok(question.acceptableAlternatives.length && question.criticalErrors.length);
      assert.ok(question.sources.every(source => source.url.startsWith('https://')));
    }
  }
  assert.equal(openBankReview.independentlyReviewed, false);
  assert.equal(openBankReview.empiricallyCalibrated, false);
});

test('An ADC Intern reference includes the actual result and only the requested grade evidence', () => {
  const question = getOpenProgram('Embedded', 'Intern').questions.find(item => item.familyId === 'open-embedded-adc-scale');
  assert.ok(question.referenceAnswer.scenario.includes('1.6504 В'), 'The reference must solve 2048*3.3/4095, not just name an action');
  assert.ok(question.referenceAnswer.scenario.includes('code=0 даёт 0 В'));
  assert.ok(!question.referenceAnswer.scenario.includes('датчик 2% не обеспечивают'), 'Do not inject the Middle accuracy-budget task');
});

test('A stronger anchor keeps the required result and adds evidence instead of replacing it', () => {
  for (const family of openFamilies) {
    const criteria = [...family.criteria, ...Object.values(family.levels).flatMap(level => level.criteria || [])];
    for (const criterion of criteria) assert.ok(criterion.strong.includes(criterion.meets), family.id + '/' + criterion.id);
  }
  const range = getOpenProgram('Backend', 'Junior').questions
    .find(item => item.familyId === 'open-backend-quantity-validation').rubric.find(item => item.label === 'Диапазон');
  assert.ok(range.anchors[3].includes('конечные целые 1..99'));
  assert.ok(range.anchors[3].includes('0,99,100 и дробь'));
});

test('The normalization Intern case supplies an input and checks preservation of internal spaces', () => {
  const question = getOpenProgram('QA', 'Intern').questions.find(item => item.familyId === 'open-qa-normalization-properties');
  assert.ok(question.prompt.includes('normalize("  Ab C  ")'));
  const normalize = value => value.replace(/^ +| +$/gu, '').replace(/[A-Z]/gu, character => character.toLowerCase());
  const result = normalize('  Ab C  ');
  assert.equal(result, 'ab c');
  assert.ok(question.referenceAnswer.level.includes('"' + result + '"'));
  assert.equal(normalize(result), result);
  assert.equal(normalize('  АБ C  '), 'АБ c', 'The authored contract only lowercases ASCII letters');
});

test('Both independent forms retain practical coverage in every competency and the program extra group', () => {
  for (const specialization of openSpecializations) for (const grade of openGrades) {
    const program = getOpenProgram(specialization, grade);
    const first = sampleOpenQuestions(specialization, grade);
    const second = sampleOpenQuestions(specialization, grade, { excludedFamilyIds: first.questions.map(item => item.familyId) });
    for (const form of [first, second]) {
      assert.ok(form.questions.filter(item => item.practical).length >= program.practicalPolicy.minimum);
      for (const group of openGroups) {
        const count = form.questions.filter(item => item.group === group && item.practical).length;
        assert.ok(count >= (group === program.practicalPolicy.extraGroup ? 2 : 1), specialization + '/' + grade + '/' + group);
      }
    }
  }
  const program = getOpenProgram('UXUI', 'Junior');
  assert.ok(program.questions.some(item => item.practical && item.answerFormat === 'text'));
  const practical = program.questions.filter(item => item.practical).map(item => item.familyId);
  assert.throws(() => sampleOpenQuestions('UXUI', 'Junior', { excludedFamilyIds: practical }), /Not enough unseen practical families/u);
});

test('Grade-specific subject anchors override the family fallback and preserve reusable program skills', () => {
  const families = openFamilies.filter(family => Object.values(family.levels).every(level => level.criteria));
  assert.ok(families.length > 0);
  for (const family of families) {
    const intern = getOpenProgram(family.specialization, 'Intern').questions.find(item => item.familyId === family.id);
    const lead = getOpenProgram(family.specialization, 'Lead').questions.find(item => item.familyId === family.id);
    assert.notDeepEqual(intern.rubric.slice(0, -1), lead.rubric.slice(0, -1), family.id);
    assert.ok(intern.rubric.slice(0, -1).every(item => item.skillId === undefined || item.skillId.startsWith(family.specialization + ':' + family.group + ':')));
  }
  const broken = structuredClone(openFamilies);
  const family = broken.find(item => item.levels.Intern.criteria);
  family.levels.Intern.criteria[0].skillId = (family.specialization === 'QA' ? 'ML' : 'QA') + ':A:foreign-skill';
  assert.ok(validateOpenBank(broken, openSources).some(error => error.includes('program scope')));
  family.levels.Intern.criteria[0].skillId = family.specialization + ':' + family.group + ':skill';
  family.levels.Intern.criteria[0].strong = family.levels.Intern.criteria[0].meets;
  assert.ok(validateOpenBank(broken, openSources).some(error => error.includes('/Intern') && error.includes('indistinguishable rubric')));
  const skillFamilies = new Map();
  for (const item of families) for (const level of Object.values(item.levels)) for (const criterion of level.criteria) {
    if (!criterion.skillId) continue;
    if (!skillFamilies.has(criterion.skillId)) skillFamilies.set(criterion.skillId, new Set());
    skillFamilies.get(criterion.skillId).add(item.id);
  }
  assert.ok([...skillFamilies.values()].some(ids => ids.size > 1), 'Program skills must be reusable across independent families');
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

test('ML retains the planned ten unseen continuation families in any one competency and three distinct author forms', () => {
  for (const grade of openGrades) {
    const first = sampleOpenQuestions('ML', grade);
    const disclosed = new Set(first.questions.map(item => item.familyId));
    const program = getOpenProgram('ML', grade);
    for (const group of openGroups) {
      assert.ok(program.questions.filter(item => item.group === group && !disclosed.has(item.familyId)).length >= 10);
    }
    const second = sampleOpenQuestions('ML', grade, { excludedFamilyIds: [...disclosed] });
    second.questions.forEach(item => disclosed.add(item.familyId));
    const third = sampleOpenQuestions('ML', grade, { excludedFamilyIds: [...disclosed] });
    const all = [...first.questions, ...second.questions, ...third.questions];
    assert.equal(all.length, 60);
    assert.equal(new Set(all.map(item => item.familyId)).size, 60);
    for (const form of [first, second, third]) assert.ok(form.questions.filter(item => item.practical).length >= 5);
  }
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
