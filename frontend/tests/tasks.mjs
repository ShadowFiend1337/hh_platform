import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { prepareLocalAccounts, localAccountPassword } from '../../scripts/local-accounts.mjs';
import { startIsolatedService } from './helpers/isolated-service.mjs';

// Team fixture cabinets in a disposable database; the review model is a mock.
const folder = await mkdtemp(join(tmpdir(), 'predel-tasks-ui-')), dbPath = join(folder, 'tasks.sqlite');
await prepareLocalAccounts(dbPath);
const llm = { configured: true, models: { chat: 'qwen/mock' }, calls: 0, async chat() {
  this.calls++;
  const json = { verdict: 'approve', score: 88, summary: 'Проблемы найдены и упорядочены.', strengths: ['Приоритеты'], gaps: [], questions: [] };
  return { content: JSON.stringify(json), model: 'qwen/mock', json };
} };
const isolated = await startIsolatedService({ dbPath, llm });
const browser = await chromium.launch();
const errors = [];

async function open(role) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' });
  const login = await context.request.post(isolated.base + '/api/auth/login', { data: { loginOrEmail: 'local_' + role, password: localAccountPassword } });
  assert.equal(login.status(), 200, await login.text());
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  // A concurrent save may get 409 while a task action bumps the revision; the client rebases and retries.
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('409')) errors.push(message.text()); });
  await page.goto(isolated.base + '/app?role=' + role + '&tab=invitations');
  await page.getByRole('button', { name: 'Задания', exact: true }).click();
  await page.getByRole('heading', { name: /^Задания/u }).waitFor();
  return page;
}

try {
  const employer = await open('employer');
  const cards = employer.locator('.task-card');
  await cards.first().waitFor();
  assert.equal(await cards.count(), 3);
  const submitted = cards.filter({ hasText: 'Код-ревью формы входа' });
  await submitted.getByRole('button', { name: 'ИИ-разбор' }).click();
  await submitted.getByText('Можно принять').waitFor();
  assert.match(await submitted.locator('.task-ai-review').innerText(), /Подсказка, а не решение/u);
  await submitted.getByLabel('Комментарий кандидату').fill('Принято: приоритеты верные.');
  await submitted.getByRole('button', { name: 'Принять', exact: true }).click();
  await submitted.locator('.task-status-approved').waitFor();
  await employer.locator('.task-status-scheduled').first().waitFor();
  assert.equal(llm.calls, 1);

  await employer.getByRole('button', { name: 'Новое задание' }).click();
  const form = employer.getByRole('form', { name: 'Новое задание' });
  await form.getByRole('button', { name: 'Разбор инцидента' }).click();
  assert.equal(await form.getByLabel('Название').inputValue(), 'Разбор инцидента');
  await form.getByRole('button', { name: 'Отправить задание' }).click();
  await cards.filter({ hasText: 'Разбор инцидента' }).locator('.task-status-assigned').waitFor();

  const candidate = await open('candidate');
  await candidate.locator('.task-freshness').waitFor();
  const incident = candidate.locator('.task-card').filter({ hasText: 'Разбор инцидента' });
  await incident.getByLabel('Ответ').fill('Сравню метрики до и после релиза, затем профиль запросов и логи медленных эндпоинтов.');
  await incident.getByRole('button', { name: 'Отправить ответ' }).click();
  await incident.locator('.task-status-submitted').waitFor();
  assert.equal(await incident.getByRole('button', { name: 'Отправить ответ' }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('Tasks UI: review with AI advice, approval with next cycle, new task, candidate answer.');
} finally {
  await browser.close();
  await isolated.close();
  await rm(folder, { recursive: true, force: true });
}
