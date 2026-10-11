// Rewrites the wrong options of authored closed items whose distractors give the key away
// (docs/bank_quality.md). The question and the correct option never change. Each revision:
//   1. the generator (DeepSeek) writes six candidate misconceptions of the same grade, form and length;
//   2. two judges that see the question (gpt-oss and DeepSeek) rate the key and every candidate: the
//      key must be correct; only candidates both call plainly incorrect (not another working way,
//      reason or part of the answer) are eligible;
//   3. three eligible candidates closest to the key's length that pass the cue lint are kept;
//   4. a blind guesser that sees only the options (gpt-oss) should not find the key — otherwise retry.
// Qwen is not used as a judge: in checks it marked the first option correct regardless of content.
// Progress is cached in server/data/distractor-revisions.json; the module
// server/banks/revised-distractors.mjs is written from it.
//
//   node --use-env-proxy scripts/revise-distractors.mjs --grades Junior,Middle [--limit 20] [--only id,id] [--write]
//   --reverify re-checks cached revisions with the judges; failed ones are regenerated on the next run.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
try { process.loadEnvFile(resolve(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const { createLlmClient } = await import('../server/llm.mjs');
const { authoredPrograms } = await import('../server/bank.mjs');
const { blindGuessPrompt, distractorIssues, lengthRange } = await import('../server/bank-cues.mjs');

const args = process.argv.slice(2);
const option = name => { const index = args.indexOf('--' + name); return index >= 0 ? args[index + 1] : null; };
const grades = (option('grades') || 'Junior,Middle').split(',');
const only = option('only') ? new Set(option('only').split(',')) : null;
const limit = Number(option('limit')) || Infinity;
const cachePath = resolve(root, 'server/data/distractor-revisions.json');
const modulePath = resolve(root, 'server/banks/revised-distractors.mjs');
const llm = createLlmClient({ env: process.env });
const independent = process.env.DISTRACTOR_JUDGE_MODEL || 'openai/gpt-oss-120b';
const generator = llm.models.verifier, guesser = independent, judges = [independent, llm.models.verifier];

const generatePrompt = ['Ты автор профессиональных тестов для ИТ-специалистов. Предложи шесть неверных вариантов ответа к вопросу. Условие и правильный ответ не меняй.',
  'Каждый неверный вариант:',
  '- типичное заблуждение специалиста указанного грейда: неверный факт, неверная причина или механизм, неверный расчёт, действие, которое не решает именно эту задачу или вредит; человек без знаний не должен отличить его от правильного по виду;',
  '- однозначно неверен для описанной ситуации: это не другой рабочий способ, не ещё одна верная причина, не часть правильного ответа и не более общее верное утверждение — эксперт должен без спора признать вариант ошибкой;',
  '- той же формы, стиля и конкретности, что правильный ответ, длиной в пределах distractorLengthChars символов; та же терминология;',
  '- без абсурда, шуток и ответов не по теме; без слов «всегда», «никогда», «любой», «все перечисленное»;',
  '- шесть вариантов различаются между собой и с правильным по смыслу.',
  'Правильный ответ не должен выделяться точностью или длиной. Текущие неверные варианты слишком очевидны — не повторяй их стиль.',
  'Верни только JSON: {"distractors":["...","...","...","...","...","..."]}'].join('\n');
const judgePrompt = 'Ты опытный специалист и строгий рецензент теста. Для каждого варианта ответа реши, верен ли он как ответ на вопрос в описанной ситуации: correct — верный ответ; partly — частично верен, тоже рабочий способ или ещё одна верная причина; incorrect — неверен по существу. Верни только JSON {"verdicts":[{"option":"точный текст варианта","verdict":"correct | partly | incorrect"}],"note":"кратко"} — по одному элементу на каждый из вариантов.';

async function ask(model, system, user, maxTokens = 700) {
  const reply = await llm.chat({ model, fallback: null, json: true, temperature: 0.2, maxTokens, timeoutMs: 90000, providerSort: 'latency',
    messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(user) }] });
  if (!reply.json) throw new Error('no json');
  return reply.json;
}

const norm = text => String(text || '').toLowerCase().replace(/\s+/gu, ' ').trim();
const shuffled = (id, list) => list.map((value, index) => ({ value, rank: createHash('sha1').update(id + ':' + index).digest().readUInt32BE(0) })).sort((a, b) => a.rank - b.rank).map(entry => entry.value);

/**
 * Verdicts of both judges on the key and the candidate options, matched by option text (a judge
 * cannot pass by echoing an example order). Returns the candidates both judges call plainly
 * incorrect, or null when either judge does not find the key correct.
 */
async function judgeCandidates(item, candidates) {
  const key = item.options[item.correct], shown = shuffled(item.id, [key, ...candidates]);
  const replies = await Promise.all(judges.map(model => ask(model, judgePrompt, { question: item.text, options: shown }, 1600)));
  const verdictOf = (reply, text) => (Array.isArray(reply.verdicts) ? reply.verdicts : []).find(entry => norm(entry?.option) === norm(text))?.verdict;
  if (!replies.every(reply => verdictOf(reply, key) === 'correct')) return { keyOk: false, notes: replies.map(reply => String(reply.note || '').slice(0, 200)) };
  return { keyOk: true, wrong: candidates.filter(text => replies.every(reply => verdictOf(reply, text) === 'incorrect')) };
}

/** Three plainly wrong options closest to the key's length that pass the cue check, or null. */
function pickThree(key, wrong) {
  const ordered = [...wrong].sort((a, b) => Math.abs(a.length - key.length) - Math.abs(b.length - key.length));
  for (let a = 0; a < ordered.length; a++) for (let b = a + 1; b < ordered.length; b++) for (let c = b + 1; c < ordered.length; c++) {
    const triple = [ordered[a], ordered[b], ordered[c]];
    if (!distractorIssues(key, triple).length) return triple;
  }
  return null;
}

/** Both judges must call the key correct and every wrong option plainly incorrect (used by --reverify). */
async function judged(item, distractors) {
  const verdict = await judgeCandidates(item, distractors);
  return { clean: verdict.keyOk && verdict.wrong.length === distractors.length, notes: verdict.notes || ['вариант признан верным или частично верным'] };
}

/** One revision attempt: six candidates, both judges on all of them, three clean ones, a blind guess. */
async function attempt(item, previous) {
  const key = item.options[item.correct];
  const generated = await ask(generator, generatePrompt, { specialization: item.specialization, grade: item.grade, topic: item.topic,
    skills: item.skills, question: item.text, correct: key, distractorLengthChars: lengthRange(key),
    currentDistractors: item.options.filter((_, index) => index !== item.correct), ...(previous ? { rejectedBecause: previous } : {}) }, 1400);
  const [low, high] = lengthRange(key);
  const candidates = [...new Set((Array.isArray(generated.distractors) ? generated.distractors : []).map(value => String(value).trim()))]
    .filter(text => text && norm(text) !== norm(key) && text.length >= low && text.length <= high);
  if (candidates.length < 3) return { issues: ['мало вариантов нужной длины'], solved: false };
  const verdict = await judgeCandidates(item, candidates);
  if (!verdict.keyOk) return { issues: ['судьи не признали ключ верным: ' + verdict.notes.join(' / ')], solved: false };
  const distractors = pickThree(key, verdict.wrong);
  if (!distractors) return { issues: [`однозначно неверных вариантов подходящей длины ${verdict.wrong.length} из ${candidates.length}`], solved: false };
  const options = [...distractors]; options.splice(item.correct, 0, key);
  const shown = shuffled(item.id + ':blind', options);
  const blind = await ask(guesser, blindGuessPrompt, { options: shown });
  return { distractors, issues: [], solved: true, blind: shown[blind.choice] === key };
}

async function revise(item) {
  let best = null, reason = null;
  for (let round = 0; round < 3; round++) {
    let result;
    try { result = await attempt(item, reason); } catch (error) { reason = 'ошибка модели: ' + error.message; continue; }
    if (result.solved && !result.blind) return { ...result, rounds: round + 1 };
    if (result.solved && !best) best = result;
    reason = result.issues.length ? result.issues.join(', ') : 'по виду вариантов ключ угадывается без условия';
  }
  return best ? { ...best, rounds: 3 } : { failed: true, reason };
}

export function writeModule(cache) {
  // Only revisions both judges accepted reach the bank.
  const entries = Object.entries(cache).filter(([, value]) => value?.distractors && value.judged).sort(([a], [b]) => a.localeCompare(b));
  const body = entries.map(([id, value]) => `  ${JSON.stringify(id)}: ${JSON.stringify(value.distractors)},`).join('\n');
  writeFileSync(modulePath, `// Revised wrong options of authored closed items (docs/bank_quality.md), written by
// scripts/revise-distractors.mjs. The question and the correct option are authored and unchanged;
// the three distractors were rewritten as plausible misconceptions and kept only when two
// independent judges found the authored key correct and each new option plainly incorrect.
// Order: the remaining options in their authored positions.
export const revisedDistractors = Object.freeze({
${body}
});
`);
  return entries.length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
  const items = [];
  for (const [specialization, byGrade] of Object.entries(authoredPrograms)) for (const [grade, program] of Object.entries(byGrade)) {
    if (!grades.includes(grade)) continue;
    for (const family of program.families) for (const variant of family.variants) {
      if (only ? only.has(variant.id) : !cache[variant.id]?.distractors) items.push({ ...variant, specialization, grade, topic: family.topic });
    }
  }
  if (args.includes('--reverify')) {
    const cached = [];
    for (const [specialization, byGrade] of Object.entries(authoredPrograms)) for (const [grade, program] of Object.entries(byGrade)) {
      if (!grades.includes(grade)) continue;
      for (const family of program.families) for (const variant of family.variants) if (cache[variant.id]?.distractors && !cache[variant.id].judged) cached.push(variant);
    }
    let dropped = 0, checked = 0;
    await Promise.all(Array.from({ length: Number(option('concurrency')) || 16 }, async () => {
      while (cached.length) {
        const variant = cached.shift();
        try {
          const verdict = await judged(variant, cache[variant.id].distractors);
          if (verdict.clean) cache[variant.id].judged = true;
          else { cache[variant.id] = { failed: true, reason: 'перепроверка: ' + verdict.notes.join(' / ') }; dropped++; }
        } catch { /* left for the next run */ }
        checked++;
      }
    }));
    mkdirSync(dirname(cachePath), { recursive: true }); writeFileSync(cachePath, JSON.stringify(cache, null, 1));
    console.log(JSON.stringify({ reverified: checked, dropped }));
    process.exit(0);
  }
  const queue = items.slice(0, limit);
  let done = 0, kept = 0;
  const save = () => { mkdirSync(dirname(cachePath), { recursive: true }); writeFileSync(cachePath, JSON.stringify(cache, null, 1)); };
  await Promise.all(Array.from({ length: Number(option('concurrency')) || 16 }, async () => {
    while (queue.length) {
      const item = queue.shift();
      const result = await revise(item);
      cache[item.id] = result.failed ? result : { distractors: result.distractors, blindGuessed: result.blind, rounds: result.rounds, why: result.why, judged: true };
      if (!result.failed) kept++;
      if (++done % 10 === 0) { save(); console.error(`${done}/${items.length} · переписано ${kept}`); }
    }
  }));
  save();
  if (args.includes('--write')) console.log(`Записано ревизий: ${writeModule(cache)}`);
  console.log(JSON.stringify({ processed: done, revised: kept, failed: done - kept }));
}
