import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { bankVersion, programs } from './bank.mjs';
import { borderline, createAttempt, emptyProgress, itemsPerFamily, publicAttempt, questionSeconds, threshold } from './assessment.mjs';
import { vacancyExamples } from './vacancies.mjs';
import { specializationNames } from '../shared/catalog.ts';
import { gradeLabels } from '../shared/grading.ts';

const survey = (specialization, desiredGrade) => ({ id: 'validation-survey', date: new Date().toISOString(), industry: 'ИТ', professionalRole: 'Разработчик', specialization, desiredGrade, stack: ['JavaScript'], experience: '3 года', softSkills: [] });
const rows = [];
let variantCount = 0;
for (const [specialization, grades] of Object.entries(programs)) for (const [grade, program] of Object.entries(grades)) {
  const slots = program.topics.flatMap(topic => [1, 2].map(difficulty => program.families.filter(family => family.topic === topic && family.difficulty === difficulty)));
  assert.equal(slots.length, 6);
  const choose = (n, k) => k > n ? 0 : Array.from({ length: k }, (_, index) => (n - index) / (index + 1)).reduce((product, value) => product * value, 1);
  const combinations = slots.reduce((count, families) => count * choose(families.reduce((sum, family) => sum + family.variants.length, 0), itemsPerFamily), 1);
  const variants = program.families.flatMap(family => family.variants);
  variantCount += variants.length;
  let previous = [];
  const samples = new Set();
  for (let index = 0; index < 200; index++) {
    const attempt = createAttempt(survey(specialization, grade), '', previous);
    assert.equal(attempt.questions.length, 12);
    assert.equal(attempt.questions.reduce((sum, item) => sum + item.difficulty, 0), 18);
    for (const topic of program.topics) assert.deepEqual(attempt.questions.filter(item => item.topic === topic).map(item => item.difficulty).sort(), [1, 1, 2, 2]);
    const forbidden = new Set(previous.flatMap(item => item.questions.map(question => question.variantId)));
    assert.ok(attempt.questions.every(item => !forbidden.has(item.variantId)));
    assert.ok(!JSON.stringify(publicAttempt(attempt, emptyProgress(attempt))).includes('correctOptionId'));
    assert.equal(publicAttempt(attempt, emptyProgress(attempt)).questions.length, 1, 'Only the current question is delivered');
    // Diversity across different candidates (no shared history).
    samples.add(createAttempt(survey(specialization, grade), '').questions.map(item => item.variantId).sort().join(','));
    previous = [attempt];
  }
  assert.ok(samples.size >= 20, 'Variant selection has become a predictable short cycle');
  rows.push(`| ${specializationNames[specialization]} ${gradeLabels[grade]} | ${variants.length} | ${combinations} | 200 | ${samples.size} |`);
}
const assets = new URL('../frontend/dist/assets/', import.meta.url);
const names = await readdir(assets);
const bundle = (await Promise.all(names.filter(name => name.endsWith('.js')).map(name => readFile(new URL(name, assets), 'utf8')))).join('\n');
assert.ok(bundle.length, 'Build frontend before validation');
assert.ok(!bundle.includes('correctOptionId'));
for (const grades of Object.values(programs)) for (const program of Object.values(grades)) for (const family of program.families) {
  assert.ok(!bundle.includes(family.id));
  for (const variant of family.variants) assert.ok(!bundle.includes(variant.text), 'Question bank leaked into browser bundle');
}
const examples = vacancyExamples.map(example => {
  const attempt = createAttempt(survey(example.specialization, example.grade), example.description);
  assert.equal(attempt.blueprint.difficultyBudget, 18);
  return `| ${example.title} | ${attempt.vacancy.matchedSkills.join(', ') || 'Нет'} | ${attempt.vacancy.unmatchedSkills.join(', ') || 'Нет распознанных пробелов'} |`;
});
const report = `# Проверка механики тестирования

Дата: ${new Date().toISOString().slice(0, 10)}. Версия банка: ${bankVersion}. Команда воспроизведения: \`npm run build && npm run validate:assessment\`.

Процедура валидации тестирования состоит из трёх частей:

1. **Структура и изоляция** (этот отчёт): каждая форма собирается по одной схеме, ключи не попадают в браузер, задания прошлой попытки исключаются.
2. **Психометрическая симуляция** на синтетических кандидатах (PR.1): разделяющая сила, повторное прохождение, точность решения, устойчивость к утечке — [результаты](assessment_validation_results.md), команда \`npm run validate:assessment-model\`.
3. **Пилот и калибровка в работе**: незачётные пилотные задания, статистика ответов по каждому заданию, автоматический вывод заданий с отрицательной дискриминацией — [динамический банк](dynamic_bank.md).

## Схема формы

Размер авторского банка: ${variantCount}. В каждой попытке — 3 темы × 2 слота сложности × ${itemsPerFamily} задания = 12 зачётных вопросов (сумма авторских уровней 18), плюс до одного незачётного пилотного. Порог ${threshold}/100 (9 из 12). Вопросы выдаются по одному, ${questionSeconds} секунд на вопрос. При балле ${borderline.from}–${borderline.to - 1} добавляется уточняющий блок из 6 свежих заданий, решение принимается по 18. Для каждой программы собраны 200 попыток подряд: проверены число заданий, темы, уровни, исключение заданий прошлой попытки и отсутствие ключей в ответе API.

| Программа | Задач в банке | Наборов до перестановок | Проверено попыток | Различных наборов в прогоне |
| --- | --- | --- | --- | --- |
${rows.join('\n')}

Метки сложности 1 и 2 назначены авторами; их фактическую сопоставимость проверяет пилот (см. динамический банк). Равнозначность форм в модели — в [результатах симуляции](assessment_validation_results.md).

## Формирование из вакансий

Все ${vacancyExamples.length} описаний синтетические. Ниже — один фактически собранный вариант на каждое описание. Распознанные требования влияют на выбор содержательной задачи внутри фиксированного слота; ядро, веса и грейд сохраняются. Показаны навыки выбранных задач, а не всего банка. Неизвестные словарю требования не считаются автоматически покрытыми.

| Описание | Проверяемые совпадения | Распознано, но не проверяется этим вариантом |
| --- | --- | --- |
${examples.join('\n')}

Автотест отдельно проверяет выбор разных задач для вакансий с доступностью и XSS, а также трассировкой и dead-letter queue. Повторение одной вакансии не отменяет исключение заданий прошлой попытки.

## Скрытые ответы

Собранные JavaScript-файлы браузера проверены: в них нет текста вопросов банка, идентификаторов семейств и закрытого поля correctOptionId. Ключи хранятся только на сервере. Вопросы и варианты ответов конкретной попытки доступны кандидату; верные ответы API не возвращает. Правила HTTP, повторная отправка, истечение времени, лимиты и восстановление базы проверяются \`npm run test:server\`; пользовательский путь, перезагрузка и ошибка сервиса — \`npm run test:browser\` и \`npm run test:assessment\`.

## Ограничения

Реальных парных прохождений людьми пока нет: устойчивость и разделяющая сила оценены моделью с явными допущениями, фактические параметры заданий даст пилот. Конечный авторский банк можно выучить, поэтому зачётный пул пополняется проверенными сгенерированными заданиями, а сгенерированные выводятся после 150 показов. Подробности прокторинга — [assessment_integrity.md](assessment_integrity.md).
`;
await writeFile(new URL('../docs/assessment_validation.md', import.meta.url), report, 'utf8');
console.log(`PASS ${rows.length * 200} generated attempts, vacancy mapping and browser bundle isolation; report: ` + fileURLToPath(new URL('../docs/assessment_validation.md', import.meta.url)));
