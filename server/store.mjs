import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { integrityKinds, strikeKinds } from './assessment.mjs';

const kindList = integrityKinds.map(kind => `'${kind}'`).join(', ');
const strikeList = strikeKinds.map(kind => `'${kind}'`).join(', ');

export function openStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { timeout: 5000 });
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, token_hash TEXT NOT NULL,
      specialization TEXT NOT NULL, grade TEXT NOT NULL, created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL, payload TEXT NOT NULL, answer_digest TEXT, result TEXT
    ) STRICT;
    CREATE INDEX IF NOT EXISTS attempts_owner ON attempts(owner, specialization, grade, created_at DESC);
  `);
  if (!db.prepare('PRAGMA table_info(attempts)').all().some(column => column.name === 'progress')) {
    db.exec('ALTER TABLE attempts ADD COLUMN progress TEXT');
  }
  // The event kinds grew with full-screen and shortcut controls; a CHECK cannot be
  // altered in SQLite, so an older table is copied into the current definition.
  const existing = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='attempt_integrity_events'").get();
  if (existing && !existing.sql.includes('fullscreen_exit')) {
    db.exec(`ALTER TABLE attempt_integrity_events RENAME TO attempt_integrity_events_legacy;`);
  }
  db.exec(`CREATE TABLE IF NOT EXISTS attempt_integrity_events (
      attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
      event_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN (${kindList})),
      received_at TEXT NOT NULL, PRIMARY KEY (attempt_id, event_id)
    ) STRICT;`);
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='attempt_integrity_events_legacy'").get()) {
    db.exec(`INSERT OR IGNORE INTO attempt_integrity_events SELECT * FROM attempt_integrity_events_legacy;
      DROP TABLE attempt_integrity_events_legacy;`);
  }
  return {
    db,
    insert(attempt, owner, tokenHash) {
      db.prepare('INSERT INTO attempts (id, owner, token_hash, specialization, grade, created_at, expires_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(attempt.id, owner, tokenHash, attempt.specialization, attempt.grade, attempt.createdAt, attempt.expiresAt, JSON.stringify(attempt));
    },
    get(id) {
      const row = db.prepare('SELECT * FROM attempts WHERE id = ?').get(id);
      return row ? { ...row, attempt: JSON.parse(row.payload), result: row.result ? JSON.parse(row.result) : null,
        progress: row.progress ? JSON.parse(row.progress) : null } : null;
    },
    completed(owner) {
      return db.prepare(`SELECT id,owner,specialization,grade,created_at,result,json_extract(payload,'$.surveyId') AS survey_id
        FROM attempts WHERE owner = ? AND result IS NOT NULL ORDER BY created_at DESC, rowid DESC LIMIT 500`)
        .all(owner).map(row => ({ ...row, attempt: { id: row.id, specialization: row.specialization, grade: row.grade, surveyId: row.survey_id }, result: JSON.parse(row.result) }));
    },
    deleteOwner(owner) { return db.prepare('DELETE FROM attempts WHERE owner = ?').run(owner).changes; },
    /** Previous attempts of the owner for item exclusion: same program first, then any other program. */
    recent(owner, specialization, grade, limit = 6) {
      return db.prepare(`SELECT payload FROM attempts WHERE owner = ? ORDER BY (specialization = ? AND grade = ?) DESC, created_at DESC, rowid DESC LIMIT ?`)
        .all(owner, specialization, grade, limit).map(row => JSON.parse(row.payload));
    },
    activeAttempt(owner, nowText) {
      return db.prepare('SELECT id FROM attempts WHERE owner = ? AND result IS NULL AND expires_at > ? LIMIT 1').get(owner, nowText) || null;
    },
    countSince(owner, date) {
      return db.prepare('SELECT COUNT(*) AS count FROM attempts WHERE owner = ? AND created_at >= ?').get(owner, date).count;
    },
    saveProgress(id, progress, expected) {
      return db.prepare('UPDATE attempts SET progress = ? WHERE id = ? AND result IS NULL AND COALESCE(progress, \'\') = ?')
        .run(JSON.stringify(progress), id, expected ? JSON.stringify(expected) : '').changes === 1;
    },
    integrity(id) {
      const row = db.prepare(`SELECT
        COALESCE(SUM(kind IN (${strikeList})), 0) AS departures,
        COALESCE(SUM(kind = 'copy_blocked'), 0) AS blockedCopies,
        COALESCE(SUM(kind IN ('paste_blocked', 'shortcut_blocked', 'screenshot_key')), 0) AS blockedActions,
        COALESCE(SUM(kind = 'fullscreen_exit'), 0) AS fullscreenExits,
        MAX(received_at) AS lastEventAt FROM attempt_integrity_events WHERE attempt_id = ?`).get(id);
      return { ...row };
    },
    recordIntegrity(id, event, receivedAt) {
      const existing = db.prepare('SELECT kind FROM attempt_integrity_events WHERE attempt_id = ? AND event_id = ?').get(id, event.id);
      if (existing) return existing.kind === event.kind ? 'duplicate' : 'conflict';
      // Bound retained telemetry without changing the candidate's answers.
      const written = db.prepare(`INSERT INTO attempt_integrity_events (attempt_id, event_id, kind, received_at)
        SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM attempt_integrity_events WHERE attempt_id = ?) < 128
        ON CONFLICT(attempt_id, event_id) DO NOTHING`).run(id, event.id, event.kind, receivedAt, id);
      return written.changes ? 'inserted' : 'limit';
    },
    complete(id, digest, result) {
      const update = db.prepare('UPDATE attempts SET answer_digest = ?, result = ? WHERE id = ? AND result IS NULL').run(digest, JSON.stringify(result), id);
      return update.changes === 1;
    },
    close() { db.close(); },
  };
}
