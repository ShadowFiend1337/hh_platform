import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { SemanticWorker } from '../semantic-worker.mjs';

// This process implements only JSONL. No model, Python package or network is used.
const fixtureSource = String.raw`
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const directory = process.argv[process.argv.indexOf('--model') + 1];
const metadata = JSON.parse(readFileSync(join(directory, 'metadata.json'), 'utf8'));
const respond = value => process.stdout.write(JSON.stringify(value) + '\n');
createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line);
  appendFileSync(join(directory, 'requests.jsonl'), JSON.stringify(request) + '\n');
  if (request.kind === 'health') {
    const response = { id: request.id, trained: true, dimension: metadata.dimension,
      modelVersion: metadata.modelVersion };
    if (Object.hasOwn(metadata, 'protocolHealthReranker')) {
      if (metadata.protocolHealthReranker !== null) response.reranker = metadata.protocolHealthReranker;
    } else if (metadata.reranker) response.reranker = metadata.reranker;
    respond(response);
    return;
  }
  if (request.kind === 'rerank') {
    const behavior = metadata.protocolRerankBehavior;
    if (behavior === 'error') return respond({ id: request.id, error: 'reranking_failed' });
    if (behavior === 'missing') return respond({ id: request.id });
    if (behavior === 'malformed') return respond({ id: request.id, scores: { first: 0.4 } });
    if (behavior === 'wrongLength') return respond({ id: request.id, scores: [] });
    if (behavior === 'nonfinite') {
      // JSON numeric overflow parses as Infinity in the parent.
      process.stdout.write('{"id":' + JSON.stringify(request.id) + ',"scores":[1e400]}\n');
      return;
    }
    if (behavior === 'string') return respond({ id: request.id, scores: ['0.4'] });
    if (behavior === 'null') return respond({ id: request.id, scores: [null] });
    const scores = metadata.protocolScores ?? request.texts.map((_, index) => index ? 2.25 : -1.5);
    respond({ id: request.id, scores });
    return;
  }
  respond({ id: request.id, vectors: request.texts.map(() =>
    Array.from({ length: metadata.dimension }, (_, index) => index === 0 ? 1 : 0)) });
});
`;

const stage = changes => ({ version: 'rerank-v1', threshold: 0.2, baseModel: 'test/reranker',
  revision: 'a'.repeat(40), maxLength: 512, ...changes });

