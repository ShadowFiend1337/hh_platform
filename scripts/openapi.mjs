import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { platformOpenApi } from '../server/openapi.mjs';

// Writes the merged OpenAPI document of the main API for reviewers and external tools.
const target = fileURLToPath(new URL('../docs/api/platform.openapi.json', import.meta.url));
writeFileSync(target, JSON.stringify(platformOpenApi(), null, 2) + '\n');
console.log('docs/api/platform.openapi.json');
