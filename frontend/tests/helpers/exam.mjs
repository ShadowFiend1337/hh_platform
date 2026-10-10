import assert from 'node:assert/strict';
import { programs } from '../../../server/bank.mjs';

/** Question text -> correct option text for one program of the authored bank. */
export function answerKey(specialization, grade) {
  return new Map(programs[specialization][grade].families.flatMap(family => family.variants.map(variant => [variant.text, variant.options[variant.correct]])));
}

/** Accepts the proctoring rules and starts an attempt; resolves with the server response. */
export async function startExam(page) {
  const rules = page.getByLabel('Ознакомлен с правилами и готов начать');
  await rules.waitFor();
  if (!(await rules.isChecked())) await rules.check();
  const started = page.waitForResponse(response => new URL(response.url()).pathname === '/api/assessment/attempts'
    && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Начать тест', exact: true }).click();
  const response = await started;
  assert.equal(response.status(), 201, await response.text());
  await page.locator('.exam-protected-content .question-text').waitFor();
  return response.json();
}

/**
 * Answers every sequential question. `correct` may be a boolean or a function of the
 * question index. Unknown (pilot) questions take the first option.
 */
export async function answerExam(page, key, { correct = true } = {}) {
  // The total can grow when a borderline result receives a clarifying block.
  for (let index = 0; ; index++) {
    await page.locator(`.exam-progress[aria-valuenow="${index + 1}"]`).waitFor();
    const total = Number(await page.locator('.exam-progress').getAttribute('aria-valuemax'));
    const choices = page.locator('.answer-option');
    const texts = (await choices.locator('span').allTextContents()).map(text => text.trim());
    const expected = key?.get((await page.locator('.question-text').textContent()).trim());
    const wantCorrect = typeof correct === 'function' ? correct(index) : correct;
    const chosen = expected ? texts.findIndex(text => (text === expected) === wantCorrect) : 0;
    assert.ok(chosen >= 0, 'Expected an answer option for this program');
    await choices.nth(chosen).click();
    await page.getByRole('button', { name: index === total - 1 ? 'Завершить тест' : 'Ответить', exact: true }).click();
    if (index === total - 1) {
      const next = page.locator(`.exam-progress[aria-valuenow="${index + 2}"]`);
      const result = page.locator('.assessment-result');
      await Promise.race([next.waitFor(), result.waitFor()]);
      if (await result.count()) break;
    }
  }
  await page.locator('.assessment-result').waitFor();
}
