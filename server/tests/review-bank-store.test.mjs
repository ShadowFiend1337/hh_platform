import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReviewBankStore } from '../review-bank-store.mjs';
import { reviewQuestions } from '../review-bank.mjs';
import { closedReviewCases,closedReviewVersion } from '../closed-review-bank.mjs';

test('idempotent import persists sources on open cases, closed cases and each question, surviving reopen',()=>{
  const dir=mkdtempSync(join(tmpdir(),'review-bank-')),path=join(dir,'bank.sqlite');
  let db=new DatabaseSync(path);
  try {
    let store=new ReviewBankStore(db);
    const expected=store.import();
    assert.deepEqual(expected.byKind,{ 'closed-case':165,open:165,'single-choice':330 });
    assert.equal(expected.entriesWithoutSources,0); assert.equal(expected.active,0);
    assert.deepEqual(store.import(),expected);
    db.close(); db=new DatabaseSync(path); store=new ReviewBankStore(db);
    assert.deepEqual(store.stats(),expected);
    for(const item of [...reviewQuestions,...closedReviewCases,...closedReviewCases.flatMap(c=>c.questions)]) {
      const row=store.get(item.id);
      assert.equal(row.source_url,item.sourceUrl);
      assert.equal(row.payload.sourceUrl,item.sourceUrl);
      assert.equal(row.sources.length,item.sourceRefs.length);
      for(const ref of item.sourceRefs) assert.ok(row.sources.some(s=>s.source_id===ref.sourceId&&s.url===ref.url));
    }
    assert.throws(()=>db.prepare('UPDATE review_bank_entries SET active=1 WHERE id=?').run(reviewQuestions[0].id),/CHECK/);
  } finally { db.close(); rmSync(dir,{recursive:true,force:true}); }
});

test('draft import leaves live bank and attempts intact and rollback is atomic',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    db.exec("CREATE TABLE bank_items(id TEXT PRIMARY KEY,payload TEXT); INSERT INTO bank_items VALUES('live','keep'); CREATE TABLE attempts(id TEXT PRIMARY KEY); INSERT INTO attempts VALUES('attempt');");
    const store=new ReviewBankStore(db); store.import();
    const before=store.get(reviewQuestions[0].id);
    db.exec(`CREATE TRIGGER reject_review BEFORE UPDATE ON review_bank_entries
      WHEN NEW.kind='single-choice' BEGIN SELECT RAISE(ABORT,'injected failure'); END;`);
    const changed=structuredClone(reviewQuestions); changed[0].title='Updated title';
    assert.throws(()=>store.import({open:changed}),/injected failure/);
    assert.deepEqual(store.get(reviewQuestions[0].id),before);
    assert.deepEqual({...db.prepare('SELECT * FROM bank_items').get()},{id:'live',payload:'keep'});
    assert.equal(db.prepare('SELECT id FROM attempts').get().id,'attempt');
  } finally {db.close();}
});

test('invalid provenance is rejected before writing and versions are retained separately',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    const store=new ReviewBankStore(db),invalid=structuredClone(closedReviewCases);
    invalid[0].questions[0].sourceRefs=[];
    assert.throws(()=>store.import({closed:invalid}),/source references/);
    assert.deepEqual(store.stats().byKind,{});
    store.import(); store.import({version:'review-next'});
    assert.ok(store.get(reviewQuestions[0].id,closedReviewVersion));
    assert.ok(store.get(reviewQuestions[0].id,'review-next'));
    assert.equal(db.prepare('SELECT count(*) AS n FROM review_bank_entries').get().n,1320);
  } finally {db.close();}
});
