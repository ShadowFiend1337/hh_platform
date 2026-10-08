import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssessmentServer } from '../server.mjs';
import { createInitialState } from '../../frontend/src/model.ts';

test('registered candidate category, employer invitation and accepted contacts survive another browser login', async t => {
  const codes = new Map();
  const service = createAssessmentServer({ dbPath: ':memory:', authEnv: {}, webOrigin: 'http://127.0.0.1:5173',
    authMailer: async ({ email, code }) => { codes.set(email, code); } });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { service.server.close(resolve); service.server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${service.server.address().port}`;
  assert.equal((await fetch(base + '/api/health', { headers: { Origin: 'https://foreign.example.test' } })).status, 403);
  function browser() {
    const cookies = new Map();
    let identity;
    return async (path, method = 'GET', input) => {
      const response = await fetch(base + path, { method, headers: {
        Origin: base,
        Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        ...(input === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(identity ? { 'X-Platform-Identity': identity } : {}),
      }, body: input === undefined ? undefined : JSON.stringify(input) });
      for (const value of response.headers.getSetCookie()) {
        const [key, token] = value.split(';')[0].split('=');
        if (token) cookies.set(key, token); else cookies.delete(key);
      }
      identity = response.headers.get('X-Platform-Identity') || identity;
      return { status: response.status, data: await response.json() };
    };
  }
  async function register(client, role, email, login) {
    assert.equal((await client('/api/auth/register/request-code', 'POST', {
      role, email, login, password: 'test account password', consent: true,
      ...(role === 'candidate' ? { name: 'Тестовый кандидат' } : { companyName: 'Тестовая компания' }),
    })).status, 202);
    assert.equal((await client('/api/auth/register/verify', 'POST', { email, code: codes.get(email) })).status, 201);
    const result = await client('/api/platform/state');
    assert.equal(result.status, 200); assert.equal(result.data.state, null);
  }
  const candidate = browser(), employer = browser(), anotherCandidateBrowser = browser();
  await register(candidate, 'candidate', 'candidate-flow@example.test', 'candidate-flow');
  await register(employer, 'employer', 'employer-flow@example.test', 'employer-flow');
  const candidateState = createInitialState();
  const survey = { id: 'registered-survey', date: new Date().toISOString(), industry: 'ИТ',
    professionalRole: 'Frontend разработчик', specialization: 'Frontend', desiredGrade: 'Junior',
    experience: '1 год', stack: ['React', 'TypeScript'], softSkills: [] };
  Object.assign(candidateState.profile, survey, { id: 'candidate-anna', name: 'Тестовый кандидат',
    email: 'candidate-flow@example.test', phone: '+7 000 000-00-00', consent: true, visible: true,
    bio: 'Разрабатываю доступные формы.', surveyCompletedAt: survey.date });
  candidateState.surveys = [survey];
  const initial = await candidate('/api/platform/state', 'PUT', { state: candidateState, baseRevision: 0 });
  assert.equal(initial.status, 200);
  const beforeTest = await employer('/api/directory/search?filters=' + encodeURIComponent(JSON.stringify({ specialization: 'Frontend' })));
  const unconfirmed = beforeTest.data.items.find(item => item.person.name === 'Тестовый кандидат');
  assert(unconfirmed, 'An explicitly published complete questionnaire is discoverable before confirmation');
  assert.equal(unconfirmed.person.confirmed, null);
  assert.equal(unconfirmed.person.email, '');
  assert.equal(unconfirmed.explanation.category.status, 'unconfirmed');
  const attempt = await candidate('/api/assessment/attempts', 'POST', { survey, vacancyDescription: '' });
  assert.equal(attempt.status, 201);
  // Private fixture inspection supplies answers; the public response never does.
  assert(!JSON.stringify(attempt.data).includes('correctOptionId'));
  const privateAttempt = service.store.get(attempt.data.id).attempt;
  const graded = await candidate(`/api/assessment/attempts/${attempt.data.id}/submit`, 'POST', {
    token: attempt.data.token, answers: privateAttempt.questions.map(question => ({ questionId: question.id, optionId: question.correctOptionId })),
  });
  assert.equal(graded.status, 200); assert.equal(graded.data.passed, true);
  const confirmed = structuredClone(initial.data.state);
  confirmed.history = [graded.data];
  confirmed.profile.confirmed = { specialization: graded.data.specialization, grade: graded.data.grade,
    score: graded.data.score, date: graded.data.date, surveyId: survey.id };
  assert.equal((await candidate('/api/platform/state', 'PUT', { state: confirmed, baseRevision: initial.data.revision })).status, 200);
  const found = await employer('/api/directory/search?filters=' + encodeURIComponent(JSON.stringify({ specialization: 'Frontend', grade: 'Junior' })));
  assert.equal(found.status, 200);
  const person = found.data.items.find(item => item.person.name === 'Тестовый кандидат')?.person;
  assert(person); assert.equal(person.confirmed.grade, 'Junior');
  assert(!person.email && !person.phone);
  assert.equal((await employer(`/api/directory/${person.id}/contacts`)).status, 403);
  const employerState = createInitialState();
  Object.assign(employerState.company, { name: 'Тестовая компания', contact: 'employer-flow@example.test' });
  employerState.invitations = [{ id: 'registered-invitation', candidateId: person.id, companyId: employerState.company.id,
    company: employerState.company.name, title: 'Frontend разработчик', description: 'Разработка форм кабинета.',
    contact: employerState.company.contact, salaryFrom: 100000, salaryTo: 150000, status: 'sent', date: new Date().toISOString() }];
  assert.equal((await employer('/api/platform/state', 'PUT', { state: employerState, baseRevision: 0 })).status, 200);
  assert.equal((await anotherCandidateBrowser('/api/auth/login', 'POST', {
    loginOrEmail: 'candidate-flow@example.test', password: 'test account password' })).status, 200);
  const received = await anotherCandidateBrowser('/api/platform/state');
  assert.equal(received.data.state.profile.confirmed.grade, 'Junior');
  assert.equal(received.data.state.invitations[0].status, 'sent');
  received.data.state.invitations[0].status = 'accepted';
  assert.equal((await anotherCandidateBrowser('/api/platform/state', 'PUT', {
    state: received.data.state, baseRevision: received.data.revision })).status, 200);
  const contacts = await employer(`/api/directory/${person.id}/contacts`);
  assert.equal(contacts.status, 200); assert.equal(contacts.data.email, 'candidate-flow@example.test');
  assert.equal((await candidate('/api/directory/search')).status, 403);
});
