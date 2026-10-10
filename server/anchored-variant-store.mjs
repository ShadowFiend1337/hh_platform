import { randomInt, randomUUID } from 'node:crypto';
import { ReviewBankStore } from './review-bank-store.mjs';
import { anchorPassport, validateAnchoredDraft, variantContentHash, variantScenario } from './anchored-generator.mjs';
import { closedReviewVersion } from './closed-review-bank.mjs';
import { difficultyPlan, compareVariantDifficulty } from './variant-difficulty.mjs';

export const independentReviewChecks = Object.freeze(['anchorCorrectAndGradeAppropriate', 'solutionCorrect',
  'sameReasoning', 'similarWorkload', 'noNewPrerequisites', 'plausibleDistractors', 'substantiveRewrite']);
const participant = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const note = value => typeof value === 'string' && value.trim().length >= 60 && value.length <= 5000;

/** All generated variants remain outside the live ItemBank, even after review/calibration. */
export class AnchoredVariantStore {
  constructor(db, { now = Date.now } = {}) {
    this.db = db; this.now = now; this.references = new ReviewBankStore(db);
    db.exec(`
      CREATE TABLE IF NOT EXISTS anchored_variants (
        id TEXT PRIMARY KEY, anchor_id TEXT NOT NULL, anchor_version TEXT NOT NULL,
        grade TEXT NOT NULL, competency_id TEXT NOT NULL, content_hash TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK(status IN ('needs-review','reviewed','rejected')),
        active INTEGER NOT NULL DEFAULT 0 CHECK(active=0),
        payload TEXT NOT NULL CHECK(json_valid(payload)), review TEXT NOT NULL CHECK(json_valid(review)),
        created_at TEXT NOT NULL,
        FOREIGN KEY(anchor_id,anchor_version) REFERENCES review_bank_entries(id,version)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS anchored_variant_sources (
        variant_id TEXT NOT NULL, source_id TEXT NOT NULL, source_version TEXT NOT NULL,
        url TEXT NOT NULL CHECK(url LIKE 'https://%'), relationship TEXT NOT NULL, locator TEXT NOT NULL,
        PRIMARY KEY(variant_id,source_id),
        FOREIGN KEY(variant_id) REFERENCES anchored_variants(id),
        FOREIGN KEY(source_id,source_version) REFERENCES review_bank_sources(id,version)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS anchored_generation_log (
        id TEXT PRIMARY KEY, anchor_id TEXT NOT NULL, outcome TEXT NOT NULL,
        reasons TEXT NOT NULL CHECK(json_valid(reasons)), variant_id TEXT, created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS anchored_difficulty_plans (
        id TEXT PRIMARY KEY, variant_id TEXT NOT NULL UNIQUE,
        payload TEXT NOT NULL CHECK(json_valid(payload)), reviewer TEXT NOT NULL, created_at TEXT NOT NULL,
        FOREIGN KEY(variant_id) REFERENCES anchored_variants(id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS anchored_pilot_assignments (
        plan_id TEXT NOT NULL, participant_hash TEXT NOT NULL, stratum TEXT NOT NULL,
        arm TEXT NOT NULL CHECK(arm IN ('anchor','variant')), created_at TEXT NOT NULL,
        score REAL CHECK(score>=0 AND score<=1), elapsed_ms INTEGER CHECK(elapsed_ms>=0),
        evidence TEXT CHECK(evidence IS NULL OR json_valid(evidence)),
        PRIMARY KEY(plan_id,participant_hash), FOREIGN KEY(plan_id) REFERENCES anchored_difficulty_plans(id)
      ) STRICT;
    `);
  }

  log(anchorId, outcome, reasons = [], variantId = null) {
    this.db.prepare('INSERT INTO anchored_generation_log VALUES(?,?,?,?,?,?)')
      .run(randomUUID(), anchorId, outcome, JSON.stringify(reasons), variantId, new Date(this.now()).toISOString());
  }

