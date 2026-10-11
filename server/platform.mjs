import { industryOptions, isSpecialization } from '../shared/catalog.ts';
import { isGrade } from '../shared/grading.ts';
import { MAX_STACK_SKILLS, MAX_SOFT_SKILLS, resumeTextLimits } from '../shared/resume-limits.ts';
import { resumeSections } from '../shared/resume-structure.ts';
import { validateResumeFields } from './resume-fields.mjs';
import { defaultSearchFilters, employmentTypes, languageOptions, normalizeSearchFilters } from '../shared/search.ts';
import { HIRING_NEED_LIMITS, MAX_HIRING_NEEDS } from '../shared/hiring-needs.ts';
import { publicCandidate, publicDirectoryCandidate } from './directory-store.mjs';
import { profilePublication } from './profile-publication.mjs';
import { isDemoCatalogProfile } from './demo-catalog.mjs';
import { confidentThreshold, nextGrade, RequestError, threshold } from './assessment.mjs';
import { syncMarketplaceCompany } from './marketplace.mjs';
import { accountsShareRealm, isLocalFixtureAccount } from './local-fixtures.mjs';
import { assessOfferRisk, blockedMessage, OFFER_RISK_POLICY } from './offer-risk.mjs';
import { randomBytes } from 'node:crypto';
import { PRIVACY_POLICY_VERSION } from '../shared/privacy.ts';

const ownCandidateId = 'candidate-anna';
const ownCompanyId = 'company-line';
const formats = ['', 'Удалённо', 'Гибрид', 'Офис'];
const statuses = ['sent', 'viewed', 'accepted', 'rejected'];
const allowedLanguages = new Set(languageOptions.map(item => item.value));
const fail = message => { throw new RequestError(400, message); };
const publicId = owner => `user-${owner.slice(0, 20)}`;
const companyId = owner => `company-${owner.slice(0, 20)}`;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
function object(value, description) {
  if (!isObject(value)) fail(`Некорректный объект: ${description}.`);
  return value;
}
function text(value, max, description, fallback = '') {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > max) fail(`${description}: допустимо до ${max} символов.`);
  return value.trim();
}
function list(value, max, description, fallback = []) {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.length > max) fail(`Некорректный список: ${description}.`);
  return value;
}
function strings(value, max, length, description) {
  return [...new Set(list(value, max, description).map(item => text(item, length, description)).filter(Boolean))];
}
function flag(value, description, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') fail(`Некорректное значение: ${description}.`);
  return value;
}
function integer(value, max, description, fallback = null) {
  if (value === undefined || value === null) return fallback;
  if (!Number.isSafeInteger(value) || value < 0 || value > max) fail(`Некорректное число: ${description}.`);
  return value;
}
function date(value, description, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const result = text(value, 40, description);
  if (!Number.isFinite(Date.parse(result))) fail(`Некорректная дата: ${description}.`);
  return result;
}
function choice(value, allowed, description, fallback = '') {
  const result = text(value, 100, description, fallback);
  if (!allowed.includes(result)) fail(`Некорректное значение: ${description}.`);
  return result;
}
function category(value, validator, description, fallback) {
  const result = text(value, 30, description, fallback);
  if (!validator(result)) fail(`Некорректное значение: ${description}.`);
  return result;
}
function url(value, max, description) {
  const result = text(value, max, description);
  if (result && /^[a-z][a-z\d+.-]*:/iu.test(result) && !/^https?:\/\//iu.test(result)) fail(`Для ${description.toLocaleLowerCase('ru')} используйте HTTP или HTTPS.`);
  return result;
}
function ownerKey(owner) {
  if (typeof owner !== 'string' || !owner.length || owner.length > 200) throw new RequestError(401, 'Сессия недоступна.');
  return owner;
}

function confirmation(input) {
  if (input === null || input === undefined) return null;
  const value = object(input, 'результат теста');
  const result = {
    specialization: category(value.specialization, isSpecialization, 'Специализация теста'),
    grade: category(value.grade, isGrade, 'Грейд теста'),
    score: integer(value.score, 100, 'Баллы теста'), date: date(value.date, 'Дата теста'),
  };
  if (result.score === null || result.date === null) fail('Некорректный результат теста.');
  if (value.surveyId !== undefined) result.surveyId = text(value.surveyId, 100, 'Анкета теста');
  return result;
}

function experienceMonths(experience) {
  if (/^(?:без опыта|нет опыта)$/iu.test(experience)) return 0;
  if (!/^(?:\d+\s+(?:год|года|лет|месяц|месяца|месяцев)\s*)+$/iu.test(experience)) return null;
  const years = /(\d+)\s+(?:год|года|лет)(?![\p{L}])/iu.exec(experience);
  const months = /(\d+)\s+(?:месяц|месяца|месяцев)(?![\p{L}])/iu.exec(experience);
  const total = Number(years?.[1] || 0) * 12 + Number(months?.[1] || 0);
  return total <= 1200 ? total : null;
}

function profile(input, stored) {
  const value = object(input, 'профиль');
  const result = {
    id: ownCandidateId,
    name: text(value.name, resumeTextLimits.name, 'Имя'),
    email: text(value.email, resumeTextLimits.email, 'Email'), phone: text(value.phone, resumeTextLimits.phone, 'Телефон'),
    specialization: category(value.specialization, isSpecialization, 'Специализация', 'Frontend'),
    desiredGrade: category(value.desiredGrade, isGrade, 'Грейд', 'Junior'),
    confirmed: confirmation(value.confirmed),
    stack: strings(value.stack, MAX_STACK_SKILLS, 80, 'Стек'),
    industry: choice(value.industry, ['', ...industryOptions], 'Отрасль'),
    professionalRole: text(value.professionalRole, resumeTextLimits.professionalRole, 'Роль'),
    softSkills: strings(value.softSkills, MAX_SOFT_SKILLS, 80, 'Софт-скиллы'), surveyCompletedAt: date(value.surveyCompletedAt, 'Дата анкеты'),
    experience: text(value.experience, resumeTextLimits.experience, 'Стаж'),
    city: text(value.city, resumeTextLimits.city, 'Город'), format: choice(value.format, formats, 'Формат работы', 'Удалённо'),
    bio: text(value.bio, 4000, 'О себе'),
    education: text(value.education, resumeTextLimits.education, 'Образование'),
    ...validateResumeFields(value, fail),
    portfolio: url(value.portfolio, resumeTextLimits.portfolio, 'Портфолио'),
    languages: text(value.languages, resumeTextLimits.languages, 'Языки'),
    // A user may enter an external ID; only server-owned achievements count
    // as federation evidence. Changing the ID clears the previous evidence.
    fspId: value.fspId === undefined ? stored?.fspId || '' : text(value.fspId, 100, 'ID ФСП'),
    achievements: stored?.achievements || [], synthetic: false,
    visible: flag(value.visible, 'Видимость'), consent: flag(value.consent, 'Согласие'),
    salaryFrom: integer(value.salaryFrom, 10000000, 'Зарплата от'), salaryTo: integer(value.salaryTo, 10000000, 'Зарплата до'),
    employmentType: choice(value.employmentType, ['', ...employmentTypes], 'Занятость'),
    availableFrom: text(value.availableFrom, 10, 'Дата готовности'),
    languageCodes: strings(value.languageCodes, allowedLanguages.size, 10, 'Коды языков'),
  };
  if (result.fspId !== (stored?.fspId || '')) result.achievements = [];
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(result.email)) fail('Проверьте email.');
  if (result.salaryFrom !== null && result.salaryTo !== null && result.salaryFrom > result.salaryTo) fail('Начало зарплатного диапазона превышает конец.');
  if (result.languageCodes.some(item => !allowedLanguages.has(item))) fail('Неизвестный язык.');
  if (result.availableFrom && (!/^\d{4}-\d{2}-\d{2}$/u.test(result.availableFrom)
    || !Number.isFinite(Date.parse(result.availableFrom)) || new Date(result.availableFrom).toISOString().slice(0, 10) !== result.availableFrom)) fail('Проверьте дату готовности.');
  result.experienceMonths = value.experienceMonths === undefined ? experienceMonths(result.experience) : integer(value.experienceMonths, 1200, 'Стаж в месяцах');
  return result;
}

