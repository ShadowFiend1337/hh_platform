import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { bankVersion, programs } from './bank.mjs';
import { createAttempt, publicAttempt } from './assessment.mjs';
import { vacancyExamples } from './vacancies.mjs';
import { specializationNames } from '../shared/catalog.ts';
import { gradeLabels } from '../shared/grading.ts';

const survey = (specialization, desiredGrade) => ({ id: 'validation-survey', date: new Date().toISOString(), industry: 'ИТ', professionalRole: 'Разработчик', specialization, desiredGrade, stack: ['JavaScript'], experience: '3 года', softSkills: [] });
const rows = [];
let variantCount = 0;
for (const [specialization, grades] of Object.entries(programs)) for (const [grade, program] of Object.entries(grades)) {
  const slots = program.topics.flatMap(topic => [1, 2].map(difficulty => program.families.filter(family => family.topic === topic && family.difficulty === difficulty)));
  assert.equal(slots.length, 6);
  const combinations = slots.reduce((count, families) => count * families.reduce((sum, family) => sum + family.variants.length, 0), 1);
  const variants = program.families.flatMap(family => family.variants);
  variantCount += variants.length;
  let previous = [];
  const samples = new Set();
  for (let index = 0; index < 200; index++) {
    const attempt = createAttempt(survey(specialization, grade), '', previous);
    assert.equal(attempt.questions.length, 6);
    assert.equal(attempt.questions.reduce((sum, item) => sum + item.difficulty, 0), 9);
    for (const topic of program.topics) assert.deepEqual(attempt.questions.filter(item => item.topic === topic).map(item => item.difficulty).sort(), [1, 2]);
    const forbidden = new Set(previous.flatMap(item => item.questions.map(question => question.variantId)));
    assert.ok(attempt.questions.every(item => !forbidden.has(item.variantId)));
    assert.ok(!JSON.stringify(publicAttempt(attempt)).includes('correctOptionId'));
    samples.add(attempt.questions.map(item => item.variantId).sort().join(','));
    previous = [attempt, ...previous].slice(0, 2);
  }
  assert.ok(samples.size >= 20, 'Variant selection has become a predictable short cycle');
  rows.push(`| ${specializationNames[specialization]} ${gradeLabels[grade]} | ${variants.length} | ${combinations} | 200 | ${samples.size} | 9 |`);
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
  assert.equal(attempt.blueprint.difficultyBudget, 9);
  return `| ${example.title} | ${attempt.vacancy.matchedSkills.join(', ') || 'Нет'} | ${attempt.vacancy.unmatchedSkills.join(', ') || 'Нет распознанных пробелов'} |`;
});
const report = `# Проверка механики тестирования

Дата: ${new Date().toISOString().slice(0, 10)}. Версия банка: ${bankVersion}. Команда воспроизведения: \`npm run build && npm run validate:assessment\`.

Это результаты автоматической проверки структуры и поведения. Они не являются исследованием на кандидатах, измерением фактической сложности или доказательством профессионального грейда.

## Варианты

Размер банка: ${variantCount}. В каждой попытке — три темы, по одному базовому и прикладному заданию каждой темы; одинаковые веса, сумма авторских уровней сложности 9. Для каждой программы сгенерированы 200 попыток. У каждой проверены число заданий, темы, уровни и исключение задач последних двух попыток. Проверка разнообразия дополнительно отсекает короткий предсказуемый цикл наборов.

| Программа | Задач в банке | Наборов до перестановок | Проверено попыток | Различных наборов в прогоне | Бюджет |
| --- | --- | --- | --- | --- | --- |
${rows.join('\n')}

Разные наборы не означают равной фактической сложности. Метки 1 и 2 назначены авторами; необходимы независимая экспертиза и парные прохождения. Малый тест имеет дискретные результаты: 4/6 = 67/100, 5/6 = 83/100; порог 70 требует минимум пяти верных ответов.

## Формирование из вакансий

Все ${vacancyExamples.length} описаний синтетические. Ниже — один фактически собранный вариант на каждое описание. Распознанные требования влияют на выбор содержательной задачи внутри фиксированного слота; ядро, веса и грейд сохраняются. Показаны навыки выбранных задач, а не всего банка. Неизвестные словарю требования не считаются автоматически покрытыми.

| Описание | Проверяемые совпадения | Распознано, но не проверяется этим вариантом |
| --- | --- | --- |
${examples.join('\n')}

Автотест отдельно проверяет выбор разных задач для вакансий с доступностью и XSS, а также трассировкой и dead-letter queue. Повторение одной вакансии не отменяет исключение последних двух вариантов.

## Скрытые ответы

Собранные JavaScript-файлы браузера проверены: в них нет текста вопросов банка, идентификаторов семейств и закрытого поля correctOptionId. Ключи хранятся только на сервере. Вопросы и варианты ответов конкретной попытки доступны кандидату; верные ответы API не возвращает. Правила HTTP, повторная отправка, истечение времени, лимиты и восстановление базы проверяются \`npm run test:server\`; пользовательский путь, перезагрузка и ошибка сервиса — \`npm run test:browser\` и \`npm run test:assessment\`.

## Что пока не доказано

Нет данных реальных парных прохождений, независимых оценщиков и внешней помощи. Не измерены V-TEST-01–V-TEST-03 и устойчивость к запоминанию всего банка. Небольшой банк каждой программы можно выучить; непрозрачные ID, варианты и лимиты снижают повторное использование готового ответа, но не исключают передачу содержания. Для следующего исследования подготовлен \`server/calibrate.mjs\`; процедура описана в [плане валидации](metrics_and_validation.md).
`;
await writeFile(new URL('../docs/assessment_validation.md', import.meta.url), report, 'utf8');
console.log(`PASS ${rows.length * 200} generated attempts, vacancy mapping and browser bundle isolation; report: ` + fileURLToPath(new URL('../docs/assessment_validation.md', import.meta.url)));
