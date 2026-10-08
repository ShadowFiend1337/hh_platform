// Private authoring corpus. It is intentionally separate from the live MC exam.
// Never import this module into frontend or expose its rubrics/solutions over an API.
import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { engineeringFamilies } from './open-bank/engineering.mjs';
import { dataFamilies } from './open-bank/data.mjs';
import { operationsProductFamilies } from './open-bank/operations-product.mjs';
import { businessAnalysisFamilies } from './open-bank/business-analysis.mjs';
import { productManagementFamilies } from './open-bank/product-management.mjs';
import { embeddedFamilies } from './open-bank/embedded.mjs';
import { mlAdditionalFamilies } from './open-bank/ml-additional.mjs';
import { openCompetencies } from './open-bank/competencies.mjs';
import { deepFreeze, openGrades, openGroups, openSpecializations, validateOpenBank } from './open-bank/schema.mjs';
import { extraPracticalGroup, isPracticalFamily, practicalQuota } from './open-bank/policy.mjs';

export const openBankVersion = '2026.10.08-open-v3';
export const openRubricVersion = '2026.10.08-rubric-v3';
export const openBankReview = deepFreeze({ status: 'author-draft', independentlyReviewed: false,
  empiricallyCalibrated: false, approvedForCertification: false });

const sourceFile = name => JSON.parse(readFileSync(new URL('./open-bank/' + name, import.meta.url), 'utf8'));
export const openSources = deepFreeze([
  ...sourceFile('sources-engineering.json'), ...sourceFile('sources-data.json'), ...sourceFile('sources-operations-product.json'),
  ...sourceFile('sources-business-analysis.json'), ...sourceFile('sources-product-management.json'), ...sourceFile('sources-embedded.json'),
  ...sourceFile('sources-ml-additional.json'),
]);
export const openFamilies = deepFreeze([...engineeringFamilies, ...dataFamilies, ...operationsProductFamilies,
  ...businessAnalysisFamilies, ...productManagementFamilies, ...embeddedFamilies, ...mlAdditionalFamilies]);
const structuralErrors = validateOpenBank(openFamilies, openSources);
if (structuralErrors.length) throw new Error('Invalid open authoring corpus:\n' + structuralErrors.join('\n'));
const sourcesById = new Map(openSources.map(source => [source.id, source]));

function compileQuestion(family, grade) {
  const level = family.levels[grade];
  const criteria = level.criteria || family.criteria;
  return deepFreeze({
    id: family.id + ':' + grade, familyId: family.id, bankVersion: openBankVersion, rubricVersion: openRubricVersion,
    specialization: family.specialization, grade, group: family.group,
    competency: openCompetencies[family.specialization][openGroups.indexOf(family.group)],
    title: family.title, prompt: family.prompt + '\n\nЗадание выбранного уровня:\n' + level.task,
    answerFormat: family.answerFormat, language: family.language, tags: family.tags, practical: isPracticalFamily(family),
    referenceAnswer: {
      scenario: level.referenceAnswer || (level.criteria ? level.expected : family.referenceAnswer),
      level: level.expected,
    },
    criterionScope: 'family-local',
    rubricOrigin: level.criteria ? 'grade-specific-author-draft' : 'shared-family-requires-grade-review',
    rubric: [...criteria.map(criterion => ({
      id: criterion.id, label: criterion.label, ...(criterion.skillId ? { skillId: criterion.skillId } : {}),
      anchors: { 0: criterion.missing, 1: criterion.partial, 2: criterion.meets, 3: criterion.strong },
    })), {
      id: 'level-depth', label: 'Действие выбранного уровня',
      anchors: {
        0: 'Не выполнено действие уровня; ответ противоречит заданным условиям.',
        1: 'Приведены отдельные шаги, но не достигнут ожидаемый результат: ' + level.expected,
        2: level.expected,
        3: level.expected + ' Дополнительно показана проверка результата или контрпример в условиях этой задачи.',
      },
    }],
    acceptableAlternatives: family.acceptableAlternatives, criticalErrors: family.criticalErrors,
    sources: family.sourceIds.map(id => sourcesById.get(id)), personalization: family.personalization,
    review: openBankReview,
  });
}

const programs = new Map();
export function getOpenProgram(specialization, grade) {
  if (!openSpecializations.includes(specialization) || !openGrades.includes(grade)) throw new RangeError('Unknown open assessment program');
  const key = specialization + ':' + grade;
  if (!programs.has(key)) programs.set(key, deepFreeze({
    id: key, bankVersion: openBankVersion, rubricVersion: openRubricVersion, specialization, grade,
    review: openBankReview, competencies: openGroups.map((group, index) => ({ group, title: openCompetencies[specialization][index] })),
    practicalPolicy: { minimum: 5, extraGroup: extraPracticalGroup[specialization] },
    questions: openFamilies.filter(family => family.specialization === specialization).map(family => compileQuestion(family, grade)),
  }));
  return programs.get(key);
}

/** A private authoring preview, never a certification attempt or its score. */
export function sampleOpenQuestions(specialization, grade, { excludedFamilyIds = [], perGroup = 5 } = {}) {
  if (!Number.isInteger(perGroup) || perGroup < 1 || perGroup > 10) throw new RangeError('Invalid sample size');
  if (!Array.isArray(excludedFamilyIds) || excludedFamilyIds.some(id => typeof id !== 'string')) throw new TypeError('Invalid excluded families');
  const program = getOpenProgram(specialization, grade);
  const excluded = new Set(excludedFamilyIds);
  const questions = openGroups.flatMap(group => {
    const pool = program.questions.filter(question => question.group === group && !excluded.has(question.familyId));
    if (pool.length < perGroup) throw new RangeError('Not enough unseen families for ' + specialization + '/' + grade + '/' + group);
    const shuffle = items => {
      for (let index = items.length - 1; index > 0; index--) {
        const next = randomInt(index + 1);
        [items[index], items[next]] = [items[next], items[index]];
      }
      return items;
    };
    const practical = shuffle(pool.filter(question => question.practical));
    const quota = practicalQuota(specialization, group, perGroup);
    if (practical.length < quota) throw new RangeError('Not enough unseen practical families for ' + specialization + '/' + grade + '/' + group);
    // Prefer other formats for the remaining slots. A SQL-heavy program may
    // contain more practical cases; it must never invent non-practical tasks.
    const ordinary = shuffle(pool.filter(question => !question.practical));
    return [...practical.slice(0, quota), ...ordinary, ...practical.slice(quota)].slice(0, perGroup);
  });
  return deepFreeze({ purpose: 'author-preview', bankVersion: openBankVersion, rubricVersion: openRubricVersion,
    specialization, grade, review: openBankReview, questions });
}
