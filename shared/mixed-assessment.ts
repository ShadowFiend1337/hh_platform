/** Versioned scoring/delivery policy shared by the API and candidate interface. */
export const mixedAssessmentPolicy = Object.freeze({
  version: '2026.10.10-mixed-v1', closedCount: 15, openCount: 5,
  closedWeight: 0.5, openWeight: 0.5, maxAnswerLength: 12000,
  preparationMinutes: 20, readyMinutes: 30, finalSubmissionGraceMinutes: 10,
});
export const closedQuestionMinutes = Object.freeze({ Intern: 3, Junior: 4, Middle: 5, Senior: 6, Lead: 7 });
