// Authoring only. A model's own solution is evidence for a reviewer, not verification.
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { reviewQuestions } from './review-bank.mjs';
import { closedReviewCases, closedReviewVersion } from './closed-review-bank.mjs';
import { freeze } from './review-bank/schema.mjs';

export const anchoredGeneratorVersion = '2026.10.10-anchor-v1';
export const rewriteDimensions = ['domain', 'representation', 'constraints', 'question'];
const anchors = new Map([...reviewQuestions, ...closedReviewCases].map(item => [item.id, item]));
const openAnchors = new Map(reviewQuestions.map(item => [item.id, item]));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = (value, min = 1, max = 4000) => typeof value === 'string' && value.trim().length >= min && value.length <= max;
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const strings = (value, min, max, size = 2000) => Array.isArray(value) && value.length >= min && value.length <= max && value.every(v => string(v, 1, size));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const numericSkeleton = text => text.toLowerCase().replace(/\p{N}+(?:[.,]\p{N}+)*/gu, '#').replace(/\s+/gu, ' ').trim();
const words = text => new Set(text.toLowerCase().match(/[\p{L}]{4,}/gu)?.map(word => word.slice(0, 7)) || []);
function similarity(left, right) {
  const a = words(left), b = words(right);
  const union = new Set([...a, ...b]).size;
  return union ? [...a].filter(word => b.has(word)).length / union : 1;
}
const scenario = item => [item.prompt, ...(item.questions || []).map(q => q.prompt)].join('\n');

export class AnchoredGenerationError extends Error {
  constructor(code, message) { super(message); this.name = 'AnchoredGenerationError'; this.code = code; }
}

/** All difficulty/provenance fields are selected on the server, never supplied by the caller/model. */
export function anchorPassport(anchorId) {
  const anchor = anchors.get(anchorId);
  if (!anchor) throw new AnchoredGenerationError('input', 'Неизвестный кейс нового банка.');
  const reference = openAnchors.get(anchor.pairedOpenId || anchor.id);
  return freeze({
    anchorId: anchor.id, anchorVersion: closedReviewVersion, anchorHash: digest(anchor),
    referenceId: reference.id, referenceHash: digest(reference),
    competencyId: anchor.competencyId, competency: anchor.competency, grade: anchor.grade,
    specializations: anchor.specializations, testedSkills: anchor.testedSkills,
    answerFormat: anchor.answerFormat, questionCount: anchor.questions?.length || 0,
    optionCount: anchor.questions ? 4 : 0,
    estimatedMinutes: anchor.estimatedMinutes, timeCalibration: 'unmeasured',
    intent: reference.intent,
    solutionPath: anchor.questions ? anchor.questions.map(q => q.options[q.correct] + '\n' + q.explanation).join('\n\n') : reference.solutionPath,
    difficulty: anchor.difficulty,
    // A closed case tests recognition of its two decisions, not every construction
    // criterion of the open pair. Requiring the latter would silently add work.
    criteria: anchor.questions ? anchor.questions.map(q => ({ id: q.id,
      expected: q.prompt + '\n' + q.options[q.correct] + '\n' + q.explanation,
      scale: { 0: 'Выбрано ошибочное решение.', 2: 'Выбрано правильное решение.' },
    })) : reference.rubric,
    criticalErrors: reference.criticalErrors,
    sourceUrl: anchor.sourceUrl, sourceRefs: anchor.sourceRefs,
    referenceScenario: scenario(anchor),
    referenceQuestions: anchor.questions || [],
    minimumChangedDimensions: 3,
    requiredChangedDimensions: ['representation', 'question'],
  });
}

