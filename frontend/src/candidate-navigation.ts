import type { Page } from './model';

/** The personal profile is available after the questionnaire, regardless of test results. */
export function resolveCandidatePage(requested: Page, surveyComplete: boolean): Page {
  return surveyComplete ? requested : 'onboarding';
}
