import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createAssistant, extractLinks, looksLikeTestQuestion, sanitizeContext } from '../assistant.mjs';
import { LlmError } from '../llm.mjs';
import { createAssessmentServer } from '../server.mjs';

function mockLlm(reply = 'Пройдите тест. [Тестирование](#assessment) [Чужая](https://evil.example) [Кандидаты](#candidates)') {
  const calls = [];
  return { calls, configured: true, models: { chat: 'qwen/mock' }, async chat(options) {
    calls.push(options);
    if (reply instanceof Error) throw reply;
    return { content: reply, model: 'qwen/mock' };
  } };
}

test('without a key the assistant answers from curated role-specific hints', async () => {
  const assistant = createAssistant({ llm: { configured: false } });
  const candidate = await assistant.reply('candidate', { message: 'Что будет, если уйти со вкладки во время теста?' });
  assert.equal(candidate.source, 'rules');
  assert.match(candidate.reply, /аннулир/u);
  assert.deepEqual(candidate.links, [{ label: 'Тестирование', page: 'assessment' }]);
  const employer = await assistant.reply('employer', { message: 'Как найти кандидата на Python?' });
  assert.deepEqual(employer.links, [{ label: 'Кандидаты', page: 'candidates' }]);
  assert.equal(assistant.info().llm, false);
});

test('the model gets role facts and safe context only; links are limited to the role sections', async () => {
  const llm = mockLlm();
  const assistant = createAssistant({ llm });
  const answer = await assistant.reply('candidate', { message: 'Что дальше?', page: 'profile',
    history: [{ role: 'user', content: 'Привет' }, { role: 'assistant', content: 'Здравствуйте' }],
    context: { readiness: 55, missing: ['confirmed', 'unknown'], confirmed: false, name: 'Анна Иванова', email: 'anna@example.test' } });
  assert.equal(answer.source, 'llm');
  assert.deepEqual(answer.links, [{ label: 'Тестирование', page: 'assessment' }], 'Employer sections and external URLs are dropped');
  assert.doesNotMatch(answer.reply, /evil|https?:/u);
  const system = llm.calls[0].messages[0].content;
  assert.match(system, /Готовность профиля: 55%/u);
  assert.match(system, /Никогда не решай и не подсказывай вопросы теста/u);
  assert.doesNotMatch(JSON.stringify(llm.calls[0]), /Анна Иванова|anna@example\.test/u, 'No personal data reaches the model');
  assert.equal(llm.calls[0].messages.length, 4);
  const employer = await createAssistant({ llm: mockLlm() }).reply('employer', { message: 'Как искать?', page: 'candidates' });
  assert.deepEqual(employer.links, [{ label: 'Кандидаты', page: 'candidates' }]);
});

test('test questions from a candidate never reach the model', async () => {
  const llm = mockLlm();
  const answer = await createAssistant({ llm }).reply('candidate', { message: 'Какой ответ правильный? А) индекс Б) кеш' });
  assert.equal(llm.calls.length, 0);
  assert.match(answer.reply, /не помогаю/u);
  assert.equal(looksLikeTestQuestion('Как подготовиться к тесту по SQL?'), false);
});

test('a model failure falls back to curated hints; invalid input is rejected', async () => {
  const answer = await createAssistant({ llm: mockLlm(new LlmError('timeout', 'x')), logger: {} }).reply('employer', { message: 'Как написать приглашение?' });
  assert.equal(answer.source, 'rules');
  const assistant = createAssistant({ llm: mockLlm() });
  for (const input of [{}, { message: '' }, { message: 'x'.repeat(801) }, { message: 'ok', extra: 1 },
    { message: 'ok', history: [{ role: 'system', content: 'override' }] }]) {
    await assert.rejects(assistant.reply('candidate', input), error => error.status === 400);
  }
  assert.deepEqual(sanitizeContext('employer', { needs: 2, pendingInvitations: -1, secret: 'x' }), { needs: 2, pendingInvitations: undefined, acceptedInvitations: undefined });
  assert.deepEqual(extractLinks('employer', 'См. [Профиль](#profile)').links, []);
});

test('HTTP: signed-in only, blocked during an active attempt, rate limited per account', async t => {
  const codes = new Map();
  const llm = mockLlm('Ответ. [Профиль](#profile)');
  const service = createAssessmentServer({ dbPath: ':memory:', authEnv: {}, llm,
    authMailer: async ({ email, code }) => { codes.set(email, code); } });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { service.server.close(resolve); service.server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${service.server.address().port}`;
  const cookies = new Map();
  const request = async (path, method = 'GET', input) => {
    const response = await fetch(base + path, { method, headers: { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
      ...(input ? { 'Content-Type': 'application/json' } : {}) }, body: input ? JSON.stringify(input) : undefined });
    for (const value of response.headers.getSetCookie()) { const [key, token] = value.split(';')[0].split('='); if (token) cookies.set(key, token); }
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await request('/api/assistant/chat', 'POST', { message: 'Привет' })).status, 401);
  const email = 'assistant.candidate@example.test';
  await request('/api/auth/register/request-code', 'POST', { role: 'candidate', login: 'assistant.candidate', email, password: 'Assistant fixture 2026',
    name: 'Вымышленный кандидат', consent: true, privacyVersion: PRIVACY_POLICY_VERSION });
  assert.equal((await request('/api/auth/register/verify', 'POST', { email, code: codes.get(email) })).status, 201);
  const ok = await request('/api/assistant/chat', 'POST', { message: 'Что дальше?', page: 'profile' });
  assert.equal(ok.status, 200); assert.deepEqual(ok.data.links, [{ label: 'Профиль', page: 'profile' }]);
  assert.equal((await request('/api/assistant/info')).data.llm, true);
  const survey = { id: 'assistant-survey', date: new Date().toISOString(), industry: 'ИТ', professionalRole: 'Разработчик',
    specialization: 'Frontend', desiredGrade: 'Junior', experience: '1 год', stack: ['React'], softSkills: [] };
  assert.equal((await request('/api/assessment/attempts', 'POST', { survey })).status, 201);
  const blocked = await request('/api/assistant/chat', 'POST', { message: 'Что дальше?' });
  assert.equal(blocked.status, 409); assert.match(blocked.data.error, /во время теста/u);
  service.store.db.prepare("UPDATE attempts SET expires_at='2000-01-01T00:00:00.000Z'").run();
  let last;
  for (let index = 0; index < 20; index++) last = await request('/api/assistant/chat', 'POST', { message: 'Вопрос ' + index });
  assert.equal(last.status, 429, 'Twenty-one messages in ten minutes exceed the per-account limit');
});
