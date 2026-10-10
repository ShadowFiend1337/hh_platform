import assert from 'node:assert/strict';
import test from 'node:test';
import { difficultyPlan, compareVariantDifficulty } from '../variant-difficulty.mjs';

const candidate = { id: 'variant-fixture', contentHash: 'f'.repeat(64), passport: {
  anchorId: 'reference-fixture', anchorHash: 'a'.repeat(64), grade: 'Middle', answerFormat: 'single-choice-case' } };
function observations(plan, anchorP, variantP, n = plan.samplePerArm) {
  let participant = 0;
  return plan.strata.flatMap(stratum => ['anchor', 'variant'].flatMap(arm => Array.from({ length: n }, (_, i) => ({
    participantHash: (++participant).toString(16).padStart(64, '0'), arm, stratum,
    score: i < n * (arm === 'anchor' ? anchorP : variantP) ? 1 : 0,
    grade: plan.grade, answerFormat: plan.answerFormat,
  }))));
}

test('compatible fixed samples have a confidence interval wholly inside the declared margin', () => {
  const plan = difficultyPlan(candidate), report = compareVariantDifficulty(plan, observations(plan, 0.60, 0.61));
  assert.equal(report.statisticalChecksPassed, true);
  const c = report.comparisons[0];
  assert(c.interval[0] > -0.1 && c.interval[1] < 0.1);
  assert(Math.abs(c.difference - 0.01) < 1e-10);
  assert.equal(report.approvedForCertification, false);
});

test('no early acceptance, no priors and no automatic equivalence from an insignificant result', () => {
  const plan = difficultyPlan(candidate);
  const empty = compareVariantDifficulty(plan, []);
  assert.equal(empty.statisticalChecksPassed, false); assert.equal(empty.comparisons[0].anchorMean, null);
  const partial = compareVariantDifficulty(plan, observations(plan, 0.6, 0.6, 999));
  assert.equal(partial.statisticalChecksPassed, false); assert.equal(partial.comparisons[0].status, 'awaiting-sample');
  const smallPlan = difficultyPlan(candidate, { samplePerArm: 200 });
  const small = compareVariantDifficulty(smallPlan, observations(smallPlan, 0.6, 0.6));
  assert.equal(small.comparisons[0].status, 'inconclusive'); assert.equal(small.statisticalChecksPassed, false);
});

test('a substantially easier variant fails, and pooled means cannot hide subgroup drift', () => {
  const plan = difficultyPlan(candidate, { strata: ['low', 'high'] });
  const different = compareVariantDifficulty(plan, observations(plan, 0.6, 0.85));
  assert.equal(different.statisticalChecksPassed, false); assert.equal(different.comparisons[0].status, 'different');
  const rows = observations(plan, 0.6, 0.6);
  for (const row of rows.filter(r => r.arm === 'variant')) {
    const group = rows.filter(r => r.arm === 'variant' && r.stratum === row.stratum);
    row.score = group.indexOf(row) < 1000 * (row.stratum === 'low' ? 0.45 : 0.75) ? 1 : 0;
  }
  assert.equal(compareVariantDifficulty(plan, rows).statisticalChecksPassed, false);
});

test('a case contributes one bounded score, not independent observations for its two questions', () => {
  const plan = difficultyPlan(candidate), rows = observations(plan, 0.5, 0.5);
  rows.forEach(row => { row.score = 0.5; });
  assert.equal(compareVariantDifficulty(plan, rows).comparisons[0].anchorResponses, 1000);
  assert.throws(() => compareVariantDifficulty(plan, [...rows, rows[0]]), /duplicate/u);
  for (const patch of [{ grade: 'Senior' }, { answerFormat: 'case' }, { stratum: 'post-hoc-group' }, { score: 2 }]) {
    const bad = structuredClone(rows); Object.assign(bad[0], patch);
    assert.throws(() => compareVariantDifficulty(plan, bad));
  }
  assert.throws(() => difficultyPlan(candidate, { samplePerArm: 12 }));
  assert.throws(() => compareVariantDifficulty({ ...plan, margin: 0.25 }, rows));
  assert.throws(() => compareVariantDifficulty(plan, observations(plan, 0.5, 0.5, 1001)), /exceeded/u);
});
