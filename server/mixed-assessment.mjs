import { randomInt, randomUUID } from 'node:crypto';
import { reviewQuestions } from './review-bank.mjs';
import { closedReviewCases } from './closed-review-bank.mjs';
import { generateAnchoredVariant } from './anchored-generator.mjs';
import { analyzeVacancy } from './vacancies.mjs';
import { digest, emptyProgress, getProgram, publicAttempt, RequestError, threshold, confidentThreshold, maxDepartures, retryDays } from './assessment.mjs';
import { mixedAssessmentPolicy as policy, closedQuestionMinutes } from '../shared/mixed-assessment.ts';

const shuffle = values => {
  const items = [...values];
  for (let i = items.length - 1; i > 0; i--) { const j = randomInt(i + 1); [items[i], items[j]] = [items[j], items[i]]; }
  return items;
};
const poolFor = (bank, survey) => bank.filter(q => q.grade === survey.desiredGrade && q.specializations.includes(survey.specialization));
function selectAnchors(bank, survey, count, recent, preferred = []) {
  const pool = poolFor(bank, survey), chosen = [];
  if (!pool.length) throw new RequestError(503, 'Для этой программы пока нет исходных кейсов.');
  const seen = new Set(recent.flatMap(a => Object.values(a.cases || {}).map(c => c.passport.anchorId)));
  while (chosen.length < count) {
    const cycle = shuffle(pool).sort((a, b) => Number(seen.has(a.id)) - Number(seen.has(b.id))
      || b.testedSkills.filter(s => preferred.includes(s)).length - a.testedSkills.filter(s => preferred.includes(s)).length);
    chosen.push(...cycle.slice(0, count - chosen.length));
  }
  return chosen;
}

export function mixedProgramInfo(specialization, grade, llm, env) {
  const old = getProgram(specialization, grade);
  const pool = poolFor(reviewQuestions, { specialization, desiredGrade: grade });
  return { bankVersion: policy.version, topics: pool.map(q => q.competency), questionCount: 20,
    closedCount: policy.closedCount, openCount: policy.openCount, weights: { closed: policy.closedWeight, open: policy.openWeight },
    threshold, confidentThreshold, maxDepartures, retryDays: retryDays(env), delivery: 'sequential',
    questionSeconds: closedQuestionMinutes[grade] * 60,
    expiresInMinutes: 15 * closedQuestionMinutes[grade] + 5 * Math.max(...pool.map(q => q.estimatedMinutes)) + policy.finalSubmissionGraceMinutes,
    openMinutes: { min: Math.min(...pool.map(q => q.estimatedMinutes)), max: Math.max(...pool.map(q => q.estimatedMinutes)) },
    generation: { configured: Boolean(llm.configured), required: true },
    bank: { authored: pool.length * 3, generated: null }, examples: [], legacyTopics: old.topics };
}

export function createMixedDraft(survey, description = '', recent = [], now = Date.now()) {
  if (typeof description !== 'string' || description.length > 4000) throw new RequestError(400, 'Описание вакансии — до 4000 символов.');
  const vacancy = description.trim() ? analyzeVacancy(description.trim(), survey.specialization, survey.desiredGrade) : null;
  const skills = [...survey.stack, ...(vacancy?.matchedSkills || [])];
  const closed = selectAnchors(closedReviewCases, survey, 8, recent, skills);
  const open = selectAnchors(reviewQuestions, survey, policy.openCount, recent, skills);
  return { id: randomUUID(), bankVersion: policy.version, specialization: survey.specialization, grade: survey.desiredGrade,
    surveyId: survey.id, survey, vacancy, vacancyDescription: description.trim(), delivery: 'sequential', state: 'preparing',
    createdAt: new Date(now).toISOString(), expiresAt: new Date(now + policy.preparationMinutes * 60000).toISOString(),
    questionSeconds: closedQuestionMinutes[survey.desiredGrade] * 60, questions: [], cases: {},
    scoring: { closedWeight: policy.closedWeight, openWeight: policy.openWeight },
    blueprint: { closedCount: policy.closedCount, openCount: policy.openCount, topicCounts: {}, difficultyCounts: { [survey.desiredGrade]: 20 }, difficultyBudget: 20 },
    generation: { done: 0, total: 13, slots: [...closed.map((a, i) => ({ anchorId: a.id, count: i === 7 ? 1 : 2, kind: 'single-choice' })),
      ...open.map(a => ({ anchorId: a.id, count: 1, kind: 'open' }))] } };
}

