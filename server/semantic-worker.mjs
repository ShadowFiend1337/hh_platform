import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const root = fileURLToPath(new URL('../', import.meta.url));

/** One local Python process shares the trained encoder across HTTP requests. */
export class SemanticWorker {
  constructor({ modelPath = process.env.SEMANTIC_MODEL || join(root, 'server/data/semantic-model'), python = process.env.SEMANTIC_PYTHON,
    timeout = 60000, workerPath = join(root, 'ml/worker.py'), pythonArgs = ['-u'] } = {}) {
    this.modelPath = modelPath;
    this.python = python || (existsSync(join(root, '.venv/Scripts/python.exe')) ? join(root, '.venv/Scripts/python.exe')
      : existsSync(join(root, '.venv/bin/python')) ? join(root, '.venv/bin/python') : 'python');
    this.timeout = timeout;
    this.workerPath = workerPath;
    this.pythonArgs = pythonArgs;
    this.loadedArtifact = null;
    this.pending = new Map();
    this.sequence = 0;
    this.child = null;
    this.initializing = null;
    this.info = { status: 'unavailable', name: 'RuBERT-tiny2', version: '', dimension: 312, trained: false };
  }

  async start() {
    if (this.initializing) return this.initializing;
    this.initializing = (async () => {
      let artifactPath = this.modelPath;
      try {
        const active = JSON.parse(await readFile(join(this.modelPath, 'active.json'), 'utf8'));
        if (typeof active.artifact !== 'string' || !active.artifact.trim()) throw new Error('Некорректная активная модель.');
        artifactPath = resolve(root, active.artifact);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      // An absent artifact cannot silently switch a semantic query to keywords.
      const metadata = JSON.parse(await readFile(join(artifactPath, 'metadata.json'), 'utf8'));
      if (!metadata.trained) throw new Error('Обученная модель ещё не подготовлена. Выполните npm run train:search.');
      const artifactKey = JSON.stringify([artifactPath, metadata.modelVersion, metadata.weightsSha256, metadata.encodingPolicy ?? null]);
      if (this.info.status === 'ready' && this.child && this.loadedArtifact === artifactKey) return this.info;
      this.close();
      const child = spawn(this.python, [...this.pythonArgs, this.workerPath, '--model', artifactPath], {
        cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, TOKENIZERS_PARALLELISM: 'false' },
      });
      this.child = child;
      const lines = createInterface({ input: child.stdout });
      lines.on('line', line => {
        let message;
        try { message = JSON.parse(line); } catch { return; }
        const request = this.pending.get(String(message.id));
        if (!request) return;
        clearTimeout(request.timer); this.pending.delete(String(message.id));
        if (message.error) request.reject(new Error('Не удалось выполнить локальный поиск по смыслу.'));
        else request.resolve(message);
      });
      child.stderr.on('data', () => { /* Model libraries write diagnostic startup messages, never query text. */ });
      const failed = () => {
        lines.close();
        // A delayed exit of an old worker must not invalidate its replacement.
        if (this.child !== child) return;
        this.child = null; this.info.status = 'unavailable';
        for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error('Модель поиска остановилась. Повторите запрос.')); }
        this.pending.clear();
      };
      child.on('error', failed); child.on('exit', failed); child.stdin.on('error', failed);
      const health = await this.call({ kind: 'health' });
      if (this.child !== child || !health.trained || health.dimension !== metadata.dimension
        || health.modelVersion !== metadata.modelVersion) throw new Error('Артефакт поиска не соответствует метаданным.');
      this.loadedArtifact = artifactKey;
      this.info = { status: 'ready', name: metadata.baseModel || 'RuBERT-tiny2',
        version: metadata.modelVersion || metadata.version || health.modelVersion || '',
        dimension: health.dimension || metadata.dimension || 312, trained: true,
        threshold: metadata.threshold ?? metadata.relevanceThreshold ?? 0.3 };
      return this.info;
    })().catch(error => { this.close(); throw error; }).finally(() => { this.initializing = null; });
    return this.initializing;
  }

  call(payload) {
    if (!this.child?.stdin.writable) return Promise.reject(new Error('Модель поиска недоступна.'));
    const id = String(++this.sequence);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id); reject(new Error('Поиск занял слишком много времени. Повторите запрос.'));
        this.close();
      }, this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, ...payload }) + '\n', error => {
        if (error) { clearTimeout(timer); this.pending.delete(id); reject(new Error('Модель поиска недоступна.')); }
      });
    });
  }

  async encode(texts) {
    await this.start();
    if (!Array.isArray(texts) || texts.length > 256 || texts.some(text => typeof text !== 'string' || text.length > 12000)) throw new Error('Некорректный запрос модели.');
    const result = await this.call({ texts });
    if (!Array.isArray(result.vectors) || result.vectors.length !== texts.length
      || result.vectors.some(vector => !Array.isArray(vector) || vector.length !== this.info.dimension || vector.some(value => !Number.isFinite(value)))) {
      throw new Error('Модель вернула некорректные векторы.');
    }
    return result.vectors;
  }

  close() {
    this.child?.kill(); this.child = null; this.loadedArtifact = null; this.info.status = 'unavailable';
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error('Модель поиска остановлена.')); }
    this.pending.clear();
  }
}
