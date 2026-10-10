// Validation of the testing mechanics on synthetic candidates (allowed by the
// organizers, PR.1). It uses the real attempt builder, item selection, retake
// exclusion, clarifying block, scoring and pass threshold; only the answers come
// from a stated response model.
//
// Response model (3PL IRT): P(correct) = c + (1 - c) / (1 + exp(-1.7 a (θ - b)))
//   c = 0.25 (four options), a ≈ 1.3 ± 0.25, b = grade level ± 0.45 by slot ± variant noise.
//   A grade is an ability band [level, level + 1); a candidate of true grade g has
//   θ ~ N(level(g) + 0.5, 0.3). The "true" decision for a claimed grade is θ ≥ cut,
//   where cut is the ability at which the expected score equals the pass threshold.
// Item parameters are assumptions, not calibrated data: the run checks that the
// mechanics separate grades and give stable decisions *if* items behave as authored.
// Real calibration comes from pilot data (docs/dynamic_bank.md).
//
//   node scripts/validate-assessment.mjs [--candidates 200] [--seed 7] [--out docs/assessment_validation_results.md]
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { programs } from '../server/bank.mjs';
import { borderline, createAttempt, evaluate, extendBorderline, threshold } from '../server/assessment.mjs';
import { gradeOptions } from '../shared/grading.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const argument = (name, fallback) => { const index = process.argv.indexOf('--' + name); return index >= 0 ? process.argv[index + 1] : fallback; };
const perCell = Number(argument('candidates', 200));
const output = resolve(root, argument('out', 'docs/assessment_validation_results.md'));
let seed = Number(argument('seed', 7)) >>> 0;
const random = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
const hashUnit = text => createHash('sha256').update(text).digest().readUInt32BE(0) / 4294967296 - 0.5;
const mean = values => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
const pct = value => Math.round(value * 100);
const time = Date.parse('2026-10-10T00:00:00.000Z');

const grades = gradeOptions.map(item => item.value);
const level = Object.fromEntries(grades.map((grade, index) => [grade, -2 + index]));
const slotOffset = { 1: -0.45, 2: 0.45 };
function itemParameters(question, grade) {
  // Fixed per-variant deviations model non-identical "equivalent" items.
  return { b: level[grade] + slotOffset[question.difficulty] + 0.5 * hashUnit('b:' + question.variantId),
    a: 1.3 + 0.5 * hashUnit('a:' + question.variantId), c: 0.25 };
}
const probability = (theta, { a, b, c }) => c + (1 - c) / (1 + Math.exp(-1.7 * a * (theta - b)));
// Ability (relative to the grade level) at which the expected score equals the threshold.
const cutOffset = (() => {
  const expected = x => mean([1, 2].map(slot => probability(x, { a: 1.3, b: slotOffset[slot], c: 0.25 })));
  let low = -2, high = 3;
  for (let step = 0; step < 60; step++) { const middle = (low + high) / 2; if (expected(middle) < threshold / 100) low = middle; else high = middle; }
  return (low + high) / 2;
})();
const survey = (specialization, grade) => ({ id: 'validation', date: '2026-10-10T00:00:00.000Z', industry: 'ИТ', professionalRole: 'Специалист',
  specialization, desiredGrade: grade, experience: '2 года', stack: ['SQL'], softSkills: [] });
const answerFor = (theta, question, grade) => ({ questionId: question.id,
  optionId: random() < probability(theta, itemParameters(question, grade)) ? question.correctOptionId : question.options.find(option => option.id !== question.correctOptionId).id });

/** One attempt through the real mechanics; `clarify` adds the borderline block like the server does. */
function takeTest(theta, specialization, grade, { recent = [], clarify = true } = {}) {
  let attempt = createAttempt(survey(specialization, grade), '', recent, time);
  let answers = attempt.questions.map(question => answerFor(theta, question, grade));
  if (clarify) {
    const scored = attempt.questions.filter(question => !question.pilot);
    const provisional = Math.round(scored.filter(question => answers.find(answer => answer.questionId === question.id).optionId === question.correctOptionId).length / scored.length * 100);
    const longer = extendBorderline(attempt, provisional, { recent, now: time });
    if (longer) {
      answers = [...answers, ...longer.questions.slice(attempt.questions.length).map(question => answerFor(theta, question, grade))];
      attempt = longer;
    }
  }
  const { result } = evaluate(attempt, answers, time + 60000);
  return { attempt, result, correctness: attempt.questions.map((question, index) => answers[index].optionId === question.correctOptionId) };
}

