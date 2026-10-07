import { industryOptions, isSpecialization } from '../shared/catalog.ts';
import { isGrade } from '../shared/grading.ts';
import { MAX_STACK_SKILLS, resumeTextLimits } from '../shared/resume-limits.ts';
import { defaultSearchFilters, employmentTypes, languageOptions, normalizeSearchFilters } from '../shared/search.ts';
import { publicCandidate } from './directory-store.mjs';
import { RequestError, threshold } from './assessment.mjs';

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
    softSkills: [], surveyCompletedAt: date(value.surveyCompletedAt, 'Дата анкеты'),
    experience: text(value.experience, resumeTextLimits.experience, 'Стаж'),
    city: text(value.city, resumeTextLimits.city, 'Город'), format: choice(value.format, formats, 'Формат работы', 'Удалённо'),
    bio: text(value.bio, 4000, 'О себе'),
    careerAchievements: text(value.careerAchievements, resumeTextLimits.careerAchievements, 'Достижения'),
    education: text(value.education, resumeTextLimits.education, 'Образование'),
    workHistory: text(value.workHistory, resumeTextLimits.workHistory, 'История работы'),
    portfolio: url(value.portfolio, resumeTextLimits.portfolio, 'Портфолио'),
    languages: text(value.languages, resumeTextLimits.languages, 'Языки'),
    // The client cannot grant itself federation achievements or demo status.
    fspId: stored?.fspId || '', achievements: stored?.achievements || [], synthetic: false,
    visible: flag(value.visible, 'Видимость'), consent: flag(value.consent, 'Согласие'),
    salaryFrom: integer(value.salaryFrom, 10000000, 'Зарплата от'), salaryTo: integer(value.salaryTo, 10000000, 'Зарплата до'),
    employmentType: choice(value.employmentType, ['', ...employmentTypes], 'Занятость'),
    availableFrom: text(value.availableFrom, 10, 'Дата готовности'),
    languageCodes: strings(value.languageCodes, allowedLanguages.size, 10, 'Коды языков'),
  };
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
    || Boolean(value.stack?.length || value.languageCodes?.length || value.confirmed || value.surveyCompletedAt)
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
    industry: choice(value.industry, industryOptions, 'Отрасль анкеты'),
    professionalRole: text(value.professionalRole, 100, 'Роль в анкете'),
    specialization: category(value.specialization, isSpecialization, 'Специализация анкеты'),
    desiredGrade: category(value.desiredGrade, isGrade, 'Грейд анкеты'),
    stack: strings(value.stack, MAX_STACK_SKILLS, 80, 'Стек анкеты'),
    experience: text(value.experience, 100, 'Стаж анкеты'), softSkills: [],
  };
  if (!id || !created || !result.professionalRole || !result.stack.length || !result.experience) fail('Заполните обязательные поля анкеты.');
  for (const key of ['careerAchievements', 'education', 'workHistory', 'languages']) result[key] = text(value[key], resumeTextLimits[key], key);
  result.portfolio = url(value.portfolio, resumeTextLimits.portfolio, 'Портфолио анкеты');
  result.format = choice(value.format, formats, 'Формат анкеты');
  return result;
}

