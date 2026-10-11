import { createHash, randomInt, randomUUID } from 'node:crypto';
import { bankVersion, programs } from './bank.mjs';
import { analyzeVacancy, vacancyExamples } from './vacancies.mjs';
import { industryOptions } from '../shared/catalog.ts';
import { gradeOptions } from '../shared/grading.ts';
import { MAX_STACK_SKILLS, MAX_SOFT_SKILLS } from '../shared/resume-limits.ts';

export const threshold = 70;
/** A confident result unlocks the next grade's test without the 90-day wait. */
export const confidentThreshold = 90;
export const expiresInMinutes = 30;
/** Two scored items from every family: 3 topics x 2 difficulty slots x 2 = 12. */
export const itemsPerFamily = 2;
export const questionSeconds = 120;
/**
 * A pass by the narrowest margin (9 of 12, score 70-79) gets a clarifying block: one
 * more fresh item from every family (6 items); the decision then uses all 18 items with
 * the same threshold (13 of 18). Re-checking marginal passes lowers false confirmations
 * of the grade; a block for failing scores would act as a second chance and raise them
 * (docs/assessment_validation_results.md).
 */
export const borderline = Object.freeze({ from: 70, to: 80, perFamily: 1, extraMinutes: 13 });
/** Network and rendering grace for the per-question limit. */
export const answerGraceMs = 8000;
/** Departures from the test (tab switch, window blur, leaving full screen) before annulment. */
export const maxDepartures = 3;
export const strikeKinds = Object.freeze(['focus_lost', 'visibility_hidden', 'fullscreen_exit', 'second_tab']);
export const signalKinds = Object.freeze(['copy_blocked', 'paste_blocked', 'shortcut_blocked', 'screenshot_key']);
export const integrityKinds = Object.freeze([...strikeKinds, ...signalKinds]);
const gradeOrder = gradeOptions.map(item => item.value);

export class RequestError extends Error {
  constructor(status, message, details) { super(message); this.status = status; if (details) this.details = details; }
}
export const digest = value => createHash('sha256').update(value).digest('hex');

function shuffled(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const next = randomInt(index + 1);
    [result[index], result[next]] = [result[next], result[index]];
  }
  return result;
}

export function getProgram(specialization, grade) {
  const program = Object.hasOwn(programs, specialization) && Object.hasOwn(programs[specialization], grade) ? programs[specialization][grade] : null;
  if (!program) throw new RequestError(400, 'Выберите поддерживаемую специализацию и грейд.');
  return program;
}

export function nextGrade(grade) {
  const index = gradeOrder.indexOf(grade);
  return index >= 0 && index < gradeOrder.length - 1 ? gradeOrder[index + 1] : null;
}

export function programInfo(specialization, grade, bank, { retryDays: retry = 7 } = {}) {
  const program = getProgram(specialization, grade);
  return { bankVersion, topics: program.topics, questionCount: program.families.length * itemsPerFamily, threshold, expiresInMinutes,
    questionSeconds, maxDepartures, confidentThreshold, retryDays: retry, delivery: 'sequential',
    bank: bank ? bank.summary(specialization, grade) : { authored: program.families.reduce((sum, family) => sum + family.variants.length, 0), generated: null },
    examples: vacancyExamples.filter(item => item.specialization === specialization && item.grade === grade).map(({ id, title, description }) => ({ id, title, description })) };
}

export function validateSurvey(survey) {
  const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  const list = (value, max, min = 1) => Array.isArray(value) && value.length >= min && value.length <= max && value.every(item => text(item, 80)) && new Set(value).size === value.length;
  if (!survey || !text(survey.id, 100) || !text(survey.date, 40) || !Number.isFinite(Date.parse(survey.date))
    || !text(survey.industry, 100) || !industryOptions.includes(survey.industry) || !text(survey.professionalRole, 100) || !text(survey.experience, 100)
    || !list(survey.stack, MAX_STACK_SKILLS) || !list(survey.softSkills, MAX_SOFT_SKILLS, 0)) throw new RequestError(400, 'Сначала заполните анкету.');
  getProgram(survey.specialization, survey.desiredGrade);
  return { id: survey.id, date: survey.date, industry: survey.industry, professionalRole: survey.professionalRole,
    specialization: survey.specialization, desiredGrade: survey.desiredGrade, experience: survey.experience,
    stack: [...survey.stack], softSkills: [...survey.softSkills] };
}

