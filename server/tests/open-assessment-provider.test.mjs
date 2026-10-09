import assert from 'node:assert/strict';
import test from 'node:test';
import { createOpenAssessmentProvider, defaultOpenAssessmentModel, qwenOpenAssessmentModel,
  openAssessmentProviderVersion, OpenAssessmentProviderError } from '../open-assessment-provider.mjs';

const apiKey = 'mock-key-must-never-be-reported';
const env = { OPENROUTER_API_KEY: apiKey };
const answer = 'Транзакция связывает изменения. Проверяю сбой перед commit. Повтор операции использует ключ идемпотентности.';
const question = {
  id: 'open-backend-transaction:Middle', familyId: 'open-backend-transaction', bankVersion: 'test-bank-v1', rubricVersion: 'test-rubric-v1',
  specialization: 'Backend', grade: 'Middle', group: 'B', title: 'Согласованное изменение',
  prompt: 'Баланс списывается и создаётся заказ. Между запросами может случиться сбой. Предложите безопасное изменение.',
  referenceAnswer: { scenario: 'Оба изменения атомарны; повтор не создаёт дубликат.', level: 'Проверяет сбой между двумя изменениями.' },
  rubric: [
    { id: 'atomicity', label: 'Атомарность', anchors: { 0: 'Нет согласованности', 1: 'Упоминает транзакцию', 2: 'Объединяет изменения', 3: 'Проверяет откат' } },
    { id: 'recovery', label: 'Восстановление', anchors: { 0: 'Нет проверки', 1: 'Называет сбой', 2: 'Проверяет точки сбоя', 3: 'Проверяет восстановление' } },
    { id: 'level-depth', label: 'Уровень', anchors: { 0: 'Не выполнено', 1: 'Есть шаги', 2: 'Достигнут результат', 3: 'Показан контрпример' } },
  ],
  acceptableAlternatives: ['Надёжная очередь с явно описанными гарантиями и компенсацией.'],
  criticalErrors: ['Считать два независимых запроса атомарными.'],
  personalization: { allowed: ['domain', 'projectContext', 'entityNames'], invariants: ['Сохранить порядок событий и гарантию сбоя между запросами.'] },
};

const scored = () => ({ needsReview: false, criteria: question.rubric.map((criterion, index) => ({
  criterionId: criterion.id, status: 'scored', score: 2, evidence: [index === 1 ? 'Проверяю сбой перед commit.' : 'Транзакция связывает изменения.'],
  rationale: 'Действие соответствует описанному якорю.', needsReview: false,
})) });
const completion = (result, { status = 200, headers = {}, model = defaultOpenAssessmentModel, finish = 'stop', role = 'assistant' } = {}) => new Response(JSON.stringify({
  model, choices: [{ finish_reason: finish, message: { role, content: typeof result === 'string' ? result : JSON.stringify(result) } }],
}), { status, headers });
const expectCode = code => error => error instanceof OpenAssessmentProviderError && error.code === code && error.needsReview === true;
const provider = (fetchImpl, options = {}) => createOpenAssessmentProvider({ env, fetchImpl, ...options });
const qwenProvider = (fetchImpl, options = {}) => provider(fetchImpl, {
  env: { ...env, OPENROUTER_ASSESSMENT_MODEL: qwenOpenAssessmentModel }, ...options,
});

test('Configuration and construction do not call OpenRouter or disclose credentials', async () => {
  let calls = 0;
  const adapter = createOpenAssessmentProvider({ env: {}, fetchImpl: async () => { calls++; } });
  assert.equal(adapter.configuration().configured, false);
  assert.equal(adapter.configuration().model, 'qwen/qwen3-30b-a3b-instruct-2507');
  assert.equal(adapter.configuration().approvedForCertification, false);
  await assert.rejects(adapter.evaluateDraft({ question, answer }), expectCode('configuration'));
  assert.equal(calls, 0);
  const configured = provider(async () => { calls++; });
  assert.equal(configured.configuration().configured, true);
  assert.equal(JSON.stringify(configured.configuration()).includes(apiKey), false);
  assert.equal(calls, 0);
  assert.ok(Object.isFrozen(configured));
});

