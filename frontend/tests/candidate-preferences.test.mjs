import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveExperienceMonths, deriveLanguageCodes } from '../src/candidate-preferences.ts';

test('complete Russian durations retain exact calendar months and grammatical forms', () => {
  for (const [text, months] of [
    ['3 года 4 месяца', 40], ['1 год 1 месяц', 13], ['2 года и 11 месяцев', 35],
    ['11 лет, 2 месяца', 134], ['21 год', 252], ['22 года', 264], ['25 лет', 300],
    ['4 месяца', 4], ['11 месяцев', 11], ['21 месяц', 21], ['22 месяца', 22],
    ['0 лет', 0], ['0 месяцев', 0], ['  3 ГОДА\u00a04 месяца  ', 40],
    ['Без опыта', 0], ['Без опыта работы', 0], ['Нет опыта', 0],
  ]) assert.equal(deriveExperienceMonths(text), months, text);
});

test('complete English durations use exact singular and plural units', () => {
  for (const [text, months] of [
    ['1 year 1 month', 13], ['3 years and 4 months', 40], ['2 years, 6 months', 30],
    ['18 months', 18], ['0 years', 0], ['1 MONTH', 1], ['No experience', 0], ['No work experience', 0],
  ]) assert.equal(deriveExperienceMonths(text), months, text);
});

test('unknown, partial, reversed and malformed experience never becomes a restriction', () => {
  for (const text of [
    '', ' ', '?', 'До 3 лет', 'от 3 лет', '3–5 лет', 'около 3 лет', '3+',
    '3 года ?', '3 года 4', '4 месяца 3 года', 'Опыт 3 года', '3 года в компании',
    '-1 год', '1.5 года', '1,5 года', '03 года', '3года', '3 years 4 месяца',
    '1 лет', '2 год', '11 года', '21 лет', '1 месяцев', '2 месяц', '11 месяца',
    '1 years', '2 year', '1 months', '2 month', '3 years and', '3 года и',
  ]) assert.equal(deriveExperienceMonths(text), null, text);
});

test('experience accepts only safe totals between zero and 1200 months', () => {
  assert.equal(deriveExperienceMonths('100 лет'), 1200);
  assert.equal(deriveExperienceMonths('99 лет 12 месяцев'), 1200);
  assert.equal(deriveExperienceMonths('1200 месяцев'), 1200);
  assert.equal(deriveExperienceMonths('100 years'), 1200);
  for (const text of ['100 лет 1 месяц', '101 год', '1201 месяц', '999999999999999999999999 лет']) {
    assert.equal(deriveExperienceMonths(text), null, text);
  }
});

test('language names retain declared codes in mention order without inventing proficiency', () => {
  assert.deepEqual(deriveLanguageCodes('Русский — родной; английский — B2; немецкий — B1'), ['ru', 'en', 'de']);
  assert.deepEqual(deriveLanguageCodes('Французский A2, испанский B1, китайский HSK 3'), ['fr', 'es', 'zh']);
  assert.deepEqual(deriveLanguageCodes('English C1 / Russian native / German A2 / French / Spanish / Chinese'), ['en', 'ru', 'de', 'fr', 'es', 'zh']);
  assert.deepEqual(deriveLanguageCodes('RU, en, DE; fr es zh'), ['ru', 'en', 'de', 'fr', 'es', 'zh']);
  assert.deepEqual(deriveLanguageCodes('Deutsch; Français; Español; 中文'), ['de', 'fr', 'es', 'zh']);
  assert.deepEqual(deriveLanguageCodes('Русский; Russian; ru; английский; English; en'), ['ru', 'en']);
});

test('unknown languages, proficiency alone and substrings cannot invent supported languages', () => {
  for (const text of ['', '?', 'B2 C1 родной', 'Italian, Klingon, Japanese', 'Englishman Russianization frontend frenchman', 'ru_en zh2 englishman']) {
    assert.deepEqual(deriveLanguageCodes(text), [], text);
  }
});
