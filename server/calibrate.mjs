import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * fraction;
  const low = Math.floor(index), high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

export function calibrate(input) {
  if (!input || typeof input.bankVersion !== 'string' || !Array.isArray(input.participants) || !input.participants.length) throw new Error('Нужны версия банка и непустой массив participants.');
  const people = new Set(), attempts = new Set(), groups = new Map();
  for (const row of input.participants) {
    if (!row || typeof row.id !== 'string' || !row.id.trim() || people.has(row.id)
      || !/^(Frontend|Backend)\/(Junior|Middle)$/.test(row.program)) throw new Error('Участник должен иметь уникальный ID и одну поддерживаемую программу.');
    people.add(row.id);
    for (const attempt of [row.first, row.second]) {
      if (!attempt || typeof attempt.id !== 'string' || !attempt.id || attempts.has(attempt.id)
        || !Number.isFinite(attempt.score) || attempt.score < 0 || attempt.score > 100) throw new Error('Нужны две разные попытки с результатом 0–100.');
      attempts.add(attempt.id);
    }
    const group = groups.get(row.program) || [];
    group.push(row); groups.set(row.program, group);
  }
  return {
    bankVersion: input.bankVersion,
    note: 'Метрики вычислены из входного набора; достоверность разметки и протокол исследования проверяются отдельно.',
    programs: [...groups].map(([program, rows]) => {
      const differences = rows.map(row => row.second.score - row.first.score);
      const absolute = differences.map(Math.abs);
      return { program, pairs: rows.length,
        confirmationAgreement: rows.filter(row => (row.first.score >= 70) === (row.second.score >= 70)).length / rows.length,
        meanDifference: mean(differences), meanAbsoluteDifference: mean(absolute),
        medianAbsoluteDifference: percentile(absolute, 0.5), p95AbsoluteDifference: percentile(absolute, 0.95),
        firstMean: mean(rows.map(row => row.first.score)), secondMean: mean(rows.map(row => row.second.score)),
      };
    }),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.argv[2]) throw new Error('Укажите файл с реальными парными прохождениями: node server/calibrate.mjs pairs.json');
    console.log(JSON.stringify(calibrate(JSON.parse(await readFile(process.argv[2], 'utf8'))), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
