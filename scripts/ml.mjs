import { spawn } from 'node:child_process';
import { existsSync, createReadStream } from 'node:fs';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join, resolve, relative, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const python = join(root, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
const action = process.argv[2];
const argumentsList = process.argv.slice(3);
const defaultRun = join(root, 'server/data/semantic-runs/task-v2');
function argument(name, fallback) {
  let result = fallback;
  for (let index = 0; index < argumentsList.length; index++) {
    const item = argumentsList[index];
    if (item !== name && !item.startsWith(name + '=')) continue;
    const value = item === name ? argumentsList[++index] : item.slice(name.length + 1);
    if (!value || value.startsWith('--')) throw new Error(`Укажите значение ${name}.`);
    result = value;
  }
  return result;
}
async function selectedModel() {
  try {
    const active = JSON.parse(await readFile(join(root, 'server/data/semantic-model/active.json'), 'utf8'));
    if (typeof active.artifact !== 'string' || !active.artifact.trim()) throw new Error('Некорректная активная модель.');
    return resolve(root, active.artifact);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return defaultRun;
  }
}
async function activate(path) {
  const artifact = resolve(root, path);
  const withinData = relative(join(root, 'server/data'), artifact);
  if (!withinData || isAbsolute(withinData) || withinData.startsWith('..' + sep) || withinData === '..') {
    throw new Error('Артефакт должен находиться в отдельной папке server/data.');
  }
  const metadata = JSON.parse(await readFile(join(artifact, 'metadata.json'), 'utf8'));
  if (!metadata.trained || metadata.dimension !== 312 || typeof metadata.modelVersion !== 'string'
    || !Number.isFinite(metadata.threshold) || metadata.threshold < -1 || metadata.threshold > 1
    || !/^[a-f0-9]{64}$/.test(metadata.weightsSha256 || '')) throw new Error('Метаданные обученной модели некорректны.');
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(join(artifact, 'model.safetensors'))) digest.update(chunk);
  if (digest.digest('hex') !== metadata.weightsSha256) throw new Error('Вес модели не соответствует метаданным.');
  const registry = join(root, 'server/data/semantic-model');
  await mkdir(registry, { recursive: true });
  const temporary = join(registry, `active-${randomUUID()}.json`);
  await writeFile(temporary, JSON.stringify({ artifact: relative(root, artifact).split(sep).join('/'),
    modelVersion: metadata.modelVersion, activatedAt: new Date().toISOString() }, null, 2) + '\n', 'utf8');
  await rename(temporary, join(registry, 'active.json'));
  console.log('Активирована локальная модель: ' + metadata.modelVersion);
}
function run(program, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { cwd: root, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Команда завершилась с кодом ${code}.`)));
  });
}
try {
  if (action === 'setup') {
    if (!existsSync(python)) await run(process.env.SEMANTIC_PYTHON || 'python', ['-m', 'venv', '.venv']);
    await run(python, ['-m', 'pip', 'install', '--extra-index-url', 'https://download.pytorch.org/whl/cpu', '-r', 'ml/requirements.txt']);
  } else if (action === 'activate') {
    await activate(argumentsList[0] || defaultRun);
  } else {
    if (!existsSync(python)) throw new Error('Подготовьте локальную Python-среду: npm run setup:search.');
    const tasks = { train: 'train.py', evaluate: 'evaluate.py', check: 'check_worker.py' };
    if (!tasks[action]) throw new Error('Неизвестная команда модели.');
    const flag = action === 'train' ? '--output' : '--model';
    const requested = argument(flag);
    const target = requested ?? (action === 'train' ? defaultRun : await selectedModel());
    const args = [...argumentsList];
    if (requested === undefined) args.push(flag, target);
    await run(python, ['-X', 'utf8', 'ml/' + tasks[action], ...args]);
    if (action === 'train') await activate(target);
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
