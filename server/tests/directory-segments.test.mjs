import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DirectoryService } from '../directory.mjs';
import { directoryCandidates } from '../directory-seed.mjs';
import { DirectoryStore, cosine, semanticMatch, semanticDocument, semanticSegments, parseSemanticSegments,
  publicCandidate, textHash, PROFILE_INDEX_POLICY } from '../directory-store.mjs';

const dimension = 312;
const axis = (index, value = 1) => Array.from({ length: dimension }, (_, i) => i === index ? value : 0);
const bytes = vectors => {
  const flat = vectors.flat(), buffer = Buffer.alloc(flat.length * 4);
  flat.forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  return buffer;
};
const profile = (id, changes = {}) => ({ id, name: 'Вымышленный кандидат', professionalRole: 'Инженер электроники',
  specialization: 'Embedded', desiredGrade: 'Middle', confirmed: { specialization: 'Embedded', grade: 'Middle', score: 90 },
  visible: true, consent: true, synthetic: true, bio: 'Диагностика электронных устройств', stack: ['C++'],
  workHistory: 'Разработка интерфейса обмена устройства', careerAchievements: 'Создал стенд измерений', education: 'Радиотехника',
  city: 'Москва', industry: 'ИТ', format: 'Офис', employmentType: 'Полная занятость', experienceMonths: 36,
  salaryFrom: 100000, salaryTo: 150000, languageCodes: ['ru'], email: 'hidden@example.com', phone: '+79991234567',
  achievements: [], ...changes });
class Encoder {
  info = { status: 'ready', name: 'Synthetic unit encoder', version: 'unit-v1', dimension, trained: true, threshold: 0.35 };
  calls = [];
  async start() { return this.info; }
  async encode(texts) { this.calls.push(texts); return texts.map(() => axis(0)); }
  close() {}
}
const service = (t, profiles, encoder = new Encoder()) => {
  const value = new DirectoryService(':memory:', { seeds: profiles, encoder });
  t.after(() => value.close()); return value;
};

test('separate professional evidence retains achievements, removes contacts and exact duplication', () => {
  const person = profile('person', { bio: 'Калибрую измерительные схемы', workHistory: 'Калибрую измерительные схемы',
    careerAchievements: 'Уменьшил шум измерений. hidden@example.com', education: 'Радиотехника 2020-2024. +7 (999) 123-45-67',
    professionalRole: 'Инженер hidden@example.com', stack: ['C++', '+7 (999) 123-45-67'] });
  const segments = semanticSegments(person);
  assert.equal(segments.filter(text => text === person.bio).length, 1);
  assert(segments.some(text => text.startsWith('Уменьшил шум измерений')));
  assert(segments.some(text => text.includes('Радиотехника 2020-2024')));
  assert.doesNotMatch(JSON.stringify(segments), /hidden@example|999|Вымышленный кандидат/u);
  assert.deepEqual(parseSemanticSegments(semanticDocument(person)), segments);
  assert.match(person.careerAchievements, /hidden@example/u, 'Extraction does not mutate private account fields');
});

test('professional section bounds apply before encoding and empty evidence creates no invented description', () => {
  const segments = semanticSegments(profile('long', { bio: 'a'.repeat(7000), workHistory: 'b'.repeat(7000),
    careerAchievements: 'c'.repeat(7000), education: 'd'.repeat(7000) }));
  assert(segments.length <= 8);
  assert(segments.every(text => text.length <= 4000));
  assert.equal(segments.reduce((sum, text) => sum + text.length, 0), 12000);
  assert.deepEqual(semanticSegments({}), []);
  assert.throws(() => parseSemanticSegments('["' + 'x'.repeat(4001) + '"]'));
  assert.throws(() => parseSemanticSegments('[null]'));
});

test('task-only extraction excludes role and stack without inventing task evidence', () => {
  const person=profile('actual-sections');
  assert.deepEqual(semanticSegments(person,{includeIdentity:false}), [person.bio,person.workHistory,person.careerAchievements,person.education]);
  assert.equal(semanticSegments(person).at(-1), [person.professionalRole,person.stack.join(', ')].join('\n'), 'The persisted recall document retains its existing identity section');
  const empty=profile('identity-only',{bio:'',workHistory:'',careerAchievements:'',education:''});
  assert.deepEqual(semanticSegments(empty,{includeIdentity:false}), []);
  assert.equal(semanticSegments(empty).length,1);
});

test('task-only extraction preserves the same private-contact, provenance and duplication protections', () => {
  const person=profile('actual-sections',{bio:'Калибрую датчики. hidden@example.com',
    workHistory:'Калибрую датчики. hidden@example.com',careerAchievements:'Уменьшил дрейф\nДемонстрационный профиль: синтетическое происхождение',
    education:'Радиотехника\nДемонстрационные данные: синтетическое происхождение'});
  const sections=semanticSegments(person,{includeIdentity:false});
  assert.equal(sections.length,3,'Repeated factual evidence counts once');
  assert.match(sections[0],/Калибрую датчики/u);
  assert.deepEqual(sections.slice(1),['Уменьшил дрейф','Радиотехника']);
  assert.doesNotMatch(JSON.stringify(sections),/hidden@example|Демонстрацион|Инженер электроники|C\+\+/u);
  assert.equal(person.workHistory,person.bio,'Extraction does not mutate the account');
});

