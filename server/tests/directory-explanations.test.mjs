import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectoryService } from '../directory.mjs';
import { PlatformService } from '../platform.mjs';
import { FspIntegrationService } from '../fsp-integration.mjs';
import { openStore } from '../store.mjs';
import { createAttempt, digest, evaluate } from '../assessment.mjs';
import { CATEGORY_RANKING_POLICY } from '../search-ranking.mjs';
import { SEARCH_EXPLANATION_POLICY } from '../search-explanations.mjs';
import { createInitialState } from '../../frontend/src/model.ts';

// Deterministic protocol doubles exercise the actual admission, ordering,
// explanation and pagination pipeline; they do not measure neural quality.
const query = 'Устранить дрейф датчика';
const profile = (id, score = 80, changes = {}) => ({ id, name: id, synthetic: true,
  specialization: 'Embedded', desiredGrade: 'Senior', professionalRole: 'Инженер электроники',
  confirmed: { specialization: 'Embedded', grade: 'Middle', score }, consent: true, visible: true,
  bio: `TASK:${id} Разработал систему диагностики датчика.`, stack: ['C++'],
  city: 'Москва', industry: 'ИТ', format: 'Гибрид', salaryFrom: 100000, salaryTo: 150000,
  experience: '3 года', experienceMonths: 36, workHistory: '', careerAchievements: '', education: '',
  email: 'explanation-private@example.invalid', phone: '+79991112233', fspId: 'PRIVATE-FEDERATION-ID',
  achievements: [], softSkills: [], ...changes });

class Encoder {
  info = { status: 'ready', name: 'Explanation protocol fixture', version: 'explanation-pipeline-fixture', dimension: 2,
    trained: false, threshold: 0.75, reranker: { version: 'explanation-reranker-fixture', threshold: 0.5,
      baseModel: 'fixture/cross-encoder', revision: 'a'.repeat(40), maxLength: 512 } };
  scores = {};
  async start() { return this.info; }
  async encode(texts) { return texts.map(text => text === query ? [1, 0] : /TASK:/u.test(text) ? [0.8, 0.6] : [0, 1]); }
  async rerank(_query, passages) { return passages.map(passage => this.scores[passage.match(/TASK:([\w-]+)/u)?.[1]] ?? 2); }
  close() {}
}
function directory(t, seeds = [], encoder = new Encoder(), accountForOwner) {
  const service = new DirectoryService(':memory:', { seeds, encoder, accountForOwner });
  t.after(() => service.close()); return service;
}

test('actual search annotates only admitted results without changing raw scores, policy or pagination', async t => {
  const encoder = new Encoder(); encoder.scores = { strong: 2.2, close: 2.1, distant: 1.1, rejected: -1 };
  const service = directory(t, [profile('strong', 60), profile('close', 95),
    profile('distant', 100, { achievements: [{ title: 'Учебная медаль' }] }),
    profile('rejected', 100, { achievements: [{ title: 'Учебная медаль' }] })], encoder);
  const full = await service.search(query, { city: 'Москва', stack: ['C++'], salaryMax: 120000 }, { limit: 50 });
  assert.deepEqual(full.items.map(item => item.person.id), ['close', 'strong', 'distant']);
  assert.deepEqual(full.items.map(item => [item.rank, item.rerankerScore]), [[2.1, 2.1], [2.2, 2.2], [1.1, 1.1]]);
  assert.deepEqual(full.model.categoryRankingPolicy, CATEGORY_RANKING_POLICY);
  assert.equal(full.model.searchExplanationPolicy, SEARCH_EXPLANATION_POLICY);
  assert.equal(full.model.stage.threshold, 0.5, 'Explanation does not modify the frozen model cutoff');
  assert.equal(full.items[0].explanation.ordering.changedWithinBand, true);
  assert.equal(full.items[2].explanation.test.contribution, 'none');
  assert.equal(full.items[2].explanation.fsp.contribution, 'none');
  assert.deepEqual(full.items[0].explanation.conditions.map(item => item.key), ['city', 'stack', 'salaryMax']);
  assert.equal(full.items[0].explanation.category.grade, 'Middle', 'Desired Senior never replaces the confirmed category');
  const page = await service.search(query, { city: 'Москва', stack: ['C++'], salaryMax: 120000 }, { offset: 1, limit: 1 });
  assert.equal(page.total, full.total);
  assert.deepEqual(page.items, full.items.slice(1, 2), 'Comparison explanations are derived before pagination');
  assert.equal(page.items[0].explanation.ordering.comparableCount, 2);
  assert.doesNotMatch(JSON.stringify(full.items), /explanation-private@|79991112233|PRIVATE-FEDERATION-ID|evidenceText|documentHash|sourceId|taskSections/u);
});