function materialize(candidate, slot) {
  const p = candidate.passport, caseId = randomUUID();
  const base = { topic: p.competency, skills: p.testedSkills, difficulty: p.grade, caseId,
    origin: 'generated', variantId: candidate.id, familyId: p.anchorId, pilot: false };
  if (slot.kind === 'open') return { caseId, questions: [{ ...base, id: randomUUID(), type: 'open', text: candidate.content.prompt,
    title: candidate.content.title, answerFormat: p.answerFormat, options: [], timeLimitSec: p.estimatedMinutes * 60,
    rubric: candidate.content.criterionMap.map(c => ({ id: c.criterionId, expected: c.adaptedCriterion,
      scale: p.criteria.find(original => original.id === c.criterionId).scale })), referenceAnswer: candidate.content.solution }] };
  return { caseId, questions: candidate.content.questions.slice(0, slot.count).map(q => {
    const indices = shuffle([0, 1, 2, 3]);
    const options = indices.map(i => ({ id: randomUUID(), text: q.options[i] }));
    return { ...base, id: randomUUID(), type: 'single-choice', answerFormat: 'single-choice', text: q.prompt,
      title: candidate.content.title, context: candidate.content.prompt, options, correctOptionId: options[indices.indexOf(q.correct)].id,
      explanation: q.explanation, timeLimitSec: closedQuestionMinutes[p.grade] * 60 };
  }) };
}

export function publicMixedAttempt(attempt, progress, result) {
  if (attempt.state === 'active' || result) return { ...publicAttempt(attempt, progress),
    status: result?.status === 'pending-review' ? 'pending-review' : result ? 'completed' : 'active', ...(result ? { result } : {}) };
  return { id: attempt.id, bankVersion: attempt.bankVersion, specialization: attempt.specialization, grade: attempt.grade,
    surveyId: attempt.surveyId, createdAt: attempt.createdAt, expiresAt: attempt.expiresAt, blueprint: attempt.blueprint,
    vacancy: attempt.vacancy, delivery: 'sequential', questionCount: 20, questions: [], position: 0,
    status: attempt.state, generation: { done: attempt.generation.done, total: attempt.generation.total },
    ...(attempt.state === 'failed' ? { preparationError: 'Тест не удалось сформировать. Попробуйте создать его заново.' } : {}) };
}