test('Only reviewed open-weight Qwen or DeepSeek IDs are accepted; defaults stay unchanged', () => {
  for (const model of ['', 'openrouter/auto', 'openai/gpt-oss-120b', 'qwen/qwen3-30b-a3b-instruct-2507:free',
    'qwen/qwen3.8-max', 'qwen/qwen3.8-27b:free', 'qwen/qwen3.8-27b-20261008', 'qwen/custom', 'qwen/qwen3.8-235b', 'bad-secret-model']) {
    assert.throws(() => createOpenAssessmentProvider({ env: { ...env, OPENROUTER_ASSESSMENT_MODEL: model } }), error =>
      expectCode('configuration')(error) && !error.message.includes(model || 'model'));
  }
  assert.equal(createOpenAssessmentProvider({ env: { ...env, OPENROUTER_ASSESSMENT_MODEL: 'deepseek/deepseek-v3.2' } }).configuration().model,
    'deepseek/deepseek-v3.2');
  assert.equal(createOpenAssessmentProvider({ env: { ...env, OPENROUTER_ASSESSMENT_MODEL: 'qwen/qwen3-32b' } })
    .configuration().model, 'qwen/qwen3-32b');
  let calls = 0;
  const qwen = qwenProvider(async () => { calls++; });
  assert.equal(qwen.configuration().model, 'qwen/qwen3.8-27b');
  assert.equal(qwen.configuration().configured, true);
  assert.equal(qwen.configuration().approvedForCertification, false);
  assert.equal(calls, 0);
  assert.equal(createOpenAssessmentProvider({ env }).configuration().model, defaultOpenAssessmentModel);
  for (const options of [{ timeoutMs: 0 }, { timeoutMs: 60_001 }, { maxRetries: 3 }, { maxRetryDelayMs: 5001 }]) {
    assert.throws(() => createOpenAssessmentProvider({ env, ...options }), expectCode('configuration'));
  }
  assert.throws(() => createOpenAssessmentProvider({ env: { OPENROUTER_API_KEY: 'unsafe\nheader' } }), expectCode('configuration'));
});

test('Selected Qwen evaluates literal evidence and generates only a preview under the same strict constraints', async () => {
  const requests = [];
  const adapter = qwenProvider(async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    return completion(requests.length === 1 ? scored() : { contextIntroduction: 'Контекст: обработка заказов.' },
      { model: qwenOpenAssessmentModel });
  });
  const evaluation = await adapter.evaluateDraft({ question: { ...question, email: 'PRIVATE CONTACT' }, answer });
  const variant = await adapter.generateVariantPreview({ question, context: {
    domain: 'Обработка заказов', rawResume: 'PRIVATE CV', email: 'PRIVATE CONTACT',
  } });
  for (const body of requests) {
    assert.equal(body.model, 'qwen/qwen3.8-27b');
    assert.equal(body.models, undefined);
    assert.equal(body.route, undefined);
    assert.equal(body.stream, false);
    assert.deepEqual(body.provider, { require_parameters: true, allow_fallbacks: false, data_collection: 'deny' });
    assert.equal(body.response_format.type, 'json_schema');
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(body.response_format.json_schema.schema.additionalProperties, false);
    assert.equal(JSON.stringify(body).includes('PRIVATE CONTACT'), false);
    assert.equal(JSON.stringify(body).includes('PRIVATE CV'), false);
  }
  assert.equal(requests[0].max_tokens, 4096);
  assert.equal(requests[1].max_tokens, 1024);
  const evaluationInput = JSON.parse(requests[0].messages[1].content);
  assert.deepEqual(evaluationInput.question.rubric, question.rubric);
  assert.equal(evaluationInput.candidateAnswer, answer);
  assert.equal(evaluation.model, qwenOpenAssessmentModel);
  assert.equal(evaluation.providerVersion, openAssessmentProviderVersion);
  assert.equal(evaluation.bankVersion, question.bankVersion);
  assert.equal(evaluation.rubricVersion, question.rubricVersion);
  assert.equal(evaluation.approvedForCertification, false);
  assert.equal(evaluation.needsReview, false);
  assert.equal(evaluation.grade, undefined);
  assert.equal(evaluation.passed, undefined);
  assert.equal(evaluation.score, undefined);
  assert.ok(evaluation.criteria.every(item => item.evidence.every(quote => answer.includes(quote))));
  const generationInput = JSON.parse(requests[1].messages[1].content);
  assert.deepEqual(generationInput.curatedContext, { domain: 'Обработка заказов' });
  assert.equal(generationInput.referenceAnswer, undefined);
  assert.equal(generationInput.rubric, undefined);
  assert.equal(variant.model, qwenOpenAssessmentModel);
  assert.equal(variant.basePrompt, question.prompt);
  assert.equal(variant.prompt, variant.contextIntroduction + '\n\n' + question.prompt);
  assert.equal(variant.requiresEditorialReview, true);
  assert.equal(variant.approvedForCertification, false);
});

