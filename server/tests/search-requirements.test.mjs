import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectoryService } from '../directory.mjs';
import { splitStackConstraints, requirementCoverage, MINIMUM_RESULTS } from '../search-requirements.mjs';

const person = (id, specialization, stack, changes = {}) => ({ id, name: id, professionalRole: specialization + ' разработчик', specialization, desiredGrade: 'Middle',
  confirmed: { specialization, grade: 'Middle', score: 90, date: '2026-10-06T00:00:00Z' }, visible: true, consent: true, synthetic: true,
  bio: 'Разрабатываю продукт и проверяю результат.', stack, city: 'Москва', industry: 'ИТ', format: 'Удалённо', employmentType: 'Полная занятость',
  experienceMonths: 40, salaryFrom: 150000, salaryTo: 200000, languageCodes: ['ru'], achievements: [], ...changes });

class Encoder {
  info = { status: 'ready', name: 'Test encoder', version: 'requirements-v1', dimension: 2, trained: true, threshold: 0.5 };
  async start() { return this.info; }
  // Profiles whose text says "далёкий" fall below the cutoff for every query.
  async encode(texts) { return texts.map(text => /далёк/u.test(text) ? [0.3, 0.95] : [1, 0]); }
  close() {}
}
function service(t, seeds) {
  const value = new DirectoryService(':memory:', { seeds, encoder: new Encoder() });
  t.after(() => value.close()); return value;
}

test('a mentioned technology no profile has ranks and explains instead of emptying the result', async t => {
  const value = service(t, [person('react-ts', 'Frontend', ['React', 'TypeScript']), person('react', 'Frontend', ['React', 'CSS']),
    person('vue', 'Frontend', ['Vue']), person('designer', 'UXUI', ['Figma'])]);
  const result = await value.search('Фронтенд для SPA на React и TypeScript, вёрстка по макетам Figma');
  const ids = result.items.map(item => item.person.id);
  assert.deepEqual(ids.slice(0, 2), ['react-ts', 'react'], 'More covered requirements rank first');
  assert.ok(!ids.includes('designer'), 'Another direction is not mixed in by a single skill');
  assert.equal(result.items[0].match.requirements.text, 'Совпало 2 из 3 (React, TypeScript), не хватает: Figma.');
  assert.equal(result.items[0].match.confidence.level, 'medium');
  assert.match(result.items[0].reason, /не хватает: Figma/u);
  assert.equal(result.effectiveFilters.stack.length, 0, 'Text mentions are not SQL filters');
  const vue = result.items.find(item => item.person.id === 'vue');
  assert.equal(vue.approximate, true, 'A profile without any requested technology is only a nearest result');
  assert.equal(vue.match.confidence.level, 'low');
});

test('alternatives count as one requirement and a named role reaches adjacent directions after its own', async t => {
  const value = service(t, [person('java', 'Backend', ['Java']), person('go', 'Backend', ['Go', 'PostgreSQL']),
    person('python', 'Backend', ['Python', 'FastAPI']), person('fullstack', 'Fullstack', ['React', 'Python']), person('qa', 'QA', ['Python'])]);
  const result = await value.search('Бэкенд-разработчик на Python или Go для API заказов');
  const ids = result.items.map(item => item.person.id);
  assert.deepEqual(new Set(ids.slice(0, 2)), new Set(['go', 'python']));
  assert.equal(ids[2], 'fullstack', 'An adjacent direction follows the named one');
  assert.equal(ids[3], 'java', 'The named direction without the stack remains as nearest');
  assert.ok(!ids.includes('qa'));
  assert.equal(result.items[0].match.requirements.total, 1);
  assert.equal(result.items[2].explanation.adjacentSpecialization, true);
  assert.match(result.items[2].reason, /Смежная специализация/u);
});

test('a universal web developer request finds Fullstack first, then frontend and backend', async t => {
  const value = service(t, [person('frontend', 'Frontend', ['React']), person('backend', 'Backend', ['Go']),
    person('fullstack', 'Fullstack', ['React', 'Node.js']), person('mobile', 'Mobile', ['Swift'])]);
  const result = await value.search('Универсальный веб-разработчик для сервиса онлайн-записи');
  const ids = result.items.map(item => item.person.id);
  assert.equal(ids[0], 'fullstack');
  assert.deepEqual(new Set(ids.slice(1)), new Set(['frontend', 'backend']));
  assert.equal(result.items[0].match.confidence.level, 'high');
});

