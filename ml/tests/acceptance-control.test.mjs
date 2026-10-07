import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertNovelLiterals, buildControl, judgeCase } from '../acceptance-control.mjs';

const data = JSON.parse(await readFile(new URL('../acceptance-control.json', import.meta.url), 'utf8'));

test('authored control labels produce only fictional, unrelated-to-account profiles and same-role contrasts', () => {
  const result = buildControl(data);
  assert.ok(result.profiles.every(person => person.synthetic === true && !person.email && !person.phone));
  for (const family of data.families) {
    const profiles = result.profiles.filter(person => person.id.startsWith(family.id + '-'));
    assert.equal(profiles.length, 2);
    assert.ok(profiles.every(person => person.specialization === family.specialization));
    assert.ok(profiles.every(person => person.confirmed.grade === 'Middle' && person.confirmed.synthetic));
    assert.ok(result.cases.find(item => item.id === family.id)?.expected.relevant.includes(profiles[0].id));
  }
  const incorrect = structuredClone(data); incorrect.families[0].id = incorrect.families[1].id;
  assert.throws(() => buildControl(incorrect));
});

test('novelty gate rejects copied queries and passages despite capitalization or whitespace', () => {
  const control = buildControl(data);
  assert.doesNotThrow(() => assertNovelLiterals(data, control, ['An entirely different authored sentence'], new Set()));
  assert.throws(() => assertNovelLiterals(data, control, [control.cases[0].query.toUpperCase().replaceAll(' ', '\n ')], new Set()));
  assert.throws(() => assertNovelLiterals(data, control, [control.profiles[0].bio], new Set()));
  assert.throws(() => assertNovelLiterals(data, control, [], new Set([data.families[0].id])));
});

test('fixed reference judgments expose missing positives and same-profession false first results', () => {
  const item = buildControl(data).cases[0];
  const response = ids => ({ items: ids.map(id => ({ person: { id } })), total: ids.length });
  assert.equal(judgeCase(item, response(item.expected.relevant)).status, 'accepted');
  const result = judgeCase(item, response([item.expected.forbiddenFirst[0], item.expected.relevant[0]]));
  assert.ok(result.findings.includes('first-profile-does-not-match-authored-reference'));
  assert.ok(result.findings.includes('same-profession-near-negative-returned-first'));
  assert.ok(judgeCase(item, response([])).findings.includes('authored-relevant-profile-not-in-top'));
});

test('budget validation applies to every result, exact parsing and stricter manual filters', () => {
  const item = buildControl(data).cases.find(value => value.id === 'control-budget-manual-stricter');
  const result = judgeCase(item, { items: [{ person: { id: item.expected.forbiddenEverywhere[0], salaryFrom: 165000,
    confirmed: { specialization: 'Mobile', grade: 'Middle' } } }], total: 1,
    effectiveFilters: { salaryMax: 200000 }, interpreted: { salaryMax: 200000 } });
  assert.ok(result.findings.includes('hard-exclusion-breached'));
  assert.ok(result.findings.includes('effective-budget-not-preserved'));
  assert.ok(result.findings.includes('over-budget-profile-returned'));
});

test('unknown needs require empty results rather than a plausible but unrelated profession', () => {
  const item = buildControl(data).cases.find(value => value.id === 'control-unknown-ritual');
  assert.equal(judgeCase(item, { items: [], total: 0 }).status, 'accepted');
  assert.equal(judgeCase(item, { items: [{ person: { id: 'unrelated' } }], total: 1 }).status, 'finding');
});
