import { PRIVACY_POLICY_VERSION } from '../shared/privacy.ts';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AuthService } from '../server/auth.mjs';
import { DirectoryStore } from '../server/directory-store.mjs';
import { PlatformService } from '../server/platform.mjs';
import { MarketplaceService } from '../server/marketplace.mjs';
import { FspIntegrationService } from '../server/fsp-integration.mjs';
import { RefreshTaskService } from '../server/refresh-tasks.mjs';
import { appendOpenTasks, authoredOpenTask } from '../server/open-tasks.mjs';
import { AssessmentReviewService, awaitingExpert } from '../server/assessment-review.mjs';
import { openStore } from '../server/store.mjs';
import { createAttempt, digest, evaluate } from '../server/assessment.mjs';
import { createInitialState } from '../frontend/src/model.ts';
import { defaultSearchFilters } from '../shared/search.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
import { localFixturePassword } from '../server/local-fixtures.mjs';
export const localAccountPassword = localFixturePassword;
export const localAccountFixtures = [
  { role: 'candidate', login: 'local_candidate', email: 'candidate@local.example.test', name: 'Тестовый кандидат' },
  { role: 'employer', login: 'local_employer', email: 'employer@local.example.test', companyName: 'Тестовая компания' },
  { role: 'moderator', login: 'local_moderator', email: 'moderator@local.example.test', name: 'Тестовый модератор' },
];

// Two practical answers of the test candidate waiting for the moderator: a complete one and a partial one.
const pendingOpenAnswers = {
  'research:react:Junior': 'Причина: key={index}. После сортировки React сопоставляет строки по позиции, поэтому локальный draft остаётся '
    + 'у компонента на том же месте и «переезжает» к другой записи.\n\nИсправление: key={row.id} — стабильный идентификатор записи.\n\n'
    + 'Тест (Testing Library): рендерю список [a, b], начинаю редактировать b, вставляю новую строку в начало и проверяю, что '
    + 'поле с draft по-прежнему относится к b; затем удаляю редактируемую строку и проверяю, что draft не появился у соседней.\n\n'
    + 'Draft стоит вынести в родителя, если его нужно сохранять при сворачивании строки или отправлять всё одной кнопкой.',
  'research:javascript-typescript:Junior': 'type LoadState<T> = { status: \'idle\' } | { status: \'loading\' } | { status: \'success\'; data: T } '
    + '| { status: \'error\'; message: string };\n\nfunction render(state: LoadState<string>) {\n  switch (state.status) {\n'
    + '    case \'success\': return state.data;\n    case \'error\': return state.message;\n    default: return \'…\';\n  }\n}\n\n'
    + 'Если добавить cancelled, default его поглотит — нужно было бы добавить проверку, но я не уверен как.',
};

/**
 * A second attempt of the test candidate graded while the model was unavailable: the grade
 * waits for the test moderator, who scores the two open answers.
 */
function seedPendingReview(assessments, owner, survey) {
  const started = Date.now();
  let attempt = createAttempt(survey, '', [], started);
  const tasks = Object.keys(pendingOpenAnswers).map(authoredOpenTask);
  attempt = appendOpenTasks(attempt, tasks, started);
  const answers = {};
  attempt.questions.forEach((question, index) => {
    const answeredAt = new Date(started + (index + 1) * 45000).toISOString();
    answers[question.id] = question.type === 'open'
      ? { optionId: null, text: pendingOpenAnswers[question.familyId], answeredAt, ms: 600000, late: false }
      // Ten of twelve closed answers are correct: 83/100 in the closed part.
      : { optionId: index < 10 ? question.correctOptionId : question.options.find(option => option.id !== question.correctOptionId).id, answeredAt, ms: 45000, late: false };
  });
  const progress = { answers, revealedAt: {} };
  assessments.insert(attempt, owner, digest(randomBytes(32).toString('hex')));
  assessments.extend(attempt.id, attempt, progress);
  const evaluation = evaluate(attempt, undefined, started + 30 * 60000, { progress });
  assessments.complete(attempt.id, evaluation.answerDigest, awaitingExpert(evaluation.result));
  new AssessmentReviewService({ db: assessments.db, store: assessments, platform: null })
    .enqueue(attempt.id, owner, { aiReview: { status: 'failed', reason: 'no-key', at: new Date(started).toISOString() } });
}

