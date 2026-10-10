import { reviewQuestions, reviewSources, reviewGrades, reviewVersion } from './review-bank.mjs';
import { freeze } from './review-bank/schema.mjs';
import { buildClosedCases } from './review-bank/closed-schema.mjs';
import { closedFoundations } from './review-bank/closed-foundations.mjs';
import { closedEngineering } from './review-bank/closed-engineering.mjs';
import { closedData } from './review-bank/closed-data.mjs';
import { closedOperations } from './review-bank/closed-operations.mjs';
import { closedProductEmbedded } from './review-bank/closed-product-embedded.mjs';

export const closedReviewVersion = `${reviewVersion}-mc-v1`;
export const closedReviewCases = freeze(buildClosedCases(reviewQuestions, {
  ...closedFoundations, ...closedEngineering, ...closedData, ...closedOperations, ...closedProductEmbedded,
}));

export function validateClosedReviewBank(cases = closedReviewCases, open = reviewQuestions, sources = reviewSources) {
  const errors = [], ids = new Set(), paired = new Set(), prompts = new Set();
  const sourceMap = new Map(sources.map(s => [s.id, s]));
  const validText = value => typeof value === 'string' && value.trim().length > 0;
  for (const item of cases) {
    const pair = open.find(q => q.id === item.pairedOpenId);
    if (!pair || paired.has(item.pairedOpenId)) errors.push(item.id + ': invalid pair');
    paired.add(item.pairedOpenId);
    if (ids.has(item.id)) errors.push(item.id + ': duplicate id');
    ids.add(item.id);
    if (!validText(item.prompt) || !validText(item.title)) errors.push(item.id + ': empty case');
    if (item.grade !== pair?.grade || item.competencyId !== pair?.competencyId
      || item.difficulty?.rank !== pair?.difficulty.rank
      || JSON.stringify(item.testedSkills) !== JSON.stringify(pair?.testedSkills)
      || JSON.stringify(item.specializations) !== JSON.stringify(pair?.specializations)) errors.push(item.id + ': changed grade/coverage');
    if (item.review?.active !== false || item.review?.approvedForCertification !== false
      || item.review?.status !== 'pending-user-review') errors.push(item.id + ': draft must not certify');
    if (item.origin?.kind !== 'original-source-informed-closed-adaptation' || item.origin?.copiedSourceText !== false) errors.push(item.id + ': missing origin');
    if (item.questions?.length !== 2) errors.push(item.id + ': two questions required');
    for (const question of item.questions || []) {
      if (ids.has(question.id)) errors.push(question.id + ': duplicate id');
      ids.add(question.id);
      if (!validText(question.prompt) || !validText(question.explanation)
        || question.options?.length !== 4 || !question.options.every(validText)
        || new Set(question.options).size !== 4 || !Number.isInteger(question.correct)
        || question.correct < 0 || question.correct > 3) errors.push(question.id + ': invalid choices/key');
      const fingerprint = `${item.prompt}\n${question.prompt}`.normalize('NFKC').toLowerCase().replace(/\d+(?:[.,]\d+)*/gu, '#');
      if (prompts.has(fingerprint)) errors.push(question.id + ': duplicate prompt');
      prompts.add(fingerprint);
      if (question.sourceUrl !== item.sourceUrl) errors.push(question.id + ': missing inherited source');
      if (JSON.stringify(question.sourceRefs) !== JSON.stringify(item.sourceRefs)) errors.push(question.id + ': changed source references');
    }
    if (item.sourceUrl !== item.sourceRefs?.[0]?.url || !item.sourceRefs?.length
      || item.sourceRefs.some(ref => sourceMap.get(ref.sourceId)?.url !== ref.url)) errors.push(item.id + ': invalid provenance');
  }
  if (paired.size !== open.length) errors.push('Closed corpus must pair every open case');
  return errors;
}

const errors = validateClosedReviewBank();
if (errors.length) throw new Error('Invalid closed corpus:\n' + errors.join('\n'));

export function closedReviewSheet(item) {
  return freeze({ id: item.id, pairedOpenId: item.pairedOpenId, title: item.title, competency: item.competency,
    grade: item.grade, prompt: item.prompt, sourceUrl: item.sourceUrl, sourceRefs: item.sourceRefs,
    questions: item.questions.map(q => ({ id: q.id, prompt: q.prompt, options: [...q.options], sourceUrl: q.sourceUrl })) });
}

export function closedReviewCoverage() {
  return { version: closedReviewVersion, cases: closedReviewCases.length,
    questions: closedReviewCases.reduce((n, item) => n + item.questions.length, 0),
    competencies: new Set(closedReviewCases.map(q => q.competencyId)).size,
    byGrade: Object.fromEntries(reviewGrades.map(grade => [grade, {
      cases: closedReviewCases.filter(item => item.grade === grade).length,
      questions: closedReviewCases.filter(item => item.grade === grade).reduce((n,item) => n + item.questions.length, 0),
    }])) };
}
