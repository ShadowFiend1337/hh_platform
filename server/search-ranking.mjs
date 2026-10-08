import { isSpecialization } from '../shared/catalog.ts';
import { isGrade } from '../shared/grading.ts';

// This is a bounded ordering rule, not a learned relevance probability. The
// model and its frozen admission cutoff run before this rule is applied.
export const CATEGORY_RANKING_POLICY = Object.freeze({
  version: 'category-evidence-bands-v1',
  category: 'confirmed-specialization-and-grade',
  comparison: 'maximum-gap-from-band-anchor',
  logitMaximumGap: 0.25,
  cosineMaximumGap: 0.02,
  fspTestPointBonus: 5,
  admission: 'unchanged-model-cutoff-before-evidence-ordering',
  categoryPositions: 'preserved',
});

// Real federation identity verification is not connected yet.
// Merely writing an external ID or a competition title cannot earn a bonus.
// Metadata below is supplied only by the session-bound server demo provider;
// ordinary profile input cannot set it. Demo evidence never verifies identity.
export function rankingFspEvidence(person) {
  const demoProvider = person?.fspEvidence?.provider === 'fsp-demo' && person.fspEvidence.mode === 'demo'
    && person.fspEvidence.identityVerified === false && Number.isInteger(person.fspEvidence.activeCount)
    && person.fspEvidence.activeCount > 0;
  return (person?.synthetic === true || demoProvider) && Array.isArray(person.achievements) && person.achievements.length
    ? 'synthetic-demo' : null;
}

// A trusted resolver still has to name a supported source compatible with the
// profile. Apply the same check to the actual bonus and its public explanation.
// Real verification can only be supplied by a trusted server resolver.
export function normalizeRankingFspEvidence(person, source) {
  if (source === 'synthetic-demo' && rankingFspEvidence(person) === source) return source;
  if (source === 'verified-fsp' && person && person.synthetic !== true) return source;
  return null;
}

// Public explanation may read only traces attached by this execution, not a
// similarly shaped object copied from input or another candidate. Directory
// keeps these objects intact until explaining, then strips the internal trace.
const executedRankings = new WeakMap();
export function rankingTraceFor(item, scoreKind) {
  const trace = item && executedRankings.get(item);
  return trace && trace === item.rankingTrace && trace.policy === CATEGORY_RANKING_POLICY.version
    && trace.scoreKind === scoreKind && Number.isInteger(trace.comparableCount) && trace.comparableCount >= 0
    && typeof trace.changedWithinBand === 'boolean' && (!trace.changedWithinBand || trace.comparableCount > 1)
    && [null, 'synthetic-demo', 'verified-fsp'].includes(trace.fspSource) ? trace : null;
}

const numericScore = value => Number.isFinite(value) ? value : -Infinity;
const testScore = item => {
  const score = item.person?.confirmed?.score;
  return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
};

function categoryKey(item) {
  const category = item.person?.confirmed;
  if (!category || !isSpecialization(category.specialization) || !isGrade(category.grade)
    || testScore(item) === null || !Number.isFinite(item.rank)) return null;
  // A nearest-result warning must remain separate from a strong match.
  return `${category.specialization}:${category.grade}:${item.approximate === true ? 'nearest' : 'strong'}`;
}

function deterministicOrder(a, b) {
  return String(a.person?.name || '').localeCompare(String(b.person?.name || ''), 'ru')
    || String(a.sourceId || a.person?.id || '').localeCompare(String(b.sourceId || b.person?.id || ''));
}

export function semanticOrder(a, b) {
  const rankA = numericScore(a.rank), rankB = numericScore(b.rank);
  if (rankA !== rankB) return rankA > rankB ? -1 : 1;
  const semanticA = numericScore(a.semanticScore), semanticB = numericScore(b.semanticScore);
  if (semanticA !== semanticB) return semanticA > semanticB ? -1 : 1;
  return deterministicOrder(a, b);
}

function evidenceExplanation(item, evidence) {
  const source = item.person.synthetic === true ? 'Учебный результат теста' : 'Подтверждённый сервером результат теста';
  const federation = evidence === 'synthetic-demo' ? ' Демонстрационные достижения ФСП учтены как учебный пример.'
    : evidence === 'verified-fsp' ? ' Подтверждённые достижения ФСП учтены в порядке выдачи.' : '';
  return `${source} влияет на порядок среди близких по задачам профилей той же подтверждённой категории.${federation}`;
}

/**
 * Reorder already admitted candidates. Only positions already occupied by the
 * same confirmed category can be exchanged; other categories keep their slots.
 * Every band is bounded against its first, most relevant member. Comparing
 * neighbouring pairs alone would permit a long chain of dissimilar profiles.
 * Raw neural scores are preserved, so the response never pretends that a medal
 * changed the model's view of the candidate's work.
 */
export function rankComparableCandidates(items, { scoreKind = 'logit', fspEvidence = rankingFspEvidence } = {}) {
  if (scoreKind !== 'logit' && scoreKind !== 'cosine') throw new TypeError('Unknown semantic score kind');
  if (typeof fspEvidence !== 'function') throw new TypeError('Expected a trusted FSP evidence resolver');
  const ordered = [...items].sort(semanticOrder).map(item => ({ ...item, rankingTrace: {
    policy: CATEGORY_RANKING_POLICY.version, scoreKind, comparableCount: 0, changedWithinBand: false,
    fspSource: normalizeRankingFspEvidence(item.person, fspEvidence(item.person)),
  } }));
  const maximumGap = scoreKind === 'cosine' ? CATEGORY_RANKING_POLICY.cosineMaximumGap : CATEGORY_RANKING_POLICY.logitMaximumGap;
  const categories = new Map();
  for (const [position, item] of ordered.entries()) {
    const key = categoryKey(item);
    if (key === null) continue;
    if (!categories.has(key)) categories.set(key, []);
    categories.get(key).push(position);
  }
  for (const positions of categories.values()) {
    let first = 0;
    while (first < positions.length) {
      const anchor = ordered[positions[first]].rank;
      let end = first + 1;
      // Allow only floating-point round-off at the documented boundary.
      while (end < positions.length && anchor - ordered[positions[end]].rank <= maximumGap + 1e-12) end++;
      const slots = positions.slice(first, end);
      const band = slots.map(position => {
        const item = ordered[position], evidence = item.rankingTrace.fspSource;
        return { item, position, evidence, strength: testScore(item) + (evidence ? CATEGORY_RANKING_POLICY.fspTestPointBonus : 0) };
      });
      if (slots.length > 1) {
        band.sort((a, b) => b.strength - a.strength || testScore(b.item) - testScore(a.item) || semanticOrder(a.item, b.item));
      }
      slots.forEach((position, index) => {
        const { item, evidence, position: originalPosition } = band[index];
        item.rankingTrace.comparableCount = slots.length;
        item.rankingTrace.changedWithinBand = position !== originalPosition;
        ordered[position] = slots.length > 1
          ? { ...item, reason: [item.reason, evidenceExplanation(item, evidence)].filter(Boolean).join(' ') } : item;
      });
      first = end;
    }
  }
  for (const item of ordered) executedRankings.set(item, Object.freeze(item.rankingTrace));
  return ordered;
}
