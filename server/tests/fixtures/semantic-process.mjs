import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const directory = process.argv[process.argv.indexOf('--model') + 1];
const metadata = JSON.parse(readFileSync(join(directory, 'metadata.json'), 'utf8'));
const respond = value => process.stdout.write(JSON.stringify(value) + '\n');
createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line);
  if (request.kind === 'health') {
    respond({ id: request.id, trained: true, dimension: metadata.dimension,
      modelVersion: metadata.protocolVersion || metadata.modelVersion });
  } else if (request.texts.includes('terminate')) {
    process.exit(1);
  } else if (request.texts.includes('timeout')) {
    // Deliberately keep the process alive without responding.
  } else {
    const dimension = request.texts.includes('invalid') ? 1 : metadata.dimension;
    respond({ id: request.id, vectors: request.texts.map(() => Array.from({ length: dimension }, (_, i) => i === 0 ? 1 : 0)) });
  }
});
