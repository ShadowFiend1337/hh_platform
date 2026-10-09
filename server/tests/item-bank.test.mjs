import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { programs } from '../bank.mjs';
import { createAttempt, evaluate } from '../assessment.mjs';
import { GENERATED_MAX_EXPOSURES, ItemBank, PILOT_MIN_RESPONSES, pointBiserial, textSimilarity } from '../item-bank.mjs';
import { checkGeneratedItem, generateFamilyItems } from '../item-generator.mjs';

const time = Date.parse('2026-10-09T10:00:00.000Z');
const survey = { id: 'bank-survey', date: new Date(time).toISOString(), industry: 'ИТ', professionalRole: 'Backend разработчик',
  specialization: 'Backend', desiredGrade: 'Middle', experience: '3 года', stack: ['PostgreSQL'], softSkills: [] };
const familyId = 'bm-transactions-concurrency';
const good = {
  text: 'Два обработчика одновременно списывают бонусы с одного счёта и оба читают баланс 100. Как не допустить отрицательного остатка без глобальной блокировки таблицы?',
  options: ['Условное обновление с проверкой баланса в одном SQL-запросе', 'Проверять баланс в коде перед каждым запросом',
    'Увеличить таймаут соединения с базой данных', 'Повторять списание до успеха без проверки'],
  correct: 0, explanation: 'Проверка и изменение выполняются атомарно.', skills: ['SQL', 'Транзакции'],
};

function bankFixture() {
  const db = new DatabaseSync(':memory:');
  let clock = time;
  const bank = new ItemBank(db, { programs, now: () => clock });
  return { db, bank, advance: ms => { clock += ms; } };
}
function addPilot(bank, item = good) {
  const family = bank.family(familyId);
  return bank.addGenerated(family, item, { generator: 'mock', verifier: 'mock-solver', verification: { accepted: true } });
}

test('generated items start as unscored pilots and never enter scored slots before approval', () => {
  const { bank } = bankFixture();
  const pilot = addPilot(bank);
  assert.equal(pilot.status, 'pilot');
  assert.equal(addPilot(bank), null, 'An identical item is a duplicate by fingerprint');
  for (let index = 0; index < 30; index++) {
    const attempt = createAttempt(survey, '', [], time, { bank });
    const pilots = attempt.questions.filter(question => question.pilot);
    assert.equal(pilots.length, 1); assert.equal(pilots[0].variantId, pilot.id);
    assert.notEqual(attempt.questions[0].pilot, true, 'The opening question always counts');
    assert.equal(attempt.questions.filter(question => !question.pilot).length, 12);
    assert(attempt.questions.filter(question => !question.pilot).every(question => question.origin === 'seed'));
    // The pilot never changes the score: all scored correct, pilot wrong -> 100.
    const answers = attempt.questions.map(question => ({ questionId: question.id,
      optionId: question.pilot ? question.options.find(option => option.id !== question.correctOptionId).id : question.correctOptionId }));
    assert.equal(evaluate(attempt, answers, time + 1000).result.score, 100);
  }
});

test('expert approval moves a pilot into the scored pool of its family', () => {
  const { bank } = bankFixture();
  const pilot = addPilot(bank);
  assert(bank.setStatus(pilot.id, 'active', { decidedBy: 'expert:test' }));
  const family = bank.family(familyId);
  assert(bank.scoredVariants(family).some(item => item.id === pilot.id));
  let seenGenerated = false;
  for (let index = 0; index < 60 && !seenGenerated; index++) {
    const attempt = createAttempt(survey, '', [], time, { bank });
    seenGenerated = attempt.questions.some(question => question.variantId === pilot.id && !question.pilot);
  }
  assert(seenGenerated, 'An approved item is selectable as a scored question');
  assert.equal(bank.row(pilot.id).review.history.at(-1).by, 'expert:test');
});

test('statistical calibration promotes a pilot within the family band and retires a misfit', () => {
  const { bank } = bankFixture();
  const fit = addPilot(bank);
  const misfit = addPilot(bank, { ...good, text: 'Совсем другая ситуация: очередь заказов растёт, а обработчик не успевает. Что из этого увеличит пропускную способность без потери заказов?',
    options: ['Пакетная обработка с подтверждением', 'Удалять старые заказы', 'Отключить журнал', 'Подтверждать до обработки'] });
  for (let index = 0; index < PILOT_MIN_RESPONSES; index++) {
    // Fit: two of three answer correctly (near the family prior), stronger attempts more often.
    bank.recordResponses([{ itemId: fit.id, correct: index % 3 !== 0, ms: 30000 }], index % 3 !== 0 ? 85 : 60);
    // Misfit: almost everybody fails, independent of ability.
    bank.recordResponses([{ itemId: misfit.id, correct: index === 0, ms: 30000 }], 90);
  }
  assert.equal(bank.row(fit.id).status, 'active');
  assert.equal(bank.row(misfit.id).status, 'retired');
  assert.equal(typeof bank.row(fit.id).review.calibration.p, 'number');
});

