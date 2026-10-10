import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Runs every browser scenario one after another (each starts its own disposable
// service) and prints a summary. Measurement scripts are excluded.
const frontend = fileURLToPath(new URL('../frontend/', import.meta.url));
const skip = new Set(['visual-tour.mjs', 'mode-focus.mjs']);
const only = process.argv.slice(2);
const files = readdirSync(frontend + 'tests').filter(name => name.endsWith('.mjs') && !skip.has(name)
  && (!only.length || only.some(item => name.includes(item)))).sort();
const results = [];
for (const name of files) {
  const started = Date.now();
  const run = spawnSync(process.execPath, ['tests/' + name], { cwd: frontend, encoding: 'utf8', timeout: 15 * 60000, maxBuffer: 64 * 1024 * 1024 });
  const seconds = Math.round((Date.now() - started) / 1000);
  const ok = run.status === 0;
  results.push({ name, ok, seconds });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} (${seconds} с)`);
  if (!ok) console.log((run.stderr || run.stdout || '').split('\n').filter(line => !line.includes('outside of Vite')).slice(0, 12).join('\n'));
}
const failed = results.filter(result => !result.ok);
console.log(`\n${results.length - failed.length} из ${results.length} сценариев прошли.`);
process.exitCode = failed.length ? 1 : 0;
