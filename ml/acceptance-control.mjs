/**
 * New authored control of the complete active search composition.
 * Validate: node ml/acceptance-control.mjs
 * Freeze, without inference: node ml/acceptance-control.mjs --freeze
 * Run exactly that version: node ml/acceptance-control.mjs --run --manifest <printed-path>
 * Optional --strict makes any authored acceptance finding fail the process.
 * No training, threshold selection, production database, account or HTTP API.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isSpecialization, specializationLabels } from '../shared/catalog.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const controlPath = join(root, 'ml/acceptance-control.json');
const diagnosticRoot = join(root, 'server/data/acceptance-control');
const normalize = text => String(text).normalize('NFKC').toLocaleLowerCase('ru').replace(/\s+/gu, ' ').trim();
const hash = value => createHash('sha256').update(value).digest('hex');
const runtimeSources = [
  'ml/acceptance-control.mjs', 'ml/acceptance-control.json',
  'server/directory.mjs', 'server/directory-store.mjs', 'server/semantic-worker.mjs',
  'server/search-ranking.mjs', 'server/query-role-scope.mjs', 'server/search-evidence.mjs',
  'shared/catalog.ts', 'shared/grading.ts', 'shared/search.ts',
  'ml/worker.py', 'ml/common.py', 'ml/reranker.py', 'ml/requirements.txt',
];

async function fileHash(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}
const projectPath = path => relative(root, path).split(sep).join('/');

function diagnosticPath(path) {
  const resolved = resolve(root, path), containment = relative(diagnosticRoot, resolved);
  assert.ok(containment && !isAbsolute(containment) && !containment.startsWith('..' + sep) && containment !== '..',
    'Artifacts must remain inside ignored server/data/acceptance-control');
  return resolved;
}

export function buildControl(data) {
  assert.equal(data.schemaVersion, 1); assert.equal(data.provenance?.kind, 'authored-synthetic-control');
  assert.ok(Array.isArray(data.families) && data.families.length >= 16, 'Control needs new task families');
  assert.ok(new Set(data.families.map(family => family.specialization)).size >= 6, 'Control needs several professions');
  const seen = new Set(), profiles = [], cases = [];
  for (const [index, family] of data.families.entries()) {
    assert.match(family.id, /^control-[a-z0-9-]+$/u);
    assert.ok(!seen.has(family.id)); seen.add(family.id);
    assert.ok(isSpecialization(family.specialization));
    for (const key of ['novelTask', 'nearestExistingFamily', 'distinction', 'query', 'positive', 'nearNegative', 'labelRationale']) {
      assert.equal(typeof family[key], 'string'); assert.ok(family[key].trim());
    }
    assert.ok(family.query.length <= 1200); assert.notEqual(normalize(family.positive), normalize(family.nearNegative));
    for (const [kind, bio] of [['positive', family.positive], ['near-negative', family.nearNegative]]) {
      const salaryFrom = family.salaryFrom;
      assert.ok(Number.isInteger(salaryFrom) && salaryFrom > 0);
      profiles.push({ id: `${family.id}-${kind}`, name: `Вымышленный специалист ${index + 1} ${kind === 'positive' ? 'А' : 'Б'}`,
        specialization: family.specialization, desiredGrade: 'Middle', professionalRole: specializationLabels[family.specialization],
        confirmed: { specialization: family.specialization, grade: 'Middle', score: kind === 'positive' ? 82 : 98,
          date: '2026-10-07T00:00:00.000Z', synthetic: true },
        synthetic: true, visible: true, consent: true, industry: 'ИТ', stack: [], bio,
        workHistory: '', careerAchievements: '', education: '', experience: '3 года', experienceMonths: 36,
        city: 'Москва', format: 'Удалённо', employmentType: 'Полная занятость', languageCodes: ['ru'],
        salaryFrom, salaryTo: salaryFrom + 20000, email: '', phone: '', portfolio: '', fspId: '', softSkills: [],
        achievements: kind === 'near-negative' && index % 3 === 0 ? [{ title: 'Демонстрационный турнир ФСП', result: 'Вымышленный учебный результат', year: '2026' }] : [],
      });
    }
    cases.push({ id: family.id, family: family.id, query: family.query, filters: {},
      expected: { relevant: [`${family.id}-positive`], forbiddenFirst: [`${family.id}-near-negative`] },
      labelRationale: family.labelRationale });
  }
  assert.ok(Array.isArray(data.extraCases));
  cases.push(...data.extraCases);
  const profileIds = new Set(profiles.map(person => person.id));
  const caseIds = new Set();
  for (const item of cases) {
    assert.ok(!caseIds.has(item.id)); caseIds.add(item.id);
    assert.equal(typeof item.query, 'string'); assert.ok(item.query.trim() && item.query.length <= 1200);
    assert.ok(item.filters && typeof item.filters === 'object' && !Array.isArray(item.filters));
    assert.ok(item.expected && typeof item.expected === 'object');
    for (const key of ['relevant', 'forbiddenFirst', 'forbiddenEverywhere']) {
      if (item.expected[key] !== undefined) assert.ok(Array.isArray(item.expected[key]) && item.expected[key].every(id => profileIds.has(id)));
    }
  }
  return { profiles, cases };
}

function sourceLiterals(source) {
  const values = [];
  for (const expression of [/"((?:\\.|[^"\\])*)"/gu, /'((?:\\.|[^'\\])*)'/gu]) {
    for (const match of source.matchAll(expression)) values.push(match[1].replace(/\\n/gu, ' ').replace(/\\(['"])/gu, '$1'));
  }
  return values;
}

export function assertNovelLiterals(data, control, oldTexts, oldFamilyIds) {
  const known = oldTexts.map(normalize).filter(text => text.length >= 60);
  for (const family of data.families) assert.ok(!oldFamilyIds.has(family.id), 'An existing family ID was reused');
  const newTexts = [...control.cases.map(item => item.query), ...control.profiles.map(person => person.bio)];
  for (const text of newTexts) {
    const normalized = normalize(text);
    assert.ok(!known.some(older => normalized === older || normalized.includes(older) || older.includes(normalized)),
      'An existing query/profile passage was copied into the control');
  }
}

async function resolveModel(modelPath) {
  const requested = resolve(root, modelPath || process.env.SEMANTIC_MODEL || 'server/data/semantic-model');
  let artifact = requested, activePath = null;
  try {
    const pointer = JSON.parse(await readFile(join(requested, 'active.json'), 'utf8'));
    assert.equal(typeof pointer.artifact, 'string'); artifact = resolve(root, pointer.artifact); activePath = join(requested, 'active.json');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const metadataPath = join(artifact, 'metadata.json'), metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  assert.equal(metadata.trained, true); assert.ok(metadata.reranker?.scoreCalibration, 'The complete active composition is required');
  return { artifact, activePath, metadataPath, metadata };
}

async function validateControl(model) {
  const bytes = await readFile(controlPath), data = JSON.parse(bytes.toString('utf8')), control = buildControl(data);
  const oldTexts = [], oldFamilyIds = new Set(), corpusFiles = [];
  for (const name of ['ml/dataset.py', 'ml/dataset_v2.py', 'ml/dataset_v3.py', 'ml/search-regression.mjs']) {
    const source = await readFile(join(root, name), 'utf8');
    oldTexts.push(...sourceLiterals(source));
    for (const value of sourceLiterals(source)) if (/^[a-z][a-z0-9-]+$/u.test(value)) oldFamilyIds.add(value);
    corpusFiles.push({ path: name, sha256: hash(source) });
  }
  const datasetPath = join(model.artifact, model.metadata.datasetSnapshot || 'dataset.json');
  const dataset = JSON.parse(await readFile(datasetPath, 'utf8'));
  for (const item of [...(dataset.documents || []), ...(dataset.queries || [])]) {
    oldTexts.push(item.text); if (item.family) oldFamilyIds.add(item.family);
  }
  for (const item of dataset.splitManifest || []) oldFamilyIds.add(item.id);
  corpusFiles.push({ path: projectPath(datasetPath), sha256: await fileHash(datasetPath) });
  for (const family of data.families) assert.ok(oldFamilyIds.has(family.nearestExistingFamily), 'Nearest existing family must name a real corpus family');
  assertNovelLiterals(data, control, oldTexts, oldFamilyIds);
  return { data, control, controlSha256: hash(bytes), profilesSha256: hash(JSON.stringify(control.profiles)),
    labelsSha256: hash(JSON.stringify(control.cases)), corpusFiles,
    novelty: { literalOverlap: 'none-detected', familyIds: 'disjoint', semanticNovelty: 'authored-narrow-task-distinction; not independently verified' } };
}

async function hashes(paths) {
  return Promise.all(paths.map(async path => ({ path: projectPath(path), sha256: await fileHash(path) })));
}

async function freeze(model, prepared, output) {
  const rerankerRoot = join(model.artifact, model.metadata.reranker.path);
  const modelPaths = [model.metadataPath, join(model.artifact, 'model.safetensors'), join(model.artifact, 'config.json'),
    join(model.artifact, 'tokenizer.json'), join(model.artifact, 'tokenizer_config.json'),
    join(model.artifact, 'special_tokens_map.json'), join(model.artifact, 'vocab.txt'),
    ...Object.keys(model.metadata.reranker.fileHashes).map(name => join(rerankerRoot, name)),
    ...(model.activePath ? [model.activePath] : [])];
  const modelFiles = await hashes(modelPaths);
  assert.equal(modelFiles.find(item => item.path === projectPath(join(model.artifact, 'model.safetensors')))?.sha256,
    model.metadata.weightsSha256, 'Encoder weight hash mismatch');
  for (const [name, expected] of Object.entries(model.metadata.reranker.fileHashes)) {
    assert.equal(modelFiles.find(item => item.path === projectPath(join(rerankerRoot, name)))?.sha256, expected, 'Reranker artifact hash mismatch');
  }
  const sourceFiles = await hashes(runtimeSources.map(path => join(root, path)));
  const manifest = { schemaVersion: 1, kind: 'frozen-authored-composition-control', frozenAt: new Date().toISOString(),
    phase: 'before-worker-start-and-before-inference', suiteVersion: prepared.data.suiteVersion,
    provenance: prepared.data.provenance, modelArtifact: projectPath(model.artifact), modelVersion: model.metadata.modelVersion,
    encoderModelVersion: model.metadata.encoderModelVersion, pipelineFingerprint: model.metadata.pipelineFingerprint,
    encodingFingerprint: model.metadata.encodingFingerprint, controlSha256: prepared.controlSha256,
    profilesSha256: prepared.profilesSha256, labelsSha256: prepared.labelsSha256,
    sourceFiles, modelFiles, corpusFiles: prepared.corpusFiles, novelty: prepared.novelty,
    evaluationPolicy: { firstMustBeRelevant: true, positiveMustOccurInTop: 5, nearbyNegativeMustNotBeFirst: true,
      budgetAppliesToEveryReturnedProfile: true, allCasesUseTheFullFreshDirectory: true, noModelTuning: true },
    families: prepared.data.families.map(({ id, specialization, novelTask, nearestExistingFamily, distinction }) =>
      ({ id, specialization, novelTask, nearestExistingFamily, distinction })), labels: prepared.control.cases };
  const directory = output ? diagnosticPath(output) : join(diagnosticRoot, new Date().toISOString().replace(/[:.]/gu, '-') + '-' + randomUUID());
  await mkdir(directory, { recursive: true });
  const manifestPath = join(directory, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  await writeFile(join(directory, 'profiles.json'), JSON.stringify(prepared.control.profiles, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  return manifestPath;
}

async function assertUnchanged(files) {
  for (const item of files) assert.equal(await fileHash(resolve(root, item.path)), item.sha256, `Frozen input changed: ${item.path}`);
}

export function judgeCase(item, response) {
  const expected = item.expected, returned = response.items.map(value => value.person.id), findings = [];
  if (expected.empty && (returned.length || response.total)) findings.push('unexpected-candidates-for-unsupported-need');
  if (expected.relevant?.length) {
    if (!returned.slice(0, 5).some(id => expected.relevant.includes(id))) findings.push('authored-relevant-profile-not-in-top');
    if (!expected.relevant.includes(returned[0])) findings.push('first-profile-does-not-match-authored-reference');
  }
  if (expected.forbiddenFirst?.includes(returned[0])) findings.push('same-profession-near-negative-returned-first');
  if (expected.forbiddenEverywhere?.some(id => returned.includes(id))) findings.push('hard-exclusion-breached');
  if (expected.salaryMax !== undefined) {
    if (response.effectiveFilters?.salaryMax !== expected.salaryMax) findings.push('effective-budget-not-preserved');
    if (response.items.some(value => !Number.isInteger(value.person.salaryFrom) || value.person.salaryFrom > expected.salaryMax)) findings.push('over-budget-profile-returned');
  }
  if (expected.interpretedSalaryMax !== undefined && response.interpreted?.salaryMax !== expected.interpretedSalaryMax) findings.push('natural-language-budget-not-parsed');
  for (const [key, value] of Object.entries(item.filters)) {
    if (['specialization', 'grade'].includes(key) && value && response.items.some(row => row.person.confirmed?.[key] !== value)) findings.push('confirmed-category-filter-breached');
  }
  return { status: findings.length ? 'finding' : 'accepted', findings };
}

async function runFrozen(manifestPath, strict) {
  manifestPath = diagnosticPath(manifestPath);
  const manifestBytes = await readFile(manifestPath), manifest = JSON.parse(manifestBytes.toString('utf8'));
  assert.equal(manifest.kind, 'frozen-authored-composition-control');
  assert.equal(manifest.phase, 'before-worker-start-and-before-inference');
  await assertUnchanged([...manifest.sourceFiles, ...manifest.modelFiles, ...manifest.corpusFiles]);
  const model = await resolveModel(manifest.modelArtifact), prepared = await validateControl(model);
  assert.equal(prepared.controlSha256, manifest.controlSha256); assert.equal(prepared.labelsSha256, manifest.labelsSha256);
  assert.equal(prepared.profilesSha256, manifest.profilesSha256); assert.equal(model.metadata.modelVersion, manifest.modelVersion);
  assert.deepEqual(prepared.control.cases, manifest.labels);
  const runId = randomUUID(), directory = dirname(manifestPath), startedAt = new Date().toISOString();
  await writeFile(join(directory, `started-${runId}.json`), JSON.stringify({ startedAt, manifestSha256: hash(manifestBytes),
    status: 'inference-not-started', runId }, null, 2) + '\n', { flag: 'wx' });
  const { DirectoryService } = await import('../server/directory.mjs');
  const { SemanticWorker } = await import('../server/semantic-worker.mjs');
  const encoder = new SemanticWorker({ modelPath: model.artifact, timeout: 120000 });
  const service = new DirectoryService(':memory:', { seeds: prepared.control.profiles, encoder });
  const results = [];
  let technicalFailure = null;
  let inputIntegrity = 'verified-before-run';
  try {
    await encoder.start(); assert.equal(encoder.info.version, manifest.modelVersion);
    for (const item of prepared.control.cases) {
      const response = await service.search(item.query, item.filters, { limit: 50 });
      await assertUnchanged(manifest.sourceFiles);
      results.push({ id: item.id, family: item.family, ...judgeCase(item, response), response });
    }
    await assertUnchanged([...manifest.modelFiles, ...manifest.corpusFiles]);
    inputIntegrity = 'verified-after-run';
  } catch (error) {
    technicalFailure = { name: error.name, message: error.message };
    inputIntegrity = error.message.startsWith('Frozen input changed:') ? 'changed-during-run' : 'not-verified-after-failure';
  } finally { service.close(); }
  const findings = results.some(result => result.status === 'finding');
  const result = { kind: 'authored-synthetic-full-composition-control-result', startedAt, finishedAt: new Date().toISOString(),
    runId, manifestSha256: hash(manifestBytes), modelVersion: manifest.modelVersion, labelsSha256: manifest.labelsSha256,
    inputIntegrity, status: technicalFailure ? 'technical-failure' : findings ? 'completed-with-findings' : 'accepted-author-control',
    provenance: manifest.provenance, technicalFailure, cases: results };
  const resultPath = join(directory, `results-${runId}.json`);
  await writeFile(resultPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  if (technicalFailure) console.error('Контроль остановлен технической ошибкой. Подробности сохранены в диагностическом файле.');
  else if (findings) console.log('Контроль выполнен. Обнаружены расхождения с заранее заданным авторским эталоном; они сохранены для разбора.');
  else console.log('Контроль выполнен. Авторские условия пройдены; это не подтверждение качества найма или профессиональных грейдов.');
  console.log(projectPath(resultPath));
  if (technicalFailure || strict && findings) process.exitCode = 1;
  return result;
}

async function main(args) {
  const flag = name => args.includes(name);
  const value = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  if (flag('--run')) {
    assert.ok(value('--manifest'), 'Run requires a previously written --manifest');
    return runFrozen(value('--manifest'), flag('--strict'));
  }
  const model = await resolveModel(value('--model')), prepared = await validateControl(model);
  if (flag('--freeze')) {
    const path = await freeze(model, prepared, value('--output'));
    console.log('Авторская разметка, активная композиция и исходники зафиксированы до запуска модели.');
    console.log(projectPath(path));
  } else console.log('Контроль корректен; буквальных совпадений с корпусами и прежними проверками не обнаружено. Модель не запускалась.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
