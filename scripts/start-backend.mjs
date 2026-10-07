import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const venvPython = process.platform === 'win32'
  ? join(root, '.venv', 'Scripts', 'python.exe')
  : join(root, '.venv', 'bin', 'python');
const python = process.env.PYTHON_BIN || (existsSync(venvPython) ? venvPython : (process.platform === 'win32' ? 'python' : 'python3'));
const child = spawn(python, ['-m', 'backend'], { cwd: root, stdio: 'inherit' });

child.on('error', error => {
  console.error(`Не удалось запустить Python (${python}): ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', code => { process.exitCode = code ?? 1; });

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
