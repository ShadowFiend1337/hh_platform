import { cp, mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const frontend = fileURLToPath(new URL('../', import.meta.url));
const assets = path.join(frontend, 'public', 'resume-assets');
const modules = path.join(frontend, 'node_modules');
const models = {
  rus: 'b617eb6830ffabaaa795dd87ea7fd251adfe9cf0efe05eb9a2e8128b7728d6b6',
  eng: '8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba',
};
const modelRelease = '4.1.0';
const sha256 = data => createHash('sha256').update(data).digest('hex');
async function sameContents(target, data) {
  try { return data.equals(await readFile(target)); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
async function copyChanged(source, target) {
  // Avoid replacing identical files while the development server watches them.
  await cp(source, target, { recursive: true, filter: async (file, destination) =>
    (await stat(file)).isDirectory() || !await sameContents(destination, await readFile(file)),
  });
}
await mkdir(assets, { recursive: true });

for (const [name, source] of Object.entries({
  'pdf/pdf.worker.min.mjs': 'pdfjs-dist/build/pdf.worker.min.mjs',
  'pdf/cmaps': 'pdfjs-dist/cmaps',
  'pdf/standard_fonts': 'pdfjs-dist/standard_fonts',
  'pdf/wasm': 'pdfjs-dist/wasm',
  'tesseract/worker.min.js': 'tesseract.js/dist/worker.min.js',
  'tesseract/tesseract.min.js': 'tesseract.js/dist/tesseract.min.js',
  'mammoth.browser.min.js': 'mammoth/mammoth.browser.min.js',
  'licenses/pdfjs-dist.txt': 'pdfjs-dist/LICENSE',
  'licenses/tesseract.js.txt': 'tesseract.js/LICENSE.md',
  'licenses/tesseract.js-core.txt': 'tesseract.js-core/LICENSE',
  'licenses/mammoth.txt': 'mammoth/LICENSE',
})) {
  const target = path.join(assets, name);
  await mkdir(path.dirname(target), { recursive: true });
  await copyChanged(path.join(modules, source), target);
}

await copyChanged(new URL('./resume-document-worker.js', import.meta.url), path.join(assets, 'resume-document-worker.js'));
const coreDir = path.join(modules, 'tesseract.js-core');
const coreTarget = path.join(assets, 'tesseract', 'core');
await mkdir(coreTarget, { recursive: true });
// The library chooses SIMD/relaxed SIMD and LSTM variants for the current device.
const currentCoreFiles = (await readdir(coreDir)).filter(file => /^tesseract-core.*\.(?:js|wasm)$/.test(file));
for (const file of await readdir(coreTarget)) {
  if (/^tesseract-core.*\.(?:js|wasm)$/.test(file) && !currentCoreFiles.includes(file)) await unlink(path.join(coreTarget, file));
}
for (const file of currentCoreFiles) await copyChanged(path.join(coreDir, file), path.join(coreTarget, file));

const modelTarget = path.join(assets, 'tesseract', 'lang');
await mkdir(modelTarget, { recursive: true });
for (const [language, hash] of Object.entries(models)) {
  const target = path.join(modelTarget, `${language}.traineddata.gz`);
  try {
    if (sha256(gunzipSync(await readFile(target))) === hash) continue;
  } catch { /* Missing or corrupted cached model: fetch the pinned release. */ }
  const response = await fetch(`https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/${modelRelease}/${language}.traineddata`, {
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Cannot prepare ${language} OCR model: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (sha256(data) !== hash) throw new Error(`Checksum mismatch for ${language} OCR model`);
  await writeFile(target, gzipSync(data, { level: 9 }));
}
// Model files share Apache-2.0 with the Tesseract core; include a separate copy.
await copyChanged(path.join(modules, 'tesseract.js-core', 'LICENSE'), path.join(assets, 'licenses', 'tessdata_best.txt'));
const versions = {};
for (const name of ['pdfjs-dist', 'tesseract.js', 'tesseract.js-core', 'mammoth']) {
  versions[name] = JSON.parse(await readFile(path.join(modules, name, 'package.json'), 'utf8')).version;
}
const manifest = Buffer.from(JSON.stringify({
  versions, models: { repository: 'https://github.com/tesseract-ocr/tessdata_best', release: modelRelease, sha256: models },
  runtime: 'same origin only',
}, null, 2));
const manifestTarget = path.join(assets, 'manifest.json');
if (!await sameContents(manifestTarget, manifest)) await writeFile(manifestTarget, manifest);
console.log('Local resume assets prepared (PDF, DOCX, Russian and English OCR).');
