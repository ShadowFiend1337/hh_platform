/**
 * Graded relevance evaluation of candidate search on the demo catalogue.
 * Labels: ml/relevance-labels.json (team reference labels, rubric inside).
 * Do not tune thresholds, weights or labels on this set.
 *
 * Run:  npm run evaluate:relevance                      # lexical stand-in encoder
 *       node ml/relevance-eval.mjs --model server/data/semantic-model
 *       --output <file.json> keeps per-need results; --compare <file.json>
 *       adds paired differences against a saved run (e.g. an older commit).
 * Systems: specialization filter baseline, the full pipeline and ablations
 * that change only the catalogue copy given to the same pipeline:
 *   no-test      every confirmed test score equal, so the test cannot reorder;
 *   no-fsp       achievements removed, so there is no FSP bonus;
 *   no-test-fsp  both.
 * Metrics: P@5, P@10 (grade >= 2, fixed denominator), nDCG@10 (gain 2^g - 1,
 * ideal order over the whole catalogue), MRR@10 of the first exact match
 * (grade 3), share of empty results and mean number of shown profiles.
 * 95% intervals: percentile bootstrap over needs, 2000 resamples, fixed seed;
 * differences are paired by need.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DirectoryService, interpretQuery } from '../server/directory.mjs';
import { directoryCandidates, legacyDirectoryCandidates } from '../server/directory-seed.mjs';
import { LexicalEncoder } from './lexical-encoder.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const option = name => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : undefined; };
export const K = 10;
export const seeds = [...directoryCandidates, ...legacyDirectoryCandidates];
export const labels = JSON.parse(await readFile(resolve(root, 'ml/relevance-labels.json'), 'utf8'));
const byId = new Map(seeds.map(person => [person.id, person]));
const KEYS = ['p5', 'p10', 'ndcg10', 'mrr10', 'empty', 'shown'];

export function grade(need, person) {
  if (Object.hasOwn(need.overrides || {}, person.id)) return need.overrides[person.id];
  if (need.exact.includes(person.id)) return 3;
  const specialization = person.confirmed?.specialization || person.specialization;
  const skills = new Set((person.stack || []).map(skill => skill.toLocaleLowerCase('ru')));
  const hasStack = !need.stackAny || need.stackAny.some(skill => skills.has(skill.toLocaleLowerCase('ru')));
  if (need.specialization.includes(specialization)) return hasStack ? 2 : 1;
  return need.related.includes(specialization) ? 1 : 0;
}

export function metrics(need, ids) {
  const grades = ids.slice(0, K).map(id => byId.has(id) ? grade(need, byId.get(id)) : 0);
  const dcg = list => list.reduce((sum, value, index) => sum + (2 ** value - 1) / Math.log2(index + 2), 0);
  const ideal = dcg(seeds.map(person => grade(need, person)).sort((a, b) => b - a).slice(0, K));
  const exact = grades.indexOf(3);
  return {
    p5: grades.slice(0, 5).filter(value => value >= 2).length / 5,
    p10: grades.filter(value => value >= 2).length / K,
    ndcg10: ideal ? dcg(grades) / ideal : 0,
    mrr10: exact < 0 ? 0 : 1 / (exact + 1),
    empty: ids.length ? 0 : 1,
    shown: Math.min(ids.length, K),
  };
}

const mean = (rows, key) => rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
function bootstrap(rows) {
  let seed = 20261011;
  const next = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const samples = Object.fromEntries(KEYS.map(key => [key, []]));
  for (let draw = 0; draw < 2000; draw++) {
    const sample = rows.map(() => rows[Math.floor(next() * rows.length)]);
    for (const key of KEYS) samples[key].push(mean(sample, key));
  }
  return Object.fromEntries(KEYS.map(key => {
    const sorted = samples[key].sort((a, b) => a - b);
    return [key, { mean: mean(rows, key), ci: [sorted[Math.floor(0.025 * sorted.length)], sorted[Math.ceil(0.975 * sorted.length) - 1]] }];
  }));
}
/** Paired by need: (system - reference) per need, then the bootstrap above. */
export function pairedDifference(rows, reference) {
  const lookup = new Map(reference.map(row => [row.id, row]));
  return bootstrap(rows.filter(row => lookup.has(row.id)).map(row => Object.fromEntries(KEYS.map(key => [key, row[key] - lookup.get(row.id)[key]]))));
}

// What a plain filter gives: the specialization named in the text, best test first.
function specializationFilter(query) {
  const wanted = interpretQuery(query, { cities: [] }).queryConstraints.any.specialization || [];
  return seeds.filter(person => wanted.includes(person.confirmed?.specialization))
    .sort((a, b) => b.confirmed.score - a.confirmed.score || a.name.localeCompare(b.name, 'ru') || a.id.localeCompare(b.id)).map(person => person.id);
}
const withoutTest = list => list.map(person => ({ ...person, confirmed: { ...person.confirmed, score: 90 } }));
const withoutFsp = list => list.map(person => ({ ...person, achievements: [] }));

