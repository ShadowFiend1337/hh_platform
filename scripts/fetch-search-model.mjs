/**
 * Downloads the published search model and checks it before use.
 *   npm run fetch:search-model
 * Release assets (GitHub Release `search-model-task-v2`):
 *   search-encoder-task-v2.tar.gz  — fine-tuned RuBERT-tiny2 with its calibrations;
 *   search-reranker-mmarco.tar.gz  — pretrained mMARCO cross-encoder (Apache-2.0).
 * If the reranker asset is missing, its pinned files are taken from Hugging Face.
 * Every weight and tokenizer file is verified against the SHA-256 in metadata.json;
 * nothing is activated unless all hashes match.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const release = process.env.SEARCH_MODEL_RELEASE || 'https://github.com/ShadowFiend1337/hh_platform/releases/download/search-model-task-v2';
const runs = join(root, 'server/data/semantic-runs'), artifact = join(runs, 'task-v2-search');

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
async function download(url, target) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) return false;
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
  return true;
}
async function extract(name) {
  const archive = join(runs, name);
  console.log('Скачиваю', name);
  if (!await download(`${release}/${name}`, archive)) return false;
  const result = spawnSync('tar', ['-xzf', archive, '-C', runs], { stdio: 'inherit' });
  await rm(archive, { force: true });
  if (result.status !== 0) throw new Error(`Не удалось распаковать ${name}.`);
  return true;
}

await mkdir(runs, { recursive: true });
if (!await extract('search-encoder-task-v2.tar.gz')) throw new Error('Не найден архив энкодера в релизе ' + release);
const metadata = JSON.parse(await readFile(join(artifact, 'metadata.json'), 'utf8'));
const reranker = metadata.reranker;
if (!await extract('search-reranker-mmarco.tar.gz')) {
  console.log('Архива второго этапа нет, беру файлы', reranker.baseModel, 'с Hugging Face');
  await mkdir(join(artifact, reranker.path), { recursive: true });
  for (const name of Object.keys(reranker.fileHashes)) {
    const url = `https://huggingface.co/${reranker.baseModel}/resolve/${reranker.revision}/${name}`;
    if (!await download(url, join(artifact, reranker.path, name))) throw new Error('Не удалось скачать ' + url);
  }
}
const checks = [['model.safetensors', metadata.weightsSha256],
  ...Object.entries(reranker.fileHashes).map(([name, hash]) => [join(reranker.path, name), hash])];
for (const [name, expected] of checks) {
  if (await sha256(join(artifact, name)) !== expected) throw new Error(`Хеш ${name} не совпал с metadata.json.`);
}
await mkdir(join(root, 'server/data/semantic-model'), { recursive: true });
await writeFile(join(root, 'server/data/semantic-model/active.json'), JSON.stringify({ artifact: 'server/data/semantic-runs/task-v2-search',
  modelVersion: metadata.modelVersion, activatedAt: new Date().toISOString() }, null, 2) + '\n');
console.log(`Модель ${metadata.modelVersion} готова: ${checks.length} файлов сверены с metadata.json.`);
