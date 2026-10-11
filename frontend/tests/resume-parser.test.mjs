import assert from 'node:assert/strict';
import test from 'node:test';
import { parseResumeText } from '../src/resume-parser.ts';
import { MAX_STACK_SKILLS, resumeTextLimits } from '../../shared/resume-limits.ts';
import { professionalRoleOptions, softSkillOptions } from '../../shared/catalog.ts';
import { resumeSections, workHistoryText, careerAchievementsText, petProjectsText, isLegacyWorkMigration, MAX_WORK_EXPERIENCES, MAX_PET_PROJECTS, MAX_RESUME_ITEMS } from '../../shared/resume-structure.ts';

const fixedAsOf = new Date(2026, 9, 6);

test('Russian resume suggests fields and separates common sections', () => {
  const fields = parseResumeText(`Иван Соколов
Frontend разработчик Middle
ivan.test@example.com
Телефон: +7 (999) 000-11-22
Город: Москва
Отрасль: ИТ
Опыт работы: 3 года 4 месяца
Тестовая компания, разработка интерфейсов
НАВЫКИ
React, TypeScript, JavaScript, CSS
Софт-скиллы: Коммуникация, Работа в команде
Достижения
Ускорил загрузку на 30 процентов
Образование
Тестовый университет, 2020
Языки
Английский B2
Портфолио
https://github.com/ivan-test`);
  assert.equal(fields.name, 'Иван Соколов');
  assert.equal(fields.email, 'ivan.test@example.com');
  assert.equal(fields.phone, '+7 (999) 000-11-22');
  assert.equal(fields.city, 'Москва');
  assert.equal(fields.industry, 'ИТ');
  assert.equal(fields.specialization, 'Frontend');
  assert.equal(fields.desiredGrade, 'Middle');
  assert.equal(fields.experience, '3 года 4 месяца');
  assert.deepEqual(fields.stack, ['React', 'TypeScript', 'JavaScript', 'CSS']);
  assert.deepEqual(fields.softSkills, ['Коммуникация', 'Работа в команде']);
  assert.match(fields.careerAchievements, /30 процентов/);
  assert.equal(fields.education, 'Тестовый университет, 2020');
  assert.equal(fields.languages, 'Английский B2');
  assert.equal(fields.portfolio, 'https://github.com/ivan-test');
  assert.doesNotMatch(fields.workHistory, /НАВЫКИ|React|Достижения|университет/);
  assert.equal('consent' in fields, false);
  assert.equal('confirmed' in fields, false);
});

test('English labels and a separate explicit category remain supported', () => {
  const fields = parseResumeText(`JOHN SMITH
Role: Software developer
Specialization: Backend
Grade: Junior
City: London
Experience: 8 months
Skills: Python, FastAPI, SQL
Education
Example college`);
  assert.equal(fields.name, 'John Smith');
  assert.equal(fields.professionalRole, 'Backend-разработчик');
  assert.equal(fields.specialization, 'Backend');
  assert.equal(fields.desiredGrade, 'Junior');
  assert.equal(fields.experience, '8 months');
  assert.deepEqual(fields.stack, ['Python', 'FastAPI', 'SQL']);
});

test('BA, PM and ML retain their stated direction instead of inferring frontend from React', () => {
  for (const [role, specialization, canonicalRole] of [['Бизнес-аналитик / Аналитик данных', undefined, undefined], ['AI Product Manager / Product Manager', 'ProductManagement', 'Менеджер продукта'], ['ML Engineer', 'ML', 'Специалист по машинному обучению']]) {
    const fields = parseResumeText(`Иван Соколов\n${role}\nСтек: Python, React, SQL\nОпыт работы: 5 лет`);
    assert.equal(fields.professionalRole, canonicalRole);
    assert.equal(fields.specialization, specialization);
    assert.equal(fields.desiredGrade, undefined);
    assert.equal(fields.industry, undefined);
    assert.equal(fields.softSkills, undefined);
  }
});

test('Fullstack has its own direction and Senior is imported without reducing it to Middle', () => {
  const fullstack = parseResumeText('Иван Соколов\nFullstack Frontend Backend developer Senior\nSkills: React, Python');
  assert.equal(fullstack.specialization, 'Fullstack');
  assert.equal(fullstack.desiredGrade, 'Senior');
  const senior = parseResumeText('Иван Соколов\nBackend developer Middle\nGrade: Senior\nSpecialization: ML');
  assert.equal(senior.specialization, 'ML');
  assert.equal(senior.desiredGrade, 'Senior');
});

test('past Junior job or years alone do not confer a desired grade', () => {
  const fields = parseResumeText('Иван Соколов\nFrontend developer\nОпыт работы: 6 лет\n2019 Junior Frontend developer\nSkills: React');
  assert.equal(fields.specialization, 'Frontend');
  assert.equal(fields.desiredGrade, undefined);
});

test('pairs of employment dates are not parsed as a telephone number', () => {
  const fields = parseResumeText('Иван Соколов\nБизнес-аналитик\nОпыт работы\n03.2024 - 09.2025\nТестовая компания');
  assert.equal(fields.phone, undefined);
});

test('only stated soft skills are imported and obvious negations are respected', () => {
  const fields = parseResumeText('Иван Соколов\nBackend developer\nРаботал в команде, писал Python.\nНе использую React.\nНет лидерства.');
  assert.equal(fields.softSkills, undefined);
  assert.deepEqual(fields.stack, ['Python']);
});

test('inline sections, punctuation around email and unlabeled header city work', () => {
  const fields = parseResumeText('Соколов Иван, Казань.\nE-mail: ivan.test@example.com .\nОбразование: Тестовый университет.\nПрофессиональный опыт: Стажировка в тестовой компании.\nДостижения: Финалист конкурса.\nНавыки: Python, PostgreSQL');
  assert.equal(fields.name, 'Соколов Иван');
  assert.equal(fields.city, 'Казань');
  assert.equal(fields.email, 'ivan.test@example.com');
  assert.equal(fields.education, 'Тестовый университет.');
  assert.equal(fields.workHistory, 'Стажировка в тестовой компании.');
  assert.equal(fields.careerAchievements, 'Финалист конкурса.');
});

test('absent fields and arbitrary text remain absent', () => {
  assert.deepEqual(parseResumeText('Резюме\nПример документа без данных анкеты'), {});
  assert.equal(parseResumeText('Москва Санкт-Петербург').name, undefined);
});

test('ML internship headline is recognized and past jobs do not replace the desired role', () => {
  const fields = parseResumeText('Иван Соколов\nСтажировка ML/Поиск в VK (Одноклассники, BI)\nНавыки: Python, PyTorch, SQL\nОпыт работы\nFrontend разработчик, 2022\nОтрасль: Телекоммуникации');
  assert.equal(fields.specialization, 'ML');
  assert.equal(fields.industry, 'Телекоммуникации');
  assert.equal(fields.desiredGrade, 'Intern');
  assert.deepEqual(fields.stack, ['Python', 'SQL', 'PyTorch']);
});

