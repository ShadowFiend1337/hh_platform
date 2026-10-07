import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../frontend/src/model.ts';
import { DirectoryStore } from '../directory-store.mjs';
import { openStore } from '../store.mjs';
import { PlatformService } from '../platform.mjs';
import { MarketplaceService } from '../marketplace.mjs';
import { RefreshTaskService } from '../refresh-tasks.mjs';

const employer = '1'.repeat(64), candidate = '2'.repeat(64), otherEmployer = '3'.repeat(64), otherCandidate = '4'.repeat(64), guest = '5'.repeat(64);
const day = 86400000, start = Date.parse('2026-10-07T09:00:00.000Z');
const throws = status => error => error.status === status;
function fixture(t) {
  const store = new DirectoryStore(':memory:'), assessments = openStore(':memory:');
  const accounts = new Map([[employer, { role: 'employer' }], [candidate, { role: 'candidate' }],
    [otherEmployer, { role: 'employer' }], [otherCandidate, { role: 'candidate' }]]);
  let clock = start;
  const options = { now: () => clock, accountForOwner: owner => accounts.get(owner) || null };
  const platform = new PlatformService(store, assessments, options), marketplace = new MarketplaceService(store, { ...options, seeds: false });
  const tasks = new RefreshTaskService(store, options);
  for (const owner of [employer, candidate, otherEmployer, otherCandidate]) {
    const state = createInitialState();
    state.company.name = 'Вымышленная компания'; state.company.contact = 'company@example.test';
    if (accounts.get(owner)?.role === 'candidate') {
      Object.assign(state.profile, { name: owner === candidate ? 'Вымышленный кандидат' : 'Другой вымышленный кандидат',
        email: 'private@example.test', consent: true, visible: false, bio: 'Разрабатываю формы и API.' });
    }
    platform.save(owner, state, 0);
  }
  const personId = store.forOwner(candidate).id;
  function connect() {
    const vacancy = marketplace.publish(employer, { title: 'Разработка форм', description: 'Создавать доступные интерфейсы.',
      specialization: 'Frontend', grade: 'Junior', city: 'Москва', format: 'Удалённо', stack: ['React'], salaryFrom: 100000, salaryTo: 150000 });
    return marketplace.apply(candidate, vacancy.id, {});
  }
  const input = extra => ({ candidateId: personId, title: 'Обновить подход к формам', description: 'Кратко опишите, как проверить доступность новой формы.', ...extra });
  t.after(() => { assessments.close(); store.close(); });
  return { store, assessments, platform, marketplace, tasks, accounts, personId, connect, input, advance: milliseconds => { clock += milliseconds; }, time: () => clock };
}

test('refresh tasks require authenticated role and an accepted invitation or an application to that employer', t => {
  const f = fixture(t);
  assert.throws(() => f.tasks.assign(guest, f.input()), throws(401));
  assert.throws(() => f.tasks.list(guest, 'employer'), throws(401));
  assert.throws(() => f.tasks.assign(candidate, f.input()), throws(403));
  assert.throws(() => f.tasks.list(candidate, 'employer'), throws(403));
  assert.throws(() => f.tasks.assign(employer, f.input()), throws(403));
  f.connect();
  const task = f.tasks.assign(employer, f.input());
  assert.equal(task.candidateId, f.personId); assert.equal(task.source, 'employer_review');
  assert.throws(() => f.tasks.assign(otherEmployer, f.input()), throws(403));
  assert.equal(f.tasks.list(employer, 'employer').total, 1);
  assert.equal(f.tasks.list(otherEmployer, 'employer').total, 0);
  assert.equal(f.tasks.list(otherCandidate, 'candidate').total, 0);
  const received = f.tasks.list(candidate, 'candidate').items[0];
  assert.equal(received.candidateId, 'candidate-anna'); assert.equal(received.candidate.name, 'Вымышленный кандидат');
  assert(!JSON.stringify(received).includes('private@example.test'));
});

test('accepted invitation alone permits a private candidate task without a published vacancy', t => {
  const f = fixture(t), date = new Date(start).toISOString();
  f.store.db.prepare('INSERT INTO platform_invitations VALUES(?,?,?,?,?,?)')
    .run('accepted-task-invitation', employer, f.personId, 'accepted', date, JSON.stringify({ title: 'Предложение', candidateId: f.personId }));
  assert.equal(f.tasks.assign(employer, f.input()).status, 'assigned');
});

