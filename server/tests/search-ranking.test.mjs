import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORY_RANKING_POLICY, rankComparableCandidates, rankingFspEvidence, normalizeRankingFspEvidence, rankingTraceFor } from '../search-ranking.mjs';

const candidate = (id, rank, score = 80, changes = {}) => ({
  person: { id, name: id, synthetic: true, achievements: [],
    confirmed: { specialization: 'Embedded', grade: 'Middle', score }, ...changes },
  rank, semanticScore: 0.8, testScore: score, reason: 'Похожие задачи в профиле: калибровка датчика.',
});
const ids = items => items.map(item => item.person.id);

test('a stronger test changes order for close, nonidentical semantic scores in one confirmed category', () => {
  const weaker = candidate('weaker-test', 6.2, 65), stronger = candidate('stronger-test', 6.05, 95);
  const source = [weaker, stronger], snapshot = structuredClone(source);
  const result = rankComparableCandidates(source);
  assert.deepEqual(ids(result), ['stronger-test', 'weaker-test']);
  assert.equal(result[0].rank, 6.05, 'Evidence changes ordering, never the neural score');
  assert.equal(result[0].semanticScore, stronger.semanticScore);
  assert.match(result[0].reason, /Учебный результат теста.*той же подтверждённой категории/u);
  assert.deepEqual(source, snapshot, 'The caller retains the original scores, order and explanations');
});

test('an achievement cannot overtake a materially more relevant candidate', () => {
  const relevant = candidate('relevant', 7, 60), weaker = candidate('weaker', 6, 100, { achievements: [{ title: 'Демо' }] });
  assert.deepEqual(ids(rankComparableCandidates([weaker, relevant])), ['relevant', 'weaker']);
});

test('anchor-bounded bands do not accumulate a chain of close neighbours into a wide swap', () => {
  const input = [candidate('first', 6.4, 60), candidate('second', 6.2, 80), candidate('third', 6, 100)];
  assert.deepEqual(ids(rankComparableCandidates(input)), ['second', 'first', 'third']);
});

test('evidence only exchanges existing slots of the same confirmed specialization and grade', () => {
  const input = [candidate('embedded-middle-weak', 6.4, 60),
    candidate('other-specialization', 6.35, 100, { confirmed: { specialization: 'Backend', grade: 'Middle', score: 100 } }),
    candidate('other-grade', 6.3, 100, { confirmed: { specialization: 'Embedded', grade: 'Senior', score: 100 } }),
    candidate('embedded-middle-strong', 6.2, 100)];
  const result = rankComparableCandidates(input);
  assert.deepEqual(ids(result), ['embedded-middle-strong', 'other-specialization', 'other-grade', 'embedded-middle-weak']);
  assert.deepEqual(result.map(item => item.person.confirmed.specialization + ':' + item.person.confirmed.grade),
    input.map(item => item.person.confirmed.specialization + ':' + item.person.confirmed.grade));
  for (const index of [1, 2]) {
    const { rankingTrace, ...unchanged } = result[index];
    assert.deepEqual(unchanged, input[index]);
    assert.equal(rankingTrace.comparableCount, 1);
    assert.equal(rankingTrace.changedWithinBand, false);
  }
});

test('self-reported category never groups an unconfirmed or different confirmed profile', () => {
  const input = [candidate('confirmed', 6.2, 60),
    candidate('unconfirmed', 6.1, 100, { specialization: 'Embedded', desiredGrade: 'Middle', confirmed: null }),
    candidate('another-confirmation', 6.05, 100, { specialization: 'Embedded', desiredGrade: 'Middle',
      confirmed: { specialization: 'Backend', grade: 'Senior', score: 100 } })];
  assert.deepEqual(ids(rankComparableCandidates(input)), ['confirmed', 'unconfirmed', 'another-confirmation']);
});

test('a demonstration FSP achievement can raise a comparable profile and clearly names its source', () => {
  const input = [candidate('no-achievement', 6.2, 90), candidate('demonstration-achievement', 6.1, 90,
    { achievements: [{ title: 'Демонстрационное соревнование ФСП', result: 'Вымышленный результат' }] })];
  const result = rankComparableCandidates(input);
  assert.deepEqual(ids(result), ['demonstration-achievement', 'no-achievement']);
  assert.match(result[0].reason, /Демонстрационные достижения ФСП.*учебный пример/u);
  assert.doesNotMatch(result[0].reason, /Подтверждённые достижения ФСП/u);
});

