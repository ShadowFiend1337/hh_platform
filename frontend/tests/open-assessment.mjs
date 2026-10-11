import { fillResumeStack } from './helpers/resume-form.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { prepareLocalAccounts, localAccountPassword } from '../../scripts/local-accounts.mjs';
import { answerExam, answerKey, startExam } from './helpers/exam.mjs';
import { moderator as createModerator, register } from './helpers/accounts.mjs';
import { startIsolatedService } from './helpers/isolated-service.mjs';

// Candidate passes the closed part and solves two open tasks; the mock model scores the
// practice right away and the grade is confirmed at once. A real moderator later annuls the
// attempt from the "Оценено ИИ" tab and the category leaves the candidate's profile.
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
  await candidate.getByRole('heading', { name: 'Грейд подтверждён' }).waitFor();
  const resultText = await candidate.locator('.assessment-result').innerText();
  assert.match(resultText, /Практические задачи оценены автоматически: ИИ проверил ответы по критериям рубрики/u);
  assert.match(resultText, /Эксперт может перепроверить оценку/u);
  assert.match(resultText, /Закрытая часть[\s\S]*Практика\s*100\/100/u);
  assert.equal(llm.calls, 1, 'The practice is scored once, right after the last answer');
  await candidate.screenshot({ path: resolve('test-results', 'open-assessment-ai.png'), fullPage: true });

  // The category is in the profile before any moderator looks at the attempt.
  await candidate.goto(isolated.base + '/app?role=candidate&tab=profile');
  await candidate.getByRole('heading', { name: 'Мой профиль', exact: true }).waitFor();
  assert.match(await candidate.locator('.category-status').textContent(), /Junior/u);
  const history = candidate.getByRole('region', { name: 'История опросов и тестов', exact: true });
  assert.match(await history.innerText(), /Пройден/u);
  assert.match(await history.innerText(), /Практика оценена ИИ/u);

  // Moderator: the attempt scored by the model, prefilled marks, annulment.
  const moderatorContext = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
  await createModerator(moderatorContext, isolated, 'open.moderator');
  const moderator = await moderatorContext.newPage(); watch(moderator);
  // The moderator opens its own cabinet from any address, never the hiring workspace.
  await moderator.goto(isolated.base + '/app?role=employer&tab=candidates');
  await moderator.waitForURL(/\/moderation/u);
  await moderator.getByRole('heading', { name: 'Проверка тестов' }).waitFor();
  await moderator.getByRole('tab', { name: 'Ждут эксперта' }).waitFor();
  assert.equal(await moderator.locator('.review-item').filter({ hasText: 'Вымышленный кандидат' }).count(), 0, 'A scored attempt does not wait for an expert');
  await moderator.getByRole('tab', { name: 'Оценено ИИ' }).click();
  const item = moderator.locator('.review-item').filter({ hasText: 'Вымышленный кандидат' });
  assert.match(await item.innerText(), /практику оценил ИИ/u);
  await item.click();
  const card = moderator.locator('.review-card');
  await card.waitFor();
  await card.locator('.review-status-ai').waitFor();
  assert.equal(await card.locator('.review-task').count(), 2);
  assert.match(await card.locator('.review-task').first().innerText(), /Авторская задача банка|Сгенерировано/u);
  assert.match(await card.locator('.review-answer').first().innerText(), /стабильные ключи/u);
  assert.match(await card.locator('.review-ai-note').innerText(), /Практику оценил ИИ \(qwen\/mock\)/u);
  const criteria = await card.locator('.review-criterion').count();
  assert.ok(criteria >= 2);
  assert.equal(await card.locator('.review-scale [aria-checked="true"]').count(), criteria, 'Every criterion is prefilled with the model score');
  assert.equal(await card.locator('.review-reason').filter({ hasText: 'ИИ: Требование выполнено в ответе.' }).count(), criteria);
  assert.match(await card.locator('.review-summary').innerText(), /пройдёт/u);
  assert.equal(await card.getByRole('button', { name: 'Утвердить оценку' }).isDisabled(), false, 'The model scores can be confirmed as they are');
  assert.equal(await card.getByRole('button', { name: 'ИИ-подсказка оценок' }).count(), 0, 'No advisory call for an attempt already scored');
  assert.equal(await card.getByRole('button', { name: 'Аннулировать' }).isDisabled(), true, 'An annulment needs a reason');
  await card.getByLabel('Комментарий кандидату').fill('Ответы дословно совпадают с опубликованным решением.');
  await moderator.screenshot({ path: resolve('test-results', 'open-assessment-review.png'), fullPage: true });
  await card.getByRole('button', { name: 'Аннулировать' }).click();
  await moderator.locator('.review-card .review-status-invalidated').waitFor();
  assert.match(await moderator.locator('.review-card .review-confirmation').innerText(), /Категория снята с профиля кандидата/u);
  assert.match(await moderator.locator('.review-card .review-decided').innerText(), /Аннулировано экспертом/u);
  assert.equal(llm.calls, 1);
  assert.equal(await moderator.locator('.main-nav').getByRole('link', { name: 'Кандидаты' }).count(), 0, 'No hiring sections in the moderator cabinet');
  assert.equal((await moderatorContext.request.get(isolated.base + '/api/directory/search?q=react')).status(), 403);

  // Candidate: the category is gone, the history shows the expert's decision.
  await candidate.goto(isolated.base + '/app?role=candidate&tab=profile');
  await candidate.getByRole('heading', { name: 'Мой профиль', exact: true }).waitFor();
  assert.match(await candidate.locator('.category-status').textContent(), /Не подтверждён/u);
  assert.match(await history.innerText(), /Аннулировано экспертом/u);
  await history.locator('.history-entry').first().click();
  const dialog = candidate.getByRole('dialog');
  await dialog.getByRole('heading', { name: 'Результат теста', exact: true }).waitFor();
  assert.match(await dialog.innerText(), /Ответы дословно совпадают с опубликованным решением/u);
  await candidate.screenshot({ path: resolve('test-results', 'open-assessment-annulled.png'), fullPage: true });

  // The team test moderator logs in from the login page and sees only test accounts.
  const fixtureContext = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const fixture = await fixtureContext.newPage(); watch(fixture);
  await fixture.goto(isolated.base + '/auth?mode=login');
  await fixture.locator('.demo-account').filter({ hasText: 'Модератор' }).getByRole('button', { name: 'Войти' }).click();
  await fixture.waitForURL(/\/moderation/u);
  await fixture.getByRole('heading', { name: 'Проверка тестов' }).waitFor();
  // The seeded attempt was graded without the model: the closed part decided, the practice waits for an expert.
  const queued = fixture.locator('.review-item').filter({ hasText: 'Тестовый кандидат' });
  await queued.waitFor();
  assert.match(await queued.innerText(), /практика 2 ждёт оценки/u);
  await queued.click();
  await fixture.locator('.review-card .review-ai-failed').waitFor();
  assert.equal(await fixture.locator('.review-card').getByRole('button', { name: 'ИИ-подсказка оценок' }).count(), 1);
  assert.equal(await fixture.locator('.review-item').filter({ hasText: 'Вымышленный кандидат' }).count(), 0, 'Real candidates are not shown');
  assert.equal(await fixture.getByRole('link', { name: 'Достижения' }).count(), 0, 'Achievement claims stay hidden');
  await fixture.getByRole('tab', { name: 'Все попытки' }).click();
  const automatic = fixture.locator('.review-item').filter({ hasText: 'Автоматически' }).first();
  await automatic.click();
  await fixture.getByText('Результат посчитан автоматически').waitFor();
  await fixture.screenshot({ path: resolve('test-results', 'open-assessment-all.png'), fullPage: true });
  assert.equal(localAccountPassword.length > 0, true);
  assert.deepEqual(errors, []);
  console.log('PASS Closed part, two open tasks, immediate AI grading and category, expert annulment from the AI tab revokes the category, queued fixture and test-moderator isolation');
} finally {
  await browser.close();
  await isolated.close();
  await rm(folder, { recursive: true, force: true });
}
