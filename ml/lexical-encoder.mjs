/**
 * Deterministic stand-in for the trained encoder, used only by the relevance
 * evaluation when the neural artifact (server/data/semantic-model) is absent.
 * Hashed bag of truncated word stems, L2-normalised; no training, no network.
 * Its cosine threshold was fixed before the first evaluation run.
 * It measures the search pipeline around the model, not the model itself.
 */
const DIMENSION = 512;
const STOP = new Set(['для', 'что', 'чтобы', 'как', 'нужен', 'нужна', 'нужно', 'нужны', 'ищем', 'который', 'которая', 'человек', 'человека',
  'или', 'при', 'без', 'после', 'перед', 'между', 'это', 'его', 'она', 'они', 'так', 'уже', 'ещё', 'еще', 'также', 'один', 'одно']);

function hash(text) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.codePointAt(0), 16777619) >>> 0;
  return value;
}

export function lexicalVector(text) {
  const vector = new Array(DIMENSION).fill(0);
  const words = String(text).toLocaleLowerCase('ru').replaceAll('ё', 'е').match(/[\p{L}\p{N}+#]+/gu) || [];
  for (const word of words) {
    if (word.length < 3 || STOP.has(word)) continue;
    const stem = /^[а-я]+$/u.test(word) ? word.slice(0, 6) : word;
    vector[hash(stem) % DIMENSION] += 1;
  }
  const norm = Math.hypot(...vector);
  return norm ? vector.map(value => value / norm) : vector;
}

export class LexicalEncoder {
  info = { status: 'ready', name: 'Lexical stand-in (evaluation only)', version: 'lexical-stems-v1', dimension: DIMENSION, trained: false, threshold: 0.15 };
  async start() { return this.info; }
  async encode(texts) { return texts.map(lexicalVector); }
  close() {}
}
