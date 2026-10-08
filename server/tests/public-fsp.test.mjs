import test from 'node:test';
import assert from 'node:assert/strict';
import { PublicFspCatalog } from '../integrations/public-fsp.mjs';
import { recordFromCells, discoverProtocols, gridRows, PILOT_SOURCE } from '../../scripts/fsp/parse.mjs';
const source = { id: 'test-source', title: 'Тестовый финал', discipline: 'algorithms', occurredOn: '2025-05-25',
  documentHash: 'a'.repeat(64), sourceUrl: 'https://fsp-russia.ru/example.pdf', reviewedAt: '2026-10-07T00:00:00Z' };
const item = { id: 'b'.repeat(64), sourceId: source.id, participantName: 'Тестов Фёдор Викторович', place: 1,
  solvedTasks: 6, completionTime: 196, region: 'г. Москва', participation: 'individual', role: 'athlete', sourcePage: 1,
  extractionStatus: 'reviewed', extractionConfidence: 90, identityVerified: false };
const data = { schemaVersion: 1, checkedAt: '2026-10-07T00:00:00Z', sources: [source], items: [item] };
test('public name search handles ё, word order, pagination and always remains unverified', () => {
  const catalog = new PublicFspCatalog({data});
  for (const name of ['тестов федор','Фёдор Тестов','Тестов Федор Викторович']) {
    const result = catalog.search(name);
    assert.equal(result.total,1); assert.equal(result.items[0].status,'unverified');
    assert.equal(result.items[0].identityVerified,false); assert.equal(result.coverage.complete,false);
    assert.equal(result.items[0].sourceUrl,source.sourceUrl);
  }
  assert.equal(catalog.search('Тестов Федор','20','1').items.length,0);
  assert.equal(catalog.search('Другой Федор').total,0);
  for(const name of [null,'Тестов','Те Ф','test test','Тестов <script>','Тестов Федор@example.com']) assert.throws(() => catalog.search(name),e=>e.status===400);
  assert.throws(() => catalog.search('Тестов Федор','51'),e=>e.status===400);
});
test('unreviewed OCR snapshots cannot be served as a public catalog', () => {
  for(const changed of [{...item,extractionStatus:'needs_review'},{...item,identityVerified:true},{...item,sourceId:'absent'}]) {
    const catalog = new PublicFspCatalog({ data: {...data,items:[changed]} });
    assert.throws(() => catalog.search('Тестов Федор'),e=>e.status===503);
  }
});
test('grid OCR preserves row attribution and rejects unreadable or shifted numeric columns', () => {
  const cells = ['1','Тестов\nФёдор Викторович','6','196','г. Москва'].map(text=>({text,confidence:95}));
  const parsed = recordFromCells(cells,{id:'test-source'},1,1);
  assert.equal(parsed.participantName,item.participantName); assert.equal(parsed.extractionStatus,'needs_review');
  assert.equal(parsed.identityVerified,false); assert.equal(parsed.place,1);
  assert.throws(() => recordFromCells(cells,{id:'test-source'},1,2),/Invalid OCR/);
  assert.throws(() => recordFromCells(cells.map((cell,i)=>i===2?{...cell,text:'б'}:cell),{id:'test-source'},1,1),/Invalid OCR/);
  assert.throws(() => gridRows({data:new Uint8Array(400),width:10,height:10},PILOT_SOURCE.pages[0]),/Layout changed/);
});
test('document discovery accepts published result PDFs and excludes unrelated documents', () => {
  const html = '<h5>Итоговый протокол Кубка</h5><a href="/upload/iblock/abc/result.pdf">Скачать</a>'
    +'<h5>Устав</h5><a href="/upload/iblock/abc/statute.pdf">Скачать</a>'
    +'<h5>Протокол судейского вебинара</h5><a href="/upload/iblock/abc/judges.pdf">Скачать</a>'
    +'<h5>Протокол Кубка</h5><a href="https://other.example/file.pdf">Скачать</a>';
  assert.deepEqual(discoverProtocols(html),[{title:'Итоговый протокол Кубка',sourceUrl:'https://fsp-russia.ru/upload/iblock/abc/result.pdf'}]);
});
test('checked-in pilot has reviewed source provenance and no account ownership claims', () => {
  const catalog = new PublicFspCatalog(), snapshot = catalog.read();
  assert.equal(snapshot.items.length,24); assert.equal(snapshot.sources.length,1);
  assert.equal(new Set(snapshot.items.map(item=>item.place)).size,24);
  assert(snapshot.items.every(item=>item.identityVerified===false));
  assert.equal(catalog.search('Ромашов Федор').items[0].place,1);
});
