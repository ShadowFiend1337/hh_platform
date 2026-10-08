import { PRIVACY_POLICY_VERSION } from '../shared/privacy.ts';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AuthService } from '../server/auth.mjs';
import { DirectoryStore } from '../server/directory-store.mjs';
import { PlatformService } from '../server/platform.mjs';
import { MarketplaceService } from '../server/marketplace.mjs';
import { openStore } from '../server/store.mjs';
import { createAttempt, digest, evaluate } from '../server/assessment.mjs';
import { createInitialState } from '../frontend/src/model.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
export const localAccountPassword = 'LocalDemo2026!';
export const localAccountFixtures = [
  { role: 'candidate', login: 'local_candidate', email: 'candidate@local.example.test', name: 'Тестовый кандидат' },
  { role: 'employer', login: 'local_employer', email: 'employer@local.example.test', companyName: 'Тестовая компания' },
];

export async function prepareLocalAccounts(dbPath = resolve(root, 'server/data/assessment.sqlite')) {
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
    if (!platform.read(candidate.platform_owner).state) {
      const state = createInitialState();
      const survey = { id: randomUUID(), date: new Date().toISOString(), industry: 'ИТ',
        professionalRole: 'Frontend разработчик', specialization: 'Frontend', desiredGrade: 'Junior',
        experience: '1 год', stack: ['React', 'TypeScript'], softSkills: [] };
      Object.assign(state.profile, survey, { id: 'candidate-anna', name: candidate.name, email: candidate.email,
        city: 'Москва', consent: true, visible: true, surveyCompletedAt: survey.date,
        bio: 'Тестовый профиль для локальной проверки интерфейса.',
        careerAchievements: 'Разработка учебного приложения.', education: 'Высшее образование',
        workHistory: 'Учебные проекты: интерфейсы на React и TypeScript.' });
      state.surveys = [survey];
      // Seed a server-owned fixture result; ordinary signup still requires a test.
      const attempt = createAttempt(survey);
      assessments.insert(attempt, candidate.platform_owner, digest(randomBytes(32).toString('hex')));
      const evaluation = evaluate(attempt, attempt.questions.map(question => ({
        questionId: question.id, optionId: question.correctOptionId,
      })));
      assessments.complete(attempt.id, evaluation.answerDigest, evaluation.result);
      const result = evaluation.result;
      state.history = [result];
      state.profile.confirmed = { specialization: result.specialization, grade: result.grade,
        score: result.score, date: result.date, surveyId: survey.id };
      platform.save(candidate.platform_owner, state, 0, 'candidate');
    }
    if (!platform.read(employer.platform_owner).state) {
      const state = createInitialState();
      Object.assign(state.company, { name: employer.company_name, contact: employer.email,
        description: 'Компания для локальной проверки интерфейса.' });
      const person = directory.forOwner(candidate.platform_owner);
      if (person?.eligible && person.visible && person.consent) {
        state.invitations = [{ id: randomUUID(), candidateId: person.id,
          companyId: state.company.id, company: state.company.name, title: 'Frontend разработчик',
          description: 'Разработка интерфейсов на React и TypeScript.', contact: employer.email,
          salaryFrom: 100000, salaryTo: 150000, status: 'sent', date: new Date().toISOString() }];
      }
      platform.save(employer.platform_owner, state, 0, 'employer');
      marketplace.publish(employer.platform_owner, { title: 'Frontend разработчик',
        description: 'Учебное предложение для проверки отклика.', specialization: 'Frontend', grade: 'Junior',
        stack: ['React', 'TypeScript'], city: 'Москва', format: 'Удалённо', salaryFrom: 100000, salaryTo: 150000 });
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
  console.log(JSON.stringify({ accounts: await prepareLocalAccounts(dbPath) }));
}