function responseShape(passport) {
  return {
    title: 'Название нового сценария', prompt: 'Полное самодостаточное условие без подсказки решения',
    questions: passport.questionCount ? Array.from({ length: passport.questionCount }, () => ({
      prompt: 'Вопрос к кейсу', options: ['Решение 1', 'Решение 2', 'Решение 3', 'Решение 4'],
      correct: 0, explanation: 'Почему ровно один ответ верен; показать вычисления/контрпример',
      criterionIds: ['ID проверяемых критериев'],
      distractors: [1, 2, 3].map(option => ({ option, misconception: 'Конкретная правдоподобная ошибка',
        whyWrong: 'Объяснение ошибки в этом сценарии' })),
    })) : [],
    solution: 'Полное эталонное решение: вычисления, код/SQL либо проверяемый план и границы применимости',
    criterionMap: passport.criteria.map(criterion => ({ criterionId: criterion.id,
      adaptedCriterion: 'То же требование к свидетельству, адаптированное к новым данным, без старых констант',
      preservedOperation: 'Какое действие исходного пути решения сохранено',
      evidenceQuotes: ['Точная непустая цитата нового условия/вопроса, требующая этого действия'],
      solutionQuote: 'Точная цитата поля solution, выполняющая этот критерий',
    })),
    criticalErrorMap: passport.criticalErrors.map((_, index) => ({ index,
      adaptedError: 'Та же концептуальная ошибка в новом контексте',
      check: 'Контрпример/проверка, обнаруживающая эту ошибку' })),
    changes: ['domain', 'representation', 'question'].map(dimension => ({ dimension,
      beforeQuote: 'Точная цитата referenceScenario', afterQuote: 'Точная цитата нового условия/вопроса',
      explanation: 'Что изменилось помимо имён и чисел, почему это не меняет путь решения' })),
    equivalence: {
      rationale: 'Почему нужно пройти тот же путь решения: шаги, зависимости, ограничения, объём работы и ошибки',
      addedPrerequisites: [], removedOperations: [],
      risks: ['Что ещё должен проверить независимый предметный эксперт; самооценка модели не является доказательством'],
    },
  };
}

const system = `Ты автор задач для проверки профессиональных компетенций. Создай ОДИН новый кейс по доверенному паспорту.
Это перенос замысла и пути решения, а не подстановка чисел, переименование персонажей или пересказ.
Сохрани каждую проверяемую операцию, зависимости шагов, концептуальные ошибки, требуемые навыки и формат.
Измени минимум 3 измерения: domain, representation, constraints, question; representation и question обязательны.
Например: агрегаты вместо журнала или журнал вместо таблицы; диагностика ошибочного плана вместо прямого расчёта,
обратная постановка вместо прямой, другой рабочий процесс с тем же инвариантом. Изменения не должны добавлять
новые знания, ветви решения или убирать трудные шаги. Не обещай доказанную равную сложность.
Для закрытого кейса сохрани количество вопросов, в каждом 4 варианта и ровно один правильный.
Дистракторы должны быть правдоподобными решениями с конкретной ошибкой того же уровня, без очевидных шуток,
слов «всегда/никогда» как подсказки и вариантов «всё перечисленное». Не выдавай ответ длиной или текстом условия.
Сначала продумай новое условие, реши его, проверь неоднозначность и вычисления, затем верни готовый JSON.
criterionMap покрывает все критерии один раз; solutionQuote буквально присутствует в solution.
В beforeQuote/afterQuote и evidenceQuotes используй буквальные цитаты, без многоточий.
Старые числовые ответы в rubric — примеры исходного решения, их нужно пересчитать для новых данных.
Все поля JSON обязательны; дополнительные поля, грейд, статус и новые ссылки запрещены.
Только JSON указанной формы. Тексты на русском; названия технологий и код можно оставлять на языке оригинала.`;

export function generationMessages(passport, existingScenarios = []) {
  return [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify({
    passport, avoidScenarios: existingScenarios.slice(-8), outputShape: responseShape(passport),
  }) }];
}