test('a text response is immutable and owner-scoped; employer review records activity without changing the grade', t => {
  const f = fixture(t); f.connect();
  const profile = f.platform.read(candidate).state.profile, task = f.tasks.assign(employer, f.input());
  assert.throws(() => f.tasks.answer(employer, task.id, { answer: 'Ответ' }), throws(403));
  assert.throws(() => f.tasks.answer(otherCandidate, task.id, { answer: 'Ответ' }), throws(404));
  assert.throws(() => f.tasks.review(otherEmployer, task.id, { status: 'approved' }), throws(404));
  assert.throws(() => f.tasks.review(employer, task.id, { status: 'approved' }), throws(409));
  const answer = '<script>throw new Error("never execute")</script> Проверю клавиатуру и подписи полей.';
  const submitted = f.tasks.answer(candidate, task.id, { answer });
  assert.equal(submitted.status, 'submitted'); assert.equal(submitted.answer, answer);
  assert.deepEqual(f.tasks.answer(candidate, task.id, { answer }), submitted);
  assert.throws(() => f.tasks.answer(candidate, task.id, { answer: 'Подменённый ответ' }), throws(409));
  assert.equal(f.tasks.freshnessFor(f.personId), null);
  f.advance(60000);
  const reviewed = f.tasks.review(employer, task.id, { status: 'approved', feedback: 'Подход принят.' });
  assert.equal(reviewed.task.status, 'approved'); assert.equal(reviewed.nextTask, null);
  assert.deepEqual(f.tasks.review(employer, task.id, { status: 'approved', feedback: 'Подход принят.' }), reviewed);
  assert.throws(() => f.tasks.review(employer, task.id, { status: 'rejected' }), throws(409));
  assert.throws(() => f.tasks.review(employer, task.id, { status: 'approved', feedback: 'Подменено' }), throws(409));
  assert.deepEqual(f.tasks.freshnessFor(f.personId), { lastCompletedAt: new Date(f.time()).toISOString(), source: 'employer_review' });
  assert.deepEqual(f.platform.read(candidate).state.profile, profile);
  assert.deepEqual(f.tasks.list(candidate).freshness, f.tasks.freshnessFor(f.personId));
});

test('recurring approval schedules exactly one future task and never marks a future response complete', t => {
  const f = fixture(t); f.connect();
  const task = f.tasks.assign(employer, f.input({ recurrenceDays: 7, dueAt: new Date(start + 2 * day).toISOString() }));
  f.tasks.answer(candidate, task.id, { answer: 'Проверю фокус и доступные подписи.' });
  const review = f.tasks.review(employer, task.id, { status: 'approved' });
  assert.equal(review.nextTask.status, 'scheduled'); assert.equal(review.nextTask.cycle, 2);
  assert.equal(review.nextTask.availableAt, new Date(start + 7 * day).toISOString());
  assert.equal(review.nextTask.dueAt, new Date(start + 9 * day).toISOString());
  assert.equal(review.nextTask.answer, ''); assert.equal(review.nextTask.reviewedAt, null);
  assert.throws(() => f.tasks.answer(candidate, review.nextTask.id, { answer: 'Слишком рано' }), throws(409));
  assert.equal(f.tasks.list(candidate).total, 2);
  f.tasks.review(employer, task.id, { status: 'approved' });
  assert.equal(f.tasks.list(candidate).total, 2, 'retry must not duplicate scheduled cycles');
  f.advance(7 * day);
  assert.equal(f.tasks.list(candidate).items.find(item => item.id === review.nextTask.id).status, 'assigned');
  f.tasks.answer(candidate, review.nextTask.id, { answer: 'Обновлённый ответ' });
  const second = f.tasks.review(employer, review.nextTask.id, { status: 'approved' });
  assert.equal(second.nextTask.cycle, 3);
  assert.equal(f.tasks.freshnessFor(f.personId).lastCompletedAt, new Date(f.time()).toISOString());
});

