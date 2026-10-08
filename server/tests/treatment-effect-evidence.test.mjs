import test from 'node:test';
import assert from 'node:assert/strict';
import { queryEvidenceRequirements, assessTaskEvidence, positiveProfessionalContent } from '../search-evidence.mjs';

const effect = [{ anyOf: ['individual-treatment-effect'] }];
const evidence = (query, ...sections) => assessTaskEvidence(queryEvidenceRequirements(query), sections);

test('explicit CATE and individual causal effect paraphrases require treatment-effect evidence', () => {
  for (const query of ['Построить CATE модель.', 'Нужен uplift.', 'Обучить индивидуальный эффект воздействия.',
    'Оценка добавочного эффекта сообщения для каждого клиента.',
    'Ищем оценку причинного прироста вероятности покупки у отдельного человека.',
    'Для каждого абонента оценить, насколько подарок снизит риск ухода относительно отсутствия подарка.']) {
    assert.deepEqual(queryEvidenceRequirements(query), effect, query);
    assert.equal(evidence(query, 'Прогнозирую покупку и отток клиента по его поведению.').eligible, false, query);
    assert.equal(evidence(query, 'Обучаю модели индивидуального эффекта воздействия на удержание.').eligible, true, query);
  }
});

test('aggregate experiments, ordinary propensity and unrelated individual work stay outside this policy', () => {
  for (const query of ['Нужно спрогнозировать вероятность покупки клиента.',
    'Оценить общий эффект скидки в A/B эксперименте.',
    'Нужен индивидуальный подход к каждому пользователю.',
    'Рассчитать для каждого клиента время доставки сообщения.',
    'Выбрать клиентов с высоким риском ухода.']) assert.deepEqual(queryEvidenceRequirements(query), [], query);
  assert.deepEqual(queryEvidenceRequirements('CATEgory feature и uplifted widget.'), []);
});

test('denied causal evaluation cannot outweigh the actual propensity claim', () => {
  const text = 'Прогнозирую вероятность покупки клиента. Причинный эффект воздействия у каждого клиента не оценивал.';
  assert.equal(evidence('Нужен CATE.', text).eligible, false);
  assert.equal(evidence('Нужен CATE.', 'Индивидуальный эффект воздействия не оценивал.').requirements[0].status, 'negative');
  assert.equal(evidence('Нужен uplift.', 'Uplift-модель не оценил.').eligible, false);
  assert.doesNotMatch(positiveProfessionalContent(text), /не оценивал/u);
  assert.match(positiveProfessionalContent(text), /вероятность покупки/u);
});

test('optional, excluded and prospective causal concepts do not become false requirements or evidence', () => {
  for (const query of ['CATE не обязательно.', 'Желательно uplift.', 'Не нужен CATE.']) assert.deepEqual(queryEvidenceRequirements(query), [], query);
  assert.equal(evidence('Нужен CATE.', 'Хочу изучить CATE.').eligible, false);
  assert.equal(evidence('Нужен uplift.', 'Без опыта работы с uplift.').eligible, false);
  assert.equal(evidence('Нужен CATE.', 'Не только реализовывал CATE, но и проверял эффект на контроле.').eligible, true);
});

test('later affirmative experience overrides an earlier denial but stack alone cannot erase it', () => {
  const query = 'Нужен CATE.';
  const denial = 'CATE не оценивал.';
  const requirements = queryEvidenceRequirements(query);
  assert.equal(assessTaskEvidence(requirements, [denial], { competencySections: ['CATE'] }).eligible, false);
  assert.equal(assessTaskEvidence(requirements, [denial, 'Затем реализовал CATE-модель.']).eligible, true);
});
