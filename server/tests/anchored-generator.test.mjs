import assert from 'node:assert/strict';
import test from 'node:test';
import { createLlmClient, LlmError } from '../llm.mjs';
import { reviewQuestions } from '../review-bank.mjs';
import { closedReviewCases } from '../closed-review-bank.mjs';
import { anchorPassport, generateAnchoredVariant, validateAnchoredDraft } from '../anchored-generator.mjs';
import { anchoredReply, fixtureAnchorId } from './fixtures/anchored-variant.mjs';

const response = raw => new Response(JSON.stringify({ model: 'qwen/test-fixture', choices: [{ message: { content: JSON.stringify(raw) } }] }));
test('every open/closed anchor has a server-owned same-format passport', () => {
  for (const anchor of [...reviewQuestions, ...closedReviewCases]) {
    const p = anchorPassport(anchor.id);
    assert.equal(p.grade, anchor.grade); assert.equal(p.sourceUrl, anchor.sourceUrl);
    assert.equal(p.questionCount, anchor.questions?.length || 0);
    assert.equal(p.criteria.length, anchor.questions?.length || anchor.rubric.length);
    assert.equal(p.difficulty.calibration, 'editorial-estimate');
    assert(Object.isFrozen(p));
  }
  assert.throws(() => anchorPassport('old-family'), /Неизвестный/u);
});

test('one actual HTTP call yields a quarantined draft with checked mapping and inherited sources', async () => {
  let calls = 0, request;
  const llm = createLlmClient({ env: { OPENROUTER_API_KEY: 'fixture-key' }, fetchImpl: async (_url, options) => {
    calls++; request = JSON.parse(options.body); return response(anchoredReply());
  } });
  const result = await generateAnchoredVariant({ llm, anchorId: fixtureAnchorId });
  assert.deepEqual(result.accepted ? [] : result.reasons, []);
  assert.equal(result.accepted, true); assert.equal(calls, 1); assert.equal(result.llmCalls, 1);
  assert.equal(request.models, undefined); assert.equal(request.response_format.type, 'json_object');
  assert.equal(request.max_tokens, 8500);
  const item = result.candidate;
  assert.equal(item.review.active, false); assert.equal(item.review.approvedForCertification, false);
  assert.equal(item.difficulty.calibration, 'unverified-variant');
  assert.equal(item.passport.grade, 'Middle'); assert.equal(item.checks.semantic, 'not-independently-verified');
  assert.deepEqual(item.sourceRefs, anchorPassport(fixtureAnchorId).sourceRefs);
  for (let i = 0; i < item.content.questions.length; i++) {
    const q = item.content.questions[i], original = anchoredReply().questions[i];
    assert.equal(q.options[q.correct], original.options[original.correct]);
    for (const d of q.distractors) assert.equal(q.options[d.option], original.options[original.distractors.find(o => o.whyWrong === d.whyWrong).option]);
  }
});

test('upstream failure is never retried or sent to a second model', async () => {
  let calls = 0;
  const llm = createLlmClient({ env: { OPENROUTER_API_KEY: 'fixture-key' }, fetchImpl: async () => { calls++; return new Response('private upstream body', { status: 503 }); } });
  await assert.rejects(generateAnchoredVariant({ llm, anchorId: fixtureAnchorId }), e => e instanceof LlmError && e.code === 'unavailable' && !e.message.includes('private'));
  assert.equal(calls, 1);
});

test('bad response is rejected without repair calls; unknown anchor and cancellation spend nothing', async () => {
  let calls = 0;
  const llm = createLlmClient({ env: { OPENROUTER_API_KEY: 'fixture-key' }, fetchImpl: async () => { calls++; return response({ arbitrary: true }); } });
  assert.equal((await generateAnchoredVariant({ llm, anchorId: fixtureAnchorId })).accepted, false);
  assert.equal(calls, 1);
  await assert.rejects(generateAnchoredVariant({ llm, anchorId: 'bad' }));
  await assert.rejects(generateAnchoredVariant({ llm, anchorId: fixtureAnchorId, signal: AbortSignal.abort() }));
  assert.equal(calls, 1);
});

