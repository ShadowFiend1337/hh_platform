import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DirectoryService, interpretQuery } from '../directory.mjs';
import { semanticDocument, semanticSegments, PROFILE_INDEX_POLICY } from '../directory-store.mjs';
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
  const person = profile('person', { bio: 'Платы. Пишите private@example.com или +7 (999) 111-22-33', workHistory: 'Инженер с 2024-01-01',
    professionalRole: 'Инженер private@example.com', stack: ['STM32', '+7 (999) 111-22-33'],
    careerAchievements: 'Разработал систему калибровки. private@example.com', education: 'Радиотехника. +7 (999) 111-22-33' });
  assert.doesNotMatch(semanticDocument(person), /private@example|999/u);
  assert.match(semanticDocument(person), /систему калибровки/u);
  assert.match(semanticDocument(person), /Радиотехника/u);
  assert.match(semanticDocument(person), /2024-01-01/u, 'Calendar dates are not phone numbers');
  const value = service(t, [person]);
  const result = await value.search('платы');
  assert.equal(result.items[0].person.email, ''); assert.equal(result.items[0].person.phone, '');
  assert.doesNotMatch(JSON.stringify(result.items), /private@example|999/u);
});

test('semantic cutoff removes unrelated documents without a keyword fallback', async t => {
  const value = service(t, [profile('related'), profile('other', { bio: 'неподходящий опыт', professionalRole: '', stack: [] })]);
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
  assert.equal(value.store.vectors().get('person').vector.byteLength, semanticSegments(profile('person')).length * 2 * 4);
  const count = value.encoder.calls.length;
  await value.search('схемы'); assert.equal(value.encoder.calls.length, count);
  value.store.upsert(profile('person', { salaryFrom: 100000 }), null, true);
  await value.search('схемы'); assert.equal(value.encoder.calls.length, count, 'salary is a filter, not an embedding feature');
  value.store.upsert(profile('person', { bio: 'Другая задача со схемами' }), null, true);
  await value.search('схемы'); assert.equal(value.encoder.calls.length, count + 1);
  const previousHash = value.store.vectors().get('person').document_hash;
  value.store.upsert(profile('person', { bio: 'Другая задача со схемами', careerAchievements: 'Создал измерительный стенд' }), null, true);
  await value.search('схемы'); assert.equal(value.encoder.calls.length, count + 2);
  assert.notEqual(value.store.vectors().get('person').document_hash, previousHash, 'Career achievements change the professional document');
  value.store.upsert(profile('person', { bio: 'Другая задача со схемами', careerAchievements: 'Создал измерительный стенд', education: 'Радиотехника' }), null, true);
  await value.search('схемы'); assert.equal(value.encoder.calls.length, count + 3);
  value.encoder.info.version = 'test-v2';
  await value.search('схемы'); assert.equal(value.encoder.calls.length, count + 5);
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

test('only confidently parsed location, experience and budget spans leave the semantic task query', async t => {
  const encoder = new FakeEncoder();
  const value = service(t, [profile('fits')], encoder);
  const query = 'человек который понимает структуру электроники и поможет разобраться, в Москве, опыт от 3 до 5 лет, с зарплатой до 200 тысяч рублей в месяц';
  const result = await value.search(query);
  assert.equal(result.total, 1);
  const encodedQuery = encoder.calls.at(-1)[0];
  assert.match(encodedQuery, /понимает структуру электроники и поможет разобраться/u);
  assert.doesNotMatch(encodedQuery, /Москв|зарплат|200|опыт|3|5/u);
  assert.equal(result.effectiveFilters.city, 'Москва');
  assert.equal(result.effectiveFilters.salaryMax, 200000);
  assert.equal(result.effectiveFilters.experienceMin, 36);
  assert.equal(result.effectiveFilters.experienceMax, 60);
  assert.equal(JSON.stringify(result.interpreted).includes('constraintSpans'), false);
  await value.search('не Frontend, нужен Backend для диагностики плат, не Москва');
  assert.match(encoder.calls.at(-1)[0], /не Frontend, нужен Backend для диагностики плат/u, 'Professional negation remains intact');
  assert.doesNotMatch(encoder.calls.at(-1)[0], /Москв/u);
  const unknown = 'нагрузка до 200 тысяч новых пользователей, возраст 25 лет';
  await value.search(unknown);
  assert.equal(encoder.calls.at(-1)[0], unknown, 'Unrecognized numbers remain professional task input');
});

test('a query consisting only of exact non-professional constraints uses SQL without model inference', async t => {
  const value = service(t, [profile('fits'), profile('expensive', { salaryFrom: 300000 }), profile('other-city', { city: 'Казань' })]);
  const result = await value.search('Москва, зарплата до 200 тысяч рублей в месяц, опыт от 3 до 5 лет');
  assert.deepEqual(result.items.map(item => item.person.id), ['fits']);
  assert.equal(value.encoder.calls.length, 0);
  assert.equal(result.items[0].semanticScore, null);
});

test('declared team task removes hiring boilerplate while preserving professional requirements and original SQL constraints', async t => {
  const encoder = new FakeEncoder();
  const value = service(t, [profile('fits')], encoder);
  const preamble = 'Мы развиваем дружелюбную компанию с интересной историей. Работаем в комфортной обстановке и ценим командное общение. '.repeat(4);
  const query = preamble + 'Нужен Embedded специалист, не Frontend, Москва, с зарплатой до 200 тысяч рублей. '
    + 'Задачи команды: Измерять дрейф датчиков и калибровать платы. Не заменять диагностику закупкой новых устройств. '
    + 'Требования: STM32 и C++, опыт от 3 до 5 лет, английский. '
    + 'Условия: дружная команда, корпоративные завтраки и удобная кухня.';
  const result = await value.search(query);
  assert.equal(result.query, query, 'The response and saved query retain the original employer request');
  assert.equal(result.total, 1);
  assert.equal(result.effectiveFilters.salaryMax, 200000);
  assert.equal(result.effectiveFilters.city, 'Москва');
  assert.deepEqual(result.interpreted.queryConstraints.exclude.specialization, ['Frontend']);
  assert.deepEqual(result.interpreted.queryConstraints.all.stack, ['STM32', 'C++']);
  const encoded = encoder.calls.at(-1)[0];
  assert.match(encoded, /Измерять дрейф датчиков и калибровать платы/u);
  assert.match(encoded, /Не заменять диагностику закупкой новых устройств/u);
  assert.match(encoded, /STM32 и C\+\+, английский/u, 'Professional requirements beyond the core task remain');
  assert.doesNotMatch(encoded, /историей|завтраки|кухня|Москва|200|Задачи команды|Требования/u);
});

test('all supported explicit task headings preserve complete task sentences until the next section', async t => {
  const encoder = new FakeEncoder();
  const value = service(t, [profile('fits')], encoder);
  for (const heading of ['Основная задача', 'Главная задача', 'Конкретная задача', 'Задачи команды']) {
    await value.search('Ищем человека для интересного проекта. ' + heading + ': Определить причину отказов датчика. Сравнить показания до и после калибровки. Контакты: отдел найма.');
    assert.equal(encoder.calls.at(-1)[0], 'Определить причину отказов датчика. Сравнить показания до и после калибровки');
  }
});

test('neutral leading request wrappers leave professional roles, negations and skills intact', async t => {
  const encoder = new FakeEncoder();
  const value = service(t, [profile('fits')], encoder);
  const cases = [
    ['Нужен специалист, который диагностирует платы без C++', 'диагностирует платы без C++'],
    ['Нужен человек который сравнит сигналы и не будет менять платы целиком', 'сравнит сигналы и не будет менять платы целиком'],
    ['Нужен разработчик, который измерит задержки SPI', 'измерит задержки SPI'],
    ['Нужен исполнитель, который проверит калибровку', 'проверит калибровку'],
    ['Ищем Embedded инженера с STM32, не Frontend', 'Embedded инженера с STM32, не Frontend'],
    ['Хотим не Frontend, а Backend для API с PostgreSQL', 'не Frontend, а Backend для API с PostgreSQL'],
    ['Нужен разработчик интерфейсов, который исправит доступность React форм', 'разработчик интерфейсов, который исправит доступность React форм'],
    ['Не нужен Frontend, нужен Embedded с C++', 'Не нужен Frontend, нужен Embedded с C++'],
  ];
  for (const [query, expected] of cases) {
    await value.search(query);
    assert.equal(encoder.calls.at(-1)[0], expected, query);
  }
});

test('query polarity and alternatives retain strict constraints without selecting an arbitrary value', async t => {
  const value = service(t, [profile('frontend', { specialization: 'Frontend', confirmed: { specialization: 'Frontend', grade: 'Senior', score: 90 }, city: 'Москва', format: 'Удалённо' }),
    profile('backend', { specialization: 'Backend', confirmed: { specialization: 'Backend', grade: 'Middle', score: 90 }, city: 'Казань', format: 'Гибрид' }),
    profile('other-city', { city: 'Новосибирск' })]);
  const negative = await value.search('не Frontend, Senior не нужен, not remote, не Москва');
  assert.deepEqual(negative.items.map(item => item.person.id), ['backend', 'other-city']);
  assert.deepEqual(negative.interpreted.queryConstraints.exclude, { specialization: ['Frontend'], grade: ['Senior'], format: ['Удалённо'], city: ['Москва'] });
  const alternatives = await value.search('Frontend или Backend, Москва или Казань');
  assert.deepEqual(new Set(alternatives.items.map(item => item.person.id)), new Set(['frontend', 'backend']));
  assert.equal(alternatives.interpreted.specialization, undefined);
  assert.equal(alternatives.interpreted.city, undefined);
  assert.equal((await value.search('Frontend', { specialization: 'Backend' })).total, 0, 'Manual choices do not erase a conflicting explicit query requirement');
});

test('numeric work quantities, annual budgets and optional requirements do not become salary caps', () => {
  for (const query of ['обрабатывать до 15000 документов в сутки', 'нагрузка до 200 тысяч новых пользователей',
    'бюджет до 200 тысяч рублей в год', 'зарплата до 200 тыс. руб. в год', 'зарплата в USD до 200 тысяч', 'до 200 тысяч долларов', 'в зарплате нет ограничения до 200 тысяч',
    'проводить до 200 тысяч операций', 'до 200 тысяч']) {
    assert.equal(interpretQuery(query, { cities: [] }).salaryMax, undefined, query);
  }
  assert.equal(interpretQuery('зарплата до 200 тысяч рублей в месяц', { cities: [] }).salaryMax, 200000);
  assert.equal(interpretQuery('до 200000 ₽', { cities: [] }).salaryMax, 200000);
  const optional = interpretQuery('Frontend, английский необязателен, React будет плюсом', { cities: [] });
  assert.equal(optional.language, undefined);
  assert.equal(optional.stack, undefined);
});

test('explicit experience, skills, languages and portfolio requirements reach SQL filters', async t => {
  const value = service(t, [profile('fits', { languageCodes: ['ru', 'en', 'de'] }),
    profile('no-english', { languageCodes: ['ru', 'de'] }), profile('no-german', { languageCodes: ['ru', 'en'] }),
    profile('too-short', { experienceMonths: 35 }), profile('too-long', { experienceMonths: 61 }),
    profile('no-portfolio', { portfolio: '' }), profile('no-skill', { stack: ['STM32'] })]);
  const result = await value.search('STM32 и C++, опыт от 3 лет до 5 лет, английский и немецкий, есть портфолио');
  assert.deepEqual(result.items.map(item => item.person.id), ['fits']);
  assert.equal(result.effectiveFilters.experienceMin, 36);
  assert.equal(result.effectiveFilters.experienceMax, 60);
  assert.deepEqual(result.interpreted.queryConstraints.all.language, ['en', 'de']);
  const excludes = await value.search('без C++, без английского');
  assert.equal(excludes.total, 0, 'Excluded skills and languages are enforced');
  assert.equal(interpretQuery('стаж от 3 лет 4 месяцев', { cities: [] }).experienceMin, 40);
  assert.equal(interpretQuery('опыт от 3 до 5 лет', { cities: [] }).experienceMin, 36);
  assert.equal(interpretQuery('опыт от 3 до 5 лет', { cities: [] }).experienceMax, 60);
});

test('skill alternatives and grade ranges are unions rather than exact singleton filters', async t => {
  const value = service(t, [profile('stm32', { stack: ['STM32'] }), profile('cpp', { stack: ['C++'] }),
    profile('none', { stack: ['Python'] }), profile('junior', { confirmed: { specialization: 'Embedded', grade: 'Junior', score: 90 } })]);
  const result = await value.search('STM32 или C++, грейд не ниже Middle');
  assert.deepEqual(new Set(result.items.map(item => item.person.id)), new Set(['stm32', 'cpp']));
  assert.deepEqual(result.interpreted.queryConstraints.any.grade, ['Middle', 'Senior', 'Lead']);
  assert.deepEqual(interpretQuery('грейд от Junior до Senior', { cities: [] }).queryConstraints.any.grade, ['Junior', 'Middle', 'Senior']);
});

test('OR skill groups remain mandatory independently of other required skills', async t => {
  const value = service(t, [profile('fits', { stack: ['React', 'Python', 'Docker'] }),
    profile('also-fits', { stack: ['Vue', 'Node.js', 'Docker'] }), profile('missing-docker', { stack: ['React', 'Python'] }),
    profile('missing-second-group', { stack: ['React', 'Docker'] })]);
  const result = await value.search('React или Vue, Python или Node.js, Docker обязателен');
  assert.deepEqual(new Set(result.items.map(item => item.person.id)), new Set(['fits', 'also-fits']));
  assert.deepEqual(result.interpreted.queryConstraints.groups.stack, [['React', 'Vue'], ['Python', 'Node.js']]);
  assert.deepEqual(result.interpreted.queryConstraints.all.stack, ['Docker']);
});

test('excluding a framework does not exclude its entire professional direction', async t => {
  const value = service(t, [profile('vue', { specialization: 'Frontend', confirmed: { specialization: 'Frontend', grade: 'Middle', score: 90 }, stack: ['Vue'] }),
    profile('react', { specialization: 'Frontend', confirmed: { specialization: 'Frontend', grade: 'Middle', score: 90 }, stack: ['React'] }),
    profile('swift', { specialization: 'Mobile', confirmed: { specialization: 'Mobile', grade: 'Middle', score: 90 }, stack: ['Swift', 'iOS'] }),
    profile('flutter', { specialization: 'Mobile', confirmed: { specialization: 'Mobile', grade: 'Middle', score: 90 }, stack: ['Flutter', 'Dart'] })]);
  const frontend = await value.search('Frontend, не React, нужен Vue');
  assert.deepEqual(frontend.items.map(item => item.person.id), ['vue']);
  assert.deepEqual(frontend.interpreted.queryConstraints.exclude.stack, ['React']);
  const mobile = await value.search('Mobile без Flutter');
  assert.deepEqual(mobile.items.map(item => item.person.id), ['swift']);
  assert.deepEqual(mobile.interpreted.queryConstraints.exclude.stack, ['Flutter']);
  assert.equal(mobile.interpreted.queryConstraints.exclude.specialization, undefined);
  assert.equal(interpretQuery('ML без NLP', { cities: [] }).queryConstraints.exclude.specialization, undefined);
});

test('content changes during query encoding receive one bounded index catch-up', async t => {
  const encoder = new FakeEncoder();
  const value = service(t, [profile('person')], encoder);
  const original = encoder.encode.bind(encoder);
  let calls = 0;
  encoder.encode = async texts => {
    const vectors = await original(texts);
    if (++calls === 2) value.store.upsert(profile('person', { bio: 'Обновлённые профессиональные задачи' }), null, true);
    return vectors;
  };
  assert.equal((await value.search('задачи')).total, 1);
  assert.equal(calls, 3, 'Initial document, query and one changed document are encoded');
  assert.equal(value.store.vectors().get('person').document_hash, value.store.get('person').document_hash);
});

test('activation during index catch-up rejects ambiguous vectors and a bounded retry refreshes their version', async t => {
  const encoder = new FakeEncoder();
  const value = service(t, [profile('person')], encoder);
  let calls = 0;
  encoder.encode = async texts => {
    encoder.calls.push(texts);
    calls++;
    if (calls === 2) value.store.upsert(profile('person', { bio: 'Обновлённые задачи' }), null, true);
    if (calls === 3) encoder.info.version = 'test-v2';
    return texts.map(() => encoder.info.version === 'test-v2' ? [0, 1] : [1, 0]);
  };
  await assert.rejects(value.search('задачи'),error=>error.status===503,'An in-flight encoding cannot be assigned a new model version');
  assert.equal(calls,3);
  assert.equal(value.store.vectors().get('person').model_version,'test-v1:'+PROFILE_INDEX_POLICY);
  assert.equal((await value.search('задачи')).total,1,'A later request compares vectors from the same stable model');
  assert.equal(calls, 5, 'Retry refreshes the changed document and query once');
  assert.deepEqual(value.queryCache.get('test-v2:' + PROFILE_INDEX_POLICY + '\nзадачи'), [0, 1]);
  assert.equal((await value.search('задачи')).total, 1);
  assert.equal(calls, 5, 'The refreshed query is cached under its actual model version');
});

test('consent is checked again after a model activation forces the final query encoding', async t => {
  const encoder = new FakeEncoder();
  const value = service(t, [profile('person')], encoder);
  let calls = 0;
  encoder.encode = async texts => {
    calls++;
    if (calls === 2) value.store.upsert(profile('person', { bio: 'Обновлённые задачи' }), null, true);
    if (calls === 3) encoder.info.version = 'test-v2';
    if (calls === 4) value.store.upsert(profile('person', { consent: false }), null, true);
    return texts.map(() => [1, 0]);
  };
  await assert.rejects(value.search('задачи'),error=>error.status===503);
  assert.equal((await value.search('задачи')).total, 0);
  assert.equal(calls, 5);
});

for(const phase of ['index','query']) test(`a stale ${phase} reply never acquires a replacement model's index or cache tag`,async t=>{
  const encoder=new FakeEncoder(),value=service(t,[profile('person')],encoder);
  let calls=0;
  encoder.encode=async texts=>{
    const vectors=texts.map(()=>encoder.info.version==='test-v1'?[1,0]:[0,1]);
    if(++calls===(phase==='index'?1:2)) encoder.info.version='test-v2';
    return vectors;
  };
  await assert.rejects(value.search('задачи'),error=>error.status===503);
  assert.notEqual(value.store.vectors().get('person')?.model_version,'test-v2:'+PROFILE_INDEX_POLICY);
  assert.equal(value.queryCache.get('test-v2:'+PROFILE_INDEX_POLICY+'\nзадачи'),undefined);
  assert.equal((await value.search('задачи')).total,1);
  assert.deepEqual(value.queryCache.get('test-v2:'+PROFILE_INDEX_POLICY+'\nзадачи'),[0,1]);
});

test('encoder-only search uses test evidence for close profiles and preserves material relevance gaps', async t => {
  const encoder = new FakeEncoder();
  encoder.encode = async texts => texts.map(text => text.includes('stronger') ? [0.8, 0.6]
    : text.includes('closer') ? [0.795, Math.sqrt(1 - 0.795 ** 2)]
    : text.includes('weaker') ? [0.7, Math.sqrt(1 - 0.7 ** 2)] : text === 'потребность' ? [1, 0] : [0, 1]);
  const value = service(t, [profile('strong', { bio: 'stronger', confirmed: { specialization: 'Embedded', grade: 'Middle', score: 70 } }),
    profile('close', { bio: 'closer', confirmed: { specialization: 'Embedded', grade: 'Middle', score: 100 } }),
    profile('weak', { bio: 'weaker', confirmed: { specialization: 'Embedded', grade: 'Middle', score: 100 }, achievements: [{ title: 'Demo' }] })], encoder);
  const result = await value.search('потребность');
  assert.deepEqual(result.items.map(item => item.person.id), ['close', 'strong', 'weak']);
  assert.ok(result.items[0].semanticScore < result.items[1].semanticScore, 'Close scores need not be exactly equal for test evidence to affect ordering');
  assert.ok(result.items[1].semanticScore > result.items[2].semanticScore);
  assert.equal(result.model.categoryRankingPolicy.version, 'category-evidence-bands-v1');
});

test('raw pagination offset makes progress after an earlier ranked row is inserted', async t => {
  const value = service(t, Array.from({ length: 65 }, (_, index) => profile(`fixture-${String(index).padStart(3, '0')}`)));
  const first = await value.search('', {}, { limit: 30 });
  value.store.upsert(profile('inserted', { confirmed: { specialization: 'Embedded', grade: 'Middle', score: 100 } }), null, true);
  let items = first.items, rawOffset = first.items.length, requests = 0;
  while (requests++ < 5) {
    const page = await value.search('', {}, { offset: rawOffset, limit: 30 });
    rawOffset = page.offset + page.items.length;
    items = [...items, ...page.items.filter(item => !items.some(old => old.person.id === item.person.id))];
    if (!page.items.length || rawOffset >= page.total) break;
  }
  assert.equal(requests, 2);
  assert.equal(rawOffset, 66);
  assert.equal(items.length, 65, 'A fresh first page is required to include the newly inserted earlier result');
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

test('HTTP platform snapshots are session-owned, CAS-checked and erased only with the account', async t => {
  const codes = new Map();
  const { server, directory } = createAssessmentServer({ dbPath: ':memory:', authEnv: {}, authMailer: async ({ email, code }) => { codes.set(email, code); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function registered(login) {
    const email = `${login}@example.test`;
    assert.equal((await fetch(base + '/api/auth/register/request-code', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'candidate', login, email, password: 'directory fixture password', name: 'Вымышленный кандидат', consent: true, privacyVersion: PRIVACY_POLICY_VERSION }) })).status, 202);
    const verified = await fetch(base + '/api/auth/register/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code: codes.get(email) }) });
    assert.equal(verified.status, 201);
    return verified.headers.getSetCookie().find(value => value.startsWith('predel_account_session=')).split(';')[0];
  }
  const cookie = await registered('directory-owner'), otherCookie = await registered('directory-outsider');
  const initial = await fetch(base + '/api/platform/state', { headers: { Cookie: cookie } });
  const identity = initial.headers.get('x-platform-identity');
  assert.deepEqual(await initial.json(), { state: null, revision: 0, directoryPeople: [] });
  const state = createInitialState();
  state.profile = { ...state.profile, name: 'Тестовый кандидат', email: 'test@example.com', professionalRole: 'Инженер', stack: ['C++'], consent: true, visible: true };
  const put = () => fetch(base + '/api/platform/state', { method: 'PUT', headers: { cookie, 'X-Platform-Identity': identity, 'Content-Type': 'application/json' }, body: JSON.stringify({ state, baseRevision: 0 }) });
  const saved = await put(); assert.equal(saved.status, 200); assert.equal((await saved.json()).revision, 1);
  assert.equal((await put()).status, 409);
  assert.equal((await (await fetch(base + '/api/platform/state', { headers: { Cookie: otherCookie } })).json()).state, null, 'another account cannot read private state');
  assert.equal(directory.store.all().some(row => row.owner), false, 'a self-declared grade never publishes a real profile');
  assert.equal((await fetch(base + '/api/directory/candidate-anna/contacts', { headers: { cookie } })).status, 200);
  assert.equal((await fetch(base + '/api/platform/state', { method: 'DELETE', headers: { cookie, 'X-Platform-Identity': identity } })).status, 403);
  assert.equal((await (await fetch(base + '/api/platform/state', { headers: { cookie } })).json()).revision, 1);
  assert.equal((await fetch(base + '/api/auth/account', { method: 'DELETE', headers: { cookie, 'X-Platform-Identity': identity } })).status, 200);
  assert.equal((await fetch(base + '/api/platform/state', { headers: { cookie } })).status, 401);
});