test('overexposed active generated items retire; authored items stay', () => {
  const { bank } = bankFixture();
  const item = addPilot(bank);
  bank.setStatus(item.id, 'active', { decidedBy: 'expert:test' });
  for (let index = 0; index < GENERATED_MAX_EXPOSURES; index++) bank.recordExposure([item.id, 'bm-transactions-concurrency-a']);
  assert.equal(bank.row(item.id).status, 'retired');
  assert(bank.scoredVariants(bank.family(familyId)).some(variant => variant.id === 'bm-transactions-concurrency-a'));
  assert.equal(bank.stats('bm-transactions-concurrency-a').exposures, GENERATED_MAX_EXPOSURES);
});

test('less exposed items are preferred and an owner does not see the same items twice while fresh ones remain', () => {
  const { bank } = bankFixture();
  const family = bank.family(familyId);
  const counts = new Map();
  bank.recordExposure(Array.from({ length: 200 }, () => family.variants[0].id));
  for (let index = 0; index < 400; index++) {
    for (const item of bank.pick(family, 2)) counts.set(item.id, (counts.get(item.id) || 0) + 1);
  }
  assert(counts.get(family.variants[0].id) < counts.get(family.variants[1].id) / 3, 'Heavily exposed item is rarely chosen');
  const seen = new Set(family.variants.slice(0, 2).map(variant => variant.id));
  for (let index = 0; index < 50; index++) assert(bank.pick(family, 2, { seen }).every(item => !seen.has(item.id)));
});

test('local checks reject answer cues, banned options, personal data and paraphrased duplicates', () => {
  const family = programs.Backend.Middle.families.find(item => item.id === familyId);
  assert(checkGeneratedItem(good, family, []).item);
  assert.match(checkGeneratedItem({ ...good, options: [...good.options.slice(0, 3), 'Все перечисленное'] }, family).error, /Запрещённая/u);
  assert.match(checkGeneratedItem({ ...good, options: [good.options[0] + ' и дополнительно журнал аудита с подробной трассировкой каждого шага и уведомлением владельца', 'А', 'Б', 'В'] }, family).error, /длиной/u);
  assert.match(checkGeneratedItem({ ...good, text: good.text + ' Пишите на hr@example.com.' }, family).error, /персональные/u);
  assert.match(checkGeneratedItem(good, family, [good.text.replace('бонусы', 'баллы')]).error, /похоже/u);
  assert.match(checkGeneratedItem({ ...good, options: [good.options[0], good.options[0], 'x', 'y'] }, family).error, /повторяются/u);
  assert(textSimilarity(good.text, good.text) > 0.99);
  assert.equal(pointBiserial({ responses: 4, correct: 4, scoreSum: 3, scoreCorrectSum: 3, scoreSquareSum: 2.5 }), null);
});

test('the solver rejects a paraphrase of an existing item even with the right answer', async () => {
  const { bank } = bankFixture();
  let solverInput = '';
  const llm = { configured: true, models: { chat: 'qwen/mock', verifier: 'deepseek/mock' }, async chat(options) {
    if (options.model === 'deepseek/mock') {
      solverInput = options.messages[1].content;
      const line = solverInput.split('\n').find(row => row.includes(good.options[0]));
      return { model: 'deepseek/mock', json: { answer: line.slice(0, 1), confidence: 0.9, ambiguous: false, duplicateOf: 2 } };
    }
    return { model: 'qwen/mock', json: { items: [good] } };
  } };
  const result = await generateFamilyItems({ llm, bank, familyId, count: 1 });
  assert.equal(result.accepted.length, 0);
  assert.deepEqual(result.rejected, ['Пересказ существующего вопроса.']);
  assert(solverInput.includes('Существующие вопросы банка'), 'The solver sees the family items and their answers');
});

test('generation keeps only items the independent solver answers with the key', async () => {
  const { bank } = bankFixture();
  const wrong = { ...good, text: 'Сервис платежей получает повторный запрос после таймаута клиента. Какое решение исключит двойное списание при повторе?',
    options: ['Новый идентификатор на каждый повтор', 'Ключ идемпотентности операции с сохранением результата', 'Увеличить таймаут клиента', 'Отключить повторы'], correct: 0 };
  const requests = [];
  const llm = { configured: true, models: { chat: 'qwen/mock', verifier: 'deepseek/mock' }, async chat(options) {
    requests.push(options);
    if (options.model === 'deepseek/mock') {
      const question = options.messages[1].content;
      // The solver picks the genuinely correct option: for `wrong` it is not the keyed one.
      const target = question.includes('бонусы') ? good.options[0] : 'Ключ идемпотентности операции с сохранением результата';
      const line = question.split('\n').find(row => row.includes(target));
      return { model: 'deepseek/mock', json: { answer: line.slice(0, 1), confidence: 0.9, ambiguous: false } };
    }
    return { model: 'qwen/mock', json: { items: [good, wrong, { ...good, options: ['a', 'b', 'c', 'Ни один из вариантов'] }] } };
  } };
  const result = await generateFamilyItems({ llm, bank, familyId, count: 3 });
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].status, 'pilot');
  assert.equal(result.rejected.length, 2);
  const generation = JSON.parse(requests[0].messages[1].content);
  assert.equal(generation.topic, 'Транзакции');
  assert(generation.examples.length >= 1 && generation.domainContext.length >= 1, 'The authored bank feeds the generator');
  assert(!requests[0].messages[1].content.includes('@'), 'No personal data in prompts');
  assert.equal(bank.list({ status: 'pilot' }).length, 1);
});
