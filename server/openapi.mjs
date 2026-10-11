import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { integrityKinds } from './assessment.mjs';

/**
 * OpenAPI 3.1 description of the main Node.js API. The integrations module keeps
 * its own contract (docs/api/integrations.openapi.json); both are merged into one
 * document served at /api/openapi.json and rendered by Swagger UI at /api/docs.
 */
const integrationsPath = fileURLToPath(new URL('../docs/api/integrations.openapi.json', import.meta.url));

const ref = name => ({ $ref: '#/components/schemas/' + name });
const json = schema => ({ content: { 'application/json': { schema } } });
const errors = codes => Object.fromEntries(codes.map(code => [String(code), { $ref: '#/components/responses/Error' + code }]));
const string = (description, extra = {}) => ({ type: 'string', ...(description ? { description } : {}), ...extra });
const integer = (description, extra = {}) => ({ type: 'integer', ...(description ? { description } : {}), ...extra });
const boolean = description => ({ type: 'boolean', ...(description ? { description } : {}) });
const array = (items, extra = {}) => ({ type: 'array', items, ...extra });
const object = (properties, required = [], extra = {}) => ({ type: 'object', properties, ...(required.length ? { required } : {}), ...extra });
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const path = (name, description, schema = string()) => ({ name, in: 'path', required: true, description, schema });
const query = (name, description, schema = string()) => ({ name, in: 'query', required: false, description, schema });

const roles = { candidate: 'Соискатель', employer: 'Работодатель', moderator: 'Модератор — отдельный аккаунт, создаётся командой `npm run moderator -- create`; работодатель и соискатель не модерируют', any: 'Любой вошедший пользователь' };
/** One operation: `role` adds the session requirement and the x-role note; `public` operations need no session. */
function op({ tag, summary, description, role, body, params = [], ok = 200, response, codes = [], okDescription = 'Успешно', bodyRequired = true }) {
  const signedIn = Boolean(role);
  const access = signedIn ? `Доступ: ${roles[role]}.` : 'Доступ: без входа.';
  return { tags: [tag], summary, description: [description, access].filter(Boolean).join('\n\n'),
    ...(signedIn ? { security: [{ accountSession: [] }], 'x-role': role } : { security: [] }),
    ...(params.length ? { parameters: params } : {}),
    ...(body ? { requestBody: { required: bodyRequired, ...json(body) } } : {}),
    responses: { [ok]: { description: okDescription, ...(response ? json(response) : {}) },
      ...errors([...new Set([...(signedIn ? [401] : []), ...(signedIn && role !== 'any' ? [403] : []), ...codes])].sort()) } };
}
const redirect = (summary, description, params = []) => ({ tags: ['ФСП ID'], summary, description, security: [],
  ...(params.length ? { parameters: params } : {}), responses: { 302: { description: 'Перенаправление', headers: { Location: { schema: string() } } } } });

const resumeSectionProperties = {
  workExperiences: array(ref('WorkExperience'), { maxItems: 30, description: 'Редактируемые места работы; общий текст до 20 000 символов' }),
  petProjects: array(ref('PetProject'), { maxItems: 30, description: 'Личные проекты; общий текст до 20 000 символов' }),
  achievementItems: array(string('', { maxLength: 4000 }), { maxItems: 50, description: 'Достижения из резюме, до 4000 символов суммарно. Подтверждение ФСП хранится отдельно' }),
  interests: array(string('', { maxLength: 4000 }), { maxItems: 50, description: 'Интересы и дополнительные сведения, до 4000 символов суммарно' }),
  workHistory: string('Текстовая проекция опыта для совместимости со старыми профилями', { maxLength: 20000 }),
  careerAchievements: string('Текстовая проекция достижений из резюме', { maxLength: 4000 }),
};

