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

test('BA and PM roles do not become a programming specialization from their stack', () => {
  for (const role of ['Бизнес-аналитик / Аналитик данных', 'AI Product Manager / Product Manager', 'ML Engineer']) {
    const fields = parseResumeText(`Иван Соколов\n${role}\nСтек: Python, React, SQL\nОпыт работы: 5 лет`);
    assert.equal(fields.professionalRole, role);
    assert.equal(fields.specialization, undefined);
    assert.equal(fields.desiredGrade, undefined);
    assert.equal(fields.industry, undefined);
    assert.equal(fields.softSkills, undefined);
  }
});

test('fullstack and Senior are never silently reduced to a supported test category', () => {
  const fullstack = parseResumeText('Иван Соколов\nFullstack Frontend Backend developer Senior\nSkills: React, Python');
  assert.equal(fullstack.specialization, undefined);
  assert.equal(fullstack.desiredGrade, undefined);
  const senior = parseResumeText('Иван Соколов\nBackend developer Middle\nGrade: Senior\nSpecialization: ML');
  assert.equal(senior.specialization, undefined);
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
