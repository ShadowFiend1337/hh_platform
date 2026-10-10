import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createAssessmentServer } from '../server.mjs';
import { openStore } from '../store.mjs';
import { createAttempt, digest } from '../assessment.mjs';

const survey = () => ({ id: 'integrity-survey', date: new Date().toISOString(), industry: 'ИТ',
  professionalRole: 'Frontend разработчик', specialization: 'Frontend', desiredGrade: 'Junior',
  experience: '1 год', stack: ['React', 'TypeScript'], softSkills: [] });

async function fixture(t) {
  let time = Date.now();
  const codes = new Map();
  const service = createAssessmentServer({ dbPath: ':memory:', now: () => time, authEnv: {},
    authMailer: async ({ email, code }) => { codes.set(email, code); } });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { service.server.close(resolve); service.server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${service.server.address().port}`;
  function client() {
    const cookies = new Map();
    return async (path, method = 'GET', input, headers = {}) => {
      const response = await fetch(base + path, { method, headers: {
        Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        ...(input === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers,
      }, body: input === undefined ? undefined : JSON.stringify(input) });
      for (const value of response.headers.getSetCookie()) {
        const [key, token] = value.split(';')[0].split('=');
        if (token) cookies.set(key, token); else cookies.delete(key);
      }
      return { status: response.status, data: await response.json(), headers: response.headers };
    };
  }
  async function register(role = 'candidate') {
    const request = client(), login = 'integrity.' + randomUUID().slice(0, 8), email = `${login}@example.test`;
    assert.equal((await request('/api/auth/register/request-code', 'POST', {
      role, email, login, password: 'IntegrityFixture2026!', consent: true, privacyVersion: PRIVACY_POLICY_VERSION,
      ...(role === 'candidate' ? { name: 'Вымышленный кандидат' } : { companyName: 'Вымышленная компания' }),
    })).status, 202);
    assert.equal((await request('/api/auth/register/verify', 'POST', { email, code: codes.get(email) })).status, 201);
    return request;
  }
  const candidate = await register();
  const created = await candidate('/api/assessment/attempts', 'POST', { survey: survey() });
  assert.equal(created.status, 201);
  const attempt = created.data, path = `/api/assessment/attempts/${attempt.id}`;
  return { ...service, client, register, candidate, attempt, path,
    advance: milliseconds => { time += milliseconds; },
    event: (kind = 'focus_lost', id = randomUUID()) => ({ token: attempt.token, event: { id, kind } }) };
}

test('integrity telemetry is owned, token-protected, idempotent and timed only by the server', async t => {
  const f = await fixture(t), other = await f.register(), employer = await f.register('employer');
  assert.deepEqual(f.attempt.integrity, { departures: 0, blockedCopies: 0, blockedActions: 0, fullscreenExits: 0, lastEventAt: null });
  const event = f.event(), route = f.path + '/integrity';
  assert.equal((await f.client()(route, 'POST', event)).status, 401);
  assert.equal((await other(route, 'POST', event)).status, 404);
  assert.equal((await employer(route, 'POST', event)).status, 403);
  assert.equal((await f.candidate(route, 'POST', { ...event, token: '0'.repeat(64) })).status, 403);
  assert.equal((await f.candidate(route, 'POST', event, { Origin: 'https://foreign.example' })).status, 403);
  const saved = await f.candidate(route, 'POST', event);
  assert.equal(saved.status, 200); assert.equal(saved.data.departures, 1);
  const receivedAt = saved.data.lastEventAt;
  assert.equal(receivedAt, f.attempt.serverNow);
  f.advance(1000);
  assert.deepEqual((await f.candidate(route, 'POST', event)).data, saved.data);
  assert.equal((await f.candidate(route, 'POST', f.event('copy_blocked', event.event.id))).status, 409);
  assert.equal((await f.candidate(route, 'POST', { ...f.event(), event: { ...event.event, occurredAt: '2000-01-01' } })).status, 400);
  const copy = await f.candidate(route, 'POST', f.event('copy_blocked'));
  assert.equal(copy.data.blockedCopies, 1); assert.equal(copy.data.departures, 1);
  assert.notEqual(copy.data.lastEventAt, receivedAt);
  assert.equal(copy.data.remaining, 2); assert.equal(copy.data.annulled, false);
  const restored = await f.candidate(f.path, 'GET', undefined, { 'X-Attempt-Token': f.attempt.token });
  const { remaining, annulled, ...summary } = copy.data;
  assert.deepEqual(restored.data.integrity, summary);
  assert.equal(restored.headers.get('cache-control'), 'no-store');
  assert.equal(restored.data.expiresAt, f.attempt.expiresAt);
  assert.equal(restored.data.serverNow, copy.data.lastEventAt);
  assert(!JSON.stringify(restored.data).includes('correctOptionId'));
});

test('invalid or excessive events do not change answers, deadline or grade', async t => {
  const f = await fixture(t), route = f.path + '/integrity';
  for (const event of [null, [], { id: 'bad', kind: 'focus_lost' },
    { id: randomUUID(), kind: 'paste' }, { id: randomUUID(), kind: 'copy_blocked', text: 'private clipboard' }]) {
    assert.equal((await f.candidate(route, 'POST', { token: f.attempt.token, event })).status, 400);
  }
  assert.equal(f.store.integrity(f.attempt.id).departures, 0);
  const duplicateId = randomUUID();
  // Blocked copy attempts are signals, not departures: a flood is bounded and never annuls.
  for (let index = 0; index < 128; index++) {
    assert.equal(f.store.recordIntegrity(f.attempt.id, { id: index ? randomUUID() : duplicateId, kind: 'copy_blocked' }, new Date().toISOString()), 'inserted');
  }
  assert.equal((await f.candidate(route, 'POST', f.event('copy_blocked'))).status, 429);
  assert.equal((await f.candidate(route, 'POST', f.event('copy_blocked', duplicateId))).status, 200);
  const row = f.store.get(f.attempt.id);
  assert.equal(row.attempt.expiresAt, f.attempt.expiresAt); assert.equal(row.result, null);
  const answers = row.attempt.questions.map(question => ({ questionId: question.id, optionId: question.correctOptionId }));
  const submitted = await f.candidate(f.path + '/submit', 'POST', { token: f.attempt.token, answers });
  assert.equal(submitted.status, 200); assert.equal(submitted.data.score, 100); assert.equal(submitted.data.passed, true);
  assert.equal((await f.candidate(route, 'POST', f.event())).status, 409);
  assert.deepEqual((await f.candidate(f.path + '/submit', 'POST', { token: f.attempt.token, answers })).data, submitted.data);
});

test('expired attempts reject new telemetry without producing a failed result', async t => {
  const f = await fixture(t);
  f.advance(30 * 60000);
  assert.equal((await f.candidate(f.path + '/integrity', 'POST', f.event())).status, 410);
  assert.equal(f.store.get(f.attempt.id).result, null);
  assert.deepEqual(f.store.integrity(f.attempt.id), { departures: 0, blockedCopies: 0, blockedActions: 0, fullscreenExits: 0, lastEventAt: null });
});

test('three departures annul the attempt on the server; answers and grading stop', async t => {
  const f = await fixture(t), route = f.path + '/integrity';
  const first = await f.candidate(route, 'POST', f.event('visibility_hidden'));
  assert.equal(first.data.remaining, 2); assert.equal(first.data.annulled, false);
  assert.equal((await f.candidate(route, 'POST', f.event('fullscreen_exit'))).data.remaining, 1);
  const third = await f.candidate(route, 'POST', f.event('focus_lost'));
  assert.equal(third.status, 200); assert.equal(third.data.annulled, true);
  assert.equal(third.data.result.annulled, true); assert.equal(third.data.result.passed, false); assert.equal(third.data.result.score, 0);
  const row = f.store.get(f.attempt.id);
  const question = row.attempt.questions[0];
  assert.equal((await f.candidate(f.path + '/answer', 'POST', { token: f.attempt.token, questionId: question.id, optionId: question.correctOptionId })).status, 409);
  const answers = row.attempt.questions.map(item => ({ questionId: item.id, optionId: item.correctOptionId }));
  const submitted = await f.candidate(f.path + '/submit', 'POST', { token: f.attempt.token, answers });
  assert.equal(submitted.data.annulled, true); assert.equal(submitted.data.passed, false);
  // The annulled grade is locked for the retry period; a lower grade stays open.
  const retry = await f.candidate('/api/assessment/attempts', 'POST', { survey: survey() });
  assert.equal(retry.status, 409); assert(retry.data.retryAt);
  assert.equal((await f.candidate('/api/assessment/attempts', 'POST', { survey: { ...survey(), desiredGrade: 'Intern' } })).status, 201);
});

test('sequential delivery reveals one question at a time, locks answers and scores late answers as wrong', async t => {
  const f = await fixture(t);
  assert.equal(f.attempt.questions.length, 1); assert.equal(f.attempt.questionCount, 12); assert.equal(f.attempt.position, 0);
  const row = f.store.get(f.attempt.id);
  const [q1, q2, q3] = row.attempt.questions;
  assert.equal((await f.candidate(f.path + '/answer', 'POST', { token: f.attempt.token, questionId: q2.id, optionId: q2.correctOptionId })).status, 409);
  const answered = await f.candidate(f.path + '/answer', 'POST', { token: f.attempt.token, questionId: q1.id, optionId: q1.correctOptionId });
  assert.equal(answered.status, 200); assert.equal(answered.data.position, 1); assert.equal(answered.data.questions.length, 2);
  assert(!JSON.stringify(answered.data).includes('correctOptionId'));
  // Same answer again is idempotent; a changed answer is rejected.
  assert.equal((await f.candidate(f.path + '/answer', 'POST', { token: f.attempt.token, questionId: q1.id, optionId: q1.correctOptionId })).status, 200);
  const other = q1.options.find(option => option.id !== q1.correctOptionId).id;
  assert.equal((await f.candidate(f.path + '/answer', 'POST', { token: f.attempt.token, questionId: q1.id, optionId: other })).status, 409);
  f.advance(130_000 + 9000);
  const late = await f.candidate(f.path + '/answer', 'POST', { token: f.attempt.token, questionId: q2.id, optionId: q2.correctOptionId });
  assert.equal(late.status, 200);
  assert.equal(f.store.get(f.attempt.id).progress.answers[q2.id].late, true);
  assert.equal((await f.candidate(f.path + '/answer', 'POST', { token: f.attempt.token, questionId: q3.id, optionId: null })).status, 200);
  for (const question of row.attempt.questions.slice(3)) {
    const response = await f.candidate(f.path + '/answer', 'POST', { token: f.attempt.token, questionId: question.id, optionId: question.correctOptionId });
    assert.equal(response.status, 200);
  }
  const result = await f.candidate(f.path + '/submit', 'POST', { token: f.attempt.token });
  assert.equal(result.status, 200);
  assert.equal(result.data.score, 83); assert.equal(result.data.timeouts, 2); assert.equal(result.data.passed, true);
});

test('integrity survives reopening SQLite and cascades with its owner data', t => {
  const directory = mkdtempSync(join(tmpdir(), 'predel-integrity-'));
  const path = join(directory, 'test.sqlite');
  t.after(() => { assert.equal(dirname(directory), resolve(tmpdir())); rmSync(directory, { recursive: true, force: true }); });
  let store = openStore(path);
  const attempt = createAttempt(survey()), event = { id: randomUUID(), kind: 'visibility_hidden' };
  store.insert(attempt, 'test-owner', digest('fixture-token'));
  store.recordIntegrity(attempt.id, event, attempt.createdAt);
  store.close();
  store = openStore(path);
  try {
    assert.deepEqual(store.integrity(attempt.id), { departures: 1, blockedCopies: 0, blockedActions: 0, fullscreenExits: 0, lastEventAt: attempt.createdAt });
    assert.equal(store.recordIntegrity(attempt.id, event, attempt.createdAt), 'duplicate');
    assert.equal(store.deleteOwner('test-owner'), 1);
    assert.deepEqual(store.integrity(attempt.id), { departures: 0, blockedCopies: 0, blockedActions: 0, fullscreenExits: 0, lastEventAt: null });
  } finally { store.close(); }
});

test('a borderline result receives a clarifying block of fresh items; a clear result does not', async t => {
  const f = await fixture(t);
  const answerAll = async (attempt, path, correctCount) => {
    let response, index = 0;
    for (;;) {
      const row = f.store.get(attempt.id);
      const position = Object.keys(row.progress?.answers || {}).length;
      const question = row.attempt.questions[position];
      if (!question) break;
      const wrong = question.options.find(option => option.id !== question.correctOptionId).id;
      response = await f.candidate(path + '/answer', 'POST', { token: attempt.token, questionId: question.id, optionId: index++ < correctCount ? question.correctOptionId : wrong });
      assert.equal(response.status, 200);
      if (response.data.complete) break;
    }
    return response;
  };
  // 8 of 12 correct (67) is borderline: six more items arrive, from the same families, none repeated.
  let extendedSeen = false;
  let index = 0;
  for (;;) {
    const row = f.store.get(f.attempt.id);
    const position = Object.keys(row.progress?.answers || {}).length;
    const question = row.attempt.questions[position];
    if (!question) break;
    const wrong = question.options.find(option => option.id !== question.correctOptionId).id;
    const response = await f.candidate(f.path + '/answer', 'POST', { token: f.attempt.token, questionId: question.id,
      optionId: index < 8 || index >= 12 ? question.correctOptionId : wrong });
    index++;
    assert.equal(response.status, 200);
    if (response.data.extended) {
      extendedSeen = true;
      assert.equal(response.data.questionCount, 18); assert.equal(response.data.complete, false);
      assert.equal(response.data.extension.added, 6);
      assert(!JSON.stringify(response.data).includes('correctOptionId'));
    }
    if (response.data.complete) break;
  }
  assert(extendedSeen, 'The borderline attempt was extended');
  const extended = f.store.get(f.attempt.id).attempt;
  assert.equal(new Set(extended.questions.map(question => question.variantId)).size, 18, 'Clarifying items are fresh');
  const result = await f.candidate(f.path + '/submit', 'POST', { token: f.attempt.token });
  assert.equal(result.data.questionCount, 18); assert.equal(result.data.clarified, true);
  assert.equal(result.data.score, 78, '14 of 18 correct'); assert.equal(result.data.passed, true);

  const second = await f.candidate('/api/assessment/attempts', 'POST', { survey: { ...survey(), desiredGrade: 'Middle' } });
  const done = await answerAll(second.data, `/api/assessment/attempts/${second.data.id}`, 11);
  assert.equal(done.data.complete, true); assert.equal(done.data.extended, false, 'A clear result (92) is not extended');
});
