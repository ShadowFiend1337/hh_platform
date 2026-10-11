// Answer cues of the closed bank (docs/bank_quality.md): how far a candidate gets by picking
// options from their look alone, without knowing the subject. Random choice gives 25%.
import { threshold } from './assessment.mjs';

const words = text => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(word => word.length > 3).map(word => word.slice(0, Math.max(4, word.length - 2)));
const overlap = (question, option) => { const known = new Set(words(question)); return words(option).filter(word => known.has(word)).length; };
/** Expected credit of a strategy that picks the best-scored option; ties share the credit. */
const credit = (item, scores) => { const best = Math.max(...scores), top = scores.flatMap((score, index) => score === best ? [index] : []); return top.includes(item.correct) ? 1 / top.length : 0; };

export const cueStrategies = {
  longest: item => item.options.map(option => option.length),
  'longest+overlap': item => item.options.map(option => option.length / 40 + 1.5 * overlap(item.text, option)),
};
const choose = (n, k) => { let value = 1; for (let index = 1; index <= k; index++) value = value * (n - k + index) / index; return value; };
/** Chance to reach the threshold on 12 items when each is right with probability p. */
export const passChance = p => { const need = Math.ceil(threshold / 100 * 12); let sum = 0; for (let k = need; k <= 12; k++) sum += choose(12, k) * p ** k * (1 - p) ** (12 - k); return sum; };

export function itemsOf(bank) {
  return Object.entries(bank).flatMap(([specialization, grades]) => Object.entries(grades).flatMap(([grade, program]) =>
    program.families.flatMap(family => family.variants.map(variant => ({ ...variant, specialization, grade, program: specialization + ' ' + grade })))));
}

/** Cue accuracy per program: `longest`, `combined` (length + question words) and the pass chance with `combined`. */
export function cueReport(bank) {
  const byProgram = new Map();
  for (const item of itemsOf(bank)) {
    const row = byProgram.get(item.program) || { program: item.program, grade: item.grade, n: 0, longest: 0, combined: 0 };
    row.n++; row.longest += credit(item, cueStrategies.longest(item)); row.combined += credit(item, cueStrategies['longest+overlap'](item));
    byProgram.set(item.program, row);
  }
  return [...byProgram.values()].map(row => ({ ...row, longest: row.longest / row.n, combined: row.combined / row.n, pass: passChance(row.combined / row.n) }));
}

/** Allowed distractor length: close to the key, with a wider margin for short keys. */
export const lengthRange = correct => {
  const length = correct.length, margin = Math.max(12, Math.round(0.4 * length));
  return [Math.max(1, Math.min(Math.round(0.65 * length), length - margin)), Math.max(Math.round(1.45 * length), length + margin)];
};
const absolutes = /(?:^|[^\p{L}])(?:всегда|никогда|любой|любые|любое|все перечисленн|ни один из)(?:$|[^\p{L}])/iu;
/** Cues in a set of wrong options: length outside the key's range, a key longer than all, absolutes, repeats. */
export function distractorIssues(correct, distractors) {
  if (distractors.length !== 3 || distractors.some(item => typeof item !== 'string' || !item.trim())) return ['нужны три варианта'];
  const issues = [];
  if (new Set([correct, ...distractors].map(item => item.trim().toLowerCase())).size !== 4) issues.push('повторы');
  const [low, high] = lengthRange(correct);
  if (!distractors.every(item => item.length >= low && item.length <= high)) issues.push(`длина вне диапазона ${low}–${high} символов`);
  if (correct.length >= 24 && Math.max(...distractors.map(item => item.length)) < 0.9 * correct.length) issues.push('правильный заметно длиннее всех');
  if (distractors.some(item => absolutes.test(item)) && !absolutes.test(correct)) issues.push('абсолютные слова');
  return issues;
}

/** A blind guesser sees only the options; finding the key from their look is a cue. */
export const blindGuessPrompt = 'Тебе показаны только варианты ответа тестового вопроса по ИТ, без самого вопроса. По формулировкам угадай, какой вариант скорее всего правильный. Верни только JSON {"choice":0} — индекс 0..3.';
