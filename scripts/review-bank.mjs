import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gradeLabels } from '../shared/grading.ts';
import { specializationNames } from '../shared/catalog.ts';
import { reviewCoverage, reviewGrades, reviewQuestions, reviewSources, reviewVersion, sampleReviewQuestions, validateReviewBank } from '../server/review-bank.mjs';

const [command = 'validate', grade] = process.argv.slice(2);
const directory = fileURLToPath(new URL('../docs/review-bank/', import.meta.url));
const formats = { code: 'код', sql: 'SQL', calculation: 'расчёт с объяснением', case: 'развёрнутый кейс' };
const save = (name, value) => { mkdirSync(directory, { recursive: true }); writeFileSync(directory + name, value); };
const questionMarkdown = question => `### ${question.title}\n\nID: \`${question.id}\` · ${question.competency} · ${formats[question.answerFormat]} · ориентир ${question.estimatedMinutes} мин.\n\n${question.prompt.replace(/</gu, '&lt;')}\n\nМатериалы задачи: ${question.sourceRefs.map(ref => `[${ref.sourceId}](${ref.url})`).join(', ')}.\n`;
const table = values => '| Область | ' + reviewGrades.map(item => gradeLabels[item]).join(' | ') + ' |\n| --- | ' + reviewGrades.map(() => '---:').join(' | ') + ' |\n'
  + Object.entries(values).map(([name, counts]) => '| ' + (specializationNames[name] || name) + ' | ' + reviewGrades.map(item => counts[item]).join(' | ') + ' |').join('\n');

if (command === 'validate') {
  const errors = validateReviewBank();
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log(JSON.stringify(reviewCoverage(), null, 2));
} else if (command === 'report') {
  const coverage = reviewCoverage();
  save('coverage.md', `# Покрытие исследовательского банка\n\nВерсия ${reviewVersion}. ${coverage.total} самостоятельных задач, ${coverage.competencies} областей компетенций, ${coverage.sources} источников. По ${coverage.byGrade.Intern} задач каждого грейда.\n\nЧисла — покрытие черновика, не подтверждение равноценности задач или достаточности экзамена. Одна задача может относиться к нескольким специализациям; в общий размер банка она входит один раз.\n\n## Специализации\n\n${table(coverage.bySpecialization)}\n\n## Технологии из фильтров\n\n${table(coverage.bySkill)}\n\nНоль означает, что для этой конкретной технологии пока нет отдельной задачи данного уровня. Все ${coverage.filterSkills} значения каталога встречаются в банке, но полный экзамен по каждой технологии и каждому уровню ещё не собран. Строки групповых компетенций содержат разные технологии на разных уровнях; тег не подтверждает все навыки специализации.\n\n## Форматы\n\n${Object.entries(coverage.byFormat).map(([name, count]) => `- ${formats[name]}: ${count}`).join('\n')}\n`);
  const competencyIds = [...new Set(reviewQuestions.map(item => item.competencyId))];
  save('catalog.md', '# Каталог задач для предметного просмотра\n\nНовый банк ожидает одобрения. Действующий экзамен не изменён. Ответы, критерии и контракты будущих вариантов находятся только в серверном модуле.\n\n' + competencyIds.map(id => {
    const questions = reviewQuestions.filter(item => item.competencyId === id);
    const first = questions[0];
    const links = first.sourceIds.map(sourceId => { const source = reviewSources.find(item => item.id === sourceId); return `[${source.title}](${source.url})`; });
    return `## ${first.competency}\n\nИсточники тем: ${links.join('; ')}. Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.\n\n`
      + questions.map(question => `**${gradeLabels[question.grade]}**\n\n${questionMarkdown(question)}\nПредварительное основание уровня: ${question.difficulty.rationale}\n`).join('\n');
  }).join('\n'));
  save('sources.md', '# Найденные источники\n\nИсточники проверены 10 октября 2026. Банк задач, лабораторные, примеры и документация помечены раздельно. Проверка страницы не означает предметную экспертизу всех её задач. Распределение новых сценариев по грейдам — наша предварительная оценка, не шкала авторов источника.\n\n'
    + reviewSources.map(source => `## ${source.title}\n\n[${source.publisher}](${source.url}) · \`${source.id}\` · ${source.kind} · проверка: ${source.verification}\n\nТемы: ${source.topics.join(', ')}.${source.evidence ? '\n\n' + source.evidence : ''}\n`).join('\n'));
  console.log(`Saved coverage, catalog and sources in ${directory}`);
} else if (command === 'sample') {
  const grades = grade ? [grade] : reviewGrades;
  const samples = grades.map(item => ({ grade: item, questions: sampleReviewQuestions(item) }));
  save('samples.md', `# Случайные задачи для согласования\n\nВерсия ${reviewVersion}. Выборка сохранена; повтор команды создаст новую. Равновероятный выбор трёх разных областей компетенций на каждом уровне. Уровни и время предварительные. Эталонные ответы не включены.\n\n`
    + samples.map(item => `## ${gradeLabels[item.grade]}\n\n` + item.questions.map(questionMarkdown).join('\n')).join('\n'));
  console.log(JSON.stringify(samples, null, 2));
} else {
  console.error('Use: node scripts/review-bank.mjs validate | report | sample [Intern|Junior|Middle|Senior|Lead]');
  process.exitCode = 1;
}