/** Seed-only selection used when no dynamic bank is attached (unit tests, offline tools). */
function seedPick(family, count, seen, relevance) {
  const fresh = family.variants.filter(variant => !seen.has(variant.id));
  const ordered = pool => shuffled(pool).sort((a, b) => relevance(b) - relevance(a));
  const chosen = ordered(fresh).slice(0, count);
  if (chosen.length < count) chosen.push(...ordered(family.variants.filter(variant => !chosen.includes(variant))).slice(0, count - chosen.length));
  return chosen.map(variant => ({ ...variant, origin: 'seed' }));
}

function materialize(item, { topic, familyId, difficulty, pilot = false }) {
  const options = shuffled(item.options.map((text, index) => ({ id: randomUUID(), text, correct: index === item.correct })));
  return { id: randomUUID(), topic, text: item.text, options: options.map(({ id, text }) => ({ id, text })),
    correctOptionId: options.find(option => option.correct).id, familyId, variantId: item.id, difficulty,
    skills: item.skills || [], origin: item.origin || 'seed', pilot, timeLimitSec: questionSeconds };
}

/**
 * Builds a private attempt. `recent` are previous attempts of the same owner:
 * their items are excluded while fresh equivalents remain. With a dynamic bank,
 * active generated items join the scored pool and one pilot item is added unscored.
 */
export function createAttempt(surveyInput, vacancyDescription = '', recent = [], now = Date.now(), { bank = null } = {}) {
  const survey = validateSurvey(surveyInput);
  if (typeof vacancyDescription !== 'string' || vacancyDescription.length > 4000) throw new RequestError(400, 'Описание вакансии — до 4000 символов.');
  const program = getProgram(survey.specialization, survey.desiredGrade);
  const description = vacancyDescription.trim();
  const vacancy = description ? analyzeVacancy(description, survey.specialization, survey.desiredGrade) : null;
  const seen = new Set(recent.flatMap(attempt => attempt.questions.map(item => item.variantId)));
  const relevance = variant => (variant.skills || []).filter(skill => vacancy?.matchedSkills.includes(skill)).length;
  const selected = program.topics.flatMap(topic => [1, 2].flatMap(difficulty => {
    const families = program.families.filter(family => family.topic === topic && family.difficulty === difficulty);
    const priority = families.filter(family => vacancy?.matchedSkills.some(skill => family.skills.includes(skill)));
    const family = shuffled(priority.length ? priority : families)[0];
    if (!family) throw new Error('Incomplete assessment blueprint');
    const picked = bank ? bank.pick(family, itemsPerFamily, { seen, relevance }) : seedPick(family, itemsPerFamily, seen, relevance);
    if (picked.length < itemsPerFamily) throw new Error('Not enough items for ' + family.id);
    return picked.map(item => materialize(item, { topic, familyId: family.id, difficulty }));
  }));
  // Vacancy emphasis changes order and selection inside slots, never the grade's core or weights.
  const questions = shuffled(selected).sort((a, b) => Number(Boolean(vacancy?.focusTopics.includes(b.topic))) - Number(Boolean(vacancy?.focusTopics.includes(a.topic))));
  const pilotItem = bank?.pilot(survey.specialization, survey.desiredGrade, seen);
  if (pilotItem) {
    // Never first: the opening question sets the pace and must count.
    const position = 1 + randomInt(questions.length);
    questions.splice(position, 0, materialize(pilotItem, { topic: pilotItem.topic, familyId: pilotItem.familyId, difficulty: pilotItem.difficulty, pilot: true }));
  }
  if (vacancy) {
    const covered = new Set(questions.filter(question => !question.pilot).flatMap(question => question.skills));
    const omitted = vacancy.matchedSkills.filter(skill => !covered.has(skill));
    vacancy.matchedSkills = vacancy.matchedSkills.filter(skill => covered.has(skill));
    vacancy.unmatchedSkills = [...new Set([...vacancy.unmatchedSkills, ...omitted])];
    vacancy.recognized = vacancy.matchedSkills.length > 0;
    vacancy.summary = 'Совпадения относятся к выбранным заданиям; общий состав теста сохранён.';
  }
  const scoredCount = questions.filter(question => !question.pilot).length;
  return {
    id: randomUUID(), bankVersion, specialization: survey.specialization, grade: survey.desiredGrade, surveyId: survey.id, survey,
    createdAt: new Date(now).toISOString(), expiresAt: new Date(now + expiresInMinutes * 60000).toISOString(),
    questions, vacancy, vacancyDescription: description, delivery: 'sequential', questionSeconds,
    blueprint: { topicCounts: Object.fromEntries(program.topics.map(topic => [topic, 2 * itemsPerFamily])),
      difficultyCounts: { '1': scoredCount / 2, '2': scoredCount / 2 }, difficultyBudget: 1.5 * scoredCount },
  };
}

