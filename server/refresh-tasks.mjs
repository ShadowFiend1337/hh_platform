import { randomUUID } from 'node:crypto';
import { RequestError } from './assessment.mjs';

const day = 86400000;
const ownCandidateId = 'candidate-anna';
const fail = message => { throw new RequestError(400, message); };
function object(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !fields.includes(key))) fail('Некорректные поля задания.');
  return value;
}
function text(value, maximum, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > maximum || required && !value.trim()) fail('Проверьте текст и длину полей задания.');
  return value.trim();
}

/** Employer-reviewed activity is separate from the server assessment and never changes its grade. */
export class RefreshTaskService {
  constructor(store, { now = Date.now, accountForOwner = () => null } = {}) {
    this.store = store; this.now = now; this.accountForOwner = accountForOwner;
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS refresh_task_series (
        id TEXT PRIMARY KEY,
        employer_owner TEXT NOT NULL REFERENCES platform_accounts(owner) ON DELETE CASCADE,
        candidate_owner TEXT NOT NULL REFERENCES platform_accounts(owner) ON DELETE CASCADE,
        candidate_id TEXT NOT NULL REFERENCES directory_candidates(id) ON DELETE CASCADE,
        title TEXT NOT NULL CHECK(length(title)>0 AND length(title)<=200),
        description TEXT NOT NULL CHECK(length(description)>0 AND length(description)<=4000),
        recurrence_days INTEGER NOT NULL CHECK(recurrence_days IN (0,7,30,90)),
        answer_window_ms INTEGER NOT NULL CHECK(answer_window_ms>0 AND answer_window_ms<=7776000000),
        created_at TEXT NOT NULL, stopped_at TEXT
      ) STRICT;
      CREATE INDEX IF NOT EXISTS refresh_series_employer ON refresh_task_series(employer_owner,created_at DESC);
      CREATE INDEX IF NOT EXISTS refresh_series_candidate ON refresh_task_series(candidate_owner,created_at DESC);
      CREATE INDEX IF NOT EXISTS refresh_series_profile ON refresh_task_series(candidate_id);
      CREATE TABLE IF NOT EXISTS refresh_tasks (
        id TEXT PRIMARY KEY, series_id TEXT NOT NULL REFERENCES refresh_task_series(id) ON DELETE CASCADE,
        cycle INTEGER NOT NULL CHECK(cycle>0), available_at TEXT NOT NULL, due_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('assigned','submitted','approved','rejected','cancelled')),
        answer TEXT NOT NULL DEFAULT '' CHECK(length(answer)<=6000), answered_at TEXT,
        feedback TEXT NOT NULL DEFAULT '' CHECK(length(feedback)<=2000), reviewed_at TEXT,
        created_at TEXT NOT NULL, UNIQUE(series_id,cycle), CHECK(due_at>available_at)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS refresh_task_due ON refresh_tasks(series_id,status,due_at);
      CREATE INDEX IF NOT EXISTS refresh_task_review ON refresh_tasks(status,reviewed_at DESC);
    `);
  }
  actor(owner, role) {
    if (typeof owner !== 'string' || !owner || owner.length > 200) throw new RequestError(401, 'Войдите в аккаунт.');
    const signedIn = this.accountForOwner(owner);
    if (!signedIn) throw new RequestError(401, 'Войдите в аккаунт для работы с заданиями.');
    if (role && signedIn.role !== role || !['candidate', 'employer'].includes(signedIn.role)) {
      throw new RequestError(403, 'Задания для этой роли недоступны.');
    }
    const account = this.store.db.prepare('SELECT * FROM platform_accounts WHERE owner=?').get(owner);
    if (!account) throw new RequestError(409, 'Сначала сохраните профиль или данные компании.');
    return { ...account, role: signedIn.role };
  }
  candidate(candidateId, employer) {
    const row = this.store.get(candidateId);
    if (!row?.owner || row.synthetic || this.accountForOwner(row.owner)?.role !== 'candidate') {
      throw new RequestError(404, 'Кандидат недоступен для задания.');
    }
    const account = this.store.db.prepare('SELECT profile FROM platform_accounts WHERE owner=?').get(row.owner);
    const profile = account ? JSON.parse(account.profile) : null;
    if (!profile?.consent) throw new RequestError(403, 'Для задания требуется действующее согласие кандидата.');
    if (employer) {
      const accepted = this.store.db.prepare(`SELECT 1 FROM platform_invitations
        WHERE sender=? AND candidate_id=? AND status='accepted' LIMIT 1`).get(employer, candidateId);
      const applied = this.store.db.prepare(`SELECT 1 FROM marketplace_applications a JOIN marketplace_companies c ON c.id=a.company_id
        WHERE c.owner=? AND a.candidate_id=? LIMIT 1`).get(employer, candidateId);
      if (!accepted && !applied) throw new RequestError(403, 'Задание доступно после отклика или принятия приглашения вашей компании.');
    }
    return { row, profile };
  }
  row(id) {
    return this.store.db.prepare(`SELECT t.*,s.employer_owner,s.candidate_owner,s.candidate_id,s.title,s.description,
      s.recurrence_days,s.answer_window_ms,s.stopped_at FROM refresh_tasks t JOIN refresh_task_series s ON s.id=t.series_id WHERE t.id=?`)
      .get(text(id, 100, true));
  }
  status(row, time = this.now()) {
    if (row.status !== 'assigned') return row.status;
    if (time >= Date.parse(row.due_at)) return 'overdue';
    if (time < Date.parse(row.available_at)) return 'scheduled';
    return 'assigned';
  }
  dto(row, owner) {
    const person = this.store.db.prepare('SELECT profile FROM platform_accounts WHERE owner=?').get(row.candidate_owner);
    const company = this.store.db.prepare('SELECT company FROM platform_accounts WHERE owner=?').get(row.employer_owner);
    return { id: row.id, seriesId: row.series_id, cycle: row.cycle,
      candidateId: owner === row.candidate_owner ? ownCandidateId : row.candidate_id,
      candidate: { id: owner === row.candidate_owner ? ownCandidateId : row.candidate_id, name: person ? JSON.parse(person.profile).name : '' },
      company: company ? JSON.parse(company.company).name : '', title: row.title, description: row.description,
      recurrenceDays: row.recurrence_days, availableAt: row.available_at, dueAt: row.due_at,
      status: this.status(row), answer: row.answer, answeredAt: row.answered_at,
      feedback: row.feedback, reviewedAt: row.reviewed_at, date: row.created_at,
      source: 'employer_review' };
  }
  bump(owners, time) {
    const update = this.store.db.prepare('UPDATE platform_accounts SET revision=revision+1,updated_at=? WHERE owner=?');
    for (const owner of new Set(owners)) update.run(new Date(time).toISOString(), owner);
  }
  insert(seriesId, cycle, available, due, created) {
    const id = `task-${randomUUID()}`;
    this.store.db.prepare(`INSERT INTO refresh_tasks(id,series_id,cycle,available_at,due_at,status,created_at)
      VALUES(?,?,?,?,?,'assigned',?)`).run(id, seriesId, cycle, new Date(available).toISOString(), new Date(due).toISOString(), new Date(created).toISOString());
    return this.row(id);
  }
  assign(owner, input) {
    this.actor(owner, 'employer');
    const value = object(input, ['candidateId', 'title', 'description', 'dueAt', 'recurrenceDays']);
    const candidateId = text(value.candidateId, 100, true), title = text(value.title, 200, true), description = text(value.description, 4000, true);
    const recurrenceDays = value.recurrenceDays ?? 0;
    if (![0, 7, 30, 90].includes(recurrenceDays)) fail('Повторять задание можно через 7, 30 или 90 дней.');
    const time = this.now();
    const due = value.dueAt === undefined ? time + 7 * day : typeof value.dueAt === 'string' ? Date.parse(value.dueAt) : NaN;
    if (!Number.isFinite(due) || due < time + 15 * 60000 || due > time + 90 * day) fail('Срок задания: от 15 минут до 90 дней с момента назначения.');
    return this.store.transaction(() => {
      const { row } = this.candidate(candidateId, owner);
      if (row.owner === owner) throw new RequestError(403, 'Нельзя назначить задание себе.');
      const count = this.store.db.prepare('SELECT COUNT(*) AS n FROM refresh_task_series WHERE employer_owner=? AND stopped_at IS NULL').get(owner).n;
      if (count >= 1000) fail('Допустимо до 1000 действующих заданий компании.');
      const seriesId = `task-series-${randomUUID()}`;
      this.store.db.prepare('INSERT INTO refresh_task_series VALUES(?,?,?,?,?,?,?,?,?,NULL)')
        .run(seriesId, owner, row.owner, row.id, title, description, recurrenceDays, due - time, new Date(time).toISOString());
      const task = this.insert(seriesId, 1, time, due, time);
      this.bump([owner, row.owner], time);
      return this.dto(task, owner);
    });
  }
  list(owner, role, { offset = 0, limit = 30 } = {}) {
    const account = this.actor(owner, role);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail('Проверьте страницу заданий.');
    const side = account.role === 'employer' ? 'employer_owner' : 'candidate_owner';
    const rows = this.store.db.prepare(`SELECT t.*,s.employer_owner,s.candidate_owner,s.candidate_id,s.title,s.description,
      s.recurrence_days,s.answer_window_ms,s.stopped_at FROM refresh_tasks t JOIN refresh_task_series s ON s.id=t.series_id
      WHERE s.${side}=? ORDER BY t.created_at DESC,t.cycle DESC,t.id`).all(owner)
      .filter(row => {
        if (this.accountForOwner(row.employer_owner)?.role !== 'employer' || this.accountForOwner(row.candidate_owner)?.role !== 'candidate') return false;
        if (account.role === 'candidate') return true;
        const profile = this.store.db.prepare('SELECT profile FROM platform_accounts WHERE owner=?').get(row.candidate_owner);
        return profile && JSON.parse(profile.profile).consent === true;
      });
    const page = rows.slice(offset, offset + limit);
    return { items: page.map(row => this.dto(row, owner)), total: rows.length, offset, limit,
      nextOffset: offset + page.length < rows.length ? offset + page.length : null,
      freshness: account.role === 'candidate' ? this.freshnessFor(account.public_id) : null };
  }
  answer(owner, id, input) {
    this.actor(owner, 'candidate');
    const value = object(input, ['answer']), answer = text(value.answer, 6000, true);
    return this.store.transaction(() => {
      const row = this.row(id);
      if (!row || row.candidate_owner !== owner || this.accountForOwner(row.employer_owner)?.role !== 'employer') throw new RequestError(404, 'Задание не найдено.');
      this.candidate(row.candidate_id, row.employer_owner);
      if (row.status !== 'assigned') {
        if (row.answer === answer && ['submitted', 'approved', 'rejected'].includes(row.status)) return this.dto(row, owner);
        throw new RequestError(409, 'Ответ уже отправлен или задание закрыто.');
      }
      const time = this.now(), status = this.status(row, time);
      if (status === 'scheduled') throw new RequestError(409, 'Время следующего задания ещё не наступило.');
      if (status === 'overdue') throw new RequestError(410, 'Срок задания истёк.');
      this.store.db.prepare(`UPDATE refresh_tasks SET answer=?,answered_at=?,status='submitted' WHERE id=?`)
        .run(answer, new Date(time).toISOString(), row.id);
      this.bump([owner, row.employer_owner], time);
      return this.dto(this.row(row.id), owner);
    });
  }
  review(owner, id, input) {
    this.actor(owner, 'employer');
    const value = object(input, ['status', 'feedback']), feedback = text(value.feedback, 2000);
    if (!['approved', 'rejected', 'cancelled'].includes(value.status)) fail('Выберите результат проверки задания.');
    return this.store.transaction(() => {
      const row = this.row(id);
      if (!row || row.employer_owner !== owner) throw new RequestError(404, 'Задание не найдено.');
      this.candidate(row.candidate_id, owner);
      if (row.status === value.status && row.feedback === feedback) {
        const next = this.store.db.prepare('SELECT id FROM refresh_tasks WHERE series_id=? AND cycle=?').get(row.series_id, row.cycle + 1);
        return { task: this.dto(row, owner), nextTask: next ? this.dto(this.row(next.id), owner) : null };
      }
      if (value.status === 'cancelled' ? !['assigned', 'submitted'].includes(row.status) : row.status !== 'submitted') {
        throw new RequestError(409, 'Задание уже проверено или ещё не содержит ответа.');
      }
      const time = this.now(), reviewed = new Date(time).toISOString();
      this.store.db.prepare('UPDATE refresh_tasks SET status=?,feedback=?,reviewed_at=? WHERE id=?').run(value.status, feedback, reviewed, row.id);
      let next = null;
      if (value.status === 'approved' && row.recurrence_days && !row.stopped_at) {
        const available = time + row.recurrence_days * day;
        next = this.insert(row.series_id, row.cycle + 1, available, available + row.answer_window_ms, time);
      } else this.store.db.prepare('UPDATE refresh_task_series SET stopped_at=? WHERE id=?').run(reviewed, row.series_id);
      this.bump([owner, row.candidate_owner], time);
      return { task: this.dto(this.row(row.id), owner), nextTask: next ? this.dto(next, owner) : null };
    });
  }
  freshnessFor(candidateId) {
    const candidate = this.store.get(candidateId);
    if (!candidate?.owner || candidate.synthetic || !candidate.consent || this.accountForOwner(candidate.owner)?.role !== 'candidate') return null;
    const rows = this.store.db.prepare(`SELECT t.reviewed_at,s.employer_owner FROM refresh_tasks t
      JOIN refresh_task_series s ON s.id=t.series_id WHERE s.candidate_id=? AND t.status='approved' ORDER BY t.reviewed_at DESC,t.id`).all(candidateId);
    const latest = rows.find(row => this.accountForOwner(row.employer_owner)?.role === 'employer');
    return latest ? { lastCompletedAt: latest.reviewed_at, source: 'employer_review' } : null;
  }
}
