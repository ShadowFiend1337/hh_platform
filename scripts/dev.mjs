import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

await import('../frontend/scripts/prepare-resume-assets.mjs');

const root = fileURLToPath(new URL('../', import.meta.url));
const venvPython = process.platform === 'win32'
  ? join(root, '.venv', 'Scripts', 'python.exe')
  : join(root, '.venv', 'bin', 'python');
const python = process.env.PYTHON_BIN || (existsSync(venvPython) ? venvPython : (process.platform === 'win32' ? 'python' : 'python3'));
const children = [
  process.argv.includes('--fastapi')
    ? spawn(python, ['-m', 'backend', '--reload'], { cwd: root, stdio: 'inherit', windowsHide: true })
    : // OpenRouter and public sources may be reachable only through the system proxy (HTTPS_PROXY).
    // The Vite proxy targets 8787; a PORT injected for the web preview must not move the API.
    spawn(process.execPath, ['--watch', '--use-env-proxy', 'server/server.mjs'], { cwd: root, stdio: 'inherit', windowsHide: true,
      env: { ...process.env, PORT: process.env.API_PORT || '8787' } }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { cwd: fileURLToPath(new URL('../frontend/', import.meta.url)), stdio: 'inherit' }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => stop(code || 0));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