test('new role names and their explicit specialization labels use the shared catalog', () => {
  for (const [role, specialization] of [
    ['Mobile developer', 'Mobile'], ['Data Engineer', 'DataEngineering'], ['Data Analyst', 'DataAnalysis'],
    ['DevOps engineer', 'DevOps'], ['QA engineer', 'QA'], ['Information Security engineer', 'Security'],
    ['UX/UI designer', 'UXUI'], ['System analyst', 'BusinessAnalysis'], ['Data Scientist', 'ML'],
    ['Machine-Learning Engineer', 'ML'], ['Product Owner Junior', 'ProductManagement'],
    ['Специалист по машинному обучению', 'ML'], ['Специалист по информационной безопасности', 'Security'],
  ]) {
    assert.equal(parseResumeText(`Иван Соколов\n${role}\nGrade: Junior`).specialization, specialization, role);
    assert.equal(parseResumeText(`Иван Соколов\nSpecialization: ${role}`).specialization, specialization, role);
  }
  assert.equal(parseResumeText('Иван Соколов\nSoftware developer\nSkills: Python, React, PyTorch').specialization, undefined);
  assert.equal(parseResumeText('Иван Соколов\nHTML developer').specialization, undefined);
});

test('expanded industries normalize explicit labels without guessing from employment history', () => {
  for (const [industry, expected] of [['Oil and gas', 'Нефть и газ'], ['E-commerce', 'Электронная коммерция'],
    ['Pharmaceuticals', 'Фармацевтика'], ['Research', 'Наука'], ['Telecommunications', 'Телекоммуникации'],
    ['Logistics', 'Транспорт и логистика'], ['Информационные технологии', 'ИТ'], ['Неизвестная сфера', 'Другое']]) {
    assert.equal(parseResumeText(`Иван Соколов\nIndustry: ${industry}`).industry, expected);
  }
  assert.equal(parseResumeText('Иван Соколов\nBackend developer\nОпыт работы\nНефтяная компания').industry, undefined);
});

test('job achievements preserve subsequent jobs and remain separate from their company names', () => {
  const fields = parseResumeText(`Иван Соколов
Frontend разработчик
Опыт работы: 6 лет 2 месяца
ООО Север
Январь 2023 - настоящее время
Frontend разработчик
1 год 4 месяца
Разрабатывал интерфейсы.
Достижения
Ускорил загрузку страниц.
ООО Вектор
Март 2021 - Декабрь 2022
Frontend разработчик
Создал библиотеку компонентов.
Достижения
Сократил число ошибок.
ООО Старт
Август 2020 - Февраль 2021
Frontend стажер
Написал документацию.
Достижения
Автоматизировал сборку.
Образование
Тестовый университет`);
  assert.equal(fields.experience, '6 лет 2 месяца');
  for (const company of ['ООО Север', 'ООО Вектор', 'ООО Старт']) assert.match(fields.workHistory, new RegExp(company));
  for (const result of ['Ускорил загрузку', 'Сократил число ошибок', 'Автоматизировал сборку']) {
    assert.match(fields.workHistory, new RegExp(result));
    assert.match(fields.careerAchievements, new RegExp(result));
  }
  assert.doesNotMatch(fields.careerAchievements, /ООО|202[0123]|Frontend/);
  assert.doesNotMatch(fields.workHistory, /Образование|университет/);
});

test('a standalone achievement section after dated employment stays separate', () => {
  const fields = parseResumeText(`Иван Соколов
Опыт работы
Тестовая компания
03.2021 - 09.2022
Разработчик
Создал сервис.
Достижения
Финалист учебного конкурса.
Образование
Тестовый университет`);
  assert.equal(fields.careerAchievements, 'Финалист учебного конкурса.');
  assert.doesNotMatch(fields.workHistory, /Финалист|Достижения/);
});

test('date-first jobs do not remove the preceding career achievement', () => {
  const fields = parseResumeText(`Опыт работы
Январь 2024 — Март 2025
Компания Первая
Разработчик
Достижения
Запустил сервис.
Апрель 2025 — настоящее время
Компания Вторая
Разработчик
Поддерживал сервис.
Навыки: Python`);
  assert.equal(fields.careerAchievements, 'Запустил сервис.');
  assert.match(fields.workHistory, /Компания Первая/);
  assert.match(fields.workHistory, /Компания Вторая/);
});

test('a company and title before the next employment date remain only in history', () => {
  const fields = parseResumeText(`Work experience
First Company
January 2023 - December 2023
Backend developer
Achievements
Launched a service.
Second Company
Backend developer
January 2024 - present
Maintained the service.
Skills: Python`);
  assert.equal(fields.careerAchievements, 'Launched a service.');
  assert.match(fields.workHistory, /Second Company\nBackend developer\nJanuary 2024/);
});

test('an overall summary takes priority over individual job durations', () => {
  const fields = parseResumeText(`Иван Соколов
Опыт работы
Тестовая компания
03.2021 - 09.2022
1 год 7 месяцев
Общий стаж: 4 года 6 месяцев`);
  assert.equal(fields.experience, '4 года 6 месяцев');
  assert.equal(parseResumeText('Опыт работы\n2 года 3 месяца\nТестовая компания').experience, '2 года 3 месяца');
  assert.equal(parseResumeText('Experience: no work experience').experience, 'Без опыта');
});

test('the overall duration does not duplicate the employment history', () => {
  for (const heading of ['Опыт работы: 3 года', 'Опыт работы\n3 года', 'Опыт работы\nОбщий стаж: 3 года']) {
    const fields = parseResumeText(`${heading}\nТестовая компания\n03.2021 - 09.2022\n1 год 7 месяцев\nСоздал сервис.`);
    assert.equal(fields.experience, '3 года');
    assert.equal(fields.workHistory, 'Тестовая компания\n03.2021 - 09.2022\n1 год 7 месяцев\nСоздал сервис.');
  }
  assert.equal(parseResumeText('Опыт работы: 3 года').workHistory, undefined);
  assert.equal(parseResumeText('Опыт работы: Без опыта').workHistory, undefined);
});

test('total experience comes from periods rather than company names or job duration labels', () => {
  const fields = parseResumeText(`Иван Соколов
Опыт работы
Тестовая компания
03.2021 - 09.2022
2 месяца
Ещё одна компания
01.2020 - 06.2021
8 месяцев`, { asOf: fixedAsOf });
  assert.equal(fields.experience, '2 года 9 месяцев');
  assert.match(fields.workHistory, /Ещё одна компания/);
  assert.equal(parseResumeText('Опыт работы\nТестовая компания\n8 месяцев', { asOf: fixedAsOf }).experience, undefined);
});

test('parallel and duplicated positions count each calendar month once', () => {
  const fields = parseResumeText(`Опыт работы
Компания Первая
Январь 2024 – Март 2024
Компания Вторая
Март 2024 – Июнь 2024
Компания Третья
02.2024 - 05.2024
Компания Четвёртая
2024-01 - 2024-03`, { asOf: fixedAsOf });
  assert.equal(fields.experience, '6 месяцев');
});

