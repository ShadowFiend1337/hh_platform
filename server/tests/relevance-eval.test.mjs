import test from 'node:test';
import assert from 'node:assert/strict';
import { isSpecialization } from '../../shared/catalog.ts';
import { labels, seeds, grade, metrics, pairedDifference, orderEffect, K } from '../../ml/relevance-eval.mjs';

const catalogue = new Map(seeds.map(person => [person.id, person]));

test('the relevance set has 40–60 needs, each with a labelled exact match in the catalogue', () => {
  assert.ok(labels.needs.length >= 40 && labels.needs.length <= 60);
  assert.equal(new Set(labels.needs.map(need => need.id)).size, labels.needs.length);
  for (const need of labels.needs) {
    assert.ok(need.query.trim(), need.id);
    assert.ok([...need.specialization, ...need.related].every(isSpecialization), need.id);
    assert.ok(need.exact.length > 0, need.id);
    for (const id of [...need.exact, ...Object.keys(need.overrides || {})]) assert.ok(catalogue.has(id), `${need.id}: ${id}`);
    assert.ok(need.exact.every(id => grade(need, catalogue.get(id)) === 3), need.id);
  }
});

test('the rubric grades direction, stack and adjacency as documented', () => {
  const need = { exact: ['demo-backend-1'], specialization: ['Backend'], related: ['Fullstack'], stackAny: ['Go'], overrides: { 'demo-qa-4': 1 } };
  assert.equal(grade(need, catalogue.get('demo-backend-1')), 3);
  assert.equal(grade(need, catalogue.get('demo-backend-3')), 2, 'Same direction with the named stack');
  assert.equal(grade(need, catalogue.get('demo-backend-2')), 1, 'Same direction without the named stack');
  assert.equal(grade(need, catalogue.get('demo-fullstack-1')), 1, 'Adjacent direction');
  assert.equal(grade(need, catalogue.get('demo-qa-4')), 1, 'Manual override');
  assert.equal(grade(need, catalogue.get('demo-ml-1')), 0);
});

test('ranking metrics reward relevant results high in a fixed top-K', () => {
  const need = { exact: ['demo-frontend-1'], specialization: ['Frontend'], related: ['Fullstack'] };
  const ideal = [...seeds].sort((a, b) => grade(need, b) - grade(need, a)).map(person => person.id);
  assert.equal(metrics(need, ideal).ndcg10, 1);
  assert.equal(metrics(need, ideal).p10, 1);
  const late = metrics(need, ['demo-backend-1', 'demo-frontend-1']);
  assert.equal(late.p5, 1 / 5); assert.equal(late.p10, 1 / K); assert.equal(late.mrr10, 1 / 2); assert.equal(late.shown, 2);
  assert.ok(late.ndcg10 > 0 && late.ndcg10 < 1);
  assert.deepEqual(metrics(need, []), { p5: 0, p10: 0, ndcg10: 0, mrr10: 0, empty: 1, shown: 0 });
});

test('paired differences compare the same needs and keep a deterministic interval', () => {
  const row = (id, value) => ({ id, p5: value, p10: value, ndcg10: value, mrr10: value, empty: 0, shown: 10 });
  const after = [row('a', 1), row('b', 0.5)], before = [row('a', 0.5), row('b', 0.5), row('c', 0)];
  const difference = pairedDifference(after, before);
  assert.equal(difference.ndcg10.mean, 0.25);
  assert.ok(difference.ndcg10.ci[0] >= 0 && difference.ndcg10.ci[1] <= 0.5);
  assert.deepEqual(pairedDifference(after, before), difference);
});

test('order effect counts needs and positions whose top-K order changed', () => {
  const reference = [{ id: 'a', ids: ['x', 'y', 'z'] }, { id: 'b', ids: ['x'] }];
  assert.deepEqual(orderEffect([{ id: 'a', ids: ['y', 'x', 'z'] }, { id: 'b', ids: ['x'] }], reference), { changedNeeds: 0.5, changedPositions: 1 });
  assert.deepEqual(orderEffect(reference, reference), { changedNeeds: 0, changedPositions: 0 });
});
