// Research corpus, separate from both live MC questions and the earlier open bank.
// No production API imports this module. Solutions and rubrics are private.
import { randomInt } from 'node:crypto';
import { specializationOptions, stackOptions } from '../shared/catalog.ts';
import { foundationQuestions } from './review-bank/foundations.mjs';
import { engineeringQuestions } from './review-bank/engineering.mjs';
import { dataQuestions } from './review-bank/data.mjs';
import { operationsQuestions } from './review-bank/operations-quality.mjs';
import { productQuestions } from './review-bank/product-design.mjs';
import { embeddedQuestions } from './review-bank/embedded.mjs';
import { reviewSources as sources } from './review-bank/sources.mjs';
import { freeze, reviewGrades, reviewStatus, reviewVersion } from './review-bank/schema.mjs';
import { withProvenance } from './review-bank/provenance.mjs';

export { reviewGrades, reviewStatus, reviewVersion };
export const reviewSources = freeze(sources);
export const reviewQuestions = freeze([
  ...foundationQuestions, ...engineeringQuestions, ...dataQuestions,
  ...operationsQuestions, ...productQuestions, ...embeddedQuestions,
].map(question => withProvenance(question, sources)));

const specializations = specializationOptions.map(item => item.value);
const text = value => typeof value === 'string' && value.trim().length > 0;
// A guard for trivial numeric substitutions, not a semantic independence proof.
const conceptualFingerprint = value => value.normalize('NFKC').toLowerCase()
  .replace(/\d+(?:[.,]\d+)*/gu, '#').replace(/\s+/gu, ' ').trim();

export function validateReviewBank(questions = reviewQuestions, sourceRecords = reviewSources) {
  const errors = [], ids = new Set(), sourceIds = new Set(), fingerprints = new Map();
  for (const source of sourceRecords) {
    if (!text(source.id) || sourceIds.has(source.id)) errors.push('Duplicate/invalid source: ' + source.id);
    sourceIds.add(source.id);
    if (!text(source.title) || !text(source.publisher) || !/^https:\/\//u.test(source.url || '')
      || source.accessedAt !== '2026-10-10' || !source.topics?.length
      || !['opened', 'search-index', 'index-only'].includes(source.verification)) errors.push('Invalid provenance: ' + source.id);
    if (source.verification !== 'opened' && !text(source.evidence)) errors.push('Missing verification limit: ' + source.id);
  }
  for (const question of questions) {
    const name = question.id;
    if (!text(name) || ids.has(name)) errors.push('Duplicate/invalid question ID: ' + name);
    ids.add(name);
    for (const field of ['familyId', 'competencyId', 'competency', 'title', 'prompt', 'intent', 'solutionPath']) {
      if (!text(question[field])) errors.push(name + ': missing ' + field);
    }
    if (!reviewGrades.includes(question.grade)) errors.push(name + ': unknown grade');
    if (!Array.isArray(question.specializations) || !question.specializations.length
      || question.specializations.some(item => !specializations.includes(item))) errors.push(name + ': invalid specialization');
    if (!['code', 'sql', 'calculation', 'case'].includes(question.answerFormat)) errors.push(name + ': invalid answer format');
    if (!Number.isInteger(question.estimatedMinutes) || question.estimatedMinutes < 5 || question.estimatedMinutes > 60) errors.push(name + ': invalid time estimate');
    if (!Array.isArray(question.testedSkills) || question.testedSkills.some(item => !stackOptions.includes(item))) errors.push(name + ': unknown filter skill');
    if (!question.sourceIds?.length || question.sourceIds.some(id => !sourceIds.has(id))) errors.push(name + ': unresolvable source');
    if (!question.sourceRefs?.length || question.sourceUrl !== question.sourceRefs[0].url
      || question.sourceRefs.some(ref => !question.sourceIds.includes(ref.sourceId)
        || sourceRecords.find(source => source.id === ref.sourceId)?.url !== ref.url
        || !['topic-reference', 'technical-reference'].includes(ref.relationship))) errors.push(name + ': invalid source links');
    if (question.difficulty?.rank !== reviewGrades.indexOf(question.grade) + 1
      || !text(question.difficulty?.rationale) || question.difficulty?.calibration !== 'editorial-estimate') errors.push(name + ': missing provisional difficulty');
    if (!Array.isArray(question.rubric) || question.rubric.length < 3 || question.rubric.some(item => !text(item.expected))) errors.push(name + ': incomplete rubric');
    if (!Array.isArray(question.criticalErrors) || !question.criticalErrors.length || question.criticalErrors.some(item => !text(item))) errors.push(name + ': missing critical error');
    if (question.review?.active !== false || question.review?.approvedForCertification !== false
      || question.review?.status !== 'pending-user-review') errors.push(name + ': draft must not certify');
    if (question.origin?.kind !== 'original-source-informed-scenario' || question.origin?.copiedSourceText !== false) errors.push(name + ': missing authorship');
    if (!question.generationContract?.reject?.includes('numbers-only substitution')
      || question.generationContract?.minimumChangedDimensions < 3) errors.push(name + ': weak future variant contract');
    if (text(question.prompt)) {
      const fingerprint = conceptualFingerprint(question.prompt);
      if (fingerprints.has(fingerprint)) errors.push(name + ': exact/numeric-only duplicate of ' + fingerprints.get(fingerprint));
      fingerprints.set(fingerprint, name);
    }
  }
  const competencies = [...new Set(questions.map(item => item.competencyId))];
  for (const competencyId of competencies) for (const grade of reviewGrades) {
    if (questions.filter(item => item.competencyId === competencyId && item.grade === grade).length !== 1) errors.push('Expected one independent problem per competency/grade: ' + competencyId + '/' + grade);
  }
  for (const specialization of specializations) for (const grade of reviewGrades) {
    if (!questions.some(item => item.specializations?.includes(specialization) && item.grade === grade)) errors.push('Missing specialization/grade: ' + specialization + '/' + grade);
  }
  for (const skill of stackOptions) {
    if (!questions.some(item => item.testedSkills?.includes(skill))) errors.push('Uncovered filter skill: ' + skill);
  }
  return errors;
}

