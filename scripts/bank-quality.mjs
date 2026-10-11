// Quality of the closed bank: can a candidate find the key without knowing the subject?
//   - cue strategies: pick the longest option, or the one sharing most words with the question;
//   - pass by guessing: the chance to score >= 70 on 12 items with that strategy;
//   - blind guess (--blind): an open model sees only the four options, never the question.
// Compares the authored bank with the bank in use (revised distractors, docs/bank_quality.md).
//
//   node --use-env-proxy scripts/bank-quality.mjs [--blind] [--out docs/bank_quality.md]
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authoredPrograms, programs } from '../server/bank.mjs';
import { threshold } from '../server/assessment.mjs';
import { cueReport, itemsOf } from '../server/bank-cues.mjs';
import { revisedDistractors } from '../server/banks/revised-distractors.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const argument = name => { const index = process.argv.indexOf('--' + name); return index >= 0 ? process.argv[index + 1] : null; };
const blind = process.argv.includes('--blind');
// A strong open model without a position bias (Qwen picked the first option in checks).
const blindModel = argument('blind-model') || 'openai/gpt-oss-120b';
const output = resolve(root, argument('out') || 'docs/bank_quality.md');

async function blindReport(bank) {
  process.loadEnvFile(resolve(root, '.env'));
  const { createLlmClient } = await import('../server/llm.mjs');
  const llm = createLlmClient({ env: process.env });
  const items = itemsOf(bank).map(item => {
    const order = [0, 1, 2, 3].sort((a, b) => createHash('sha1').update(item.id + ':' + a).digest()[0] - createHash('sha1').update(item.id + ':' + b).digest()[0]);
    return { ...item, shown: order.map(index => item.options[index]), key: order.indexOf(item.correct) };
  });
  const system = 'Тебе показаны только варианты ответа тестового вопроса по ИТ, без самого вопроса. По формулировкам угадай, какой вариант скорее всего правильный. Верни JSON {"answers":[{"id":"...","choice":0}]} — choice это индекс 0..3.';
  const guesses = new Map(), batches = [];
  for (let index = 0; index < items.length; index += 12) batches.push(items.slice(index, index + 12));
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (batches.length) {
      const batch = batches.shift();
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const reply = await llm.chat({ model: blindModel, fallback: null, json: true, temperature: 0, maxTokens: 1500, timeoutMs: 60000, providerSort: 'latency',
            messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(batch.map(item => ({ id: item.id, options: item.shown }))) }] });
          for (const answer of reply.json?.answers || []) if (Number.isInteger(answer?.choice)) guesses.set(answer.id, answer.choice);
          break;
        } catch { /* retried */ }
      }
    }
  }));
  const byProgram = new Map();
  for (const item of items) {
    if (!guesses.has(item.id)) continue;
    const row = byProgram.get(item.program) || { hit: 0, n: 0 };
    row.n++; if (guesses.get(item.id) === item.key) row.hit++;
    byProgram.set(item.program, row);
  }
  return byProgram;
}

const pct = value => Math.round(value * 100) + '%';
const before = cueReport(authoredPrograms), after = cueReport(programs);
const gradesOrder = ['Intern', 'Junior', 'Middle', 'Senior', 'Lead'];
const byGrade = (rows, key) => gradesOrder.map(grade => { const list = rows.filter(row => row.grade === grade); return list.reduce((sum, row) => sum + row[key] * row.n, 0) / list.reduce((sum, row) => sum + row.n, 0); });
const blindBefore = blind ? await blindReport(authoredPrograms) : null, blindAfter = blind ? await blindReport(programs) : null;
const blindRate = (map, filter = () => true) => { let hit = 0, n = 0; for (const [program, row] of map) if (filter(program)) { hit += row.hit; n += row.n; } return n ? hit / n : null; };
const revisedCount = Object.keys(revisedDistractors).length;