/** These checks detect malformed/cosmetic drafts. They do NOT establish semantic equivalence. */
export function validateAnchoredDraft(raw, passport, existingScenarios = []) {
  const errors = [];
  const error = code => { if (!errors.includes(code)) errors.push(code); };
  if (!exact(raw, ['title', 'prompt', 'questions', 'solution', 'criterionMap', 'criticalErrorMap', 'changes', 'equivalence'])) return ['shape'];
  if (!string(raw.title, 5, 180) || !string(raw.prompt, 60, 6000) || !string(raw.solution, 100, 14000)) error('content');
  if (!Array.isArray(raw.questions) || raw.questions.length !== passport.questionCount) return [...errors, 'question-count'];
  const coverage = new Set();
  const validIds = new Set(passport.criteria.map(c => c.id));
  for (const q of raw.questions) {
    if (!exact(q, ['prompt', 'options', 'correct', 'explanation', 'criterionIds', 'distractors'])
      || !string(q.prompt, 15, 2000) || !strings(q.options, 4, 4, 1800)
      || !Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3 || !string(q.explanation, 40, 4000)
      || !strings(q.criterionIds, 1, passport.criteria.length, 150)) { error('question-shape'); continue; }
    for (const id of q.criterionIds) { if (!validIds.has(id)) error('unknown-criterion'); else coverage.add(id); }
    if (new Set(q.options.map(v => v.toLowerCase().replace(/\s+/gu, ' ').trim())).size !== 4) error('duplicate-options');
    const meanWrongLength = q.options.filter((_, i) => i !== q.correct).reduce((n, s) => n + s.length, 0) / 3;
    if (q.options[q.correct].length > meanWrongLength * 1.8 + 60) error('answer-length-cue');
    if (/вс[её] (?:перечисленное|ответы)|ни один из|all of the above|none of the above/iu.test(q.options.join('\n'))) error('trivial-option');
    const distractorOptions = new Set();
    if (!Array.isArray(q.distractors) || q.distractors.length !== 3) error('distractors');
    else for (const d of q.distractors) {
      if (!exact(d, ['option', 'misconception', 'whyWrong']) || !Number.isInteger(d.option)
        || d.option < 0 || d.option > 3 || d.option === q.correct || distractorOptions.has(d.option)
        || !string(d.misconception, 15, 2000) || !string(d.whyWrong, 25, 2000)) error('distractors');
      else distractorOptions.add(d.option);
    }
  }
  if (passport.questionCount && coverage.size !== validIds.size) error('question-criterion-coverage');
  if (errors.includes('question-shape') || errors.includes('content')) return errors;
  const candidateScenario = scenario(raw);
  for (const q of raw.questions) if (q.options[q.correct].length > 25
    && numericSkeleton(candidateScenario).includes(numericSkeleton(q.options[q.correct]))) error('answer-in-stem');
  if (numericSkeleton(candidateScenario) === numericSkeleton(passport.referenceScenario)) error('numbers-only');
  if (similarity(candidateScenario, passport.referenceScenario) >= 0.65) error('cosmetic-rewrite');
  if (existingScenarios.some(text => numericSkeleton(text) === numericSkeleton(candidateScenario)
    || similarity(text, candidateScenario) >= 0.8)) error('duplicate-variant');

  const mapped = new Set();
  if (!Array.isArray(raw.criterionMap) || raw.criterionMap.length !== passport.criteria.length) error('criterion-map');
  else for (const m of raw.criterionMap) {
    if (!exact(m, ['criterionId', 'adaptedCriterion', 'preservedOperation', 'evidenceQuotes', 'solutionQuote'])
      || !validIds.has(m.criterionId) || mapped.has(m.criterionId)
      || !string(m.adaptedCriterion, 20, 2000) || !string(m.preservedOperation, 30, 2000)
      || !strings(m.evidenceQuotes, 1, 3, 1000) || m.evidenceQuotes.some(quote => quote.length < 12 || !candidateScenario.includes(quote))
      || !string(m.solutionQuote, 25, 3000) || !raw.solution.includes(m.solutionQuote)) error('criterion-evidence');
    else mapped.add(m.criterionId);
  }
  const mappedErrors = new Set();
  if (!Array.isArray(raw.criticalErrorMap) || raw.criticalErrorMap.length !== passport.criticalErrors.length) error('critical-error-map');
  else for (const m of raw.criticalErrorMap) {
    if (!exact(m, ['index', 'adaptedError', 'check']) || !Number.isInteger(m.index) || m.index < 0
      || m.index >= passport.criticalErrors.length || mappedErrors.has(m.index)
      || !string(m.adaptedError, 20, 2000) || !string(m.check, 30, 3000)) error('critical-error-evidence');
    else mappedErrors.add(m.index);
  }
  const changed = new Set(), afterQuotes = new Set();
  if (!Array.isArray(raw.changes) || raw.changes.length < 3 || raw.changes.length > 4) error('rewrite-dimensions');
  else for (const c of raw.changes) {
    if (!exact(c, ['dimension', 'beforeQuote', 'afterQuote', 'explanation']) || !rewriteDimensions.includes(c.dimension)
      || changed.has(c.dimension) || !string(c.beforeQuote, 12, 1500) || !string(c.afterQuote, 25, 1500)
      || !string(c.explanation, 40, 2000) || !passport.referenceScenario.includes(c.beforeQuote)
      || !candidateScenario.includes(c.afterQuote) || afterQuotes.has(c.afterQuote)
      || numericSkeleton(c.beforeQuote) === numericSkeleton(c.afterQuote)
      || similarity(c.beforeQuote, c.afterQuote) >= 0.8) error('rewrite-evidence');
    else { changed.add(c.dimension); afterQuotes.add(c.afterQuote); }
  }
  if (changed.size < 3 || !passport.requiredChangedDimensions.every(d => changed.has(d))) error('substantive-rewrite-required');
  if (!exact(raw.equivalence, ['rationale', 'addedPrerequisites', 'removedOperations', 'risks'])
    || !string(raw.equivalence.rationale, 100, 5000) || !strings(raw.equivalence.risks, 1, 8)
    || !Array.isArray(raw.equivalence.addedPrerequisites) || raw.equivalence.addedPrerequisites.length
    || !Array.isArray(raw.equivalence.removedOperations) || raw.equivalence.removedOperations.length) error('difficulty-contract');
  return errors;
}

