import { fillResumeStack } from './helpers/resume-form.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { prepareLocalAccounts, localAccountPassword } from '../../scripts/local-accounts.mjs';
import { answerExam, answerKey, startExam } from './helpers/exam.mjs';
import { register } from './helpers/accounts.mjs';
import { startIsolatedService } from './helpers/isolated-service.mjs';

// Candidate passes the closed part and solves two open tasks; a moderator grades them
// with advisory scores from a mock model; the candidate's grade is confirmed.
const folder = await mkdtemp(join(tmpdir(), 'predel-open-ui-')), dbPath = join(folder, 'open.sqlite');
await prepareLocalAccounts(dbPath);
const llm = { configured: true, models: { chat: 'qwen/mock' }, calls: 0, async chat(options) {
  this.calls++;
  const tasks = JSON.parse(options.messages[1].content).tasks;
  const json = { tasks: tasks.map(task => ({ questionId: task.questionId, comment: 'Решение по существу верное.',
    criteria: task.criteria.map(item => ({ id: item.id, score: 2, reason: 'Требование выполнено в ответе.' })) })) };
  return { content: JSON.stringify(json), model: 'qwen/mock', json };
} };
const isolated = await startIsolatedService({ dbPath, llm, authEnv: { ASSESSMENT_OPEN_TASKS: '2', API_RATE_LIMIT_PER_MINUTE: '3000' } });
const browser = await chromium.launch();
const errors = [];
const watch = page => {
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());
};

try {
  // Candidate: closed part, then the practical stage.
  const candidateContext = await browser.newContext({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' });
  await register(candidateContext, isolated, 'candidate', 'open.candidate');
  const candidate = await candidateContext.newPage(); watch(candidate);
  await candidate.goto(isolated.base + '/app?role=candidate&tab=onboarding');
  await candidate.locator('.onboarding-form [name="professionalRole"]').selectOption('Frontend-разработчик');
  await candidate.locator('.onboarding-form [name="specialization"]').selectOption('Frontend');
  await candidate.locator('.onboarding-form [name="desiredGrade"]').selectOption('Junior');
  await fillResumeStack(candidate, ['React', 'TypeScript']);
  await candidate.locator('.onboarding-form [name="experience"]').fill('1 год');
  await candidate.getByLabel('Согласен на обработку персональных данных', { exact: true }).check();
  await candidate.getByRole('button', { name: 'К тесту', exact: true }).click();
  await startExam(candidate);
  let sawStage = false;
  await answerExam(candidate, answerKey('Frontend', 'Junior'), { openText: index => {
    sawStage = true;
    return `Решение ${index}: использую стабильные ключи, типы-объединения и тесты на граничные случаи.`;
  } });
  assert.equal(sawStage, true, 'Open tasks follow the passed closed part');
  await candidate.getByRole('heading', { name: 'Ответы на проверке' }).waitFor();
  assert.match(await candidate.locator('.assessment-result').innerText(), /Эксперт проверит открытые задачи \(2\)/u);
  await candidate.screenshot({ path: resolve('test-results', 'open-assessment-pending.png'), fullPage: true });

  // Moderator: queue, details, advisory scores, decision.
  const moderatorContext = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
  const staff = await register(moderatorContext, isolated, 'employer', 'open.moderator');
  isolated.service.auth.store.setModerator(staff.id, true, 'browser-fixture');
  const moderator = await moderatorContext.newPage(); watch(moderator);
  await moderator.goto(isolated.base + '/moderation#tests');
  await moderator.getByRole('heading', { name: 'Проверка тестов' }).waitFor();
  const item = moderator.locator('.review-item').filter({ hasText: 'Вымышленный кандидат' });
  await item.click();
  const card = moderator.locator('.review-card');
  await card.waitFor();
  assert.equal(await card.locator('.review-task').count(), 2);
  assert.match(await card.locator('.review-task').first().innerText(), /Авторская задача банка|Сгенерировано/u);
  assert.match(await card.locator('.review-answer').first().innerText(), /стабильные ключи/u);
  assert.equal(await card.getByRole('button', { name: 'Утвердить оценку' }).isDisabled(), true, 'Every criterion must be scored');
  await card.getByRole('button', { name: 'ИИ-подсказка оценок' }).click();
  await card.getByText(/Подставлены оценки qwen\/mock/u).waitFor();
  assert.match(await card.locator('.review-summary').innerText(), /пройдёт/u);
  await card.getByLabel('Комментарий кандидату').fill('Обе задачи решены верно, хорошие тесты.');
  await moderator.screenshot({ path: resolve('test-results', 'open-assessment-review.png'), fullPage: true });
  await card.getByRole('button', { name: 'Утвердить оценку' }).click();
  await card.locator('.review-status-completed').waitFor();
  assert.equal(llm.calls, 1);

  // Candidate: the reviewed result confirms the grade on the server.
  await candidate.goto(isolated.base + '/app?role=candidate&tab=profile');
  await candidate.getByRole('heading', { name: 'Мой профиль', exact: true }).waitFor();
  assert.match(await candidate.locator('.category-status').textContent(), /Junior/u);
  const history = candidate.getByRole('region', { name: 'История опросов и тестов', exact: true });
  assert.match(await history.innerText(), /Пройден/u);

  // The team test moderator logs in from the login page and sees only test accounts.
  const fixtureContext = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const fixture = await fixtureContext.newPage(); watch(fixture);
  await fixture.goto(isolated.base + '/auth?mode=login');
  await fixture.locator('.demo-account').filter({ hasText: 'Модератор' }).getByRole('button', { name: 'Войти' }).click();
  await fixture.waitForURL(/\/moderation/u);
  await fixture.getByRole('heading', { name: 'Проверка тестов' }).waitFor();
  await fixture.locator('.review-item').filter({ hasText: 'Тестовый кандидат' }).waitFor();
  assert.equal(await fixture.locator('.review-item').filter({ hasText: 'Вымышленный кандидат' }).count(), 0, 'Real candidates are not shown');
  assert.equal(await fixture.getByRole('tab', { name: 'Достижения' }).count(), 0, 'Achievement claims stay hidden');
  await fixture.getByRole('tab', { name: 'Все попытки' }).click();
  const automatic = fixture.locator('.review-item').filter({ hasText: 'Автоматически' }).first();
  await automatic.click();
  await fixture.getByText('Результат посчитан автоматически').waitFor();
  await fixture.screenshot({ path: resolve('test-results', 'open-assessment-all.png'), fullPage: true });
  assert.equal(localAccountPassword.length > 0, true);
  assert.deepEqual(errors, []);
  console.log('PASS Closed part, two open tasks, pending result, moderator review with AI hints, server-side confirmation and test-moderator isolation');
} finally {
  await browser.close();
  await isolated.close();
  await rm(folder, { recursive: true, force: true });
}