const specializations = Object.keys(programs);
const report = { perCell, cutOffset, matrix: {}, retest: {}, leak: [] };
const itemStats = new Map();

// 1. Pass rate by true grade × tested grade (production behaviour, with the clarifying block).
for (const trueGrade of grades) {
  report.matrix[trueGrade] = {};
  for (const tested of grades) {
    let passed = 0;
    for (let index = 0; index < perCell; index++) {
      const theta = level[trueGrade] + 0.5 + 0.3 * normal();
      const taken = takeTest(theta, specializations[index % specializations.length], tested);
      if (taken.result.passed) passed++;
      if (trueGrade === tested) {
        const total = taken.result.score / 100;
        taken.attempt.questions.forEach((question, position) => {
          const stats = itemStats.get(question.familyId) || { n: 0, correct: 0, sum: 0, sumCorrect: 0, sumSquare: 0 };
          const correct = taken.correctness[position] ? 1 : 0;
          stats.n++; stats.correct += correct; stats.sum += total; stats.sumCorrect += correct * total; stats.sumSquare += total ** 2;
          itemStats.set(question.familyId, stats);
        });
      }
    }
    report.matrix[trueGrade][tested] = passed / perCell;
  }
}
const discriminations = [...itemStats.values()].filter(stats => stats.correct > 0 && stats.correct < stats.n).map(stats => {
  const p = stats.correct / stats.n, m = stats.sum / stats.n, sd = Math.sqrt(stats.sumSquare / stats.n - m * m);
  return ((stats.sumCorrect / stats.correct) - (stats.sum - stats.sumCorrect) / (stats.n - stats.correct)) / sd * Math.sqrt(p * (1 - p));
});
report.itemDiscrimination = { families: discriminations.length, mean: mean(discriminations), shareAbove02: discriminations.filter(value => value >= 0.2).length / discriminations.length };

// 2. Retest on a realistic mix of claims: 60% claim their grade, 25% one above, 15% one below.
function retest(clarify) {
  const pairs = [];
  for (let index = 0; index < perCell * grades.length; index++) {
    const trueGrade = grades[index % grades.length];
    const roll = random(), shift = roll < 0.6 ? 0 : roll < 0.85 ? 1 : -1;
    const claimed = grades[Math.min(grades.length - 1, Math.max(0, grades.indexOf(trueGrade) + shift))];
    const theta = level[trueGrade] + 0.5 + 0.3 * normal();
    const specialization = specializations[index % specializations.length];
    const first = takeTest(theta, specialization, claimed, { clarify });
    const second = takeTest(theta, specialization, claimed, { clarify, recent: [first.attempt] });
    const truth = theta >= level[claimed] + cutOffset;
    pairs.push({ first: first.result, second: second.result, truth,
      overlap: second.attempt.questions.filter(question => first.attempt.questions.some(other => other.variantId === question.variantId)).length,
      clarified: Boolean(first.result.clarified) });
  }
  const n = pairs.length;
  const agree = pairs.filter(pair => pair.first.passed === pair.second.passed).length / n;
  const p1 = pairs.filter(pair => pair.first.passed).length / n, p2 = pairs.filter(pair => pair.second.passed).length / n;
  const pe = p1 * p2 + (1 - p1) * (1 - p2);
  const xs = pairs.map(pair => pair.first.score), ys = pairs.map(pair => pair.second.score), mx = mean(xs), my = mean(ys);
  const correlation = pairs.reduce((sum, pair) => sum + (pair.first.score - mx) * (pair.second.score - my), 0)
    / Math.sqrt(xs.reduce((sum, x) => sum + (x - mx) ** 2, 0) * ys.reduce((sum, y) => sum + (y - my) ** 2, 0));
  return { pairs: n, agreement: agree, kappa: (agree - pe) / (1 - pe), correlation,
    accuracy: pairs.filter(pair => pair.first.passed === pair.truth).length / n,
    falsePass: pairs.filter(pair => pair.first.passed && !pair.truth).length / Math.max(1, pairs.filter(pair => !pair.truth).length),
    falseFail: pairs.filter(pair => !pair.first.passed && pair.truth).length / Math.max(1, pairs.filter(pair => pair.truth).length),
    clarifiedShare: pairs.filter(pair => pair.clarified).length / n, sharedItems: mean(pairs.map(pair => pair.overlap)),
    meanQuestions: mean(pairs.map(pair => pair.first.questionCount)) };
}
report.retest.single = retest(false);
report.retest.clarified = retest(true);

