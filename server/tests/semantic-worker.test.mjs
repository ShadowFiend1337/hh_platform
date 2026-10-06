import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SemanticWorker } from '../semantic-worker.mjs';

async function fixture(t, { timeout = 3000 } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'semantic-worker-'));
  const registry = join(directory, 'registry');
  await mkdir(registry);
  const worker = new SemanticWorker({ modelPath: registry, python: process.execPath, pythonArgs: [], timeout,
    workerPath: fileURLToPath(new URL('./fixtures/semantic-process.mjs', import.meta.url)) });
  t.after(async () => { worker.close(); await rm(directory, { recursive: true, force: true }); });
  const activate = async (version, extra = {}) => {
    const path = join(directory, version);
    await mkdir(path, { recursive: true });
    await writeFile(join(path, 'metadata.json'), JSON.stringify({ trained: true, dimension: 312,
      modelVersion: version, weightsSha256: 'a'.repeat(64), threshold: 0.5, ...extra }));
    await writeFile(join(registry, 'active.json'), JSON.stringify({ artifact: path, modelVersion: version }));
  };
  await activate('first');
  return { worker, activate };
}

test('concurrent startup shares a process and activation replaces its model', async t => {
  const { worker, activate } = await fixture(t);
  const starts = await Promise.all(Array.from({ length: 5 }, () => worker.start()));
  assert.ok(starts.every(info => info.version === 'first'));
  const firstProcess = worker.child;
  await worker.encode(['request']);
  assert.equal(worker.child, firstProcess);
  await activate('second');
  const vectors = await worker.encode(['request']);
  assert.equal(worker.info.version, 'second');
  assert.notEqual(worker.child, firstProcess);
  assert.equal(vectors[0].length, 312);
});

test('rejects a mismatched artifact and recovers after a valid activation', async t => {
  const { worker, activate } = await fixture(t);
  await activate('invalid-health', { protocolVersion: 'wrong-model' });
  await assert.rejects(worker.start(), /метаданным/);
  assert.equal(worker.info.status, 'unavailable');
  await activate('valid');
  assert.equal((await worker.start()).version, 'valid');
});

test('rejects malformed vectors and invalid inputs', async t => {
  const { worker } = await fixture(t);
  await assert.rejects(worker.encode(['invalid']), /векторы/);
  await assert.rejects(worker.encode([null]), /запрос/);
  await assert.rejects(worker.encode(Array(257).fill('x')), /запрос/);
  assert.deepEqual(await worker.encode([]), []);
});

test('a dead process rejects pending requests and restarts', async t => {
  const { worker } = await fixture(t);
  await assert.rejects(worker.encode(['terminate']), /остановилась/);
  assert.equal((await worker.encode(['next']))[0].length, 312);
});

test('a timed out request releases the process and permits retry', async t => {
  const { worker } = await fixture(t, { timeout: 500 });
  await worker.start();
  await assert.rejects(worker.encode(['timeout']), /слишком много времени/);
  assert.equal(worker.info.status, 'unavailable');
  assert.equal((await worker.encode(['next']))[0].length, 312);
});