async function main() {
  const modelPath = option('--model');
  let encoder = new LexicalEncoder();
  if (modelPath) {
    const { SemanticWorker } = await import('../server/semantic-worker.mjs');
    encoder = new SemanticWorker({ modelPath: resolve(root, modelPath) });
  }
  const catalogues = { pipeline: seeds, 'no-test': withoutTest(seeds), 'no-fsp': withoutFsp(seeds), 'no-test-fsp': withoutFsp(withoutTest(seeds)) };
  const services = Object.fromEntries(Object.entries(catalogues).map(([name, catalogue]) => [name, new DirectoryService(':memory:', { seeds: catalogue, encoder })]));
  const systems = { 'specialization-filter': async need => specializationFilter(need.query) };
  for (const [name, service] of Object.entries(services)) {
    systems[name] = async need => (await service.search(need.query, {}, { limit: K })).items.map(item => item.person.id);
  }
  const perNeed = {}, report = { suiteVersion: labels.suiteVersion, needs: labels.needs.length, k: K, systems: {}, byKind: {}, differences: {} };
  try {
    for (const [name, system] of Object.entries(systems)) {
      perNeed[name] = [];
      for (const need of labels.needs) {
        const ids = await system(need);
        perNeed[name].push({ id: need.id, kind: need.kind, ids, ...metrics(need, ids) });
      }
      report.systems[name] = bootstrap(perNeed[name]);
      report.byKind[name] = Object.fromEntries([...new Set(labels.needs.map(need => need.kind))].map(kind => {
        const subset = perNeed[name].filter(row => row.kind === kind);
        return [kind, { needs: subset.length, p5: mean(subset, 'p5'), ndcg10: mean(subset, 'ndcg10') }];
      }));
    }
    for (const name of Object.keys(systems)) if (name !== 'pipeline') report.differences[name] = pairedDifference(perNeed[name], perNeed.pipeline);
  } catch (error) {
    if (error.status === 503) throw new Error('Модель поиска недоступна: проверьте --model и окружение Python.');
    throw error;
  } finally {
    for (const service of Object.values(services)) service.store.close();
    report.encoder = { name: encoder.info.name, version: encoder.info.version, threshold: encoder.info.threshold,
      ...(encoder.info.reranker ? { reranker: encoder.info.reranker.version } : {}) };
    encoder.close();
  }
  const compare = option('--compare');
  if (compare) {
    const saved = JSON.parse(await readFile(resolve(root, compare), 'utf8'));
    report.comparison = { against: compare, encoder: saved.encoder, difference: pairedDifference(perNeed.pipeline, saved.perNeed.pipeline) };
  }

  const number = value => value.toFixed(3), signed = value => (value >= 0 ? '+' : '') + value.toFixed(3);
  const cell = (values, key, format = number) => `${format(values[key].mean)} [${format(values[key].ci[0])}; ${format(values[key].ci[1])}]`;
  console.log(`Набор ${labels.suiteVersion}: ${labels.needs.length} потребностей, топ-${K}, кодировщик ${report.encoder.name} ${report.encoder.version}`);
  console.log('\n| Система | P@5 | P@10 | nDCG@10 | MRR@10 | Пустые | Показано |\n| --- | --- | --- | --- | --- | --- | --- |');
  for (const [name, values] of Object.entries(report.systems)) {
    console.log(`| ${name} | ${['p5', 'p10', 'ndcg10', 'mrr10'].map(key => cell(values, key)).join(' | ')} | ${number(values.empty.mean)} | ${values.shown.mean.toFixed(1)} |`);
  }
  const differences = Object.entries(report.differences).map(([name, values]) => [`${name} − pipeline`, values]);
  if (report.comparison) differences.push([`pipeline − ${basename(compare)}`, report.comparison.difference]);
  console.log('\nПарные разности (среднее [95% интервал]):\n| Сравнение | P@5 | P@10 | nDCG@10 | MRR@10 |\n| --- | --- | --- | --- | --- |');
  for (const [name, values] of differences) console.log(`| ${name} | ${['p5', 'p10', 'ndcg10', 'mrr10'].map(key => cell(values, key, signed)).join(' | ')} |`);
  console.log('\nnDCG@10 по типам запросов:');
  for (const [name, kinds] of Object.entries(report.byKind)) {
    console.log(`${name}: ` + Object.entries(kinds).map(([kind, values]) => `${kind} (${values.needs}) ${number(values.ndcg10)}`).join(', '));
  }
  const output = option('--output');
  if (output) {
    await mkdir(dirname(resolve(root, output)), { recursive: true });
    await writeFile(resolve(root, output), JSON.stringify({ ...report, perNeed }, null, 1) + '\n');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
