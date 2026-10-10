import { RequestError, threshold, confidentThreshold, nextGrade } from './assessment.mjs';
import { lockedMixedDigest, mixedClosedScore } from './mixed-assessment.mjs';
import { accountsShareRealm } from './local-fixtures.mjs';

export const assessmentContentChecks = ['solutionCorrect', 'sameReasoning', 'gradeAppropriate', 'similarWorkload', 'unambiguous'];
const fail = message => { throw new RequestError(400, message); };
const text = (value, max) => value == null ? '' : typeof value === 'string' && value.length <= max ? value.trim() : fail('Некорректный комментарий.');

export class AssessmentReviewService {
  constructor(store, { now = Date.now, accountForOwner }) {
    this.store = store; this.db = store.db; this.now = now; this.accountForOwner = accountForOwner;
    this.db.exec(`CREATE TABLE IF NOT EXISTS assessment_reviews (
      attempt_id TEXT PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('pending','completed','invalidated')), version INTEGER NOT NULL,
      submitted_at TEXT NOT NULL, reviewed_at TEXT, reviewer_id TEXT, marks TEXT, note TEXT, content_checks TEXT
    ) STRICT; CREATE INDEX IF NOT EXISTS assessment_review_queue ON assessment_reviews(status, submitted_at);`);
  }
  submit(row, integrity) {
    const answerDigest = lockedMixedDigest(row.attempt, row.progress);
    if (row.result) {
      if (row.answer_digest !== answerDigest) throw new RequestError(409, 'Ответы уже зафиксированы.');
      return row.result;
    }
    if (row.attempt.state !== 'active') throw new RequestError(409, 'Тест ещё не начат.');
    const closed = mixedClosedScore(row.attempt, row.progress);
    const result = { id: row.id, date: new Date(this.now()).toISOString(), specialization: row.attempt.specialization,
      grade: row.attempt.grade, surveyId: row.attempt.surveyId, bankVersion: row.attempt.bankVersion,
      status: 'pending-review', score: 0, passed: false, closedScore: Math.round(closed.score * 100) / 100,
      closedCorrect: closed.correct, closedCount: 15, openCount: 5, questionCount: 20,
      competencies: [], vacancySkills: row.attempt.vacancy?.matchedSkills || [], integrity };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (!this.store.complete(row.id, answerDigest, result)) throw new RequestError(409, 'Попытка уже завершена.');
      this.db.prepare("INSERT INTO assessment_reviews(attempt_id,status,version,submitted_at) VALUES (?,'pending',1,?)").run(row.id, result.date);
      this.db.exec('COMMIT'); return result;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  accessible(row, moderator) {
    if (!moderator?.canModerate) throw new RequestError(403, 'Требуется право модератора.');
    return accountsShareRealm(moderator, this.accountForOwner(row.owner));
  }
  list(moderator, { status = 'pending', limit = '20', offset = '0' } = {}) {
    if (!moderator?.canModerate) throw new RequestError(403, 'Требуется право модератора.');
    if (!['pending', 'completed', 'invalidated'].includes(status) || !/^\d+$/.test(String(limit)) || !/^\d+$/.test(String(offset))
      || Number(limit) < 1 || Number(limit) > 100 || Number(offset) > 100000) fail('Некорректные параметры очереди.');
    const rows = this.db.prepare('SELECT r.*,a.owner,a.result FROM assessment_reviews r JOIN attempts a ON a.id=r.attempt_id WHERE r.status=? ORDER BY r.submitted_at,a.id').all(status)
      .filter(row => this.accessible(row, moderator));
    return { total: rows.length, items: rows.slice(Number(offset), Number(offset) + Number(limit)).map(row => {
      const result = JSON.parse(row.result), account = this.accountForOwner(row.owner);
      return { id: row.attempt_id, status: row.status, version: row.version, submittedAt: row.submitted_at,
        specialization: result.specialization, grade: result.grade, closedCorrect: result.closedCorrect,
        candidate: { id: account.id, login: account.login }, selfReview: account.id === moderator.id };
    }) };
  }
  get(id, moderator) {
    const review = this.db.prepare('SELECT * FROM assessment_reviews WHERE attempt_id=?').get(id), row = this.store.get(id);
    if (!review || !row || !this.accessible(row, moderator)) throw new RequestError(404, 'Тест не найден.');
    const account = this.accountForOwner(row.owner);
    return { id, status: review.status, version: review.version, submittedAt: review.submitted_at,
      selfReview: account.id === moderator.id, candidate: { id: account.id, login: account.login },
      specialization: row.attempt.specialization, grade: row.attempt.grade, questions: row.attempt.questions,
      answers: row.progress.answers, cases: row.attempt.cases, result: row.result,
      marks: review.marks ? JSON.parse(review.marks) : [], note: review.note || '', requiredChecks: assessmentContentChecks,
      reviewerId: review.reviewer_id, reviewedAt: review.reviewed_at,
      contentChecks: review.content_checks ? JSON.parse(review.content_checks) : {} };
  }
  decide(id, input, moderator) {
    const detail = this.get(id, moderator), row = this.store.get(id);
    if (detail.selfReview) throw new RequestError(403, 'Нельзя проверять собственный тест.');
    if (detail.status !== 'pending' || detail.version !== input.version) throw new RequestError(409, 'Тест уже проверен или версия устарела.');
    if (Object.keys(input).some(k => !['version', 'decision', 'marks', 'note', 'contentChecks'].includes(k)) || !['grade','invalidate'].includes(input.decision)) fail('Некорректное решение.');
    const note = text(input.note, 2000), invalid = input.decision === 'invalidate';
    if (invalid && note.length < 10) fail('Укажите причину отзыва задания.');
    const marks = [];
    if (!invalid) {
      const checks = input.contentChecks;
      if (!checks || Object.keys(checks).length !== assessmentContentChecks.length || assessmentContentChecks.some(k => checks[k] !== true)) fail('Подтвердите качество заданий и соответствие грейду.');
      const open = row.attempt.questions.filter(q => q.type === 'open');
      if (!Array.isArray(input.marks) || input.marks.length !== 5 || new Set(input.marks.map(m => m?.questionId)).size !== 5) fail('Оцените все пять открытых ответов.');
      for (const q of open) {
        const mark = input.marks.find(m => m?.questionId === q.id), answer = row.progress.answers[q.id];
        if (!mark || Object.keys(mark).some(k => !['questionId','criteria','comment'].includes(k)) || !Array.isArray(mark.criteria)
          || mark.criteria.length !== q.rubric.length || new Set(mark.criteria.map(c => c?.criterionId)).size !== q.rubric.length) fail('Некорректная рубрика ответа.');
        const criteria = q.rubric.map(c => {
          const score = mark.criteria.find(v => v?.criterionId === c.id);
          if (!score || Object.keys(score).some(k => !['criterionId','score'].includes(k)) || !Number.isInteger(score.score) || score.score < 0 || score.score > 2) fail('Оценка критерия — 0, 1 или 2.');
          if ((!answer.answerText?.trim() || answer.late) && score.score !== 0) fail('Пропущенный или просроченный ответ получает ноль.');
          return { criterionId: c.id, score: score.score };
        });
        marks.push({ questionId: q.id, criteria, comment: text(mark.comment, 2000) });
      }
    }
    const closed = mixedClosedScore(row.attempt, row.progress);
    const fraction = q => q.type === 'open'
      ? marks.find(m => m.questionId === q.id).criteria.reduce((sum,c) => sum + c.score,0) / (q.rubric.length * 2)
      : Number(!row.progress.answers[q.id].late && row.progress.answers[q.id].optionId === q.correctOptionId);
    const openScore = invalid ? 0 : row.attempt.questions.filter(q => q.type === 'open').reduce((sum,q) => sum + fraction(q),0) / 5 * 100;
    const score = invalid ? 0 : Math.round(closed.score * .5 + openScore * .5), passed = !invalid && score >= threshold;
    const reviewedAt = new Date(this.now()).toISOString();
    const result = { ...row.result, date: reviewedAt, status: invalid ? 'invalidated' : 'completed', score, passed,
      openScore: Math.round(openScore * 100) / 100, review: { reviewedAt, comment: note,
        answers: marks.map(m => ({ questionId: m.questionId, comment: m.comment, score: Math.round(m.criteria.reduce((sum,c) => sum+c.score,0)/(m.criteria.length*2)*100) })) },
      competencies: invalid ? [] : [...new Set(row.attempt.questions.map(q => q.topic))].map(topic => {
        const questions = row.attempt.questions.filter(q => q.topic === topic), weight = q => q.type === 'open' ? .5/5 : .5/15;
        return { topic, score: Math.round(questions.reduce((sum,q) => sum+fraction(q)*weight(q),0)/questions.reduce((sum,q) => sum+weight(q),0)*100),
          correct: questions.filter(q => fraction(q) === 1).length, total: questions.length };
      }), ...(passed && score >= confidentThreshold ? { nextGradeAvailable: nextGrade(row.attempt.grade) } : {}) };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const updated = this.db.prepare("UPDATE assessment_reviews SET status=?,version=version+1,reviewed_at=?,reviewer_id=?,marks=?,note=?,content_checks=? WHERE attempt_id=? AND status='pending' AND version=?")
        .run(invalid ? 'invalidated' : 'completed', reviewedAt, moderator.id, JSON.stringify(marks), note, JSON.stringify(input.contentChecks || {}), id, input.version);
      if (!updated.changes) throw new RequestError(409, 'Тест уже проверен.');
      this.db.prepare('UPDATE attempts SET result=? WHERE id=?').run(JSON.stringify(result),id);
      this.onFinalized?.(row.owner,id);
      this.db.exec('COMMIT'); return { result, version: input.version + 1 };
    } catch(error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
