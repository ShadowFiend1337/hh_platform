import test from 'node:test';
import assert from 'node:assert/strict';
import { calibrate } from '../calibrate.mjs';

test('paired metrics are computed per program; synthetic fixtures test arithmetic only', () => {
  const result = calibrate({ bankVersion: 'fixture', participants: [
    { id: 'a', program: 'Frontend/Middle', first: { id: 'a1', score: 67 }, second: { id: 'a2', score: 83 } },
    { id: 'b', program: 'Frontend/Middle', first: { id: 'b1', score: 83 }, second: { id: 'b2', score: 100 } },
    { id: 'c', program: 'Backend/Junior', first: { id: 'c1', score: 50 }, second: { id: 'c2', score: 50 } },
  ] });
  assert.equal(result.programs[0].pairs, 2);
  assert.equal(result.programs[0].confirmationAgreement, 0.5);
  assert.equal(result.programs[0].meanDifference, 16.5);
  assert.equal(result.programs[0].medianAbsoluteDifference, 16.5);
  assert.equal(result.programs[1].confirmationAgreement, 1);
});

test('calibration rejects empty data, duplicate participants and reused attempts', () => {
  assert.throws(() => calibrate({ bankVersion: 'fixture', participants: [] }));
  const row = { id: 'a', program: 'Frontend/Junior', first: { id: 'x', score: 100 }, second: { id: 'y', score: 67 } };
  assert.throws(() => calibrate({ bankVersion: 'fixture', participants: [row, row] }));
  assert.throws(() => calibrate({ bankVersion: 'fixture', participants: [{ ...row, second: { id: 'x', score: 100 } }] }));
});
