import test from 'node:test';
import assert from 'node:assert/strict';
import { explainSearchResults } from '../search-explanations.mjs';
import { rankComparableCandidates } from '../search-ranking.mjs';

const candidate = (id, rank, score = 80, changes = {}) => ({
  person: { id, name: id, synthetic: false, specialization: 'Backend', desiredGrade: 'Senior',
    confirmed: { specialization: 'Backend', grade: 'Middle', score }, achievements: [],
    stack: ['Python'], format: 'Удалённо', city: 'Москва', salaryFrom: 150000, ...changes },
  rank, semanticScore: 0.8, sourceId: id, evidenceKind: 'professional',
  evidenceText: 'Разработал сервис обработки заказов и очереди сообщений.',
});

test('explanations preserve admitted order, raw scores and caller objects', () => {
  const ranked = rankComparableCandidates([candidate('better-match', 6.2, 60), candidate('better-test', 6.1, 95)]);
  const snapshot = structuredClone(ranked);
  const result = explainSearchResults(ranked, { semantic: true });
  assert.deepEqual(result.map(item => [item.person.id, item.rank, item.semanticScore]), ranked.map(item => [item.person.id, item.rank, item.semanticScore]));
  assert.deepEqual(ranked, snapshot);
  assert.equal(result[0].explanation.ordering.mode, 'category-evidence-band');
  assert.equal(result[0].explanation.ordering.changedWithinBand, true);
  assert.match(result[0].reason, /Положение изменилось/u);
});

test('singletons and distant same-category profiles do not claim a test or FSP ordering contribution', () => {
  const source = [candidate('first', 7), candidate('second', 6, 100, { synthetic: true, achievements: [{ title: 'Демо' }] })];
  const result = explainSearchResults(rankComparableCandidates(source), { semantic: true });
  assert.equal(result[1].explanation.test.contribution, 'none');
  assert.equal(result[1].explanation.fsp.status, 'demo');
  assert.equal(result[1].explanation.fsp.contribution, 'none');
  assert.equal(result[1].explanation.ordering.mode, 'semantic-only');
  assert.match(result[1].explanation.fsp.explanation, /не меняют порядок/u);
});

test('band explanations respect anchors, categories and the nearest-match boundary', () => {
  const source = [candidate('first', 6.4, 60), candidate('second', 6.2, 80), candidate('third', 6, 100),
    candidate('different-category', 6.3, 90, { confirmed: { specialization: 'Frontend', grade: 'Middle', score: 90 } }),
    { ...candidate('nearest', 6.15, 100), approximate: true }];
  const result = explainSearchResults(rankComparableCandidates(source), { semantic: true });
  const find = id => result.find(item => item.person.id === id).explanation;
  assert.equal(find('first').ordering.comparableCount, 2);
  assert.equal(find('third').ordering.comparableCount, 1);
  assert.equal(find('different-category').ordering.comparableCount, 1);
  assert.equal(find('nearest').ordering.comparableCount, 1);
  assert.equal(find('nearest').relevance, 'nearest');
});

test('cosine explanations use the actual smaller comparison interval', () => {
  const result = explainSearchResults([candidate('first', 0.9), candidate('close', 0.89), candidate('outside', 0.87)],
    { semantic: true, scoreKind: 'cosine' });
  assert.equal(result[0].explanation.ordering.comparableCount, 2);
  assert.equal(result[2].explanation.test.contribution, 'none');
});

test('the displayed category is confirmed, not the desired grade', () => {
  const result = explainSearchResults([candidate('real', 6.2)], { semantic: true });
  assert.equal(result[0].explanation.category.grade, 'Middle');
  assert.equal(result[0].explanation.category.status, 'confirmed');
  const unconfirmed = explainSearchResults([candidate('new', 6, 100, { confirmed: null })], { semantic: true, verifiedFirst: true });
  assert.equal(unconfirmed[0].explanation.category.grade, null);
  assert.equal(unconfirmed[0].explanation.test.score, null);
  assert.equal(unconfirmed[0].explanation.ordering.mode, 'unconfirmed');
  assert.match(unconfirmed[0].reason, /после кандидатов с подтверждённой/u);
  assert.doesNotMatch(unconfirmed[0].reason, /Senior/u);
});

test('untrusted achievement flags and IDs are never called verified or credited', () => {
  const source = [candidate('first', 6.2), candidate('untrusted', 6.1, 80, { fspId: 'FSP-PRIVATE-ID',
    achievements: [{ title: 'ФСП', verified: true, source: 'fsp' }] })];
  const result = explainSearchResults(source, { semantic: true });
  assert.equal(result[1].explanation.fsp.status, 'unverified');
  assert.equal(result[1].explanation.fsp.contribution, 'none');
  assert.doesNotMatch(JSON.stringify(result[1].explanation), /FSP-PRIVATE-ID/u);
  assert.doesNotMatch(result[1].reason, /Достижения ФСП подтверждены/u);
  const spoofed = explainSearchResults(source, { semantic: true, fspEvidence: () => true });
  assert.equal(spoofed[1].explanation.fsp.status, 'unverified');
});

test('a trusted resolver names verified provenance without exporting its external identifier', () => {
  const result = explainSearchResults([candidate('first', 6.2), candidate('verified', 6.1)],
    { semantic: true, fspEvidence: person => person.id === 'verified' ? 'verified-fsp' : null });
  assert.equal(result[1].explanation.fsp.status, 'verified');
  assert.equal(result[1].explanation.fsp.contribution, 'comparison');
  const invalidForDemo = explainSearchResults([candidate('demo', 6, 80, { synthetic: true })],
    { fspEvidence: () => 'verified-fsp' });
  assert.equal(invalidForDemo[0].explanation.fsp.status, 'none');
});

