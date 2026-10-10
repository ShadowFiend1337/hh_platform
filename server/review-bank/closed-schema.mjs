import { createHash } from 'node:crypto';
import { advancedDistractors } from './closed-distractors.mjs';
// Authoring order is correct answer first; construction permutes it for the review sheet.
export const choice = (prompt, options, explanation) => ({ prompt, options: options.split('|').map(s => s.trim()), explanation });
export const caseRow = (context, ...questions) => ({ context, questions });

export function buildClosedCases(openQuestions, rowsByCompetency) {
  return openQuestions.map(open => {
    const row = rowsByCompetency[open.competencyId]?.[open.difficulty.rank - 1];
    if (!row || row.questions.length !== 2) throw new Error(open.id + ': two closed questions required');
    const questions = row.questions.map((item, index) => {
      if (item.options.length !== 4) throw new Error(open.id + ': four options required');
      const alternatives = advancedDistractors[`${open.competencyId}:${open.grade}:${index + 1}`];
      const authorOptions = alternatives ? [item.options[0], ...alternatives] : item.options;
      if (authorOptions.length !== 4) throw new Error(open.id + ': invalid advanced distractors');
      const correct = createHash('sha256').update(`${open.id}:${index}`).digest()[0] % 4;
      const options = authorOptions.map((_, position) => authorOptions[(position - correct + 4) % 4]);
      return { id: `${open.id.replace('research:', 'research-mc:')}:${index + 1}`,
        prompt: item.prompt, options, correct, explanation: item.explanation,
        sourceUrl: open.sourceUrl, sourceRefs: open.sourceRefs };
    });
    return { id: open.id.replace('research:', 'research-mc:'), pairedOpenId: open.id,
      familyId: open.familyId, competencyId: open.competencyId, competency: open.competency,
      specializations: open.specializations, grade: open.grade, title: open.title,
      prompt: row.context, answerFormat: 'single-choice-case', questions,
      estimatedMinutes: open.estimatedMinutes, testedSkills: open.testedSkills,
      sourceIds: open.sourceIds, sourceUrl: open.sourceUrl, sourceRefs: open.sourceRefs,
      origin: { kind: 'original-source-informed-closed-adaptation', copiedSourceText: false },
      difficulty: { ...open.difficulty, calibration: 'editorial-estimate',
        formatLimit: 'Recognition of a solution does not establish independent ability to construct it.' },
      generationContract: open.generationContract, review: open.review };
  });
}
