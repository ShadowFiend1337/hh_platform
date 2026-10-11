// Soft professional requirements of a text request. A technology the employer
// merely mentions ("React и TypeScript, макеты Figma") ranks candidates and is
// explained; it no longer empties the result. Hard constraints remain: UI
// filters, technologies marked mandatory ("Docker обязателен") and exclusions.
// Rationale and measured effect: docs/metrics_and_validation.md, section 8.
export const REQUIREMENT_POLICY = 'soft-stack-requirements-v1';

// Adjacent directions a text request also reaches, below the named one.
// Only pairs whose daily work overlaps substantially are listed.
export const RELATED_SPECIALIZATIONS = Object.freeze({
  Frontend: ['Fullstack'],
  Backend: ['Fullstack'],
  Fullstack: ['Frontend', 'Backend'],
  DataAnalysis: ['DataEngineering'],
  DataEngineering: ['DataAnalysis'],
  BusinessAnalysis: ['ProductManagement'],
  ProductManagement: ['BusinessAnalysis'],
});

// A named role or skill always yields up to this many results, the weakest
// marked as nearest. Requests without such signals keep the model cutoff.
export const MINIMUM_RESULTS = 10;

const fold = value => String(value || '').normalize('NFKC').toLocaleLowerCase('ru');
const unique = values => [...new Set(values)];

/**
 * Split stack constraints parsed from the text into hard SQL constraints and
 * soft requirements. Returns the SQL copy of queryConstraints and the list of
 * requirements, each { skills, label, hard }; one of the skills satisfies it.
 */
export function splitStackConstraints(queryConstraints, { mandatory = [], filterStack = [] } = {}) {
  const sql = structuredClone(queryConstraints || {});
  const hardSkills = new Set(mandatory);
  const requirements = [];
  const add = (skills, hard) => {
    const list = unique(skills);
    if (!list.length || requirements.some(item => item.skills.length === list.length && item.skills.every(skill => list.includes(skill)))) return;
    requirements.push({ skills: list, label: list.join(' или '), hard });
  };
  for (const skill of filterStack) add([skill], true);
  const all = sql.all?.stack || [], any = sql.any?.stack ? [sql.any.stack] : [], groups = sql.groups?.stack || [];
  for (const skill of all) add([skill], hardSkills.has(skill));
  for (const group of [...any, ...groups]) add(group, group.some(skill => hardSkills.has(skill)));
  // SQL keeps only what is mandatory; exclusions are untouched.
  if (sql.all) { const kept = all.filter(skill => hardSkills.has(skill)); if (kept.length) sql.all.stack = kept; else delete sql.all.stack; }
  if (sql.any) { if (any.length && any[0].some(skill => hardSkills.has(skill))) sql.any.stack = any[0]; else delete sql.any.stack; }
  if (sql.groups) { const kept = groups.filter(group => group.some(skill => hardSkills.has(skill))); if (kept.length) sql.groups.stack = kept; else delete sql.groups.stack; }
  return { sql, requirements };
}

/** Expand a text-derived specialization set with adjacent directions. */
export function expandSpecializations(primary) {
  const related = unique(primary.flatMap(value => RELATED_SPECIALIZATIONS[value] || [])).filter(value => !primary.includes(value));
  return { primary, related };
}

/** Which requirements a public profile satisfies by its declared skills. */
export function requirementCoverage(person, requirements) {
  if (!requirements.length) return null;
  const skills = new Set([...(Array.isArray(person?.stack) ? person.stack : []),
    ...(Array.isArray(person?.petProjects) ? person.petProjects.flatMap(project => Array.isArray(project?.stack) ? project.stack : []) : [])].map(fold));
  const matched = [], missing = [];
  for (const requirement of requirements) (requirement.skills.some(skill => skills.has(fold(skill))) ? matched : missing).push(requirement.label);
  return { matched, missing, total: requirements.length, share: matched.length / requirements.length,
    text: missing.length ? `Совпало ${matched.length} из ${requirements.length}${matched.length ? ` (${matched.join(', ')})` : ''}, не хватает: ${missing.join(', ')}.`
      : `Совпали все требования: ${matched.join(', ')}.` };
}

const coverageBand = coverage => !coverage ? 0 : coverage.share === 1 ? 0 : coverage.share >= 0.5 ? 1 : 2;
const relationBand = (item, related) => related.includes(item.person?.confirmed?.specialization || item.person?.specialization) ? 1 : 0;

/**
 * Stable order over already ranked items: model-admitted before nearest,
 * named direction before adjacent ones, then requirement coverage. Inside a
 * band the executed neural/evidence order is preserved unchanged.
 */
export function orderByRequirements(items, { related = [] } = {}) {
  return items.map((item, index) => ({ item, index, key: [item.approximate === true ? 1 : 0, relationBand(item, related), coverageBand(item.coverage)] }))
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2] || a.index - b.index).map(entry => entry.item);
}

/** Employer-facing confidence of one result; never claims more than the model admitted. */
export function confidenceOf(item, { related = [] } = {}) {
  if (item.approximate === true) return { level: 'low', label: 'Низкая уверенность' };
  const partial = item.coverage && item.coverage.share < 1;
  return partial || relationBand(item, related) ? { level: 'medium', label: 'Частичное совпадение' } : { level: 'high', label: 'Высокая уверенность' };
}