test('server-managed demo achievements on a real profile retain explicit demonstration provenance', () => {
  const person = { fspEvidence: { provider: 'fsp-demo', mode: 'demo', identityVerified: false,
    activeCount: 1, revokedCount: 0, lastSyncedAt: '2026-10-08T10:00:00Z' }, achievements: [{ title: 'Демо' }] };
  const source = [candidate('first', 6.2), candidate('real-demo-link', 6.1, 80, person)];
  const result = explainSearchResults(source, { semantic: true,
    fspEvidence: value => value.id === 'real-demo-link' ? 'synthetic-demo' : null });
  const explanation = result[1].explanation;
  assert.equal(explanation.category.status, 'confirmed');
  assert.equal(explanation.fsp.status, 'demo');
  assert.equal(explanation.fsp.contribution, 'comparison');
  assert.match(explanation.fsp.explanation, /демонстрационного провайдера; личность не подтверждена/u);
  assert.doesNotMatch(explanation.fsp.explanation, /подтверждены подключённым провайдером/u);
  source[1].person.fspEvidence.activeCount = 0;
  assert.equal(explainSearchResults(source, { semantic: true, fspEvidence: () => 'synthetic-demo' })[1].explanation.fsp.status, 'unverified');
});

for (const activeCount of ['1', 1.5, NaN, 0, -1, Infinity]) {
  test(`malformed or inactive FSP demo count ${String(activeCount)} has matching ranking and explanation`, () => {
    const source = [candidate('first', 6.2, 90), candidate('invalid-demo', 6.1, 90, {
      achievements: [{ title: 'Демо' }],
      fspEvidence: { provider: 'fsp-demo', mode: 'demo', identityVerified: false, activeCount },
    })];
    for (const resolver of [undefined, () => 'synthetic-demo']) {
      const options = resolver ? { fspEvidence: resolver } : {};
      const result = explainSearchResults(rankComparableCandidates(source, options), { semantic: true, ...options });
      assert.deepEqual(result.map(item => item.person.id), ['first', 'invalid-demo']);
      assert.equal(result[1].explanation.fsp.status, 'unverified');
      assert.equal(result[1].explanation.fsp.contribution, 'none');
      assert.match(result[1].explanation.fsp.explanation, /не дают прибавку/u);
    }
  });
}

test('empty demo achievements and unknown resolver sources cannot claim a public contribution', () => {
  for (const synthetic of [false, true]) {
    const source = [candidate('first', 6.2), candidate('empty-demo', 6.1, 80, { synthetic,
      achievements: [], fspEvidence: { provider: 'fsp-demo', mode: 'demo', identityVerified: false, activeCount: 1 } })];
    const result = explainSearchResults(rankComparableCandidates(source, { fspEvidence: () => 'synthetic-demo' }),
      { semantic: true, fspEvidence: () => 'synthetic-demo' });
    assert.deepEqual(result.map(item => item.person.id), ['first', 'empty-demo']);
    assert.equal(result[1].explanation.fsp.status, 'none');
    assert.equal(result[1].explanation.fsp.contribution, 'none');
  }
  const person = candidate('unknown-source', 6.1, 80, { achievements: [{ title: 'Заявленное достижение' }] });
  for (const source of [true, 'some-id', { provider: 'verified-fsp' }]) {
    const explanation = explainSearchResults([person], { fspEvidence: () => source })[0].explanation.fsp;
    assert.equal(explanation.status, 'unverified');
    assert.equal(explanation.contribution, 'none');
  }
});

test('conditions cite actual matches and never pretend unknown or mismatched fields match', () => {
  const result = explainSearchResults([candidate('match', 6.2)], { filters: { stack: ['python', 'Java'],
    city: 'Казань', format: 'Удалённо', salaryMax: 160000, language: 'en', experienceMin: 12, minScore: 70 } });
  const conditions = result[0].explanation.conditions;
  assert.deepEqual(conditions.map(item => item.key), ['format', 'stack', 'salaryMax', 'minScore']);
  assert.equal(conditions.find(item => item.key === 'stack').value, 'python');
  assert.equal(result[0].explanation.test.contribution, 'filter-order');
  const unknownSalary = explainSearchResults([candidate('unknown', 6, 80, { salaryFrom: null })], { filters: { salaryMax: 160000 } });
  assert.equal(unknownSalary[0].explanation.conditions.length, 0);
});

test('the winning public evidence is bounded and contacts are scrubbed; missing evidence is disclosed', () => {
  const source = candidate('public', 6.2);
  source.evidenceText = 'Сервис заказов. private@example.com +7 (999) 111-22-33 ' + 'задача '.repeat(100);
  source.evidenceKind = 'competencies';
  const result = explainSearchResults([source], { semantic: true });
  const evidence = result[0].explanation.evidence;
  assert.equal(evidence.kind, 'competencies');
  assert.ok(evidence.text.length <= 350);
  assert.doesNotMatch(result[0].reason, /private@example|999/u);
  delete source.evidenceText;
  assert.equal(explainSearchResults([source], { semantic: true })[0].explanation.evidence.kind, 'unavailable');
});

test('filter-only FSP contribution is described as a tie breaker', () => {
  const source = candidate('demo', 6, 80, { synthetic: true, achievements: [{ title: 'Демо' }] });
  const explanation = explainSearchResults([source], { filters: { fsp: true } })[0].explanation;
  assert.equal(explanation.fsp.status, 'demo');
  assert.equal(explanation.fsp.contribution, 'filter-tiebreak');
  assert.match(explanation.fsp.explanation, /при равном результате теста/u);
  assert.equal(explanation.conditions[0].key, 'fsp');
});
