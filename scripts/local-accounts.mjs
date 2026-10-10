import { PRIVACY_POLICY_VERSION } from '../shared/privacy.ts';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AuthService } from '../server/auth.mjs';
import { DirectoryStore } from '../server/directory-store.mjs';
import { PlatformService } from '../server/platform.mjs';
import { MarketplaceService } from '../server/marketplace.mjs';
import { FspIntegrationService } from '../server/fsp-integration.mjs';
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
];

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
    const accounts = [];
    for (const fixture of localAccountFixtures) {
      let account = auth.store.accountByIdentifier(fixture.login);
      if (!account) {
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
      for (const account of accounts) {
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
      // Demo FSP link: the candidate shows provider-marked achievements («ФСП · демо»).
      if (fsp.enabled) fsp.connect(candidate.platform_owner, { baseRevision: saved.revision, scenario: 'achievements', consent: true });
    }
    if (!platform.read(employer.platform_owner).state) {
      const person = directory.forOwner(candidate.platform_owner);
      const invited = person?.eligible && person.visible && person.consent ? person.id : null;
      platform.save(employer.platform_owner, employerState(employer, invited), 0, 'employer');
      marketplace.publish(employer.platform_owner, { title: 'Frontend-разработчик',
        description: 'Личный кабинет на React и TypeScript: формы, дизайн-система, тесты.', specialization: 'Frontend', grade: 'Junior',
        stack: ['React', 'TypeScript'], city: 'Москва', format: 'Удалённо', salaryFrom: 110000, salaryTo: 150000 });
      marketplace.publish(employer.platform_owner, { title: 'Backend-разработчик платёжного сервиса',
        description: 'API платежей, идемпотентность, PostgreSQL и очереди.', specialization: 'Backend', grade: 'Middle',
        stack: ['Python', 'PostgreSQL'], city: 'Москва', format: 'Гибрид', salaryFrom: 200000, salaryTo: 260000 });
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