// 3. Leak resistance: share of a new attempt known in advance after N leaked attempts.
for (const poolPerFamily of [4, 10, 20]) {
  for (const leakedAttempts of [1, 5, 20, 50]) {
    let known = 0, asked = 0;
    for (let trial = 0; trial < 60; trial++) {
      const seen = new Set();
      const draw = () => { const picks = new Set(); while (picks.size < 2) picks.add(Math.floor(random() * poolPerFamily)); return [...picks]; };
      for (let leak = 0; leak < leakedAttempts; leak++) for (let family = 0; family < 6; family++) for (const pick of draw()) seen.add(family + ':' + pick);
      for (let family = 0; family < 6; family++) for (const pick of draw()) { asked++; if (seen.has(family + ':' + pick)) known++; }
    }
    report.leak.push({ poolPerFamily, leakedAttempts, knownShare: known / asked });
  }
}
function leakedPassRate(knownShare) {
  let passed = 0;
  for (let index = 0; index < perCell; index++) {
    const theta = level.Junior + 0.5 + 0.3 * normal();
    const { attempt } = takeTest(theta, specializations[index % specializations.length], 'Middle', { clarify: false });
    const correct = attempt.questions.filter(question => random() < knownShare || random() < probability(theta, itemParameters(question, 'Middle'))).length;
    if (Math.round(correct / attempt.questions.length * 100) >= threshold) passed++;
  }
  return passed / perCell;
}
report.leakedPass = [4, 10, 20].map(pool => ({ poolPerFamily: pool, passRate: leakedPassRate(report.leak.find(item => item.poolPerFamily === pool && item.leakedAttempts === 20).knownShare) }));

// ---- Report ----
const single = report.retest.single, clarified = report.retest.clarified;
const lines = [];
lines.push('# Результаты валидации механики тестирования', '');
lines.push(`Сгенерировано \`npm run validate:assessment-model\` (${perCell} синтетических кандидатов на ячейку, фиксированный seed). Используются настоящие сборка попытки, выбор и исключение заданий, уточняющий блок, подсчёт балла и порог ${threshold}/100. Ответы задаёт модель IRT (3PL), параметры — в комментарии [скрипта](../scripts/validate-assessment.mjs). Это проверка механики при условии, что задания ведут себя как размечены авторами, а не калибровка на людях; организаторы прямо допускают симуляцию (PR.1). Процедура описана в [assessment_validation.md](assessment_validation.md).`, '');
lines.push('## Разделяющая сила', '');
lines.push('Доля подтвердивших грейд. Строка — реальный уровень кандидата, столбец — грейд теста.', '');
lines.push('| Реальный \\ Тест | ' + grades.join(' | ') + ' |', '| --- | ' + grades.map(() => '---').join(' | ') + ' |');
for (const trueGrade of grades) lines.push(`| ${trueGrade} | ` + grades.map(tested => pct(report.matrix[trueGrade][tested]) + '%').join(' | ') + ' |');
const own = mean(grades.map(grade => report.matrix[grade][grade])), above = mean(grades.slice(0, -1).map((grade, index) => report.matrix[grade][grades[index + 1]]));
lines.push('', '```mermaid', 'xychart-beta', '  title "Подтверждают грейд: свой и на ступень выше, %"', '  x-axis [' + grades.map(grade => `"${grade}"`).join(', ') + ']',
  '  y-axis "Доля, %" 0 --> 100', '  bar [' + grades.map(grade => pct(report.matrix[grade][grade])).join(', ') + ']',
  '  bar [' + grades.map((grade, index) => grades[index + 1] ? pct(report.matrix[grade][grades[index + 1]]) : 0).join(', ') + ']', '```', '');
