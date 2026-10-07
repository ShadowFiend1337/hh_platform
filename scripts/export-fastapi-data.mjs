import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bankVersion, programs } from '../server/bank.mjs';
import { vacancyExamples } from '../server/vacancies.mjs';
import { directoryCandidates } from '../server/directory-seed.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dataDirectory = resolve(root, 'backend/app/data');

async function save(name, value) {
  const destination = resolve(dataDirectory, name);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(value), 'utf8');
}

// These exports keep FastAPI independent from the former Node backend at
// runtime. Run this script only when the authored JS source data changes.
await save('assessment-bank.json', { bankVersion, programs, vacancyExamples });
await save('directory-seed.json', directoryCandidates);
