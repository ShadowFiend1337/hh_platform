import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { timeout: 5000 });
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, token_hash TEXT NOT NULL,
      specialization TEXT NOT NULL, grade TEXT NOT NULL, created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL, payload TEXT NOT NULL, answer_digest TEXT, result TEXT
    ) STRICT;
    CREATE INDEX IF NOT EXISTS attempts_owner ON attempts(owner, specialization, grade, created_at DESC);
  `);
  return {
    insert(attempt, owner, tokenHash) {
      db.prepare('INSERT INTO attempts (id, owner, token_hash, specialization, grade, created_at, expires_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(attempt.id, owner, tokenHash, attempt.specialization, attempt.grade, attempt.createdAt, attempt.expiresAt, JSON.stringify(attempt));
    },
    get(id) {
      const row = db.prepare('SELECT * FROM attempts WHERE id = ?').get(id);
      return row ? { ...row, attempt: JSON.parse(row.payload), result: row.result ? JSON.parse(row.result) : null } : null;
    },
    recent(owner, specialization, grade) {
      return db.prepare('SELECT payload FROM attempts WHERE owner = ? AND specialization = ? AND grade = ? ORDER BY created_at DESC, rowid DESC LIMIT 2')
        .all(owner, specialization, grade).map(row => JSON.parse(row.payload));
    },
    countSince(owner, date) {
      return db.prepare('SELECT COUNT(*) AS count FROM attempts WHERE owner = ? AND created_at >= ?').get(owner, date).count;
    },
    complete(id, digest, result) {
      const update = db.prepare('UPDATE attempts SET answer_digest = ?, result = ? WHERE id = ? AND result IS NULL').run(digest, JSON.stringify(result), id);
      return update.changes === 1;
    },
    close() { db.close(); },
  };
}
