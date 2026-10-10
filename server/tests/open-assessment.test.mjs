import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareLocalAccounts, localAccountPassword } from '../../scripts/local-accounts.mjs';
import { createAssessmentServer } from '../server.mjs';
import { openPool, selectOpenTasks } from '../open-tasks.mjs';
import { createAttempt } from '../assessment.mjs';

const survey = (grade = 'Junior') => ({ id: 'open-survey-' + grade, date: new Date().toISOString(), industry: 'ИТ', professionalRole: 'Frontend-разработчик',
  specialization: 'Frontend', desiredGrade: grade, experience: '2 года', stack: ['React', 'TypeScript'], softSkills: [] });

async function setup(t, llm) {
  const folder = await mkdtemp(join(tmpdir(), 'predel-open-')), dbPath = join(folder, 'open.sqlite');
  await prepareLocalAccounts(dbPath);
  const codes = new Map();
  const service = createAssessmentServer({ dbPath, authEnv: { API_RATE_LIMIT_PER_MINUTE: '3000' }, llm,
    authMailer: async ({ email, code }) => { codes.set(email, code); } });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => { service.server.close(resolve); service.server.closeAllConnections(); });
    await rm(folder, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${service.server.address().port}`;
  const client = () => {
    const cookies = new Map();
    let identity;
    return async (path, method = 'GET', input) => {
      const response = await fetch(base + path, { method, headers: { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        ...(identity ? { 'X-Platform-Identity': identity } : {}), ...(input === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: input === undefined ? undefined : JSON.stringify(input) });
      for (const value of response.headers.getSetCookie()) { const [key, token] = value.split(';')[0].split('='); if (token) cookies.set(key, token); }
      identity = response.headers.get('X-Platform-Identity') || identity;
      return { status: response.status, data: await response.json() };
    };
  };
  const login = async name => {
    const request = client();
    assert.equal((await request('/api/auth/login', 'POST', { loginOrEmail: name, password: localAccountPassword })).status, 200);
    return request;
  };
  const register = async role => {
    const request = client(), name = 'open.' + randomUUID().slice(0, 8), email = name + '@example.test';
    assert.equal((await request('/api/auth/register/request-code', 'POST', { role, login: name, email, password: 'OpenFixture2026!', consent: true,
      privacyVersion: PRIVACY_POLICY_VERSION, ...(role === 'candidate' ? { name: 'Вымышленный кандидат' } : { companyName: 'Вымышленная компания' }) })).status, 202);
    const verified = await request('/api/auth/register/verify', 'POST', { email, code: codes.get(email) });
    assert.equal(verified.status, 201);
    return Object.assign(request, { account: verified.data.account });
  };
  return { service, login, register };
}

/** Answers the sequential attempt through the API: closed items by `correct`, open tasks with text. */
async function solve(candidate, attempt, { correct = () => true, text = () => 'Решение: шаги, код и проверка граничных случаев.' } = {}) {
  let state = attempt, opened = false, index = 0;
  for (;;) {
    const question = state.questions[state.position];
    const body = question.type === 'open' ? { token: attempt.token, questionId: question.id, answerText: text(question) }
      : { token: attempt.token, questionId: question.id, optionId: question.options[0].id };
    if (question.type !== 'open') {
      const key = attempt.keys.get(question.id);
      body.optionId = correct(index) ? key : question.options.find(option => option.id !== key).id;
    }
    const reply = await candidate(`/api/assessment/attempts/${attempt.id}/answer`, 'POST', body);
    assert.equal(reply.status, 200, JSON.stringify(reply.data));
    opened ||= reply.data.opened;
    state = reply.data; index++;
    if (reply.data.complete) return { state, opened };
  }
}

test('open tasks follow a passed closed part, wait for a moderator and confirm the grade after review', async t => {
  const llmCalls = [];
  const llm = { configured: true, models: { chat: 'qwen/mock' }, async chat(options) {
    llmCalls.push(options);
    const tasks = JSON.parse(options.messages[1].content).tasks;
    const json = { tasks: tasks.map(task => ({ questionId: task.questionId, comment: 'Подсказка.', criteria: task.criteria.map(item => ({ id: item.id, score: 2, reason: 'Есть в ответе.' })) })) };
    return { content: JSON.stringify(json), model: 'qwen/mock', json };
  } };
  const { service, login, register } = await setup(t, llm);
  const moderator = await login('local_moderator'), employer = await login('local_employer');

  // The seeded fixture attempt is on review; only moderators open the queue.
  assert.equal((await employer('/api/moderation/assessments')).status, 403);
  const queue = await moderator('/api/moderation/assessments');
  assert.equal(queue.status, 200, JSON.stringify(queue.data));
  assert.equal(queue.data.items.length, 1);
  const seeded = queue.data.items[0];
  assert.equal(seeded.candidate, 'Тестовый кандидат'); assert.equal(seeded.closedScore, 83); assert.equal(seeded.openCount, 2);
  const detail = (await moderator('/api/moderation/assessments/' + seeded.id)).data;
  assert.equal(detail.closed.length, 12); assert.equal(detail.open.length, 2);
  assert.ok(detail.closed.every(item => item.correctOptionId && item.origin.kind === 'authored'));
  assert.ok(detail.open.every(item => item.rubric.length >= 3 && item.reference && item.answer.text && item.origin.kind === 'authored'));
  assert.equal((await moderator('/api/moderation/claims')).status, 403, 'The public test moderator never sees achievement claims');

  // Advisory scores: the task and the answer reach the model, the candidate's name does not.
  const advice = await moderator(`/api/moderation/assessments/${seeded.id}/ai-review`, 'POST', {});
  assert.equal(advice.status, 200); assert.equal(advice.data.advisory, true); assert.equal(advice.data.tasks.length, 2);
  assert.doesNotMatch(JSON.stringify(llmCalls[0].messages), /Тестовый кандидат|candidate@local/u);

  const marks = [
    { questionId: detail.open[0].id, criteria: detail.open[0].rubric.map(item => ({ id: item.id, score: 2 })), comment: 'Полное решение.' },
    { questionId: detail.open[1].id, criteria: detail.open[1].rubric.map((item, index) => ({ id: item.id, score: index ? 0 : 1 })), comment: 'Нет exhaustive check.' },
  ];
  assert.equal((await moderator(`/api/moderation/assessments/${seeded.id}/decision`, 'POST', { version: 99, decision: 'grade', marks })).status, 409);
  assert.equal((await moderator(`/api/moderation/assessments/${seeded.id}/decision`, 'POST', { version: 1, decision: 'grade', marks: marks.slice(0, 1) })).status, 400);
  const decided = await moderator(`/api/moderation/assessments/${seeded.id}/decision`, 'POST', { version: 1, decision: 'grade', marks, note: 'Хорошо.' });
  assert.equal(decided.status, 200, JSON.stringify(decided.data));
  // Open part: (100 + 17) / 2 = 58.5 -> 59; final 0.5 * 83 + 0.5 * 59 = 71 >= 70.
  assert.equal(decided.data.result.openScore, 59); assert.equal(decided.data.result.score, 71); assert.equal(decided.data.result.passed, true);
  assert.equal(decided.data.status, 'completed');
  assert.equal((await moderator(`/api/moderation/assessments/${seeded.id}/decision`, 'POST', { version: 2, decision: 'grade', marks })).status, 409, 'A decision is final');
  const candidate = await login('local_candidate');
  const history = (await candidate('/api/platform/state')).data.state.history;
  const reviewed = history.find(item => item.id === seeded.id);
  assert.equal(reviewed.pending, false); assert.equal(reviewed.score, 71); assert.equal(reviewed.review.marks.length, 2);
  const confirmed = (await candidate('/api/platform/state')).data.state.profile.confirmed;
  assert.equal(confirmed.date, reviewed.date, 'The reviewed result is applied to the profile on the server');

  // A new real candidate: closed part, then two open tasks without rubric or reference, then review.
  const person = await register('candidate');
  const started = await person('/api/assessment/attempts', 'POST', { survey: survey('Middle') });
  assert.equal(started.status, 201);
  const row = service.store.get(started.data.id);
  const attempt = { ...started.data, keys: new Map(row.attempt.questions.map(question => [question.id, question.correctOptionId])) };
  const solved = await solve(person, attempt);
  assert.equal(solved.opened, true, 'Passing the closed part opens the practical stage');
  const stored = service.store.get(attempt.id).attempt;
  const open = stored.questions.filter(question => question.type === 'open');
  assert.equal(open.length, 2);
  assert.ok(open.every(question => question.familyId.endsWith(':Middle')), 'Open tasks match the grade');
  const publicView = JSON.stringify(solved.state);
  assert.doesNotMatch(publicView, /rubric|reference|criticalErrors|correctOptionId/u, 'Rubrics and keys never reach the candidate');
  const result = await person(`/api/assessment/attempts/${attempt.id}/submit`, 'POST', { token: attempt.token });
  assert.equal(result.status, 200);
  assert.equal(result.data.pending, true); assert.equal(result.data.passed, false); assert.equal(result.data.closedScore, 100);
  assert.equal((await person('/api/assessment/attempts', 'POST', { survey: survey('Middle') })).status, 409, 'No second attempt while one is on review');

  // Realms are separate: the test moderator does not see a real candidate, a real moderator does.
  assert.ok(!(await moderator('/api/moderation/assessments')).data.items.some(item => item.id === attempt.id));
  const staff = await register('employer');
  service.auth.store.setModerator(staff.account.id, true, 'test');
  const realQueue = await staff('/api/moderation/assessments');
  assert.deepEqual(realQueue.data.items.map(item => item.id), [attempt.id]);
  const realDetail = (await staff('/api/moderation/assessments/' + attempt.id)).data;
  const failing = await staff(`/api/moderation/assessments/${attempt.id}/decision`, 'POST', { version: 1, decision: 'grade',
    marks: realDetail.open.map(task => ({ questionId: task.id, criteria: task.rubric.map(item => ({ id: item.id, score: 0 })) })) });
  assert.equal(failing.data.result.score, 50); assert.equal(failing.data.result.passed, false);
  assert.equal((await person('/api/platform/state')).data.state?.profile?.confirmed ?? null, null, 'A failed review never confirms the grade');
  // All finished attempts of the realm, including automatic ones, are visible read-only.
  const all = await moderator('/api/moderation/assessments?status=all');
  assert.ok(all.data.items.some(item => item.status === 'auto' && item.candidate === 'Тестовый кандидат'), 'The fixture closed-only result is listed');
  const auto = all.data.items.find(item => item.status === 'auto');
  const autoDetail = await moderator('/api/moderation/assessments/' + auto.id);
  assert.equal(autoDetail.status, 200); assert.equal(autoDetail.data.open.length, 0);
  assert.equal((await moderator(`/api/moderation/assessments/${auto.id}/decision`, 'POST', { version: 0, decision: 'grade', marks: [] })).status, 409);
});

test('a failed closed part ends the attempt without open tasks; selection covers grades and avoids repeats', async t => {
  const { service, register } = await setup(t, { configured: false, models: {} });
  const person = await register('candidate');
  const started = await person('/api/assessment/attempts', 'POST', { survey: survey('Junior') });
  const row = service.store.get(started.data.id);
  const attempt = { ...started.data, keys: new Map(row.attempt.questions.map(question => [question.id, question.correctOptionId])) };
  const solved = await solve(person, attempt, { correct: index => index < 6 });
  assert.equal(solved.opened, false);
  const result = await person(`/api/assessment/attempts/${attempt.id}/submit`, 'POST', { token: attempt.token });
  assert.equal(result.data.pending, undefined); assert.equal(result.data.passed, false);

  for (const grade of ['Intern', 'Junior', 'Middle', 'Senior', 'Lead']) assert.ok(openPool('Frontend', grade).length >= 2, grade);
  const first = createAttempt(survey('Senior'));
  const chosen = selectOpenTasks(first, { count: 2 });
  assert.equal(new Set(chosen.map(task => task.familyId)).size, 2);
  const next = selectOpenTasks(first, { count: 2, recent: [{ questions: chosen }] });
  assert.ok(next.every(task => !chosen.some(previous => previous.familyId === task.familyId)), 'Seen cases are avoided while fresh ones remain');
});
