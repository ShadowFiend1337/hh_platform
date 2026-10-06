import assert from 'node:assert/strict';
import test from 'node:test';
import { parseResumeText } from '../src/resume-parser.ts';
import { MAX_STACK_SKILLS, resumeTextLimits } from '../../shared/resume-limits.ts';

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

test('Fullstack has its own direction and Senior is never silently reduced to Middle', () => {
  const fullstack = parseResumeText('Иван Соколов\nFullstack Frontend Backend developer Senior\nSkills: React, Python');
  assert.equal(fullstack.specialization, 'Fullstack');
  assert.equal(fullstack.desiredGrade, undefined);
  const senior = parseResumeText('Иван Соколов\nBackend developer Middle\nGrade: Senior\nSpecialization: ML');
  assert.equal(senior.specialization, 'ML');
  assert.equal(senior.desiredGrade, undefined);
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
  assert.equal(fields.desiredGrade, undefined);
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

test('a job duration or company name alone is not presented as total experience', () => {
  const fields = parseResumeText(`Иван Соколов
Опыт работы
Тестовая компания
03.2021 - 09.2022
1 год 7 месяцев
Ещё одна компания
2020 - 2021
8 месяцев`);
  assert.equal(fields.experience, undefined);
  assert.match(fields.workHistory, /Ещё одна компания/);
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
