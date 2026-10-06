import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DirectoryService, interpretQuery } from '../directory.mjs';
import { semanticDocument } from '../directory-store.mjs';
import { createAssessmentServer } from '../server.mjs';
import { createInitialState } from '../../frontend/src/model.ts';

const profile = (id, changes = {}) => ({ id, name: id, professionalRole: 'Инженер электроники',
  specialization: 'Embedded', desiredGrade: 'Middle', confirmed: { specialization: 'Embedded', grade: 'Middle', score: 90, date: '2026-10-06T00:00:00Z' },
  visible: true, consent: true, synthetic: true, bio: 'Измерения и диагностика плат', stack: ['STM32', 'C++'],
  city: 'Москва', industry: 'ИТ', format: 'Гибрид', employmentType: 'Полная занятость',
  experienceMonths: 40, salaryFrom: 180000, salaryTo: 220000, languageCodes: ['ru', 'en'],
  portfolio: 'https://example.com/portfolio', email: 'private@example.com', phone: '+79990000000',
  achievements: [], ...changes });

class FakeEncoder {
  info = { status: 'ready', name: 'Test encoder', version: 'test-v1', dimension: 2, trained: true, threshold: 0.35 };
  calls = [];
  async start() { return this.info; }
  async encode(texts) { this.calls.push(texts); return texts.map(text => /неподходящий|пустыня/u.test(text) ? [0, 1] : [1, 0]); }
  close() {}
}
function service(t, seeds, encoder = new FakeEncoder()) {
  const value = new DirectoryService(':memory:', { seeds, encoder });
  t.after(() => value.close()); return value;
}

test('hard salary cap applies to minimum expectation and excludes unknown salary', async t => {
  const value = service(t, [profile('fits'), profile('expensive', { salaryFrom: 200001 }), profile('unknown', { salaryFrom: null })]);
  const result = await value.search('', { salaryMax: 200000 });
  assert.deepEqual(result.items.map(item => item.person.id), ['fits']);
  assert.match(result.items[0].reason, /180/u);
  assert.equal(value.encoder.calls.length, 0, 'filter-only requests never initialize ML');
});

test('combined filters require every skill and known experience, not unrelated matches', async t => {
  const value = service(t, [profile('fits'), profile('wrong-city', { city: 'Казань' }), profile('no-language', { languageCodes: ['ru'] }),
    profile('no-skill', { stack: ['STM32'] }), profile('unknown-experience', { experienceMonths: null }),
    profile('no-portfolio', { portfolio: '' }), profile('low-score', { confirmed: { specialization: 'Embedded', grade: 'Middle', score: 50 } })]);
  const result = await value.search('', { specialization: 'Embedded', grade: 'Middle', city: 'Москва', industry: 'ИТ', format: 'Гибрид',
    employmentType: 'Полная занятость', stack: ['stm32', 'C++'], language: 'en', experienceMin: 36, experienceMax: 60, hasPortfolio: true, minScore: 80 });
  assert.deepEqual(result.items.map(item => item.person.id), ['fits']);
});

test('withheld and unverifiable profiles never enter results or filter options', async t => {
  const value = service(t, [profile('public'), profile('hidden', { visible: false, city: 'Скрытый город' }),
    profile('revoked', { consent: false, city: 'Закрытый город' })]);
  value.store.upsert(profile('unverified', { city: 'Непроверенный город' }), 'owner', false);
  const result = await value.search('помощь с платой');
  assert.deepEqual(result.items.map(item => item.person.id), ['public']);
  assert.deepEqual(value.options().cities, ['Москва']);
});

test('professional vectors and public cards omit private contacts', async t => {
  const person = profile('person', { bio: 'Платы. Пишите private@example.com или +7 (999) 111-22-33', workHistory: 'Инженер' });
  assert.doesNotMatch(semanticDocument(person), /private@example|999/u);
  const value = service(t, [person]);
  const result = await value.search('платы');
  assert.equal(result.items[0].person.email, ''); assert.equal(result.items[0].person.phone, '');
  assert.doesNotMatch(JSON.stringify(result.items), /private@example|999/u);
});

test('semantic cutoff removes unrelated documents without a keyword fallback', async t => {
  const value = service(t, [profile('related'), profile('other', { bio: 'неподходящий опыт', professionalRole: 'Другая роль' })]);
  assert.deepEqual((await value.search('понятно объяснит схемы')).items.map(item => item.person.id), ['related']);
  assert.equal((await value.search('пустыня')).items[0].person.id, 'other');
  const empty = service(t, [profile('only-related')]);
  assert.equal((await empty.search('пустыня')).total, 0);
});

test('model failure is explicit while exact filters remain usable', async t => {
  const encoder = new FakeEncoder(); encoder.start = async () => { throw new Error('missing weights'); };
  const value = service(t, [profile('person')], encoder);
  await assert.rejects(value.search('инженер электроники'), error => error.status === 503);
  assert.equal((await value.search('', { salaryMax: 200000 })).total, 1);
});