const schemas = {
  Health: object({ status: string('', { const: 'ok' }) }, ['status']),
  Account: object({ id: string('Идентификатор аккаунта'), login: string(), email: string('', { format: 'email' }),
    role: string('', { enum: ['candidate', 'employer', 'moderator'] }), name: string('Имя соискателя или модератора'), companyName: string('Название компании'),
    canModerate: boolean('Аккаунт модератора с действующим правом'), testAccount: boolean('Командный тестовый аккаунт (изолирован от реальных)') },
  ['id', 'login', 'email', 'role', 'canModerate']),
  AccountResponse: object({ account: ref('Account') }, ['account']),
  RegisterRequest: object({ role: string('', { enum: ['candidate', 'employer'] }), login: string('3–32 символа: латиница, цифры, точка, дефис, подчёркивание'),
    email: string('', { format: 'email' }), password: string('Не короче 12 символов', { minLength: 12 }), consent: boolean('Согласие на обработку данных'),
    privacyVersion: string('Текущая версия политики'), name: string('Обязательно для соискателя'), companyName: string('Обязательно для работодателя') },
  ['role', 'login', 'email', 'password', 'consent', 'privacyVersion']),
  CodeSent: object({ status: string('', { const: 'code_sent' }), email: string(), expiresAt: string('', { format: 'date-time' }),
    delivery: string('`smtp` или `development` (код записан в server/data/mail.log)') }, ['status', 'email', 'expiresAt']),
  VerifyRequest: object({ email: string('', { format: 'email' }), code: string('Шесть цифр', { pattern: '^\\d{6}$' }) }, ['email', 'code']),
  LoginRequest: object({ loginOrEmail: string(), password: string() }, ['loginOrEmail', 'password']),
  SignedOut: object({ status: string('', { const: 'signed_out' }) }, ['status']),
  Deleted: object({ status: string('', { const: 'deleted' }), deletedAt: string('', { format: 'date-time' }) }, ['status', 'deletedAt']),
  DemoAccounts: object({ accounts: array(object({ role: string('', { enum: ['candidate', 'employer', 'moderator'] }), login: string(), password: string() })),
    fspId: object({ enabled: boolean(), mode: string('', { enum: ['keycloak', 'demo', 'off'] }) }) }, ['accounts', 'fspId']),
  FspTicket: object({ name: string(), email: string(), fspId: nullable(string('Номер участника ФСП')), city: string(),
    achievements: array(object({ title: string(), result: string(), year: integer() })), suggestedLogin: string() }),
  FspCompleteRequest: object({ ticket: string('Одноразовый билет из /api/auth/fsp/callback'), login: string(), consent: boolean(), privacyVersion: string() },
    ['ticket', 'login', 'consent', 'privacyVersion']),
  OidcDiscovery: object({ issuer: string(), authorization_endpoint: string(), token_endpoint: string(), userinfo_endpoint: string(),
    jwks_uri: string(), response_types_supported: array(string()), code_challenge_methods_supported: array(string()) }, [], { additionalProperties: true }),
  OidcToken: object({ access_token: string(), id_token: string('JWT HS256 с nonce'), token_type: string(), expires_in: integer() }),
  OidcUserinfo: object({ sub: string(), name: string(), email: string(), fsp_id: string(), city: string(),
    fsp_achievements: array(object({ title: string(), result: string(), year: integer() })) }, [], { additionalProperties: true }),

  WorkExperience: object({ period: string('Период работы в исходном виде', { maxLength: 100 }), company: string('Компания', { maxLength: 200 }),
    tasks: string('Задачи и обязанности', { maxLength: 4000 }) }),
  PetProject: object({ name: string('Название проекта', { maxLength: 200 }), description: string('Описание проекта', { maxLength: 4000 }),
    stack: array(string('', { maxLength: 80 }), { maxItems: 100 }) }),
  Survey: object({ id: string(), date: string('', { format: 'date-time' }), industry: string('В новой анкете ИТ; старые значения принимаются для совместимости'), professionalRole: string(),
    specialization: string('Одна из 14 специализаций, например `Frontend`'), desiredGrade: string('', { enum: ['Intern', 'Junior', 'Middle', 'Senior', 'Lead'] }),
    experience: string(), stack: array(string(), { minItems: 1, maxItems: 100 }), softSkills: array(string(), { maxItems: 30 }),
    ...resumeSectionProperties, education: string(), portfolio: string(), languages: string(), format: string() },
  ['id', 'date', 'industry', 'professionalRole', 'specialization', 'desiredGrade', 'experience', 'stack', 'softSkills']),
  PlatformState: object({ version: integer(), profile: object({ ...resumeSectionProperties }, [], { additionalProperties: true, description: 'Профиль соискателя: контакты, опыт, стек, согласие, публикация, подтверждённая категория' }),
    company: object({}, [], { additionalProperties: true }), invitations: array(ref('Invitation')), history: array(ref('AssessmentResult')),
    surveys: array(ref('Survey')), savedSearches: array(object({}, [], { additionalProperties: true })),
    hiringNeeds: array(ref('HiringNeed')), candidateDecisions: array(object({ candidateId: string(), decision: string('', { enum: ['liked', 'passed'] }) })) },
  ['profile', 'company', 'invitations', 'history', 'surveys'], { additionalProperties: true }),
  PlatformSnapshot: object({ state: nullable(ref('PlatformState')), revision: integer('Версия для оптимистичной блокировки'),
    directoryPeople: array(ref('Candidate'), { description: 'Карточки людей из приглашений и откликов' }), contactCandidateIds: array(string(), { description: 'Кому открыты контакты' }) },
  ['state', 'revision', 'directoryPeople']),
  SaveStateRequest: object({ state: ref('PlatformState'), baseRevision: integer('Ревизия, на которой основаны изменения') }, ['state', 'baseRevision']),
  Invitation: object({ id: string(), candidateId: string(), companyId: string(), company: string(), title: string(), description: string(),
    contact: string(), salaryFrom: integer(), salaryTo: integer(), status: string('', { enum: ['sent', 'viewed', 'accepted', 'rejected'] }), date: string() }),
  HiringNeed: object({ id: string(), title: string(), team: string(), tasks: string('Задачи — текст смыслового поиска'),
    filters: object({}, [], { additionalProperties: true }) }, ['id', 'title', 'tasks']),
  Candidate: object({ id: string(), name: string(), specialization: string(), desiredGrade: string(), city: string(), format: string(),
    ...resumeSectionProperties,
    experience: string(), stack: array(string()), bio: string(), confirmed: nullable(object({ specialization: string(), grade: string(), score: integer(), date: string() })),
    achievements: array(object({}, [], { additionalProperties: true })), synthetic: boolean('Вымышленный или учебный профиль'), demoProfile: boolean() },
  ['id', 'name'], { additionalProperties: true }),

  AssistantInfo: object({ version: string(), llm: boolean('Подключена открытая модель'), model: nullable(string()), notice: string() }, ['llm', 'notice']),
  AssistantChatRequest: object({ message: string('', { maxLength: 800 }), page: string('Текущий раздел кабинета'),
    history: array(object({ role: string('', { enum: ['user', 'assistant'] }), content: string() }), { maxItems: 8 }),
    context: object({}, [], { additionalProperties: true, description: 'Обезличенные счётчики: готовность, потребности, приглашения' }) }, ['message']),
  AssistantReply: object({ reply: string(), links: array(object({ label: string(), page: string() })), source: string('', { enum: ['llm', 'rules', 'guard'] }),
    model: nullable(string()) }, ['reply', 'links', 'source']),

  AssessmentProgram: object({ bankVersion: string(), topics: array(string()), questionCount: integer('Зачётных вопросов: 12'), threshold: integer('Порог: 70'),
    expiresInMinutes: integer(), questionSeconds: integer('Секунд на вопрос'), maxDepartures: integer('Уходов до аннулирования'),
    confidentThreshold: integer('Балл для быстрого перехода на следующий грейд'), retryDays: integer('Ожидание пересдачи грейда после провала'),
    delivery: string('', { const: 'sequential' }), bank: object({ authored: integer(), generated: nullable(object({}, [], { additionalProperties: integer() })) }),
    examples: array(object({ id: string(), title: string(), description: string() })) }),
  StartAttemptRequest: object({ survey: ref('Survey'), vacancyDescription: string('Текст вакансии для выбора релевантных заданий', { maxLength: 4000 }) }, ['survey']),
  Question: object({ id: string('Непрозрачный идентификатор'), type: string('`open` — открытая задача с ответом текстом', { enum: ['open'] }), topic: string(), title: string(),
    text: string(), options: array(object({ id: string(), text: string() }), { description: 'Пусто у открытой задачи' }),
    answerFormat: string('', { enum: ['code', 'sql', 'calculation', 'case'] }), timeLimitSec: integer() }, ['id', 'text', 'options']),
  IntegritySummary: object({ departures: integer(), blockedCopies: integer(), blockedActions: integer(), fullscreenExits: integer(), lastEventAt: nullable(string()) }),
  Attempt: object({ id: string('', { format: 'uuid' }), bankVersion: string(), specialization: string(), grade: string(), surveyId: string(),
    createdAt: string(), expiresAt: string(), blueprint: object({}, [], { additionalProperties: true }), vacancy: nullable(object({}, [], { additionalProperties: true })),
    delivery: string('', { enum: ['sequential', 'all'] }), questionCount: integer('Растёт на 6 при уточняющем блоке'),
    extension: object({ added: integer(), from: integer() }), openStage: object({ added: integer(), from: integer() }, [], { description: 'Открытые задачи, добавленные после пройденной закрытой части' }),
    questions: array(ref('Question'), { description: 'Уже показанные вопросы; следующий выдаётся после ответа' }),
    position: integer('Индекс текущего вопроса'), questionSeconds: integer(), answeredIds: array(string()), currentDeadline: nullable(string('', { format: 'date-time' })),
    serverNow: string('', { format: 'date-time' }), integrity: ref('IntegritySummary') }, ['id', 'questions', 'questionCount']),
  AttemptCreated: { allOf: [ref('Attempt'), object({ token: string('Секрет попытки: передаётся в ответах, хранится только в памяти вкладки') }, ['token'])] },
  AttemptState: { allOf: [ref('Attempt'), object({ status: string('', { enum: ['active', 'completed'] }), complete: boolean('Все ответы получены, можно завершать'),
    extended: boolean('Добавлен уточняющий блок'), opened: boolean('Закрытая часть пройдена, добавлены открытые задачи'), result: ref('AssessmentResult') })] },
  AnswerRequest: object({ token: string(), questionId: string(), optionId: nullable(string('Закрытый вопрос; null — пропуск')),
    answerText: nullable(string('Открытая задача: текст, код или SQL до 12 000 символов; null — пропуск', { maxLength: 12000 })) }, ['token', 'questionId']),
  IntegrityEventRequest: object({ token: string(), event: object({ id: string('UUID события, повтор идемпотентен', { format: 'uuid' }),
    kind: string('Первые четыре — уходы, остальные — заблокированные действия', { enum: [...integrityKinds] }) }, ['id', 'kind']) }, ['token', 'event']),
  IntegrityStatus: { allOf: [ref('IntegritySummary'), object({ remaining: integer('Сколько уходов осталось'), annulled: boolean(), result: ref('AssessmentResult') }, ['remaining', 'annulled'])] },
  SubmitRequest: object({ token: string(), answers: array(object({ questionId: string(), optionId: nullable(string()) }), { description: 'Только для старых попыток с выдачей всех вопросов' }) }, ['token']),
  AssessmentResult: object({ id: string(), date: string(), specialization: string(), grade: string(), surveyId: string(), score: integer('0–100'),
    passed: boolean('Порог 70 пройден'), annulled: boolean('Аннулирована из-за уходов со страницы'), bankVersion: string(),
    competencies: array(object({ topic: string(), score: integer(), correct: integer(), total: integer() })), vacancySkills: array(string()),
    questionCount: integer(), timeouts: integer('Ответы после лимита времени'), nextGradeAvailable: string('Грейд выше, открытый без ожидания при балле от 90'),
    clarified: boolean('Решение принято с уточняющим блоком'), integrity: ref('IntegritySummary'),
    pending: boolean('Открытые ответы на проверке у модератора; грейд ещё не подтверждён'), closedScore: integer('Балл закрытой части'),
    openScore: integer('Балл открытой части после проверки'), openCount: integer(), openAnswered: integer(), invalidated: boolean('Аннулировано модератором из-за дефекта задания'),
    review: object({ decidedAt: string(), note: string(), marks: array(object({ questionId: string(), score: integer(), comment: string() })) }) }, ['id', 'score', 'passed']),
  RetakeLocked: object({ error: string(), retryAt: string('', { format: 'date-time' }), lowerGrades: array(string()) }, ['error', 'retryAt']),

  DirectoryOptions: object({ cities: array(string()), industries: array(string()), languages: array(string()), employmentTypes: array(string()) }, [], { additionalProperties: true }),
  Match: object({ policy: string(), percent: integer(), parts: array(object({ key: string('', { enum: ['tasks', 'category', 'stack', 'test', 'fsp'] }), label: string(), value: integer(), weight: integer() })),
    confidence: object({ level: string('high — допущен моделью и закрывает все требования; medium — частичное совпадение или смежная специализация; low — ближайший профиль ниже порога модели', { enum: ['high', 'medium', 'low'] }), label: string() }, ['level', 'label']),
    requirements: object({ matched: array(string()), missing: array(string()), total: integer(), text: string('Например: «Совпало 2 из 3 (React, TypeScript), не хватает: Figma.»') }, ['matched', 'missing', 'total', 'text'], { description: 'Технологии из запроса и фильтров; альтернатива «A или B» считается одним требованием' }) }),
  Freshness: object({ lastCompletedAt: string('', { format: 'date-time' }), source: string('', { const: 'employer_review' }) }),
  DirectoryItem: object({ person: ref('Candidate'), rank: nullable({ type: 'number', description: 'null — ближайший профиль добора, не оценённый вторым этапом модели' }), reason: string('Почему подходит'), match: ref('Match'),
    freshness: nullable(ref('Freshness')), semanticScore: nullable({ type: 'number' }), rerankerScore: { type: 'number' }, approximate: boolean(),
    evidenceKind: string('', { enum: ['professional', 'competencies'] }) }, ['person', 'reason']),
  DirectorySearch: object({ items: array(ref('DirectoryItem')), categories: array(object({ specialization: string(), grade: string(), count: integer() }, [], { additionalProperties: true })),
    selectedCategory: nullable(object({ specialization: string(), grade: string() })), total: integer(), offset: integer(), limit: integer(), query: string(),
    interpreted: object({}, [], { additionalProperties: true }), effectiveFilters: object({}, [], { additionalProperties: true }),
    model: object({}, [], { additionalProperties: true, description: 'Версия энкодера и политик ранжирования' }), warnings: array(string()) }, ['items', 'total']),
  Contacts: object({ email: string(), phone: string(), portfolio: string({ format: 'uri' }) }, ['email', 'phone']),

  VacancyInput: object({ title: string('', { maxLength: 120 }), description: string('', { maxLength: 3000 }), specialization: string(), grade: string(),
    city: string(), format: string(), stack: array(string()), salaryFrom: integer('', { minimum: 1 }), salaryTo: integer('', { maximum: 10000000 }) },
  ['title', 'description', 'specialization', 'grade', 'city', 'format', 'salaryFrom', 'salaryTo']),
  Vacancy: { allOf: [ref('VacancyInput'), object({ id: string(), companyId: string(), company: string(), currency: string('', { const: 'RUB' }),
    status: string('', { enum: ['open', 'closed'] }), date: string(), synthetic: boolean(),
    risk: object({ level: string('', { const: 'warn' }), signals: array(object({ code: string(), severity: string(), message: string() })) }, [],
      { description: 'Только в ответе публикующему: предупреждения проверки на мошеннические шаблоны (docs/employer_protection.md)' }) }, ['id', 'companyId', 'status'])] },
  VacancyPatch: { oneOf: [ref('VacancyInput'), object({ status: string('', { const: 'closed' }) }, ['status'])] },
  Company: object({ id: string(), name: string(), industry: string(), website: string(), contact: string(), description: string(),
    synthetic: boolean('Демокомпания'), vacancies: array(ref('Vacancy')) }, ['id', 'name']),
  CompanyPage: object({ items: array(ref('Company')), total: integer(), offset: integer(), limit: integer(), nextOffset: nullable(integer()) }, ['items', 'total']),
  ApplyRequest: object({ message: string('', { maxLength: 2000 }) }),
  Application: object({ id: string(), vacancyId: string(), candidateId: string(), companyId: string(), company: string(), vacancy: ref('Vacancy'),
    candidate: nullable(ref('Candidate')), status: string('', { enum: ['sent', 'accepted', 'rejected'] }), date: string(), respondedAt: nullable(string()),
    message: string(), synthetic: boolean() }, ['id', 'status']),
  ApplicationDecision: object({ status: string('', { enum: ['accepted', 'rejected'] }) }, ['status']),

  Task: object({ id: string(), seriesId: string(), cycle: integer('Номер цикла регулярного задания'), candidateId: string(),
    candidate: object({ id: string(), name: string() }), company: string(), title: string(), description: string(),
    recurrenceDays: integer('', { enum: [0, 7, 30, 90] }), availableAt: string(), dueAt: string(),
    status: string('', { enum: ['assigned', 'scheduled', 'overdue', 'submitted', 'approved', 'rejected', 'cancelled'] }),
    answer: string(), answeredAt: nullable(string()), feedback: string(), reviewedAt: nullable(string()), date: string(), source: string('', { const: 'employer_review' }) },
  ['id', 'title', 'status']),
  TaskPage: object({ items: array(ref('Task')), total: integer(), offset: integer(), limit: integer(), nextOffset: nullable(integer()),
    freshness: nullable(ref('Freshness')) }, ['items', 'total']),
  TaskInput: object({ candidateId: string(), title: string('', { maxLength: 200 }), description: string('', { maxLength: 4000 }),
    dueAt: string('От 15 минут до 90 дней; по умолчанию 7 дней', { format: 'date-time' }), recurrenceDays: integer('', { enum: [0, 7, 30, 90] }) },
  ['candidateId', 'title', 'description']),
  TaskCandidates: object({ items: array(object({ id: string(), name: string(), specialization: string(),
    source: string('', { enum: ['invitation', 'application'] }), freshness: nullable(ref('Freshness')) })) }, ['items']),
  TaskAnswerRequest: object({ answer: string('', { maxLength: 6000 }) }, ['answer']),
  TaskReviewRequest: object({ status: string('', { enum: ['approved', 'rejected', 'cancelled'] }), feedback: string('', { maxLength: 2000 }) }, ['status']),
  TaskReviewResult: object({ task: ref('Task'), nextTask: nullable(ref('Task')) }, ['task', 'nextTask']),
  TaskAdvice: object({ verdict: string('', { enum: ['approve', 'revise'] }), score: nullable(integer()), summary: string(), strengths: array(string()),
    gaps: array(string()), questions: array(string()), source: string('', { enum: ['llm', 'rules'] }), model: nullable(string()),
    policy: object({}, [], { additionalProperties: true }) }, ['verdict', 'source']),

  ReviewQueue: object({ total: integer(), offset: integer(), limit: integer(), items: array(object({ id: string(), candidate: string(), specialization: string(), grade: string(),
    status: string('`auto` — результат без проверки модератора', { enum: ['pending', 'completed', 'invalidated', 'auto'] }), version: integer(), submittedAt: string(), decidedAt: nullable(string()), annulled: boolean(),
    closedScore: nullable(integer()), score: nullable(integer()), passed: boolean(), openCount: integer(), departures: integer() })) }, ['items', 'total']),
  ReviewDetail: object({ id: string(), candidate: string(), specialization: string(), grade: string(), status: string(), version: integer(),
    integrity: ref('IntegritySummary'), result: ref('AssessmentResult'),
    closed: array(object({ id: string(), topic: string(), text: string(), options: array(object({ id: string(), text: string() })), correctOptionId: string(), correct: boolean(),
      pilot: boolean(), answer: nullable(object({ optionId: nullable(string()), late: boolean(), seconds: integer() })),
      origin: object({ kind: string('', { enum: ['authored', 'generated'] }), generator: string(), verifier: nullable(string()), confidence: nullable({ type: 'number' }) }, ['kind'], { additionalProperties: true }) })),
    open: array(object({ id: string(), title: string(), text: string(), answerFormat: string(), minutes: integer(),
      rubric: array(object({ id: string(), expected: string(), scale: object({}, [], { additionalProperties: string() }) })), reference: string(), criticalErrors: array(string()),
      answer: nullable(object({ text: nullable(string()), late: boolean(), seconds: integer() })),
      origin: object({ kind: string('', { enum: ['authored', 'generated'] }), model: string(), changes: array(object({}, [], { additionalProperties: true })),
        equivalence: string(), anchor: object({ id: string(), title: string(), prompt: string() }) }, ['kind'], { additionalProperties: true }) })),
    policy: object({ threshold: integer(), closedWeight: { type: 'number' }, openWeight: { type: 'number' } }) }, ['id', 'closed', 'open'], { additionalProperties: true }),
  ReviewDecision: object({ version: integer('Версия из карточки; конкурентное решение получает 409'), decision: string('', { enum: ['grade', 'invalidate'] }),
    note: string('Комментарий кандидату; для аннулирования — причина от 10 символов', { maxLength: 2000 }),
    marks: array(object({ questionId: string(), criteria: array(object({ id: string(), score: integer('', { enum: [0, 1, 2] }) })), comment: string() })) }, ['version', 'decision']),
  ReviewSuggestion: object({ model: string(), advisory: boolean(), tasks: array(object({ questionId: string(), comment: string(),
    criteria: array(object({ id: string(), score: integer(), reason: string() })) })) }, ['tasks']),
  BankItem: object({ id: string(), familyId: string(), specialization: string(), grade: string(), topic: string(), difficulty: integer('', { enum: [1, 2] }),
    skills: array(string()), text: string(), options: array(string(), { minItems: 4, maxItems: 4 }), correct: integer('Индекс ключа (только модератору)'),
    explanation: string(), derivedFrom: nullable(string()), status: string('', { enum: ['pilot', 'active', 'retired', 'rejected'] }),
    generator: string(), verifier: nullable(string()), review: object({}, [], { additionalProperties: true }), origin: string('', { const: 'generated' }),
    createdAt: string(), updatedAt: string(), stats: object({ exposures: integer(), responses: integer(), correct: integer() }, [], { additionalProperties: true }) }),
  BankPage: object({ items: array(ref('BankItem')), summary: object({ authored: integer(), generated: object({}, [], { additionalProperties: integer() }) }),
    generator: object({ configured: boolean(), models: object({}, [], { additionalProperties: true }), queued: integer(), running: boolean() }) }, ['items', 'summary']),
  BankReviewRequest: object({ decision: string('', { enum: ['approve', 'reject'] }), note: string('', { maxLength: 500 }) }, ['decision']),
  BankGenerateRequest: object({ specialization: string(), grade: string() }, ['specialization', 'grade']),
  BankGenerateAccepted: object({ queued: integer(), families: integer() }, ['queued', 'families']),
  ReviewVariant: object({ id: string(), anchorId: string(), status: string() }, ['id'], { additionalProperties: true }),
  ReviewVariantPage: object({ items: array(ref('ReviewVariant')), generator: object({}, [], { additionalProperties: true }) }, ['items']),
  ReviewVariantDecision: object({ decision: string(), checks: object({}, [], { additionalProperties: true }), rationale: string() }, ['decision', 'checks', 'rationale']),
};

