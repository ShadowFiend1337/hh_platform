import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const python=join(root,process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python');
const action=process.argv[2];
function run(program,args) {
  return new Promise((resolve,reject)=>{
    const child=spawn(program,args,{cwd:root,stdio:'inherit',windowsHide:true});
    child.on('error',reject); child.on('exit',code=>code===0?resolve():reject(new Error(`Команда завершилась с кодом ${code}.`)));
  });
}
try {
  if(action==='setup') {
    if(!existsSync(python)) await run(process.env.SEMANTIC_PYTHON||'python',['-m','venv','.venv']);
    await run(python,['-m','pip','install','--extra-index-url','https://download.pytorch.org/whl/cpu','-r','ml/requirements.txt']);
  } else {
    if(!existsSync(python)) throw new Error('Подготовьте локальную Python-среду: npm run setup:search.');
    const tasks={train:'train.py',evaluate:'evaluate.py',check:'check_worker.py'};
    if(!tasks[action]) throw new Error('Неизвестная команда модели.');
    await run(python,['ml/'+tasks[action],...process.argv.slice(3)]);
  }
} catch(error) { console.error(error.message);process.exitCode=1; }
