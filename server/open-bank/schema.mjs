import { specializationOptions } from '../../shared/catalog.ts';
import { gradeOptions } from '../../shared/grading.ts';
import { isPracticalFamily, practicalQuota } from './policy.mjs';

export const openGrades = gradeOptions.map(item => item.value);
export const openGroups = ['A', 'B', 'C', 'D'];
export const openSpecializations = specializationOptions.map(item => item.value);
export const technicalSpecializations = openSpecializations.filter(value => !['UXUI', 'BusinessAnalysis', 'ProductManagement'].includes(value));
const languages = new Set(['python', 'javascript', 'typescript', 'sql', 'text']);
const allowedPersonalization = new Set(['domain', 'entityNames', 'projectContext', 'stack', 'dataLabels', 'companyContext']);

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

const text = value => typeof value === 'string' && value.trim().length > 0;
const texts = value => Array.isArray(value) && value.length > 0 && value.every(text);
const normalize = value => value.normalize('NFKC').toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function validateCriteria(criteria, name, errors, scope) {
  if (!Array.isArray(criteria) || criteria.length < 3) {
    errors.push(`${name}: needs subject-specific criteria`);
    return;
  }
  const ids = new Set();
  for (const criterion of criteria) {
    if (!text(criterion?.id) || criterion.id === 'level-depth' || ids.has(criterion.id)) errors.push(`${name}: duplicate or reserved criterion ID`);
    ids.add(criterion?.id);
    for (const key of ['label', 'missing', 'partial', 'meets', 'strong']) if (!text(criterion?.[key])) errors.push(`${name}/${criterion?.id}: missing ${key}`);
    if (new Set(['missing', 'partial', 'meets', 'strong'].map(key => criterion?.[key])).size !== 4) errors.push(`${name}/${criterion?.id}: indistinguishable rubric anchors`);
    if (criterion?.skillId !== undefined && (!/^[A-Za-z]+:[A-D]:[a-z0-9:-]+$/u.test(criterion.skillId)
      || !criterion.skillId.startsWith(scope + ':'))) errors.push(`${name}/${criterion.id}: invalid skill ID or program scope`);
  }
}

/** Structural checks do not calibrate a rubric or endorse a professional grade. */
export function validateOpenBank(families, sources) {
  const errors = [];
  const familyIds = new Set();
  const prompts = new Map();
  const sourceIds = new Set();
  for (const source of sources) {
    const name = source?.id || '<source>';
    if (!text(source?.id) || sourceIds.has(source.id)) errors.push(`${name}: duplicate or missing source ID`);
    sourceIds.add(source?.id);
    for (const key of ['title', 'publisher', 'note']) if (!text(source?.[key])) errors.push(`${name}: missing ${key}`);
    try { if (new URL(source.url).protocol !== 'https:') throw new Error(); }
    catch { errors.push(`${name}: source URL must be HTTPS`); }
    if (!['technical-reference', 'public-interview-material'].includes(source?.kind)) errors.push(`${name}: unknown source kind`);
    if (!['opened', 'search-index'].includes(source?.verification)) errors.push(`${name}: missing verification method`);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(source?.accessedOn || '')) errors.push(`${name}: missing access date`);
    if (source?.usage !== 'original-scenario-no-verbatim-copy') errors.push(`${name}: unclear content provenance`);
  }
  for (const family of families) {
    const name = family?.id || '<family>';
    if (!/^open-[a-z0-9-]+$/u.test(family?.id || '') || familyIds.has(family.id)) errors.push(`${name}: duplicate or invalid family ID`);
    familyIds.add(family?.id);
    if (!openSpecializations.includes(family?.specialization)) errors.push(`${name}: unknown specialization`);
    if (!openGroups.includes(family?.group)) errors.push(`${name}: unknown competency group`);
    for (const key of ['title', 'prompt', 'referenceAnswer']) if (!text(family?.[key])) errors.push(`${name}: missing ${key}`);
    if (text(family?.prompt)) {
      const normalized = normalize(family.prompt);
      if (prompts.has(normalized)) errors.push(`${name}: duplicate scenario of ${prompts.get(normalized)}`);
      else prompts.set(normalized, name);
    }
    for (const key of ['tags', 'sourceIds', 'acceptableAlternatives', 'criticalErrors']) if (!texts(family?.[key])) errors.push(`${name}: missing ${key}`);
    for (const id of family?.sourceIds || []) if (!sourceIds.has(id)) errors.push(`${name}: unknown source ${id}`);
    if (!['text', 'code'].includes(family?.answerFormat)) errors.push(`${name}: unknown answer format`);
    if (family?.answerFormat === 'code' && !languages.has(family.language)) errors.push(`${name}: code requires a supported language or pseudocode`);
    if (family?.answerFormat === 'text' && family.language !== null) errors.push(`${name}: text task must not force a code language`);
    if (family?.practical !== undefined && typeof family.practical !== 'boolean') errors.push(`${name}: invalid practical flag`);
    const scope = family?.specialization + ':' + family?.group;
    validateCriteria(family?.criteria, name, errors, scope);
    const levelTasks = new Set();
    const levelExpectations = new Set();
    for (const grade of openGrades) {
      const level = family?.levels?.[grade];
      if (!text(level?.task) || !text(level?.expected)) errors.push(`${name}: incomplete ${grade} scenario and expected action`);
      if (level?.referenceAnswer !== undefined && !text(level.referenceAnswer)) errors.push(`${name}/${grade}: missing level reference answer`);
      if (level?.criteria !== undefined) validateCriteria(level.criteria, `${name}/${grade}`, errors, scope);
      levelTasks.add(level?.task);
      levelExpectations.add(level?.expected);
    }
    if (levelTasks.size !== openGrades.length || levelExpectations.size !== openGrades.length) errors.push(`${name}: grade scenarios must differ in conditions and expected actions`);
    if (!texts(family?.personalization?.invariants) || !texts(family?.personalization?.allowed)) errors.push(`${name}: missing personalization boundaries`);
    for (const key of family?.personalization?.allowed || []) if (!allowedPersonalization.has(key)) errors.push(`${name}: unsupported personalization field ${key}`);
  }
  for (const specialization of openSpecializations) for (const group of openGroups) {
    const pool = families.filter(family => family.specialization === specialization && family.group === group);
    if (pool.length < 10) errors.push(`${specialization}/${group}: insufficient family coverage`);
    if (pool.filter(isPracticalFamily).length < 2 * practicalQuota(specialization, group)) errors.push(`${specialization}/${group}: insufficient practical coverage for two forms`);
    if (technicalSpecializations.includes(specialization) && pool.filter(family => family.answerFormat === 'code').length < 2) errors.push(`${specialization}/${group}: insufficient applied code/pseudocode coverage`);
  }
  return errors;
}