test('adjacent and separated periods preserve gaps and Russian duration inflections', () => {
  const fields = parseResumeText(`Опыт работы
Декабрь 2023 — Январь 2024
Февраль 2024 — Март 2024
Июнь 2024 — Июнь 2024`, { asOf: fixedAsOf });
  assert.equal(fields.experience, '5 месяцев');
  assert.equal(parseResumeText('Опыт работы\nМарт 2021 – Сентябрь 2022', { asOf: fixedAsOf }).experience, '1 год 7 месяцев');
  assert.equal(parseResumeText('Опыт работы\nЯнварь 2024 – Декабрь 2024', { asOf: fixedAsOf }).experience, '1 год');
});

test('ongoing positions use the reference month and do not double count a parallel job', () => {
  for (const present of ['настоящее время', 'по настоящее время', 'до настоящего времени', 'Present', 'current', 'now']) {
    const fields = parseResumeText(`Опыт работы\nСентябрь 2026 – ${present}\nКомпания Вторая\n10.2026 - 10.2026`, { asOf: fixedAsOf });
    assert.equal(fields.experience, '2 месяца', present);
  }
  assert.equal(parseResumeText('Work experience\nJan 2026 - Present', { asOf: new Date(2026, 0, 31) }).experience, '1 месяц');
  assert.equal(parseResumeText('Work experience\nJan 2026 - Present', { asOf: new Date(2026, 2, 1) }).experience, '3 месяца');
});

test('Russian and English month abbreviations and genitive month names are understood', () => {
  for (const [start, end] of [
    ['янв.', 'февр.'], ['мар.', 'апр.'], ['май', 'июн.'], ['июл.', 'авг.'], ['сен.', 'окт.'], ['ноя.', 'дек.'],
    ['Jan.', 'Feb.'], ['MAR', 'APR'], ['May', 'Jun'], ['Jul', 'Aug'], ['Sept.', 'Oct.'], ['Nov.', 'Dec.'],
    ['сентября', 'октября'], ['September', 'October'],
  ]) assert.equal(parseResumeText(`Опыт работы\n${start} 2024 - ${end} 2024`, { asOf: fixedAsOf }).experience, '2 месяца', `${start} / ${end}`);
});

test('numeric, ISO and complete date formats retain monthly precision', () => {
  for (const period of ['03.2021–09.2022', '03/2021 - 09/2022', '2021-03–2022-09', '2021/03 - 2022/09', '15.03.2021 - 20.09.2022', '2021-03-15 - 2022-09-20']) {
    assert.equal(parseResumeText(`Опыт работы\n${period}`, { asOf: fixedAsOf }).experience, '1 год 7 месяцев', period);
  }
});

test('periods split across PDF lines still contribute to total experience and following jobs', () => {
  const fields = parseResumeText(`Опыт работы
Компания Первая
Январь
2024
—
Март
2024
Достижения
Запустил сервис.
Компания Вторая
01.06.2024
-
31.07.2024
Достижения
Улучшил сервис.
Компания Третья
Sept. 2026 -
Present
Образование
2010 - 2015`, { asOf: fixedAsOf });
  assert.equal(fields.experience, '7 месяцев');
  assert.match(fields.workHistory, /Компания Вторая/);
  assert.match(fields.workHistory, /Компания Третья/);
  assert.match(fields.careerAchievements, /Запустил сервис/);
});

test('employer and role prefixes merged with date ranges still contribute to total experience', () => {
  const fields = parseResumeText(`Опыт работы
Тестовая компания. Москва Январь 2024 – Март 2024
Достижения
Запустил сервис.
ООО Вектор Апрель 2024 – Июнь 2024
Frontend разработчик 2024-07 – 2024-08
Компания Последняя Сентябрь 2026 – Present
Образование
Университет 2010 – 2015`, { asOf: fixedAsOf });
  assert.equal(fields.experience, '10 месяцев');
  assert.match(fields.careerAchievements, /Запустил сервис/);
  assert.match(fields.workHistory, /ООО Вектор Апрель 2024/);
});

test('a company prefix and PDF line breaks consume the complete range exactly once', () => {
  const fields = parseResumeText(`Опыт работы
Тестовая компания Январь
2024
—
Март
2024
Компания Вторая Апрель 2024
-
Июнь 2024
Компания Третья Sept. 2026 -
Present`, { asOf: fixedAsOf });
  assert.equal(fields.experience, '8 месяцев');
});

test('Unicode boundaries prevent dates embedded in identifiers from becoming employment periods', () => {
  assert.equal(parseResumeText('Опыт работы\nПроектID2021 - 2024\nЗаказabcЯнварь 2021 - Март 2021', { asOf: fixedAsOf }).experience, undefined);
});

test('year-only periods provide an explicit upper bound and merge with dated jobs', () => {
  assert.equal(parseResumeText('Опыт работы\n2021 - 2022', { asOf: fixedAsOf }).experience, 'До 2 лет');
  assert.equal(parseResumeText('Опыт работы\n2021\n—\n2022\nКомпания Вторая\n03.2022 - 09.2023', { asOf: fixedAsOf }).experience, 'До 2 лет 9 месяцев');
  assert.equal(parseResumeText('Опыт работы\n2026 - Present', { asOf: fixedAsOf }).experience, 'До 10 месяцев');
  assert.equal(parseResumeText('Опыт работы\nЯнварь 2024 - 2024', { asOf: fixedAsOf }).experience, 'До 1 года');
});

test('explicit total and no-experience statements take priority over dated employment', () => {
  for (const [heading, expected] of [['Опыт работы: 4 года 6 месяцев', '4 года 6 месяцев'], ['Опыт работы: Без опыта', 'Без опыта'], ['Experience: no work experience', 'Без опыта']]) {
    assert.equal(parseResumeText(`${heading}\nЯнварь 2024 - Present`, { asOf: fixedAsOf }).experience, expected);
  }
  assert.equal(parseResumeText('Опыт работы\nЯнварь 2024 - Present\nОбщий стаж: 8 месяцев', { asOf: fixedAsOf }).experience, '8 месяцев');
});

test('education and project dates outside an explicit employment section are excluded', () => {
  assert.equal(parseResumeText('Образование\n2010 - 2015\nПроекты\nЯнварь 2016 - Present', { asOf: fixedAsOf }).experience, undefined);
  const fields = parseResumeText(`Образование
2010 - 2015
Опыт работы
Январь 2024 — Март 2024
Запустил проект 2020 - 2023.
Проекты
2016 - 2022
Портфолио
Январь 2023 - Present`, { asOf: fixedAsOf });
  assert.equal(fields.experience, '3 месяца');
});