test('FSP has a bounded effect and cannot override a substantially stronger test', () => {
  const input = [candidate('weaker-with-medal', 6.2, 80, { achievements: [{ title: 'Демо' }] }),
    candidate('stronger-without-medal', 6.1, 95)];
  assert.deepEqual(ids(rankComparableCandidates(input)), ['stronger-without-medal', 'weaker-with-medal']);
  assert.equal(CATEGORY_RANKING_POLICY.fspTestPointBonus, 5);
});

test('real entered IDs, self-entered achievements and verification flags do not grant federation evidence', () => {
  const real = candidate('real-unverified', 6.1, 90, { synthetic: false, fspId: 'FSP-123',
    achievements: [{ title: 'ФСП', verified: true, source: 'fsp', result: 'Победитель' }] });
  assert.equal(rankingFspEvidence(real.person), null);
  const result = rankComparableCandidates([candidate('real-no-achievements', 6.2, 90, { synthetic: false }), real]);
  assert.deepEqual(ids(result), ['real-no-achievements', 'real-unverified']);
  assert.doesNotMatch(result.map(item => item.reason).join(' '), /достижения ФСП/u);
  assert.match(result[0].reason, /Подтверждённый сервером результат теста/u);
});

test('a trusted evidence resolver must use known source values appropriate to the actual profile', () => {
  const input = [candidate('first', 6.2, 90), candidate('second', 6.1, 90)];
  assert.deepEqual(ids(rankComparableCandidates(input, { fspEvidence: () => 'some-id' })), ['first', 'second']);
  assert.deepEqual(ids(rankComparableCandidates(input, { fspEvidence: () => 'verified-fsp' })), ['first', 'second']);
  const real = input.map(item => ({ ...item, person: { ...item.person, synthetic: false } }));
  assert.deepEqual(ids(rankComparableCandidates(real, { fspEvidence: () => 'synthetic-demo' })), ['first', 'second']);
});

for (const activeCount of ['1', 1.5, NaN, 0, -1, Infinity]) {
  test(`malformed or inactive FSP demo count ${String(activeCount)} never earns a ranking bonus`, () => {
    const person = { synthetic: false, achievements: [{ title: 'Демо' }],
      fspEvidence: { provider: 'fsp-demo', mode: 'demo', identityVerified: false, activeCount } };
    assert.equal(rankingFspEvidence(person), null);
    assert.equal(normalizeRankingFspEvidence(person, 'synthetic-demo'), null);
    const source = [candidate('first', 6.2, 90, { synthetic: false }), candidate('invalid-demo', 6.1, 90, person)];
    assert.deepEqual(ids(rankComparableCandidates(source)), ['first', 'invalid-demo']);
    assert.deepEqual(ids(rankComparableCandidates(source, { fspEvidence: () => 'synthetic-demo' })), ['first', 'invalid-demo']);
  });
}

test('demo provenance requires actual achievements and cannot be created by a resolver alone', () => {
  for (const achievements of [[], null, { length: 1 }]) {
    for (const synthetic of [false, true]) {
      const person = { synthetic, achievements,
        fspEvidence: { provider: 'fsp-demo', mode: 'demo', identityVerified: false, activeCount: 1 } };
      assert.equal(rankingFspEvidence(person), null);
      assert.equal(normalizeRankingFspEvidence(person, 'synthetic-demo'), null);
    }
  }
  const person = candidate('real', 6.1, 90, { synthetic: false }).person;
  for (const source of [true, 'some-id', { provider: 'verified-fsp' }, null]) {
    assert.equal(normalizeRankingFspEvidence(person, source), null);
  }
  assert.equal(normalizeRankingFspEvidence(null, 'verified-fsp'), null);
});

test('valid server-managed demo and trusted real verification retain their bounded bonus', () => {
  const demo = candidate('valid-demo', 6.1, 90, { synthetic: false, achievements: [{ title: 'Демо' }],
    fspEvidence: { provider: 'fsp-demo', mode: 'demo', identityVerified: false, activeCount: 1 } });
  assert.equal(rankingFspEvidence(demo.person), 'synthetic-demo');
  assert.deepEqual(ids(rankComparableCandidates([candidate('first', 6.2, 90, { synthetic: false }), demo])), ['valid-demo', 'first']);
  const verified = candidate('verified', 6.1, 90, { synthetic: false });
  assert.equal(normalizeRankingFspEvidence(verified.person, 'verified-fsp'), 'verified-fsp');
  const result = rankComparableCandidates([candidate('first', 6.2, 90, { synthetic: false }), verified],
    { fspEvidence: person => person.id === 'verified' ? 'verified-fsp' : null });
  assert.deepEqual(ids(result), ['verified', 'first']);
  assert.match(result[0].reason, /Подтверждённые достижения ФСП/u);
});