function hasPrivateProfile(value) {
  if (!value) return false;
  return ['name', 'email', 'phone', 'city', 'bio', 'careerAchievements', 'education', 'workHistory', 'portfolio',
    'languages', 'industry', 'professionalRole', 'experience', 'employmentType', 'availableFrom'].some(key => Boolean(value[key]))
    || Boolean(value.stack?.length || value.softSkills?.length || value.languageCodes?.length || value.workExperiences?.length
      || value.petProjects?.length || value.achievementItems?.length || value.interests?.length || value.confirmed || value.surveyCompletedAt)
    || value.salaryFrom !== null && value.salaryFrom !== undefined || value.salaryTo !== null && value.salaryTo !== undefined
    || value.experienceMonths !== null && value.experienceMonths !== undefined;
}

function company(input) {
  const value = object(input, 'компания');
  return { id: ownCompanyId, name: text(value.name, 200, 'Название компании'),
    industry: text(value.industry, 200, 'Отрасль компании'), website: url(value.website, 1000, 'Сайт компании'),
    contact: text(value.contact, 254, 'Контакт компании'), description: text(value.description, 4000, 'Описание компании') };
}

function survey(input) {
  const value = object(input, 'анкета');
  const id = text(value.id, 100, 'ID анкеты');
  const created = date(value.date, 'Дата анкеты');
  const result = { id, date: created,
    industry: choice(value.industry, industryOptions, 'Отрасль анкеты', 'ИТ'),
    professionalRole: text(value.professionalRole, 100, 'Роль в анкете'),
    specialization: category(value.specialization, isSpecialization, 'Специализация анкеты'),
    desiredGrade: category(value.desiredGrade, isGrade, 'Грейд анкеты'),
    stack: strings(value.stack, MAX_STACK_SKILLS, 80, 'Стек анкеты'),
    experience: text(value.experience, 100, 'Стаж анкеты'), softSkills: strings(value.softSkills, MAX_SOFT_SKILLS, 80, 'Софт-скиллы'),
  };
  if (!id || !created || !result.professionalRole || !result.stack.length || !result.experience) fail('Заполните обязательные поля анкеты.');
  Object.assign(result, validateResumeFields(value, fail));
  for (const key of ['education', 'languages']) result[key] = text(value[key], resumeTextLimits[key], key);
  result.portfolio = url(value.portfolio, resumeTextLimits.portfolio, 'Портфолио анкеты');
  result.format = choice(value.format, formats, 'Формат анкеты');
  return result;
}

