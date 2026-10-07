import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { programs } from '../../server/bank.mjs';
import { createInitialState } from '../src/model.ts';

const base = process.env.PREDEL_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.setDefaultTimeout(15000);

async function snapshot() {
  const response = await context.request.get(base + '/api/platform/state');
  assert.equal(response.status(), 200, await response.text());
  return { ...await response.json(), identity: response.headers()['x-platform-identity'] };
}
async function save(state) {
  const previous = await snapshot();
  const response = await context.request.put(base + '/api/platform/state', {
    headers: { 'X-Platform-Identity': previous.identity }, data: { state, baseRevision: previous.revision },
  });
  assert.equal(response.status(), 200, await response.text());
  return response.json();
}
async function complete(survey, passed) {
  const { id, date, industry, professionalRole, specialization, desiredGrade, experience, stack, softSkills } = survey;
  const response = await context.request.post(base + '/api/assessment/attempts', {
    data: { survey: { id, date, industry, professionalRole, specialization, desiredGrade, experience, stack, softSkills } },
  });
  assert.equal(response.status(), 201, await response.text());
  const attempt = await response.json();
  const keys = new Map(programs[specialization][desiredGrade].families.flatMap(family => family.variants.map(variant => [variant.text, variant.options[variant.correct]])));
  const answers = attempt.questions.map(question => {
    const answer = keys.get(question.text);
    assert.ok(answer);
    const option = question.options.find(item => passed ? item.text === answer : item.text !== answer);
    assert.ok(option);
    return { questionId: question.id, optionId: option.id };
  });
  const graded = await context.request.post(base + `/api/assessment/attempts/${attempt.id}/submit`, { data: { token: attempt.token, answers } });
  assert.equal(graded.status(), 200, await graded.text());
  const result = await graded.json();
  assert.equal(result.passed, passed);
  return result;
}

try {
  await snapshot();
  const surveys = Array.from({ length: 12 }, (_, index) => ({
    id: randomUUID(), date: new Date(Date.now() - (12 - index) * 60000).toISOString(), industry: 'ИТ',
    professionalRole: index === 0 ? 'Первый профиль разработчика' : 'Текущий профиль разработчика',
    specialization: 'Frontend', desiredGrade: 'Junior', experience: index === 0 ? '1 год' : '2 года',
    stack: index === 0 ? ['React'] : ['React', 'TypeScript'], softSkills: index === 0 ? ['Коммуникация'] : ['Лидерство'],
    workHistory: index === 0 ? 'Первый учебный проект: формы и доступность.' : 'Новый учебный проект: каталог и тестирование.',
  }));
  const original = surveys[0], current = surveys.at(-1);
  let state = createInitialState();
  Object.assign(state.profile, current, { id: state.profile.id, name: 'Синтетическая история', email: 'synthetic-history@example.com', consent: true, visible: false, surveyCompletedAt: current.date });
  state.surveys = surveys;
  state = (await save(state)).state;
  const first = await complete(original, true);
  const results = [first];
  for (let index = 0; index < 11; index++) results.push(await complete(current, false));
  state = (await snapshot()).state;
  state.profile.confirmed = { specialization: first.specialization, grade: first.grade, score: first.score, date: first.date, surveyId: first.surveyId };
  state = (await save(state)).state;
  assert.equal(state.history.length, 12);
  assert.equal(state.surveys.length, 12);

  await page.goto(base + '/app?role=candidate&tab=profile');
  await page.getByRole('heading', { name: 'Мой профиль', exact: true }).waitFor();
  const history = page.getByRole('region', { name: 'История опросов и тестов', exact: true });
  assert.equal(await history.locator('[data-result-id]').count(), 10);
  await history.getByRole('button', { name: 'Показать ещё', exact: true }).click();
  assert.equal(await history.locator('[data-result-id]').count(), 12, 'Every available result is reachable');
  await history.locator(`[data-result-id="${first.id}"]`).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('heading', { name: 'Результат теста', exact: true }).waitFor();
  assert.match(await dialog.textContent(), /100\/100 · Пройден/);
  assert.ok((await dialog.textContent()).includes(first.bankVersion));
  for (const item of first.competencies) assert.ok((await dialog.textContent()).includes(item.topic));
  let survey = dialog.locator(`[data-survey-id="${original.id}"]`);
  assert.match(await survey.textContent(), /Первый профиль разработчика/);
  assert.match(await survey.textContent(), /1 год/);
  assert.match(await survey.textContent(), /Коммуникация/);
  assert.match(await survey.textContent(), /Первый учебный проект/);
  assert.ok(!(await survey.textContent()).includes('Текущий профиль'), 'Current profile never replaces the historical questionnaire');
  assert.equal(await dialog.locator('input,textarea,select').count(), 0, 'History is read-only');
  for (const forbidden of ['correctOptionId', 'familyId', 'variantId']) assert.ok(!(await dialog.textContent()).includes(forbidden));
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await history.locator(`[data-result-id="${results.at(-1).id}"]`).click();
  dialog = page.getByRole('dialog');
  assert.match(await dialog.textContent(), /0\/100 · Не пройден/);
  survey = dialog.locator(`[data-survey-id="${current.id}"]`);
  assert.match(await survey.textContent(), /Текущий профиль разработчика/);
  assert.match(await survey.textContent(), /2 года/);
  assert.match(await survey.textContent(), /Лидерство/);
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await history.getByRole('button', { name: 'Анкеты', exact: true }).click();
  assert.equal(await history.locator('[data-survey-id]').count(), 10);
  await history.getByRole('button', { name: 'Показать ещё', exact: true }).click();
  assert.equal(await history.locator('[data-survey-id]').count(), 12, 'Every saved questionnaire is reachable');
  await history.locator(`[data-survey-id="${original.id}"]`).click();
  await page.getByRole('dialog').getByRole('heading', { name: 'Сохранённая анкета', exact: true }).waitFor();
  await page.setViewportSize({ width: 320, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await page.addScriptTag({ path: createRequire(import.meta.url).resolve('axe-core/axe.min.js') });
  const issues = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => item.id));
  assert.deepEqual(issues, []);
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.reload();
  await page.getByRole('heading', { name: 'Мой профиль', exact: true }).waitFor();
  assert.equal((await snapshot()).state.profile.confirmed.grade, 'Junior', 'Viewing a failed historical test keeps the existing category');
  await history.locator('.history-retention summary').click();
  assert.match(await history.locator('.history-retention').textContent(), /500 завершённых тестов и до 100 анкет/);

  // A pre-link legacy response cannot be reconstructed from today's profile.
  // The real server result is only masked for this presentation compatibility check.
  await page.route('**/api/platform/state', async route => {
    const response = await route.fetch();
    const body = await response.json();
    if (route.request().method() === 'GET' && body.state?.history?.length) body.state.history[0].surveyId = null;
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  await page.getByRole('heading', { name: 'Мой профиль', exact: true }).waitFor();
  await history.locator('[data-result-id]').first().click();
  assert.match(await page.getByRole('dialog').locator('.history-missing-survey').textContent(), /нет ссылки на анкету/);
  assert.equal(await page.getByRole('dialog').locator('.survey-snapshot').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS history: 12 real owned results and surveys, pass/fail, read-only linked snapshots, complete pagination, reload, legacy explanation and 320px accessibility');
} finally {
  await context.request.delete(base + '/api/platform/state');
  await context.close();
  await browser.close();
}
