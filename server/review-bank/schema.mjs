// Private, provisional authoring data. Never use these drafts to certify a grade.
import { gradeOptions } from '../../shared/grading.ts';

export const reviewGrades = gradeOptions.map(item => item.value);
export const reviewVersion = '2026.10.10-research-v1';
export const reviewStatus = Object.freeze({ status: 'pending-user-review', active: false,
  approvedForCertification: false, independentlyReviewed: false, empiricallyCalibrated: false });

export function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Every row is a separately authored problem, not a grade suffix on a shared prompt. */
export function competency(id, label, specializations, sourceIds, rows) {
  if (rows.length !== reviewGrades.length) throw new Error(id + ': five distinct grade problems required');
  return rows.map((row, index) => {
    const [title, prompt, answerFormat, minutes, intent, solutionPath, criteria, criticalErrors, testedSkills, difficultyRationale] = row;
    return {
      id: `research:${id}:${reviewGrades[index]}`, familyId: `research:${id}:${reviewGrades[index]}`,
      competencyId: id, competency: label, specializations, grade: reviewGrades[index], title, prompt,
      answerFormat, estimatedMinutes: minutes, testedSkills, sourceIds,
      origin: { kind: 'original-source-informed-scenario', copiedSourceText: false },
      difficulty: { rank: index + 1, rationale: difficultyRationale, calibration: 'editorial-estimate' },
      intent, solutionPath,
      rubric: criteria.split('|').map((expected, criterionIndex) => ({
        id: `${id}:${reviewGrades[index]}:${criterionIndex + 1}`, expected: expected.trim(),
        scale: { 0: 'Нет необходимого свидетельства либо решение противоречит условию.',
          1: 'Есть верная часть, но условие критерия выполнено не полностью.',
          2: 'Критерий выполнен; ход решения или артефакт приведён в ответе.' },
      })),
      criticalErrors: criticalErrors.split('|').map(item => item.trim()),
      generationContract: {
        preserve: ['intent', 'solutionPath', 'testedSkills', 'difficulty.rationale', 'rubric evidence requirements'],
        rewrite: ['domain and actors', 'data representation', 'narrative and question wording', 'nonessential constraints'],
        minimumChangedDimensions: 3,
        reject: ['numbers-only substitution', 'names-only substitution', 'paraphrase of the same scenario',
          'answer revealed by the stem', 'different solution strategy', 'simpler reasoning than the source problem'],
        validation: 'A future adapter must map every rubric criterion to the new scenario and independently solve it before admission.',
      },
      review: reviewStatus,
    };
  });
}