const lines = [
  '# Качество закрытого банка',
  '',
  `Сгенерировано \`node scripts/bank-quality.mjs${blind ? ' --blind' : ''}\`. Вопрос «хорош», если правильный ответ нельзя найти, не зная предмета. Проверяются три способа угадать: выбрать **самый длинный** вариант, выбрать вариант **со словами из вопроса** (вместе с длиной) и — с флагом \`--blind\` — дать открытой модели (${blindModel}) **только варианты, без вопроса**. Случайный выбор даёт 25%.`,
  '',
  `Авторский банк — ${itemsOf(authoredPrograms).length} вопросов. В ${revisedCount} из них неправильные варианты переписаны (\`server/banks/revised-distractors.mjs\`, скрипт \`scripts/revise-distractors.mjs\`): условие и правильный ответ авторские и не менялись, три неверных варианта заменены правдоподобными ошибками того же грейда, формы и длины. Ревизия принимается, только если два независимых судьи (gpt-oss-120b и DeepSeek V3.2), видя условие, признают авторский ключ верным, а каждый новый вариант — однозначно неверным (не «тоже рабочий способ» и не «частично верно»); модель, видящая только варианты, не должна находить ключ (иначе до трёх попыток). Qwen судьёй не используется: в проверках он отмечал верным первый вариант независимо от содержания.`,
  '',
  '## По грейдам',
  '',
  '| Грейд | Самый длинный: было → стало | Длина + слова вопроса: было → стало |' + (blind ? ' Без вопроса (модель): было → стало |' : ''),
  '| --- | --- | --- |' + (blind ? ' --- |' : ''),
  ...gradesOrder.map((grade, index) => `| ${grade} | ${pct(byGrade(before, 'longest')[index])} → ${pct(byGrade(after, 'longest')[index])} | ${pct(byGrade(before, 'combined')[index])} → ${pct(byGrade(after, 'combined')[index])} |`
    + (blind ? ` ${pct(blindRate(blindBefore, program => program.endsWith(' ' + grade)))} → ${pct(blindRate(blindAfter, program => program.endsWith(' ' + grade)))} |` : '')),
  '',
  `Сдать закрытую часть (≥ ${threshold} из 100 на 12 вопросах) только по подсказке «длина + слова вопроса»: программ, где это удаётся хотя бы каждому четвёртому, было ${before.filter(row => row.pass >= 0.25).length} из ${before.length}, стало ${after.filter(row => row.pass >= 0.25).length}; худшая программа — было ${pct(Math.max(...before.map(row => row.pass)))}, стало ${pct(Math.max(...after.map(row => row.pass)))}.`,
  ...(blind ? ['', `Модель, видящая только варианты ответа, угадывает правильный: было ${pct(blindRate(blindBefore))}, стало ${pct(blindRate(blindAfter))}. Программ, где без вопроса угадывается половина и больше: было ${[...blindBefore].filter(([, row]) => row.hit / row.n >= 0.5).length}, стало ${[...blindAfter].filter(([, row]) => row.hit / row.n >= 0.5).length}.`] : []),
  '',
  '## Худшие программы после ревизии',
  '',
  '| Программа | Самый длинный | Длина + слова | Шанс сдать подсказкой |' + (blind ? ' Без вопроса |' : ''),
  '| --- | --- | --- | --- |' + (blind ? ' --- |' : ''),
  ...[...after].sort((a, b) => b.combined - a.combined).slice(0, 10).map(row => `| ${row.program} | ${pct(row.longest)} | ${pct(row.combined)} | ${pct(row.pass)} |`
    + (blind ? ` ${blindAfter.get(row.program) ? pct(blindAfter.get(row.program).hit / blindAfter.get(row.program).n) : '—'} |` : '')),
  '',
  '## Ограничения',
  '',
  '- Угадывание моделью без вопроса — одна выборка на вопрос; на уровне программы (24 вопроса) разброс ±10 п. п.',
  '- Подсказки проверяют вид вариантов, а не сложность. Реальная сложность и дискриминация каждого вопроса измеряются на ответах кандидатов (пилот, `docs/dynamic_bank.md`).',
  '- От модели на телефоне закрытый вопрос не защищён в принципе: поэтому половина итога — практические задачи с цитатами из ответа и проверкой двумя моделями ([open_tasks.md](open_tasks.md)).',
  '',
];
writeFileSync(output, lines.join('\n'));
console.log(lines.slice(6, 16).join('\n'));