test('overdue, rejected and cancelled work do not count as refreshed competence', t => {
  const f = fixture(t); f.connect();
  const overdue = f.tasks.assign(employer, f.input({ dueAt: new Date(start + day).toISOString() }));
  f.advance(day);
  assert.equal(f.tasks.list(candidate).items[0].status, 'overdue');
  assert.throws(() => f.tasks.answer(candidate, overdue.id, { answer: 'Поздний ответ' }), throws(410));
  assert.equal(f.tasks.review(employer, overdue.id, { status: 'cancelled' }).task.status, 'cancelled');
  const rejected = f.tasks.assign(employer, f.input({ recurrenceDays: 30 }));
  f.tasks.answer(candidate, rejected.id, { answer: 'Вариант решения' });
  assert.equal(f.tasks.review(employer, rejected.id, { status: 'rejected', feedback: 'Проверьте работу клавиатуры.' }).nextTask, null);
  const cancelled = f.tasks.assign(employer, f.input({ recurrenceDays: 90 }));
  assert.equal(f.tasks.review(employer, cancelled.id, { status: 'cancelled' }).nextTask, null);
  assert.throws(() => f.tasks.answer(candidate, cancelled.id, { answer: 'Ответ на отменённое' }), throws(409));
  assert.equal(f.tasks.freshnessFor(f.personId), null);
});

test('consent withdrawal and account role changes immediately prevent further private task access', t => {
  const f = fixture(t); f.connect();
  const task = f.tasks.assign(employer, f.input());
  f.tasks.answer(candidate, task.id, { answer: 'Мой частный ответ' });
  const state = f.platform.read(candidate); state.state.profile.consent = false;
  f.platform.save(candidate, state.state, state.revision);
  assert.deepEqual(f.tasks.list(employer).items, []);
  assert.throws(() => f.tasks.assign(employer, f.input()), throws(403));
  assert.throws(() => f.tasks.review(employer, task.id, { status: 'approved' }), throws(403));
  assert.throws(() => f.tasks.answer(candidate, task.id, { answer: 'Мой частный ответ' }), throws(403));
  assert.equal(f.tasks.list(candidate).items[0].answer, 'Мой частный ответ', 'candidate retains their own private history');
  f.accounts.delete(candidate);
  assert.throws(() => f.tasks.list(candidate), throws(401));
  assert.equal(f.tasks.list(employer).total, 0);
});

test('assignment and response validation reject forged proof, grade, times and invalid text atomically', t => {
  const f = fixture(t); f.connect();
  for (const patch of [{ title: '' }, { description: 'x'.repeat(4001) }, { recurrenceDays: 1 }, { recurrenceDays: '7' },
    { dueAt: 'invalid' }, { dueAt: new Date(start - day).toISOString() }, { dueAt: new Date(start + 91 * day).toISOString() },
    { employerOwner: otherEmployer }, { confirmedGrade: 'Senior' }]) {
    assert.throws(() => f.tasks.assign(employer, f.input(patch)), throws(400));
  }
  assert.equal(f.tasks.list(employer).total, 0);
  const task = f.tasks.assign(employer, f.input());
  for (const input of [{ answer: '' }, { answer: 'x'.repeat(6001) }, { answer: 'Верный', score: 100 }, { answer: 'Верный', answeredAt: new Date(start).toISOString() }]) {
    assert.throws(() => f.tasks.answer(candidate, task.id, input), throws(400));
  }
  assert.throws(() => f.tasks.review(employer, task.id, { status: 'approved', score: 100 }), throws(400));
  assert.throws(() => f.tasks.review(employer, task.id, { status: 'approved', feedback: 'x'.repeat(2001) }), throws(400));
  assert.equal(f.tasks.list(candidate).items[0].status, 'assigned');
  assert.throws(() => f.tasks.list(candidate, 'candidate', { limit: 101 }), throws(400));
});

test('task indexes preserve complete owned pagination and FK deletion removes responses, series and freshness', t => {
  const f = fixture(t); f.connect();
  for (let index = 0; index < 4; index++) f.tasks.assign(employer, f.input({ title: `Короткое задание ${index}` }));
  const first = f.tasks.list(candidate, 'candidate', { limit: 2 }), second = f.tasks.list(candidate, 'candidate', { limit: 2, offset: first.nextOffset });
  assert.equal(first.total, 4); assert.equal(second.nextOffset, null);
  assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, 4);
  f.tasks.answer(candidate, first.items[0].id, { answer: 'Решение' });
  f.tasks.review(employer, first.items[0].id, { status: 'approved' });
  assert(f.tasks.freshnessFor(f.personId));
  f.platform.delete(candidate);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM refresh_tasks').get().n, 0);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM refresh_task_series').get().n, 0);
  assert.equal(f.tasks.freshnessFor(f.personId), null);
  assert.equal(f.tasks.list(employer).total, 0);
});
