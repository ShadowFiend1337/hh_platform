import { industryOptions, isSpecialization } from '../shared/catalog.ts';
import { isGrade } from '../shared/grading.ts';
import { threshold } from './assessment.mjs';

export const PROFILE_PUBLICATION_POLICY = 'confirmed-selection-unconfirmed-separate-mode-v2';
export const CONFIRMATION_ORDER_POLICY = Object.freeze({
  version: 'confirmed-first-stable-partition-v1',
  admission: 'unchanged',
  withinGroups: 'preserved',
});
const confirmationOrder = new WeakMap();

/** Server-local evidence that the publication priority actually ran. */
export function confirmationOrdering(item) {
  return confirmationOrder.get(item) || null;
}

const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const sameValues = (left, right) => Array.isArray(left) && Array.isArray(right)
  && left.length === right.length && new Set(left).size === left.length
  && new Set(right).size === right.length && left.every(value => right.includes(value));

/** A self-reported category is never proof, even when its shape is valid. */
export function verifiedProfileConfirmation(proof, owner) {
  if (!nonempty(owner) || proof?.owner !== owner || !nonempty(proof.id)
    || proof.attempt?.id !== proof.id || proof.result?.id !== proof.id
    || proof.result.passed !== true || !Number.isInteger(proof.result.score)
    || proof.result.score < threshold || proof.result.score > 100
    || !isSpecialization(proof.result.specialization) || !isGrade(proof.result.grade)
    || proof.result.specialization !== proof.attempt.specialization
    || proof.result.grade !== proof.attempt.grade
    || !nonempty(proof.result.surveyId) || proof.result.surveyId !== proof.attempt.surveyId
    || !nonempty(proof.result.date) || !Number.isFinite(Date.parse(proof.result.date))) return null;
  const { specialization, grade, score, date, surveyId } = proof.result;
  return { specialization, grade, score, date, surveyId };
}

/** Match the same current questionnaire the candidate must use for a test. */
export function completedPublicationSurvey(person, surveys = []) {
  if (!nonempty(person?.surveyCompletedAt) || !Number.isFinite(Date.parse(person.surveyCompletedAt))
    || !industryOptions.includes(person.industry) || !nonempty(person.experience)
    || !Array.isArray(surveys)) return null;
  return surveys.find(survey => nonempty(survey?.id) && survey.date === person.surveyCompletedAt
    && survey.industry === person.industry && survey.professionalRole === person.professionalRole
    && survey.specialization === person.specialization && survey.desiredGrade === person.desiredGrade
    && survey.experience === person.experience && sameValues(survey.stack, person.stack)
    && sameValues(survey.softSkills, person.softSkills || [])) || null;
}

/**
 * An explicitly published, completed questionnaire is discoverable before a
 * successful test. The server-owned proof alone controls the public category.
 * Account/realm checks, contact permissions and demo provenance remain with
 * their existing services; this helper does not grant any of those privileges.
 */
export function profilePublication(person, { owner, proof = null, surveys = [] } = {}) {
  const confirmed = verifiedProfileConfirmation(proof, owner);
  const ready = Boolean(person && nonempty(person.name) && nonempty(person.email)
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(person.email)
    && nonempty(person.professionalRole) && isSpecialization(person.specialization)
    && isGrade(person.desiredGrade) && Array.isArray(person.stack) && person.stack.length
    && person.stack.every(nonempty));
  const eligible = ready && Boolean(confirmed || completedPublicationSurvey(person, surveys));
  const projected = { ...person, confirmed, gradeChangedAt: confirmed ? person?.gradeChangedAt || confirmed.date : null };
  delete projected._proofId;
  return { eligible, published: eligible && person.consent === true && person.visible === true,
    status: confirmed ? 'confirmed' : 'unconfirmed', person: projected };
}

/** Stable partition only; admission, scores and each group's ranking stay intact. */
export function confirmedFirst(items) {
  const confirmed = [], unconfirmed = [];
  for (const item of items) (item.person?.confirmed ? confirmed : unconfirmed).push(item);
  const ordered = [...confirmed, ...unconfirmed];
  const positions = new Map(items.map((item, index) => [item, index]));
  const mixedGroups = confirmed.length > 0 && unconfirmed.length > 0;
  ordered.forEach((item, index) => confirmationOrder.set(item, Object.freeze({
    policy: CONFIRMATION_ORDER_POLICY.version,
    group: item.person?.confirmed ? 'confirmed' : 'unconfirmed',
    mixedGroups,
    changedPosition: positions.get(item) !== index,
  })));
  return ordered;
}
