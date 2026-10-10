import { randomInt, randomUUID } from 'node:crypto';
import { reviewQuestions } from './review-bank.mjs';
import { generateAnchoredVariant, AnchoredGenerationError } from './anchored-generator.mjs';
import { LlmError } from './llm.mjs';

/**
 * Open tasks of an attempt (docs/open_tasks.md). After a passed closed part the
 * candidate solves practical tasks of the same specialization and grade from the
 * case bank; a moderator grades them by the rubric. A task is either the authored
 * case or a generated variant that keeps its reasoning path but changes the domain,
 * representation and question — never only the numbers.
 */
export const OPEN_TASK_POLICY = Object.freeze({
  version: 'open-tasks-v1', defaultCount: 2, preferredMinutes: 25, closedWeight: 0.5, openWeight: 0.5,
  maxAnswerLength: 12000, poolTarget: 3, submitGraceMinutes: 5,
});

export function openTaskCount(env = {}) {
  const value = Number(env.ASSESSMENT_OPEN_TASKS ?? OPEN_TASK_POLICY.defaultCount);
  return Number.isInteger(value) && value >= 0 && value <= 3 ? value : OPEN_TASK_POLICY.defaultCount;
}

export const openPool = (specialization, grade) => reviewQuestions.filter(item => item.grade === grade && item.specializations.includes(specialization));
const anchors = new Map(reviewQuestions.map(item => [item.id, item]));
export const openAnchor = id => anchors.get(id) || null;

const shuffled = values => {
  const items = [...values];
  for (let index = items.length - 1; index > 0; index--) { const other = randomInt(index + 1); [items[index], items[other]] = [items[other], items[index]]; }
  return items;
};

/** Usable generated variants of an anchor: structurally valid, not rejected by an expert. */
function variantsOf(variants, anchorId) {
  if (!variants) return [];
  return variants.list({ anchorId, limit: 100 }).filter(row => row.status !== 'rejected');
}

function materialize(anchor, variant) {
  const content = variant?.content;
  const criteria = anchor.rubric.map(item => {
    const adapted = content?.criterionMap?.find(entry => entry.criterionId === item.id);
    return { id: item.id, expected: adapted?.adaptedCriterion || item.expected, scale: item.scale };
  });
  return {
    id: randomUUID(), type: 'open', topic: anchor.competency, title: content?.title || anchor.title,
    text: content?.prompt || anchor.prompt, answerFormat: anchor.answerFormat, options: [],
    timeLimitSec: anchor.estimatedMinutes * 60, familyId: anchor.id, variantId: variant?.id || anchor.id,
    origin: variant ? 'generated' : 'authored', pilot: false, rubric: criteria,
    reference: content?.solution || anchor.solutionPath,
    criticalErrors: content?.criticalErrorMap?.map(entry => entry.adaptedError) || anchor.criticalErrors,
    ...(variant ? { generation: { model: variant.model, generatedAt: variant.generatedAt, generatorVersion: variant.generatorVersion,
      changes: content.changes, equivalence: content.equivalence?.rationale || '' } } : {}),
  };
}

/** The authored case as an open task (fixtures and tests). */
export function authoredOpenTask(anchorId) {
  const anchor = openAnchor(anchorId);
  if (!anchor) throw new TypeError('Unknown open case ' + anchorId);
  return materialize(anchor, null);
}

/**
 * Chooses open tasks for a passed closed part: unseen cases first, then the
 * candidate's skills, then a moderate time; different competencies.
 */
export function selectOpenTasks(attempt, { count, variants = null, recent = [] } = {}) {
  if (!count) return [];
  const pool = openPool(attempt.specialization, attempt.grade);
  if (!pool.length) return [];
  const seenRows = recent.flatMap(item => item.questions || []).filter(question => question.type === 'open');
  const seenAnchors = new Set(seenRows.map(question => question.familyId)), seenVariants = new Set(seenRows.map(question => question.variantId));
  const skills = new Set([...(attempt.survey?.stack || []), ...(attempt.vacancy?.matchedSkills || [])]);
  const ranked = shuffled(pool).sort((a, b) => Number(seenAnchors.has(a.id)) - Number(seenAnchors.has(b.id))
    || b.testedSkills.filter(skill => skills.has(skill)).length - a.testedSkills.filter(skill => skills.has(skill)).length
    || Number(a.estimatedMinutes > OPEN_TASK_POLICY.preferredMinutes) - Number(b.estimatedMinutes > OPEN_TASK_POLICY.preferredMinutes));
  const chosen = [], competencies = new Set();
  for (const anchor of ranked) {
    if (chosen.length >= count) break;
    if (competencies.has(anchor.competencyId) && ranked.some(item => !competencies.has(item.competencyId) && !chosen.includes(item))) continue;
    chosen.push(anchor); competencies.add(anchor.competencyId);
  }
  return chosen.map(anchor => {
    const fresh = variantsOf(variants, anchor.id).filter(row => !seenVariants.has(row.id));
    // Generated variants and the authored case share the draw, so the authored case keeps appearing.
    const pick = randomInt(fresh.length + 1);
    return materialize(anchor, pick < fresh.length ? variants.get(fresh[pick].id) : null);
  });
}

/** Appends the open stage to a sequential attempt and extends its deadline by the task time. */
export function appendOpenTasks(attempt, tasks, now = Date.now()) {
  if (!tasks.length || attempt.openStage) return null;
  const minutes = tasks.reduce((sum, task) => sum + task.timeLimitSec / 60, 0) + OPEN_TASK_POLICY.submitGraceMinutes;
  return { ...attempt, questions: [...attempt.questions, ...tasks], openStage: { from: attempt.questions.length, added: tasks.length },
    expiresAt: new Date(Math.max(Date.parse(attempt.expiresAt), now) + minutes * 60000).toISOString() };
}

/**
 * Background top-up of generated open-task variants: one model call per variant,
 * at most `perHour` calls, one at a time. Start of an attempt never waits for it.
 */
export class OpenVariantQueue {
  constructor({ llm, variants, enabled = false, perHour = 12, logger = console, now = Date.now }) {
    Object.assign(this, { llm, variants, enabled, perHour, logger, now, queue: [], running: null, calls: [] });
  }
  ensure(anchorIds) {
    if (!this.enabled || !this.llm?.configured) return;
    for (const id of anchorIds) {
      if (!this.queue.includes(id) && this.running !== id && variantsOf(this.variants, id).length < OPEN_TASK_POLICY.poolTarget) this.queue.push(id);
    }
    this.kick();
  }
  kick() {
    if (this.running || !this.queue.length) return;
    const time = this.now();
    this.calls = this.calls.filter(at => at > time - 3600000);
    if (this.calls.length >= this.perHour) return;
    const anchorId = this.queue.shift();
    this.running = anchorId; this.calls.push(time);
    generateAnchoredVariant({ llm: this.llm, anchorId, existingScenarios: this.variants.scenarios(anchorId), now: this.now })
      .then(result => {
        if (result.accepted) this.variants.save(result.candidate);
        else this.variants.log(anchorId, 'rejected-structure', result.reasons);
      })
      .catch(error => {
        if (!(error instanceof LlmError || error instanceof AnchoredGenerationError || error instanceof TypeError)) throw error;
        this.variants.log(anchorId, 'failed', [error.code || error.message]);
      })
      .catch(error => this.logger.error?.('Open variant generation:', error.message))
      .finally(() => { this.running = null; this.kick(); });
  }
}