const attemptId = path('id', 'Идентификатор попытки', string('', { format: 'uuid' }));
const taskId = path('id', 'Идентификатор задания');
const paths = {
  '/api/health': { get: op({ tag: 'Служебное', summary: 'Проверка работы сервиса', response: ref('Health') }) },
  '/api/openapi.json': { get: op({ tag: 'Служебное', summary: 'Этот документ OpenAPI', description: 'Основной API и модуль интеграций в одном документе.', response: { type: 'object' } }) },
  '/api/docs': { get: { tags: ['Служебное'], summary: 'Swagger UI', security: [], responses: { 200: { description: 'HTML-страница', content: { 'text/html': { schema: string() } } } } } },

  '/api/auth/register/request-code': { post: op({ tag: 'Аккаунт', summary: 'Регистрация: отправить код на почту', ok: 202, body: ref('RegisterRequest'), response: ref('CodeSent'),
    description: 'Сохраняет ожидающую регистрацию и отправляет шестизначный код. Лимиты: 12 запросов за 10 минут с адреса, 4 на email.', codes: [400, 409, 415, 429, 503] }) },
  '/api/auth/register/verify': { post: op({ tag: 'Аккаунт', summary: 'Регистрация: подтвердить код', ok: 201, body: ref('VerifyRequest'), response: ref('AccountResponse'),
    description: 'Создаёт аккаунт и выдаёт HttpOnly-cookie `predel_account_session`.', codes: [400, 410, 429] }) },
  '/api/auth/login': { post: op({ tag: 'Аккаунт', summary: 'Вход по логину или почте', body: ref('LoginRequest'), response: ref('AccountResponse'),
    description: 'Выдаёт HttpOnly-cookie сессии. 20 попыток за 10 минут с адреса.', codes: [400, 401, 429] }) },
  '/api/auth/me': { get: op({ tag: 'Аккаунт', summary: 'Текущий аккаунт', role: 'any', response: ref('AccountResponse') }) },
  '/api/auth/logout': { post: op({ tag: 'Аккаунт', summary: 'Выход', response: ref('SignedOut'), description: 'Отзывает серверную сессию и очищает cookie.' }) },
  '/api/auth/account': { delete: { ...op({ tag: 'Аккаунт', summary: 'Удалить аккаунт и все данные', role: 'any', response: ref('Deleted'), codes: [409],
    description: 'Требует заголовок `X-Platform-Identity: auth:<id аккаунта>`. Атомарно удаляет аккаунт, сессии, профиль, попытки, приглашения, отклики и задания.' }),
  parameters: [{ name: 'X-Platform-Identity', in: 'header', required: true, schema: string('', { pattern: '^auth:' }) }] } },
  '/api/auth/demo-accounts': { get: op({ tag: 'Аккаунт', summary: 'Командные тестовые аккаунты для проверки', response: ref('DemoAccounts'),
    description: 'Пустой список в production или при `DEMO_ACCOUNTS=0`. Тестовые аккаунты изолированы от реальных пользователей.' }) },

  '/api/auth/fsp/start': { get: redirect('Вход через ФСП ID', 'OIDC authorization code + PKCE S256: перенаправляет на ФСП ID (Keycloak или демонстрационный realm), ставит cookie состояния.') },
  '/api/auth/fsp/callback': { get: redirect('Возврат из ФСП ID', 'Проверяет state, nonce и id_token. Существующий аккаунт входит сразу; новый получает одноразовый билет `/auth?mode=fsp&ticket=…`.',
    [query('code', 'Код авторизации'), query('state', 'Состояние'), query('error', 'Ошибка провайдера')]) },
  '/api/auth/fsp/ticket': { get: op({ tag: 'ФСП ID', summary: 'Данные билета нового участника', params: [query('ticket', 'Билет из callback')], response: ref('FspTicket'), codes: [410] }) },
  '/api/auth/fsp/complete': { post: op({ tag: 'ФСП ID', summary: 'Создать аккаунт по билету ФСП ID', ok: 201, body: ref('FspCompleteRequest'), response: ref('AccountResponse'),
    description: 'Создаёт аккаунт соискателя с данными ФСП; анкета и тест остаются обязательными.', codes: [400, 409, 410, 429] }) },
  '/api/fsp-id/realms/fsp/.well-known/openid-configuration': { get: op({ tag: 'ФСП ID', summary: 'Демо-realm: OIDC discovery', response: ref('OidcDiscovery'),
    description: 'Демонстрационный Keycloak-совместимый realm с вымышленными участниками; выключен в production и при настоящем ФСП ID.', codes: [404] }) },
  '/api/fsp-id/realms/fsp/protocol/openid-connect/auth': {
    get: { tags: ['ФСП ID'], summary: 'Демо-realm: страница выбора участника', security: [], parameters: ['client_id', 'redirect_uri', 'state', 'nonce', 'code_challenge', 'code_challenge_method', 'response_type', 'scope'].map(name => query(name, '')),
      responses: { 200: { description: 'HTML-форма', content: { 'text/html': { schema: string() } } }, ...errors([404]) } },
    post: { tags: ['ФСП ID'], summary: 'Демо-realm: подтвердить вход', security: [], requestBody: { required: true, content: { 'application/x-www-form-urlencoded': { schema: object({ participant: string() }, [], { additionalProperties: string() }) } } },
      responses: { 302: { description: 'Возврат на redirect_uri с кодом' }, 400: { description: 'Форма с ошибкой', content: { 'text/html': { schema: string() } } }, ...errors([404, 429]) } } },
  '/api/fsp-id/realms/fsp/protocol/openid-connect/token': { post: { tags: ['ФСП ID'], summary: 'Демо-realm: обмен кода на токены', security: [],
    requestBody: { required: true, content: { 'application/x-www-form-urlencoded': { schema: object({ grant_type: string(), code: string(), code_verifier: string(), redirect_uri: string() }) } } },
    responses: { 200: { description: 'Токены', ...json(ref('OidcToken')) }, 400: { description: '`{"error":"invalid_grant"}`' }, ...errors([404]) } } },
  '/api/fsp-id/realms/fsp/protocol/openid-connect/userinfo': { get: { tags: ['ФСП ID'], summary: 'Демо-realm: сведения об участнике', security: [{ bearer: [] }],
    responses: { 200: { description: 'Участник', ...json(ref('OidcUserinfo')) }, 401: { description: '`{"error":"invalid_token"}`' }, ...errors([404]) } } },

  '/api/platform/state': {
    get: op({ tag: 'Кабинет', summary: 'Состояние кабинета', role: 'any', response: ref('PlatformSnapshot'),
      description: 'Ответ содержит заголовок `X-Platform-Identity`; его нужно вернуть при записи.' }),
    put: { ...op({ tag: 'Кабинет', summary: 'Сохранить состояние кабинета', role: 'any', body: ref('SaveStateRequest'), response: ref('PlatformSnapshot'), codes: [400, 409, 413, 415],
      description: 'Оптимистичная блокировка: устаревший `baseRevision` → 409. Подтверждённая категория и история тестов задаются только сервером; смена категории — не чаще раза в 90 дней.' }),
    parameters: [{ name: 'X-Platform-Identity', in: 'header', required: true, schema: string() }] },
    delete: op({ tag: 'Кабинет', summary: 'Не поддерживается', role: 'any', ok: 403, okDescription: 'Всегда 403: данные удаляются вместе с аккаунтом' }) },

  '/api/assistant/info': { get: op({ tag: 'ИИ-помощник', summary: 'Режим помощника', role: 'any', response: ref('AssistantInfo') }) },
  '/api/assistant/chat': { post: op({ tag: 'ИИ-помощник', summary: 'Вопрос помощнику', role: 'any', body: ref('AssistantChatRequest'), response: ref('AssistantReply'), codes: [400, 409, 429],
    description: 'Роль определяет помощника: карьерный для соискателя, по подбору — для работодателя. Открытая Qwen через OpenRouter, без ключа — готовые подсказки. Во время теста — 409; вопросы теста не решает. 20 сообщений за 10 минут.' }) },

  '/api/assessment/program': { get: op({ tag: 'Тестирование', summary: 'Программа теста без ключей', role: 'candidate', response: ref('AssessmentProgram'), codes: [400],
    params: [query('specialization', 'Специализация'), query('grade', 'Грейд')] }) },
  '/api/assessment/attempts': { post: op({ tag: 'Тестирование', summary: 'Начать попытку', role: 'candidate', ok: 201, body: ref('StartAttemptRequest'), response: ref('AttemptCreated'), codes: [400, 409, 429],
    description: 'Собирает 12 зачётных заданий (3 темы × 2 уровня × 2) и до одного пилотного. Возвращает первый вопрос и токен попытки. 409 с `retryAt` и `lowerGrades`, если грейд закрыт после провала (см. RetakeLocked).' }) },
  '/api/assessment/attempts/{id}': { get: { ...op({ tag: 'Тестирование', summary: 'Восстановить попытку', role: 'candidate', response: ref('AttemptState'), codes: [404], params: [attemptId] }),
    parameters: [attemptId, { name: 'X-Attempt-Token', in: 'header', required: true, schema: string() }] } },
  '/api/assessment/attempts/{id}/answer': { post: op({ tag: 'Тестирование', summary: 'Ответить на текущий вопрос', role: 'candidate', params: [attemptId], body: ref('AnswerRequest'), response: ref('AttemptState'), codes: [400, 404, 409, 410],
    description: 'Фиксирует ответ без возврата и выдаёт следующий вопрос. Ответ позже 120 + 8 секунд засчитывается как неверный. Балл 70–79 после 12 вопросов (порог пройден впритык) добавляет уточняющий блок из 6 заданий (`extended: true`).' }) },
  '/api/assessment/attempts/{id}/integrity': { post: op({ tag: 'Тестирование', summary: 'Событие прокторинга', role: 'candidate', params: [attemptId], body: ref('IntegrityEventRequest'), response: ref('IntegrityStatus'), codes: [400, 404, 409, 429],
    description: 'Уход со страницы, выход из полноэкранного режима, второй экземпляр, заблокированное копирование. Третий уход аннулирует попытку на сервере (`annulled: true`).' }) },
  '/api/assessment/attempts/{id}/submit': { post: op({ tag: 'Тестирование', summary: 'Завершить попытку', role: 'candidate', params: [attemptId], body: ref('SubmitRequest'), response: ref('AssessmentResult'), codes: [400, 404, 409],
    description: 'Оценивает зафиксированные ответы; повтор возвращает прежний результат. Пилотное задание на балл не влияет.' }) },

  '/api/directory/options': { get: op({ tag: 'Подбор', summary: 'Значения фильтров', role: 'employer', response: ref('DirectoryOptions') }) },
  '/api/directory/search': { get: op({ tag: 'Подбор', summary: 'Смысловой поиск специалистов', role: 'employer', response: ref('DirectorySearch'), codes: [400, 503],
    params: [query('q', 'Задачи на естественном языке'), query('filters', 'JSON фильтров: специализация, грейды, стек, город, формат, зарплата…'),
      query('category', 'JSON выбранной категории `{specialization, grade}`'), query('limit', '', integer('', { maximum: 100 })), query('offset', '', integer())],
    description: 'Подтверждённые тестом анкеты выше неподтверждённых. Каждая карточка содержит процент совпадения с разбивкой по сигналам запроса и отметку свежести по принятым заданиям.' }) },
  '/api/directory/{id}/contacts': { get: op({ tag: 'Подбор', summary: 'Контакты кандидата', role: 'employer', params: [path('id', 'Кандидат')], response: ref('Contacts'), codes: [404],
    description: 'Только после принятого приглашения или отклика в компанию; демопрофили контактов не раскрывают.' }) },

  '/api/companies': { get: op({ tag: 'Компании и вакансии', summary: 'Каталог компаний', role: 'any', response: ref('CompanyPage'),
    params: [query('q', 'Поиск'), query('offset', '', integer()), query('limit', '', integer())] }) },
  '/api/companies/{id}': { get: op({ tag: 'Компании и вакансии', summary: 'Компания с открытыми вакансиями', role: 'any', params: [path('id', 'Компания')], response: ref('Company'), codes: [404] }) },
  '/api/vacancies': {
    get: op({ tag: 'Компании и вакансии', summary: 'Открытые вакансии или вакансии своей компании', role: 'any', params: [query('own', '`1` — вакансии своей компании (работодатель)')],
      response: object({ items: array(ref('Vacancy')) }, ['items']) }),
    post: op({ tag: 'Компании и вакансии', summary: 'Опубликовать вакансию', role: 'employer', ok: 201, body: ref('VacancyInput'), response: ref('Vacancy'), codes: [400, 409],
      description: 'Текст проверяется на мошеннические шаблоны: требование оплаты или личных данных кандидата → 400 с `risk`; мягкие признаки возвращаются в `risk` ответа.' }) },
  '/api/vacancies/{id}': {
    get: op({ tag: 'Компании и вакансии', summary: 'Вакансия', role: 'any', params: [path('id', 'Вакансия')], response: ref('Vacancy'), codes: [404] }),
    patch: op({ tag: 'Компании и вакансии', summary: 'Изменить или закрыть вакансию', role: 'employer', params: [path('id', 'Вакансия')], body: ref('VacancyPatch'), response: ref('Vacancy'), codes: [400, 404] }) },
  '/api/vacancies/{id}/applications': { post: op({ tag: 'Компании и вакансии', summary: 'Откликнуться', role: 'candidate', ok: 201, params: [path('id', 'Вакансия')],
    body: ref('ApplyRequest'), bodyRequired: false, response: ref('Application'), codes: [400, 404, 409] }) },
  '/api/applications': { get: op({ tag: 'Компании и вакансии', summary: 'Отклики', role: 'any', params: [query('role', '`candidate` — мои отклики, `employer` — входящие')],
    response: object({ items: array(ref('Application')) }, ['items']) }) },
  '/api/applications/{id}': { patch: op({ tag: 'Компании и вакансии', summary: 'Принять или отклонить отклик', role: 'employer', params: [path('id', 'Отклик')], body: ref('ApplicationDecision'), response: ref('Application'), codes: [400, 404, 409],
    description: 'Принятый отклик открывает контакты и позволяет назначать задания.' }) },

  '/api/tasks': {
    get: op({ tag: 'Задания', summary: 'Мои задания', role: 'any', response: ref('TaskPage'), params: [query('offset', '', integer()), query('limit', '', integer('', { maximum: 100 }))],
      description: 'Соискатель видит задания от компаний и свою свежесть, работодатель — назначенные им задания.' }),
    post: op({ tag: 'Задания', summary: 'Назначить задание', role: 'employer', ok: 201, body: ref('TaskInput'), response: ref('Task'), codes: [400, 404, 429],
      description: 'Только кандидату с откликом в компанию или принятым приглашением. Регулярное задание открывает следующий цикл после принятия ответа.' }) },
  '/api/tasks/candidates': { get: op({ tag: 'Задания', summary: 'Кому можно назначить задание', role: 'employer', response: ref('TaskCandidates') }) },
  '/api/tasks/{id}/answer': { post: op({ tag: 'Задания', summary: 'Ответить на задание', role: 'candidate', params: [taskId], body: ref('TaskAnswerRequest'), response: ref('Task'), codes: [400, 404, 409, 410] }) },
  '/api/tasks/{id}/review': { post: op({ tag: 'Задания', summary: 'Проверить ответ', role: 'employer', params: [taskId], body: ref('TaskReviewRequest'), response: ref('TaskReviewResult'), codes: [400, 404, 409] }) },
  '/api/tasks/{id}/ai-review': { post: op({ tag: 'Задания', summary: 'ИИ-разбор ответа', role: 'employer', params: [taskId], response: ref('TaskAdvice'), codes: [404, 409, 429],
    description: 'Подсказка работодателю: открытая модель получает только условие и ответ, без имени и контактов. Без ключа — проверка полноты по ключевым словам. 20 разборов за 10 минут.' }) },

  '/api/moderation/assessments': { get: op({ tag: 'Проверка тестов', summary: 'Очередь попыток с открытыми задачами', role: 'moderator', response: ref('ReviewQueue'), codes: [400],
    params: [query('status', '`all` — все завершённые попытки, включая автоматические', string('', { enum: ['pending', 'completed', 'invalidated', 'all'] })), query('offset', '', integer()), query('limit', '', integer('', { maximum: 100 }))],
    description: 'Тестовый модератор видит только тестовые аккаунты, реальный — только реальные; собственные попытки скрыты.' }) },
  '/api/moderation/assessments/{id}': { get: op({ tag: 'Проверка тестов', summary: 'Итоги попытки: ответы, ключи, рубрики и происхождение заданий', role: 'moderator',
    params: [path('id', 'Попытка', string('', { format: 'uuid' }))], response: ref('ReviewDetail'), codes: [404],
    description: 'Закрытые вопросы с ключом и ответом кандидата; авторские или сгенерированные (генератор, решатель, уверенность). Открытые задачи с рубрикой, эталоном, ответом и, для сгенерированного варианта, исходным кейсом, моделью и списком изменений.' }) },
  '/api/moderation/assessments/{id}/decision': { post: op({ tag: 'Проверка тестов', summary: 'Оценить открытые ответы или аннулировать попытку', role: 'moderator',
    params: [path('id', 'Попытка', string('', { format: 'uuid' }))], body: ref('ReviewDecision'), response: ref('ReviewDetail'), codes: [400, 404, 409, 429],
    description: 'Каждый критерий — 0, 1 или 2; пропущенный или поздний ответ — только 0. Открытая часть — среднее задач; итог 50% закрытой + 50% открытой части, порог 70. Пройденный итог подтверждает грейд в профиле по обычным правилам.' }) },
  '/api/moderation/assessments/{id}/ai-review': { post: op({ tag: 'Проверка тестов', summary: 'ИИ-подсказка оценок по рубрике', role: 'moderator',
    params: [path('id', 'Попытка', string('', { format: 'uuid' }))], response: ref('ReviewSuggestion'), codes: [404, 409, 429, 503],
    description: 'Открытая модель получает задачи, рубрики, эталоны и ответы — без имени и контактов. Подсказка, решение за модератором.' }) },
  '/api/item-bank/items': { get: op({ tag: 'Банк заданий', summary: 'Сгенерированные задания и сводка банка', role: 'moderator', response: ref('BankPage'),
    params: [query('specialization', ''), query('grade', ''), query('status', '', string('', { enum: ['pilot', 'active', 'retired', 'rejected'] }))] }) },
  '/api/item-bank/items/{id}/review': { post: op({ tag: 'Банк заданий', summary: 'Перевести пилотное задание в зачёт или отклонить', role: 'moderator',
    params: [path('id', 'Задание', string('', { pattern: '^gen-' }))], body: ref('BankReviewRequest'), response: ref('BankItem'), codes: [400, 404] }) },
  '/api/item-bank/generate': { post: op({ tag: 'Банк заданий', summary: 'Поставить программу в очередь генерации', role: 'moderator', ok: 202, body: ref('BankGenerateRequest'), response: ref('BankGenerateAccepted'), codes: [400, 429, 503],
    description: 'Qwen генерирует задания по образцам семейства и сценариям открытого банка, DeepSeek независимо решает их; принятые становятся пилотными.' }) },
  '/api/review-bank/variants': { get: op({ tag: 'Банк кейсов', summary: 'Варианты кейсов нового банка', role: 'moderator', response: ref('ReviewVariantPage'), params: [query('anchorId', ''), query('grade', '')] }) },
  '/api/review-bank/variants/generate': { post: op({ tag: 'Банк кейсов', summary: 'Сгенерировать вариант кейса', role: 'moderator', ok: 201, body: object({ anchorId: string() }, ['anchorId']),
    response: ref('ReviewVariant'), codes: [400, 409, 422, 429, 503] }) },
  '/api/review-bank/variants/{id}': { get: op({ tag: 'Банк кейсов', summary: 'Вариант кейса', role: 'moderator', params: [path('id', 'Вариант')], response: ref('ReviewVariant'), codes: [404] }) },
  '/api/review-bank/variants/{id}/review': { post: op({ tag: 'Банк кейсов', summary: 'Экспертное решение по варианту', role: 'moderator', params: [path('id', 'Вариант')],
    body: ref('ReviewVariantDecision'), response: ref('ReviewVariant'), codes: [400, 404] }) },
};