test('invalid and future periods are ignored and future end dates stop at the reference month', () => {
  for (const period of ['13.2024 - 15.2024', '2024-00 - 2024-03', 'Февраль 2024 - Январь 2024', '2027-01 - Present', '31.02.2024 - 31.03.2024', '31.03.2024 - 01.03.2024', '30.10.2026 - Present']) {
    assert.equal(parseResumeText(`Опыт работы\n${period}`, { asOf: fixedAsOf }).experience, undefined, period);
  }
  assert.equal(parseResumeText('Опыт работы\nСентябрь 2026 - Декабрь 2027', { asOf: fixedAsOf }).experience, '2 месяца');
});

test('calculating an employment duration does not assign a desired grade', () => {
  const fields = parseResumeText('Иван Соколов\nFrontend разработчик\nОпыт работы\nЯнварь 2020 - Present', { asOf: fixedAsOf });
  assert.equal(fields.experience, '6 лет 10 месяцев');
  assert.equal(fields.desiredGrade, undefined);
});

test('partially invalid dates qualify the computed duration and report one warning', () => {
  const warnings = [];
  const fields = parseResumeText(`Опыт работы
Январь 2024 - Июнь 2024
Май 2025 - Январь 2025
2027-01 - Present`, { asOf: fixedAsOf, onWarning: warning => warnings.push(warning) });
  assert.equal(fields.experience, '6 месяцев (по корректным датам)');
  assert.match(fields.workHistory, /Май 2025 - Январь 2025/);
  assert.deepEqual(warnings, ['Некоторые периоды работы не учтены. Проверьте даты в истории работы.']);

  const allInvalidWarnings = [];
  const allInvalid = parseResumeText('Опыт работы\nМай 2025 - Январь 2025\n2027-01 - Present', { asOf: fixedAsOf, onWarning: warning => allInvalidWarnings.push(warning) });
  assert.equal(allInvalid.experience, undefined);
  assert.equal(allInvalidWarnings.length, 1);

  assert.equal(parseResumeText('Опыт работы\n2021 - 2022\nМай 2025 - Январь 2025', { asOf: fixedAsOf }).experience, 'До 2 лет (по корректным датам)');
});

test('three company-prefixed PDF periods preserve all jobs and qualify one reversed period', () => {
  const warnings = [];
  const fields = parseResumeText(`Опыт работы
Компания Первая Ноябрь 2024 – Июль 2024
Компания Вторая Январь 2024 – Февраль 2024
Компания Третья Март 2024 – Июнь 2024`, { asOf: fixedAsOf, onWarning: warning => warnings.push(warning) });
  assert.equal(fields.experience, '6 месяцев (по корректным датам)');
  assert.equal(warnings.length, 1);
  assert.match(fields.workHistory, /Компания Первая/);
  assert.match(fields.workHistory, /Компания Вторая/);
  assert.match(fields.workHistory, /Компания Третья/);
});

test('explicit totals avoid computing invalid dates and a future end date alone needs no warning', () => {
  const warnings = [];
  const options = { asOf: fixedAsOf, onWarning: warning => warnings.push(warning) };
  assert.equal(parseResumeText('Опыт работы: 3 года\nМай 2025 - Январь 2025', options).experience, '3 года');
  assert.equal(parseResumeText('Опыт работы: Без опыта\n2027-01 - Present', options).experience, 'Без опыта');
  assert.equal(parseResumeText('Опыт работы\nСентябрь 2026 - Декабрь 2027', options).experience, '2 месяца');
  assert.deepEqual(warnings, []);
});

test('long employment history preserves its final job beyond the former 4000 characters', () => {
  const details = 'Разрабатывал тестовый сервис и улучшал документацию.\n'.repeat(130);
  const history = `Тестовая компания\n03.2021 - 09.2022\n${details}Последняя тестовая компания\n2020 - 2021\nРазработчик`;
  const truncated = [];
  const fields = parseResumeText(`Опыт работы\n${history}\nОбразование\nТестовый университет`, { onTruncate: field => truncated.push(field) });
  assert.equal(fields.workHistory, history);
  assert.match(fields.workHistory, /Последняя тестовая компания/);
  assert.deepEqual(truncated, []);
});

test('more than twenty technologies and explicitly listed unknown tools are imported', () => {
  const fields = parseResumeText(`Иван Соколов
Навыки: React, TypeScript, JavaScript, CSS, HTML, Vue, Angular, Next.js, Python, FastAPI, Django, Node.js, Java, C#, C++, PHP, SQL, PostgreSQL, MySQL, MongoDB, Redis, Docker, Kubernetes, Git, Linux, Rust, .NET, CI/CD, Линейная алгебра
Есть опыт разработки
Софт-скиллы: Коммуникация, Работа в команде`);
  assert.equal(fields.stack.length, 29);
  for (const skill of ['Git', 'Linux', 'Rust', '.NET', 'CI/CD', 'Линейная алгебра']) assert.ok(fields.stack.includes(skill), skill);
  assert.ok(!fields.stack.includes('Есть опыт разработки'));
  assert.ok(!fields.stack.includes('Коммуникация'));
  assert.ok(!fields.stack.includes('Работа в команде'));
});

test('a later explicit skill is imported even if its first occurrence was negated', () => {
  const fields = parseResumeText('Не использую React в старом проекте.\nНавыки: React, Python');
  assert.deepEqual(fields.stack, ['React', 'Python']);
});

test('truncation callbacks identify only fields exceeding the shared limits', () => {
  const truncated = [];
  const fields = parseResumeText(`Опыт работы\n${'а'.repeat(resumeTextLimits.workHistory + 1)}\nОбразование\n${'б'.repeat(resumeTextLimits.education)}\nДостижения\n${'в'.repeat(resumeTextLimits.careerAchievements + 1)}`, { onTruncate: field => truncated.push(field) });
  assert.equal(fields.workHistory.length, resumeTextLimits.workHistory);
  assert.equal(fields.education.length, resumeTextLimits.education);
  assert.equal(fields.careerAchievements.length, resumeTextLimits.careerAchievements);
  assert.deepEqual(truncated, ['workHistory', 'careerAchievements', 'workExperiences']);

  const tooMany = Array.from({ length: MAX_STACK_SKILLS + 1 }, (_, index) => `Tool${index}`).join(', ');
  const skillTruncation = [];
  assert.equal(parseResumeText(`Навыки: ${tooMany}`, { onTruncate: field => skillTruncation.push(field) }).stack.length, MAX_STACK_SKILLS);
  assert.deepEqual(skillTruncation, ['stack']);
});

test('structured employment separates several company-first positions and keeps every task', () => {
  const fields = parseResumeText(`Иван Соколов
Опыт работы
Acme
Январь 2023 - Декабрь 2023
Backend developer
Разработал API.
Beta Labs
Backend developer
Январь 2024 - present
Поддерживал сервис.
ООО Вектор
03.2022 - 12.2022
Реализовал поиск.`, { asOf: fixedAsOf });
  assert.deepEqual(fields.workExperiences, [
    { period: 'Январь 2023 - Декабрь 2023', company: 'Acme', tasks: 'Backend developer\nРазработал API.' },
    { period: 'Январь 2024 - present', company: 'Beta Labs', tasks: 'Backend developer\nПоддерживал сервис.' },
    { period: '03.2022 - 12.2022', company: 'ООО Вектор', tasks: 'Реализовал поиск.' },
  ]);
  assert.equal(fields.professionalRole, undefined, 'past positions do not become the desired role');
  assert.match(fields.workHistory, /Acme\nЯнварь 2023/);
});

