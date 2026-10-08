/** The standard frozen-composition runner with the authored transfer labels. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const child = spawn(process.execPath, ['ml/acceptance-control.mjs', '--data', 'ml/transfer-control.json', ...process.argv.slice(2)],
  { cwd: root, windowsHide: true, stdio: 'inherit' });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
