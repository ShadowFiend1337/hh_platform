// LLM item generation for the dynamic bank.
//
// The authored bank "feeds" the model: each request carries the family's topic,
// difficulty slot and skills, several seed items as level examples and scenarios
// from the private open-answer corpus as domain context. The model writes new
// situations; local checks remove duplicates and answer cues; an independent
// solver model must pick the keyed answer before the item may be piloted.
import { randomInt } from 'node:crypto';
import { openFamilies } from './open-bank.mjs';
import { gradeLabels } from '../shared/grading.ts';
import { specializationNames } from '../shared/catalog.ts';
import { textSimilarity } from './item-bank.mjs';
import { blindGuessPrompt, distractorIssues } from './bank-cues.mjs';

export const GENERATOR_VERSION = '2026.10.09-item-model-v1';
const gradeMeaning = {
  Intern: 'стажёр: знает базовые понятия, выполняет простые задачи под руководством',
  Junior: 'junior: самостоятельно решает типовые задачи и понимает последствия базовых решений',
  Middle: 'middle: проектирует решения внутри сервиса, учитывает надёжность, данные и сопровождение',
  Senior: 'senior: выбирает архитектурные компромиссы, отвечает за отказоустойчивость и масштаб',
  Lead: 'lead: управляет техническими рисками, стратегией и процессами команды',
};
const banned = [/все\s+перечисленн/iu, /ни\s+один\s+из/iu, /вс[её]\s+вышеперечисленн/iu, /оба\s+варианта/iu, /нет\s+правильного/iu];
const personalData = [/[\w.+-]+@[\w-]+\.[\w.]+/u, /\+?\d[\d\s()-]{9,}\d/u];

const systemPrompt = `Ты — ведущий методист технических собеседований в ИТ. Ты пишешь тестовые вопросы с одним правильным ответом для квалификационного теста платформы найма.
Вопрос проверяет практическое понимание, а не память определений: короткая рабочая ситуация (2–4 предложения) и вопрос «что сделать», «почему» или «какой вариант корректен».
Правила:
1. Тема, слот сложности и проверяемые навыки — строго как в задании. Примеры показывают уровень и формат. Каждый новый вопрос — другая проблема и другое решение, чем в examples и doNotRepeat; замена чисел, имён или единиц измерения в известном вопросе — не новый вопрос: пересказ известной ситуации другими словами запрещён. Делай упор на focusSkills.
2. Ровно 4 варианта ответа и ровно один бесспорно правильный. Неправильные варианты — правдоподобные типичные ошибки специалистов этого уровня, без абсурда и шуток.
3. Варианты примерно одинаковой длины и стиля. Правильный вариант не должен выделяться длиной, точностью, словами «всегда», «никогда», «обязательно».
4. Запрещено: «все перечисленное», «ни один из вариантов», ссылки на примеры, персональные данные, реальные компании.
5. Русский язык; общепринятые англоязычные термины допустимы. Код — только короткими фрагментами внутри текста.
6. explanation — 1–2 предложения, почему правильный вариант верен.
7. skills — 1–3 навыка только из переданного списка.
Ответь только JSON без пояснений: {"items":[{"text":"...","options":["...","...","...","..."],"correct":0,"explanation":"...","skills":["..."]}]}`;

const solverPrompt = `Ты решаешь тестовый вопрос для ИТ-специалиста. Выбери единственный правильный вариант.
Если правильных несколько, правильного нет или формулировка двусмысленна — укажи ambiguous: true.
После вопроса перечислены уже существующие вопросы банка с их ответами. Если новый вопрос проверяет ту же ситуацию и то же решение, что один из них (пересказ другими словами), укажи номер в duplicateOf, иначе 0.
Ответь только JSON: {"answer":"А|Б|В|Г","confidence":0.0-1.0,"ambiguous":false,"duplicateOf":0,"issue":"кратко, если есть проблема"}`;

const letters = ['А', 'Б', 'В', 'Г'];

function sample(items, count) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const next = randomInt(index + 1);
    [copy[index], copy[next]] = [copy[next], copy[index]];
  }
  return copy.slice(0, count);
}