test('a named role always yields top-K with the weakest marked nearest; without signals the cutoff stays strict', async t => {
  const seeds = Array.from({ length: 12 }, (_, index) => person('qa-' + index, 'QA', ['Postman'],
    index < 2 ? {} : { bio: 'далёкий опыт ' + index, professionalRole: 'далёкий' }));
  const value = service(t, seeds);
  const named = await value.search('Тестировщик для проверки API');
  assert.equal(named.total, MINIMUM_RESULTS);
  assert.deepEqual(named.items.slice(0, 2).map(item => item.approximate), [undefined, undefined]);
  assert.ok(named.items.slice(2).every(item => item.approximate === true && item.match.confidence.label === 'Низкая уверенность'));
  assert.equal(named.warnings.length, 1);
  const plain = await value.search('Нужен человек, который проверит обмен');
  assert.equal(plain.total, 2, 'A request without a role or skill keeps the model cutoff');
});

test('manual stack filters and mandatory or excluded technologies remain hard', async t => {
  const value = service(t, [person('docker', 'DevOps', ['Docker', 'Linux']), person('no-docker', 'DevOps', ['Linux']), person('k8s', 'DevOps', ['Kubernetes', 'Docker'])]);
  assert.deepEqual((await value.search('DevOps для выкладки', { stack: ['Linux'] })).items.map(item => item.person.id).sort(), ['docker', 'no-docker']);
  assert.ok(!(await value.search('DevOps, Docker обязателен')).items.some(item => item.person.id === 'no-docker'));
  assert.ok(!(await value.search('DevOps без Kubernetes')).items.some(item => item.person.id === 'k8s'));
});

test('splitting keeps only mandatory skills in SQL and preserves exclusions', () => {
  const { sql, requirements } = splitStackConstraints({ exclude: { stack: ['PHP'] }, any: {}, all: { stack: ['React', 'Docker'] }, groups: { stack: [['Python', 'Go'], ['Kafka', 'RabbitMQ']] } },
    { mandatory: ['Docker', 'Kafka'], filterStack: ['Linux'] });
  assert.deepEqual(sql.all.stack, ['Docker']);
  assert.deepEqual(sql.groups.stack, [['Kafka', 'RabbitMQ']]);
  assert.deepEqual(sql.exclude.stack, ['PHP']);
  assert.deepEqual(requirements.map(item => [item.label, item.hard]), [['Linux', true], ['React', false], ['Docker', true], ['Python или Go', false], ['Kafka или RabbitMQ', true]]);
  const coverage = requirementCoverage({ stack: ['react'], petProjects: [{ stack: ['Go'] }] }, requirements);
  assert.deepEqual(coverage.matched, ['React', 'Python или Go']);
  assert.equal(coverage.share, 2 / 5);
});

test('an unmentioned method keeps a named role usable as nearest, while an explicit denial still excludes', async t => {
  const value = service(t, [person('rest', 'QA', ['Postman'], { bio: 'Проверяю REST API заказов и права доступа.' }),
    person('silent', 'QA', ['Postman'], { bio: 'Проверяю интеграции с доставкой.' }),
    person('denied', 'QA', ['Postman'], { bio: 'REST не использовал, проверяю только интерфейсы.' })]);
  const result = await value.search('QA-инженер для проверки REST API в Postman');
  assert.deepEqual(result.items.map(item => item.person.id), ['rest', 'silent']);
  assert.equal(result.items[0].approximate, undefined);
  assert.equal(result.items[1].approximate, true);
  assert.deepEqual(result.items[1].explanation.evidenceMissing, ['REST']);
  assert.match(result.items[1].reason, /В профиле не описан опыт: REST\./u);
  const unnamed = await value.search('Проверить REST API заказов');
  assert.deepEqual(unnamed.items.map(item => item.person.id), ['rest'], 'Without a role or skill the method stays a strict requirement');
});

test('platform developer titles name the mobile direction', async t => {
  const value = service(t, [person('ios', 'Mobile', ['Swift', 'iOS']), person('android', 'Mobile', ['Kotlin', 'Android']), person('web', 'Frontend', ['React'])]);
  const result = await value.search('iOS-разработчик на Swift для приложения с оплатой');
  assert.deepEqual(result.items.map(item => item.person.id), ['ios', 'android']);
  assert.equal(result.interpreted.specialization, 'Mobile');
  assert.equal(result.items[1].match.confidence.level, 'low');
});
