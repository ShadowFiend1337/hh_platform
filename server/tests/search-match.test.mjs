import assert from 'node:assert/strict';
import test from 'node:test';
import { annotateMatches } from '../search-match.mjs';

const person = (overrides = {}) => ({ specialization: 'Backend', stack: ['Python', 'PostgreSQL'],
  confirmed: { specialization: 'Backend', grade: 'Middle', score: 90 }, ...overrides });
const item = (rank, overrides = {}, extra = {}) => ({ rank, person: person(overrides), explanation: { fsp: { status: 'none' } }, ...extra });

test('semantic matches spread from the admission floor by the executed rank', () => {
  const [best, worst, nearest] = annotateMatches([item(3), item(1), item(0.5, {}, { approximate: true })], { semantic: true, filters: {} });
  const tasks = value => value.match.parts.find(part => part.key === 'tasks');
  assert.equal(tasks(best).value, 100); assert.equal(tasks(worst).value, 64); assert.ok(tasks(nearest).value <= 50);
  assert.ok(best.match.percent > worst.match.percent && worst.match.percent > nearest.match.percent);
  assert.equal(best.match.parts.reduce((sum, part) => sum + part.weight, 0), 100);
});

test('filters-only search scores category, requested stack, test and FSP without a tasks component', () => {
  const [confirmed, unconfirmed] = annotateMatches([item(90), item(0, { confirmed: null })],
    { semantic: false, filters: { specialization: 'Backend', grade: 'Middle', stack: ['Python', 'Docker'] } });
  assert.equal(confirmed.match.parts.some(part => part.key === 'tasks'), false);
  assert.equal(confirmed.match.parts.find(part => part.key === 'stack').value, 50);
  assert.ok(confirmed.match.percent > unconfirmed.match.percent, 'A confirmed category outranks a self-reported grade');
  const [withFsp] = annotateMatches([{ ...item(90), explanation: { fsp: { status: 'verified' } } }], { filters: {} });
  const [withoutFsp] = annotateMatches([item(90)], { filters: {} });
  assert.ok(withFsp.match.percent > withoutFsp.match.percent);
});

test('another specialization or grade lowers the category fit', () => {
  const [exact, otherGrade, otherSpecialization] = annotateMatches([item(1), item(1, { confirmed: { specialization: 'Backend', grade: 'Junior', score: 90 } }),
    item(1, { specialization: 'Frontend', confirmed: { specialization: 'Frontend', grade: 'Middle', score: 90 } })],
  { filters: { specialization: 'Backend', grade: 'Middle' } });
  assert.ok(exact.match.percent > otherGrade.match.percent && otherGrade.match.percent > otherSpecialization.match.percent);
});