test('maximum cosine finds the strongest actual section and rejects truncated or non-finite vector bundles', () => {
  const query = axis(0), positive = axis(0, 0.8); positive[1] = 0.6;
  const packed = bytes([axis(0, -1), positive]);
  // SQLite returns views; a byte offset must not read a different vector.
  const surrounding = Buffer.concat([Buffer.alloc(7), packed, Buffer.alloc(5)]);
  const view = surrounding.subarray(7, 7 + packed.length);
  assert(Math.abs(cosine(query, view) - 0.8) < 1e-6);
  assert.equal(semanticMatch(query, view).index, 1);
  assert.equal(cosine(query, bytes([axis(0, -1)])), -1, 'Negative similarities are not replaced with zero');
  assert.equal(cosine(query, packed.subarray(0, packed.length - 1)), null);
  assert.equal(cosine(query, Buffer.alloc(0)), null);
  const corrupted = Buffer.from(packed); corrupted.writeFloatLE(NaN, 0);
  assert.equal(cosine(query, corrupted), null);
});

test('a matching achievement survives unrelated biography and the reason quotes that evidence', async t => {
  const target = 'Уменьшил шум измерений после калибровки датчика';
  const query = 'Снизить шум измерительного устройства';
  const encoder = new Encoder();
  encoder.encode = async texts => {
    encoder.calls.push(texts);
    return texts.map(text => text === query || text === target ? axis(0) : axis(1));
  };
  const person = profile('matching', { careerAchievements: target, workHistory: 'Общие сведения об организации' });
  const value = service(t, [person, profile('unrelated')], encoder);
  const result = await value.search(query);
  assert.deepEqual(result.items.map(item => item.person.id), ['matching']);
  assert.equal(result.items[0].semanticScore, 1);
  assert.match(result.items[0].reason, /Уменьшил шум измерений/u);
  assert.doesNotMatch(result.items[0].reason, /Диагностика электронных/u);
  assert.equal(result.model.version, 'unit-v1');
  assert.equal(result.model.indexPolicy, PROFILE_INDEX_POLICY);
  assert.equal(value.encoder.info.threshold, 0.35, 'Indexing does not change the frozen model threshold');
});

test('profile indexing batches independent sections within the worker limit of 256 texts', async t => {
  const encoder = new Encoder();
  const people = Array.from({ length: 65 }, (_, index) => profile('person-' + index));
  const value = service(t, people, encoder);
  await value.search('помочь с устройством');
  const indexed = encoder.calls.slice(0, -1);
  assert.equal(indexed.length, 3);
  assert(indexed.every(batch => batch.length <= 256));
  assert.equal(indexed.reduce((count, batch) => count + batch.length, 0), people.reduce((count, person) => count + semanticSegments(person).length, 0));
  assert(indexed.flat().every(text => !text.startsWith('[')), 'The encoder receives individual texts, not serialized JSON');
  assert.equal(value.store.vectors().get('person-0').dimension, semanticSegments(people[0]).length * dimension);
});

test('legacy index policy and a malformed vector shape each force a fresh profile index', async t => {
  const person = profile('person');
  const value = service(t, [person]);
  const row = value.store.get(person.id), bundle = semanticSegments(person).flatMap(() => axis(0));
  value.store.putVector(row, value.encoder.info.version, bundle);
  await value.search('помощь');
  assert.equal(value.encoder.calls.length, 2, 'Even a same-model same-hash bundle without the section policy is stale');
  assert.equal(value.store.vectors().get(person.id).model_version, 'unit-v1:' + PROFILE_INDEX_POLICY);
  value.store.putVector(row, value.indexVersion(), bundle.slice(0, -1));
  await value.search('помощь');
  assert.equal(value.encoder.calls.length, 3, 'A malformed stored shape is rebuilt; the query remains cached');
  assert.equal(value.store.vectors().get(person.id).dimension, bundle.length);
});

test('reopening a legacy SQLite profile migrates its section document and invalidates its single vector', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'predel-sections-'));
  const path = join(temporary, 'state.sqlite');
  let store, value;
  try {
    const person = profile('persistent');
    store = new DirectoryStore(path, [person]);
    const oldDocument = [person.professionalRole, person.bio, person.workHistory].join('\n');
    store.db.prepare('UPDATE directory_candidates SET document=?,document_hash=? WHERE id=?').run(oldDocument, textHash(oldDocument), person.id);
    store.putVector(store.get(person.id), 'unit-v1', axis(0));
    store.close(); store = null;
    value = new DirectoryService(path, { seeds: [], encoder: new Encoder() });
    assert.deepEqual(parseSemanticSegments(value.store.get(person.id).document), semanticSegments(person));
    assert.notEqual(value.store.get(person.id).document_hash, textHash(oldDocument));
    assert.equal((await value.search('помощь')).total, 1);
    assert.equal(value.encoder.calls.length, 2);
    assert.equal(value.store.vectors().get(person.id).model_version, value.indexVersion());
  } finally { store?.close(); value?.close(); rmSync(temporary, { recursive: true, force: true }); }
});

