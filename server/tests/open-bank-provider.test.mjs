import assert from 'node:assert/strict';
import test from 'node:test';
import { getOpenProgram } from '../open-bank.mjs';
import { openGrades, openSpecializations } from '../open-bank/schema.mjs';
import { createOpenAssessmentProvider, defaultOpenAssessmentModel, qwenOpenAssessmentModel } from '../open-assessment-provider.mjs';

test('Both selected models receive compiled private answers and rubrics without turning uncertainty into a grade', async () => {
  for (const model of [defaultOpenAssessmentModel, qwenOpenAssessmentModel]) {
    let captured;
    const provider = createOpenAssessmentProvider({
      env: { OPENROUTER_API_KEY: 'test-only-key', OPENROUTER_ASSESSMENT_MODEL: model },
      fetchImpl: async (_url, request) => {
        const payload = JSON.parse(request.body);
        captured = JSON.parse(payload.messages[1].content);
        const criteria = captured.question.rubric.map(item => ({ criterionId: item.id,
          status: 'not_assessable', score: null, evidence: [], rationale: 'Имитация технического ответа для проверки контракта.', needsReview: true }));
        assert.equal(payload.model, model);
        return new Response(JSON.stringify({ model, choices: [{ finish_reason: 'stop',
          message: { role: 'assistant', content: JSON.stringify({ criteria, needsReview: true }) } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    });
    for (const specialization of openSpecializations) for (const grade of openGrades) for (const question of getOpenProgram(specialization, grade).questions) {
      const result = await provider.evaluateDraft({ question, answer: 'Контроль технического контракта, не эталон навыков.' });
      assert.equal(result.questionId, question.id);
      assert.equal(result.bankVersion, question.bankVersion);
      assert.equal(result.rubricVersion, question.rubricVersion);
      assert.equal(result.approvedForCertification, false);
      assert.equal(result.needsReview, true);
      assert.equal(Object.hasOwn(result, 'passed'), false);
      assert.ok(result.criteria.every(item => item.score === null));
      assert.deepEqual(captured.question.rubric.map(item => item.anchors), question.rubric.map(item => item.anchors));
      assert.deepEqual(captured.question.referenceAnswer, question.referenceAnswer);
      assert.equal(result.model, model);
    }
  }
});