/** In-memory bounded workers; checkpoints persist. An interrupted paid request is never silently retried. */
export class MixedAssessmentPreparation {
  constructor({ store, variants, llm, now = Date.now }) {
    this.store = store; this.variants = variants; this.llm = llm; this.now = now;
    this.jobs = new Map(); this.queue = []; this.running = 0; this.closed = false;
    for (const row of store.db.prepare("SELECT id,payload FROM attempts WHERE result IS NULL AND json_extract(payload,'$.state')='preparing'").all()) {
      const attempt = JSON.parse(row.payload); attempt.state = 'failed'; store.updateAttempt(attempt, 'preparing');
    }
  }
  ensureCapacity() {
    if (!this.llm.configured) throw new RequestError(503, 'Сервис формирования тестов не настроен. Обратитесь к администратору.');
    if (this.jobs.size >= 4) throw new RequestError(429, 'Сервис формирует другие тесты. Попробуйте немного позже.');
  }
  enqueue(attempt) {
    const job = { id: attempt.id, controller: new AbortController(), results: new Array(attempt.generation.total), failed: false };
    this.jobs.set(attempt.id, job);
    attempt.generation.slots.forEach((slot, index) => this.queue.push({ job, slot, index }));
    this.kick();
  }
  kick() {
    while (!this.closed && this.running < 2 && this.queue.length) {
      const task = this.queue.shift();
      if (task.job.failed) continue;
      this.running++;
      this.run(task).finally(() => { this.running--; this.kick(); });
    }
  }
  async run({ job, slot, index }) {
    try {
      const before = this.store.get(job.id);
      if (!before || before.attempt.state !== 'preparing') throw new Error('interrupted');
      if (this.now() >= Date.parse(before.attempt.expiresAt)) throw new Error('preparation-expired');
      const result = await generateAnchoredVariant({ llm: this.llm, anchorId: slot.anchorId,
        existingScenarios: this.variants.scenarios(slot.anchorId), signal: job.controller.signal, now: this.now });
      if (this.closed || job.failed) return;
      if (!this.store.get(job.id)) throw new Error('deleted');
      if (!result.accepted) { this.variants.log(slot.anchorId, 'rejected-structure', result.reasons); throw new Error('invalid-draft'); }
      if (result.candidate.passport.anchorId !== slot.anchorId) throw new Error('anchor-mismatch');
      const candidate = this.variants.save(result.candidate);
      job.results[index] = { candidate, ...materialize(candidate, slot) };
      const row = this.store.get(job.id), attempt = row.attempt;
      if (attempt.state !== 'preparing') throw new Error('interrupted');
      if (this.now() >= Date.parse(attempt.expiresAt)) throw new Error('preparation-expired');
      attempt.generation.done = job.results.filter(Boolean).length;
      if (attempt.generation.done === attempt.generation.total) {
        attempt.questions = job.results.flatMap(r => r.questions);
        attempt.cases = Object.fromEntries(job.results.map(r => [r.caseId, r.candidate]));
        if (attempt.questions.filter(q => q.type === 'open').length !== 5 || attempt.questions.filter(q => q.type === 'single-choice').length !== 15) throw new Error('incomplete-blueprint');
        attempt.blueprint.topicCounts = Object.fromEntries([...new Set(attempt.questions.map(q => q.topic))].map(topic => [topic, attempt.questions.filter(q => q.topic === topic).length]));
        attempt.state = 'ready'; attempt.expiresAt = new Date(this.now() + policy.readyMinutes * 60000).toISOString();
        this.jobs.delete(job.id);
      }
      this.store.updateAttempt(attempt, 'preparing');
    } catch (error) {
      if (this.closed || job.failed) return;
      if (error.code) this.variants.log(slot.anchorId, 'failed', [String(error.code).slice(0,100)]);
      job.failed = true; job.controller.abort(); this.jobs.delete(job.id);
      this.queue = this.queue.filter(t => t.job !== job);
      const row = this.store.get(job.id);
      if (row && row.attempt.state === 'preparing') { row.attempt.state = 'failed'; this.store.updateAttempt(row.attempt, 'preparing'); }
    }
  }
  start(id) {
    const row = this.store.get(id);
    if (!row || row.result || row.attempt.state !== 'ready') throw new RequestError(409, 'Тест ещё не готов или уже начат.');
    const attempt = row.attempt;
    attempt.state = 'active'; attempt.createdAt = new Date(this.now()).toISOString();
    attempt.expiresAt = new Date(this.now() + (attempt.questions.reduce((seconds, q) => seconds + q.timeLimitSec, 0)
      + policy.finalSubmissionGraceMinutes * 60) * 1000).toISOString();
    this.store.db.exec('BEGIN IMMEDIATE');
    try {
      if (!this.store.updateAttempt(attempt, 'ready') || !this.store.saveProgress(id, emptyProgress(attempt), row.progress)) throw new RequestError(409, 'Тест уже запущен в другой вкладке.');
      this.store.db.exec('COMMIT');
    } catch(error) { this.store.db.exec('ROLLBACK'); throw error; }
    return this.store.get(id);
  }
  close() { this.closed = true; for (const job of this.jobs.values()) job.controller.abort(); this.queue = []; }
}

export function lockedMixedDigest(attempt, progress) {
  if (!progress || Object.keys(progress.answers).length !== 20 || attempt.questions.some(q => !Object.hasOwn(progress.answers, q.id))) throw new RequestError(400, 'Ответьте на все вопросы.');
  return digest(JSON.stringify(attempt.questions.map(q => [q.id, q.type === 'open'
    ? progress.answers[q.id].answerText ?? null : progress.answers[q.id].optionId ?? null])));
}

export function mixedClosedScore(attempt, progress) {
  const questions = attempt.questions.filter(q => q.type === 'single-choice');
  const correct = questions.filter(q => { const a = progress.answers[q.id]; return a && !a.late && a.optionId === q.correctOptionId; }).length;
  return { correct, total: questions.length, score: correct / questions.length * 100 };
}
