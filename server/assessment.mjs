import { createHash, randomInt, randomUUID } from 'node:crypto';
import { bankVersion, programs } from './bank.mjs';
import { analyzeVacancy, vacancyExamples } from './vacancies.mjs';

export const threshold = 70;
export const expiresInMinutes = 30;
export class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const digest = value => createHash('sha256').update(value).digest('hex');

function shuffled(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const next = randomInt(index + 1);
    [result[index], result[next]] = [result[next], result[index]];
  }
  return result;
}

export function getProgram(specialization, grade) {
  const program = Object.hasOwn(programs, specialization) && Object.hasOwn(programs[specialization], grade) ? programs[specialization][grade] : null;
  if (!program) throw new RequestError(400, 'Выберите поддерживаемую специализацию и грейд.');
  return program;
}

export function programInfo(specialization, grade) {
  const program = getProgram(specialization, grade);
  return { bankVersion, topics: program.topics, questionCount: program.topics.length * 2, threshold, expiresInMinutes,
    examples: vacancyExamples.filter(item => item.specialization === specialization && item.grade === grade).map(({ id, title, description }) => ({ id, title, description })) };
}

export function validateSurvey(survey) {
  const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  const list = (value, max) => Array.isArray(value) && value.length > 0 && value.length <= max && value.every(item => text(item, 80)) && new Set(value).size === value.length;
  if (!survey || !text(survey.id, 100) || !text(survey.date, 40) || !Number.isFinite(Date.parse(survey.date))
    || !text(survey.industry, 100) || !text(survey.professionalRole, 100) || !text(survey.experience, 100)
    || !list(survey.stack, 20) || !list(survey.softSkills, 10)) throw new RequestError(400, 'Сначала заполните анкету.');
  getProgram(survey.specialization, survey.desiredGrade);
  return { id: survey.id, date: survey.date, industry: survey.industry, professionalRole: survey.professionalRole,
    specialization: survey.specialization, desiredGrade: survey.desiredGrade, experience: survey.experience,
    stack: [...survey.stack], softSkills: [...survey.softSkills] };
}

export function createAttempt(surveyInput, vacancyDescription = '', recent = [], now = Date.now()) {
  const survey = validateSurvey(surveyInput);
  if (typeof vacancyDescription !== 'string' || vacancyDescription.length > 4000) throw new RequestError(400, 'Описание вакансии — до 4000 символов.');
  const program = getProgram(survey.specialization, survey.desiredGrade);
  const description = vacancyDescription.trim();
  const vacancy = description ? analyzeVacancy(description, survey.specialization, survey.desiredGrade) : null;
  const selected = program.topics.flatMap(topic => [1, 2].map(difficulty => {
    const families = program.families.filter(family => family.topic === topic && family.difficulty === difficulty);
    const priority = families.filter(family => vacancy?.matchedSkills.some(skill => family.skills.includes(skill)));
    const family = shuffled(priority.length ? priority : families)[0];
    if (!family) throw new Error('Incomplete assessment blueprint');
    const seen = new Set(recent.flatMap(attempt => attempt.questions.filter(item => item.familyId === family.id).map(item => item.variantId)));
    const fresh = family.variants.filter(variant => !seen.has(variant.id));
    const choices = fresh.length ? fresh : family.variants;
    const relevance = variant => (variant.skills || []).filter(skill => vacancy?.matchedSkills.includes(skill)).length;
    const best = Math.max(...choices.map(relevance));
    const variant = shuffled(choices.filter(variant => relevance(variant) === best))[0];
    const options = shuffled(variant.options.map((text, index) => ({ id: randomUUID(), text, correct: index === variant.correct })));
    return { id: randomUUID(), topic, text: variant.text, options: options.map(({ id, text }) => ({ id, text })),
      correctOptionId: options.find(option => option.correct).id, familyId: family.id, variantId: variant.id, difficulty, skills: variant.skills || [] };
  }));
  // Vacancy emphasis changes order and selection inside slots, never the grade's core or weights.
  const questions = shuffled(selected).sort((a, b) => Number(Boolean(vacancy?.focusTopics.includes(b.topic))) - Number(Boolean(vacancy?.focusTopics.includes(a.topic))));
  if (vacancy) {
    const covered = new Set(questions.flatMap(question => question.skills));
    const omitted = vacancy.matchedSkills.filter(skill => !covered.has(skill));
    vacancy.matchedSkills = vacancy.matchedSkills.filter(skill => covered.has(skill));
    vacancy.unmatchedSkills = [...new Set([...vacancy.unmatchedSkills, ...omitted])];
    vacancy.recognized = vacancy.matchedSkills.length > 0;
    vacancy.summary = 'Совпадения относятся к выбранным заданиям; общий состав теста сохранён.';
  }
  return {
    id: randomUUID(), bankVersion, specialization: survey.specialization, grade: survey.desiredGrade, surveyId: survey.id, survey,
    createdAt: new Date(now).toISOString(), expiresAt: new Date(now + expiresInMinutes * 60000).toISOString(),
    questions, vacancy, vacancyDescription: description,
    blueprint: { topicCounts: Object.fromEntries(program.topics.map(topic => [topic, 2])), difficultyCounts: { '1': 3, '2': 3 }, difficultyBudget: 9 },
  };
}

export function publicAttempt(attempt) {
  const { id, bankVersion, specialization, grade, surveyId, createdAt, expiresAt, blueprint, vacancy } = attempt;
  return { id, bankVersion, specialization, grade, surveyId, createdAt, expiresAt, blueprint, vacancy,
    questions: attempt.questions.map(({ id, topic, text, options }) => ({ id, topic, text, options })) };
}

export function evaluate(attempt, answers, now = Date.now()) {
  if (now >= Date.parse(attempt.expiresAt)) throw new RequestError(410, 'Время теста истекло. Начните новую попытку.');
  if (!Array.isArray(answers) || answers.length !== attempt.questions.length) throw new RequestError(400, 'Ответьте на все вопросы.');
  const selected = new Map();
  for (const answer of answers) {
    if (!answer || Object.keys(answer).some(key => !['questionId', 'optionId'].includes(key))) throw new RequestError(400, 'Некорректный ответ.');
    const question = attempt.questions.find(item => item.id === answer.questionId);
    if (!question || selected.has(answer.questionId) || !question.options.some(option => option.id === answer.optionId)) throw new RequestError(400, 'Ответ не относится к этой попытке.');
    selected.set(answer.questionId, answer.optionId);
  }
  const topics = [...new Set(attempt.questions.map(item => item.topic))];
  const competencies = topics.map(topic => {
    const questions = attempt.questions.filter(item => item.topic === topic);
    const correct = questions.filter(item => selected.get(item.id) === item.correctOptionId).length;
    return { topic, score: Math.round(correct / questions.length * 100), correct, total: questions.length };
  });
  const score = Math.round(competencies.reduce((sum, item) => sum + item.correct, 0) / attempt.questions.length * 100);
  const normalized = [...selected].sort(([a], [b]) => a.localeCompare(b));
  return { answerDigest: digest(JSON.stringify(normalized)), result: {
    id: attempt.id, date: new Date(now).toISOString(), specialization: attempt.specialization, grade: attempt.grade,
    surveyId: attempt.surveyId, score, passed: score >= threshold, bankVersion: attempt.bankVersion, competencies,
    vacancySkills: attempt.vacancy?.matchedSkills || [],
  } };
}
