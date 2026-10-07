import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectoryService, interpretQuery } from '../directory.mjs';
import { professionalRoleScope } from '../query-role-scope.mjs';

const interpreted = query => interpretQuery(query, { cities: [] });

test('offline professional scope has a broad, sourced and unambiguous title taxonomy', () => {
  assert.equal(professionalRoleScope.source, 'https://api.hh.ru/professional_roles');
  assert.ok(professionalRoleScope.roles.length >= 70);
  assert.equal(new Set(professionalRoleScope.roles.map(role => role.id)).size, professionalRoleScope.roles.length);
  for (const role of professionalRoleScope.roles) {
    assert.match(role.id, /^\d+$/u);
    assert.ok(role.name && role.expression);
  }
});

test('explicit non IT hiring objects are rejected across sectors and noun inflections', () => {
  const queries = [
    'Нужен практикующий бухгалтер составить налоговые декларации.',
    'Ищем старшую медицинскую сестру для хирургического отделения.',
    'Нужна школьная учительница вести уроки математики.',
    'Нужен репетитор для подготовки к контрольной.',
    'Требуются опытные сантехники для ремонта труб.',
    'Приглашаем водителя с правами категории B.',
    'Требуется квалифицированный электромонтажник для квартир.',
    'Ищем ветеринарного врача в клинику.',
    'Ищем юриста для сопровождения сделок.',
    'Нужны нам официанты в ресторан.',
    'Нужен главный агроном для хозяйства.',
    'Нанимаем повара в столовую.',
    'Нужно нанять грузчиков на склад.',
    'Ищу хорошего парикмахера.',
    'Нужны нам ведущие фармацевты.',
    'Хотим нанять геодезиста для стройки.',
    'Нужен специалист по кадрам.',
    'Ищем менеджера по закупкам.',
    'Нужна в команду опытная переводчица.',
    'Ищем ведущего журналиста.',
    'Ищем профессионального фотографа.',
    'Требуется портной для ателье.',
  ];
  for (const query of queries) assert.ok(interpreted(query).unsupportedRole?.length, query);
});

test('domain words, title adjectives and unspecified professions keep semantic search available', () => {
  for (const query of [
    'Нужен Frontend разработчик для банка с бухгалтерами.',
    'Нужен разработчик приложения для врачей и медицинских сестёр.',
    'Ищем ML специалиста для уроков математики с преподавателями.',
    'Нужен Embedded инженер для силовых устройств и электриков.',
    'Нужен человек обучать школьников геометрии.',
    'Нужен специалист автоматизировать бухгалтерские декларации.',
    'Нужен бухгалтерский портал с интеграцией 1С.',
    'Нужна психологическая платформа для консультаций.',
    'Нужна врачебная информационная система.',
    'Нужен журналистский сайт.',
    'Ищем архитектора распределённых систем.',
    'Нужен инженер для электронных плат.',
    'Нужен аналитик финансовых данных.',
    'Нужен дизайнер банковского приложения.',
    'Нужен инженер электроники для медицинских приборов.',
    'На сайте поваров нужен Backend разработчик.',
  ]) assert.equal(interpreted(query).unsupportedRole, undefined, query);
});

test('unsupported title negations and supported alternatives do not block IT search', () => {
  for (const query of [
    'Не нужен бухгалтер, ищем Backend разработчика.',
    'Не ищем преподавателей, нужен Frontend разработчик.',
    'Нужен не бухгалтер а разработчик.',
    'Нужен бухгалтер или Backend разработчик.',
    'Ищем Frontend либо бухгалтера.',
    'Нужен программист или электрик.',
    'Нужен бухгалтер и ML специалист.',
    'Нужен не только бухгалтер или Backend.',
  ]) assert.equal(interpreted(query).unsupportedRole, undefined, query);
  for (const query of [
    'Нужен учитель Frontend.',
    'Ищем бухгалтера для Backend проекта.',
    'Нужен бухгалтер или Backend не нужен.',
    'Нужен электрик без Embedded.',
    'Нужен преподаватель машинного обучения.',
  ]) assert.ok(interpreted(query).unsupportedRole?.length, query);
});

test('outside hiring scope returns empty before ML even when weights are unavailable', async t => {
  const encoder = {
    info: { status: 'unavailable', name: 'RuBERT-tiny2', version: '', dimension: 312, trained: false },
    start: async () => { throw new Error('Weights unavailable'); },
    encode: async () => { throw new Error('Must not encode outside scope'); },
    close() {},
  };
  const service = new DirectoryService(':memory:', { seeds: [], encoder });
  t.after(() => service.close());
  const result = await service.search('Ищем бухгалтера для налоговой отчётности', {}, { offset: 30, limit: 20 });
  assert.deepEqual(result.items, []);
  assert.equal(result.total, 0);
  assert.equal(result.offset, 30);
  assert.equal(result.limit, 20);
  assert.deepEqual(result.interpreted.unsupportedRole, ['Бухгалтер']);
  assert.equal(result.model.status, 'unavailable');
  assert.deepEqual(result.warnings, []);
  await assert.rejects(service.search('Нужен Backend разработчик'), error => error.status === 503);
});
