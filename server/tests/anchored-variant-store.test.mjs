import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateAnchoredVariant } from '../anchored-generator.mjs';
import { AnchoredVariantStore, independentReviewChecks } from '../anchored-variant-store.mjs';
import { anchoredReply, fixtureAnchorId } from './fixtures/anchored-variant.mjs';

const review = { decision: 'accept', checks: Object.fromEntries(independentReviewChecks.map(key => [key, true])),
  rationale: 'Тестовая запись независимой экспертизы для проверки механизма хранения; не является настоящей предметной экспертизой или подтверждением грейда.' };
const candidate = async () => (await generateAnchoredVariant({ anchorId: fixtureAnchorId, llm: {
  configured: true, chat: async () => ({ model: 'fixture', json: anchoredReply() }) } })).candidate;
const subject = n => n.toString(16).padStart(64, '0');

test('draft and every source survive reopening; no review can activate it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'anchored-')), path = join(dir, 'draft.sqlite');
  let db = new DatabaseSync(path);
  try {
    const store = new AnchoredVariantStore(db), item = await candidate();
    store.save(item); db.close(); db = new DatabaseSync(path);
    const reopened = new AnchoredVariantStore(db), saved = reopened.get(item.id);
    assert.equal(saved.contentHash, item.contentHash); assert.equal(saved.review.status, 'needs-review');
    assert.equal(saved.sources.length, item.sourceRefs.length);
    assert.deepEqual(saved.sources.map(s => s.url).sort(), item.sourceRefs.map(s => s.url).sort());
    assert.equal(reopened.review(item.id, review, 'expert:fixture').review.active, false);
    assert.throws(() => db.prepare('UPDATE anchored_variants SET active=1 WHERE id=?').run(item.id), /CHECK/u);
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='bank_items'").get().n, 0);
    assert.equal(reopened.references.stats().active, 0);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('untrusted source/grade/solution and duplicate scenario cannot be stored; references roll back atomically', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const store = new AnchoredVariantStore(db), item = await candidate();
    for (const mutate of [i => { i.passport.grade = 'Lead'; }, i => { i.sourceRefs[0].url = 'https://fake.example'; },
      i => { i.content.solution = 'invalid'; }]) {
      const altered = structuredClone(item); mutate(altered); assert.throws(() => store.save(altered));
    }
    store.references.import();
    db.exec("CREATE TRIGGER fail_variant_source BEFORE INSERT ON anchored_variant_sources BEGIN SELECT RAISE(ABORT,'fixture rollback'); END");
    assert.throws(() => store.save(item), /rollback/u);
    assert.equal(store.list().length, 0); assert.equal(db.prepare('SELECT count(*) AS n FROM anchored_generation_log').get().n, 0);
    db.exec('DROP TRIGGER fail_variant_source');
    store.save(item);
    const copy = structuredClone(item); copy.id = 'variant-duplicate';
    assert.throws(() => store.save(copy));
    const duplicate = await candidate(); // Different option permutation must not defeat duplicate detection.
    assert.throws(() => store.save(duplicate));
  } finally { db.close(); }
});

test('review checklist is mandatory; fixed plan is locked and assignments are balanced and idempotent', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const store = new AnchoredVariantStore(db), item = await candidate(); store.save(item);
    assert.throws(() => store.plan(item.id, {}, 'expert:fixture'), /review/u);
    assert.throws(() => store.review(item.id, { ...review, checks: { solutionCorrect: true } }, 'expert:fixture'));
    store.review(item.id, review, 'expert:fixture');
    const plan = store.plan(item.id, { samplePerArm: 200, strata: ['low', 'high'] }, 'expert:fixture');
    assert.throws(() => store.plan(item.id, { samplePerArm: 1000 }, 'expert:fixture'));
    assert.throws(() => store.review(item.id, review, 'expert:fixture'), /locked/u);
    for (let i = 1; i <= 20; i++) store.assign(plan.id, subject(i), 'low');
    const arms = db.prepare('SELECT arm,count(*) AS n FROM anchored_pilot_assignments GROUP BY arm').all();
    assert(arms.every(row => row.n === 10));
    assert.deepEqual(store.assign(plan.id, subject(1), 'low'), store.assign(plan.id, subject(1), 'low'));
    assert.throws(() => store.assign(plan.id, subject(1), 'high'));
    assert.throws(() => store.assign(plan.id, 'real-person@example.com', 'low'));
    assert.throws(() => store.record(plan.id, subject(100), { answers: [0, 0], elapsedMs: 1000 }));
    const assignment = store.assign(plan.id, subject(1), 'low');
    const questions = assignment.arm === 'anchor' ? item.passport.referenceQuestions : item.content.questions;
    assert.deepEqual(store.record(plan.id, subject(1), { answers: questions.map(q => q.correct), elapsedMs: 120000 }), { recorded: true });
    assert.throws(() => store.record(plan.id, subject(1), { answers: [0, 0], elapsedMs: 120000 }));
    const report = store.report(plan.id);
    assert.equal(report.statisticalChecksPassed, false); assert.equal(report.approvedForCertification, false);
    assert.equal(report.assigned, 20);
    assert.equal(store.get(item.id).review.status, 'reviewed');
  } finally { db.close(); }
});

test('full case-level pilot cannot activate a reviewed draft or accept extra participants', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const store = new AnchoredVariantStore(db), item = await candidate(); store.save(item); store.review(item.id, review, 'expert:fixture');
    const plan = store.plan(item.id, { samplePerArm: 1000 }, 'expert:fixture');
    for (let i = 1; i <= 2000; i++) {
      const a = store.assign(plan.id, subject(i), 'all');
      const questions = a.arm === 'anchor' ? item.passport.referenceQuestions : item.content.questions;
      store.record(plan.id, subject(i), { answers: questions.map(q => q.correct), elapsedMs: 120000 });
    }
    const report = store.report(plan.id);
    assert.equal(report.statisticalChecksPassed, true); assert.equal(report.approvedForCertification, false);
    assert.throws(() => store.assign(plan.id, subject(2001), 'all'), /closed/u);
    assert.equal(store.get(item.id).review.active, false);
    assert.equal(db.prepare('SELECT count(*) AS n FROM anchored_pilot_assignments WHERE score IS NOT NULL').get().n, 2000);
    store.review(item.id, { decision: 'reject', rationale: 'Тестовый отзыв экспертизы после обнаружения предметной ошибки. Дальнейшее предъявление кейса запрещено, план и результаты сохраняются.' }, 'expert:fixture');
    assert.throws(() => store.assign(plan.id, subject(2002), 'all'), /no longer/u);
    assert.equal(store.report(plan.id).statisticalChecksPassed, false);
  } finally { db.close(); }
});