test('nearest results cannot be promoted across the strong-match boundary', () => {
  const strong = candidate('strong-match', 6.2, 60), nearest = { ...candidate('nearest', 6.1, 100), approximate: true };
  assert.deepEqual(ids(rankComparableCandidates([nearest, strong])), ['strong-match', 'nearest']);
});

test('cosine-only ordering uses its smaller comparison interval', () => {
  assert.deepEqual(ids(rankComparableCandidates([candidate('first', 0.92, 60), candidate('close', 0.91, 95),
    candidate('distant', 0.85, 100)], { scoreKind: 'cosine' })), ['close', 'first', 'distant']);
});

test('comparison boundaries tolerate floating-point round-off without expanding the relevance band', () => {
  assert.deepEqual(ids(rankComparableCandidates([candidate('first', 0.9, 60), candidate('boundary', 0.88, 95)],
    { scoreKind: 'cosine' })), ['boundary', 'first']);
  assert.deepEqual(ids(rankComparableCandidates([candidate('first', 0.9, 60), candidate('outside', 0.879, 95)],
    { scoreKind: 'cosine' })), ['first', 'outside']);
});

test('invalid confirmation scores cannot enter evidence ordering and equal evidence keeps semantic precedence', () => {
  const input = [candidate('first', 6.2, 90), candidate('second', 6.1, 90), candidate('invalid-test', 6.05, 101)];
  assert.deepEqual(ids(rankComparableCandidates(input)), ['first', 'second', 'invalid-test']);
  assert.throws(() => rankComparableCandidates(input, { scoreKind: 'percentage' }), TypeError);
  assert.throws(() => rankComparableCandidates(input, { fspEvidence: true }), TypeError);
});

test('reranking only permutes the admitted input and handles empty and singleton lists', () => {
  assert.deepEqual(rankComparableCandidates([]), []);
  const one = candidate('one', 6.2);
  const [single] = rankComparableCandidates([one]);
  const { rankingTrace, ...unchanged } = single;
  assert.deepEqual(unchanged, one);
  assert.equal(rankingTrace.comparableCount, 1);
  const input = Array.from({ length: 150 }, (_, index) => candidate(`profile-${index}`, 15 - index / 10, index % 101));
  const result = rankComparableCandidates(input);
  assert.equal(result.length, input.length);
  assert.deepEqual(ids(result).sort(), ids(input).sort());
});

test('execution traces record each actual comparison and resolve provenance once per admitted profile', () => {
  const source = [candidate('first', 6.2, 90), candidate('medal', 6.1, 90, { achievements: [{ title: 'Демо' }] }),
    candidate('distant', 5, 100), candidate('unconfirmed', 4.9, 100, { confirmed: null })];
  const snapshot = structuredClone(source), calls = [];
  const result = rankComparableCandidates(source, { fspEvidence: person => { calls.push(person.id); return rankingFspEvidence(person); } });
  assert.deepEqual(calls, ['first', 'medal', 'distant', 'unconfirmed']);
  assert.deepEqual(ids(result), ['medal', 'first', 'distant', 'unconfirmed']);
  for (const [index, item] of result.entries()) {
    assert.equal(rankingTraceFor(item, 'logit'), item.rankingTrace);
    assert.equal(item.rankingTrace.policy, CATEGORY_RANKING_POLICY.version);
    assert.equal(item.rankingTrace.scoreKind, 'logit');
    assert.equal(item.rankingTrace.comparableCount, [2, 2, 1, 0][index]);
    assert.equal(item.rankingTrace.changedWithinBand, index < 2);
    assert.equal(item.rankingTrace.fspSource, index === 0 ? 'synthetic-demo' : null);
    assert(Object.isFrozen(item.rankingTrace));
  }
  assert.deepEqual(source, snapshot);
});

test('traces cannot be copied, fabricated or reused for a different score kind', () => {
  const [ranked] = rankComparableCandidates([candidate('one', 0.9)], { scoreKind: 'cosine' });
  assert.equal(rankingTraceFor(ranked, 'logit'), null);
  assert.equal(rankingTraceFor({ ...ranked }, 'cosine'), null);
  assert.equal(rankingTraceFor({ rankingTrace: { ...ranked.rankingTrace } }, 'cosine'), null);
  const [reranked] = rankComparableCandidates([ranked]);
  assert.notEqual(reranked.rankingTrace, ranked.rankingTrace);
  assert.equal(rankingTraceFor(reranked, 'logit'), reranked.rankingTrace);
  assert.equal(rankingTraceFor(reranked, 'cosine'), null);
  assert.equal(ranked.rankingTrace.scoreKind, 'cosine');
});