  save(candidate) {
    const passport = anchorPassport(candidate?.passport?.anchorId);
    if (candidate?.mode !== 'anchored' || candidate.llmCalls !== 1
      || JSON.stringify(candidate.passport) !== JSON.stringify(passport)
      || candidate.contentHash !== variantContentHash(candidate.content)
      || JSON.stringify(candidate.sourceRefs) !== JSON.stringify(passport.sourceRefs)
      || candidate.sourceUrl !== passport.sourceUrl
      || validateAnchoredDraft(candidate.content, passport, this.scenarios(passport.anchorId)).length) throw new TypeError('Invalid/untrusted/duplicate variant');
    if (this.db.prepare('SELECT 1 FROM anchored_variants WHERE content_hash=?').get(candidate.contentHash)) throw new TypeError('Duplicate variant');
    if (!this.references.get(passport.anchorId, closedReviewVersion)) this.references.import();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const snapshot = { ...candidate, review: { status: 'needs-review', active: false, approvedForCertification: false } };
      this.db.prepare('INSERT INTO anchored_variants(id,anchor_id,anchor_version,grade,competency_id,content_hash,status,payload,review,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(candidate.id, passport.anchorId, passport.anchorVersion, passport.grade, passport.competencyId,
          candidate.contentHash, 'needs-review', JSON.stringify(snapshot), '[]', candidate.generatedAt);
      const insert = this.db.prepare('INSERT INTO anchored_variant_sources VALUES(?,?,?,?,?,?)');
      for (const ref of passport.sourceRefs) insert.run(candidate.id, ref.sourceId, passport.anchorVersion, ref.url, ref.relationship, ref.locator);
      this.log(passport.anchorId, 'needs-review', [], candidate.id);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return this.get(candidate.id);
  }

  get(id) {
    const row = this.db.prepare('SELECT * FROM anchored_variants WHERE id=?').get(id);
    return row ? { ...JSON.parse(row.payload), review: { status: row.status, active: false, approvedForCertification: false,
      history: JSON.parse(row.review) }, sources: this.db.prepare('SELECT source_id,url,relationship,locator FROM anchored_variant_sources WHERE variant_id=?').all(id) } : null;
  }

