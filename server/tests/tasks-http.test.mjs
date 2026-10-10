import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareLocalAccounts, localAccountPassword } from '../../scripts/local-accounts.mjs';
import { createAssessmentServer } from '../server.mjs';
import { LlmError } from '../llm.mjs';
import { createTaskReviewer, normalizeReview, ruleReview } from '../task-review.mjs';

function mockLlm(reply) {
  const calls = [];
  return { calls, configured: true, models: { chat: 'qwen/mock' }, async chat(options) {
    calls.push(options);
    if (reply instanceof Error) throw reply;
    return { content: JSON.stringify(reply), model: 'qwen/mock', json: reply };
  } };
}

async function setup(t, llm) {
  const folder = await mkdtemp(join(tmpdir(), 'predel-tasks-')), dbPath = join(folder, 'tasks.sqlite');
  await prepareLocalAccounts(dbPath);
  const service = createAssessmentServer({ dbPath, authEnv: {}, llm });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => { service.server.close(resolve); service.server.closeAllConnections(); });
    await rm(folder, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${service.server.address().port}`;
  async function login(role) {
    const cookies = new Map();
    const client = async (path, method = 'GET', input) => {
      const response = await fetch(base + path, { method, headers: { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        ...(input === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: input === undefined ? undefined : JSON.stringify(input) });
      for (const value of response.headers.getSetCookie()) { const [key, token] = value.split(';')[0].split('='); if (token) cookies.set(key, token); }
      return { status: response.status, data: await response.json() };
    };
    if (role) assert.equal((await client('/api/auth/login', 'POST', { loginOrEmail: 'local_' + role, password: localAccountPassword })).status, 200);
    return client;
  }
  return { service, login };
}

test('fixture cabinets show the whole task cycle; roles are enforced over HTTP', async t => {
  const review = { verdict: 'approve', score: 86, summary: 'Ответ закрывает задание.', strengths: ['Приоритеты расставлены'],
    gaps: ['Нет проверки на мобильных'], questions: ['Как храните логин?'], extra: 'ignored' };
  const llm = mockLlm(review);
  const { login } = await setup(t, llm);
  const guest = await login(), candidate = await login('candidate'), employer = await login('employer');
  assert.equal((await guest('/api/tasks')).status, 401);

  const own = await employer('/api/tasks');
  assert.equal(own.status, 200);
  assert.deepEqual(own.data.items.map(item => item.status).sort(), ['approved', 'assigned', 'submitted']);
  const eligible = (await employer('/api/tasks/candidates')).data.items;
  assert.equal(eligible.length, 1); assert.equal(eligible[0].source, 'application');
  assert.ok(eligible[0].freshness?.lastCompletedAt, 'The approved fixture task makes the profile fresh');

  const inbox = await candidate('/api/tasks');
  assert.equal(inbox.data.items.length, 3); assert.ok(inbox.data.freshness);
  assert(inbox.data.items.every(item => item.candidateId === 'candidate-anna' && item.company === 'Тестовая компания'));
  assert.equal((await candidate('/api/tasks', 'POST', { candidateId: eligible[0].id, title: 'x', description: 'y' })).status, 403);
  assert.equal((await candidate('/api/tasks/candidates')).status, 403);

  const open = inbox.data.items.find(item => item.status === 'assigned');
  assert.equal((await employer('/api/tasks/' + open.id + '/answer', 'POST', { answer: 'Ответ' })).status, 403);
  assert.equal((await employer('/api/tasks/' + open.id + '/ai-review', 'POST', {})).status, 409, 'No answer yet');
  const answered = await candidate('/api/tasks/' + open.id + '/answer', 'POST', { answer: 'Открою DevTools Performance, сравню профили до и после релиза.' });
  assert.equal(answered.status, 200); assert.equal(answered.data.status, 'submitted');
  assert.equal((await candidate('/api/tasks/' + open.id + '/review', 'POST', { status: 'approved' })).status, 403);

  const submitted = own.data.items.find(item => item.status === 'submitted');
  const advice = await employer('/api/tasks/' + submitted.id + '/ai-review', 'POST', {});
  assert.equal(advice.status, 200);
  assert.equal(advice.data.source, 'llm'); assert.equal(advice.data.verdict, 'approve'); assert.equal(advice.data.extra, undefined);
  const prompt = JSON.stringify(llm.calls[0].messages);
  assert.match(prompt, /<answer>/u); assert.match(prompt, /localStorage/u);
  assert.doesNotMatch(prompt, /Тестовый кандидат|candidate@local|employer@local|Тестовая компания/u, 'Only the task and answer reach the model');

  const approved = await employer('/api/tasks/' + submitted.id + '/review', 'POST', { status: 'approved', feedback: 'Принято.' });
  assert.equal(approved.status, 200); assert.equal(approved.data.task.status, 'approved');
  assert.equal(approved.data.nextTask.status, 'scheduled', 'A weekly task opens the next cycle in seven days');
  assert.equal((await employer('/api/tasks/' + submitted.id + '/ai-review', 'POST', {})).status, 409, 'Already reviewed');
  assert.equal((await employer('/api/tasks/missing/review', 'GET')).status, 405);
});

test('the advisory review falls back to a keyword check and normalises model output', async () => {
  const task = { title: 'Медленная страница профиля', description: 'Страница профиля открывается 4 секунды. Опишите, как найдёте причину.',
    answer: 'Сначала сравню профили производительности страницы профиля до и после релиза: 1) Network — размер бандла и запросы, '
      + '2) Performance — долгие задачи. Причину проверю откатом коммитов по одному. Например, ленивую загрузку тяжёлых модулей верну.' };
  const fallback = await createTaskReviewer({ llm: mockLlm(new LlmError('timeout', 'x')), logger: {} }).review(task);
  assert.equal(fallback.source, 'rules'); assert.equal(fallback.model, null);
  assert.ok(fallback.score >= 0 && fallback.score <= 100);
  const short = ruleReview({ ...task, answer: 'Не знаю.' });
  assert.equal(short.verdict, 'revise'); assert.match(short.gaps.join(' '), /короткий/u);
  assert.equal((await createTaskReviewer({ llm: { configured: false } }).review(task)).source, 'rules');
  assert.deepEqual(normalizeReview({ verdict: 'revise', score: 140, summary: ' s ', strengths: ['a', 2, ''], gaps: 'x', questions: ['1', '2', '3'] }),
    { verdict: 'revise', score: 100, summary: 's', strengths: ['a'], gaps: [], questions: ['1', '2'] });
  assert.throws(() => normalizeReview({ verdict: 'hire' }), LlmError);
  const invalid = await createTaskReviewer({ llm: mockLlm({ verdict: 'hire' }), logger: {} }).review(task);
  assert.equal(invalid.source, 'rules', 'An unexpected model format falls back instead of failing');
});