test('Qwen output with another model, invented evidence or altered JSON never falls back or assigns a grade', async () => {
  const fabricated = scored();
  fabricated.criteria[0].evidence = [question.referenceAnswer.scenario];
  const fakeGrade = scored(); fakeGrade.grade = 'Lead';
  for (const reply of [
    () => completion(scored(), { model: defaultOpenAssessmentModel }),
    () => completion(scored(), { model: 'qwen/qwen3.8-max' }),
    () => completion(scored(), { model: qwenOpenAssessmentModel + ':free' }),
    () => completion(scored(), { model: qwenOpenAssessmentModel + '-20261008' }),
    () => completion(scored(), { model: qwenOpenAssessmentModel, finish: 'length' }),
    () => completion(fabricated, { model: qwenOpenAssessmentModel }),
    () => completion(fakeGrade, { model: qwenOpenAssessmentModel }),
    () => completion('{bad json', { model: qwenOpenAssessmentModel }),
  ]) {
    let calls = 0;
    const adapter = qwenProvider(async () => { calls++; return reply(); });
    await assert.rejects(adapter.evaluateDraft({ question, answer }), error => {
      assert.ok(expectCode('invalid_response')(error));
      assert.equal(error.grade, undefined);
      assert.equal(error.passed, undefined);
      assert.equal(error.score, undefined);
      return true;
    });
    assert.equal(calls, 1);
  }
  for (const reply of [
    () => completion({ contextIntroduction: 'Контекст' }, { model: defaultOpenAssessmentModel }),
    () => completion({ contextIntroduction: 'Контекст', prompt: 'Подменённая задача' }, { model: qwenOpenAssessmentModel }),
  ]) {
    await assert.rejects(qwenProvider(async () => reply()).generateVariantPreview({ question }), expectCode('invalid_response'));
  }
});

test('Qwen retries only the selected model; failure and deadline remain review states', async () => {
  const models = [];
  const adapter = qwenProvider(async (_url, options) => {
    models.push(JSON.parse(options.body).model);
    return models.length === 1 ? new Response('ignored', { status: 429, headers: { 'Retry-After': '0' } })
      : completion(scored(), { model: qwenOpenAssessmentModel });
  });
  assert.equal((await adapter.evaluateDraft({ question, answer })).model, qwenOpenAssessmentModel);
  assert.deepEqual(models, [qwenOpenAssessmentModel, qwenOpenAssessmentModel]);
  await assert.rejects(qwenProvider(async () => new Response(apiKey + answer, { status: 503 }), { maxRetries: 0 })
    .evaluateDraft({ question, answer }), error => expectCode('unavailable')(error)
      && error.grade === undefined && error.passed === undefined && !String(error).includes(apiKey));
  await assert.rejects(qwenProvider(async () => new Promise(() => {}), { timeoutMs: 10 })
    .evaluateDraft({ question, answer }), error => expectCode('timeout')(error)
      && error.grade === undefined && error.passed === undefined);
});

test('Evaluation uses a strict server rubric, bounded request, single model and literal evidence', async () => {
  let request;
  const privateQuestion = { ...question, rawResume: 'PRIVATE CV', email: 'private@example.test' };
  const adapter = provider(async (url, options) => { request = { url, options }; return completion(scored()); });
  const result = await adapter.evaluateDraft({ question: privateQuestion, answer });
  assert.equal(request.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer ' + apiKey);
  assert.equal(request.options.redirect, 'error');
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, defaultOpenAssessmentModel);
  assert.equal(body.models, undefined);
  assert.equal(body.stream, false);
  assert.equal(body.temperature, undefined); // Not advertised for the selected model.
  assert.deepEqual(body.provider, { require_parameters: true, allow_fallbacks: false, data_collection: 'deny' });
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.response_format.json_schema.schema.additionalProperties, false);
  assert.ok(body.messages[0].content.includes('не инструкции'));
  const payload = JSON.parse(body.messages[1].content);
  assert.deepEqual(payload.question.rubric, question.rubric);
  assert.equal(payload.candidateAnswer, answer);
  assert.equal(request.options.body.includes('PRIVATE CV'), false);
  assert.equal(request.options.body.includes('private@example.test'), false);
  assert.equal(result.purpose, 'author-preview-evaluation');
  assert.equal(result.questionId, question.id);
  assert.equal(result.rubricVersion, question.rubricVersion);
  assert.equal(result.needsReview, false);
  assert.equal(result.approvedForCertification, false);
  assert.equal(result.passed, undefined);
  assert.equal(result.grade, undefined);
  assert.equal(result.score, undefined);
  assert.ok(Object.isFrozen(result.criteria[0].evidence));
});