async function fixture(t, extra = {}) {
  const temporaryRoot = resolve(tmpdir());
  const directory = resolve(await mkdtemp(join(temporaryRoot, 'semantic-rerank-test-')));
  const childPath = relative(temporaryRoot, directory);
  assert.ok(childPath && !isAbsolute(childPath) && childPath !== '..' && !childPath.startsWith('..' + '/')
    && !childPath.startsWith('..' + '\\') && basename(directory).startsWith('semantic-rerank-test-'));
  const registry = join(directory, 'registry');
  const artifact = join(directory, 'artifact');
  const workerPath = join(directory, 'process.mjs');
  await mkdir(registry);
  await mkdir(artifact);
  await writeFile(workerPath, fixtureSource);
  const worker = new SemanticWorker({ modelPath: registry, python: process.execPath, pythonArgs: [],
    workerPath, timeout: 3000 });
  t.after(async () => {
    worker.close();
    // rm always targets the verified temporary directory from mkdtemp.
    assert.equal(resolve(directory), join(temporaryRoot, basename(directory)));
    await rm(directory, { recursive: true, force: true });
  });
  const metadata = { trained: true, dimension: 3, baseModel: 'test/encoder', modelVersion: 'encoder-v1',
    weightsSha256: 'b'.repeat(64), threshold: 0.5, ...extra };
  const activate = async changes => {
    Object.assign(metadata, changes);
    await writeFile(join(artifact, 'metadata.json'), JSON.stringify(metadata));
    await writeFile(join(registry, 'active.json'), JSON.stringify({ artifact }));
  };
  await activate({});
  const requests = async () => (await readFile(join(artifact, 'requests.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  return { worker, activate, requests };
}

test('legacy metadata continues encoding without a reranking stage', async t => {
  const { worker, requests } = await fixture(t);
  assert.deepEqual(await worker.encode(['first', 'second']), [[1, 0, 0], [1, 0, 0]]);
  assert.equal(worker.info.version, 'encoder-v1');
  assert.equal(worker.info.reranker, undefined);
  assert.deepEqual((await requests()).map(request => request.kind), ['health', undefined]);
  await assert.rejects(worker.rerank('professional tasks', ['document']));
  assert.equal((await requests()).length, 2, 'legacy workers never receive a rerank request');
});

test('declared reranker exposes pinned health and returns unmodified finite raw scores', async t => {
  const reranker = stage();
  const { worker, requests } = await fixture(t, { reranker, modelVersion: 'encoder-v1-rank-pipeline-v1' });
  const info = await worker.start();
  assert.deepEqual(info.reranker, reranker);
  assert.equal(info.version, 'encoder-v1-rank-pipeline-v1');
  const scores = await worker.rerank('professional tasks', ['document one', 'document two']);
  assert.deepEqual(scores, [-1.5, 2.25], 'raw model scores may be negative or greater than one');
  const request = (await requests()).find(value => value.kind === 'rerank');
  assert.deepEqual(request, { id: request.id, kind: 'rerank', query: 'professional tasks',
    texts: ['document one', 'document two'] });
  assert.equal(typeof request.id, 'string');
  assert.deepEqual(await worker.encode(['still supported']), [[1, 0, 0]]);
  const requestsBeforeEmpty = (await requests()).length;
  assert.deepEqual(await worker.rerank('professional tasks', []), []);
  assert.equal((await requests()).length, requestsBeforeEmpty, 'empty batches need no protocol request');
});

test('rerank wire bounds accept 256 documents and reject invalid inputs before sending them', async t => {
  const { worker, requests } = await fixture(t, { reranker: stage() });
  const texts = Array.from({ length: 256 }, (_, index) => index === 0 ? 'd'.repeat(12000) : 'document ' + index);
  const scores = await worker.rerank('q'.repeat(1200), texts);
  assert.equal(scores.length, 256);
  assert.ok(scores.every(Number.isFinite));
  assert.deepEqual(scores, [-1.5, ...Array(255).fill(2.25)]);
  const sent = await requests();
  assert.equal(sent.length, 2);
  assert.equal(sent[1].query.length, 1200);
  assert.deepEqual(sent[1].texts, texts);
  const invalid = [
    ['too many documents', 'query', Array(257).fill('document')],
    ['overlong query', 'q'.repeat(1201), ['document']],
    ['empty query', '', ['document']],
    ['whitespace query', ' \t\n ', ['document']],
    ['nonstring query', null, ['document']],
    ['overlong document', 'query', ['d'.repeat(12001)]],
    ['nonstring document', 'query', [null]],
    ['nonarray documents', 'query', 'document'],
  ];
  for (const [name, query, documents] of invalid) {
    await assert.rejects(worker.rerank(query, documents), name);
  }
  assert.equal((await requests()).length, sent.length, 'rejected inputs never cross the JSONL boundary');
  assert.equal(worker.pending.size, 0);
  assert.equal(worker.info.status, 'ready', 'invalid client input does not invalidate the loaded artifact');
});

test('concurrent rerank and encode calls resolve their own JSONL replies', async t => {
  const { worker } = await fixture(t, { reranker: stage() });
  const results = await Promise.all([
    worker.rerank('first query', ['first document']),
    worker.encode(['embedding document']),
    worker.rerank('second query', ['one', 'two']),
  ]);
  assert.deepEqual(results, [[-1.5], [[1, 0, 0]], [-1.5, 2.25]]);
});

test('activation after an encoding reply rejects that preceding model result and permits a fresh request', async t => {
  const {worker,activate}=await fixture(t,{reranker:stage(),modelVersion:'pipeline-old'});
  const original=worker.call.bind(worker);
  let activated=false;
  worker.call=async payload=>{
    const result=await original(payload);
    if(payload.texts&&!activated){
      activated=true;
      await activate({modelVersion:'pipeline-new',reranker:stage({version:'rerank-new'})});
      await worker.start();
    }
    return result;
  };
  await assert.rejects(worker.encode(['old-model-document']),/изменилась/u);
  assert.equal(worker.info.version,'pipeline-new');
  assert.deepEqual(await worker.encode(['fresh-document']),[[1,0,0]]);
});

test('pinned reranker health compares values independently of JSON field order', async t => {
  const reranker = stage();
  const health = Object.fromEntries(Object.entries(reranker).reverse());
  const { worker } = await fixture(t, { reranker, protocolHealthReranker: health });
  assert.deepEqual((await worker.start()).reranker, reranker);
});

test('optional artifact and calibration fields remain pinned in reranker health', async t => {
  const reranker = stage({ weightsSha256: 'd'.repeat(64), path: 'reranker',
    calibration: { split: 'dev', threshold: 0.2, metric: 'ndcg10' } });
  const { worker, activate } = await fixture(t, { reranker });
  assert.deepEqual((await worker.start()).reranker, reranker);
  await activate({ protocolHealthReranker: { ...reranker, calibration: { ...reranker.calibration, split: 'test' } },
    modelVersion: 'changed-artifact' });
  await assert.rejects(worker.start(), 'nested calibration differences cannot silently change the stage');
  assert.equal(worker.info.status, 'unavailable');
});

for (const behavior of ['missing', 'malformed', 'wrongLength', 'nonfinite', 'string', 'null', 'error']) {
  test('rejects invalid rerank response: ' + behavior, async t => {
    const { worker } = await fixture(t, { reranker: stage(), protocolRerankBehavior: behavior });
    await assert.rejects(worker.rerank('professional tasks', ['document']));
    assert.equal(worker.pending.size, 0, 'invalid replies leave no pending requests');
  });
}

test('changing only the declared stage reloads the process even with an unchanged pipeline version', async t => {
  const { worker, activate } = await fixture(t, { reranker: stage(), modelVersion: 'encoder-v1-rank-pipeline-v1' });
  const first = await worker.start();
  const firstVersion = first.version;
  const firstProcess = worker.child;
  assert.equal((await worker.start()).version, firstVersion);
  assert.equal(worker.child, firstProcess);
  await activate({ reranker: stage({ version: 'rerank-v2' }) });
  const scores = await worker.rerank('updated query', ['document']);
  assert.deepEqual(scores, [-1.5]);
  assert.notEqual(worker.child, firstProcess);
  assert.equal(worker.info.version, firstVersion, 'metadata owns the composite pipeline version');
  assert.equal(worker.info.reranker.version, 'rerank-v2');
});

test('a new composite pipeline version invalidates worker info and reloads the declared stage', async t => {
  const { worker, activate } = await fixture(t, { reranker: stage(), modelVersion: 'encoder-v1-rank-pipeline-v1' });
  await worker.start();
  const firstProcess = worker.child;
  await activate({ reranker: stage({ version: 'rerank-v2' }), modelVersion: 'encoder-v1-rank-pipeline-v2' });
  assert.deepEqual(await worker.rerank('updated query', ['document']), [-1.5]);
  assert.notEqual(worker.child, firstProcess);
  assert.equal(worker.info.version, 'encoder-v1-rank-pipeline-v2');
  assert.equal(worker.info.reranker.version, 'rerank-v2');
});

test('changing another pinned stage field reloads without relying on either version field', async t => {
  const { worker, activate } = await fixture(t, { reranker: stage(), modelVersion: 'encoder-v1-rank-pipeline-v1' });
  await worker.start();
  const firstProcess = worker.child;
  await activate({ reranker: stage({ threshold: 0.25 }) });
  await worker.start();
  assert.notEqual(worker.child, firstProcess);
  assert.equal(worker.info.reranker.threshold, 0.25);
  assert.equal(worker.info.reranker.version, 'rerank-v1');
  assert.equal(worker.info.version, 'encoder-v1-rank-pipeline-v1');
});

for (const [name, health] of [
  ['missing stage', null],
  ['version', stage({ version: 'rerank-other' })],
  ['threshold', stage({ threshold: 0.3 })],
  ['base model', stage({ baseModel: 'test/other' })],
  ['revision', stage({ revision: 'c'.repeat(40) })],
  ['maximum length', stage({ maxLength: 256 })],
]) {
  test('rejects a declared reranker with mismatched health: ' + name, async t => {
    const { worker, activate } = await fixture(t, { reranker: stage(), protocolHealthReranker: health });
    await assert.rejects(worker.start());
    assert.equal(worker.info.status, 'unavailable');
    assert.equal(worker.child, null);
    await activate({ protocolHealthReranker: stage() });
    assert.equal((await worker.start()).status, 'ready', 'a valid stage recovers after the mismatch');
  });
}

test('rejects a worker that advertises an undeclared reranker', async t => {
  const { worker } = await fixture(t, { protocolHealthReranker: stage() });
  await assert.rejects(worker.start());
  assert.equal(worker.info.status, 'unavailable');
});

const fusionCalibration = () => ({
  kind: 'pooled-LDA-diagonal-shrinkage-v1', weights: [10, 1], bias: 0, threshold: 4, shrink: 0.1, split: 'dev',
  featurePolicy: { features: ['encoderCosine', 'crossEncoderRawLogit'], encoderQueryContext: 'raw-query',
    encoderDocumentContext: 'task-section-without-role', crossEncoderQueryContext: 'raw-query',
    crossEncoderDocumentContext: 'catalog-professional-role-newline-task-section',
    aggregation: 'maximum-fused-score-over-task-sections',
    formula: 'weights[0]*encoderCosine+weights[1]*crossEncoderRawLogit+bias' },
  hashes: { dataset: 'c'.repeat(64) }, DEVmetrics: { resubstitution: true },
});

test('fusion health pins the descriptor while rerank replies preserve raw cross-encoder logits', async t => {
  const calibration = fusionCalibration(), reranker = stage({ scoreCalibration: calibration });
  const { worker, activate } = await fixture(t, { reranker });
  assert.deepEqual((await worker.start()).reranker.scoreCalibration, calibration);
  assert.deepEqual(await worker.rerank('professional tasks', ['one', 'two']), [-1.5, 2.25]);
  await activate({ protocolHealthReranker: { ...reranker, scoreCalibration: { ...calibration, weights: [9, 1] } },
    modelVersion: 'different-pipeline' });
  await assert.rejects(worker.start(), /метаданным/u);
  assert.equal(worker.child, null);
});

test('an invalid fusion policy is rejected before starting the local process', async t => {
  const calibration = fusionCalibration(); calibration.featurePolicy.encoderQueryContext = 'stripped-query';
  const { worker } = await fixture(t, { reranker: stage({ scoreCalibration: calibration }) });
  await assert.rejects(worker.start(), /метаданные/u);
  assert.equal(worker.child, null); assert.equal(worker.info.status, 'unavailable');
});
