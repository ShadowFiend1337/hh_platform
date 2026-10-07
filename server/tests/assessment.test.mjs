import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { once } from 'node:events';
import { programs, bankVersion } from '../bank.mjs';
import { gradeOptions } from '../../shared/grading.ts';
import { analyzeVacancy, vacancyExamples } from '../vacancies.mjs';
import { createAttempt, evaluate, publicAttempt, RequestError, validateSurvey } from '../assessment.mjs';
import { createAssessmentServer } from '../server.mjs';
import { specializationOptions, industryOptions } from '../../shared/catalog.ts';

const initialTime = Date.parse('2026-10-05T12:00:00.000Z');
const registrationCodes = new Map();
let nextClient = 0;
function survey(specialization = 'Frontend', desiredGrade = 'Junior') {
  return { id: 'survey-test', date: new Date(initialTime).toISOString(), industry: 'ИТ', professionalRole: 'Разработчик',
    specialization, desiredGrade, experience: '1 год', stack: ['JavaScript'], softSkills: ['Коммуникация'] };
}
function answersFor(attempt, correct = attempt.questions.length) {
  return attempt.questions.map((question, index) => ({ questionId: question.id,
    optionId: index < correct ? question.correctOptionId : question.options.find(option => option.id !== question.correctOptionId).id }));
}
function rejectsStatus(action, status) {
  assert.throws(action, error => error instanceof RequestError && error.status === status);
}
function assertBlueprint(attempt, program) {
  assert.equal(attempt.questions.length, 6);
  assert.equal(attempt.blueprint.difficultyBudget, 9);
  assert.deepEqual(attempt.blueprint.difficultyCounts, { '1': 3, '2': 3 });
  assert.deepEqual(attempt.blueprint.topicCounts, Object.fromEntries(program.topics.map(topic => [topic, 2])));
  for (const topic of program.topics) assert.deepEqual(attempt.questions.filter(question => question.topic === topic).map(question => question.difficulty).sort(), [1, 2]);
  assert.equal(new Set(attempt.questions.map(question => question.id)).size, 6);
  for (const question of attempt.questions) {
    const family = program.families.find(item => item.id === question.familyId);
    const original = family.variants.find(item => item.id === question.variantId);
    assert.equal(question.options.find(option => option.id === question.correctOptionId).text, original.options[original.correct]);
    assert.deepEqual(question.options.map(option => option.text).sort(), [...original.options].sort());
    assert.equal(new Set(question.options.map(option => option.id)).size, 4);
  }
}
async function startServer(t, options = {}) {
  const codes = new Map();
  const service = createAssessmentServer({ dbPath: ':memory:', authEnv: {}, authMailer: async ({ email, code }) => { codes.set(email, code); }, ...options });
  service.server.listen(0, '127.0.0.1');
  await once(service.server, 'listening');
  t.after(() => new Promise((resolveClose, reject) => service.server.close(error => error ? reject(error) : resolveClose())));
  const base = `http://127.0.0.1:${service.server.address().port}`;
  registrationCodes.set(base, codes);
  t.after(() => registrationCodes.delete(base));
  return { ...service, base };
}
function client(base) {
  const cookies = new Map();
  let registration;
  async function raw(path, { method = 'GET', body, headers = {} } = {}) {
    const response = await fetch(base + path, { method, headers: { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
    for (const value of response.headers.getSetCookie()) {
      const [key, token] = value.split(';')[0].split('=');
      if (token) cookies.set(key, token); else cookies.delete(key);
    }
    const json = await response.json();
    return { status: response.status, headers: response.headers, json };
  }
  const request = async (...args) => {
    if (!registration) registration = (async () => {
      const login = `assessment-fixture-${++nextClient}`, email = `${login}@example.test`;
      const sent = await raw('/api/auth/register/request-code', { method: 'POST', body: {
        role: 'candidate', login, email, password: 'assessment fixture password', name: 'Вымышленный кандидат', consent: true,
      } });
      assert.equal(sent.status, 202);
      const verified = await raw('/api/auth/register/verify', { method: 'POST', body: { email, code: registrationCodes.get(base).get(email) } });
      assert.equal(verified.status, 201);
      request.authCookies = verified.headers.get('set-cookie');
    })();
    await registration;
    return raw(...args);
  };
  request.cookieHeader = () => [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
  return request;
}
async function begin(request, input = {}) {
  const response = await request('/api/assessment/attempts', { method: 'POST', body: { survey: survey(), ...input } });
  assert.equal(response.status, 201, JSON.stringify(response.json));
  return response;
}

test('every catalog direction has all five grades with unique content and valid answer indices', () => {
  assert.deepEqual(Object.keys(programs).sort(), specializationOptions.map(item => item.value).sort());
  const ids = new Set();
  const texts = new Set();
  let questionCount = 0;
  for (const grades of Object.values(programs)) {
    assert.deepEqual(Object.keys(grades).sort(), gradeOptions.map(item => item.value).sort());
    for (const program of Object.values(grades)) {
      assert.equal(program.topics.length, 3);
      assert.equal(program.families.length, 6);
      for (const family of program.families) {
        assert(!ids.has(family.id)); ids.add(family.id);
        assert(family.variants.length >= 4);
        assert(family.skills.length > 0);
        for (const variant of family.variants) {
          assert(!ids.has(variant.id)); ids.add(variant.id);
          assert(!texts.has(variant.text)); texts.add(variant.text);
          assert.equal(variant.options.length, 4);
          assert.equal(new Set(variant.options).size, 4);
          assert(Number.isInteger(variant.correct) && variant.correct >= 0 && variant.correct < 4);
          assert(Array.isArray(variant.skills) && variant.skills.length > 0);
          assert(variant.skills.every(skill => family.skills.includes(skill)));
          questionCount++;
        }
      }
    }
  }
  assert.equal(questionCount, specializationOptions.length * gradeOptions.length * 24);
});

test('all public industries validate and arbitrary industry values are rejected', () => {
  for (const industry of industryOptions) assert.equal(validateSurvey({ ...survey(), industry }).industry, industry);
  rejectsStatus(() => validateSurvey({ ...survey(), industry: 'unknown-industry' }), 400);
});

for (const [specialization, grades] of Object.entries(programs)) for (const [grade, program] of Object.entries(grades)) {
  test(`${specialization} ${grade}: 100 attempts keep their blueprint, exclude the previous two variants and produce diverse content sets`, () => {
    const recent = [];
    const contentSets = new Set();
    for (let index = 0; index < 100; index++) {
      const attempt = createAttempt(survey(specialization, grade), '', recent.slice(-2), initialTime + index);
      assert.equal(attempt.bankVersion, bankVersion);
      assertBlueprint(attempt, program);
      const seen = new Set(recent.slice(-2).flatMap(item => item.questions.map(question => question.variantId)));
      for (const question of attempt.questions) assert(!seen.has(question.variantId));
      contentSets.add(attempt.questions.map(question => question.variantId).sort().join(','));
      recent.push(attempt);
    }
    assert(contentSets.size >= 20, `Only ${contentSets.size} substantive sets; do not count question or answer permutations as new content.`);
  });
}

test('public serialization contains only opaque question and option identifiers, never keys or bank identifiers', () => {
  const internal = createAttempt(survey(), '', [], initialTime);
  const exposed = publicAttempt(internal);
  for (const question of exposed.questions) {
    assert.deepEqual(Object.keys(question).sort(), ['id', 'options', 'text', 'topic']);
    assert.match(question.id, /^[0-9a-f-]{36}$/);
    for (const option of question.options) assert.deepEqual(Object.keys(option).sort(), ['id', 'text']);
  }
  const serialized = JSON.stringify(exposed);
  assert(!serialized.includes('correctOptionId'));
  assert(!serialized.includes('variantId'));
  assert(!serialized.includes('familyId'));
  assert(!Object.hasOwn(exposed, 'survey'));
});

test('server grading uses its answer keys: four of six fails and five of six passes', () => {
  const attempt = createAttempt(survey(), '', [], initialTime);
  const failed = evaluate(attempt, answersFor(attempt, 4), initialTime + 1000).result;
  const passed = evaluate(attempt, answersFor(attempt, 5), initialTime + 1000).result;
  assert.equal(failed.score, 67); assert.equal(failed.passed, false);
  assert.equal(passed.score, 83); assert.equal(passed.passed, true);
  assert.equal(passed.competencies.length, 3);
  assert.equal(passed.competencies.reduce((count, topic) => count + topic.total, 0), 6);
});

test('empty self-reported soft skills allow every program without changing its blueprint or grade threshold', () => {
  for (const [specialization, grades] of Object.entries(programs)) for (const [grade, program] of Object.entries(grades)) {
    const attempt = createAttempt({ ...survey(specialization, grade), softSkills: [] }, '', [], initialTime);
    assert.deepEqual(attempt.survey.softSkills, []);
    assert.equal(attempt.specialization, specialization);
    assert.equal(attempt.grade, grade);
    assertBlueprint(attempt, program);
    const failed = evaluate(attempt, answersFor(attempt, 4), initialTime + 1000).result;
    const passed = evaluate(attempt, answersFor(attempt, 5), initialTime + 1000).result;
    assert.equal(failed.score, 67); assert.equal(failed.passed, false);
    assert.equal(passed.score, 83); assert.equal(passed.passed, true);
    assert.equal(passed.specialization, specialization);
    assert.equal(passed.grade, grade);
  }
});

test('optional soft skill selection retains the array contract and rejects malformed values', () => {
  const missing = survey(); delete missing.softSkills;
  rejectsStatus(() => validateSurvey(missing), 400);
  for (const softSkills of [undefined, null, 'Коммуникация', {}, [''], [' '.repeat(3)], [1],
    ['Повтор', 'Повтор'], ['x'.repeat(81)], Array.from({ length: 11 }, (_, index) => `Навык ${index}`)]) {
    rejectsStatus(() => validateSurvey({ ...survey(), softSkills }), 400);
  }
  rejectsStatus(() => validateSurvey({ ...survey(), stack: [], softSkills: [] }), 400);
});

test('resume stacks above twenty skills survive validation up to the shared one hundred skill limit', () => {
  const stack = Array.from({ length: 100 }, (_, index) => `Технология ${index + 1}`);
  for (const count of [21, 100]) {
    const input = { ...survey(), stack: stack.slice(0, count), softSkills: [] };
    const validated = validateSurvey(input);
    assert.deepEqual(validated.stack, input.stack);
    assert.notStrictEqual(validated.stack, input.stack);
  }
  rejectsStatus(() => validateSurvey({ ...survey(), stack: [...stack, 'Лишняя технология'] }), 400);
});

test('forged IDs, duplicate questions, missing answers and injected scores are rejected', () => {
  const attempt = createAttempt(survey(), '', [], initialTime);
  const correct = answersFor(attempt);
  rejectsStatus(() => evaluate(attempt, correct.slice(0, -1), initialTime), 400);
  rejectsStatus(() => evaluate(attempt, [correct[0], correct[0], ...correct.slice(2)], initialTime), 400);
  rejectsStatus(() => evaluate(attempt, [{ ...correct[0], questionId: 'forged' }, ...correct.slice(1)], initialTime), 400);
  rejectsStatus(() => evaluate(attempt, [{ ...correct[0], optionId: 'forged' }, ...correct.slice(1)], initialTime), 400);
  rejectsStatus(() => evaluate(attempt, [{ ...correct[0], score: 100 }, ...correct.slice(1)], initialTime), 400);
  rejectsStatus(() => evaluate(attempt, [{ ...correct[0], optionId: attempt.questions[1].options[0].id }, ...correct.slice(1)], initialTime), 400);
});

test('survey validation rejects unsupported programs and malformed or incomplete questionnaires', () => {
  rejectsStatus(() => validateSurvey({ ...survey(), specialization: 'Unknown' }), 400);
  rejectsStatus(() => validateSurvey({ ...survey(), desiredGrade: 'Principal' }), 400);
  rejectsStatus(() => validateSurvey({ ...survey(), professionalRole: '' }), 400);
  rejectsStatus(() => validateSurvey({ ...survey(), stack: [] }), 400);
  rejectsStatus(() => validateSurvey({ ...survey(), softSkills: ['Повтор', 'Повтор'] }), 400);
  rejectsStatus(() => validateSurvey({ ...survey(), date: 'not-a-date' }), 400);
  const input = survey(); const validated = validateSurvey(input);
  input.stack.push('Mutated');
  assert.deepEqual(validated.stack, ['JavaScript']);
});

test('vacancy examples cover all programs and disclose uncovered requirements without changing core slots', () => {
  assert.equal(new Set(vacancyExamples.map(item => `${item.specialization}/${item.grade}`)).size, specializationOptions.length * gradeOptions.length);
  for (const example of vacancyExamples) {
    const attempt = createAttempt(survey(example.specialization, example.grade), example.description, [], initialTime);
    assertBlueprint(attempt, programs[example.specialization][example.grade]);
    assert(attempt.vacancy.matchedSkills.length > 0);
    assert.equal(attempt.specialization, example.specialization);
    assert.equal(attempt.grade, example.grade);
  }
  const unknown = analyzeVacancy('Требуются Go и Kubernetes', 'Frontend', 'Junior');
  assert.equal(unknown.recognized, false);
  assert.deepEqual(unknown.matchedSkills, []);
  assert.deepEqual(unknown.unmatchedSkills, ['Go', 'Kubernetes']);
  assert.deepEqual(unknown.focusTopics, []);
  const attempt = createAttempt(survey(), 'Требуются Go и Kubernetes', [], initialTime);
  assertBlueprint(attempt, programs.Frontend.Junior);
  assert.equal(attempt.specialization, 'Frontend');
  assert.equal(attempt.grade, 'Junior');
  const empty = analyzeVacancy('', 'Backend', 'Middle');
  assert.equal(empty.recognized, false);
  assert.deepEqual(empty.matchedSkills, []);
});

test('different vacancy descriptions select different substantive tasks inside the same core blueprint', () => {
  const examples = Object.fromEntries(vacancyExamples.map(item => [item.id, item]));
  for (let index = 0; index < 12; index++) {
    const accessible = createAttempt(survey('Frontend', 'Middle'), examples['frontend-react'].description, [], initialTime);
    const secure = createAttempt(survey('Frontend', 'Middle'), examples['frontend-product'].description, [], initialTime);
    const accessibleQuestion = accessible.questions.find(item => item.familyId === 'fm-quality-basics');
    const securityQuestion = secure.questions.find(item => item.familyId === 'fm-quality-basics');
    assert(['fm-quality-basics-a', 'fm-quality-basics-c', 'fm-quality-basics-d'].includes(accessibleQuestion.variantId));
    assert.equal(securityQuestion.variantId, 'fm-quality-basics-b');
    assert.notEqual(accessibleQuestion.text, securityQuestion.text);
    assert.deepEqual(accessible.blueprint, secure.blueprint);
    const tracing = createAttempt(survey('Backend', 'Middle'), examples['backend-payments'].description, [], initialTime);
    const queue = createAttempt(survey('Backend', 'Middle'), examples['backend-orders'].description, [], initialTime);
    assert.equal(tracing.questions.find(item => item.familyId === 'bm-reliability-recovery').variantId, 'bm-reliability-recovery-b');
    assert.equal(queue.questions.find(item => item.familyId === 'bm-reliability-recovery').variantId, 'bm-reliability-recovery-c');
    assert.deepEqual(tracing.blueprint, queue.blueprint);
  }
});

test('vacancy emphasis never overrides non-repetition while fresh variants remain', () => {
  const example = vacancyExamples.find(item => item.id === 'frontend-product');
  const recent = [];
  for (let index = 0; index < 10; index++) {
    const attempt = createAttempt(survey('Frontend', 'Middle'), example.description, recent.slice(-2), initialTime + index);
    const seen = new Set(recent.slice(-2).flatMap(item => item.questions.map(question => question.variantId)));
    for (const question of attempt.questions) assert(!seen.has(question.variantId));
    assertBlueprint(attempt, programs.Frontend.Middle);
    recent.push(attempt);
  }
});

test('authenticated HTTP session is HttpOnly and SameSite; attempt requires both account cookie and token', async t => {
  const service = await startServer(t);
  const request = client(service.base);
  const response = await begin(request);
  const cookie = request.authCookies;
  assert.match(cookie, /predel_account_session=[a-f0-9]{64}/);
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/); assert.match(cookie, /Path=\/api/);
  assert.equal(response.json.token.length, 64);
  const path = `/api/assessment/attempts/${response.json.id}`;
  assert.equal((await request(path)).status, 403);
  assert.equal((await request(path, { headers: { 'X-Attempt-Token': '0'.repeat(64) } })).status, 403);
  const stranger = client(service.base);
  assert.equal((await stranger(path, { headers: { 'X-Attempt-Token': response.json.token } })).status, 404);
  const restored = await request(path, { headers: { 'X-Attempt-Token': response.json.token } });
  assert.equal(restored.status, 200);
  assert.equal(restored.json.status, 'active');
  assert(!JSON.stringify(restored.json).includes('correctOptionId'));
});

test('HTTP submission is immutable and identical replay returns the same result, even after expiry', async t => {
  let time = initialTime;
  const service = await startServer(t, { now: () => time });
  const request = client(service.base);
  const { json: attempt } = await begin(request);
  const privateAttempt = service.store.get(attempt.id).attempt;
  const payload = { token: attempt.token, answers: answersFor(privateAttempt, 5) };
  const path = `/api/assessment/attempts/${attempt.id}/submit`;
  assert.equal((await request(path, { method: 'POST', body: { ...payload, score: 100 } })).status, 400);
  const first = await request(path, { method: 'POST', body: payload });
  assert.equal(first.status, 200); assert.equal(first.json.score, 83); assert.equal(first.json.passed, true);
  time += 31 * 60000;
  const replay = await request(path, { method: 'POST', body: { ...payload, answers: [...payload.answers].reverse() } });
  assert.equal(replay.status, 200); assert.deepEqual(replay.json, first.json);
  const changed = await request(path, { method: 'POST', body: { ...payload, answers: answersFor(privateAttempt, 6) } });
  assert.equal(changed.status, 409);
  const restored = await request(`/api/assessment/attempts/${attempt.id}`, { headers: { 'X-Attempt-Token': attempt.token } });
  assert.equal(restored.json.status, 'completed'); assert.deepEqual(restored.json.result, first.json);
});

test('expired unfinished attempt returns 410 without recording a failed assessment', async t => {
  let time = initialTime;
  const service = await startServer(t, { now: () => time });
  const request = client(service.base);
  const { json: attempt } = await begin(request);
  const answers = answersFor(service.store.get(attempt.id).attempt);
  time += 30 * 60000;
  const path = `/api/assessment/attempts/${attempt.id}`;
  assert.equal((await request(path, { headers: { 'X-Attempt-Token': attempt.token } })).status, 410);
  assert.equal((await request(path + '/submit', { method: 'POST', body: { token: attempt.token, answers } })).status, 410);
  assert.equal(service.store.get(attempt.id).result, null);
});

test('HTTP rejects unsupported inputs, oversized bodies, cross-origin requests and server-bank paths', async t => {
  const service = await startServer(t);
  const request = client(service.base);
  assert.equal((await request('/api/assessment/attempts', { method: 'POST', body: { survey: survey('Backend', 'Principal') } })).status, 400);
  assert.equal((await request('/api/assessment/program?specialization=__proto__&grade=Junior')).status, 400);
  assert.equal((await request('/api/assessment/program?specialization=Frontend&grade=constructor')).status, 400);
  assert.equal((await request('/api/assessment/attempts', { method: 'POST', body: { survey: survey(), questions: [] } })).status, 400);
  assert.equal((await request('/api/assessment/attempts', { method: 'POST', body: { survey: survey(), vacancyDescription: 'x'.repeat(22000) } })).status, 413);
  assert.equal((await request('/api/assessment/attempts', { method: 'POST', body: { survey: survey() }, headers: { Origin: 'https://untrusted.example' } })).status, 403);
  for (const path of ['/server/bank.mjs', '/bank.mjs', '/server/data/assessment.sqlite', '/api/bank', '/%2e%2e/server/bank.mjs']) {
    assert.equal((await request(path)).status, 404);
  }
});

test('attempt creation is rate-limited for the same owner and resumes after its window', async t => {
  let time = initialTime;
  const service = await startServer(t, { now: () => time });
  const request = client(service.base);
  for (let index = 0; index < 20; index++) await begin(request);
  assert.equal((await request('/api/assessment/attempts', { method: 'POST', body: { survey: survey() } })).status, 429);
  time += 3600001;
  await begin(request);
});

test('SQLite keeps private attempts, owner restrictions and immutable results across reopening', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'predel-assessment-test-'));
  const openServers = [];
  t.after(async () => {
    for (const server of openServers) if (server.listening) await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
    const resolved = resolve(directory);
    assert(relative(resolve(tmpdir()), resolved) && !relative(resolve(tmpdir()), resolved).startsWith('..'));
    await rm(resolved, { recursive: true, force: true });
  });
  const dbPath = join(directory, 'attempts.sqlite');
  const codes = new Map();
  const mailer = async ({ email, code }) => { codes.set(email, code); };
  const first = createAssessmentServer({ dbPath, now: () => initialTime, authEnv: {}, authMailer: mailer });
  openServers.push(first.server);
  first.server.listen(0, '127.0.0.1'); await once(first.server, 'listening');
  const firstBase = `http://127.0.0.1:${first.server.address().port}`;
  registrationCodes.set(firstBase, codes);
  const firstClient = client(firstBase), started = await begin(firstClient);
  const cookie = firstClient.cookieHeader(), attempt = started.json;
  const privateAttempt = first.store.get(attempt.id).attempt;
  const payload = { token: attempt.token, answers: answersFor(privateAttempt, 5) };
  const submit = await fetch(`http://127.0.0.1:${first.server.address().port}/api/assessment/attempts/${attempt.id}/submit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(payload),
  });
  assert.equal(submit.status, 200); const result = await submit.json();
  await new Promise((resolveClose, reject) => first.server.close(error => error ? reject(error) : resolveClose()));
  const reopened = createAssessmentServer({ dbPath, now: () => initialTime + 1000, authEnv: {}, authMailer: mailer });
  openServers.push(reopened.server);
  reopened.server.listen(0, '127.0.0.1'); await once(reopened.server, 'listening');
  reopened.base = `http://127.0.0.1:${reopened.server.address().port}`;
  registrationCodes.set(reopened.base, codes);
  t.after(() => { registrationCodes.delete(firstBase); registrationCodes.delete(reopened.base); });
  assert.deepEqual(reopened.store.get(attempt.id).attempt, privateAttempt);
  const restored = await fetch(`${reopened.base}/api/assessment/attempts/${attempt.id}`, { headers: { Cookie: cookie, 'X-Attempt-Token': attempt.token } });
  assert.equal(restored.status, 200); assert.deepEqual((await restored.json()).result, result);
  const replay = await fetch(`${reopened.base}/api/assessment/attempts/${attempt.id}/submit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(payload),
  });
  assert.equal(replay.status, 200); assert.deepEqual(await replay.json(), result);
  assert.equal((await client(reopened.base)(`/api/assessment/attempts/${attempt.id}`, { headers: { 'X-Attempt-Token': attempt.token } })).status, 404);
});
