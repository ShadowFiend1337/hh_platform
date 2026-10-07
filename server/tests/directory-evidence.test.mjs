import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectoryService } from '../directory.mjs';

// Deliberately misleading neural doubles test evidence admission. These are
// authored behavioural counterexamples, not measured outputs of the model.
const profile = (id, changes = {}) => ({ id, name: 'Вымышленный ' + id, professionalRole: 'Мобильный разработчик',
  specialization: 'Mobile', desiredGrade: 'Middle', confirmed: { specialization: 'Mobile', grade: 'Middle', score: 90 },
  visible: true, consent: true, synthetic: true, bio: '', stack: [], city: 'Москва', industry: 'ИТ', format: 'Гибрид',
  employmentType: 'Полная занятость', experienceMonths: 36, salaryFrom: 100000, salaryTo: 150000, languageCodes: ['ru'],
  email: '', phone: '', portfolio: '', workHistory: '', careerAchievements: '', education: '', achievements: [], ...changes });

const fusion = () => ({
  kind: 'pooled-LDA-diagonal-shrinkage-v1', weights: [0, 1], bias: 0, threshold: 10, shrink: 0.1, split: 'dev',
  featurePolicy: { features: ['encoderCosine', 'crossEncoderRawLogit'], encoderQueryContext: 'raw-query',
    encoderDocumentContext: 'task-section-without-role', crossEncoderQueryContext: 'raw-query',
    crossEncoderDocumentContext: 'catalog-professional-role-newline-task-section',
    aggregation: 'maximum-fused-score-over-task-sections', formula: 'weights[0]*encoderCosine+weights[1]*crossEncoderRawLogit+bias' },
  hashes: { fixture: 'a'.repeat(64) }, DEVmetrics: { resubstitution: true },
  admission: { kind: 'query-max-applicability-top3-v1', threshold: 1, limit: 3, split: 'dev',
    metrics: { resubstitution: true, heldOutScored: false, functionalBenchmarkScored: false }, hashes: { fixture: 'b'.repeat(64) } },
});

class MisleadingEncoder {
  info = { status: 'ready', name: 'Authored evidence test double', version: 'test-evidence-v1', dimension: 2,
    trained: true, threshold: 0.75, reranker: { version: 'test-reranker', threshold: 0.5,
      baseModel: 'fixture/cross-encoder', revision: 'a'.repeat(40), maxLength: 512 } };
  calls = []; rankCalls = []; scores = {};
  async start() { return this.info; }
  async encode(texts) { this.calls.push(texts); return texts.map(() => [1, 0]); }
  async rerank(query, passages) {
    this.rankCalls.push({ query, passages });
    return passages.map(text => this.scores[text.match(/TASK:([\w-]+)/u)?.[1]] ?? 2);
  }
  close() {}
}
function service(t, seeds, encoder = new MisleadingEncoder()) {
  const value = new DirectoryService(':memory:', { seeds, encoder });
  t.after(() => value.close()); return value;
}
const ids = result => result.items.map(item => item.person.id);

test('high neural scores cannot substitute a barcode badge for NFC reading', async t => {
  const encoder = new MisleadingEncoder(); encoder.scores = { contactless: 2, barcode: 100 };
  const value = service(t, [
    profile('contactless', { bio: 'TASK:contactless Реализую NFC чтение карты приложением смартфона.' }),
    profile('barcode', { bio: 'TASK:barcode Показываю штрихкод пропуска на экране телефона.' }),
  ], encoder);
  const result = await value.search('Смартфоном нужно прочитать бесконтактную метку пропуска.');
  assert.deepEqual(ids(result), ['contactless']);
  assert.equal(result.items[0].rerankerScore, 2);
  assert.equal(encoder.info.reranker.threshold, 0.5);
});

test('high neural scores cannot substitute password login for a physical authentication key', async t => {
  const encoder = new MisleadingEncoder(); encoder.scores = { physical: 2, password: 100 };
  const value = service(t, [
    profile('physical', { bio: 'TASK:physical Проверяю вход с аппаратным аутентификатором и привязку подтверждения к домену.' }),
    profile('password', { bio: 'TASK:password Проверяю пароль, одноразовый код и лимиты неудачных входов.' }),
  ], encoder);
  assert.deepEqual(ids(await value.search('Нужен вход без пароля с физическим ключом.')), ['physical']);
});

test('a narrative denial cannot be overridden by exact stack identity or a high test score', async t => {
  const encoder = new MisleadingEncoder(); encoder.scores = { denied: 100, implemented: 2 };
  const value = service(t, [
    profile('denied', { bio: 'TASK:denied Чтение NFC не реализовывал.', stack: ['NFC'],
      confirmed: { specialization: 'Mobile', grade: 'Middle', score: 100 } }),
    profile('implemented', { bio: 'TASK:implemented Разрабатываю считывание NFC данных и восстановление сеанса.' }),
  ], encoder);
  assert.deepEqual(ids(await value.search('Нужно NFC чтение пропуска.')), ['implemented']);
});