test('date-first employment does not move the previous employer into the next record', () => {
  const fields = parseResumeText(`Опыт работы
Январь 2024 — Март 2025
Компания Первая
Разработчик
Разработал сервис.
Апрель 2025 — настоящее время
Компания Вторая
Разработчик
Поддерживал сервис.`, { asOf: fixedAsOf });
  assert.deepEqual(fields.workExperiences.map(({ company, period }) => ({ company, period })), [
    { company: 'Компания Первая', period: 'Январь 2024 — Март 2025' },
    { company: 'Компания Вторая', period: 'Апрель 2025 — настоящее время' },
  ]);
  assert.match(fields.workExperiences[0].tasks, /Разработал сервис/);
  assert.match(fields.workExperiences[1].tasks, /Поддерживал сервис/);
  assert.equal(fields.name, undefined, 'an employer is not a candidate name');
});

test('split PDF dates and inline employers produce one complete structured period per employer', () => {
  const fields = parseResumeText(`Опыт работы
gesti.tech Январь
2024
—
Март
2024
Разработал тестовый сервис.
ООО Север Апрель 2024
-
Июнь 2024
Поддерживал тестовый сервис.`, { asOf: fixedAsOf });
  assert.deepEqual(fields.workExperiences, [
    { period: 'Январь 2024 — Март 2024', company: 'gesti.tech', tasks: 'Разработал тестовый сервис.' },
    { period: 'Апрель 2024 - Июнь 2024', company: 'ООО Север', tasks: 'Поддерживал тестовый сервис.' },
  ]);
});

test('achievements and additional interests are separate editable items including wrapped PDF bullets', () => {
  const fields = parseResumeText(`Достижения
• Победитель конкурса
  по программированию (2025)
• Патент RU123
Дополнительно
• Алгоритмическое программирование
• Архитектура сетей
Образование
Тестовый университет`);
  assert.deepEqual(fields.achievementItems, ['Победитель конкурса\nпо программированию (2025)', 'Патент RU123']);
  assert.deepEqual(fields.interests, ['Алгоритмическое программирование', 'Архитектура сетей']);
  assert.doesNotMatch(fields.careerAchievements, /Дополнительно|Алгоритмическое|Архитектура|университет/);
});

test('nested job achievements exclude both later employers and an additional interests section', () => {
  const fields = parseResumeText(`Опыт работы
First Company
January 2023 - December 2023
Backend developer
Achievements
Launched a service.
Second Company
Backend developer
January 2024 - present
Maintained the service.
Достижения
Финалист хакатона.
Интересы / дополнительно
Робототехника`, { asOf: fixedAsOf });
  assert.deepEqual(fields.workExperiences.map(entry => entry.company), ['First Company', 'Second Company']);
  assert.deepEqual(fields.achievementItems, ['Launched a service.', 'Финалист хакатона.']);
  assert.deepEqual(fields.interests, ['Робототехника']);
  assert.doesNotMatch(fields.careerAchievements, /Company|Backend|Робототехника/);
});

test('pet projects retain independent names descriptions and explicitly stated stacks', () => {
  const fields = parseResumeText(`Иван Соколов
Pet проекты
Название: Task Board
Описание: Канбан для небольшой команды.
Реализовал приглашения и уведомления.
Стек: TypeScript, React, Rust
Название: Reminder Bot
Описание: Бот напоминаний.
Стек: Python, FastAPI
Достижения
Финалист конкурса.`);
  assert.deepEqual(fields.petProjects, [
    { name: 'Task Board', description: 'Канбан для небольшой команды.\nРеализовал приглашения и уведомления.', stack: ['React', 'TypeScript', 'Rust'] },
    { name: 'Reminder Bot', description: 'Бот напоминаний.', stack: ['Python', 'FastAPI'] },
  ]);
  assert.ok(fields.stack.includes('Rust'), 'explicit project tools also appear among overall competencies');
  assert.deepEqual(fields.achievementItems, ['Финалист конкурса.']);
  assert.equal(fields.workHistory, undefined);
  assert.equal(fields.workExperiences, undefined);
  assert.equal(fields.experience, undefined);
});

test('unlabeled project headings and descriptions survive without inventing missing metadata', () => {
  const fields = parseResumeText(`Проекты
TaskBoard
Создал доску задач для команды.
Технологии: React, TypeScript
ReminderBot
Разработал бота уведомлений.
Стек: Python`);
  assert.deepEqual(fields.petProjects.map(project => project.name), ['TaskBoard', 'ReminderBot']);
  assert.match(fields.petProjects[1].description, /бота уведомлений/);
  const incomplete = parseResumeText('Опыт работы\nСтажировка в учебной команде.\nСоздал сервис.\nPet проекты\nРазработал приложение для заметок.');
  assert.deepEqual(incomplete.workExperiences, [{ period: '', company: '', tasks: 'Стажировка в учебной команде.\nСоздал сервис.' }]);
  assert.deepEqual(incomplete.petProjects, [{ name: '', description: 'Разработал приложение для заметок.', stack: [] }]);
});

test('legacy migration preserves unidentified lines and separates mixed achievement text', () => {
  const workHistory = 'Нестандартный заголовок\n2020?\nВыполнял учебный проект.\nНеизвестная строка';
  const sections = resumeSections({ workHistory, careerAchievements: '• Финалист конкурса\nДополнительно\n• Алгоритмы\n• Сети' });
  assert.equal(workHistoryText(sections.workExperiences), workHistory);
  assert.deepEqual(sections.achievementItems, ['Финалист конкурса']);
  assert.deepEqual(sections.interests, ['Алгоритмы', 'Сети']);
  const longHistory = 'Неопознанная строка опыта.\n'.repeat(250).trim();
  const migrated = resumeSections({ workHistory: longHistory });
  assert.equal(migrated.workExperiences.map(entry => entry.tasks).join('\n'), longHistory);
  assert.ok(migrated.workExperiences.every(entry => entry.tasks.length <= 4000));
});

test('explicit empty structured arrays do not resurrect removed legacy fields', () => {
  assert.deepEqual(resumeSections({ workHistory: 'Старый опыт', careerAchievements: 'Старое достижение\nДополнительно\nСтарый интерес', workExperiences: [], petProjects: [], achievementItems: [], interests: [] }), {
    workExperiences: [], petProjects: [], achievementItems: [], interests: [],
  });
  assert.equal(workHistoryText([]), '');
  assert.equal(careerAchievementsText([]), '');
  assert.equal(petProjectsText([]), '');
});

