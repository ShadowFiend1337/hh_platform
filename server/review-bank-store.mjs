// Deliberately separate from ItemBank: these drafts cannot be selected for certification.
import { reviewQuestions, reviewSources, validateReviewBank } from './review-bank.mjs';
import { closedReviewCases, closedReviewVersion, validateClosedReviewBank } from './closed-review-bank.mjs';

export class ReviewBankStore {
  constructor(db) {
    this.db = db;
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS review_bank_sources (
        id TEXT NOT NULL, version TEXT NOT NULL, url TEXT NOT NULL CHECK(url LIKE 'https://%'),
        title TEXT NOT NULL, publisher TEXT NOT NULL, kind TEXT NOT NULL,
        verification TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)),
        PRIMARY KEY(id,version)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS review_bank_entries (
        id TEXT NOT NULL, version TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('open','closed-case','single-choice')),
        parent_id TEXT, paired_open_id TEXT,
        competency_id TEXT NOT NULL, grade TEXT NOT NULL CHECK(grade IN ('Intern','Junior','Middle','Senior','Lead')),
        source_url TEXT NOT NULL CHECK(source_url LIKE 'https://%'),
        status TEXT NOT NULL DEFAULT 'pending-user-review' CHECK(status='pending-user-review'),
        active INTEGER NOT NULL DEFAULT 0 CHECK(active=0),
        payload TEXT NOT NULL CHECK(json_valid(payload)),
        PRIMARY KEY(id,version),
        FOREIGN KEY(parent_id,version) REFERENCES review_bank_entries(id,version),
        FOREIGN KEY(paired_open_id,version) REFERENCES review_bank_entries(id,version)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS review_bank_grade ON review_bank_entries(version,kind,grade,competency_id);
      CREATE TABLE IF NOT EXISTS review_bank_entry_sources (
        entry_id TEXT NOT NULL, version TEXT NOT NULL, source_id TEXT NOT NULL,
        url TEXT NOT NULL CHECK(url LIKE 'https://%'), relationship TEXT NOT NULL,
        locator TEXT NOT NULL, PRIMARY KEY(entry_id,version,source_id),
        FOREIGN KEY(entry_id,version) REFERENCES review_bank_entries(id,version),
        FOREIGN KEY(source_id,version) REFERENCES review_bank_sources(id,version)
      ) STRICT;
    `);
  }

  import({ open = reviewQuestions, closed = closedReviewCases, sources = reviewSources,
    version = closedReviewVersion } = {}) {
    const errors = [...validateReviewBank(open,sources), ...validateClosedReviewBank(closed,open,sources)];
    if (errors.length) throw new Error('Cannot import invalid review bank:\n' + errors.join('\n'));
    if (typeof version !== 'string' || !version.trim()) throw new TypeError('Version required');
    const sourceInsert = this.db.prepare(`INSERT INTO review_bank_sources VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(id,version) DO UPDATE SET url=excluded.url,title=excluded.title,
      publisher=excluded.publisher,kind=excluded.kind,verification=excluded.verification,payload=excluded.payload`);
    const entryInsert = this.db.prepare(`INSERT INTO review_bank_entries
      (id,version,kind,parent_id,paired_open_id,competency_id,grade,source_url,payload)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id,version) DO UPDATE SET kind=excluded.kind,
      parent_id=excluded.parent_id,paired_open_id=excluded.paired_open_id,
      competency_id=excluded.competency_id,grade=excluded.grade,source_url=excluded.source_url,payload=excluded.payload`);
    const sourceDelete = this.db.prepare('DELETE FROM review_bank_entry_sources WHERE entry_id=? AND version=?');
    const refInsert = this.db.prepare('INSERT INTO review_bank_entry_sources VALUES(?,?,?,?,?,?)');
    const put = (item,kind,parent=null,pair=null,owner=item) => {
      entryInsert.run(item.id,version,kind,parent,pair,owner.competencyId,owner.grade,item.sourceUrl,JSON.stringify(item));
      sourceDelete.run(item.id,version);
      for (const ref of item.sourceRefs) refInsert.run(item.id,version,ref.sourceId,ref.url,ref.relationship,ref.locator);
    };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const source of sources) sourceInsert.run(source.id,version,source.url,source.title,source.publisher,
        source.kind,source.verification,JSON.stringify(source));
      for (const item of open) put(item,'open');
      for (const item of closed) {
        put(item,'closed-case',null,item.pairedOpenId);
        for (const question of item.questions) put(question,'single-choice',item.id,null,item);
      }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return this.stats(version);
  }

  stats(version = closedReviewVersion) {
    return { version, byKind: Object.fromEntries(this.db.prepare(
      'SELECT kind,count(*) AS n FROM review_bank_entries WHERE version=? GROUP BY kind').all(version).map(r => [r.kind,r.n])),
      sources: this.db.prepare('SELECT count(*) AS n FROM review_bank_sources WHERE version=?').get(version).n,
      entriesWithoutSources: this.db.prepare(`SELECT count(*) AS n FROM review_bank_entries e WHERE e.version=?
        AND NOT EXISTS(SELECT 1 FROM review_bank_entry_sources r WHERE r.entry_id=e.id AND r.version=e.version)`).get(version).n,
      active: this.db.prepare('SELECT count(*) AS n FROM review_bank_entries WHERE version=? AND active<>0').get(version).n };
  }

  /** Private author storage; never return payload/keys in a candidate endpoint. */
  get(id, version = closedReviewVersion) {
    const row = this.db.prepare('SELECT * FROM review_bank_entries WHERE id=? AND version=?').get(id,version);
    return row ? { ...row, payload: JSON.parse(row.payload), sources: this.db.prepare(
      'SELECT source_id,url,relationship,locator FROM review_bank_entry_sources WHERE entry_id=? AND version=? ORDER BY source_id').all(id,version) } : null;
  }
}