function candidateState(candidate) {
  const state = createInitialState();
  const survey = { id: randomUUID(), date: new Date().toISOString(), industry: 'ИТ',
    professionalRole: 'Frontend-разработчик', specialization: 'Frontend', desiredGrade: 'Junior',
    experience: '1 год 8 месяцев', stack: ['React', 'TypeScript', 'CSS', 'Redux', 'Jest'], softSkills: ['Коммуникация', 'Работа в команде'] };
  Object.assign(state.profile, survey, { id: 'candidate-anna', name: candidate.name, email: candidate.email, phone: '+7 900 000-00-00',
    city: 'Москва', format: 'Удалённо', consent: true, visible: true, surveyCompletedAt: survey.date,
    bio: 'Frontend-разработчик: делаю доступные интерфейсы личных кабинетов на React и TypeScript, люблю дизайн-системы и тесты.',
    workHistory: 'Учебная продуктовая команда, 1 год 8 месяцев: личный кабинет клиента на React и TypeScript, формы с валидацией и доступностью, '
      + 'компоненты дизайн-системы, unit-тесты на Jest. Ускорил загрузку страницы профиля на 30% за счёт разделения кода.',
    careerAchievements: 'Финалист командного хакатона по продуктовому программированию.', education: 'Бакалавриат, прикладная информатика',
    languages: 'Русский, английский B2', portfolio: 'github.com/example-candidate',
    salaryFrom: 110000, salaryTo: 150000, employmentType: 'Полная занятость' });
  state.surveys = [survey];
  return { state, survey };
}

function employerState(employer, candidateId) {
  const state = createInitialState();
  Object.assign(state.company, { name: employer.company_name, contact: employer.email, industry: 'Продуктовая разработка',
    website: 'https://example.com', description: 'Продуктовая команда: личные кабинеты и платёжные сервисы. Тестовая компания для проверки платформы.' });
  state.hiringNeeds = [
    { id: 'need-frontend-cabinet', title: 'Frontend-разработчик личного кабинета', team: 'Команда личного кабинета: 6 человек, релизы каждую неделю.',
      tasks: 'Разработка интерфейсов личного кабинета на React и TypeScript, доступные формы, компоненты дизайн-системы, unit-тесты.',
      filters: { ...defaultSearchFilters, specialization: 'Frontend', stack: ['React', 'TypeScript'] } },
    { id: 'need-backend-payments', title: 'Backend-разработчик платёжного сервиса', team: 'Платёжная команда: API платежей и интеграции с банками.',
      tasks: 'API платежей, идемпотентная обработка повторных запросов, транзакции в PostgreSQL, очереди и надёжная доставка событий.',
      filters: { ...defaultSearchFilters, specialization: 'Backend', stack: ['Python', 'PostgreSQL'] } },
  ];
  if (candidateId) {
    state.invitations = [{ id: randomUUID(), candidateId, companyId: state.company.id, company: state.company.name,
      title: 'Frontend-разработчик', description: 'Личный кабинет на React и TypeScript: формы, дизайн-система, тесты. Удалённо, команда из 6 человек.',
      contact: employer.email, salaryFrom: 120000, salaryTo: 160000, status: 'sent', date: new Date().toISOString() }];
  }
  return state;
}