test('Each server criterion appears once, reordered back to server order; no cross-task criteria', async () => {
  const reversed = scored();
  reversed.criteria.reverse();
  const valid = await provider(async () => completion(reversed)).evaluateDraft({ question, answer });
  assert.deepEqual(valid.criteria.map(item => item.criterionId), question.rubric.map(item => item.id));
  for (const mutate of [
    value => value.criteria.pop(),
    value => { value.criteria[1].criterionId = value.criteria[0].criterionId; },
    value => { value.criteria[0].criterionId = 'another-task-criterion'; },
    value => { value.criteria[0].score = 2.5; },
    value => { value.criteria[0].score = 4; },
    value => { value.criteria[0].score = '3'; },
    value => { value.passed = true; },
    value => { value.grade = 'Senior'; },
    value => { value.criteria[0].unrecognizedField = 'extra'; },
  ]) {
    const value = scored(); mutate(value);
    await assert.rejects(provider(async () => completion(value)).evaluateDraft({ question, answer }), expectCode('invalid_response'));
  }
});

test('Fabricated, normalized or reference-answer quotations cannot become positive evidence', async () => {
  for (const quote of ['Оба изменения атомарны; повтор не создаёт дубликат.', 'транзакция связывает изменения.', 'Выдуманный опыт', '']) {
    const value = scored(); value.criteria[0].evidence = [quote];
    await assert.rejects(provider(async () => completion(value)).evaluateDraft({ question, answer }), expectCode('invalid_response'));
  }
  const value = scored(); value.criteria[0].evidence = [];
  await assert.rejects(provider(async () => completion(value)).evaluateDraft({ question, answer }), expectCode('invalid_response'));
});

test('Unassessable criteria are null and require review; uncertainty cannot be erased by an overall flag', async () => {
  const value = scored();
  value.criteria[1] = { criterionId: 'recovery', status: 'not_assessable', score: null, evidence: [],
    rationale: 'Недостаточно проверяемых сведений об условиях восстановления.', needsReview: true };
  const result = await provider(async () => completion(value)).evaluateDraft({ question, answer });
  assert.equal(result.needsReview, true);
  assert.equal(result.criteria[1].score, null);
  assert.equal(result.criteria[1].status, 'not_assessable');
  for (const invalid of [{ score: 0 }, { needsReview: false }, { status: 'scored' }]) {
    const modified = structuredClone(value); Object.assign(modified.criteria[1], invalid);
    await assert.rejects(provider(async () => completion(modified)).evaluateDraft({ question, answer }), expectCode('invalid_response'));
  }
});

test('Absence of an action remains a reviewable zero, including a blank answer; it cannot be a positive score', async () => {
  const value = scored();
  value.criteria.forEach(item => { item.score = 0; item.evidence = []; item.rationale = 'Действие отсутствует в ответе.'; });
  const result = await provider(async () => completion(value)).evaluateDraft({ question, answer: '' });
  assert.equal(result.needsReview, true);
  assert.ok(result.criteria.every(item => item.score === 0 && item.needsReview));
  await assert.rejects(provider(async () => completion(scored())).evaluateDraft({ question, answer: '' }), expectCode('invalid_response'));
});