function search(input) {
  const value = object(input, 'сохранённый поиск');
  const filters = object(value.filters, 'фильтры поиска');
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
  const result = { id: text(value.id, 100, 'ID поиска'), title: text(value.title, 200, 'Название поиска'),
    query: text(value.query, 1200, 'Запрос'), filters: normalizeSearchFilters({ ...filters, ...checked }) };
  if (!result.id || !result.title) fail('Укажите название сохранённого поиска.');
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
  for (const key of ['bankVersion', 'competencies', 'vacancySkills']) if (value[key] !== undefined) result[key] = value[key];
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
  constructor(directoryStore, assessmentStore, { now = () => Date.now() } = {}) {
    this.store = directoryStore; this.assessments = assessmentStore; this.now = now;
  }
  history(owner) {
    return this.assessments.completed(owner).filter(row => row.owner === owner && row.result).map(row => publicResult(row.result));
  }
  invitations(owner, id) {
    return this.store.db.prepare('SELECT * FROM platform_invitations WHERE sender=? OR candidate_id=? ORDER BY created_at,id').all(owner, id)
      .map(row => ({ ...JSON.parse(row.payload), candidateId: row.candidate_id === id ? ownCandidateId : row.candidate_id,
        companyId: row.sender === owner ? ownCompanyId : companyId(row.sender), status: row.status }));
  }
  candidateDecisions(owner) {
    return this.store.db.prepare('SELECT candidate_id,decision,created_at FROM platform_candidate_decisions WHERE owner=? ORDER BY created_at,candidate_id').all(owner)
      .map(row => ({ candidateId: row.candidate_id, decision: row.decision, date: row.created_at }));
  }
  read(owner) {
    ownerKey(owner);
    const account = this.store.db.prepare('SELECT * FROM platform_accounts WHERE owner=?').get(owner);
    if (!account) return { state: null, revision: 0, directoryPeople: [] };
    const invitations = this.invitations(owner, account.public_id);
    const privateProfile = JSON.parse(account.profile);
    delete privateProfile._proofId;
    const state = { version: 2, profile: privateProfile, company: JSON.parse(account.company), invitations,
      history: this.history(owner),
      surveys: this.store.db.prepare('SELECT payload FROM platform_surveys WHERE owner=? ORDER BY created_at DESC,id').all(owner).map(row => JSON.parse(row.payload)),
      savedSearches: this.store.db.prepare('SELECT payload FROM platform_searches WHERE owner=? ORDER BY position').all(owner).map(row => JSON.parse(row.payload)),
      candidateDecisions: this.candidateDecisions(owner) };
    const ids = [...new Set([...invitations.map(item => item.candidateId === ownCandidateId ? account.public_id : item.candidateId),
      ...state.candidateDecisions.filter(item => item.decision === 'liked').map(item => item.candidateId)])];
    const directoryPeople = ids.flatMap(id => {
      const row = this.store.get(id);
      if (!row || row.owner !== owner && (!row.eligible || !row.visible || !row.consent)) return [];
      return [publicCandidate(JSON.parse(row.public_payload), row.owner === owner ? ownCandidateId : row.id)];
    });
    return { state, revision: account.revision, directoryPeople };
  }
  save(owner, input, baseRevision) {
    ownerKey(owner);
    if (!Number.isSafeInteger(baseRevision) || baseRevision < 0) fail('Некорректная версия данных.');
    const value = object(input, 'состояние');
    if (value.version !== 2 || Object.keys(value).some(key => !['version', 'profile', 'company', 'invitations', 'history', 'surveys', 'savedSearches', 'candidateDecisions'].includes(key))) fail('Неподдерживаемый формат состояния.');
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 1000000) throw new RequestError(413, 'Данные профиля слишком велики.');
    // History is validated as a collection but its values never grant authority.
    const incomingHistory = list(value.history, 500, 'история тестов');
    const incomingInvites = unique(list(value.invitations, 500, 'приглашения').map(proposal), 'приглашения');
    const savedSearches = unique(list(value.savedSearches, 100, 'поиски').map(search), 'поиски');
    const incomingSurveys = unique(list(value.surveys, 100, 'анкеты').map(survey), 'анкеты');
    const incomingDecisions = value.candidateDecisions === undefined ? null : candidateDecisions(value.candidateDecisions);
    const employer = company(value.company);
    return this.store.transaction(() => {
      const account = this.store.db.prepare('SELECT * FROM platform_accounts WHERE owner=?').get(owner);
      if ((account?.revision || 0) !== baseRevision) throw new RequestError(409, 'Данные изменились в другой вкладке. Обновите страницу.');
      const oldProfile = account ? JSON.parse(account.profile) : null;
      const person = profile(value.profile, oldProfile);
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
        if (changed && this.now() < Date.parse(changedAt) + 90 * 86400000) throw new RequestError(409, 'Смена подтверждённой категории доступна раз в 90 дней.');
        person.confirmed = next;
        // A delayed/replayed successful result is not a delayed category-change
        // timestamp: the next interval starts when this change is applied.
        person.gradeChangedAt = changed || !oldProof ? new Date(this.now()).toISOString() : changedAt;
        const proofSurvey = selectedProof.attempt?.survey || this.assessments.get(selectedProof.id)?.attempt?.survey;
        if (!incomingSurveys.some(item => item.id === next.surveyId) && proofSurvey) {
          if (incomingSurveys.length >= 100) fail('Допустимо до 100 сохранённых анкет.');
          incomingSurveys.push(survey(proofSurvey));
        }
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
        if (!target || (!existing || existing.decision !== item.decision) && (!target.eligible || !target.visible || !target.consent)) {
          throw new RequestError(404, 'Кандидат недоступен для оценки.');
        }
        return { ...item, date: existing?.decision === item.decision ? existing.date : timestamp };
      });
      this.store.db.prepare(`INSERT INTO platform_accounts(owner,public_id,revision,profile,company,updated_at) VALUES(?,?,?,?,?,?)
        ON CONFLICT(owner) DO UPDATE SET revision=excluded.revision,profile=excluded.profile,company=excluded.company,updated_at=excluded.updated_at`)
        .run(owner, id, revision, JSON.stringify({ ...person, ...(selectedProof ? { _proofId: selectedProof.id } : {}) }), JSON.stringify(employer), timestamp);
      const eligible = Boolean(selectedProof && person.name && person.email && person.professionalRole && person.stack.length);
      this.store.upsert({ ...person, id }, owner, eligible);
      this.store.db.prepare('DELETE FROM platform_surveys WHERE owner=?').run(owner);
      for (const item of incomingSurveys) this.store.db.prepare('INSERT INTO platform_surveys VALUES(?,?,?,?)').run(owner, item.id, item.date, JSON.stringify(item));
      this.store.db.prepare('DELETE FROM platform_searches WHERE owner=?').run(owner);
      savedSearches.forEach((item, position) => this.store.db.prepare('INSERT INTO platform_searches VALUES(?,?,?,?)').run(owner, item.id, position, JSON.stringify(item)));
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
          const candidate = this.store.get(target);
          if (!candidate || !candidate.eligible || !candidate.visible || !candidate.consent) throw new RequestError(404, 'Кандидат недоступен для приглашения.');
          if (item.status !== 'sent') throw new RequestError(403, 'Работодатель может только отправить приглашение.');
          if (!employer.name) fail('Укажите название компании.');
          const payload = { ...item, candidateId: target, companyId: companyId(owner), company: employer.name, date: timestamp };
          this.store.db.prepare('INSERT INTO platform_invitations VALUES(?,?,?,?,?,?)').run(item.id, owner, target, 'sent', timestamp, JSON.stringify(payload));
          if (candidate.owner && candidate.owner !== owner) changedOwners.add(candidate.owner);
          continue;
        }
        const candidate = this.store.get(existing.candidate_id);
        const recipient = candidate?.owner === owner;
        if (existing.sender !== owner && !recipient) throw new RequestError(403, 'Приглашение принадлежит другой сессии.');
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
    if (typeof id !== 'string' || !id.length || id.length > 100) fail('Некорректный кандидат.');
    const own = this.store.db.prepare('SELECT * FROM platform_accounts WHERE owner=?').get(owner);
    const target = id === ownCandidateId ? own?.public_id : id;
    const candidate = target ? this.store.get(target) : null;
    if (!candidate?.owner) throw new RequestError(404, 'Контакты недоступны.');
    const account = this.store.db.prepare('SELECT * FROM platform_accounts WHERE owner=?').get(candidate.owner);
    if (!account) throw new RequestError(404, 'Контакты недоступны.');
    const person = JSON.parse(account.profile);
    if (candidate.owner !== owner && (!person.consent || !this.store.db.prepare(`SELECT 1 FROM platform_invitations WHERE sender=? AND candidate_id=? AND status='accepted' LIMIT 1`).get(owner, target))) throw new RequestError(403, 'Контакты доступны после принятия приглашения и при действующем согласии.');
    return { email: person.email, phone: person.phone };
  }
  delete(owner) {
    ownerKey(owner);
    this.store.transaction(() => {
      const account = this.store.db.prepare('SELECT * FROM platform_accounts WHERE owner=?').get(owner);
      if (!account) return;
      const affected = this.store.db.prepare('SELECT sender,candidate_id FROM platform_invitations WHERE sender=? OR candidate_id=?').all(owner, account.public_id);
      const others = new Set();
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
      const timestamp = new Date(this.now()).toISOString();
      for (const other of others) this.store.db.prepare('UPDATE platform_accounts SET revision=revision+1,updated_at=? WHERE owner=?').run(timestamp, other);
    });
    this.assessments.deleteOwner?.(owner);
    return { state: null, revision: 0, directoryPeople: [] };
  }
}