/** The candidate applies to the fixture vacancy; three employer tasks show the whole cycle. */
function seedTasks(tasks, marketplace, { candidate, employer, candidateId, vacancyId }) {
  marketplace.apply(candidate, vacancyId, { message: 'Здравствуйте! Интересна задача с личным кабинетом, могу выполнить тестовое задание.' });
  const approved = tasks.assign(employer, { candidateId, recurrenceDays: 0, title: 'Доступность модального окна',
    description: 'В модальном окне подтверждения фокус уходит на страницу под ним. Опишите, как это исправить и как проверить результат.' });
  tasks.answer(candidate, approved.id, { answer: 'При открытии переношу фокус на заголовок окна, а Tab и Shift+Tab держу внутри окна '
    + '(первый и последний фокусируемые элементы). Страница под окном получает inert, Esc закрывает окно, после закрытия фокус '
    + 'возвращается на кнопку, которая его открыла. Окну задаю role="dialog", aria-modal="true" и aria-labelledby на заголовок. '
    + 'Проверка: проход только с клавиатуры, NVDA читает заголовок при открытии, тест на Testing Library: после открытия '
    + 'document.activeElement внутри окна, после Esc — на исходной кнопке.' });
  tasks.review(employer, approved.id, { status: 'approved', feedback: 'Хорошо: учтены inert, возврат фокуса и автотест. Добавьте ещё проверку в VoiceOver.' });
  const submitted = tasks.assign(employer, { candidateId, recurrenceDays: 7, title: 'Код-ревью формы входа',
    description: 'Компонент LoginForm хранит пароль в localStorage «для удобства», показывает ошибку только цветом рамки и отправляет форму '
      + 'по нажатию Enter даже при пустых полях. Перечислите проблемы по приоритету и предложите исправления.' });
  tasks.answer(candidate, submitted.id, { answer: '1. Безопасность: пароль в localStorage доступен любому скрипту на странице (XSS) — убрать, '
    + 'запоминать только логин; сессию держать в httpOnly cookie.\n2. Доступность: ошибка только цветом не видна части пользователей — '
    + 'добавить текст ошибки, связать с полем через aria-describedby, aria-invalid="true", фокус на первое поле с ошибкой.\n'
    + '3. Валидация: блокировать отправку пустой формы, required у полей и проверка в onSubmit, а не только по Enter.\n'
    + '4. Тесты: сценарии пустой формы, неверного пароля и успешного входа на Testing Library.' });
  tasks.assign(employer, { candidateId, recurrenceDays: 0, title: 'Медленная страница профиля',
    description: 'После релиза страница профиля открывается 4 секунды вместо одной. Опишите по шагам, как найдёте причину и что проверите в первую очередь.' });
}

/**
 * Creates the team test accounts in the local database. `reset` restores the
 * fixture cabinets to their initial demo state (accounts and passwords are kept).
 */
