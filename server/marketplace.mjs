import { randomUUID } from 'node:crypto';
import { isSpecialization } from '../shared/catalog.ts';
import { isGrade } from '../shared/grading.ts';
import { MAX_STACK_SKILLS } from '../shared/resume-limits.ts';
import { RequestError } from './assessment.mjs';
import { publicCandidate } from './directory-store.mjs';
import { accountsShareRealm, isLocalFixtureAccount } from './local-fixtures.mjs';

const fail = message => { throw new RequestError(400, message); };
const ownCandidateId = 'candidate-anna';
const formats = ['', 'Удалённо', 'Гибрид', 'Офис'];
const vacancyFields = ['title', 'description', 'specialization', 'grade', 'stack', 'city', 'format', 'salaryFrom', 'salaryTo'];
function object(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) fail('Некорректные поля запроса.');
  return value;
}
function text(value, maximum, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > maximum || required && !value.trim()) fail('Заполните поля и проверьте длину текста.');
  return value.trim();
}
function id(value) { return text(value, 100, true); }
function validateVacancy(input) {
  const value = object(input, vacancyFields);
  const result = { title: text(value.title, 200, true), description: text(value.description, 4000, true),
    specialization: text(value.specialization, 30, true), grade: text(value.grade, 30, true),
    city: text(value.city, 100), format: text(value.format, 100), salaryFrom: value.salaryFrom, salaryTo: value.salaryTo };
  if (!isSpecialization(result.specialization) || !isGrade(result.grade) || !formats.includes(result.format)) fail('Проверьте специализацию, грейд и формат работы.');
  if (![result.salaryFrom, result.salaryTo].every(number => Number.isSafeInteger(number) && number > 0 && number <= 10000000)
    || result.salaryFrom > result.salaryTo) fail('Укажите корректный зарплатный диапазон в рублях.');
  if (value.stack !== undefined && (!Array.isArray(value.stack) || value.stack.length > MAX_STACK_SKILLS)) fail('Проверьте список навыков вакансии.');
  result.stack = [...new Set((value.stack || []).map(skill => text(skill, 80, true)))];
  return result;
}

export function syncMarketplaceCompany(store, owner, company, publicId) {
  const companyId = `company-${publicId.slice(5)}`;
  store.db.prepare(`INSERT INTO marketplace_companies VALUES(?,?,?,?,?,?,?,0)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,industry=excluded.industry,website=excluded.website,
      contact=excluded.contact,description=excluded.description`)
    .run(companyId, owner, company.name, company.industry, company.website, company.contact, company.description);
  return companyId;
}