function searchFilters(input) {
  const filters = object(input, 'фильтры поиска');
  if (Object.keys(filters).some(key => !Object.hasOwn(defaultSearchFilters, key))) fail('Неизвестный фильтр.');
  const checked = {};
  // Role dictionaries are predicates because their IDs differ from public labels.
  if (filters.specialization !== undefined && filters.specialization !== '' && !isSpecialization(filters.specialization)) fail('Неизвестная специализация фильтра.');
  if (filters.grade !== undefined && filters.grade !== '' && !isGrade(filters.grade)) fail('Неизвестный грейд фильтра.');
  for (const [key, allowed] of [['format', formats], ['industry', ['', ...industryOptions]], ['employmentType', ['', ...employmentTypes]], ['language', ['', ...allowedLanguages]]]) {
    checked[key] = choice(filters[key], allowed, `Фильтр ${key}`);
  }
  for (const [key, max] of [['salaryMax', 10000000], ['experienceMin', 1200], ['experienceMax', 1200], ['minScore', 100]]) checked[key] = integer(filters[key], max, `Фильтр ${key}`);
  checked.stack = strings(filters.stack, MAX_STACK_SKILLS, 80, 'Навыки поиска');
  checked.fsp = flag(filters.fsp, 'Достижения ФСП'); checked.hasPortfolio = flag(filters.hasPortfolio, 'Портфолио');
  checked.city = text(filters.city, 100, 'Город поиска');
  if (checked.experienceMin !== null && checked.experienceMax !== null && checked.experienceMin > checked.experienceMax) fail('Проверьте диапазон стажа.');
  return normalizeSearchFilters({ ...filters, ...checked });
}

function search(input) {
  const value = object(input, 'сохранённый поиск');
  const result = { id: text(value.id, 100, 'ID поиска'), title: text(value.title, 200, 'Название поиска'),
    query: text(value.query, 1200, 'Запрос'), filters: searchFilters(value.filters) };
  if (!result.id || !result.title) fail('Укажите название сохранённого поиска.');
  return result;
}

function hiringNeed(input) {
  const value = object(input, 'потребность в специалистах');
  if (Object.keys(value).some(key => !['id', 'title', 'team', 'tasks', 'filters'].includes(key))) fail('Неизвестное поле потребности в специалистах.');
  const result = { id: text(value.id, HIRING_NEED_LIMITS.id, 'ID потребности'), title: text(value.title, HIRING_NEED_LIMITS.title, 'Название потребности'),
    team: text(value.team, HIRING_NEED_LIMITS.team, 'Команда'), tasks: text(value.tasks, HIRING_NEED_LIMITS.tasks, 'Задачи'), filters: searchFilters(value.filters) };
  if (!result.id || !result.title) fail('Укажите название потребности в специалистах.');
  if (!result.tasks && !result.filters.specialization && !result.filters.stack.length) fail('Опишите задачи, специализацию или необходимые навыки.');
  return result;
}

function unique(items, description) {
  if (new Set(items.map(item => item.id)).size !== items.length) fail(`Повторяющийся ID: ${description}.`);
  return items;
}

function candidateDecisions(input) {
  const items = list(input, 2000, 'решения по кандидатам').map(item => {
    const value = object(item, 'решение по кандидату');
    if (Object.keys(value).some(key => !['candidateId', 'decision', 'date'].includes(key))) fail('Неизвестное поле решения по кандидату.');
    const candidateId = text(value.candidateId, 100, 'Кандидат');
    const decision = choice(value.decision, ['liked', 'passed'], 'Решение по кандидату');
    if (!candidateId) fail('Укажите кандидата.');
    // The supplied time is checked for malformed drafts; the server records its own time.
    date(value.date, 'Дата решения');
    return { candidateId, decision };
  });
  if (new Set(items.map(item => item.candidateId)).size !== items.length) fail('Повторяющийся кандидат в решениях.');
  return items;
}

function publicResult(value) {
  const result = { id: value.id, date: value.date, specialization: value.specialization, grade: value.grade,
    score: value.score, passed: value.passed, surveyId: value.surveyId || null };
  for (const key of ['bankVersion', 'competencies', 'vacancySkills', 'questionCount', 'timeouts', 'nextGradeAvailable', 'annulled', 'integrity', 'clarified',
    'pending', 'closedScore', 'openScore', 'openCount', 'openAnswered', 'openStatus', 'openTimedOut', 'reviewedByExpert', 'invalidated', 'review']) if (value[key] !== undefined) result[key] = value[key];
  return result;
}
function sameConfirmation(a, b) {
  return a && b && a.specialization === b.specialization && a.grade === b.grade
    && a.date === b.date && (!a.surveyId || a.surveyId === b.surveyId);
}
function confirmedBy(row, owner) {
  return row?.owner === owner && row.result?.passed === true && row.result.score >= threshold
    && row.result.id === row.id && row.attempt?.id === row.id
    && row.result.specialization === row.attempt.specialization && row.result.grade === row.attempt.grade
    && row.result.surveyId === row.attempt.surveyId;
}
function fromProof(row) {
  const { specialization, grade, score, date, surveyId } = row.result;
  return { specialization, grade, score, date, surveyId };
}