test('shared structured limits constrain individual fields counts and total projections', () => {
  const sections = resumeSections({
    workExperiences: Array.from({ length: 40 }, () => ({ period: 'П'.repeat(150), company: 'К'.repeat(250), tasks: 'Т'.repeat(5000) })),
    petProjects: Array.from({ length: 40 }, () => ({ name: 'Н'.repeat(250), description: 'О'.repeat(5000), stack: ['С'.repeat(100), 'TypeScript', 'TypeScript'] })),
    achievementItems: Array.from({ length: 70 }, () => 'Д'.repeat(200)),
    interests: Array.from({ length: 70 }, () => 'И'.repeat(200)),
  });
  assert.ok(sections.workExperiences.length <= MAX_WORK_EXPERIENCES);
  assert.ok(sections.petProjects.length <= MAX_PET_PROJECTS);
  assert.ok(sections.achievementItems.length <= MAX_RESUME_ITEMS);
  assert.ok(sections.interests.length <= MAX_RESUME_ITEMS);
  for (const entry of sections.workExperiences) {
    assert.ok(entry.period.length <= 100);
    assert.ok(entry.company.length <= 200);
    assert.ok(entry.tasks.length <= 4000);
  }
  for (const entry of sections.petProjects) {
    assert.ok(entry.name.length <= 200);
    assert.ok(entry.description.length <= 4000);
    assert.ok(entry.stack.every(skill => skill.length <= 80));
    assert.equal(new Set(entry.stack).size, entry.stack.length);
  }
  assert.ok(workHistoryText(sections.workExperiences).length <= 20_000);
  assert.ok(petProjectsText(sections.petProjects).length <= 20_000);
  assert.ok(careerAchievementsText(sections.achievementItems).length <= 4000);
  assert.ok(careerAchievementsText(sections.interests).length <= 4000);
});

test('expanded soft skills import only stated positive competencies from the shared options', () => {
  const fields = parseResumeText('Софт-скиллы: Критическое мышление, Эмпатия, Наставничество, Внимание к деталям\nНет стрессоустойчивости.');
  assert.deepEqual(fields.softSkills, ['Критическое мышление', 'Внимание к деталям', 'Эмпатия', 'Наставничество']);
  assert.ok(fields.softSkills.every(skill => softSkillOptions.includes(skill)));
  const role = parseResumeText('Иван Соколов\nPython Backend-разработчик');
  assert.equal(role.professionalRole, 'Backend-разработчик');
  assert.ok(professionalRoleOptions.includes(role.professionalRole));
});

test('a singular pet-project header and PDF stack line break stay in the same project', () => {
  const fields = parseResumeText(`Pet-проект: Data Tracker
Описание: Сбор статистики приложения.
Стек:
Python, Rust, PostgreSQL
Достижения: Финалист хакатона.`);
  assert.deepEqual(fields.petProjects, [{ name: 'Data Tracker', description: 'Сбор статистики приложения.', stack: ['Python', 'PostgreSQL', 'Rust'] }]);
  assert.ok(fields.stack.includes('Rust'));
  assert.deepEqual(fields.achievementItems, ['Финалист хакатона.']);
});

test('long explicitly supplied project stacks are retained within the total project budget', () => {
  const stack = Array.from({ length: 75 }, (_, index) => `${index} ${'К'.repeat(75)}`);
  const result = resumeSections({ petProjects: [{ name: 'Проект', description: 'Описание', stack }] });
  assert.equal(result.petProjects[0].stack.length, 75);
  assert.deepEqual(result.petProjects[0].stack, stack);
  assert.ok(petProjectsText(result.petProjects).length < 20_000);
});

test('embedded competencies import from explicit resume skills without confusing C with C++', () => {
  const fields = parseResumeText('Иван Соколов\nEmbedded developer\nСтек: C, C++, STM32, FreeRTOS, UART, SPI, I2C, KiCad, PCB, Осциллограф');
  assert.equal(fields.specialization, 'Embedded');
  assert.ok(fields.stack.includes('C'));
  assert.ok(fields.stack.includes('C++'));
  for (const skill of ['STM32', 'FreeRTOS', 'UART', 'SPI', 'I2C', 'KiCad', 'PCB', 'Осциллограф']) assert.ok(fields.stack.includes(skill), skill);
  assert.deepEqual(parseResumeText('Стек: C++').stack, ['C++']);
});

test('structured collection caps report truncation while legacy source text stays available', () => {
  const warnings = [];
  const jobs = Array.from({ length: 31 }, (_, index) => `Компания ${index + 1}\nЯнварь 2024 - Март 2024\nРазработал API ${index + 1}.`).join('\n');
  const achievementRows = Array.from({ length: 51 }, (_, index) => `• Результат ${index + 1}`).join('\n');
  const fields = parseResumeText(`Опыт работы\n${jobs}\nДостижения\n${achievementRows}`, { onTruncate: field => warnings.push(field), asOf: fixedAsOf });
  assert.equal(fields.workExperiences.length, MAX_WORK_EXPERIENCES);
  assert.equal(fields.achievementItems.length, MAX_RESUME_ITEMS);
  assert.match(fields.workHistory, /Компания 31/);
  assert.match(fields.careerAchievements, /Результат 51/);
  assert.deepEqual(warnings, ['workExperiences', 'achievementItems']);
});

test('the letter C in an employer name does not infer a programming competency', () => {
  const fields = parseResumeText('Опыт работы\nCompany C\n2023 - 2024\nРазработал сервис.\nPet проекты\nНазвание: Project C\nОписание: Собрал прототип.');
  assert.equal(fields.stack, undefined);
  assert.deepEqual(fields.petProjects[0].stack, []);
});

test('maximum-length legacy history preserves its final characters despite projected entry separators', () => {
  const suffix = 'ПОСЛЕДНЯЯ-СТРОКА!';
  const legacy = 'x'.repeat(20_000 - suffix.length) + suffix;
  const result = resumeSections({ workHistory: legacy });
  assert.equal(result.workExperiences.map(entry => entry.tasks).join(''), legacy);
  assert.ok(result.workExperiences.every(entry => entry.tasks.length <= 4000));
  assert.ok(workHistoryText(result.workExperiences).endsWith(suffix));
  assert.equal(workHistoryText(result.workExperiences).replace(/\n\n/g, ''), legacy);
  assert.ok(workHistoryText(result.workExperiences).length > 20_000, 'the editable migrated draft exposes its budget instead of silently clipping data');
  const bounded = resumeSections({ workExperiences: result.workExperiences });
  assert.ok(workHistoryText(bounded.workExperiences).length <= 20_000, 'explicit structured normalization still enforces its existing total limit');
});

test('unknown and ambiguous imported roles retain their original wording in an actionable warning', () => {
  for (const role of ['Архитектор вселенной', 'Бизнес-аналитик / Аналитик данных']) {
    const warnings = [];
    const fields = parseResumeText(`Иван Соколов\nРоль в команде: ${role}`, { onWarning: message => warnings.push(message) });
    assert.equal(fields.professionalRole, undefined);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes(role));
    assert.match(warnings[0], /Выберите.*из списка/);
  }
});