const demoCompanies = [
  { id: 'demo-company-contour', name: 'Контурная лаборатория', industry: 'Электроника', description: 'Вымышленная команда разработки измерительных устройств.',
    roles: [
      ['Инженер встраиваемых систем', 'Embedded', 'Middle', ['C', 'C++', 'STM32'], 150000, 200000, 'Разрабатывать прошивки датчиков, проверять электронные платы и отлаживать интерфейсы устройств.'],
      ['Разработчик электроники', 'Embedded', 'Senior', ['C++', 'Linux', 'UART'], 180000, 240000, 'Проектировать взаимодействие аппаратной части и ПО, проверять прототипы измерительных модулей.'],
    ] },
  { id: 'demo-company-vector', name: 'Вектор продуктов', industry: 'ИТ', description: 'Вымышленная продуктовая студия веб-сервисов.',
    roles: [
      ['Frontend-разработчик', 'Frontend', 'Junior', ['React', 'TypeScript', 'CSS'], 80000, 120000, 'Разрабатывать доступные формы и страницы кабинета, работать с компонентами дизайн-системы.'],
      ['Backend-разработчик', 'Backend', 'Middle', ['Python', 'FastAPI', 'PostgreSQL'], 150000, 220000, 'Разрабатывать API заказов, интеграции и безопасную обработку повторных запросов.'],
      ['Fullstack-разработчик', 'Fullstack', 'Middle', ['React', 'Node.js', 'PostgreSQL'], 140000, 210000, 'Разрабатывать клиент и сервер платформы бронирования, проверять конкурентные изменения.'],
    ] },
  { id: 'demo-company-orbit', name: 'Орбита данных', industry: 'ИТ', description: 'Вымышленная команда аналитики и машинного обучения.',
    roles: [
      ['Аналитик данных', 'DataAnalysis', 'Middle', ['Python', 'SQL', 'Pandas'], 130000, 190000, 'Проверять качество данных, строить отчёты и объяснять результаты продуктовой команде.'],
      ['Инженер машинного обучения', 'ML', 'Middle', ['Python', 'PyTorch', 'SQL'], 170000, 240000, 'Обучать и проверять модели классификации, готовить воспроизводимые эксперименты.'],
      ['Инженер данных', 'DataEngineering', 'Senior', ['Python', 'SQL', 'Airflow'], 190000, 270000, 'Разрабатывать потоки загрузки данных, контролировать схемы и восстановление конвейеров.'],
    ] },
  { id: 'demo-company-light', name: 'Светлая мастерская', industry: 'ИТ', description: 'Вымышленная мастерская мобильных интерфейсов.',
    roles: [
      ['Мобильный разработчик', 'Mobile', 'Middle', ['Kotlin', 'Android', 'SQL'], 140000, 200000, 'Разрабатывать мобильные формы для работы без сети и безопасной синхронизации данных.'],
      ['Дизайнер интерфейсов', 'UXUI', 'Junior', ['Figma', 'Прототипирование'], 70000, 110000, 'Проектировать интерфейсы, проверять пользовательские сценарии и готовить компоненты.'],
      ['Инженер тестирования', 'QA', 'Junior', ['Playwright', 'SQL', 'Postman'], 80000, 130000, 'Проверять формы, API и сквозные сценарии, воспроизводить дефекты и автоматизировать проверки.'],
    ] },
  { id: 'demo-company-harbor', name: 'Тихая гавань', industry: 'ИТ', description: 'Вымышленная инфраструктурная команда.',
    roles: [
      ['DevOps-инженер', 'DevOps', 'Middle', ['Docker', 'Linux', 'Kubernetes'], 160000, 230000, 'Поддерживать среды запуска, наблюдаемость и безопасные обновления сервисов.'],
      ['Специалист информационной безопасности', 'Security', 'Middle', ['Linux', 'Python', 'OWASP'], 150000, 220000, 'Проверять права доступа и защищать веб-приложения, исследовать ошибки конфигурации.'],
      ['Системный аналитик', 'BusinessAnalysis', 'Middle', ['SQL', 'UML', 'BPMN'], 140000, 200000, 'Согласовывать API и требования, описывать поведение интеграций и данные систем.'],
      ['Менеджер продукта', 'ProductManagement', 'Middle', ['Аналитика', 'Приоритизация'], 130000, 200000, 'Проверять продуктовые гипотезы, планировать развитие сервиса и согласовывать задачи команды.'],
    ] },
  { id: 'demo-company-north', name: 'Северный код', industry: 'Финансы', description: 'Вымышленная команда платёжных сервисов банка.',
    roles: [
      ['Backend-разработчик платежей', 'Backend', 'Senior', ['Java', 'Spring', 'PostgreSQL', 'Kafka'], 260000, 340000, 'Проектировать сервисы переводов, идемпотентную обработку платежей и восстановление после сбоев.'],
      ['Backend-разработчик', 'Backend', 'Junior', ['Python', 'Django', 'PostgreSQL'], 90000, 130000, 'Разрабатывать внутренние API отчётности, писать тесты и разбирать обращения поддержки.'],
      ['Аналитик данных рисков', 'DataAnalysis', 'Senior', ['SQL', 'Python', 'Statistics'], 220000, 290000, 'Строить модели скоринга и отчёты о мошенничестве, проверять качество данных.'],
    ] },
  { id: 'demo-company-pulse', name: 'Пульс медицины', industry: 'Здравоохранение', description: 'Вымышленная команда сервиса записи к врачу.',
    roles: [
      ['Frontend-разработчик', 'Frontend', 'Middle', ['React', 'TypeScript', 'Next.js'], 170000, 230000, 'Разрабатывать личный кабинет пациента, доступные формы и быстрые страницы расписания.'],
      ['Мобильный разработчик iOS', 'Mobile', 'Senior', ['Swift', 'iOS', 'REST'], 230000, 300000, 'Развивать мобильное приложение записи и уведомлений, отвечать за качество релизов.'],
      ['Инженер тестирования', 'QA', 'Middle', ['Playwright', 'API', 'SQL'], 130000, 180000, 'Автоматизировать проверку записи к врачу и интеграций с клиниками.'],
    ] },
  { id: 'demo-company-sail', name: 'Парус логистики', industry: 'Транспорт и логистика', description: 'Вымышленная команда системы доставки.',
    roles: [
      ['Fullstack-разработчик', 'Fullstack', 'Senior', ['TypeScript', 'Node.js', 'React', 'PostgreSQL'], 240000, 310000, 'Разрабатывать диспетчерскую панель и API маршрутов, отвечать за архитектуру модулей.'],
      ['Инженер данных', 'DataEngineering', 'Middle', ['Python', 'Airflow', 'ClickHouse'], 170000, 230000, 'Собирать потоки данных о доставках, контролировать задержки и качество загрузки.'],
      ['DevOps-инженер', 'DevOps', 'Junior', ['Linux', 'Docker', 'CI/CD'], 100000, 140000, 'Поддерживать сборку и развёртывание сервисов, настраивать мониторинг.'],
    ] },
  { id: 'demo-company-lens', name: 'Линза ритейла', industry: 'Ритейл', description: 'Вымышленная команда рекомендаций интернет-магазина.',
    roles: [
      ['ML-инженер рекомендаций', 'ML', 'Senior', ['Python', 'PyTorch', 'Spark'], 280000, 360000, 'Разрабатывать модели рекомендаций, проводить A/B-эксперименты и выводить модели в продакшен.'],
      ['Аналитик данных', 'DataAnalysis', 'Junior', ['SQL', 'Excel', 'Power BI'], 80000, 110000, 'Готовить отчёты о продажах и проверять гипотезы ассортимента.'],
      ['Менеджер продукта', 'ProductManagement', 'Senior', ['Аналитика', 'A/B-тесты', 'Roadmap'], 250000, 320000, 'Отвечать за развитие каталога и поиска, приоритизировать гипотезы по метрикам.'],
    ] },
  { id: 'demo-company-shield', name: 'Щит безопасности', industry: 'Телекоммуникации', description: 'Вымышленная команда защиты сети оператора.',
    roles: [
      ['Аналитик SOC', 'Security', 'Junior', ['SIEM', 'Linux', 'Сети'], 90000, 130000, 'Разбирать события безопасности, эскалировать инциденты и вести журнал расследований.'],
      ['Пентестер', 'Security', 'Senior', ['OWASP', 'Burp Suite', 'Python'], 250000, 330000, 'Проводить тестирование на проникновение веб-сервисов и готовить отчёты для разработки.'],
      ['SRE-инженер', 'DevOps', 'Senior', ['Kubernetes', 'Prometheus', 'Terraform'], 270000, 340000, 'Отвечать за доступность сервисов оператора, SLO и автоматизацию инфраструктуры.'],
    ] },
  { id: 'demo-company-craft', name: 'Цифровая мастерская', industry: 'Образование', description: 'Вымышленная команда образовательной платформы.',
    roles: [
      ['Frontend-разработчик', 'Frontend', 'Senior', ['React', 'TypeScript', 'Доступность'], 240000, 300000, 'Отвечать за архитектуру клиентской части и доступность учебных курсов.'],
      ['UX/UI-дизайнер', 'UXUI', 'Middle', ['Figma', 'Исследования', 'Дизайн-система'], 140000, 190000, 'Проектировать сценарии обучения, проводить интервью и развивать дизайн-систему.'],
      ['Стажёр-разработчик', 'Backend', 'Intern', ['Python', 'SQL', 'Git'], 50000, 70000, 'Писать небольшие сервисы под руководством наставника и разбирать код-ревью.'],
    ] },
  { id: 'demo-company-forge', name: 'Кузница устройств', industry: 'Промышленность', description: 'Вымышленная команда промышленной автоматизации.',
    roles: [
      ['Embedded-разработчик', 'Embedded', 'Junior', ['C', 'STM32', 'RTOS'], 90000, 130000, 'Писать прошивки контроллеров датчиков и проверять их на стенде.'],
      ['Ведущий инженер встраиваемых систем', 'Embedded', 'Lead', ['C++', 'Linux', 'CAN'], 300000, 380000, 'Руководить командой прошивок, выбирать архитектуру и отвечать за сертификацию.'],
      ['Системный аналитик', 'BusinessAnalysis', 'Senior', ['UML', 'BPMN', 'SQL'], 200000, 260000, 'Описывать требования к системам управления производством и интеграциям.'],
    ] },
  { id: 'demo-company-wave', name: 'Волна медиа', industry: 'Медиа и развлечения', description: 'Вымышленная команда стримингового сервиса.',
    roles: [
      ['Android-разработчик', 'Mobile', 'Junior', ['Kotlin', 'Android', 'Jetpack Compose'], 100000, 140000, 'Разрабатывать экраны плеера и каталога, исправлять дефекты и писать тесты.'],
      ['Backend-разработчик', 'Backend', 'Middle', ['Go', 'PostgreSQL', 'Redis'], 190000, 250000, 'Разрабатывать API каталога и рекомендаций, оптимизировать задержки ответа.'],
      ['Тимлид frontend', 'Frontend', 'Lead', ['React', 'TypeScript', 'Архитектура'], 330000, 400000, 'Руководить командой веб-клиента, планировать архитектуру и развивать инженеров.'],
    ] },
  { id: 'demo-company-grid', name: 'Сетка энергии', industry: 'Энергетика', description: 'Вымышленная команда аналитики энергосетей.',
    roles: [
      ['Инженер машинного обучения', 'ML', 'Junior', ['Python', 'scikit-learn', 'SQL'], 110000, 150000, 'Готовить признаки и модели прогноза нагрузки под руководством старших коллег.'],
      ['Руководитель направления данных', 'DataEngineering', 'Lead', ['Spark', 'Kafka', 'Архитектура данных'], 320000, 400000, 'Отвечать за платформу данных, планировать развитие и управлять командой.'],
      ['QA-инженер', 'QA', 'Senior', ['Автоматизация', 'Java', 'Нагрузочное тестирование'], 200000, 260000, 'Строить стратегию тестирования и нагрузочные проверки телеметрии.'],
    ] },
  { id: 'demo-company-atlas', name: 'Атлас консалтинга', industry: 'Консалтинг', description: 'Вымышленная команда внедрения корпоративных систем.',
    roles: [
      ['Бизнес-аналитик', 'BusinessAnalysis', 'Junior', ['BPMN', 'Требования', 'SQL'], 80000, 120000, 'Собирать требования клиентов, описывать процессы и помогать с тестированием внедрений.'],
      ['Продуктовый менеджер', 'ProductManagement', 'Junior', ['Исследования', 'Jira', 'Метрики'], 100000, 140000, 'Вести бэклог небольшого продукта, собирать обратную связь и готовить релизы.'],
      ['Fullstack-разработчик', 'Fullstack', 'Junior', ['JavaScript', 'Node.js', 'React'], 90000, 130000, 'Дорабатывать внутренние порталы клиентов и интеграции.'],
    ] },
  { id: 'demo-company-sprint', name: 'Спринт спорт', industry: 'Спорт', description: 'Вымышленная команда платформы спортивных соревнований.',
    roles: [
      ['Backend-разработчик', 'Backend', 'Lead', ['Python', 'Архитектура', 'PostgreSQL'], 320000, 400000, 'Руководить бэкенд-командой платформы соревнований, отвечать за надёжность турниров.'],
      ['UX/UI-дизайнер', 'UXUI', 'Senior', ['Figma', 'Прототипирование', 'Исследования'], 200000, 260000, 'Отвечать за пользовательский опыт регистрации на соревнования и личного кабинета.'],
      ['Стажёр-аналитик данных', 'DataAnalysis', 'Intern', ['SQL', 'Python'], 45000, 65000, 'Готовить выгрузки результатов соревнований и простые отчёты.'],
    ] },
];
const demoCompanyIds = new Set(demoCompanies.map(company => company.id));

