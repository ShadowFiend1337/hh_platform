import assert from 'node:assert/strict';
import test from 'node:test';
import { parseResumeText } from '../src/resume-parser.ts';
import { MAX_STACK_SKILLS, resumeTextLimits } from '../../shared/resume-limits.ts';

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
  assert.equal(fields.professionalRole, 'Software developer');
  assert.equal(fields.specialization, 'Backend');
  assert.equal(fields.desiredGrade, 'Junior');
  assert.equal(fields.experience, '8 months');
  assert.deepEqual(fields.stack, ['Python', 'FastAPI', 'SQL']);
});

test('BA, PM and ML retain their stated direction instead of inferring frontend from React', () => {
  for (const [role, specialization] of [['Бизнес-аналитик / Аналитик данных', undefined], ['AI Product Manager / Product Manager', 'ProductManagement'], ['ML Engineer', 'ML']]) {
    const fields = parseResumeText(`Иван Соколов\n${role}\nСтек: Python, React, SQL\nОпыт работы: 5 лет`);
    assert.equal(fields.professionalRole, role);
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
  assert.deepEqual(truncated, ['workHistory', 'careerAchievements']);

  const tooMany = Array.from({ length: MAX_STACK_SKILLS + 1 }, (_, index) => `Tool${index}`).join(', ');
  const skillTruncation = [];
  assert.equal(parseResumeText(`Навыки: ${tooMany}`, { onTruncate: field => skillTruncation.push(field) }).stack.length, MAX_STACK_SKILLS);
  assert.deepEqual(skillTruncation, ['stack']);
});
