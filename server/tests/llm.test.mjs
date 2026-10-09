import assert from 'node:assert/strict';
import test from 'node:test';
import { createLlmClient, defaultChatModel, defaultVerifierModel, LlmError, parseJsonReply } from '../llm.mjs';

const reply = (content, model = defaultChatModel) => new Response(JSON.stringify({
  model, choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 10, completion_tokens: 5 },
}));

test('without a key the client is unconfigured and never calls the network', async () => {
  let calls = 0;
  const client = createLlmClient({ env: {}, fetchImpl: async () => { calls++; } });
  assert.equal(client.configured, false);
  assert.equal(client.models.chat, defaultChatModel);
  assert.equal(client.models.verifier, defaultVerifierModel);
  await assert.rejects(client.chat({ messages: [{ role: 'user', content: 'Привет' }] }), error => error instanceof LlmError && error.code === 'configuration');
  assert.equal(calls, 0);
});

test('only open-weight qwen or deepseek models are accepted', () => {
  for (const model of ['openai/gpt-oss-120b', 'meta-llama/llama-4', 'bad model', 'qwen/../x']) {
    assert.throws(() => createLlmClient({ env: { OPENROUTER_API_KEY: 'k', OPENROUTER_MODEL: model } }), LlmError);
  }
  assert.equal(createLlmClient({ env: { OPENROUTER_API_KEY: 'k', OPENROUTER_MODEL: 'deepseek/deepseek-v3.2' } }).models.chat, 'deepseek/deepseek-v3.2');
  assert.throws(() => createLlmClient({ env: { OPENROUTER_API_KEY: 'two words' } }), LlmError);
});

test('requests route through the primary and fallback models without provider data collection', async () => {
  let body, headers;
  const client = createLlmClient({ env: { OPENROUTER_API_KEY: 'secret-key' }, fetchImpl: async (_url, options) => {
    body = JSON.parse(options.body); headers = options.headers;
    return reply('{"answer": 2}');
  } });
  const result = await client.chat({ messages: [{ role: 'user', content: 'Вопрос' }], json: true });
  assert.deepEqual(result.json, { answer: 2 });
  assert.deepEqual(body.models, [defaultChatModel, 'qwen/qwen3-32b']);
  assert.deepEqual(body.provider, { data_collection: 'deny' });
  assert.equal(body.response_format.type, 'json_object');
  assert.equal(headers.Authorization, 'Bearer secret-key');
  assert.equal(client.usage().promptTokens, 10);
});

test('errors are retried once and never echo the provider body', async () => {
  let calls = 0;
  const client = createLlmClient({ env: { OPENROUTER_API_KEY: 'secret-key' }, fetchImpl: async () => {
    calls++;
    return new Response('secret-key echoed', { status: 503 });
  } });
  await assert.rejects(client.chat({ messages: [{ role: 'user', content: 'x' }] }), error => {
    assert.equal(error.code, 'unavailable');
    assert.equal(String(error).includes('secret-key'), false);
    return true;
  });
  assert.equal(calls, 2);
});

test('JSON replies are extracted from fences, prose and reasoning blocks', () => {
  assert.deepEqual(parseJsonReply('<think>план</think>```json\n{"a": "b}"}\n```'), { a: 'b}' });
  assert.deepEqual(parseJsonReply('Вот ответ: {"items": [1, 2]} — готово'), { items: [1, 2] });
  assert.throws(() => parseJsonReply('нет json'), LlmError);
});
