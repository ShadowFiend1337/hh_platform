import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, unlinkSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareLocalAccounts, localAccountPassword } from '../../scripts/local-accounts.mjs';
import { AuthService } from '../auth.mjs';
import { DirectoryStore } from '../directory-store.mjs';
import { openStore } from '../store.mjs';
import { PlatformService } from '../platform.mjs';
import { MarketplaceService } from '../marketplace.mjs';
import { createInitialState, currentSurvey } from '../../frontend/src/model.ts';
import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';

test('local account setup prepares both cabinets on a fresh database and preserves edits on rerun', async t => {
  const directoryPath = mkdtempSync(join(tmpdir(), 'predel-local-'));
  const dbPath = join(directoryPath, 'accounts.sqlite');
  let auth, directory, assessments;
  t.after(() => {
    auth?.close(); assessments?.close(); directory?.close();
    for (const suffix of ['', '-wal', '-shm']) if (existsSync(dbPath + suffix)) unlinkSync(dbPath + suffix);
    rmdirSync(directoryPath);
  });
  const credentials = await prepareLocalAccounts(dbPath);
  assert.deepEqual(credentials.map(item => item.role), ['candidate', 'employer', 'moderator']);
  auth = new AuthService(dbPath);
  directory = new DirectoryStore(dbPath);
  assessments = openStore(dbPath);
  const platform = new PlatformService(directory, assessments);
  const marketplace = new MarketplaceService(directory);
  const candidate = await auth.login({ loginOrEmail: 'local_candidate', password: localAccountPassword });
  const employer = await auth.login({ loginOrEmail: 'local_employer', password: localAccountPassword });
  assert.equal(candidate.role, 'candidate'); assert.equal(employer.role, 'employer');
  assert.notEqual(candidate.platform_owner, employer.platform_owner);
  const candidateState = platform.read(candidate.platform_owner);
  const employerState = platform.read(employer.platform_owner);
  assert(currentSurvey(candidateState.state));
  assert.equal(candidateState.state.profile.confirmed.grade, 'Junior');
  assert.equal(candidateState.state.history.length, 2, 'A passed result and an attempt whose practice waits for the test moderator');
  assert.equal(candidateState.state.history.filter(item => item.openStatus === 'queued' && item.passed).length, 1);
  assert.ok(candidateState.state.history.every(item => assessments.get(item.id).owner === candidate.platform_owner));
  assert.equal(candidateState.state.invitations.length, 1);
  assert.equal(candidateState.state.invitations[0].status, 'sent');
  assert.equal(employerState.state.profile.consent, false);
  assert.equal(employerState.state.surveys.length, 0);
  const proposal = marketplace.vacancies(employer.platform_owner, { own: true }).items;
  assert.equal(proposal.length, 2, 'Frontend and Backend vacancies of the test company');
  assert(proposal.every(item => item.company === 'Тестовая компания'));
  assert.equal(employerState.state.hiringNeeds.length, 2, 'The test employer starts with two hiring needs');
  assert.equal(candidateState.state.profile.stack.length >= 3, true);
  assert.match(candidateState.state.profile.workHistory, /Учебная продуктовая команда/u);
  assert.ok(candidateState.state.profile.workExperiences.some(entry => /личный кабинет клиента/u.test(entry.tasks)), 'Legacy fixture experience is migrated to editable blocks');
  assert.deepEqual(candidateState.state.profile.achievementItems, ['Финалист командного хакатона по продуктовому программированию.']);

  candidateState.state.profile.bio = 'Изменённый тестовый профиль';
  candidateState.state.invitations[0].status = 'accepted';
  platform.save(candidate.platform_owner, candidateState.state, candidateState.revision, 'candidate');
  const savedCandidate = platform.read(candidate.platform_owner);
  const savedEmployer = platform.read(employer.platform_owner);
  await prepareLocalAccounts(dbPath);
  assert.deepEqual(platform.read(candidate.platform_owner), savedCandidate);
  assert.deepEqual(platform.read(employer.platform_owner), savedEmployer);
  assert.deepEqual(marketplace.vacancies(employer.platform_owner, { own: true }).items, proposal);
  assert.equal(auth.store.db.prepare('SELECT COUNT(*) AS n FROM auth_accounts').get().n, 3);
  const moderator = auth.store.accountByIdentifier('local_moderator');
  assert.equal(moderator.role, 'moderator'); assert.equal(moderator.company_name, '');
  assert.equal(auth.store.canModerate(moderator.id), true);
  assert.equal(platform.read(moderator.platform_owner).state, null, 'The moderator has no cabinet state');
});

test('local account setup replaces the former employer-moderator with a separate moderator account', async t => {
  const directoryPath = mkdtempSync(join(tmpdir(), 'predel-local-legacy-'));
  const dbPath = join(directoryPath, 'accounts.sqlite');
  const codes = new Map();
  let auth = new AuthService(dbPath, { mailer: async ({ email, code }) => { codes.set(email, code); } }), directory, assessments;
  t.after(() => {
    auth?.close(); assessments?.close(); directory?.close();
    for (const suffix of ['', '-wal', '-shm']) if (existsSync(dbPath + suffix)) unlinkSync(dbPath + suffix);
    rmdirSync(directoryPath);
  });
  // Earlier setups registered the test moderator as an employer with a company cabinet.
  await auth.requestRegistration({ role: 'employer', login: 'local_moderator', email: 'moderator@local.example.test', companyName: 'Экспертная проверка',
    password: localAccountPassword, consent: true, privacyVersion: PRIVACY_POLICY_VERSION }, 'f'.repeat(64));
  const legacy = auth.verifyRegistration({ email: 'moderator@local.example.test', code: codes.get('moderator@local.example.test') });
  directory = new DirectoryStore(dbPath); assessments = openStore(dbPath);
  const platform = new PlatformService(directory, assessments);
  const state = createInitialState(); state.company.name = 'Экспертная проверка';
  platform.save(legacy.platform_owner, state, 0, 'employer');
  auth.close(); auth = null;

  await prepareLocalAccounts(dbPath);
  auth = new AuthService(dbPath);
  const moderator = auth.store.accountByIdentifier('local_moderator');
  assert.equal(moderator.role, 'moderator'); assert.notEqual(moderator.id, legacy.id);
  assert.equal(auth.store.canModerate(moderator.id), true);
  assert.equal(platform.read(legacy.platform_owner).state, null, 'The old employer cabinet is removed');
  assert.equal((await auth.login({ loginOrEmail: 'local_moderator', password: localAccountPassword })).id, moderator.id);
  await prepareLocalAccounts(dbPath);
  assert.equal(auth.store.accountByIdentifier('local_moderator').id, moderator.id, 'A rerun keeps the moderator account');
});
