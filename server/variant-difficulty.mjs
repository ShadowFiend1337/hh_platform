// Conservative, distribution-free comparison of bounded CASE scores (not subquestions).
// Requires independent participants, random assignment and a fixed, preregistered sample.
export const difficultyPolicy = Object.freeze({ version: '2026.10.10-equivalence-v1', alpha: 0.05,
  margin: 0.10, defaultSamplePerArm: 1000, minimumSamplePerArm: 200 });

export function difficultyPlan(candidate, { samplePerArm = difficultyPolicy.defaultSamplePerArm, strata = ['all'] } = {}) {
  if (!Number.isInteger(samplePerArm) || samplePerArm < difficultyPolicy.minimumSamplePerArm || samplePerArm > 10000
    || !Array.isArray(strata) || !strata.length || strata.length > 5 || new Set(strata).size !== strata.length
    || strata.some(s => typeof s !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/u.test(s))) throw new TypeError('Invalid fixed sample/strata');
  return { ...difficultyPolicy, samplePerArm, strata: [...strata],
    design: 'randomized-between-subjects', unit: 'participant-case',
    anchorId: candidate.passport.anchorId, anchorHash: candidate.passport.anchorHash,
    variantId: candidate.id, variantHash: candidate.contentHash,
    grade: candidate.passport.grade, answerFormat: candidate.passport.answerFormat };
}

export function compareVariantDifficulty(plan, responses) {
  if (plan.version !== difficultyPolicy.version || plan.alpha !== difficultyPolicy.alpha || plan.margin !== difficultyPolicy.margin
    || plan.design !== 'randomized-between-subjects' || plan.unit !== 'participant-case'
    || !Number.isInteger(plan.samplePerArm) || plan.samplePerArm < difficultyPolicy.minimumSamplePerArm || plan.samplePerArm > 10000
    || !Array.isArray(plan.strata) || !plan.strata.length || plan.strata.length > 5 || new Set(plan.strata).size !== plan.strata.length
    || plan.strata.some(s => typeof s !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/u.test(s))
    || !Array.isArray(responses)) throw new TypeError('Invalid experiment');
  const groups = new Map(plan.strata.map(stratum => [stratum, { anchor: [], variant: [] }]));
  const participants = new Set();
  for (const row of responses) {
    if (typeof row.participantHash !== 'string' || !/^[a-f0-9]{64}$/u.test(row.participantHash)
      || participants.has(row.participantHash) || !groups.has(row.stratum) || !['anchor', 'variant'].includes(row.arm)
      || !Number.isFinite(row.score) || row.score < 0 || row.score > 1
      || row.grade !== plan.grade || row.answerFormat !== plan.answerFormat) throw new TypeError('Invalid/duplicate/mismatched case observation');
    participants.add(row.participantHash); groups.get(row.stratum)[row.arm].push(row.score);
  }
  const comparisons = [...groups].map(([stratum, arms]) => {
    if (arms.anchor.length > plan.samplePerArm || arms.variant.length > plan.samplePerArm) throw new TypeError('Sample exceeded preregistered target');
    const na = arms.anchor.length, nv = arms.variant.length;
    const complete = na === plan.samplePerArm && nv === plan.samplePerArm;
    const mean = values => values.length ? values.reduce((n, v) => n + v, 0) / values.length : null;
    const anchorMean = mean(arms.anchor), variantMean = mean(arms.variant);
    const difference = na && nv ? variantMean - anchorMean : null;
    // Hoeffding: P(|difference - populationDifference| >= r)
    // <= 2 exp(-2r²/(1/na+1/nv)); Bonferroni across prespecified strata.
    const radius = na && nv ? Math.sqrt(0.5 * (1 / na + 1 / nv) * Math.log(2 * plan.strata.length / plan.alpha)) : null;
    const interval = radius === null ? [-1, 1] : [Math.max(-1, difference - radius), Math.min(1, difference + radius)];
    const compatible = complete && interval[0] > -plan.margin && interval[1] < plan.margin;
    const outside = complete && (interval[0] >= plan.margin || interval[1] <= -plan.margin);
    return { stratum, anchorResponses: na, variantResponses: nv, anchorMean, variantMean, difference,
      interval, complete, status: !complete ? 'awaiting-sample' : compatible ? 'compatible' : outside ? 'different' : 'inconclusive' };
  });
  return {
    method: 'bounded-score Hoeffding interval; Bonferroni over fixed strata',
    confidence: 1 - plan.alpha, margin: plan.margin, comparisons,
    statisticalChecksPassed: comparisons.every(c => c.status === 'compatible'),
    approvedForCertification: false,
    limitation: 'Conditional on the registered design, independent participants and unchanged scoring. Does not verify correctness, grade, discrimination, timing or representativeness; never activates an item.',
  };
}