test('empty professional sections stay available to exact filters but are not semantic matches', async t => {
  const value = service(t, [profile('empty', { bio: '', workHistory: '', careerAchievements: '', education: '', professionalRole: '', stack: [] })]);
  assert.equal((await value.search('', { specialization: 'Embedded' })).total, 1);
  assert.equal((await value.search('специальная задача')).total, 0);
});

test('synthetic provenance lines never become professional evidence or universal search positives', async t => {
  const query = 'Преподавание школьного предмета';
  const encoder = new Encoder();
  encoder.encode = async texts => {
    encoder.calls.push(texts);
    return texts.map(text => text === query || /Демонстрационный профиль:|Демонстрационные данные:|Результат демонстрационного проекта:/u.test(text) ? axis(0) : axis(1));
  };
  for (const person of directoryCandidates) {
    const segments = semanticSegments(person);
    assert.doesNotMatch(JSON.stringify(segments), /Демонстрационный профиль:|Демонстрационные данные:|Результат демонстрационного проекта:/u);
    assert(segments.includes(person.bio), 'Actual authored task evidence remains available');
    assert.match(publicCandidate(person).education, /Демонстрационные данные:/u, 'Public provenance labels remain visible');
    assert.match(publicCandidate(person).careerAchievements, /Демонстрационный профиль:/u);
    assert.match(publicCandidate(person).workHistory, /Результат демонстрационного проекта:/u);
  }
  const value = service(t, directoryCandidates, encoder);
  assert.equal((await value.search(query)).total, 0, 'A common metadata match cannot create positives for every unrelated professional profile');
  assert.equal(encoder.calls.at(-1)[0], query, 'The need is passed to the encoder without a query-keyword rejection');
});

test('real education and achievements retain marker-like text, while synthetic history removes its metadata suffix', () => {
  const fields = {
    bio: 'Разработка измерительных устройств',
    workHistory: 'Профессиональные задачи обмена данными\nРезультат демонстрационного проекта: описаны ограничения\nДополнительная строка происхождения',
    careerAchievements: 'Демонстрационный профиль: разработал собственный симулятор датчика',
    education: 'Демонстрационные данные: курс радиотехники и проект стенда',
  };
  const real = profile('real', { ...fields, synthetic: false });
  const synthetic = profile('synthetic', fields);
  const realSegments = semanticSegments(real), syntheticSegments = semanticSegments(synthetic);
  assert(realSegments.includes(fields.education));
  assert(realSegments.includes(fields.careerAchievements));
  assert(realSegments.includes(fields.workHistory));
  assert(syntheticSegments.includes('Профессиональные задачи обмена данными'));
  assert.doesNotMatch(JSON.stringify(syntheticSegments), /Дополнительная строка происхождения|Демонстрационные данные:|Демонстрационный профиль:/u);
  assert.equal(real.education, fields.education);
  assert.equal(publicCandidate(synthetic).education, fields.education);
});

test('reopening legacy public payloads removes contacts in role, name and stack while retaining ownership and eligibility', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'predel-public-migration-'));
  const path = join(temporary, 'state.sqlite');
  let store, value;
  try {
    const person = profile('legacy', { synthetic: false, name: 'Имя hidden@example.com',
      professionalRole: 'Инженер hidden@example.com', stack: ['C++', '+7 (999) 123-45-67'],
      experience: '2020-2024; hidden@example.com' });
    store = new DirectoryStore(path);
    store.upsert(person, 'fixture-owner', true);
    store.db.prepare('UPDATE directory_candidates SET public_payload=? WHERE id=?').run(JSON.stringify(person), person.id);
    store.db.prepare('INSERT INTO directory_skills VALUES(?,?)').run(person.id, '+7 (999) 123-45-67');
    store.close(); store = null;
    value = new DirectoryService(path, { seeds: [], encoder: new Encoder() });
    const migrated = value.store.get(person.id), payload = JSON.parse(migrated.public_payload);
    assert.equal(migrated.owner, 'fixture-owner'); assert.equal(migrated.eligible, 1);
    assert.doesNotMatch(JSON.stringify(payload), /hidden@example|999/u);
    assert.match(payload.experience, /2020-2024/u);
    assert.equal(payload.email, ''); assert.equal(payload.phone, '');
    assert.doesNotMatch(JSON.stringify((await value.search('помощь')).items), /hidden@example|999/u);
    assert.equal((await value.search('', { stack: ['+7 (999) 123-45-67'] })).total, 0, 'A private contact cannot be inferred through an exact skill filter');
    assert.equal((await value.search('', { stack: ['C++'] })).total, 1, 'Public professional skill matching survives migration');
  } finally { store?.close(); value?.close(); rmSync(temporary, { recursive: true, force: true }); }
});