test('numbers-only and names-only edits do not pass the structural novelty gate', () => {
  const p = anchorPassport(fixtureAnchorId);
  for (const replace of [s => s.replaceAll('30', '40').replaceAll('7', '14'), s => s.replaceAll('пользоват', 'клиент').replaceAll('покупк', 'подписк')]) {
    const raw = anchoredReply(); raw.prompt = replace(p.referenceScenario.split('\n')[0]);
    raw.questions.forEach((q, i) => { q.prompt = replace(p.referenceQuestions[i].prompt); });
    const errors = validateAnchoredDraft(raw, p);
    assert(errors.includes('numbers-only') || errors.includes('cosmetic-rewrite'));
  }
});

test('invented evidence, missing criteria, changed difficulty and leaked answers are rejected', () => {
  const p = anchorPassport(fixtureAnchorId);
  assert.deepEqual(validateAnchoredDraft(anchoredReply(), p), []);
  for (const mutate of [
    r => { r.criterionMap[0].evidenceQuotes = ['invented premise not present in this draft']; },
    r => { r.criterionMap[0].solutionQuote = 'a solution sentence which was never written'; },
    r => { r.criterionMap[1].criterionId = r.criterionMap[0].criterionId; },
    r => { r.questions[1].criterionIds = r.questions[0].criterionIds; },
    r => { r.changes[1].afterQuote = r.changes[0].afterQuote; },
    r => { r.equivalence.addedPrerequisites = ['advanced causal modelling']; },
    r => { r.equivalence.removedOperations = ['cluster uncertainty']; },
    r => { r.questions[0].distractors[0].option = r.questions[0].correct; },
    r => { r.prompt += ' ' + r.questions[0].options[r.questions[0].correct]; },
    r => { r.grade = 'Lead'; },
    r => { r.sourceUrl = 'https://invented.example/'; },
  ]) { const raw = anchoredReply(); mutate(raw); assert(validateAnchoredDraft(raw, p).length > 0); }
  assert(validateAnchoredDraft(anchoredReply(), p, [anchoredReply().prompt + '\n' + anchoredReply().questions.map(q => q.prompt).join('\n')]).includes('duplicate-variant'));
});

test('open variants keep free-response format and criterion count', async () => {
  const id = 'research:statistics:Middle', p = anchorPassport(id), raw = anchoredReply();
  raw.questions = [];
  raw.prompt += ' Определите таблицу анализа, полное окно и знаменатель. Покажите, как учитывать назначение классу в интервале.';
  raw.criterionMap = p.criteria.map((c, i) => ({ criterionId: c.id,
    adaptedCriterion: 'Критерий для нового учебного сценария: ' + c.expected,
    preservedOperation: 'Требуется согласовать единицу анализа, окно и неопределённость с назначением.',
    evidenceQuotes: [i === 2 ? 'В следующем запуске версию назначают всему классу, сохраняя целевую долю по аккаунтам.' : 'доля назначенных аккаунтов со сдачей за 14 суток после назначения'],
    solutionQuote: i === 2 ? 'Во втором запуске независимая единица назначения — класс.' : 'Знаменатель содержит все назначенные аккаунты с полным окном, включая флаг 0.' }));
  raw.changes = [
    { dimension: 'domain', beforeQuote: p.referenceScenario.slice(0, 60), afterQuote: raw.prompt.slice(0, 65), explanation: 'Учебный рабочий процесс сохраняет бинарный исход, назначение и кластерную структуру неопределённости.' },
    { dimension: 'representation', beforeQuote: p.referenceScenario.slice(60, 110), afterQuote: 'На экране два отчёта: журнал открытий страницы и реестр назначений, где аккаунты без сдачи остаются с флагом 0.', explanation: 'Сведения о назначении представлены двумя отчётами вместо описания строк исходной задачи.' },
    { dimension: 'question', beforeQuote: p.referenceScenario.slice(110, 160), afterQuote: 'Определите таблицу анализа, полное окно и знаменатель.', explanation: 'Вопрос привязан к диагностике двух отчётов и требует самостоятельно сформулировать таблицу анализа.' },
  ];
  const llm = createLlmClient({ env: { OPENROUTER_API_KEY: 'fixture-key' }, fetchImpl: async () => response(raw) });
  const result = await generateAnchoredVariant({ llm, anchorId: id });
  assert.deepEqual(result.accepted ? [] : result.reasons, []); assert.equal(result.accepted, true);
  assert.equal(result.candidate.content.questions.length, 0); assert.equal(result.candidate.content.criterionMap.length, p.criteria.length);
});
