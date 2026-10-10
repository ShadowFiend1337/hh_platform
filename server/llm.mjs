// Shared OpenRouter client for the assistants and the item generator.
// Only open-weight models are used by default (Apache-2.0 Qwen, MIT DeepSeek):
// the organizers prefer open models with a reasonable parameter count (VS.3).
// Callers must never send contacts, names or resume text: prompts carry
// platform facts, catalog data and the user's own question only.

export const openRouterEndpoint = 'https://openrouter.ai/api/v1/chat/completions';
export const defaultChatModel = 'qwen/qwen3-30b-a3b-instruct-2507';
export const defaultFallbackModel = 'qwen/qwen3-32b';
export const defaultVerifierModel = 'deepseek/deepseek-v3.2';
const openModelPattern = /^(?:qwen|deepseek)\/[a-z0-9.:_-]{1,80}$/u;
const retryStatuses = new Set([429, 500, 502, 503, 504]);
const maxResponseBytes = 400_000;

export class LlmError extends Error {
  constructor(code, message, { status = null } = {}) {
    super(message);
    this.name = 'LlmError';
    this.code = code;
    this.status = status;
  }
}

function modelSetting(value, fallback) {
  const model = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  if (!openModelPattern.test(model)) throw new LlmError('configuration', 'Допустимы только открытые модели qwen/* или deepseek/*.');
  return model;
}

const wait = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new LlmError('timeout', 'Время ожидания модели истекло.')); }, { once: true });
});

/** Extracts the first JSON object from a model reply; some providers wrap it in prose or fences. */
export function parseJsonReply(content) {
  if (typeof content !== 'string') throw new LlmError('invalid_response', 'Модель вернула пустой ответ.');
  const cleaned = content.replace(/<think>[\s\S]*?<\/think>/gu, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through to the bracket scan */ }
  const start = cleaned.indexOf('{');
  if (start < 0) throw new LlmError('invalid_response', 'Модель не вернула JSON.');
  let depth = 0, inString = false, escaped = false;
  for (let index = start; index < cleaned.length; index++) {
    const char = cleaned[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      try { return JSON.parse(cleaned.slice(start, index + 1)); }
      catch { break; }
    }
  }
  throw new LlmError('invalid_response', 'Модель вернула некорректный JSON.');
}

export function createLlmClient({ env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 25_000, maxRetries = 1 } = {}) {
  const key = typeof env.OPENROUTER_API_KEY === 'string' ? env.OPENROUTER_API_KEY.trim() : '';
  if (key.length > 512 || /[\r\n\s]/u.test(key)) throw new LlmError('configuration', 'Некорректный ключ OpenRouter.');
  const chatModel = modelSetting(env.OPENROUTER_MODEL, defaultChatModel);
  const fallbackModel = env.OPENROUTER_FALLBACK_MODEL === '' ? null : modelSetting(env.OPENROUTER_FALLBACK_MODEL, defaultFallbackModel);
  const verifierModel = modelSetting(env.OPENROUTER_VERIFIER_MODEL, defaultVerifierModel);
  const usage = { requests: 0, failures: 0, promptTokens: 0, completionTokens: 0 };

  async function chat({ messages, model = chatModel, fallback = model === chatModel ? fallbackModel : null,
    maxTokens = 600, temperature = 0.3, json = false, retries = maxRetries,
    signal: external, timeoutMs: callTimeout = timeoutMs } = {}) {
    if (!key) throw new LlmError('configuration', 'Ключ OpenRouter не настроен.');
    if (!Array.isArray(messages) || !messages.length) throw new LlmError('input', 'Пустой запрос к модели.');
    if (!Number.isInteger(retries) || retries < 0 || retries > 2) throw new LlmError('input', 'Некорректное число повторов.');
    const controller = new AbortController();
    const abort = () => controller.abort();
    external?.addEventListener('abort', abort, { once: true });
    if (external?.aborted) abort();
    const timer = setTimeout(abort, callTimeout);
    const models = [model, ...(fallback && fallback !== model ? [fallback] : [])];
    const body = JSON.stringify({
      ...(models.length > 1 ? { models } : { model }),
      messages, max_tokens: maxTokens, temperature, stream: false,
      // Do not let providers retain prompts; OpenRouter routes only to compliant endpoints.
      provider: { data_collection: 'deny' },
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    });
    try {
      for (let attempt = 0; attempt <= retries; attempt++) {
        if (controller.signal.aborted) throw new LlmError('timeout', 'Запрос к модели отменён.');
        usage.requests++;
        let response;
        try {
          response = await fetchImpl(openRouterEndpoint, {
            method: 'POST', redirect: 'error', signal: controller.signal,
            headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json',
              'HTTP-Referer': env.WEB_ORIGIN || 'http://127.0.0.1:5173', 'X-Title': 'predel' },
            body,
          });
        } catch {
          usage.failures++;
          if (controller.signal.aborted) throw new LlmError('timeout', 'Время ожидания модели истекло.');
          if (attempt < retries) { await wait(400 * (attempt + 1), controller.signal); continue; }
          throw new LlmError('unavailable', 'Модель недоступна.');
        }
        if (!response.ok) {
          usage.failures++;
          // Error bodies may echo the request; never log or return them.
          await response.body?.cancel?.().catch(() => {});
          if (retryStatuses.has(response.status) && attempt < retries) { await wait(600 * (attempt + 1), controller.signal); continue; }
          throw new LlmError(response.status === 401 || response.status === 403 ? 'configuration' : 'unavailable',
            response.status === 401 ? 'Ключ OpenRouter отклонён.' : response.status === 402 ? 'На балансе OpenRouter недостаточно средств.' : 'Модель недоступна.',
            { status: response.status });
        }
        let raw;
        try { raw = await response.text(); }
        catch { throw new LlmError(controller.signal.aborted ? 'timeout' : 'unavailable', controller.signal.aborted ? 'Время ожидания модели истекло.' : 'Модель недоступна.'); }
        if (raw.length > maxResponseBytes) throw new LlmError('invalid_response', 'Слишком большой ответ модели.');
        let envelope;
        try { envelope = JSON.parse(raw); } catch { throw new LlmError('invalid_response', 'Некорректный ответ модели.'); }
        if (envelope?.error) {
          usage.failures++;
          if (attempt < retries) { await wait(600 * (attempt + 1), controller.signal); continue; }
          throw new LlmError('unavailable', 'Модель недоступна.');
        }
        const content = envelope?.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) throw new LlmError('invalid_response', 'Модель вернула пустой ответ.');
        usage.promptTokens += Number(envelope.usage?.prompt_tokens) || 0;
        usage.completionTokens += Number(envelope.usage?.completion_tokens) || 0;
        const text = content.replace(/<think>[\s\S]*?<\/think>/gu, '').trim();
        return { content: text, model: typeof envelope.model === 'string' ? envelope.model : model, json: json ? parseJsonReply(text) : null };
      }
      throw new LlmError('unavailable', 'Модель недоступна.');
    } finally {
      clearTimeout(timer);
      external?.removeEventListener('abort', abort);
    }
  }

  return Object.freeze({
    configured: Boolean(key),
    models: Object.freeze({ chat: chatModel, fallback: fallbackModel, verifier: verifierModel }),
    usage: () => ({ ...usage }),
    chat,
  });
}