test('contact and summary headings before the candidate header do not hide identity or desired role', () => {
  const fields = parseResumeText(`Contacts
Иван Соколов
candidate@example.test
About Me
Frontend developer Junior
Skills: React, TypeScript
Work Experience
Example Company
2024 - 2025
Backend developer`);
  assert.equal(fields.name, 'Иван Соколов');
  assert.equal(fields.professionalRole, 'Frontend-разработчик');
  assert.equal(fields.specialization, 'Frontend');
  assert.equal(fields.desiredGrade, 'Junior');
  assert.equal(parseResumeText('About Me\nРазработал учебный проект.\nОпыт работы\n2024 - 2025\nBackend developer').name, undefined);
});

test('project stacks split into bullet lines retain tools instead of creating artificial projects', () => {
  const fields = parseResumeText(`Pet проекты
Название: Task Board
Описание: Доска задач.
Технологии:
• React
• TypeScript
• Rust
Название: Reminder Bot
Описание: Бот уведомлений.
Стек:
Python
FastAPI
PostgreSQL`);
  assert.deepEqual(fields.petProjects, [
    { name: 'Task Board', description: 'Доска задач.', stack: ['React', 'TypeScript', 'Rust'] },
    { name: 'Reminder Bot', description: 'Бот уведомлений.', stack: ['Python', 'FastAPI', 'PostgreSQL'] },
  ]);
  assert.ok(fields.stack.includes('Rust'));
});

test('project text stays in its own saved section while its dates stay outside employment duration', () => {
  const fields = parseResumeText(`Опыт работы
Example Company
January 2024 - June 2024
Разработал сервис.
Pet проекты
Название: Task Board
Описание: 2020 - 2023
Создал учебное приложение.
Стек: React, TypeScript
Достижения
Финалист конкурса.`, { asOf: fixedAsOf });
  assert.equal(fields.experience, '6 месяцев');
  assert.match(fields.workHistory, /Example Company/);
  assert.doesNotMatch(fields.workHistory, /Task Board|учебное приложение/);
  assert.match(fields.petProjects[0].description, /Создал учебное приложение/);
  assert.equal(fields.workExperiences.length, 1);
  assert.doesNotMatch(fields.workExperiences[0].tasks, /Task Board|учебное приложение/);
  assert.equal(fields.careerAchievements, 'Финалист конкурса.');
  assert.doesNotMatch(fields.careerAchievements, /Task Board/);
  const warnings = [];
  parseResumeText(`Опыт работы\n${'Задача.\n'.repeat(2400)}\nPet проекты\nНазвание: Task Board\nОписание: ${'Проект. '.repeat(300)}`, {
    onTruncate: field => warnings.push(field), asOf: fixedAsOf,
  });
  assert.ok(!warnings.includes('workHistory'), 'project text uses its separate budget');
});

test('technology labels nested inside employment never hide the following employer', () => {
  const fields = parseResumeText(`Опыт работы
Alpha
Январь 2023 - Декабрь 2023
Создал сервис.
Стек: NestJS, TS, postgres, Custom SDK
Beta
Январь 2024 - Декабрь 2024
Поддерживал приложение.
Технологии: Rust, ClickHouse
Достижения
Финалист конкурса.`, { asOf: fixedAsOf });
  assert.deepEqual(fields.workExperiences.map(job => job.company), ['Alpha', 'Beta']);
  assert.match(fields.workExperiences[0].tasks, /Создал сервис/);
  assert.match(fields.workExperiences[1].tasks, /Поддерживал приложение/);
  for (const skill of ['NestJS', 'TypeScript', 'PostgreSQL', 'Custom SDK', 'Rust', 'ClickHouse']) assert.ok(fields.stack.includes(skill), skill);
  assert.doesNotMatch(fields.workHistory, /Финалист/);
});

test('English stack labels and aliases preserve custom and specific tools without duplicate selections', () => {
  const fields = parseResumeText('Stack: TS, TypeScript, nodejs, postgres, Custom SDK, MongoDB Atlas, React Native, R, C');
  for (const skill of ['TypeScript', 'Node.js', 'PostgreSQL', 'Custom SDK', 'MongoDB Atlas', 'React Native', 'R', 'C']) assert.ok(fields.stack.includes(skill), skill);
  assert.equal(fields.stack.filter(skill => skill === 'TypeScript').length, 1);
  assert.ok(!fields.stack.includes('React'), 'React Native alone does not claim React for web');
});

test('extended competencies in project descriptions and explicit stacks import without losing noncatalog tools', () => {
  const fields = parseResumeText(`Pet projects
Project name: Cloud tracker
Description: Built an application with Next.js and LangChain.
Stack: nextjs, Docker, Yandex Cloud, Custom SDK, Custom SDK
Interests
Робототехника`);
  assert.deepEqual(fields.petProjects[0].stack, ['Next.js', 'Docker', 'LangChain', 'Yandex Cloud', 'Custom SDK']);
  assert.deepEqual(fields.interests, ['Робототехника']);
  assert.equal(fields.workHistory, undefined);
  assert.equal(fields.careerAchievements, undefined);
});

test('ordinary words and role descriptions do not invent ambiguous programming competencies', () => {
  const fields = parseResumeText('О себе\nCan work with people. Go to meetings. Less time on calls. Spring internship.\nОпыт работы\nR and C Company');
  assert.equal(fields.stack, undefined);
});

test('legacy mixed work history migrates projects into their independent editable section once', () => {
  const oldHistory = 'Example Company\n2024 - 2025\nСоздал сервис.\n\nPet-проекты\nНазвание: Task Board\n\nОписание: Доска задач.\nСтек: TS, React.js, Custom SDK\nНазвание: Bot\nОписание: Бот уведомлений.';
  const migrated = resumeSections({ workHistory: oldHistory });
  assert.equal(workHistoryText(migrated.workExperiences), 'Example Company\n2024 - 2025\nСоздал сервис.');
  assert.deepEqual(migrated.petProjects, [{ name: 'Task Board', description: 'Доска задач.', stack: ['TypeScript', 'React', 'Custom SDK'] }, { name: 'Bot', description: 'Бот уведомлений.', stack: [] }]);
  assert.deepEqual(resumeSections({ ...migrated, workHistory: oldHistory }), migrated);
  assert.deepEqual(resumeSections({ workHistory: oldHistory, petProjects: [] }).petProjects, [], 'removing projects explicitly must not restore them');
});

test('structured project normalization deduplicates equivalent aliases and keeps specific custom skill names', () => {
  const migrated = resumeSections({ petProjects: [{ name: 'Проект', description: '', stack: ['TS', 'typescript', 'React Native', 'MongoDB Atlas', 'Custom SDK'] }] });
  assert.deepEqual(migrated.petProjects[0].stack, ['TypeScript', 'React Native', 'MongoDB Atlas', 'Custom SDK']);
});