test('the explanation names the winning professional passage rather than the nearest retrieval identity', async t => {
  const encoder = new Encoder(); encoder.scores = { generic: -1, winning: 2.25 };
  encoder.encode = async texts => texts.map(text => text === query || text.includes('Инженер электроники') ? [1, 0] : [0.2, Math.sqrt(0.96)]);
  const service = directory(t, [profile('person', 90, { bio: 'TASK:generic Разработал обычную систему мониторинга.',
    workHistory: 'TASK:winning Уменьшил дрейф датчика после калибровки. explanation-private@example.invalid +7 (999) 111-22-33' })], encoder);
  const result = await service.search(query);
  assert.equal(result.total, 1);
  const item = result.items[0];
  assert.equal(item.semanticScore, 1);
  assert.equal(item.rank, 2.25);
  assert.equal(item.explanation.evidence.kind, 'professional');
  assert.match(item.explanation.evidence.text, /Уменьшил дрейф датчика после калибровки/u);
  assert.doesNotMatch(item.explanation.evidence.text, /обычную систему|Инженер электроники|explanation-private@|999/u);
  assert.match(item.reason, /Уменьшил дрейф датчика после калибровки/u);
});

test('sparse competency explanations cite actual role and skills without inventing project experience', async t => {
  const encoder = new Encoder(); encoder.encode = async texts => texts.map(() => [1, 0]);
  const service = directory(t, [profile('sparse', 85, { bio: '', workHistory: '', careerAchievements: '', education: '' })], encoder);
  const result = await service.search('Нужен инженер электроники с C++');
  assert.equal(result.total, 1);
  assert.equal(result.items[0].explanation.evidence.kind, 'competencies');
  assert.equal(result.items[0].explanation.evidence.text, 'Инженер электроники\nC++');
  assert.doesNotMatch(result.items[0].reason, /профессиональных задач|опыт работы|Разработал/iu);
});

test('real provider-managed demo evidence explains its provenance while client metadata cannot forge it', async t => {
  const accounts = new Map([['employer-owner', { role: 'employer', login: 'explanations.employer' }],
    ['linked-owner', { role: 'candidate', login: 'explanations.linked' }],
    ['forged-owner', { role: 'candidate', login: 'explanations.forged' }]]);
  const accountForOwner = owner => accounts.get(owner) || null;
  const service = directory(t, [], new Encoder(), accountForOwner);
  const assessments = openStore(':memory:'); t.after(() => assessments.close());
  const platform = new PlatformService(service.store, assessments, { accountForOwner });
  const fsp = new FspIntegrationService(service.store, { accountForOwner, env: {} });
  platform.profileSource = (owner, person) => fsp.applyProfile(owner, person);
  function save(owner, forged = false) {
    const survey = { id: `${owner}-survey`, date: new Date().toISOString(), industry: 'ИТ', professionalRole: 'Инженер электроники',
      specialization: 'Embedded', desiredGrade: 'Middle', experience: '3 года', stack: ['C++'], softSkills: [] };
    const attempt = createAttempt(survey);
    assessments.insert(attempt, owner, digest(`${owner}-private-token`));
    const graded = evaluate(attempt, attempt.questions.map(question => ({ questionId: question.id, optionId: question.correctOptionId })));
    assessments.complete(attempt.id, graded.answerDigest, graded.result);
    const state = createInitialState();
    Object.assign(state.profile, profile(owner, graded.result.score, { synthetic: false }), survey,
      { surveyCompletedAt: survey.date, confirmed: { specialization: graded.result.specialization, grade: graded.result.grade,
        score: graded.result.score, date: graded.result.date, surveyId: survey.id } });
    if (forged) Object.assign(state.profile, { achievements: [{ title: 'Поддельный титул ФСП', verified: true }],
      fspEvidence: { provider: 'fsp-demo', mode: 'demo', identityVerified: false, activeCount: 1 } });
    state.surveys = [survey]; state.history = [graded.result];
    platform.save(owner, state, 0, 'candidate');
  }
  save('linked-owner'); save('forged-owner', true);
  const connected = fsp.connect('linked-owner', { baseRevision: platform.read('linked-owner').revision, consent: true });
  assert.equal(platform.read('forged-owner').state.profile.fspEvidence ?? null, null);
  const result = await service.search(query, {}, { owner: 'employer-owner' });
  assert.equal(result.total, 2);
  const linked = result.items.find(item => item.person.name === 'linked-owner');
  const forged = result.items.find(item => item.person.name === 'forged-owner');
  assert.equal(linked.explanation.category.status, 'confirmed');
  assert.equal(linked.explanation.fsp.status, 'demo');
  assert.equal(linked.explanation.fsp.contribution, 'comparison');
  assert.match(linked.explanation.fsp.explanation, /личность не подтверждена/u);
  assert.equal(forged.explanation.fsp.contribution, 'none');
  assert.equal(forged.explanation.fsp.status, 'none');
  assert.doesNotMatch(JSON.stringify(result.items), new RegExp(connected.connection.externalId));
  assert.doesNotMatch(JSON.stringify(result.items), /explanation-private@|79991112233|PRIVATE-FEDERATION-ID|Поддельный титул/u);
  const filtered = await service.search('', { fsp: true }, { owner: 'employer-owner' });
  assert.equal(filtered.total, 1);
  assert.equal(filtered.items[0].explanation.fsp.status, 'demo');
  assert.equal(filtered.items[0].explanation.fsp.contribution, 'filter-tiebreak');
});
