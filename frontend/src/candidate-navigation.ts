import type { Candidate, Page, TestResult } from './model';

/** A completed test awaiting review opens the personal profile without confirming its grade. */
export function resolveCandidatePage(requested: Page, surveyComplete: boolean, confirmed: Candidate['confirmed'], history: readonly TestResult[]): Page {
  if (!surveyComplete) return 'onboarding';
  if (requested === 'onboarding' || requested === 'invitations') return requested;
  const provenCategory = confirmed && history.some(result => result.passed
    && result.specialization === confirmed.specialization && result.grade === confirmed.grade
    && result.date === confirmed.date && result.score === confirmed.score);
  const awaitingReview = history.some(result => result.pending === true && !result.annulled && !result.invalidated);
  return provenCategory || awaitingReview ? requested : 'assessment';
}