/** Share of correct scored answers among the locked ones, 0-100. */
export const isOpenQuestion = question => question.type === 'open';
const closedScored = attempt => attempt.questions.filter(question => !question.pilot && !isOpenQuestion(question));

export function provisionalScore(attempt, progress) {
  const scored = closedScored(attempt);
  const correct = scored.filter(question => {
    const answer = progress?.answers?.[question.id];
    return answer && !answer.late && answer.optionId === question.correctOptionId;
  }).length;
  return Math.round(correct / scored.length * 100);
}

/**
 * Returns the attempt with a clarifying block appended, or null when the result is
 * not borderline or the attempt was already extended. Items come from the same
 * families, excluding everything this owner has seen.
 */
export function extendBorderline(attempt, score, { bank = null, recent = [], now = Date.now() } = {}) {
  if (attempt.extension || attempt.delivery !== 'sequential' || score < borderline.from || score >= borderline.to) return null;
  const program = getProgram(attempt.specialization, attempt.grade);
  const seen = new Set([...attempt.questions, ...recent.flatMap(item => item.questions)].map(question => question.variantId));
  const families = [...new Set(attempt.questions.filter(question => !question.pilot).map(question => question.familyId))]
    .map(id => program.families.find(family => family.id === id)).filter(Boolean);
  const extra = shuffled(families.flatMap(family => {
    const fresh = bank ? bank.pick(family, borderline.perFamily, { seen }) : seedPick(family, borderline.perFamily, seen, () => 0);
    return fresh.filter(item => !seen.has(item.id)).map(item => materialize(item, { topic: family.topic, familyId: family.id, difficulty: family.difficulty }));
  }));
  if (!extra.length) return null;
  return { ...attempt, questions: [...attempt.questions, ...extra],
    expiresAt: new Date(Math.max(Date.parse(attempt.expiresAt), now) + borderline.extraMinutes * 60000).toISOString(),
    extension: { reason: 'borderline', provisionalScore: score, added: extra.length, at: new Date(now).toISOString() } };
}

export function emptyProgress(attempt) {
  return { answers: {}, revealedAt: { [attempt.questions[0].id]: attempt.createdAt } };
}

function answeredCount(progress) {
  return Object.keys(progress?.answers || {}).length;
}

/**
 * Candidate-visible attempt. Sequential delivery reveals answered questions and
 * the current one only: the full test cannot be captured at once.
 */
export function publicAttempt(attempt, progress = null) {
  const { id, bankVersion, specialization, grade, surveyId, createdAt, expiresAt, blueprint, vacancy } = attempt;
  const sequential = attempt.delivery === 'sequential';
  const state = sequential ? progress || emptyProgress(attempt) : null;
  const position = sequential ? Math.min(answeredCount(state), attempt.questions.length) : 0;
  const visible = sequential ? attempt.questions.slice(0, Math.min(position + 1, attempt.questions.length)) : attempt.questions;
  const current = sequential ? attempt.questions[position] : null;
  return { id, bankVersion, specialization, grade, surveyId, createdAt, expiresAt, blueprint, vacancy,
    delivery: sequential ? 'sequential' : 'all', questionCount: attempt.questions.length,
    ...(attempt.extension ? { extension: { added: attempt.extension.added, from: attempt.questions.length - attempt.extension.added } } : {}),
    ...(attempt.openStage ? { openStage: attempt.openStage } : {}),
    questions: visible.map(question => isOpenQuestion(question)
      ? { id: question.id, type: 'open', topic: question.topic, title: question.title, text: question.text, options: [],
        answerFormat: question.answerFormat, timeLimitSec: question.timeLimitSec }
      : { id: question.id, topic: question.topic, text: question.text, options: question.options }),
    ...(sequential ? {
      position, questionSeconds: attempt.questionSeconds || questionSeconds,
      answeredIds: Object.keys(state.answers),
      currentDeadline: current && state.revealedAt[current.id]
        ? new Date(Date.parse(state.revealedAt[current.id]) + (current.timeLimitSec || questionSeconds) * 1000).toISOString() : null,
    } : {}) };
}

/**
 * Locks one answer of a sequential attempt and reveals the next question.
 * An answer after the per-question limit is stored as late and scores zero.
 */