test('a sparse identity is evidence only when the original biography and work history are absent', async t => {
  const value = service(t, [
    profile('sparse', { stack: ['NFC'] }),
    profile('denial-only', { bio: 'Без опыта NFC.', stack: ['NFC'] }),
  ]);
  assert.deepEqual(ids(await value.search('Нужно NFC.')), ['sparse']);
});

test('sparse stack competencies cannot override a factual disclaimer in education or achievements', async t => {
  const value = service(t, [
    profile('sparse', { stack: ['NFC'] }),
    profile('education-denial', { education: 'Настройка NFC мне незнакома.', stack: ['NFC'] }),
    profile('achievement-denial', { careerAchievements: 'Нет коммерческого опыта NFC.', stack: ['NFC'] }),
  ]);
  assert.deepEqual(ids(await value.search('Нужно NFC.')), ['sparse']);
});

test('later positive work is not rejected because an older sentence denies past experience', async t => {
  const bio = 'Раньше не работал с NFC. TASK:later В новом проекте реализовал NFC чтение пропуска.';
  const value = service(t, [profile('later', { bio })]);
  const result = await value.search('Нужно читать NFC метки.');
  assert.deepEqual(ids(result), ['later']);
  assert.equal(result.items[0].person.bio, bio, 'Public professional facts remain intact');
  assert.doesNotMatch(result.items[0].reason, /Раньше не работал/u);
});

test('the legacy cosine-only pipeline applies the same specific method evidence constraint', async t => {
  const encoder = new MisleadingEncoder(); delete encoder.info.reranker;
  const value = service(t, [
    profile('implemented', { bio: 'Делаю чтение NFC меток.' }),
    profile('wrong', { bio: 'Разрабатываю экран штрихкода.', stack: ['NFC'] }),
    profile('denied', { bio: 'NFC не выполнял.', stack: ['NFC'] }),
  ], encoder);
  assert.deepEqual(ids(await value.search('Нужно NFC.')), ['implemented']);
  assert.equal(encoder.rankCalls.length, 0);
});

test('structured browsing remains available for a profile that explicitly lacks a particular task', async t => {
  const encoder = new MisleadingEncoder();
  const value = service(t, [profile('denied', { bio: 'NFC не выполнял.', stack: ['NFC'] })], encoder);
  const result = await value.search('', { specialization: 'Mobile', stack: ['NFC'] });
  assert.deepEqual(ids(result), ['denied']);
  assert.equal(result.items[0].person.bio, 'NFC не выполнял.');
  assert.equal(encoder.calls.length, 0); assert.equal(encoder.rankCalls.length, 0);
});

test('the approximate admission floor cannot reintroduce profiles missing or denying a required method', async t => {
  const encoder = new MisleadingEncoder(); encoder.info.reranker.scoreCalibration = fusion();
  encoder.scores = { correct: 2, absent: 8, denied: 9 };
  const value = service(t, [
    profile('correct', { bio: 'TASK:correct Разрабатываю чтение NFC меток смартфоном.' }),
    profile('absent', { bio: 'TASK:absent Делаю мобильные формы и экран штрихкода.' }),
    profile('denied', { bio: 'TASK:denied Мобильный экран готов. NFC не выполнял.', stack: ['NFC'] }),
  ], encoder);
  const result = await value.search('Прочитать NFC метку телефоном.');
  assert.deepEqual(ids(result), ['correct']);
  assert.equal(result.items[0].approximate, true);
  assert.deepEqual(result.warnings, ['Точных совпадений нет. Показаны ближайшие профили.']);
  assert.equal(encoder.info.reranker.scoreCalibration.threshold, 10);
  assert.equal(encoder.info.reranker.scoreCalibration.admission.threshold, 1);
});

test('declared task evidence excludes company and conditions copy while preserving professional requirements', async t => {
  const value = service(t, [
    profile('nfc-only', { bio: 'TASK:nfc-only Разрабатываю чтение NFC меток телефоном.' }),
    profile('nfc-k8s', { bio: 'TASK:nfc-k8s Разрабатываю чтение NFC меток телефоном.',
      stack: ['Kubernetes'], workHistory: 'Эксплуатирую Kubernetes для мобильных сервисов.' }),
  ]);
  const wrapped = 'Компания: интегратор OAuth. Конкретная задача: Читать NFC метки телефоном. Условия: инфраструктура Kubernetes.';
  assert.deepEqual(new Set(ids(await value.search(wrapped))), new Set(['nfc-only', 'nfc-k8s']),
    'Company technology and working conditions are not professional task requirements');
  const required = 'Компания: интегратор OAuth. Конкретная задача: Читать NFC метки телефоном. Требования: Kubernetes.';
  assert.deepEqual(ids(await value.search(required)), ['nfc-k8s'],
    'A technology in the professional requirements remains mandatory');
});

test('an unheaded hiring requirement remains mandatory before an explicitly declared task', async t => {
  const value = service(t, [
    profile('nfc', { bio: 'Разрабатываю мобильный пропуск и чтение NFC телефоном.' }),
    profile('barcode', { bio: 'Разрабатываю мобильный пропуск с экраном штрихкода.' }),
  ]);
  assert.deepEqual(ids(await value.search('Нужен специалист по NFC. Конкретная задача: Разрабатывать мобильный пропуск.')),
    ['nfc']);
});
