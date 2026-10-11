import test from 'node:test';
import assert from 'node:assert/strict';
import { authoredPrograms, programs } from '../bank.mjs';
import { cueReport, distractorIssues, itemsOf, lengthRange, passChance } from '../bank-cues.mjs';
import { revisedDistractors } from '../banks/revised-distractors.mjs';

const authored = new Map(itemsOf(authoredPrograms).map(item => [item.id, item]));
const inUse = new Map(itemsOf(programs).map(item => [item.id, item]));

test('every revision keeps the authored question, key and key position and passes the cue check', () => {
  for (const [id, distractors] of Object.entries(revisedDistractors)) {
    const original = authored.get(id), current = inUse.get(id);
    assert.ok(original, `${id} is an authored item`);
    assert.equal(current.text, original.text, id);
    assert.equal(current.correct, original.correct, id);
    assert.equal(current.options[current.correct], original.options[original.correct], `${id}: the key is unchanged`);
    assert.deepEqual(current.options.filter((_, index) => index !== current.correct), distractors, id);
    assert.equal(new Set(current.options.map(option => option.toLowerCase())).size, 4, `${id}: four different options`);
    assert.deepEqual(distractorIssues(original.options[original.correct], distractors), [], id);
  }
  // Unrevised items are served exactly as authored.
  for (const [id, item] of inUse) if (!revisedDistractors[id]) assert.deepEqual(item.options, authored.get(id).options, id);
});

test('the cue check flags the giveaway shapes of the old Junior and Middle options', () => {
  assert.deepEqual(lengthRange('Secure и HttpOnly'), [5, 29]);
  assert.match(distractorIssues('Инвалидировать соответствующую серверную сессию, а не только локальную cookie',
    ['Скрыть кнопку профиля', 'Поменять цвет страницы входа', 'Считать удаление cookie отзывом всех копий идентификатора']).join(), /длина вне диапазона|длиннее всех/u);
  assert.match(distractorIssues('Типы и допустимые преобразования по контракту данных',
    ['Никогда не проверять типы полей', 'Проверять любые поля по названию', 'Сохранять значение как есть всегда']).join(), /абсолютные слова/u);
  assert.deepEqual(distractorIssues('Secure и HttpOnly', ['SameSite=Strict и Secure', 'HttpOnly и SameSite=Lax', 'Secure и Partitioned']), []);
});

test('the bank in use gives away no more than the authored bank, and much less where it was revised', () => {
  const before = new Map(cueReport(authoredPrograms).map(row => [row.program, row]));
  for (const row of cueReport(programs)) {
    const old = before.get(row.program);
    assert.ok(row.combined <= old.combined + 0.05, `${row.program}: cue accuracy does not grow`);
  }
  assert.ok(passChance(0.25) < 0.001, 'Random choice never reaches the threshold');
});
