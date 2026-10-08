import assert from 'node:assert/strict';
import test from 'node:test';
import { getOpenProgram, openFamilies } from '../open-bank.mjs';
import { openGrades, openSpecializations } from '../open-bank/schema.mjs';
import { createOpenAssessmentProvider, defaultOpenAssessmentModel } from '../open-assessment-provider.mjs';

test('Every compiled question supplies a compatible private draft without turning uncertainty into a grade', async () => {
  let captured;
  const provider = createOpenAssessmentProvider({
    env: { OPENROUTER_API_KEY: 'test-only-key' },
    fetchImpl: async (_url, request) => {
      const payload = JSON.parse(request.body);
      captured = JSON.parse(payload.messages[1].content);
      const criteria = captured.question.rubric.map(item => ({ criterionId: item.id,
        status: 'not_assessable', score: null, evidence: [], rationale: 'Имитация технического ответа для проверки контракта.', needsReview: true }));
      return new Response(JSON.stringify({ model: defaultOpenAssessmentModel, choices: [{ finish_reason: 'stop',
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
    const family = openFamilies.find(item => item.id === question.familyId);
    if (family.levels[grade].criteria) {
      assert.equal(captured.question.referenceAnswer.scenario, family.levels[grade].referenceAnswer || family.levels[grade].expected);
    }
  }
});