lines.push(`Свой грейд подтверждают в среднем ${pct(own)}%, грейд на ступень выше — ${pct(above)}%. Средняя точечно-бисериальная корреляция семейств заданий ${report.itemDiscrimination.mean.toFixed(2)}, у ${pct(report.itemDiscrimination.shareAbove02)}% семейств она не ниже 0,2.`, '');
lines.push('## Повторное прохождение (test-retest)', '');
lines.push('Тот же кандидат сдаёт тот же грейд второй раз на новой форме (задания первой попытки исключены). Смесь заявок: 60% — свой грейд, 25% — на ступень выше, 15% — ниже.', '');
lines.push('| Показатель | 12 вопросов | С уточняющим блоком |', '| --- | --- | --- |');
lines.push(`| Совпадение решения «подтверждён / нет» | ${pct(single.agreement)}% | ${pct(clarified.agreement)}% |`);
lines.push(`| Каппа Коэна | ${single.kappa.toFixed(2)} | ${clarified.kappa.toFixed(2)} |`);
lines.push(`| Корреляция баллов двух форм | ${single.correlation.toFixed(2)} | ${clarified.correlation.toFixed(2)} |`);
lines.push(`| Точность решения относительно истинного уровня | ${pct(single.accuracy)}% | ${pct(clarified.accuracy)}% |`);
lines.push(`| Ложно подтверждённые (уровень ниже порога) | ${pct(single.falsePass)}% | ${pct(clarified.falsePass)}% |`);
lines.push(`| Ложно не подтверждённые | ${pct(single.falseFail)}% | ${pct(clarified.falseFail)}% |`);
lines.push(`| Попыток с уточняющим блоком | — | ${pct(clarified.clarifiedShare)}% |`);
lines.push(`| Вопросов в среднем | ${single.meanQuestions.toFixed(1)} | ${clarified.meanQuestions.toFixed(1)} |`);
lines.push(`| Общих заданий у двух форм | ${single.sharedItems.toFixed(2)} | ${clarified.sharedItems.toFixed(2)} |`, '');
lines.push('```mermaid', 'xychart-beta', '  title "Стабильность решения при пересдаче, %"', '  x-axis ["Совпадение", "Точность", "Каппа × 100"]', '  y-axis "%" 0 --> 100',
  `  bar [${pct(single.agreement)}, ${pct(single.accuracy)}, ${pct(single.kappa)}]`, `  bar [${pct(clarified.agreement)}, ${pct(clarified.accuracy)}, ${pct(clarified.kappa)}]`, '```', '');
lines.push(`Первый ряд — 12 вопросов, второй — с уточняющим блоком (6 вопросов при балле ${borderline.from}–${borderline.to - 1}).`, '');
lines.push('## Устойчивость к утечке заданий', '');
lines.push('Доля вопросов новой попытки, известных заранее, если в сеть утекли N попыток той же программы.', '');
lines.push('| Заданий в семействе | 1 утечка | 5 утечек | 20 утечек | 50 утечек |', '| --- | --- | --- | --- | --- |');
for (const pool of [4, 10, 20]) lines.push(`| ${pool}${pool === 4 ? ' (авторский банк)' : ' (с генерацией)'} | ` + [1, 5, 20, 50].map(count => pct(report.leak.find(item => item.poolPerFamily === pool && item.leakedAttempts === count).knownShare) + '%').join(' | ') + ' |');
lines.push('', '```mermaid', 'xychart-beta', '  title "Известно заранее после 20 утечек, %"', '  x-axis ["4 в семействе", "10", "20"]', '  y-axis "Доля вопросов, %" 0 --> 100',
  '  bar [' + [4, 10, 20].map(pool => pct(report.leak.find(item => item.poolPerFamily === pool && item.leakedAttempts === 20).knownShare)).join(', ') + ']', '```', '');
lines.push('Слабый кандидат (уровень Junior) сдаёт Middle, зная ответы из 20 утёкших попыток:', '');
lines.push('| Заданий в семействе | Подтверждают Middle |', '| --- | --- |');
for (const item of report.leakedPass) lines.push(`| ${item.poolPerFamily} | ${pct(item.passRate)}% |`);
lines.push('', `Без утечки такой кандидат подтверждает Middle в ${pct(report.matrix.Junior.Middle)}% случаев. Конечный авторский банк расходится быстро, поэтому зачётный пул пополняется проверенными сгенерированными заданиями, сгенерированные выводятся после 150 показов, а последовательная выдача с лимитом 2 минуты на вопрос мешает собирать ответы во время теста.`, '');
lines.push('## Выводы и ограничения', '');
lines.push(`- Тест разделяет соседние грейды: свой грейд подтверждают ${pct(own)}%, грейд выше — ${pct(above)}%.`);
lines.push(`- Уточняющий блок повышает совпадение решений при пересдаче с ${pct(single.agreement)}% до ${pct(clarified.agreement)}% и точность с ${pct(single.accuracy)}% до ${pct(clarified.accuracy)}%; его получают ${pct(clarified.clarifiedShare)}% попыток.`);
lines.push('- Формы практически не пересекаются: задания прошлой попытки исключаются.');
lines.push('- Параметры заданий заданы моделью. Настоящие сложность и дискриминацию даёт пилот: незачётные задания и статистика ответов в банке.');
writeFileSync(output, lines.join('\n') + '\n');
console.log(JSON.stringify({ own: pct(own), above: pct(above), single, clarified, discrimination: report.itemDiscrimination, output }, null, 2));