  list({ anchorId, grade, limit = 50 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new TypeError('Invalid limit');
    return this.db.prepare(`SELECT id,anchor_id AS anchorId,grade,competency_id AS competencyId,status,active,created_at AS createdAt
      FROM anchored_variants WHERE (? IS NULL OR anchor_id=?) AND (? IS NULL OR grade=?) ORDER BY created_at DESC,id LIMIT ?`)
      .all(anchorId || null, anchorId || null, grade || null, grade || null, limit);
  }

  scenarios(anchorId) {
    return this.db.prepare('SELECT payload FROM anchored_variants WHERE anchor_id=? ORDER BY created_at DESC LIMIT 100')
      .all(anchorId).map(row => variantScenario(JSON.parse(row.payload)));
  }

  review(id, { decision, checks, rationale }, reviewer) {
    const item = this.get(id);
    if (!item) throw new TypeError('Unknown variant');
    if (decision !== 'reject' && this.db.prepare('SELECT 1 FROM anchored_difficulty_plans WHERE variant_id=?').get(id)) throw new TypeError('Experiment locked; review cannot change');
    if (!['accept', 'reject'].includes(decision) || !note(rationale) || typeof reviewer !== 'string' || !reviewer.trim()
      || (decision === 'accept' && (!checks || Object.keys(checks).length !== independentReviewChecks.length
        || independentReviewChecks.some(check => checks[check] !== true)))) throw new TypeError('Independent review checklist and rationale required');
    const history = [...item.review.history, { decision, checks: decision === 'accept' ? checks : null,
      rationale, reviewer, at: new Date(this.now()).toISOString(), contentHash: item.contentHash, anchorHash: item.passport.anchorHash }];
    this.db.prepare('UPDATE anchored_variants SET status=?,review=? WHERE id=?')
      .run(decision === 'accept' ? 'reviewed' : 'rejected', JSON.stringify(history), id);
    return this.get(id);
  }

  plan(id, options, reviewer) {
    const item = this.get(id);
    if (!item || item.review.status !== 'reviewed' || typeof reviewer !== 'string' || !reviewer.trim()) throw new TypeError('Independent review required before experiment');
    const plan = { ...difficultyPlan(item, options), id: 'plan-' + randomUUID(), createdAt: new Date(this.now()).toISOString() };
    this.db.prepare('INSERT INTO anchored_difficulty_plans VALUES(?,?,?,?,?)').run(plan.id, id, JSON.stringify(plan), reviewer, plan.createdAt);
    return plan;
  }

  getPlan(id) {
    const row = this.db.prepare('SELECT payload FROM anchored_difficulty_plans WHERE id=?').get(id);
    return row ? JSON.parse(row.payload) : null;
  }

  /** Receive a pseudonymous hash, never a name/contact. One participant sees one arm. */
  assign(planId, participantHash, stratum) {
    const plan = this.getPlan(planId);
    if (!plan || !participant(participantHash) || !plan.strata.includes(stratum)) throw new TypeError('Invalid pilot participant/stratum');
    if (this.get(plan.variantId)?.review.status !== 'reviewed') throw new TypeError('Variant no longer approved for pilot');
    const existing = this.db.prepare('SELECT * FROM anchored_pilot_assignments WHERE plan_id=? AND participant_hash=?').get(planId, participantHash);
    if (existing) {
      if (existing.stratum !== stratum) throw new TypeError('Participant already assigned to another stratum');
      return { planId, participantHash, arm: existing.arm, stratum };
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      // Randomized blocks of two, balanced within each prespecified stratum.
      const counts = Object.fromEntries(this.db.prepare('SELECT arm,count(*) AS n FROM anchored_pilot_assignments WHERE plan_id=? AND stratum=? GROUP BY arm')
        .all(planId, stratum).map(row => [row.arm, row.n]));
      const na = counts.anchor || 0, nv = counts.variant || 0;
      if (na >= plan.samplePerArm && nv >= plan.samplePerArm) throw new TypeError('Pilot sample closed');
      const arm = na === nv ? (randomInt(2) ? 'anchor' : 'variant') : na < nv ? 'anchor' : 'variant';
      this.db.prepare('INSERT INTO anchored_pilot_assignments(plan_id,participant_hash,stratum,arm,created_at) VALUES(?,?,?,?,?)')
        .run(planId, participantHash, stratum, arm, new Date(this.now()).toISOString());
      this.db.exec('COMMIT');
      return { planId, participantHash, arm, stratum };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  record(planId, participantHash, { answers, criterionScores, elapsedMs }) {
    const plan = this.getPlan(planId);
    const assignment = this.db.prepare('SELECT * FROM anchored_pilot_assignments WHERE plan_id=? AND participant_hash=?').get(planId, participantHash);
    if (!plan || !assignment || assignment.score !== null) throw new TypeError('Missing assignment or duplicate outcome');
    if (!Number.isInteger(elapsedMs) || elapsedMs < 0 || elapsedMs > 86400000) throw new TypeError('Invalid duration');
    const item = this.get(plan.variantId);
    if (!item || item.contentHash !== plan.variantHash || item.passport.anchorHash !== plan.anchorHash) throw new TypeError('Experiment snapshot changed');
    const closed = plan.answerFormat === 'single-choice-case';
    let score;
    if (closed) {
      const questions = assignment.arm === 'variant' ? item.content.questions : item.passport.referenceQuestions;
      if (criterionScores !== undefined || !Array.isArray(answers) || answers.length !== questions.length
        || answers.some(a => !Number.isInteger(a) || a < 0 || a > 3)) throw new TypeError('Invalid closed-case answers');
      score = answers.filter((a, i) => a === questions[i].correct).length / questions.length;
    } else {
      const count = item.passport.criteria.length;
      if (answers !== undefined || !Array.isArray(criterionScores) || criterionScores.length !== count
        || criterionScores.some(s => !Number.isInteger(s) || s < 0 || s > 2)) throw new TypeError('Blind expert rubric scores required');
      score = criterionScores.reduce((sum, s) => sum + s, 0) / (2 * count);
    }
    const result = this.db.prepare('UPDATE anchored_pilot_assignments SET score=?,elapsed_ms=?,evidence=? WHERE plan_id=? AND participant_hash=? AND score IS NULL')
      .run(score, elapsedMs, JSON.stringify(closed ? { answers } : { criterionScores }), planId, participantHash);
    if (result.changes !== 1) throw new TypeError('Outcome already recorded');
    return { recorded: true }; // No answer keys or correctness feedback during a pilot.
  }

  report(planId) {
    const plan = this.getPlan(planId);
    if (!plan) throw new TypeError('Unknown plan');
    const rows = this.db.prepare('SELECT participant_hash AS participantHash,stratum,arm,score FROM anchored_pilot_assignments WHERE plan_id=? AND score IS NOT NULL').all(planId);
    const comparison = compareVariantDifficulty(plan, rows.map(row => ({ ...row, grade: plan.grade, answerFormat: plan.answerFormat })));
    const independentReviewValid = this.get(plan.variantId)?.review.status === 'reviewed';
    return { plan, ...comparison, independentReviewValid,
      statisticalChecksPassed: independentReviewValid && comparison.statisticalChecksPassed,
      assigned: this.db.prepare('SELECT count(*) AS n FROM anchored_pilot_assignments WHERE plan_id=?').get(planId).n };
  }
}
