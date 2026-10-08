/** Derived author-reference statistics; never precision/recall on unlabeled rows. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifactRoot = join(root, 'server/data/acceptance-control');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const rate = (numerator, denominator) => ({ numerator, denominator, value: denominator ? numerator / denominator : null });

export function summarizeReferenceCases(labels, cases) {
  assert.ok(Array.isArray(labels) && Array.isArray(cases));
  const byId = new Map(cases.map(item => [item.id, item]));
  assert.equal(byId.size, cases.length, 'Repeated result case');
  assert.equal(cases.length, labels.length, 'A partial run has no complete-control statistics');
  const metrics = Object.fromEntries(['referenceFirst', 'referenceInTop5', 'nearNegativeFirst',
    'hardExclusionViolated', 'unsupportedNeedViolated', 'budgetViolated'].map(key => [key, [0, 0]]));
  const add = (key, violation) => { metrics[key][1]++; metrics[key][0] += Number(violation); };
  for (const label of labels) {
    const response = byId.get(label.id)?.response;
    assert.ok(response && Array.isArray(response.items), 'Missing complete response');
    const ids = response.items.map(item => item.person.id), expected = label.expected;
    if (expected.relevant?.length) {
      add('referenceFirst', expected.relevant.includes(ids[0]));
      add('referenceInTop5', ids.slice(0, 5).some(id => expected.relevant.includes(id)));
    }
    if (expected.forbiddenFirst?.length) add('nearNegativeFirst', expected.forbiddenFirst.includes(ids[0]));
    if (expected.forbiddenEverywhere?.length) add('hardExclusionViolated', expected.forbiddenEverywhere.some(id => ids.includes(id)));
    if (expected.empty) add('unsupportedNeedViolated', ids.length > 0 || response.total > 0);
    if (expected.salaryMax !== undefined) add('budgetViolated', response.effectiveFilters?.salaryMax !== expected.salaryMax
      || response.items.some(item => !Number.isInteger(item.person.salaryFrom) || item.person.salaryFrom > expected.salaryMax));
  }
  return Object.fromEntries(Object.entries(metrics).map(([key, [numerator, denominator]]) => [key, rate(numerator, denominator)]));
}

async function main(path) {
  assert.ok(path, 'Pass a frozen-control results file');
  const resultPath = resolve(root, path), containment = relative(artifactRoot, resultPath);
  assert.ok(containment && !isAbsolute(containment) && containment !== '..' && !containment.startsWith('..' + sep),
    'The result must remain inside ignored server/data/acceptance-control');
  const resultBytes = await readFile(resultPath), result = JSON.parse(resultBytes);
  const manifestPath = join(dirname(resultPath), 'manifest.json');
  const manifestBytes = await readFile(manifestPath), manifest = JSON.parse(manifestBytes);
  assert.equal(result.kind, 'authored-synthetic-full-composition-control-result');
  assert.equal(result.manifestSha256, hash(manifestBytes), 'Result and manifest do not match');
  assert.equal(result.inputIntegrity, 'verified-after-run', 'Only an unchanged completed run can be summarised');
  assert.equal(result.technicalFailure, null, 'Technical failure is not a quality result');
  assert.equal(result.modelVersion, manifest.modelVersion);
  const output = { kind: 'derived-authored-reference-control-summary', createdAt: new Date().toISOString(),
    context: 'Conformance to partial author-reference judgments; not precision, recall, expert agreement or hiring quality.',
    sourceResult: relative(root, resultPath).split(sep).join('/'), resultSha256: hash(resultBytes),
    manifestSha256: hash(manifestBytes), summarySourceSha256: hash(await readFile(fileURLToPath(import.meta.url))),
    modelVersion: result.modelVersion, suiteVersion: manifest.suiteVersion, provenance: manifest.provenance,
    inputIntegrity: result.inputIntegrity, metrics: summarizeReferenceCases(manifest.labels, result.cases) };
  const outputPath = join(dirname(resultPath), 'reference-summary-' + randomUUID() + '.json');
  await writeFile(outputPath, JSON.stringify(output, null, 2) + '\n', { flag: 'wx' });
  console.log('Показатели соответствия авторскому эталону сохранены в игнорируемой диагностике.');
  console.log(relative(root, outputPath).split(sep).join('/'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
}