test('vectors persist as compact Float32 and refresh only after professional content or model changes', async t => {
  const value = service(t, [profile('person')]);
  await value.search('схемы');
  assert.equal(value.store.vectors().get('person').vector.byteLength, 8);
  const count = value.encoder.calls.length;
  await value.search('схемы'); assert.equal(value.encoder.calls.length, count);
  value.store.upsert(profile('person', { salaryFrom: 100000 }), null, true);
  await value.search('схемы'); assert.equal(value.encoder.calls.length, count, 'salary is a filter, not an embedding feature');
  value.store.upsert(profile('person', { bio: 'Другая задача со схемами' }), null, true);
  await value.search('схемы'); assert.equal(value.encoder.calls.length, count + 1);
  value.encoder.info.version = 'test-v2';
  await value.search('схемы'); assert.equal(value.encoder.calls.length, count + 3);
});

test('consent changes during inference cannot leak a previously selected profile', async t => {
  const encoder = new FakeEncoder(); const value = service(t, [profile('person')], encoder);
  const original = encoder.encode.bind(encoder);
  encoder.encode = async texts => { const result = await original(texts); value.store.upsert(profile('person', { consent: false }), null, true); return result; };
  assert.equal((await value.search('схемы')).total, 0);
});

test('pagination returns stable disjoint pages and correct total', async t => {
  const value = service(t, Array.from({ length: 73 }, (_, index) => profile(`person-${String(index).padStart(3, '0')}`)));
  const first = await value.search('', {}, { limit: 30 });
  const second = await value.search('', {}, { limit: 30, offset: 30 });
  const last = await value.search('', {}, { limit: 30, offset: 60 });
  assert.equal(first.total, 73); assert.equal(last.items.length, 13);
  assert.equal(new Set([...first.items, ...second.items, ...last.items].map(item => item.person.id)).size, 73);
});

test('malformed filters and SQL-like values cannot broaden results', async t => {
  const value = service(t, [profile('person')]);
  for (const filters of [{ unknown: true }, { salaryMax: '200000' }, { minScore: 101 }, { salaryMax: 10000001 }, { experienceMin: 50, experienceMax: 1 }, { stack: [12] }, { fsp: 'true' }]) {
    await assert.rejects(value.search('', filters), error => error.status === 400);
  }
  assert.equal((await value.search('', { city: "' OR 1=1 --" })).total, 0);
  await assert.rejects(value.search('x', {}, { limit: 100 }), error => error.status === 400);
});

test('recognized salary cap combines with a stricter manually selected budget', async t => {
  const value = service(t, [profile('fits', { salaryFrom: 150000 }), profile('too-high')]);
  const result = await value.search('разобраться со схемами с зарплатой до 200 тысяч', { salaryMax: 160000 });
  assert.equal(result.interpreted.salaryMax, 200000);
  assert.deepEqual(result.items.map(item => item.person.id), ['fits']);
  for (const text of ['до 200 тысяч долларов', 'до 200000 запросов', 'до 200000 ₽ в год', 'до 999999999 рублей']) {
    assert.equal(interpretQuery(text, { cities: [] }).salaryMax, undefined, text);
  }
});

test('candidate rows, normalized skills and vectors survive SQLite reopening', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'predel-directory-')); const path = join(temporary, 'state.sqlite');
  let value;
  try {
    value = new DirectoryService(path, { seeds: [profile('persistent')], encoder: new FakeEncoder() });
    await value.search('схема'); value.close();
    value = new DirectoryService(path, { seeds: [], encoder: new FakeEncoder() });
    assert.equal((await value.search('схема', { stack: ['STM32'], language: 'en' })).total, 1);
    assert.equal(value.encoder.calls.length, 1, 'only the query needs encoding after reopening');
  } finally { value?.close(); rmSync(temporary, { recursive: true, force: true }); }
});

test('HTTP platform snapshots are session-owned, CAS-checked and deletable', async t => {
  const { server, directory } = createAssessmentServer({ dbPath: ':memory:' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const initial = await fetch(base + '/api/platform/state');
  const cookie = initial.headers.get('set-cookie').split(';')[0];
  assert.deepEqual(await initial.json(), { state: null, revision: 0, directoryPeople: [] });
  const state = createInitialState();
  state.profile = { ...state.profile, name: 'Тестовый кандидат', email: 'test@example.com', professionalRole: 'Инженер', stack: ['C++'], consent: true, visible: true };
  const put = () => fetch(base + '/api/platform/state', { method: 'PUT', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ state, baseRevision: 0 }) });
  const saved = await put(); assert.equal(saved.status, 200); assert.equal((await saved.json()).revision, 1);
  assert.equal((await put()).status, 409);
  assert.equal((await (await fetch(base + '/api/platform/state')).json()).state, null, 'another browser cannot read private state');
  assert.equal(directory.store.all().some(row => row.owner), false, 'a self-declared grade never publishes a real profile');
  assert.equal((await fetch(base + '/api/directory/candidate-anna/contacts', { headers: { cookie } })).status, 200);
  assert.equal((await fetch(base + '/api/platform/state', { method: 'DELETE', headers: { cookie } })).status, 200);
  assert.equal((await (await fetch(base + '/api/platform/state', { headers: { cookie } })).json()).state, null);
});
