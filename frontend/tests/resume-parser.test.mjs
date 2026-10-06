import assert from 'node:assert/strict';
import test from 'node:test';
import { parseResumeText } from '../src/resume-parser.ts';

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