const extraResponses = {
  Error410: { description: 'Срок истёк', ...json({ $ref: '#/components/schemas/Error' }) },
  Error422: { description: 'Результат не прошёл проверку', ...json({ type: 'object', additionalProperties: true }) },
};

export function platformOpenApi() {
  const integrations = JSON.parse(readFileSync(integrationsPath, 'utf8'));
  for (const name of Object.keys(schemas)) if (integrations.components.schemas[name]) throw new Error('Schema name collision: ' + name);
  const integrationPaths = Object.fromEntries(Object.entries(integrations.paths).map(([key, value]) =>
    [key, Object.fromEntries(Object.entries(value).map(([method, operation]) => [method, typeof operation === 'object' && !Array.isArray(operation) && operation.responses
      ? { ...operation, tags: operation.tags?.length ? operation.tags : ['Интеграции и достижения'] } : operation]))]));
  return {
    openapi: '3.1.0',
    info: { title: 'predel — API платформы', version: '2.0.0',
      description: 'Полное описание основного Node.js API: аккаунты и ФСП ID, кабинет, тестирование с прокторингом, смысловой подбор, компании и вакансии, '
        + 'регулярные задания, ИИ-помощник, модерация динамического банка и модуль интеграций.\n\n'
        + 'Аутентификация — HttpOnly-cookie `predel_account_session`, выдаётся при входе. Ошибки — JSON `{ "error": "текст" }` и код HTTP. '
        + 'Общий лимит — 180 запросов в минуту с адреса. Запросы с чужого Origin отклоняются (403).' },
    servers: [{ url: '/' }],
    tags: ['Служебное', 'Аккаунт', 'ФСП ID', 'Кабинет', 'Тестирование', 'Проверка тестов', 'Подбор', 'Компании и вакансии', 'Задания', 'ИИ-помощник', 'Банк заданий', 'Банк кейсов', 'Интеграции и достижения']
      .map(name => ({ name })),
    paths: { ...paths, ...integrationPaths },
    components: {
      securitySchemes: { ...integrations.components.securitySchemes, bearer: { type: 'http', scheme: 'bearer' } },
      schemas: { ...integrations.components.schemas, ...schemas },
      responses: { ...integrations.components.responses, ...extraResponses },
    },
  };
}

export function swaggerPage() {
  const version = '5.17.14';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>predel API</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${version}/swagger-ui.css">
<style>body{margin:0;font-family:Manrope,system-ui,sans-serif}.topbar{display:none}.fallback{padding:24px;font:14px/1.6 system-ui}</style></head>
<body><div id="ui"><p class="fallback">Swagger UI загружается с cdn.jsdelivr.net. Без интернета откройте <a href="/api/openapi.json">/api/openapi.json</a>.</p></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${version}/swagger-ui-bundle.js" crossorigin></script>
<script>window.SwaggerUIBundle && (window.ui = SwaggerUIBundle({ url: '/api/openapi.json', dom_id: '#ui', deepLinking: true, docExpansion: 'none', persistAuthorization: false }));</script>
</body></html>`;
}
