import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectoryService } from '../directory.mjs';

// These authored model doubles test evidence admission, not neural quality.
// The fixture reuses the existing DEV descriptor shape; no model artifact or
// production calibration parameter is changed by these cases.
const query = 'Нужен специалист, который устранит дрейф датчика';
const profile = (id, changes = {}) => ({ id, name: 'Вымышленный ' + id,
  professionalRole: 'Инженер электроники', specialization: 'Embedded', desiredGrade: 'Middle',
  confirmed: { specialization: 'Embedded', grade: 'Middle', score: 90 },
  visible: true, consent: true, synthetic: true, bio: '', stack: ['C++'],
  workHistory: '', careerAchievements: '', education: '', achievements: [],
  city: 'Москва', industry: 'ИТ', format: 'Гибрид', employmentType: 'Полная занятость',
  experienceMonths: 40, salaryFrom: 100000, salaryTo: 150000, languageCodes: ['ru'], ...changes });

const calibration = () => ({
  kind: 'pooled-LDA-diagonal-shrinkage-v1', weights: [0, 1], bias: 0, threshold: 4, shrink: 0.1, split: 'dev',
  featurePolicy: { features: ['encoderCosine', 'crossEncoderRawLogit'], encoderQueryContext: 'raw-query',
    encoderDocumentContext: 'task-section-without-role', crossEncoderQueryContext: 'raw-query',
    crossEncoderDocumentContext: 'catalog-professional-role-newline-task-section',
    aggregation: 'maximum-fused-score-over-task-sections', formula: 'weights[0]*encoderCosine+weights[1]*crossEncoderRawLogit+bias' },
  hashes: { fixture: 'a'.repeat(64) }, DEVmetrics: { resubstitution: true },
  admission: { kind: 'query-max-applicability-top3-v1', threshold: 2, limit: 3, split: 'dev',
    metrics: { resubstitution: true, heldOutScored: false, functionalBenchmarkScored: false },
    hashes: { fixture: 'b'.repeat(64) } },
});

class Encoder {
  info = { status: 'ready', name: 'Authored competency admission double', version: 'competency-admission-v1',
    dimension: 2, trained: true, threshold: 0.75,
    reranker: { version: 'competency-ranker', threshold: 0.5, baseModel: 'fixture/cross-encoder',
      revision: 'a'.repeat(40), maxLength: 512, scoreCalibration: calibration() } };
  competencyScore = 3;
  professionalScores = {};
  async start() { return this.info; }
  async encode(texts) { return texts.map(() => [1, 0]); }
  async rerank(query, passages) {
    return passages.map(passage => {
      const id = passage.match(/TASK:([\w-]+)/u)?.[1];
      return id ? this.professionalScores[id] ?? 3 : this.competencyScore;
    });
  }
  close() {}
}

function service(t, seeds, encoder) {
  const value = new DirectoryService(':memory:', { seeds, encoder });
  t.after(() => value.close()); return value;
}
const ids = result => result.items.map(item => item.person.id);

test('an explicit profession and skill filter cannot authorize the narrative DEV floor for sparse competencies', async t => {
  const encoder = new Encoder(), stage = structuredClone(encoder.info.reranker);
  const value = service(t, [profile('sparse')], encoder);
  const result = await value.search('Нужен инженер электроники с C++', { specialization: 'Embedded', stack: ['C++'] });
  assert.equal(result.total, 0, 'The competency score lies above the narrative floor but below the unchanged strong cutoff');
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.effectiveFilters.stack, ['C++']);
  assert.equal(result.effectiveFilters.specialization, 'Embedded');
  assert.equal(result.model.profileEvidencePolicy, 'professional-sections-with-strict-sparse-competencies-v2');
  assert.deepEqual(encoder.info.reranker, stage, 'Neither explicit scope nor content policy changes the frozen calibration');
});

test('sparse competencies above the frozen strong cutoff remain a strong result', async t => {
  const encoder = new Encoder(); encoder.competencyScore = 5;
  const stage = structuredClone(encoder.info.reranker);
  const result = await service(t, [profile('sparse')], encoder).search(query);
  assert.deepEqual(ids(result), ['sparse']);
  assert.equal(result.items[0].evidenceKind, 'competencies');
  assert.equal(result.items[0].rank, 5);
  assert.equal(result.items[0].approximate, undefined);
  assert.match(result.items[0].reason, /Роль и навыки в профиле/u);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(encoder.info.reranker, stage);
});

test('empty strong results admit a narrative near match while excluding a higher-scoring sparse competency', async t => {
  const encoder = new Encoder(); encoder.competencyScore = 3.5;
  encoder.professionalScores = { narrative: 3 };
  const stage = structuredClone(encoder.info.reranker);
  const result = await service(t, [profile('sparse'), profile('narrative', {
    bio: 'TASK:narrative Диагностирую датчики и калибрую показания.',
  })], encoder).search(query);
  assert.deepEqual(ids(result), ['narrative']);
  assert.equal(result.items[0].evidenceKind, 'professional');
  assert.equal(result.items[0].rank, 3);
  assert.equal(result.items[0].approximate, true);
  assert.deepEqual(result.warnings, ['Точных совпадений нет. Показаны ближайшие профили.']);
  assert.deepEqual(encoder.info.reranker, stage);
});

test('a strong sparse competency preserves the existing rule against appending narrative approximate matches', async t => {
  const encoder = new Encoder(); encoder.competencyScore = 5;
  encoder.professionalScores = { narrative: 3 };
  const stage = structuredClone(encoder.info.reranker);
  const result = await service(t, [profile('sparse'), profile('narrative', {
    workHistory: 'TASK:narrative Проверяю стабильность измерений датчика.',
  })], encoder).search(query);
  assert.deepEqual(ids(result), ['sparse']);
  assert.equal(result.items[0].evidenceKind, 'competencies');
  assert.equal(result.items[0].approximate, undefined);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(encoder.info.reranker, stage);
});
