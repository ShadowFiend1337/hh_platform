import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectoryService } from '../directory.mjs';
import { semanticEvidenceSections, semanticRerankingSections } from '../directory-store.mjs';
import { assessTaskEvidence, queryEvidenceRequirements } from '../search-evidence.mjs';

// Authored boundary cases exercise evidence admission with deliberately high
// model scores. They do not measure the quality of a trained neural model.
const query = 'Нужно читать NFC метки.';
const profile = (id, workHistory) => ({ id, name: 'Вымышленный ' + id,
  professionalRole: 'Мобильный разработчик', specialization: 'Mobile', desiredGrade: 'Middle',
  confirmed: { specialization: 'Mobile', grade: 'Middle', score: 90 },
  visible: true, consent: true, synthetic: true, bio: '', stack: ['NFC'], workHistory,
  careerAchievements: '', education: '', city: 'Москва', industry: 'ИТ', format: 'Гибрид',
  employmentType: 'Полная занятость', experienceMonths: 36,
  salaryFrom: 100000, salaryTo: 150000, languageCodes: ['ru'], achievements: [],
});

class HighScoreEncoder {
  info = { status: 'ready', name: 'Authored boundary test double', version: 'boundary-test-v1',
    dimension: 2, trained: true, threshold: 0.75,
    reranker: { version: 'boundary-ranker', threshold: 0.5,
      baseModel: 'fixture/cross-encoder', revision: 'a'.repeat(40), maxLength: 512 } };
  calls = []; rankCalls = [];
  async start() { return this.info; }
  async encode(texts) { this.calls.push(texts); return texts.map(() => [1, 0]); }
  async rerank(query, passages) {
    this.rankCalls.push({ query, passages });
    return passages.map(() => 100);
  }
  close() {}
}

function service(t, person, encoder) {
  const value = new DirectoryService(':memory:', { seeds: [person], encoder });
  t.after(() => value.close()); return value;
}

test('the model passage cutoff cannot split a denial into affirmative protocol evidence', async t => {
  const workHistory = 'Создаю мобильные формы. ' + ' '.repeat(10) + 'Раньше NFC не делал. '.repeat(230);
  assert(workHistory.length > 4000 && workHistory.length <= 20000);
  assert.match(workHistory.slice(0, 4000), /Раньше NFC не дела$/u,
    'The old passage cutoff removes the end of the denial predicate');
  const person = profile('denied', workHistory), requirements = queryEvidenceRequirements(query);
  assert.equal(assessTaskEvidence(requirements, [workHistory.slice(0, 4000)]).eligible, true,
    'The truncated claim demonstrates the unsafe interpretation this regression guards against');
  assert.equal(assessTaskEvidence(requirements, semanticEvidenceSections(person)).eligible, false);
  assert.deepEqual(semanticRerankingSections(person), [{ text: 'Создаю мобильные формы', kind: 'professional' }]);
  const encoder = new HighScoreEncoder();
  const result = await service(t, person, encoder).search(query);
  assert.equal(result.total, 0, 'Even a high neural score cannot supply the denied NFC work');
  assert.equal(encoder.rankCalls.length, 0);
  assert.equal(encoder.info.reranker.threshold, 0.5);
});

test('later affirmative work beyond the raw passage cutoff stays eligible and uses bounded positive model input', async t => {
  const actualWork = 'В новом проекте реализую NFC чтение меток';
  const workHistory = 'Работа над приложением. ' + 'Раньше NFC не делал. '.repeat(230) + actualWork + '.';
  assert(workHistory.indexOf(actualWork) > 4000 && workHistory.length <= 20000);
  const person = profile('later', workHistory), requirements = queryEvidenceRequirements(query);
  assert.equal(assessTaskEvidence(requirements, [workHistory.slice(0, 4000)]).eligible, false,
    'The old cutoff hides the later affirmative claim');
  assert.equal(assessTaskEvidence(requirements, semanticEvidenceSections(person)).eligible, true);
  const encoder = new HighScoreEncoder();
  const result = await service(t, person, encoder).search(query);
  assert.deepEqual(result.items.map(item => item.person.id), ['later']);
  assert.equal(result.items[0].person.workHistory, workHistory, 'The public professional history remains intact');
  assert.match(result.items[0].reason, /В новом проекте реализую NFC чтение меток/u);
  assert.doesNotMatch(result.items[0].reason, /Раньше NFC не делал/u);
  const documents = encoder.calls.flat().filter(text => text !== query && text !== 'читать NFC метки');
  assert(documents.every(text => text.length <= 4000), 'Full raw evidence stays outside the worker passage budget');
  assert(documents.some(text => text.includes(actualWork)));
  assert(encoder.rankCalls.flatMap(call => call.passages).every(text => !text.includes('не делал')));
  assert.equal(encoder.info.reranker.threshold, 0.5);
});