export async function prepareLocalAccounts(dbPath = resolve(root, 'server/data/assessment.sqlite'), { reset = false } = {}) {
  if ([process.env.APP_ENV, process.env.NODE_ENV].some(value => value?.trim().toLowerCase() === 'production')) {
    throw new Error('Local fixture accounts are unavailable in production.');
  }
  const codes = new Map();
  let auth, directory, assessments;
  try {
    // These fictional emails are confirmed inside this explicit fixture setup.
    auth = new AuthService(dbPath, { mailer: async ({ email, code }) => { codes.set(email, code); } });
    directory = new DirectoryStore(dbPath);
    assessments = openStore(dbPath);
    const platform = new PlatformService(directory, assessments);
    const marketplace = new MarketplaceService(directory);
    const accountForOwner = owner => auth.accountForPlatformOwner(owner);
    const fsp = new FspIntegrationService(directory, { accountForOwner, env: process.env });
    const tasks = new RefreshTaskService(directory, { accountForOwner });
    const accounts = [];
    for (const fixture of localAccountFixtures) {
      let account = auth.store.accountByIdentifier(fixture.login);
      // Earlier setups made the test moderator an employer; it is replaced by a separate moderator account.
      if (account && fixture.role === 'moderator' && account.role === 'employer' && account.email === fixture.email) {
        directory.db.prepare('DELETE FROM fsp_demo_connections WHERE owner=?').run(account.platform_owner);
        platform.delete(account.platform_owner, { deleteAssessmentRecords: true });
        auth.store.transaction(() => auth.store.eraseAccount(account.platform_owner, auth.store.db, new Date().toISOString()));
        account = null;
      }
      if (!account && fixture.role === 'moderator') {
        account = await auth.createModerator({ login: fixture.login, email: fixture.email, name: fixture.name, password: localAccountPassword, actor: 'local-fixture' });
      } else if (!account) {
        await auth.requestRegistration({ ...fixture, password: localAccountPassword, consent: true, privacyVersion: PRIVACY_POLICY_VERSION }, randomBytes(32).toString('hex'));
        account = auth.verifyRegistration({ email: fixture.email, code: codes.get(fixture.email) });
      }
      await auth.login({ loginOrEmail: fixture.login, password: localAccountPassword });
      if (account.email !== fixture.email || account.role !== fixture.role) throw new Error('Fixture login belongs to another account.');
      accounts.push(account);
    }
    const [candidate, employer] = accounts;
    // A reset continues the revision sequence: an old browser cache with a reused
    // revision number must get a conflict instead of overwriting the fresh fixture.
    const previousRevisions = new Map();
    if (reset) {
      for (const account of [candidate, employer]) {
        previousRevisions.set(account.platform_owner, directory.db.prepare('SELECT revision FROM platform_accounts WHERE owner=?').get(account.platform_owner)?.revision || 0);
        directory.db.prepare('DELETE FROM fsp_demo_connections WHERE owner=?').run(account.platform_owner);
        platform.delete(account.platform_owner, { deleteAssessmentRecords: true });
      }
    }
    if (!platform.read(candidate.platform_owner).state) {
      const { state, survey } = candidateState(candidate);
      // Seed a server-owned fixture result; ordinary signup still requires a test.
      const attempt = createAttempt(survey);
      assessments.insert(attempt, candidate.platform_owner, digest(randomBytes(32).toString('hex')));
      const evaluation = evaluate(attempt, attempt.questions.map(question => ({ questionId: question.id, optionId: question.correctOptionId })));
      assessments.complete(attempt.id, evaluation.answerDigest, evaluation.result);
      const result = evaluation.result;
      state.history = [result];
      state.profile.confirmed = { specialization: result.specialization, grade: result.grade, score: result.score, date: result.date, surveyId: survey.id };
      const saved = platform.save(candidate.platform_owner, state, 0, 'candidate');
      seedPendingReview(assessments, candidate.platform_owner, survey);
      // Demo FSP link: the candidate shows provider-marked achievements («ФСП · демо»).
      if (fsp.enabled) fsp.connect(candidate.platform_owner, { baseRevision: saved.revision, scenario: 'achievements', consent: true });
    }
    if (!platform.read(employer.platform_owner).state) {
      const person = directory.forOwner(candidate.platform_owner);
      const invited = person?.eligible && person.visible && person.consent ? person.id : null;
      platform.save(employer.platform_owner, employerState(employer, invited), 0, 'employer');
      const vacancy = marketplace.publish(employer.platform_owner, { title: 'Frontend-разработчик',
        description: 'Личный кабинет на React и TypeScript: формы, дизайн-система, тесты.', specialization: 'Frontend', grade: 'Junior',
        stack: ['React', 'TypeScript'], city: 'Москва', format: 'Удалённо', salaryFrom: 110000, salaryTo: 150000 });
      marketplace.publish(employer.platform_owner, { title: 'Backend-разработчик платёжного сервиса',
        description: 'API платежей, идемпотентность, PostgreSQL и очереди.', specialization: 'Backend', grade: 'Middle',
        stack: ['Python', 'PostgreSQL'], city: 'Москва', format: 'Гибрид', salaryFrom: 200000, salaryTo: 260000 });
      if (invited) seedTasks(tasks, marketplace, { candidate: candidate.platform_owner, employer: employer.platform_owner, candidateId: invited, vacancyId: vacancy.id });
    }
    for (const [owner, revision] of previousRevisions) {
      directory.db.prepare('UPDATE platform_accounts SET revision=revision+? WHERE owner=?').run(revision + 1, owner);
    }
    return localAccountFixtures.map(({ role, login }) => ({ role, login, password: localAccountPassword }));
  } finally {
    auth?.close(); assessments?.close(); directory?.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.loadEnvFile(resolve(root, '.env')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const dbPath = resolve(root, 'server/data/assessment.sqlite');
  if (process.env.ASSESSMENT_DB && resolve(process.env.ASSESSMENT_DB) !== dbPath) {
    throw new Error('This setup only uses the default local development database.');
  }
  console.log(JSON.stringify({ accounts: await prepareLocalAccounts(dbPath, { reset: process.argv.includes('--reset') }) }));
}