/** Returns a normalized item or a rejection reason. Pure: used by tests and the CLI. */
export function checkGeneratedItem(raw, family, existingTexts = []) {
  if (!raw || typeof raw !== 'object') return { error: 'Пустой элемент.' };
  const text = typeof raw.text === 'string' ? raw.text.trim().replace(/\s+/gu, ' ') : '';
  if (text.length < 25 || text.length > 700) return { error: 'Длина условия вне 25–700 символов.' };
  const options = Array.isArray(raw.options) ? raw.options.map(option => typeof option === 'string' ? option.trim().replace(/\s+/gu, ' ') : '') : [];
  if (options.length !== 4 || options.some(option => option.length < 1 || option.length > 240)) return { error: 'Нужно ровно 4 варианта до 240 символов.' };
  if (new Set(options.map(option => option.toLocaleLowerCase('ru'))).size !== 4) return { error: 'Варианты повторяются.' };
  const correct = Number(raw.correct);
  if (!Number.isInteger(correct) || correct < 0 || correct > 3) return { error: 'Некорректный индекс правильного ответа.' };
  if ([text, ...options].some(value => banned.some(pattern => pattern.test(value)))) return { error: 'Запрещённая формулировка варианта.' };
  if ([text, ...options].some(value => personalData.some(pattern => pattern.test(value)))) return { error: 'Похоже на персональные данные.' };
  // The same cue check as the revised authored bank (docs/bank_quality.md).
  const cues = distractorIssues(options[correct], options.filter((_, index) => index !== correct));
  if (cues.length) return { error: 'Подсказка в вариантах: ' + cues.join(', ') + '.' };
  if (text.toLocaleLowerCase('ru').includes(options[correct].toLocaleLowerCase('ru')) && options[correct].length > 12) {
    return { error: 'Условие содержит правильный ответ.' };
  }
  // A copy with other numbers, names or units is not a new item: compare the text with numbers masked.
  const skeleton = value => value.toLocaleLowerCase('ru').replace(/\p{N}+(?:[.,]\p{N}+)*/gu, '#').replace(/\s+/gu, ' ').trim();
  if (existingTexts.some(existing => skeleton(existing) === skeleton(text))) return { error: 'Отличается от существующего задания только числами.' };
  const similar = existingTexts.reduce((maximum, existing) => Math.max(maximum, textSimilarity(text, existing)), 0);
  if (similar >= 0.55) return { error: 'Слишком похоже на существующее задание.' };
  const skills = Array.isArray(raw.skills) ? raw.skills.filter(skill => family.skills.includes(skill)).slice(0, 3) : [];
  const explanation = typeof raw.explanation === 'string' ? raw.explanation.trim().slice(0, 500) : '';
  return { item: { text, options, correct, explanation, skills: skills.length ? skills : family.skills.slice(0, 2) } };
}

function generationRequest(family, count, bank) {
  const examples = sample(family.variants, 3).map(variant => ({ text: variant.text, options: variant.options, correct: variant.correct }));
  const domainContext = sample(openFamilies.filter(item => item.specialization === family.specialization), 2)
    .map(item => ({ title: item.title, scenario: item.prompt.slice(0, 400) }));
  const recent = bank.familyTexts(family.id).slice(-12).map(text => text.slice(0, 160));
  return {
    task: 'generate-items', count,
    specialization: specializationNames[family.specialization] || family.specialization,
    grade: gradeLabels[family.grade] || family.grade, gradeMeaning: gradeMeaning[family.grade],
    topic: family.topic,
    difficulty: family.difficulty === 1 ? 'базовый слот грейда: типовая ситуация' : 'повышенный слот грейда: компромиссы, сбои, нетиповые условия',
    skills: family.skills, focusSkills: sample(family.skills, Math.min(2, family.skills.length)), examples, domainContext, doNotRepeat: recent,
  };
}

/** True when a model that sees only the options, not the question, finds the key: the item gives itself away. */
export async function blindGuessed(llm, item, { signal } = {}) {
  const order = sample([0, 1, 2, 3], 4);
  const reply = await llm.chat({ model: llm.models.chat, fallback: null, temperature: 0, maxTokens: 60, json: true, signal, timeoutMs: 30_000,
    messages: [{ role: 'system', content: blindGuessPrompt }, { role: 'user', content: JSON.stringify({ options: order.map(source => item.options[source]) }) }] });
  const choice = Number(reply.json?.choice);
  return Number.isInteger(choice) && order[choice] === item.correct;
}

/** Independent check: a different model must solve the item without the key. */
export async function verifyItem(llm, item, { signal, references = [] } = {}) {
  const order = sample([0, 1, 2, 3], 4);
  const question = `${item.text}\n\n${order.map((source, position) => `${letters[position]}) ${item.options[source]}`).join('\n')}${references.length ? '\n\nСуществующие вопросы банка:\n' + references.map((reference, index) => `${index + 1}. ${reference.text} — ответ: ${reference.answer}`).join('\n') : ''}`;
  const reply = await llm.chat({ model: llm.models.verifier, fallback: null, temperature: 0, maxTokens: 400, json: true, signal, timeoutMs: 40_000,
    messages: [{ role: 'system', content: solverPrompt }, { role: 'user', content: question }] });
  const answer = String(reply.json?.answer || '').trim().toUpperCase().replace('A', 'А').replace('B', 'Б').replace('C', 'В').replace('D', 'Г');
  const position = letters.indexOf(answer.slice(0, 1));
  const confidence = Number(reply.json?.confidence);
  const ambiguous = reply.json?.ambiguous === true;
  const chosen = position >= 0 ? order[position] : -1;
  const duplicate = Number(reply.json?.duplicateOf);
  const duplicateOf = Number.isInteger(duplicate) && duplicate > 0 && duplicate <= references.length ? duplicate : 0;
  const accepted = chosen === item.correct && !ambiguous && !duplicateOf && (!Number.isFinite(confidence) || confidence >= 0.6);
  return { accepted, model: reply.model, chosen, confidence: Number.isFinite(confidence) ? confidence : null, ambiguous, duplicateOf,
    issue: typeof reply.json?.issue === 'string' ? reply.json.issue.slice(0, 300) : '' };
}

