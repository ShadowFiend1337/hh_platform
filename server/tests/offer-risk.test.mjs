import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../frontend/src/model.ts';
import { DirectoryStore } from '../directory-store.mjs';
import { openStore } from '../store.mjs';
import { PlatformService } from '../platform.mjs';
import { MarketplaceService } from '../marketplace.mjs';
import { createAttempt, evaluate } from '../assessment.mjs';
import { assessOfferRisk, OFFER_RISK_POLICY } from '../offer-risk.mjs';

const employer = '1'.repeat(64), candidate = '2'.repeat(64);
const start = Date.parse('2026-10-10T09:00:00.000Z');
const offer = (description, extra = {}) => ({ title: 'Frontend-разработчик', description, salaryFrom: 120000, salaryTo: 160000, grade: 'Junior', ...extra });
const codes = risk => risk.signals.map(signal => signal.code).sort();

test('fraud patterns block, softer signals warn, employer-paid benefits pass', () => {
  for (const text of ['Внесите предоплату за обучение 5000 рублей.', 'Перед стартом нужно оплатить курс.', 'Обучение за свой счёт, затем трудоустройство.',
    'Переведите депозит 3000 ₽ за доступ к проекту.', 'Пришлите номер карты и код из SMS для оформления.', 'Нужны паспортные данные до собеседования.']) {
    assert.equal(assessOfferRisk(offer(text)).level, 'block', text);
  }
  for (const text of ['Оплата обучения за счёт компании, ДМС.', 'Компания оплачивает курсы и конференции.', 'Мы оплачиваем доступ к курсам.',
    'Бесплатное обучение; вступительный взнос отсутствует.', 'Личный кабинет на React и TypeScript, доступные формы.']) {
    assert.equal(assessOfferRisk(offer(text)).level, 'ok', text);
  }
  assert.deepEqual(codes(assessOfferRisk(offer('Пишите в телеграм @hr или на hr@example.test'))), ['contacts-in-text', 'off-platform']);
  assert.deepEqual(codes(assessOfferRisk(offer('Пассивный доход без вложений', { grade: 'Intern', salaryFrom: 400000, salaryTo: 2000000 }))),
    ['easy-money', 'salary-anomaly', 'salary-range']);
});

function fixture(t) {
  const store = new DirectoryStore(':memory:'), assessments = openStore(':memory:');
  const accounts = new Map([[employer, { role: 'employer' }], [candidate, { role: 'candidate' }]]);
  const options = { now: () => start, accountForOwner: owner => accounts.get(owner) || null };
  const platform = new PlatformService(store, assessments, options), marketplace = new MarketplaceService(store, { ...options, seeds: false });
  t.after(() => { assessments.close(); store.close(); });
  const company = createInitialState();
  company.company.name = 'Вымышленная компания'; company.company.contact = 'company@example.test';
  platform.save(employer, company, 0, 'employer');
  // A published candidate with a server-confirmed grade can receive invitations.
  const survey = { id: 'risk-survey', date: new Date(start).toISOString(), industry: 'ИТ', professionalRole: 'Frontend-разработчик',
    specialization: 'Frontend', desiredGrade: 'Junior', experience: '1 год', stack: ['React'], softSkills: [] };
  const attempt = createAttempt(survey, '', [], start);
  assessments.insert(attempt, candidate, 'risk-token');
  const graded = evaluate(attempt, attempt.questions.map(question => ({ questionId: question.id, optionId: question.correctOptionId })), start + 1000);
  assessments.complete(attempt.id, graded.answerDigest, graded.result);
  const person = createInitialState();
  Object.assign(person.profile, survey, { id: 'candidate-anna', name: 'Вымышленный кандидат', email: 'person@example.test', consent: true, visible: true,
    surveyCompletedAt: survey.date, bio: 'Делаю формы.', confirmed: { specialization: 'Frontend', grade: graded.result.grade, score: graded.result.score,
      date: graded.result.date, surveyId: survey.id } });
  delete person.profile.date;
  person.surveys = [survey]; person.history = [graded.result];
  platform.save(candidate, person, 0, 'candidate');
  return { store, platform, marketplace, personId: store.forOwner(candidate).id };
}

test('vacancies: blocking patterns are rejected with reasons, warnings reach only the publisher', t => {
  const { marketplace } = fixture(t);
  const input = { title: 'Разработка форм', specialization: 'Frontend', grade: 'Junior', city: 'Москва', format: 'Удалённо',
    stack: ['React'], salaryFrom: 100000, salaryTo: 150000 };
  assert.throws(() => marketplace.publish(employer, { ...input, description: 'Стажировка после оплаты обучения: внесите взнос 5000 ₽.' }),
    error => error.status === 400 && /не опубликовано/u.test(error.message) && error.details.risk.level === 'block');
  assert.equal(marketplace.vacancies(employer, { own: true }).items.length, 0);
  const warned = marketplace.publish(employer, { ...input, description: 'Формы кабинета. Вопросы — в телеграм.' });
  assert.deepEqual(warned.risk.signals.map(signal => signal.code), ['off-platform']);
  assert.equal(marketplace.vacancy(candidate, warned.id).risk, undefined, 'Candidates never see the screening result');
  const clean = marketplace.publish(employer, { ...input, description: 'Формы личного кабинета, доступность, тесты.' });
  assert.equal(clean.risk, undefined);
  assert.throws(() => marketplace.edit(employer, clean.id, { ...input, description: 'Пришлите данные карты для зарплаты.' }), error => error.status === 400);
});

test('invitations: fraud text is rejected and mass sending is limited per day', t => {
  const { store, platform, personId } = fixture(t);
  const invite = (id, description) => ({ id, candidateId: personId, companyId: 'company-line', company: 'Вымышленная компания', title: 'Frontend-разработчик',
    description, contact: 'company@example.test', salaryFrom: 120000, salaryTo: 160000, status: 'sent', date: new Date(start).toISOString() });
  let state = platform.read(employer);
  state.state.invitations = [invite('invitation-fraud', 'Для оформления внесите залог за оборудование 10 000 ₽.')];
  assert.throws(() => platform.save(employer, state.state, state.revision, 'employer'), error => error.status === 400 && error.details.risk.level === 'block');
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM platform_invitations').get().n, 0);

  const insert = store.db.prepare('INSERT INTO platform_invitations VALUES(?,?,?,?,?,?)');
  for (let index = 0; index < OFFER_RISK_POLICY.invitationsPerDay; index++) {
    insert.run('invitation-earlier-' + index, employer, personId, 'sent', new Date(start - 3600000).toISOString(), JSON.stringify(invite('invitation-earlier-' + index, 'Формы.')));
  }
  state = platform.read(employer);
  state.state.invitations.push(invite('invitation-next', 'Разработка форм личного кабинета.'));
  assert.throws(() => platform.save(employer, state.state, state.revision, 'employer'), error => error.status === 429);
  store.db.prepare('UPDATE platform_invitations SET created_at=?').run(new Date(start - 2 * 86400000).toISOString());
  state = platform.read(employer);
  state.state.invitations.push(invite('invitation-next', 'Разработка форм личного кабинета.'));
  assert.equal(platform.save(employer, state.state, state.revision, 'employer').state.invitations.some(item => item.id === 'invitation-next'), true,
    'The window is a rolling day');
});