test('Malformed, refused, incomplete or different-model responses never become a candidate failure', async () => {
  for (const reply of [
    () => completion('{bad json'),
    () => completion(scored(), { finish: 'length' }),
    () => completion(scored(), { finish: 'error' }),
    () => completion(scored(), { model: 'qwen/qwen3-max' }),
    () => completion(scored(), { model: 'deepseek/deepseek-chat' }),
    () => completion(scored(), { role: 'user' }),
    () => new Response('{not json'),
    () => new Response(JSON.stringify({ model: defaultOpenAssessmentModel, choices: [] })),
    () => new Response(JSON.stringify({ model: defaultOpenAssessmentModel, choices: [{ finish_reason: 'stop', message: {
      role: 'assistant', content: JSON.stringify(scored()), refusal: 'refused',
    } }] })),
  ]) {
    let calls = 0;
    await assert.rejects(provider(async () => { calls++; return reply(); }).evaluateDraft({ question, answer }), expectCode('invalid_response'));
    assert.equal(calls, 1);
  }
  await assert.rejects(provider(async () => completion(scored(), { model: defaultOpenAssessmentModel + '-20261007' }))
    .evaluateDraft({ question, answer }), expectCode('invalid_response'));
});

test('Authentication, payment and request errors are not retried; raw provider details are discarded', async () => {
  for (const status of [400, 401, 402, 403, 404]) {
    let calls = 0;
    const adapter = provider(async () => { calls++; return new Response(apiKey + answer, { status }); });
    await assert.rejects(adapter.evaluateDraft({ question, answer }), error => {
      assert.ok(expectCode('unavailable')(error));
      assert.equal(error.status, status);
      assert.equal(error.retryable, false);
      assert.equal(error.cause, undefined);
      assert.equal(String(error).includes(apiKey), false);
      assert.equal(JSON.stringify(error).includes(answer), false);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('429 has a bounded retry on the same selected model and respects short Retry-After', async () => {
  const models = [];
  const adapter = provider(async (_url, options) => {
    models.push(JSON.parse(options.body).model);
    return models.length === 1 ? new Response('ignored', { status: 429, headers: { 'Retry-After': '0.001' } }) : completion(scored());
  });
  assert.equal((await adapter.evaluateDraft({ question, answer })).criteria.length, 3);
  assert.deepEqual(models, [defaultOpenAssessmentModel, defaultOpenAssessmentModel]);
  let calls = 0;
  await assert.rejects(provider(async () => { calls++; return new Response('ignored', { status: 429, headers: { 'Retry-After': '120' } }); })
    .evaluateDraft({ question, answer }), error => expectCode('unavailable')(error) && error.retryable);
  assert.equal(calls, 1); // No retry earlier than the provider's declared delay.
});

test('A provider error carried by HTTP 200 is checked and bounded instead of treated as a score', async () => {
  let calls = 0;
  const adapter = provider(async () => { calls++; return new Response(JSON.stringify({ error: { code: 503, message: apiKey + answer } })); },
    { maxRetryDelayMs: 0 });
  await assert.rejects(adapter.evaluateDraft({ question, answer }), error => expectCode('unavailable')(error)
    && error.status === 503 && !String(error).includes(apiKey));
  assert.equal(calls, 2);
});

test('Network failures retry within a fixed budget and never include a transport error or secret', async () => {
  let calls = 0;
  await assert.rejects(provider(async () => { calls++; throw new Error(apiKey + answer); }, { maxRetries: 2, maxRetryDelayMs: 0 })
    .evaluateDraft({ question, answer }), error => expectCode('unavailable')(error) && error.retryable && !String(error).includes(apiKey));
  assert.equal(calls, 3);
});

test('Deadline covers an unresponsive transport and does not assign any result', async () => {
  let requestSignal;
  const adapter = provider(async (_url, options) => { requestSignal = options.signal; return new Promise(() => {}); }, { timeoutMs: 10 });
  await assert.rejects(adapter.evaluateDraft({ question, answer }), expectCode('timeout'));
  assert.equal(requestSignal.aborted, true);
});

test('Cancellation before a request or during a retry is bounded and does not expose abort reasons', async () => {
  const already = new AbortController(); already.abort(apiKey);
  let calls = 0;
  await assert.rejects(provider(async () => { calls++; }).evaluateDraft({ question, answer }, { signal: already.signal }), expectCode('cancelled'));
  assert.equal(calls, 0);
  const controller = new AbortController();
  const adapter = provider(async () => {
    calls++;
    setTimeout(() => controller.abort(apiKey + answer), 5);
    return new Response('ignored', { status: 429, headers: { 'Retry-After': '1' } });
  });
  await assert.rejects(adapter.evaluateDraft({ question, answer }, { signal: controller.signal }), error =>
    expectCode('cancelled')(error) && !String(error).includes(apiKey));
  assert.equal(calls, 1);
});

test('Read deadline and byte limit protect against hanging or excessive provider output', async () => {
  const hanging = new ReadableStream({ start() {} });
  await assert.rejects(provider(async () => new Response(hanging), { timeoutMs: 10 }).evaluateDraft({ question, answer }), expectCode('timeout'));
  for (const response of [
    () => new Response('x'.repeat(200_001)),
    () => new Response('small', { headers: { 'Content-Length': '200001' } }),
  ]) {
    await assert.rejects(provider(async () => response()).evaluateDraft({ question, answer }), expectCode('invalid_response'));
  }
});

test('A hanging stream cancellation after an oversized response remains inside the operation deadline', async () => {
  let cancelCalled = false;
  const oversized = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(200_001)); },
    cancel() { cancelCalled = true; return new Promise(() => {}); },
  });
  await assert.rejects(provider(async () => new Response(oversized), { timeoutMs: 10 })
    .evaluateDraft({ question, answer }), expectCode('timeout'));
  assert.equal(cancelCalled, true);
});

test('Variant preview contains the exact base task and only family-permitted curated context', async () => {
  let request;
  const adapter = provider(async (_url, options) => {
    request = JSON.parse(options.body);
    return completion({ contextIntroduction: 'Контекст: обработка заказов маркетплейса.' });
  });
  const result = await adapter.generateVariantPreview({ question, context: {
    domain: 'Обработка заказов', projectContext: 'Учебный сервис', entityNames: ['заказ', 'остаток'],
    stack: ['SECRET DISALLOWED STACK'], rawResume: 'PRIVATE CV', email: 'private@example.test', grade: 'Lead',
  } });
  const payload = JSON.parse(request.messages[1].content);
  assert.deepEqual(payload.curatedContext, { domain: 'Обработка заказов', projectContext: 'Учебный сервис', entityNames: ['заказ', 'остаток'] });
  assert.equal(request.messages[1].content.includes('PRIVATE CV'), false);
  assert.equal(request.messages[1].content.includes('SECRET DISALLOWED STACK'), false);
  assert.equal(payload.referenceAnswer, undefined);
  assert.equal(payload.rubric, undefined);
  assert.equal(result.purpose, 'author-variant-preview');
  assert.equal(result.approvedForCertification, false);
  assert.equal(result.requiresEditorialReview, true);
  assert.equal(result.basePrompt, question.prompt);
  assert.equal(result.prompt, result.contextIntroduction + '\n\n' + question.prompt);
  assert.equal(result.grade, undefined);
});

test('Generation cannot replace the prompt, grade, rubric or silently exceed the permitted shape', async () => {
  for (const value of [{ contextIntroduction: 'Контекст', prompt: 'Решение' }, { contextIntroduction: 'Контекст', grade: 'Lead' },
    { contextIntroduction: 'x'.repeat(801) }, { contextIntroduction: 1 }, { prompt: 'Решение' }]) {
    await assert.rejects(provider(async () => completion(value)).generateVariantPreview({ question }), expectCode('invalid_response'));
  }
  const empty = await provider(async () => completion({ contextIntroduction: '' })).generateVariantPreview({ question });
  assert.equal(empty.prompt, question.prompt);
});

test('Invalid local inputs are rejected before any provider call', async () => {
  let calls = 0;
  const adapter = provider(async () => { calls++; });
  for (const malformed of [null, { ...question, rubric: [] }, { ...question, rubric: [question.rubric[0], question.rubric[0]] },
    { ...question, personalization: { allowed: ['rawResume'], invariants: ['Неизменяемая рубрика'] } }]) {
    await assert.rejects(adapter.evaluateDraft({ question: malformed, answer }), expectCode('input'));
  }
  await assert.rejects(adapter.evaluateDraft({ question, answer: 'x'.repeat(20_001) }), expectCode('input'));
  await assert.rejects(adapter.generateVariantPreview({ question, context: { domain: { fullCV: 'unexpected' } } }), expectCode('input'));
  await assert.rejects(adapter.generateVariantPreview({ question, context: { entityNames: new Array(11).fill('товар') } }), expectCode('input'));
  await assert.rejects(adapter.evaluateDraft({ question, answer }, { signal: 'not-a-signal' }), expectCode('input'));
  assert.equal(calls, 0);
});