test('inline project headings become separate names and descriptions instead of one merged paragraph', () => {
  const fields = parseResumeText(`Pet projects
• Task Board — Канбан для команды на TypeScript.
Stack: React, TS
2. Reminder Bot — Бот уведомлений на Python.
Stack: Python, Custom SDK`);
  assert.deepEqual(fields.petProjects, [
    { name: 'Task Board', description: 'Канбан для команды на TypeScript.', stack: ['React', 'TypeScript'] },
    { name: 'Reminder Bot', description: 'Бот уведомлений на Python.', stack: ['Python', 'Custom SDK'] },
  ]);
});

test('explicit employer and period labels fill their own fields without becoming task text', () => {
  const fields = parseResumeText(`Опыт работы
Компания: Example Engineer Group
Период: Январь 2023 - Декабрь 2023
Задачи: Создал сервис.
Employer: Next Company
Period: January 2024 - June 2024
Responsibilities: Built another service.`, { asOf: fixedAsOf });
  assert.deepEqual(fields.workExperiences, [
    { period: 'Январь 2023 - Декабрь 2023', company: 'Example Engineer Group', tasks: 'Создал сервис.' },
    { period: 'January 2024 - June 2024', company: 'Next Company', tasks: 'Built another service.' },
  ]);
});

test('long legacy project descriptions remain editable until the user corrects their field budget', () => {
  const description = 'Описание проекта. '.repeat(300);
  const draft = resumeSections({ workHistory: `Pet-проекты\nНазвание: Example\nОписание: ${description}` });
  assert.equal(draft.workExperiences.length, 0);
  assert.equal(draft.petProjects[0].description, description.trim());
  assert.ok(draft.petProjects[0].description.length > 4000);
  const normalized = resumeSections({ petProjects: draft.petProjects });
  assert.equal(normalized.petProjects[0].description.length, 4000, 'explicit structured input still uses the agreed limit');
});

test('only a leading explicit task label is removed while nested text and unknown metadata survive', () => {
  const fields = parseResumeText(`Опыт работы
Компания: Example
Период: Январь 2024 - Июнь 2024
Задачи: Разработал интерфейсы каталога.
План: Tasks: improve performance.
Проводил анализ Responsibilities: escalation.`, { asOf: fixedAsOf });
  assert.equal(fields.workExperiences[0].tasks, 'Разработал интерфейсы каталога.\nПлан: Tasks: improve performance.\nПроводил анализ Responsibilities: escalation.');
  assert.match(fields.workHistory, /Задачи: Разработал интерфейсы/);
});

test('unchanged maximum-budget legacy history round-trips without generated separators or clipped source characters', () => {
  const suffix = 'Последние исходные символы: XYZ';
  const history = 'А'.repeat(20_000 - suffix.length) + suffix;
  assert.equal(history.length, 20_000);
  const draft = resumeSections({ workHistory: history });
  assert.equal(isLegacyWorkMigration(draft.workExperiences, history), true);
  assert.equal(workHistoryText(draft.workExperiences, history), history);
  const restored = resumeSections({ workHistory: history, workExperiences: draft.workExperiences });
  assert.deepEqual(restored.workExperiences, draft.workExperiences, 'reading an already migrated draft cannot cut its last separators budget');
  assert.equal(workHistoryText(restored.workExperiences, history), history);
  const reordered = restored.workExperiences.map(({ company, tasks, period }) => ({ company, tasks, period }));
  assert.equal(isLegacyWorkMigration(reordered, history), true, 'JSON property order must not change recognition');
  const edited = draft.workExperiences.map((entry, index) => ({ ...entry, tasks: index === 0 ? 'Б' + entry.tasks.slice(1) : entry.tasks }));
  assert.equal(isLegacyWorkMigration(edited, history), false);
  assert.notEqual(workHistoryText(edited, history), history);
  assert.ok(workHistoryText(resumeSections({ workExperiences: edited }).workExperiences).length <= 20_000, 'edited data follows the existing structured budget');
});

test('OCR visual Pet-heading aliases separate complete projects from employment in a real recognized resume', () => {
  for (const heading of ['Рет-проекты', 'Peт-проекты', 'Рeт-проекты', 'Реt-проекты', 'Pет-проекты', 'Рet-проекты', 'pеt-проекты:', 'Рет — проекты']) {
    const fields = parseResumeText(`Опыт работы
Компания: Example Studio
Период: Январь 2024 — Декабрь 2025
Задачи: Разработал интерфейсы каталога
${heading}
Название: Планировщик
Описание: Приложение для планирования встреч
Стек: React, TypeScript
Достижения
• Победитель хакатона 2025
Интересы
• Алгоритмы`, { asOf: fixedAsOf });
    assert.deepEqual(fields.workExperiences, [{ period: 'Январь 2024 — Декабрь 2025', company: 'Example Studio', tasks: 'Разработал интерфейсы каталога' }], heading);
    assert.deepEqual(fields.petProjects, [{ name: 'Планировщик', description: 'Приложение для планирования встреч', stack: ['React', 'TypeScript'] }], heading);
    assert.deepEqual(fields.achievementItems, ['Победитель хакатона 2025']);
    assert.deepEqual(fields.interests, ['Алгоритмы']);
    assert.doesNotMatch(fields.workHistory, /Планировщик|Приложение|React|TypeScript|проекты/iu);
  }
});

test('legacy work migration recognizes the same standalone OCR Pet-heading aliases', () => {
  const work = 'Работа в Example Studio\nРазработал интерфейсы каталога';
  for (const heading of ['Рет-проекты', 'Peт-проекты', 'Рeт-проекты', 'Реt-проекты:']) {
    const source = `${work}\n${heading}\nНазвание: Планировщик\nОписание: Приложение для планирования встреч\nСтек: React, TypeScript`;
    const fields = resumeSections({ workHistory: source });
    assert.deepEqual(fields.workExperiences, [{ period: '', company: '', tasks: work }], heading);
    assert.deepEqual(fields.petProjects, [{ name: 'Планировщик', description: 'Приложение для планирования встреч', stack: ['React', 'TypeScript'] }], heading);
    assert.equal(workHistoryText(fields.workExperiences, source), work);
  }
});

test('OCR Pet-heading tolerance leaves prose and inline descriptions inside their original employment section', () => {
  for (const prose of ['Разрабатывал Рет-проекты в учебной команде', 'Рет-проекты помогают изучать технологии', 'Рет-проекты: разработал несколько приложений']) {
    const source = `Компания: Example Studio\nПериод: Январь 2024 — Декабрь 2025\nЗадачи: Разработал интерфейсы каталога\n${prose}`;
    const fields = parseResumeText(`Опыт работы\n${source}`, { asOf: fixedAsOf });
    assert.equal(fields.petProjects, undefined, prose);
    assert.equal(fields.workExperiences[0].tasks, `Разработал интерфейсы каталога\n${prose}`, prose);
    const migrated = resumeSections({ workHistory: source });
    assert.deepEqual(migrated.petProjects, [], prose);
    assert.equal(migrated.workExperiences[0].tasks, source, prose);
  }
});