function permuteQuestions(questions) {
  return questions.map(q => {
    const indices = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) { const j = randomInt(i + 1); [indices[i], indices[j]] = [indices[j], indices[i]]; }
    return { ...q, options: indices.map(i => q.options[i]), correct: indices.indexOf(q.correct),
      distractors: q.distractors.map(d => ({ ...d, option: indices.indexOf(d.option) })) };
  });
}

/** Exactly one chat invocation, no repair/solver calls, no HTTP retry or fallback model. */
export async function generateAnchoredVariant({ llm, anchorId, existingScenarios = [], signal, now = Date.now }) {
  const passport = anchorPassport(anchorId);
  if (!llm?.configured) throw new AnchoredGenerationError('configuration', 'Добавьте OPENROUTER_API_KEY в серверный .env.');
  if (signal?.aborted) throw new AnchoredGenerationError('cancelled', 'Генерация отменена.');
  const reply = await llm.chat({ messages: generationMessages(passport, existingScenarios),
    fallback: null, retries: 0, maxTokens: 8500, temperature: 0.65, json: true, timeoutMs: 60_000, signal });
  const reasons = validateAnchoredDraft(reply.json, passport, existingScenarios);
  if (reasons.length) return { accepted: false, llmCalls: 1, reasons, anchorId };
  const content = { ...reply.json, questions: permuteQuestions(reply.json.questions) };
  const id = 'variant-' + randomUUID();
  const candidate = freeze({
    id, generatorVersion: anchoredGeneratorVersion, generatedAt: new Date(now()).toISOString(),
    model: reply.model, llmCalls: 1, mode: 'anchored', passport,
    content, contentHash: digest(content),
    sourceUrl: passport.sourceUrl, sourceRefs: passport.sourceRefs,
    origin: { kind: 'llm-variant-of-authored-source-informed-case', anchorId, copiedSourceText: false },
    difficulty: { ...passport.difficulty, calibration: 'unverified-variant',
      basis: 'Trusted anchor contract plus model-reported mapping; requires independent review and same-format empirical comparison.' },
    checks: { structural: 'passed', semantic: 'not-independently-verified', empirical: 'not-measured' },
    review: { status: 'needs-review', active: false, approvedForCertification: false },
  });
  return { accepted: true, llmCalls: 1, candidate };
}

export const variantScenario = candidate => scenario(candidate.content);
export const variantContentHash = digest;