export class MarketplaceService {
  constructor(store, { now = () => Date.now(), seeds = true, accountForOwner } = {}) {
    this.store = store; this.now = now;
    this.accountForOwner = accountForOwner;
    store.db.function('marketplace_lower', { deterministic: true }, value => String(value || '').normalize('NFKC').toLocaleLowerCase('ru'));
    this.store.transaction(() => {
      for (const account of store.db.prepare('SELECT owner,company,public_id FROM platform_accounts').all()) {
        if (!accountForOwner || accountForOwner(account.owner)?.role === 'employer') {
          syncMarketplaceCompany(store, account.owner, JSON.parse(account.company), account.public_id);
        }
      }
      if (seeds) this.seed();
    });
  }
  companyAccessible(owner, company) {
    if (!this.accountForOwner) return true;
    // Built-in demo companies have no owner: every signed-in user may browse them and apply.
    if (company.owner == null) return Boolean(company.synthetic) && demoCompanyIds.has(company.company_id ?? company.id) && Boolean(this.accountForOwner(owner));
    const account = this.accountForOwner(owner), target = this.accountForOwner(company.owner);
    return target?.role === 'employer' && accountsShareRealm(account, target)
      && (!company.synthetic || isLocalFixtureAccount(target));
  }
  authorize(owner, role) {
    if (!this.accountForOwner) return;
    const account = this.accountForOwner(owner);
    if (!account) throw new RequestError(401, 'Войдите в аккаунт.');
    if (role && account.role !== role) throw new RequestError(403, 'Действие для этой роли недоступно.');
  }
  employer(owner) {
    if (!this.accountForOwner) return;
    const account = this.accountForOwner(owner);
    if (!account) throw new RequestError(401, 'Войдите в аккаунт работодателя.');
    if (account.role !== 'employer') throw new RequestError(403, 'Действие доступно работодателю.');
  }
  seed() {
    const created = '2026-10-01T09:00:00.000Z';
    for (const company of demoCompanies) {
      this.store.db.prepare('INSERT OR IGNORE INTO marketplace_companies VALUES(?,NULL,?,?,?,?,?,1)')
        .run(company.id, company.name, company.industry, 'https://example.com', 'demo@example.com', company.description);
      company.roles.forEach(([title, specialization, grade, stack, salaryFrom, salaryTo, description], index) => {
        const vacancyId = `${company.id}-vacancy-${index + 1}`;
        if (this.store.db.prepare('SELECT 1 FROM marketplace_vacancies WHERE id=?').get(vacancyId)) {
          this.store.db.prepare('UPDATE marketplace_vacancies SET specialization=? WHERE id=?').run(specialization, vacancyId);
          return;
        }
        this.store.db.prepare('INSERT INTO marketplace_vacancies VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(vacancyId, company.id, title, description, specialization, grade, index % 2 ? 'Санкт-Петербург' : 'Москва',
            index % 2 ? 'Гибрид' : 'Удалённо', salaryFrom, salaryTo, 'open', created, created);
        stack.forEach((skill, position) => this.store.db.prepare('INSERT INTO marketplace_vacancy_skills VALUES(?,?,?)').run(vacancyId, position, skill));
      });
    }
  }
  account(owner, { required = true } = {}) {
    this.authorize(owner);
    if (typeof owner !== 'string' || !owner || owner.length > 200) throw new RequestError(401, 'Сессия недоступна.');
    const account = this.store.db.prepare('SELECT * FROM platform_accounts WHERE owner=?').get(owner);
    if (!account && required) throw new RequestError(409, 'Сначала сохраните профиль или данные компании.');
    return account;
  }
  row(vacancyId) {
    return this.store.db.prepare(`SELECT v.*,c.owner,c.name AS company_name,c.synthetic FROM marketplace_vacancies v
      JOIN marketplace_companies c ON c.id=v.company_id WHERE v.id=?`).get(id(vacancyId));
  }
  vacancyDTO(row) {
    return { id: row.id, companyId: row.company_id, company: row.company_name, title: row.title, description: row.description,
      specialization: row.specialization, grade: row.grade, city: row.city, format: row.format,
      stack: this.store.db.prepare('SELECT skill FROM marketplace_vacancy_skills WHERE vacancy_id=? ORDER BY position').all(row.id).map(item => item.skill),
      salaryFrom: row.salary_from, salaryTo: row.salary_to, currency: 'RUB', status: row.status, date: row.created_at,
      synthetic: Boolean(row.synthetic) || isLocalFixtureAccount(this.accountForOwner?.(row.owner)) };
  }
  companyDTO(row, owner) {
    const description = row.synthetic && row.owner === null
      ? row.description.replace(/^Вымышленная (.)/u, (_match, first) => first.toLocaleUpperCase('ru')) : row.description;
    return { id: row.id, name: row.name, industry: row.industry, website: row.website, contact: row.contact,
      description, synthetic: Boolean(row.synthetic) || isLocalFixtureAccount(this.accountForOwner?.(row.owner)),
      vacancies: this.vacancies(owner, { companyId: row.id }).items };
  }
  companies({ offset = 0, limit = 12, q = '', owner } = {}) {
    this.authorize(owner);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail('Проверьте параметры страницы компаний.');
    const query = text(q, 400).normalize('NFKC').toLocaleLowerCase('ru');
    const args = [];
    let condition = "EXISTS(SELECT 1 FROM marketplace_vacancies v WHERE v.company_id=c.id AND v.status='open')";
    if (query) {
      condition += ` AND (instr(marketplace_lower(c.name||' '||c.industry||' '||c.description),?)>0 OR EXISTS(
        SELECT 1 FROM marketplace_vacancies v WHERE v.company_id=c.id AND v.status='open' AND (
          instr(marketplace_lower(v.title||' '||v.description||' '||v.city),?)>0 OR EXISTS(
            SELECT 1 FROM marketplace_vacancy_skills s WHERE s.vacancy_id=v.id AND instr(marketplace_lower(s.skill),?)>0))))`;
      args.push(query, query, query);
    }
    const rows = this.store.db.prepare(`SELECT c.* FROM marketplace_companies c WHERE ${condition}
      ORDER BY c.synthetic,c.name,c.id`).all(...args).filter(row => this.companyAccessible(owner, row));
    const page = rows.slice(offset, offset + limit), total = rows.length;
    return { items: page.map(row => this.companyDTO(row, owner)), total, offset, limit,
      nextOffset: offset + page.length < total ? offset + page.length : null };
  }
  company(companyId, owner) {
    this.authorize(owner);
    const row = this.store.db.prepare('SELECT * FROM marketplace_companies WHERE id=?').get(id(companyId));
    if (!row || !this.companyAccessible(owner, row)) throw new RequestError(404, 'Компания не найдена.');
    return this.companyDTO(row, owner);
  }
  vacancies(owner, { own = false, companyId = null } = {}) {
    this.authorize(owner, own ? 'employer' : undefined);
    if (own) this.account(owner, { required: false });
    const condition = own ? 'c.owner=?' : "v.status='open'";
    const args = own ? [owner] : [];
    let extra = '';
    if (companyId) { extra = ' AND v.company_id=?'; args.push(id(companyId)); }
    const rows = this.store.db.prepare(`SELECT v.*,c.owner,c.name AS company_name,c.synthetic FROM marketplace_vacancies v
      JOIN marketplace_companies c ON c.id=v.company_id WHERE ${condition}${extra} ORDER BY v.created_at DESC,v.id LIMIT 1000`).all(...args);
    return { items: rows.filter(row => this.companyAccessible(owner, row)).map(row => this.vacancyDTO(row)) };
  }
  vacancy(owner, vacancyId) {
    this.authorize(owner);
    const row = this.row(vacancyId);
    if (!row || !this.companyAccessible(owner, row) || row.status !== 'open' && row.owner !== owner) throw new RequestError(404, 'Вакансия недоступна.');
    return this.vacancyDTO(row);
  }
  publish(owner, input) {
    this.employer(owner);
    const value = validateVacancy(input);
    return this.store.transaction(() => {
      const account = this.account(owner), company = JSON.parse(account.company);
      if (!company.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(company.contact)) fail('Заполните название компании и email для связи.');
      const companyId = syncMarketplaceCompany(this.store, owner, company, account.public_id);
      if (this.store.db.prepare('SELECT COUNT(*) AS n FROM marketplace_vacancies WHERE company_id=?').get(companyId).n >= 1000) fail('Допустимо до 1000 вакансий компании.');
      const vacancyId = `vacancy-${randomUUID()}`, date = new Date(this.now()).toISOString();
      this.store.db.prepare('INSERT INTO marketplace_vacancies VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(vacancyId, companyId, value.title, value.description, value.specialization, value.grade, value.city, value.format,
          value.salaryFrom, value.salaryTo, 'open', date, date);
      this.skills(vacancyId, value.stack);
      return this.vacancyDTO(this.row(vacancyId));
    });
  }
  skills(vacancyId, stack) {
    this.store.db.prepare('DELETE FROM marketplace_vacancy_skills WHERE vacancy_id=?').run(vacancyId);
    const insert = this.store.db.prepare('INSERT INTO marketplace_vacancy_skills VALUES(?,?,?)');
    stack.forEach((skill, position) => insert.run(vacancyId, position, skill));
  }
  edit(owner, vacancyId, input) {
    this.employer(owner);
    object(input, [...vacancyFields, 'status']);
    const close = Object.keys(input).length === 1 && input.status === 'closed';
    const value = close ? null : validateVacancy(input);
    return this.store.transaction(() => {
      this.account(owner);
      const row = this.row(vacancyId);
      if (!row || row.owner !== owner) throw new RequestError(404, 'Вакансия не найдена.');
      if (row.status !== 'open' && !close) throw new RequestError(409, 'Закрытую вакансию нельзя редактировать.');
      const date = new Date(this.now()).toISOString();
      if (close) this.store.db.prepare("UPDATE marketplace_vacancies SET status='closed',updated_at=? WHERE id=?").run(date, row.id);
      else {
        this.store.db.prepare(`UPDATE marketplace_vacancies SET title=?,description=?,specialization=?,grade=?,city=?,format=?,
          salary_from=?,salary_to=?,updated_at=? WHERE id=?`).run(value.title, value.description, value.specialization, value.grade,
          value.city, value.format, value.salaryFrom, value.salaryTo, date, row.id);
        this.skills(row.id, value.stack);
      }
      return this.vacancyDTO(this.row(row.id));
    });
  }
  applicationDTO(row, owner) {
    const account = this.store.db.prepare('SELECT profile FROM platform_accounts WHERE owner=?').get(row.candidate_owner);
    const person = account ? JSON.parse(account.profile) : null;
    const snapshot = JSON.parse(row.vacancy_snapshot), own = row.candidate_owner === owner;
    const company = this.store.db.prepare('SELECT owner FROM marketplace_companies WHERE id=?').get(row.company_id);
    const fixture = isLocalFixtureAccount(this.accountForOwner?.(company?.owner))
      || isLocalFixtureAccount(this.accountForOwner?.(row.candidate_owner));
    if (isLocalFixtureAccount(this.accountForOwner?.(row.candidate_owner)) && person) person.synthetic = true;
    if (fixture) snapshot.synthetic = true;
    return { id: row.id, vacancyId: row.vacancy_id, candidateId: own ? ownCandidateId : row.candidate_id,
      companyId: row.company_id, company: snapshot.company, vacancy: snapshot,
      candidate: person && (own || person.consent) ? publicCandidate(person, own ? ownCandidateId : row.candidate_id) : null,
      status: row.status, date: row.created_at, respondedAt: row.responded_at, message: row.message, synthetic: Boolean(snapshot.synthetic) };
  }
  apply(owner, vacancyId, input = {}) {
    this.authorize(owner, 'candidate');
    if (this.accountForOwner?.(owner)?.role === 'employer') throw new RequestError(403, 'Откликаться может только соискатель.');
    const value = object(input, ['message']), message = text(value.message, 2000);
    return this.store.transaction(() => {
      const account = this.account(owner), person = JSON.parse(account.profile);
      if (!person.consent || !person.name || !person.email) fail('Заполните имя, email и согласие в профиле перед откликом.');
      const vacancy = this.row(vacancyId);
      if (!vacancy || !this.companyAccessible(owner, vacancy)) throw new RequestError(404, 'Вакансия не найдена.');
      if (vacancy.owner === owner) throw new RequestError(403, 'Нельзя откликнуться на собственную вакансию.');
      if (vacancy.status !== 'open') throw new RequestError(409, 'Вакансия уже закрыта.');
      if (this.store.db.prepare('SELECT 1 FROM marketplace_applications WHERE vacancy_id=? AND candidate_owner=?').get(vacancy.id, owner)) throw new RequestError(409, 'Вы уже откликнулись на эту вакансию.');
      const applicationId = `application-${randomUUID()}`, date = new Date(this.now()).toISOString();
      this.store.db.prepare('INSERT INTO marketplace_applications VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(applicationId, vacancy.id, vacancy.company_id, owner, account.public_id, 'sent', date, null, message, JSON.stringify(this.vacancyDTO(vacancy)));
      if (vacancy.owner) this.store.db.prepare('UPDATE platform_accounts SET revision=revision+1,updated_at=? WHERE owner=?').run(date, vacancy.owner);
      return this.applicationDTO(this.store.db.prepare('SELECT * FROM marketplace_applications WHERE id=?').get(applicationId), owner);
    });
  }
  applications(owner, role) {
    this.authorize(owner, role);
    this.account(owner, { required: false });
    if (!['candidate', 'employer'].includes(role)) fail('Выберите роль для просмотра откликов.');
    const condition = role === 'candidate' ? 'a.candidate_owner=?' : 'c.owner=?';
    const rows = this.store.db.prepare(`SELECT a.*,c.owner AS company_owner,c.synthetic AS company_synthetic FROM marketplace_applications a JOIN marketplace_companies c ON c.id=a.company_id
      WHERE ${condition} ORDER BY a.created_at DESC,a.id LIMIT 1000`).all(owner);
    return { items: rows.filter(row => this.companyAccessible(owner, { owner: row.company_owner, synthetic: row.company_synthetic, company_id: row.company_id })
      && (!this.accountForOwner || role === 'candidate' && row.candidate_owner === owner
        || this.accountForOwner(row.candidate_owner)?.role === 'candidate'
          && accountsShareRealm(this.accountForOwner(owner), this.accountForOwner(row.candidate_owner))))
      .map(row => this.applicationDTO(row, owner)) };
  }
  respond(owner, applicationId, input) {
    this.employer(owner);
    const value = object(input, ['status']);
    if (!['accepted', 'rejected'].includes(value.status)) fail('Выберите принять или отклонить.');
    return this.store.transaction(() => {
      this.account(owner);
      const row = this.store.db.prepare(`SELECT a.*,c.owner FROM marketplace_applications a
        JOIN marketplace_companies c ON c.id=a.company_id WHERE a.id=?`).get(id(applicationId));
      if (!row || row.owner !== owner || this.accountForOwner && (this.accountForOwner(row.candidate_owner)?.role !== 'candidate'
        || !accountsShareRealm(this.accountForOwner(owner), this.accountForOwner(row.candidate_owner)))) throw new RequestError(404, 'Отклик не найден.');
      if (row.status !== 'sent' && row.status !== value.status) throw new RequestError(409, 'Ответ на отклик уже сохранён.');
      if (row.status === 'sent') {
        const date = new Date(this.now()).toISOString();
        this.store.db.prepare('UPDATE marketplace_applications SET status=?,responded_at=? WHERE id=?').run(value.status, date, row.id);
        this.store.db.prepare('UPDATE platform_accounts SET revision=revision+1,updated_at=? WHERE owner=?').run(date, row.candidate_owner);
      }
      return this.applicationDTO(this.store.db.prepare('SELECT * FROM marketplace_applications WHERE id=?').get(row.id), owner);
    });
  }
}