export function recordAnswer(attempt, progressInput, input, now = Date.now()) {
  if (now >= Date.parse(attempt.expiresAt)) throw new RequestError(410, 'Время теста истекло. Начните новую попытку.');
  if (!input || typeof input !== 'object' || Object.keys(input).some(key => !['token', 'questionId', 'optionId', 'answerText'].includes(key))) {
    throw new RequestError(400, 'Некорректный ответ.');
  }
  const progress = structuredClone(progressInput || emptyProgress(attempt));
  const position = answeredCount(progress);
  const question = attempt.questions[position];
  if (!question) throw new RequestError(409, 'Все ответы уже получены.');
  if (input.questionId !== question.id) {
    const locked = progress.answers[input.questionId];
    if (locked) {
      if (locked.optionId === (input.optionId ?? null) && (locked.text ?? null) === (typeof input.answerText === 'string' ? input.answerText.trim() || null : null)) return { progress, changed: false };
      throw new RequestError(409, 'Ответ уже зафиксирован. Вернуться к вопросу нельзя.');
    }
    throw new RequestError(409, 'Сначала ответьте на текущий вопрос.');
  }
  const open = isOpenQuestion(question);
  if (open ? input.optionId !== undefined && input.optionId !== null : input.answerText !== undefined) throw new RequestError(400, 'Формат ответа не подходит к заданию.');
  if (open && input.answerText !== undefined && input.answerText !== null
    && (typeof input.answerText !== 'string' || input.answerText.length > 12000)) throw new RequestError(400, 'Ответ — текст до 12 000 символов.');
  if (!open && input.optionId !== null && input.optionId !== undefined && !question.options.some(option => option.id === input.optionId)) {
    throw new RequestError(400, 'Ответ не относится к этой попытке.');
  }
  const revealed = Date.parse(progress.revealedAt[question.id] || attempt.createdAt);
  const ms = Math.max(0, now - revealed);
  const late = ms > (question.timeLimitSec || questionSeconds) * 1000 + answerGraceMs;
  progress.answers[question.id] = open
    ? { optionId: null, text: typeof input.answerText === 'string' && input.answerText.trim() ? input.answerText.trim() : null, answeredAt: new Date(now).toISOString(), ms, late }
    : { optionId: input.optionId ?? null, answeredAt: new Date(now).toISOString(), ms, late };
  const next = attempt.questions[position + 1];
  if (next) progress.revealedAt[next.id] = new Date(now).toISOString();
  return { progress, changed: true, complete: !next };
}

function scoreAttempt(attempt, selection, now, integrity) {
  const scored = closedScored(attempt);
  const openTasks = attempt.questions.filter(isOpenQuestion);
  const isCorrect = question => {
    const answer = selection.get(question.id);
    return Boolean(answer && !answer.late && answer.optionId === question.correctOptionId);
  };
  const topics = [...new Set(scored.map(item => item.topic))];
  const competencies = topics.map(topic => {
    const questions = scored.filter(item => item.topic === topic);
    const correct = questions.filter(isCorrect).length;
    return { topic, score: Math.round(correct / questions.length * 100), correct, total: questions.length };
  });
  const correct = scored.filter(isCorrect).length;
  const score = Math.round(correct / scored.length * 100);
  const timeouts = scored.filter(question => { const answer = selection.get(question.id); return !answer || answer.late || answer.optionId === null; }).length;
  // With open tasks this is the closed-part result: the server adds the practical score
  // (automatic grading, docs/open_tasks.md); without it the closed part decides.
  const practice = openTasks.length > 0;
  const passed = score >= threshold;
  const higher = nextGrade(attempt.grade);
  const normalized = [...selection].map(([questionId, answer]) => [questionId, answer.optionId ?? (answer.text ? digest(answer.text) : null)]).sort(([a], [b]) => a.localeCompare(b));
  const responses = attempt.questions.filter(question => !isOpenQuestion(question)).map(question => ({ itemId: question.variantId, pilot: Boolean(question.pilot),
    correct: isCorrect(question), ms: selection.get(question.id)?.ms || 0 }));
  return { answerDigest: digest(JSON.stringify(normalized)), responses, result: {
    id: attempt.id, date: new Date(now).toISOString(), specialization: attempt.specialization, grade: attempt.grade,
    surveyId: attempt.surveyId, score, passed, bankVersion: attempt.bankVersion, competencies,
    vacancySkills: attempt.vacancy?.matchedSkills || [], questionCount: scored.length, timeouts,
    ...(passed && score >= confidentThreshold && higher ? { nextGradeAvailable: higher } : {}),
    ...(attempt.extension ? { clarified: true } : {}),
    ...(practice ? { closedScore: score, openCount: openTasks.length, openStatus: 'queued',
      openAnswered: openTasks.filter(question => selection.get(question.id)?.text && !selection.get(question.id)?.late).length,
      ...(openTasks.some(question => selection.get(question.id)?.expired) ? { openTimedOut: true } : {}) } : {}),
    ...(integrity ? { integrity } : {}),
  } };
}