export async function generateFamilyItems({ llm, bank, familyId, count = 3, signal }) {
  const family = bank.family(familyId);
  if (!family) throw new RangeError('Unknown family ' + familyId);
  if (!llm?.configured) throw new Error('OpenRouter не настроен.');
  const reply = await llm.chat({ temperature: 0.85, maxTokens: 2600, json: true, signal, timeoutMs: 90_000,
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: JSON.stringify(generationRequest(family, count, bank)) }] });
  const items = Array.isArray(reply.json?.items) ? reply.json.items.slice(0, count + 2) : [];
  const accepted = [], rejected = [];
  for (const raw of items) {
    const checked = checkGeneratedItem(raw, family, bank.familyTexts(family.id));
    if (checked.error) { rejected.push(checked.error); bank.log(family.id, 'rejected', checked.error, reply.model); continue; }
    let verification;
    try { verification = await verifyItem(llm, checked.item, { signal, references: bank.familyReferences(family.id) }); }
    catch (error) { rejected.push('Проверяющая модель недоступна.'); bank.log(family.id, 'deferred', error.message, reply.model); continue; }
    if (!verification.accepted) {
      const reason = verification.duplicateOf ? 'Пересказ существующего вопроса.' : verification.ambiguous ? 'Проверяющая модель сочла вопрос двусмысленным.' : 'Проверяющая модель выбрала другой ответ.';
      rejected.push(reason); bank.log(family.id, 'rejected', reason + (verification.issue ? ' ' + verification.issue : ''), reply.model); continue;
    }
    let blind = false;
    try { blind = await blindGuessed(llm, checked.item, { signal }); } catch { /* the blind check is advisory when the model is unavailable */ }
    if (blind) { rejected.push('Ключ угадывается по виду вариантов без условия.'); bank.log(family.id, 'rejected', 'Ключ угадывается без условия.', reply.model); continue; }
    const stored = bank.addGenerated(family, { ...checked.item, derivedFrom: null },
      { generator: reply.model + ' · ' + GENERATOR_VERSION, verifier: verification.model, verification });
    if (!stored) { rejected.push('Дубликат.'); bank.log(family.id, 'rejected', 'Дубликат отпечатка.', reply.model); continue; }
    accepted.push(stored);
    bank.log(family.id, 'pilot', 'Принят после независимой проверки.', reply.model);
  }
  return { familyId, accepted, rejected, model: reply.model };
}

/**
 * Background top-up: when a family has few items left, one family at a time is
 * generated, bounded per hour. Never blocks an attempt and never runs without a key.
 */
export class ItemGenerationQueue {
  constructor({ llm, bank, enabled = true, target = 10, perHour = 24, perFamily = 3, logger = console } = {}) {
    this.llm = llm; this.bank = bank; this.enabled = Boolean(enabled && llm?.configured);
    this.target = target; this.perHour = perHour; this.perFamily = perFamily; this.logger = logger;
    this.queue = []; this.running = null; this.history = [];
  }
  ensure(familyIds) {
    if (!this.enabled) return;
    for (const id of familyIds) {
      if (this.queue.includes(id) || this.bank.freshCapacity(id) >= this.target) continue;
      this.queue.push(id);
    }
    this.kick();
  }
  kick() {
    if (this.running || !this.queue.length) return;
    const now = Date.now();
    this.history = this.history.filter(time => now - time < 3600000);
    if (this.history.length >= this.perHour) return;
    const familyId = this.queue.shift();
    this.history.push(now);
    this.running = generateFamilyItems({ llm: this.llm, bank: this.bank, familyId, count: this.perFamily })
      .then(result => this.logger.log(`Банк заданий: ${familyId} +${result.accepted.length}, отклонено ${result.rejected.length}`))
      .catch(error => this.logger.log(`Банк заданий: генерация ${familyId} не выполнена (${error.message})`))
      .finally(() => { this.running = null; setTimeout(() => this.kick(), 1000).unref?.(); });
  }
  idle() { return this.running || Promise.resolve(); }
}