const errors = validateReviewBank();
if (errors.length) throw new Error('Invalid review corpus:\n' + errors.join('\n'));

export function getReviewProgram(specialization, grade) {
  if (!specializations.includes(specialization) || !reviewGrades.includes(grade)) throw new RangeError('Unknown review program');
  return freeze({ id: `research:${specialization}:${grade}`, version: reviewVersion, specialization, grade,
    review: reviewStatus, questions: reviewQuestions.filter(item => item.grade === grade && item.specializations.includes(specialization)) });
}

/** Author-facing question sheet: intentionally omits solutions, rubrics and generator hints. */
export function reviewSheet(question) {
  return freeze({ id: question.id, competency: question.competency, grade: question.grade, title: question.title,
    prompt: question.prompt, answerFormat: question.answerFormat, estimatedMinutes: question.estimatedMinutes,
    specializations: [...question.specializations], testedSkills: [...question.testedSkills], sourceIds: [...question.sourceIds],
    sourceUrl: question.sourceUrl, sourceRefs: question.sourceRefs });
}

/** Uniform draw over competencies within a grade; three distinct competencies by default. */
export function sampleReviewQuestions(grade, count = 3, { randomIndex = randomInt } = {}) {
  if (!reviewGrades.includes(grade)) throw new RangeError('Unknown grade');
  const pool = reviewQuestions.filter(item => item.grade === grade);
  if (!Number.isInteger(count) || count < 1 || count > new Set(pool.map(item => item.competencyId)).size) throw new RangeError('Invalid sample size');
  const chosen = [], seen = new Set();
  while (chosen.length < count) {
    const index = randomIndex(pool.length);
    if (!Number.isInteger(index) || index < 0 || index >= pool.length) throw new RangeError('Invalid random index');
    const [question] = pool.splice(index, 1);
    if (!seen.has(question.competencyId)) { chosen.push(reviewSheet(question)); seen.add(question.competencyId); }
  }
  return freeze(chosen);
}

export function reviewCoverage() {
  const counts = predicate => Object.fromEntries(reviewGrades.map(grade => [grade,
    reviewQuestions.filter(item => item.grade === grade && predicate(item)).length]));
  return {
    version: reviewVersion, review: reviewStatus, total: reviewQuestions.length,
    competencies: new Set(reviewQuestions.map(item => item.competencyId)).size,
    sources: reviewSources.length, filterSkills: stackOptions.length,
    byGrade: counts(() => true),
    bySpecialization: Object.fromEntries(specializations.map(name => [name, counts(item => item.specializations.includes(name))])),
    bySkill: Object.fromEntries(stackOptions.map(name => [name, counts(item => item.testedSkills.includes(name))])),
    byFormat: Object.fromEntries(['code', 'sql', 'calculation', 'case'].map(format => [format, reviewQuestions.filter(item => item.answerFormat === format).length])),
  };
}