/**
 * Grades an attempt. Sequential attempts use their locked answers; a full answer
 * list is still accepted for an attempt whose answers were never locked.
 */
export function evaluate(attempt, answers, now = Date.now(), { progress = null, integrity = null } = {}) {
  const expired = now >= Date.parse(attempt.expiresAt);
  // Time ran out during the practical stage: the closed part is complete, so the attempt is
  // graded and every task left without an answer scores zero.
  const practiceExpired = expired && practiceTimedOut(attempt, progress);
  if (expired && !practiceExpired) throw new RequestError(410, 'Время теста истекло. Начните новую попытку.');
  const locked = progress && answeredCount(progress) > 0;
  const selection = new Map();
  if (locked) {
    if (!practiceExpired && answeredCount(progress) !== attempt.questions.length) throw new RequestError(400, 'Ответьте на все вопросы.');
    for (const question of attempt.questions) {
      selection.set(question.id, progress.answers[question.id] || { optionId: null, text: null, late: true, ms: 0, expired: true });
    }
    if (answers !== undefined && answers !== null) {
      if (!Array.isArray(answers)) throw new RequestError(400, 'Некорректный ответ.');
      for (const answer of answers) {
        if (!answer || Object.keys(answer).some(key => !['questionId', 'optionId'].includes(key))) throw new RequestError(400, 'Некорректный ответ.');
        const lockedAnswer = progress.answers[answer.questionId];
        if (!lockedAnswer) throw new RequestError(400, 'Ответ не относится к этой попытке.');
        if ((answer.optionId ?? null) !== lockedAnswer.optionId) throw new RequestError(409, 'Ответ уже зафиксирован. Вернуться к вопросу нельзя.');
      }
    }
  } else {
    if (!Array.isArray(answers) || answers.length !== attempt.questions.length) throw new RequestError(400, 'Ответьте на все вопросы.');
    for (const answer of answers) {
      if (!answer || Object.keys(answer).some(key => !['questionId', 'optionId'].includes(key))) throw new RequestError(400, 'Некорректный ответ.');
      const question = attempt.questions.find(item => item.id === answer.questionId);
      if (!question || selection.has(answer.questionId) || !question.options.some(option => option.id === answer.optionId)) throw new RequestError(400, 'Ответ не относится к этой попытке.');
      selection.set(answer.questionId, { optionId: answer.optionId, late: false, ms: 0 });
    }
  }
  return scoreAttempt(attempt, selection, now, integrity);
}

/** The practical stage started and every closed item has a locked answer. */
export function practiceTimedOut(attempt, progress) {
  if (!attempt.openStage || attempt.delivery !== 'sequential' || !progress) return false;
  return attempt.questions.slice(0, attempt.openStage.from).every(question => progress.answers?.[question.id]);
}

/** Annulment after repeated departures: a recorded failure that never confirms a grade. */
export function annulledResult(attempt, now, integrity) {
  const scored = closedScored(attempt);
  return { id: attempt.id, date: new Date(now).toISOString(), specialization: attempt.specialization, grade: attempt.grade,
    surveyId: attempt.surveyId, score: 0, passed: false, annulled: true, bankVersion: attempt.bankVersion,
    competencies: [], vacancySkills: [], questionCount: scored.length, timeouts: 0, integrity };
}

export const retryDays = (env = process.env) => {
  const value = Number(env.ASSESSMENT_RETRY_DAYS ?? 7);
  return Number.isFinite(value) && value >= 0 && value <= 90 ? value : 7;
};

/**
 * Retake policy (docs/assessment_policy.md): a failure or annulment at grade G
 * locks G and higher grades of the same specialization for `days`; lower grades
 * stay open immediately, so failing never burns the way down.
 */
export function retakeLock(completed, specialization, grade, now, days) {
  if (!days) return null;
  const rank = gradeOrder.indexOf(grade);
  const blocking = completed.filter(row => row.result && !row.result.passed && !row.result.pending && !row.result.invalidated && row.result.specialization === specialization
    && gradeOrder.indexOf(row.result.grade) <= rank && now < Date.parse(row.result.date) + days * 86400000);
  if (!blocking.length) return null;
  const until = Math.max(...blocking.map(row => Date.parse(row.result.date) + days * 86400000));
  const lowest = Math.min(...blocking.map(row => gradeOrder.indexOf(row.result.grade)));
  return { until: new Date(until).toISOString(), lowerGrades: gradeOrder.slice(0, lowest) };
}