function proposal(input) {
  const value = object(input, 'приглашение');
  const result = { id: text(value.id, 100, 'ID приглашения'), candidateId: text(value.candidateId, 100, 'Кандидат'),
    title: text(value.title, 200, 'Должность'), description: text(value.description, 4000, 'Описание предложения'),
    contact: text(value.contact, 254, 'Контакт предложения'),
    salaryFrom: integer(value.salaryFrom, 10000000, 'Зарплата предложения от'), salaryTo: integer(value.salaryTo, 10000000, 'Зарплата предложения до'),
    status: choice(value.status, statuses, 'Статус приглашения') };
  if (!result.id || !result.candidateId || !result.title || !result.description || !result.contact
    || result.salaryFrom === null || result.salaryTo === null || result.salaryFrom <= 0 || result.salaryFrom > result.salaryTo) fail('Заполните корректное предложение и зарплатный диапазон.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(result.contact)) fail('Проверьте email предложения.');
  return result;
}

export class PlatformService {
  constructor(directoryStore, assessmentStore, { now = () => Date.now(), accountForOwner } = {}) {
    this.store = directoryStore; this.assessments = assessmentStore; this.now = now;
    this.accountForOwner = accountForOwner;
    this.store.db.exec(`CREATE TABLE IF NOT EXISTS privacy_consent_events (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, scope TEXT NOT NULL,
      accepted INTEGER NOT NULL CHECK(accepted IN (0,1)), policy_version TEXT NOT NULL, occurred_at TEXT NOT NULL
    ) STRICT; CREATE INDEX IF NOT EXISTS privacy_consent_owner ON privacy_consent_events(owner, occurred_at);`);
    this.rebuildPublicProfiles();
  }
  publication(owner, person, surveys, proof) {
    const completedSurveys = surveys ?? this.store.db.prepare('SELECT payload FROM platform_surveys WHERE owner=?')
      .all(owner).map(row => JSON.parse(row.payload));
    if (proof === undefined) {
      const saved = person._proofId ? this.assessments.get(person._proofId) : null;
      proof = confirmedBy(saved, owner) && sameConfirmation(person.confirmed, saved.result) ? saved
        : this.assessments.completed(owner).find(row => confirmedBy(row, owner) && sameConfirmation(person.confirmed, row.result));
    }
    return profilePublication(person, { owner, surveys: completedSurveys, proof });
  }
  rebuildPublicProfiles() {
    this.store.transaction(() => {
      for (const account of this.store.db.prepare('SELECT owner,public_id,profile FROM platform_accounts').all()) {
        const registered = this.accountForOwner?.(account.owner);
        if (this.accountForOwner && registered?.role !== 'candidate') continue;
        const person = JSON.parse(account.profile);
        if (this.accountForOwner) person.synthetic = isLocalFixtureAccount(registered);
        const projection = this.publication(account.owner, person);
        const row = this.store.get(account.public_id);
        if (!row || Boolean(row.eligible) !== projection.eligible
          || row.public_payload !== JSON.stringify(publicCandidate(projection.person, account.public_id))) {
          this.store.upsert({ ...projection.person, id: account.public_id }, account.owner, projection.eligible);
        }
      }
    });
  }
  authorize(owner) {
    if (this.accountForOwner && !this.accountForOwner(owner)) throw new RequestError(401, 'Войдите в аккаунт.');
  }
  candidateAccessible(owner, candidate, { includeDemo = false } = {}) {
    if (!candidate) return false;
    if (!this.accountForOwner) return true;
    const account = this.accountForOwner(owner);
    if (!account) return false;
    if (candidate.owner === owner) return true;
    if (isDemoCatalogProfile(candidate)) return includeDemo && account.role === 'employer';
    const target = this.accountForOwner(candidate.owner);
    return account.role === 'employer' && target?.role === 'candidate' && accountsShareRealm(account, target)
      && (!candidate.synthetic || isLocalFixtureAccount(target));
  }
  invitationAccessible(owner, invitation) {
    if (!this.accountForOwner) return true;
    const candidate = this.store.get(invitation.candidate_id);
    if (invitation.sender === owner) return candidate?.owner !== owner && this.candidateAccessible(owner, candidate);
    const account = this.accountForOwner(owner), sender = this.accountForOwner(invitation.sender);
    return candidate?.owner === owner && account?.role === 'candidate' && sender?.role === 'employer'
      && accountsShareRealm(account, sender);
  }
  history(owner) {
    return this.assessments.completed(owner).filter(row => row.owner === owner && row.result).map(row => publicResult(row.result));
  }
  invitations(owner, id) {
    return this.store.db.prepare('SELECT * FROM platform_invitations WHERE sender=? OR candidate_id=? ORDER BY created_at,id').all(owner, id)
      .filter(row => this.invitationAccessible(owner, row))
      .map(row => ({ ...JSON.parse(row.payload), candidateId: row.candidate_id === id ? ownCandidateId : row.candidate_id,
        companyId: row.sender === owner ? ownCompanyId : companyId(row.sender), status: row.status }));
  }
  candidateDecisions(owner) {
    return this.store.db.prepare('SELECT candidate_id,decision,created_at FROM platform_candidate_decisions WHERE owner=? ORDER BY created_at,candidate_id').all(owner)
      .filter(row => this.candidateAccessible(owner, this.store.get(row.candidate_id), { includeDemo: true }))
      .map(row => ({ candidateId: row.candidate_id, decision: row.decision, date: row.created_at }));
  }
  read(owner) {
    ownerKey(owner);
    this.authorize(owner);
    const account = this.store.db.prepare('SELECT * FROM platform_accounts WHERE owner=?').get(owner);
    if (!account) return { state: null, revision: 0, directoryPeople: [] };
    const invitations = this.invitations(owner, account.public_id);
    const privateProfile = JSON.parse(account.profile);
    Object.assign(privateProfile, resumeSections(privateProfile));
    if (this.accountForOwner) privateProfile.synthetic = isLocalFixtureAccount(this.accountForOwner(owner));
    delete privateProfile._proofId;
    const state = { version: 2, profile: privateProfile, company: JSON.parse(account.company), invitations,
      history: this.history(owner),
      surveys: this.store.db.prepare('SELECT payload FROM platform_surveys WHERE owner=? ORDER BY created_at DESC,id').all(owner).map(row => JSON.parse(row.payload)),
      savedSearches: this.store.db.prepare('SELECT payload FROM platform_searches WHERE owner=? ORDER BY position').all(owner).map(row => JSON.parse(row.payload)),
      hiringNeeds: this.store.db.prepare('SELECT payload FROM platform_hiring_needs WHERE owner=? ORDER BY position').all(owner).map(row => JSON.parse(row.payload)),
      candidateDecisions: this.candidateDecisions(owner) };
    const applicants = this.store.db.prepare(`SELECT DISTINCT a.candidate_id FROM marketplace_applications a
      JOIN marketplace_companies c ON c.id=a.company_id WHERE c.owner=?`).all(owner).map(row => row.candidate_id);
    const applicantIds = new Set(applicants);
    const ids = [...new Set([...invitations.map(item => item.candidateId === ownCandidateId ? account.public_id : item.candidateId),
      ...state.candidateDecisions.filter(item => item.decision === 'liked').map(item => item.candidateId), ...applicants])];
    const directoryPeople = ids.flatMap(id => {
      const row = this.store.get(id);
      if (!row || !this.candidateAccessible(owner, row, { includeDemo: true }) || row.owner !== owner && (!row.consent || !applicantIds.has(id) && (!row.eligible || !row.visible))) return [];
      const person = publicDirectoryCandidate(row, row.owner === owner ? ownCandidateId : row.id);
      if (this.accountForOwner && isLocalFixtureAccount(this.accountForOwner(row.owner))) person.synthetic = true;
      return [person];
    });
    const contactCandidateIds = directoryPeople.filter(person => !person.demoProfile && (applicantIds.has(person.id)
      || invitations.some(item => item.candidateId === person.id && item.companyId === ownCompanyId && item.status === 'accepted'))).map(person => person.id);
    return { state, revision: account.revision, directoryPeople, contactCandidateIds };
  }
  save(owner, input, baseRevision, role = null) {
    ownerKey(owner);
    this.authorize(owner);
    if (this.accountForOwner) role = this.accountForOwner(owner)?.role || null;
    if (role !== null && role !== 'candidate' && role !== 'employer') throw new RequestError(403, 'Роль аккаунта недоступна.');
    if (!Number.isSafeInteger(baseRevision) || baseRevision < 0) fail('Некорректная версия данных.');
    const value = object(input, 'состояние');
    if (value.version !== 2 || Object.keys(value).some(key => !['version', 'profile', 'company', 'invitations', 'history', 'surveys', 'savedSearches', 'hiringNeeds', 'candidateDecisions'].includes(key))) fail('Неподдерживаемый формат состояния.');
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 1000000) throw new RequestError(413, 'Данные профиля слишком велики.');
    // History is validated as a collection but its values never grant authority.
    const incomingHistory = list(value.history, 500, 'история тестов');
    const incomingInvites = unique(list(value.invitations, 500, 'приглашения').map(proposal), 'приглашения');
    const savedSearches = unique(list(value.savedSearches, 100, 'поиски').map(search), 'поиски');
    const hiringNeeds = value.hiringNeeds === undefined ? null : unique(list(value.hiringNeeds, MAX_HIRING_NEEDS, 'потребности в специалистах').map(hiringNeed), 'потребности в специалистах');
    const incomingSurveys = unique(list(value.surveys, 100, 'анкеты').map(survey), 'анкеты');
    const incomingDecisions = value.candidateDecisions === undefined ? null : candidateDecisions(value.candidateDecisions);
    const employer = company(value.company);
    if (role === 'candidate' && savedSearches.length) throw new RequestError(403, 'Сохранённые поиски доступны работодателю.');
    if (role === 'candidate' && hiringNeeds?.length) throw new RequestError(403, 'Потребности в специалистах доступны работодателю.');
    if (role === 'candidate' && incomingDecisions?.length) throw new RequestError(403, 'Подбор кандидатов доступен работодателю.');
    return this.store.transaction(() => {
      const account = this.store.db.prepare('SELECT * FROM platform_accounts WHERE owner=?').get(owner);
      if ((account?.revision || 0) !== baseRevision) throw new RequestError(409, 'Данные изменились в другой вкладке. Обновите страницу.');
      if (role === 'candidate' && hiringNeeds !== null && this.store.db.prepare('SELECT 1 FROM platform_hiring_needs WHERE owner=? LIMIT 1').get(owner)) {
        throw new RequestError(403, 'Изменять потребности в специалистах может только работодатель.');
      }
      const oldProfile = account ? JSON.parse(account.profile) : null;
      const existingSurveys = this.store.db.prepare('SELECT id,payload FROM platform_surveys WHERE owner=?').all(owner);
      for (const existing of existingSurveys) {
        const incoming = incomingSurveys.find(item => item.id === existing.id);
        if (!incoming || JSON.stringify(survey(JSON.parse(existing.payload))) !== JSON.stringify(incoming)) {
          throw new RequestError(403, 'Сохранённые анкеты нельзя изменять или удалять. Добавьте новую анкету.');
        }
      }
      const person = profile(value.profile, oldProfile);
      this.profileSource?.(owner, person);
      if (this.accountForOwner) person.synthetic = isLocalFixtureAccount(this.accountForOwner(owner));
      if (role === 'employer' && (hasPrivateProfile(person) || person.consent || incomingSurveys.length)) {
        throw new RequestError(403, 'Профиль и анкеты доступны соискателю.');
      }
      if (!person.consent && (hasPrivateProfile(person) || incomingSurveys.length) && !hasPrivateProfile(oldProfile)) throw new RequestError(400, 'Для сохранения личной анкеты необходимо согласие.');
      const rows = this.assessments.completed(owner).filter(row => row.owner === owner && row.result);
      const byId = new Map(rows.map(row => [row.id, row]));
      if (oldProfile?._proofId && !byId.has(oldProfile._proofId)) {
        const row = this.assessments.get(oldProfile._proofId);
        if (row?.owner === owner && row.result) byId.set(row.id, row);
      }
      for (const result of incomingHistory) {
        if (!isObject(result) || typeof result.id !== 'string' || result.id.length > 100) fail('Некорректная история тестов.');
        if (!byId.has(result.id)) {
          const row = this.assessments.get(result.id);
          if (row?.owner === owner && row.result) byId.set(row.id, row);
        }
      }
      const proofFor = category => [...byId.values()].find(row => confirmedBy(row, owner) && sameConfirmation(category, row.result));
      const oldProof = proofFor(oldProfile?.confirmed);
      const requestedProof = proofFor(person.confirmed);
      const selectedProof = requestedProof || oldProof;
      if (selectedProof) {
        const next = fromProof(selectedProof);
        const changed = oldProof && (oldProof.result.grade !== next.grade || oldProof.result.specialization !== next.specialization);
        const changedAt = oldProof ? oldProfile.gradeChangedAt || oldProof.result.date : next.date;
        // A confident result (>= 90) opens the next grade of the same specialization at once;
        // every other change waits 90 days since the previous change.
        const fastTrack = changed && oldProof.result.score >= confidentThreshold && oldProof.result.specialization === next.specialization
          && nextGrade(oldProof.result.grade) === next.grade;
        if (changed && !fastTrack && this.now() < Date.parse(changedAt) + 90 * 86400000) throw new RequestError(409, 'Смена подтверждённой категории доступна раз в 90 дней.');
        person.confirmed = next;
        // A delayed/replayed successful result is not a delayed category-change
        // timestamp: the next interval starts when this change is applied.
        person.gradeChangedAt = changed || !oldProof ? new Date(this.now()).toISOString() : changedAt;
        const proofSurvey = selectedProof.attempt?.survey || this.assessments.get(selectedProof.id)?.attempt?.survey;
        if (!incomingSurveys.some(item => item.id === next.surveyId) && proofSurvey) {
          if (incomingSurveys.length >= 100) fail('Допустимо до 100 сохранённых анкет.');
          incomingSurveys.push(survey(proofSurvey));
        }
      } else if (person.confirmed && [...byId.values()].some(row => (row.result?.reviewedByExpert || row.result?.pending) && !row.result.passed && sameConfirmation(person.confirmed, row.result))) {
        // The attempt behind this category waits for an expert, or an expert annulled or failed it:
        // a client copy cannot confirm it.
        person.confirmed = null;
      } else if (person.confirmed) {
        // Legacy or unverifiable categories may be kept privately for migration.
        person.gradeChangedAt = date(value.profile.gradeChangedAt, 'Дата смены категории', person.confirmed.date);
      }
      if (person.surveyCompletedAt && !incomingSurveys.some(item => item.date === person.surveyCompletedAt)) person.surveyCompletedAt = null;
      const id = account?.public_id || publicId(owner);
      const occupied = this.store.get(id);
      if (occupied && occupied.owner !== owner) throw new RequestError(409, 'Идентификатор профиля занят.');
      const revision = baseRevision + 1;
      const timestamp = new Date(this.now()).toISOString();
      const storedDecisions = new Map(this.candidateDecisions(owner).map(item => [item.candidateId, item]));
      const decisions = incomingDecisions === null ? [...storedDecisions.values()] : incomingDecisions.map(item => {
        const target = this.store.get(item.candidateId);
        if (item.candidateId === ownCandidateId || item.candidateId === id || target?.owner === owner) fail('Нельзя оценить собственный профиль.');
        const existing = storedDecisions.get(item.candidateId);
        if (!target || !this.candidateAccessible(owner, target, { includeDemo: true }) || (!existing || existing.decision !== item.decision) && (!target.eligible || !target.visible || !target.consent)) {
          throw new RequestError(404, 'Кандидат недоступен для оценки.');
        }
        return { ...item, date: existing?.decision === item.decision ? existing.date : timestamp };
      });
      this.store.db.prepare(`INSERT INTO platform_accounts(owner,public_id,revision,profile,company,updated_at) VALUES(?,?,?,?,?,?)
        ON CONFLICT(owner) DO UPDATE SET revision=excluded.revision,profile=excluded.profile,company=excluded.company,updated_at=excluded.updated_at`)
        .run(owner, id, revision, JSON.stringify({ ...person, ...(selectedProof ? { _proofId: selectedProof.id } : {}) }), JSON.stringify(employer), timestamp);
      if (Boolean(oldProfile?.consent) !== person.consent) {
        this.store.db.prepare('INSERT INTO privacy_consent_events VALUES(?,?,?,?,?,?)')
          .run(randomBytes(16).toString('hex'), owner, 'profile', Number(person.consent), PRIVACY_POLICY_VERSION, timestamp);
      }
      if (this.accountForOwner ? role === 'employer' : role !== 'candidate') syncMarketplaceCompany(this.store, owner, employer, id);
      const publication = this.publication(owner, person, incomingSurveys, selectedProof || null);
      this.store.upsert({ ...publication.person, id }, owner, publication.eligible);
      for (const item of incomingSurveys) {
        this.store.db.prepare('INSERT OR IGNORE INTO platform_surveys VALUES(?,?,?,?)').run(owner, item.id, item.date, JSON.stringify(item));
      }
      this.store.db.prepare('DELETE FROM platform_searches WHERE owner=?').run(owner);
      savedSearches.forEach((item, position) => this.store.db.prepare('INSERT INTO platform_searches VALUES(?,?,?,?)').run(owner, item.id, position, JSON.stringify(item)));
      if (hiringNeeds !== null) {
        this.store.db.prepare('DELETE FROM platform_hiring_needs WHERE owner=?').run(owner);
        const saveNeed = this.store.db.prepare('INSERT INTO platform_hiring_needs VALUES(?,?,?,?)');
        hiringNeeds.forEach((item, position) => saveNeed.run(owner, item.id, position, JSON.stringify(item)));
      }
      const keptDecisions = new Set(decisions.map(item => item.candidateId));
      const removeDecision = this.store.db.prepare('DELETE FROM platform_candidate_decisions WHERE owner=? AND candidate_id=?');
      for (const candidateId of storedDecisions.keys()) if (!keptDecisions.has(candidateId)) removeDecision.run(owner, candidateId);
      const saveDecision = this.store.db.prepare(`INSERT INTO platform_candidate_decisions VALUES(?,?,?,?)
        ON CONFLICT(owner,candidate_id) DO UPDATE SET decision=excluded.decision,created_at=excluded.created_at`);
      for (const item of decisions) if (storedDecisions.get(item.candidateId)?.decision !== item.decision) {
        saveDecision.run(owner, item.candidateId, item.decision, item.date);
      }
      const changedOwners = new Set();
      for (const item of incomingInvites) {
        const target = item.candidateId === ownCandidateId ? id : item.candidateId;
        const existing = this.store.db.prepare('SELECT * FROM platform_invitations WHERE id=?').get(item.id);
        if (!existing) {
          if (role === 'candidate') throw new RequestError(403, 'Отправлять приглашения может только работодатель.');
          const candidate = this.store.get(target);
          if (!candidate || !this.candidateAccessible(owner, candidate) || this.accountForOwner && candidate.owner === owner
            || !candidate.eligible || !candidate.visible || !candidate.consent) throw new RequestError(404, 'Кандидат недоступен для приглашения.');
          if (item.status !== 'sent') throw new RequestError(403, 'Работодатель может только отправить приглашение.');
          if (!employer.name) fail('Укажите название компании.');
          const risk = assessOfferRisk({ title: item.title, description: item.description, salaryFrom: item.salaryFrom, salaryTo: item.salaryTo,
            grade: candidate.grade || undefined });
          if (risk.level === 'block') throw new RequestError(400, blockedMessage(risk), { risk });
          // Mass invitations are a spam pattern; a real search sends a few targeted offers a day.
          const recent = this.store.db.prepare('SELECT COUNT(*) AS n FROM platform_invitations WHERE sender=? AND created_at>?')
            .get(owner, new Date(this.now() - 86400000).toISOString()).n;
          if (recent >= OFFER_RISK_POLICY.invitationsPerDay) throw new RequestError(429, `Допустимо до ${OFFER_RISK_POLICY.invitationsPerDay} новых приглашений в сутки.`);
          const payload = { ...item, candidateId: target, companyId: companyId(owner), company: employer.name, date: timestamp };
          this.store.db.prepare('INSERT INTO platform_invitations VALUES(?,?,?,?,?,?)').run(item.id, owner, target, 'sent', timestamp, JSON.stringify(payload));
          if (candidate.owner && candidate.owner !== owner) changedOwners.add(candidate.owner);
          continue;
        }
        if (!this.invitationAccessible(owner, existing)) throw new RequestError(403, 'Приглашение недоступно этому аккаунту.');
        const candidate = this.store.get(existing.candidate_id);
        const recipient = candidate?.owner === owner;
        if (existing.sender !== owner && !recipient) throw new RequestError(403, 'Приглашение принадлежит другой сессии.');
        if (role === 'employer' && recipient && existing.sender !== owner) throw new RequestError(403, 'Ответить на приглашение может только соискатель.');
        const stored = JSON.parse(existing.payload);
        if (target !== existing.candidate_id || ['title', 'description', 'contact', 'salaryFrom', 'salaryTo'].some(key => item[key] !== stored[key])) throw new RequestError(403, 'Отправленное предложение нельзя подменить.');
        if (item.status === existing.status) continue;
        if (!recipient || !['sent', 'viewed'].includes(existing.status)
          || !['viewed', 'accepted', 'rejected'].includes(item.status) || existing.status === 'viewed' && item.status === 'viewed') throw new RequestError(403, 'Изменить ответ может только получатель приглашения.');
        this.store.db.prepare('UPDATE platform_invitations SET status=? WHERE id=?').run(item.status, item.id);
        if (existing.sender !== owner) changedOwners.add(existing.sender);
      }
      for (const changedOwner of changedOwners) this.store.db.prepare('UPDATE platform_accounts SET revision=revision+1,updated_at=? WHERE owner=?').run(timestamp, changedOwner);
      return this.read(owner);
    });
  }
  contacts(owner, id) {
    ownerKey(owner);
    this.authorize(owner);
    if (typeof id !== 'string' || !id.length || id.length > 100) fail('Некорректный кандидат.');
    const own = this.store.db.prepare('SELECT * FROM platform_accounts WHERE owner=?').get(owner);
    const target = id === ownCandidateId ? own?.public_id : id;
    const candidate = target ? this.store.get(target) : null;
    if (!candidate?.owner) throw new RequestError(404, 'Контакты недоступны.');
    if (!this.candidateAccessible(owner, candidate)) throw new RequestError(404, 'Контакты недоступны.');
    const account = this.store.db.prepare('SELECT * FROM platform_accounts WHERE owner=?').get(candidate.owner);
    if (!account) throw new RequestError(404, 'Контакты недоступны.');
    const person = JSON.parse(account.profile);
    const accepted = this.store.db.prepare(`SELECT 1 FROM platform_invitations WHERE sender=? AND candidate_id=? AND status='accepted' LIMIT 1`).get(owner, target);
    const applied = this.store.db.prepare(`SELECT 1 FROM marketplace_applications a JOIN marketplace_companies c ON c.id=a.company_id
      WHERE c.owner=? AND a.candidate_id=? LIMIT 1`).get(owner, target);
    if (candidate.owner !== owner && (!person.consent || !accepted && !applied)) throw new RequestError(403, 'Контакты доступны после отклика или принятия приглашения и при действующем согласии.');
    return { email: person.email, phone: person.phone, ...(person.portfolio ? { portfolio: person.portfolio } : {}) };
  }
  delete(owner, { withinTransaction = false, deleteAssessmentRecords = false } = {}) {
    ownerKey(owner);
    this.authorize(owner);
    const erase = () => {
      const account = this.store.db.prepare('SELECT * FROM platform_accounts WHERE owner=?').get(owner);
      if (!account) return;
      const affected = this.store.db.prepare('SELECT sender,candidate_id FROM platform_invitations WHERE sender=? OR candidate_id=?').all(owner, account.public_id);
      const others = new Set();
      for (const row of this.store.db.prepare(`SELECT a.candidate_owner,c.owner FROM marketplace_applications a
        JOIN marketplace_companies c ON c.id=a.company_id WHERE a.candidate_owner=? OR c.owner=?`).all(owner, owner)) {
        if (row.candidate_owner !== owner) others.add(row.candidate_owner);
        if (row.owner && row.owner !== owner) others.add(row.owner);
      }
      for (const row of this.store.db.prepare('SELECT owner FROM platform_candidate_decisions WHERE candidate_id=?').all(account.public_id)) {
        if (row.owner !== owner) others.add(row.owner);
      }
      for (const row of affected) {
        if (row.sender !== owner) others.add(row.sender);
        const recipient = this.store.get(row.candidate_id)?.owner;
        if (recipient && recipient !== owner) others.add(recipient);
      }
      this.store.db.prepare('DELETE FROM platform_invitations WHERE sender=? OR candidate_id=?').run(owner, account.public_id);
      this.store.db.prepare('DELETE FROM directory_candidates WHERE owner=?').run(owner);
      this.store.db.prepare('DELETE FROM platform_accounts WHERE owner=?').run(owner);
      this.store.db.prepare('DELETE FROM privacy_consent_events WHERE owner=? AND scope=\'profile\'').run(owner);
      const timestamp = new Date(this.now()).toISOString();
      for (const other of others) this.store.db.prepare('UPDATE platform_accounts SET revision=revision+1,updated_at=? WHERE owner=?').run(timestamp, other);
    };
    if (withinTransaction) erase(); else this.store.transaction(erase);
    if (deleteAssessmentRecords) this.store.db.prepare('DELETE FROM attempts WHERE owner=?').run(owner);
    else this.assessments.deleteOwner?.(owner);
    return { state: null, revision: 0, directoryPeople: [] };
  }
}
