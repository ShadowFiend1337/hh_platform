import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradeLabels } from '../shared/grading.ts';
import { reviewQuestions, reviewSources, reviewGrades } from '../server/review-bank.mjs';
import { closedReviewCases, closedReviewCoverage, closedReviewSheet, validateClosedReviewBank } from '../server/closed-review-bank.mjs';
import { ReviewBankStore } from '../server/review-bank-store.mjs';

const [command='validate'] = process.argv.slice(2);
const dir = fileURLToPath(new URL('../docs/review-bank/', import.meta.url));
const save = (name,text) => { mkdirSync(dir,{recursive:true}); writeFileSync(dir+name,text); };
const escape = text => text.replaceAll('<','&lt;').replaceAll('|','\\|').replaceAll('\n',' ');
const link = ref => `[${ref.sourceId}](${ref.url})`;

if (command==='validate') {
  const errors=validateClosedReviewBank();
  if(errors.length) { console.error(errors.join('\n')); process.exitCode=1; }
  else console.log(JSON.stringify(closedReviewCoverage(),null,2));
} else if(command==='report') {
  const competencyIds=[...new Set(closedReviewCases.map(item=>item.competencyId))];
  save('closed-catalog.md', '# Закрытые кейсы для согласования\n\n165 кейсов, 330 вопросов: 33 компетенции × 5 грейдов × 2 вопроса. Один верный ответ из четырёх в каждом вопросе. Ключи и объяснения находятся в приватных серверных данных.\n\nКаждый кейс связан с открытой задачей того же уровня. Это авторская закрытая адаптация сценария по указанным материалам, а не дословный импорт вопроса источника. Грейд — предварительная оценка; выбор решения не доказывает способность самостоятельно его построить. Время открытого кейса сохранено как предварительный верхний ориентир, оно не откалибровано для закрытого формата.\n\n'
    + competencyIds.map(id => `## ${closedReviewCases.find(c=>c.competencyId===id).competency}\n\n`
      +closedReviewCases.filter(c=>c.competencyId===id).map(item=>{
        const sheet=closedReviewSheet(item);
        return `### ${gradeLabels[item.grade]} — ${item.title}\n\nID: \`${item.id}\` · открытая пара: \`${item.pairedOpenId}\`\n\n${escape(sheet.prompt)}\n\n`
          +sheet.questions.map((q,i)=>`**${i+1}. ${escape(q.prompt)}**\n\n`+q.options.map((s,j)=>`- **${'ABCD'[j]}.** ${escape(s)}`).join('\n')+'\n').join('\n')
          +`\nМатериалы: ${item.sourceRefs.map(link).join(', ')}.\n\nОснование уровня: ${item.difficulty.rationale}\n`;
      }).join('\n')).join('\n'));
  save('source-table.md', '# Таблица источников и происхождения\n\nПроверено 10 октября 2026. Ссылки обозначают тематический материал или техническую опору, а не факт дословного заимствования. Ни один новый сценарий не заявлен как скопированное упражнение. Банк упражнений, документация и статья — разные виды источников. Verification отражает доступность страницы, не предметную экспертизу всей задачи.\n\n'
    +'| Источник | Тип | Проверка | Открытые кейсы | Закрытые кейсы | Закрытые вопросы |\n| --- | --- | --- | ---: | ---: | ---: |\n'
    +reviewSources.map(s=>{
      const n=closedReviewCases.filter(c=>c.sourceIds.includes(s.id)).length;
      return `| [${escape(s.publisher+' — '+s.title)}](${s.url}) | ${s.kind} | ${s.verification} | ${reviewQuestions.filter(q=>q.sourceIds.includes(s.id)).length} | ${n} | ${n*2} |`;
    }).join('\n')
    +'\n\nОдин кейс может иметь несколько материалов; суммы столбцов не равны размеру банка. Подробнее о пределах чтения: [реестр источников](sources.md).\n\n## Сопоставление по задачам\n\nУ каждого закрытого вопроса отдельная запись в БД; ссылки наследуются от кейса, связь сохраняется также в payload и таблице references.\n\n'
    +'| Открытая задача | Закрытый кейс | Вопросы | Основная ссылка | Роль / раздел | Другие материалы |\n| --- | --- | --- | --- | --- | --- |\n'
    +closedReviewCases.map(c=>`| \`${c.pairedOpenId}\` | \`${c.id}\` | ${c.questions.map(q=>'`'+q.id+'`').join(', ')} | ${link(c.sourceRefs[0])} | ${c.sourceRefs[0].relationship}: ${escape(c.sourceRefs[0].locator)} | ${c.sourceRefs.slice(1).map(link).join(', ')} |`).join('\n')+'\n');
  console.log('Saved closed-catalog.md and source-table.md');
} else if(command==='import'||command==='stats') {
  const path=process.env.ASSESSMENT_DB||fileURLToPath(new URL('../server/data/assessment.sqlite',import.meta.url));
  if(path!==':memory:') mkdirSync(dirname(path),{recursive:true});
  const db=new DatabaseSync(path,{timeout:5000});
  try { const store=new ReviewBankStore(db); console.log(JSON.stringify({path,...(command==='import'?store.import():store.stats())},null,2)); }
  finally { db.close(); }
} else { console.error('Use: node scripts/closed-review-bank.mjs validate | report | import | stats'); process.exitCode=1; }
