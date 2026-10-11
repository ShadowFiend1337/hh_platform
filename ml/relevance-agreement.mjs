/**
 * Independent second labelling of ml/relevance-labels.json and inter-annotator agreement.
 *   node ml/relevance-agreement.mjs sheet --output <dir>
 *     writes sheet.csv (blind: query, profile role, stack and task; empty grade)
 *     and key.json (pair id -> need and profile, no grades).
 *   node ml/relevance-agreement.mjs score --sheet <filled.csv> --key <dir>/key.json [--output report.json]
 *     compares the second grades with the reference rubric.
 * The sample is fixed (seeded): per need 6 profiles, stratified by reference
 * grade so that every level appears, then shuffled across needs. The annotator
 * sees neither reference grades nor search results. Protocol: docs/relevance_labeling.md.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { labels, seeds, grade } from './relevance-eval.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const option = name => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : undefined; };
const byId = new Map(seeds.map(person => [person.id, person]));

function random(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; }; }
const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',' || char === ';') { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') { if (char === '\r' && text[index + 1] === '\n') index++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(values => values.some(value => value.trim()));
}

/** Stratified, seeded sample of pairs; the reference grade is used only to stratify. */
export function samplePairs(perNeed = 6, seed = 20261011) {
  const next = random(seed), pairs = [];
  for (const need of labels.needs) {
    const strata = [3, 2, 1, 0].map(level => seeds.filter(person => grade(need, person) === level)
      .map(person => [next(), person]).sort((a, b) => a[0] - b[0]).map(([, person]) => person));
    // Two exact, two same-direction, one adjacent and one unrelated profile.
    const chosen = [2, 2, 1, 1].flatMap((quota, level) => strata[level].slice(0, quota));
    for (const stratum of strata) for (const person of stratum) if (chosen.length < perNeed && !chosen.includes(person)) chosen.push(person);
    for (const person of chosen) pairs.push({ need: need.id, profile: person.id });
  }
  return pairs.map(pair => [next(), pair]).sort((a, b) => a[0] - b[0]).map(([, pair], index) => ({ pair: `P${String(index + 1).padStart(3, '0')}`, ...pair }));
}

/** Cohen's kappa with quadratic weights over grades 0..3 (weighted) or two classes. */
export function kappa(pairs, levels, weighted = true) {
  const n = pairs.length, size = levels.length, index = new Map(levels.map((level, position) => [level, position]));
  const observed = Array.from({ length: size }, () => Array(size).fill(0));
  for (const [a, b] of pairs) observed[index.get(a)][index.get(b)]++;
  const rows = observed.map(row => row.reduce((sum, value) => sum + value, 0));
  const columns = levels.map((_, column) => observed.reduce((sum, row) => sum + row[column], 0));
  const weight = (i, j) => weighted ? (i - j) ** 2 / (size - 1) ** 2 : i === j ? 0 : 1;
  let disagreement = 0, chance = 0;
  for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) {
    disagreement += weight(i, j) * observed[i][j] / n;
    chance += weight(i, j) * rows[i] * columns[j] / n / n;
  }
  return { kappa: chance ? 1 - disagreement / chance : 1, matrix: observed };
}

export function agreement(rows) {
  const graded = rows.map(({ reference, second }) => [reference, second]);
  const relevant = graded.map(([a, b]) => [a >= 2 ? 1 : 0, b >= 2 ? 1 : 0]);
  const exact = graded.map(([a, b]) => [a === 3 ? 1 : 0, b === 3 ? 1 : 0]);
  const share = list => list.filter(([a, b]) => a === b).length / list.length;
  return { pairs: rows.length, exactAgreement: share(graded), weightedKappa: kappa(graded, [0, 1, 2, 3]).kappa,
    relevantAgreement: share(relevant), relevantKappa: kappa(relevant, [0, 1], false).kappa,
    exactMatchAgreement: share(exact), exactMatchKappa: kappa(exact, [0, 1], false).kappa,
    confusion: kappa(graded, [0, 1, 2, 3]).matrix };
}

async function main() {
  const command = process.argv[2];
  if (command === 'sheet') {
    const output = resolve(root, option('--output') || 'server/data/relevance-agreement');
    const pairs = samplePairs();
    const needs = new Map(labels.needs.map(need => [need.id, need]));
    const lines = [['pair', 'need', 'role', 'stack', 'profile_task', 'grade_0_3'].map(csvCell).join(',')];
    for (const pair of pairs) {
      const person = byId.get(pair.profile);
      lines.push([pair.pair, needs.get(pair.need).query, person.professionalRole, (person.stack || []).join(', '), person.bio, ''].map(csvCell).join(','));
    }
    await mkdir(output, { recursive: true });
    await writeFile(join(output, 'sheet.csv'), '﻿' + lines.join('\n') + '\n');
    await writeFile(join(output, 'key.json'), JSON.stringify({ suiteVersion: labels.suiteVersion, pairs }, null, 1) + '\n');
    console.log(`${pairs.length} пар: ${join(output, 'sheet.csv')}`);
    return;
  }
  if (command === 'score') {
    const key = JSON.parse(await readFile(resolve(root, option('--key')), 'utf8'));
    const [header, ...body] = parseCsv((await readFile(resolve(root, option('--sheet')), 'utf8')).replace(/^﻿/u, ''));
    const pairColumn = header.indexOf('pair'), gradeColumn = header.indexOf('grade_0_3');
    const second = new Map(body.map(values => [values[pairColumn], values[gradeColumn]?.trim()]));
    const needs = new Map(labels.needs.map(need => [need.id, need]));
    const rows = key.pairs.map(pair => ({ ...pair, reference: grade(needs.get(pair.need), byId.get(pair.profile)), second: Number(second.get(pair.pair)) }));
    const invalid = rows.filter(row => !Number.isInteger(row.second) || row.second < 0 || row.second > 3);
    if (invalid.length) throw new Error(`Нет оценки 0–3 у ${invalid.length} пар, например ${invalid[0].pair}.`);
    const report = agreement(rows);
    console.log(JSON.stringify(report, null, 1));
    if (option('--output')) await writeFile(resolve(root, option('--output')), JSON.stringify({ ...report, rows }, null, 1) + '\n');
    return;
  }
  throw new Error('Команда: sheet или score.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
