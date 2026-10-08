import { directoryCandidates, legacyDirectoryCandidates } from './directory-seed.mjs';

// Only the authored, built-in catalogue can be shown without a registered
// owner. Neither an editable synthetic flag nor an abandoned guest profile
// grants that exception. Local account fixtures remain in their own realm.
const demoIds = new Set([...directoryCandidates, ...legacyDirectoryCandidates].map(person => person.id));

export function isDemoCatalogProfile(row) {
  return Boolean(row && row.owner === null && row.synthetic === 1 && demoIds.has(row.id));
}
