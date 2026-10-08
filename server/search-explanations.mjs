import { isSpecialization, specializationLabels } from '../shared/catalog.ts';
import { isGrade, gradeLabels } from '../shared/grading.ts';
import { languageOptions } from '../shared/search.ts';
import { rankingFspEvidence, normalizeRankingFspEvidence, rankingTraceFor } from './search-ranking.mjs';
import { confirmationOrdering } from './profile-publication.mjs';

export const SEARCH_EXPLANATION_POLICY = 'public-evidence-and-executed-order-v2';

const validScore = value => Number.isFinite(value) && value >= 0 && value <= 100;
const publicText = value => String(value || '').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu, '[контакт скрыт]')
  .replace(/(?:\+?\d[\d ()-]{8,}\d)/gu, value => {
    const digits = value.replace(/\D/gu, '').length;
    return digits >= 10 && digits <= 15 ? '[контакт скрыт]' : value;
  }).replace(/^Вымышленный проект /u, 'Проект ').trim().slice(0, 350);
const fold = value => String(value || '').normalize('NFKC').toLocaleLowerCase('ru');

function confirmedCategory(item) {
  const category = item.person?.confirmed;
  return category && isSpecialization(category.specialization) && isGrade(category.grade) && validScore(category.score)
    ? category : null;
}

function categoryExplanation(person, category) {
  if (category) {
    const demo = person.synthetic === true;
    return { status: demo ? 'demo' : 'confirmed', specialization: category.specialization, grade: category.grade,
      label: `${specializationLabels[category.specialization]} · ${gradeLabels[category.grade]}`,
      explanation: demo ? 'Учебная категория демопрофиля.' : 'Категория подтверждена серверным тестом.' };
  }
  const specialization = isSpecialization(person.specialization) ? person.specialization : null;
  return { status: 'unconfirmed', specialization, grade: null,
    label: specialization ? specializationLabels[specialization] : 'Специализация не указана',
    explanation: 'Грейд не подтверждён. Желаемый грейд не считается результатом теста.' };
}

function matchedConditions(person, category, filters) {
  const result = [];
  const equal = (key, value, label) => {
    if (filters[key] && fold(filters[key]) === fold(value)) result.push({ key, label, value: publicText(value) });
  };
  equal('specialization', category?.specialization, 'Специализация');
  equal('grade', category?.grade, 'Грейд');
  for (const [key, label] of [['city', 'Город'], ['format', 'Формат'], ['industry', 'Отрасль'], ['employmentType', 'Занятость']]) {
    equal(key, person[key], label);
  }
  const stack = (Array.isArray(person.stack) ? person.stack : []).map(fold);
  const matchedStack = (Array.isArray(filters.stack) ? filters.stack : []).filter(skill => stack.includes(fold(skill)));
  if (matchedStack.length) result.push({ key: 'stack', label: 'Навыки', value: matchedStack.map(publicText).join(', ') });
  if (Number.isFinite(filters.salaryMax) && Number.isFinite(person.salaryFrom) && person.salaryFrom <= filters.salaryMax) {
    result.push({ key: 'salaryMax', label: 'Бюджет', value: `Ожидания от ${person.salaryFrom.toLocaleString('ru-RU')} ₽ в месяц укладываются в бюджет.` });
  }
  if (Number.isFinite(person.experienceMonths)) {
    if (Number.isFinite(filters.experienceMin) && person.experienceMonths >= filters.experienceMin) {
      result.push({ key: 'experienceMin', label: 'Опыт', value: 'Опыт не меньше указанного минимума.' });
    }
    if (Number.isFinite(filters.experienceMax) && person.experienceMonths <= filters.experienceMax) {
      result.push({ key: 'experienceMax', label: 'Опыт', value: 'Опыт не превышает указанную границу.' });
    }
  }
  if (filters.language && person.languageCodes?.includes(filters.language)) {
    result.push({ key: 'language', label: 'Язык', value: languageOptions.find(item => item.value === filters.language)?.label || filters.language });
  }
  if (filters.hasPortfolio && person.portfolio) result.push({ key: 'hasPortfolio', label: 'Портфолио', value: 'В профиле указано портфолио.' });
  if (category && Number.isFinite(filters.minScore) && category.score >= filters.minScore) {
    result.push({ key: 'minScore', label: 'Тест', value: 'Результат теста соответствует указанному минимуму.' });
  }
  return result;
}

function evidenceExplanation(item, semantic) {
  if (!semantic) return { kind: 'filters', text: '', explanation: 'Профиль соответствует выбранным условиям поиска.' };
  const text = publicText(item.evidenceText);
  const kind = item.evidenceKind === 'competencies' ? 'competencies' : 'professional';
  if (!text) return { kind: 'unavailable', text: '', explanation: 'Смысловое соответствие найдено по опубликованному профилю; фрагмент основания не передан.' };
  return { kind, text, explanation: kind === 'competencies' ? 'Роль и навыки в профиле:'
    : 'Похожие задачи в профиле:' };
}

function fspExplanation(person, source, contribution) {
  // Resolve provenance on the server. A profile's IDs, arbitrary flags and
  // achievement labels are never treated as an authenticated provider answer.
  const evidence = normalizeRankingFspEvidence(person, source);
  const demo = evidence === 'synthetic-demo';
  const verified = evidence === 'verified-fsp';
  const supplied = Array.isArray(person.achievements) && person.achievements.length > 0;
  const status = demo ? 'demo' : verified ? 'verified' : supplied ? 'unverified' : 'none';
  const actualContribution = demo || verified ? contribution : 'none';
  const origin = demo ? (person.synthetic === true ? 'Демонстрационные достижения ФСП — учебный пример.'
    : 'Достижения ФСП получены из демонстрационного провайдера; личность не подтверждена.') : verified ? 'Достижения ФСП подтверждены подключённым провайдером.'
    : supplied ? 'Указанные достижения не подтверждены провайдером ФСП.' : 'Подтверждённых достижений ФСП нет.';
  const effect = actualContribution === 'comparison' ? ' Они учтены при сравнении близких профилей той же категории.'
    : actualContribution === 'filter-tiebreak' ? ' Они используются при равном результате теста.'
      : demo || verified ? ' В этой выдаче они не меняют порядок.' : ' Они не дают прибавку к порядку выдачи.';
  return { status, contribution: actualContribution, explanation: origin + effect };
}

/** Annotate admitted public results; return their existing order and scores. */
export function explainSearchResults(items, { semantic = false, scoreKind = 'logit', filters = {},
  fspEvidence = rankingFspEvidence } = {}) {
  if (!Array.isArray(items)) throw new TypeError('Expected search results');
  if (scoreKind !== 'logit' && scoreKind !== 'cosine') throw new TypeError('Unknown semantic score kind');
  if (typeof fspEvidence !== 'function') throw new TypeError('Expected a trusted FSP evidence resolver');
  return items.map(item => {
    const person = item.person || {}, category = confirmedCategory(item);
    const trace = semantic ? rankingTraceFor(item, scoreKind) : null;
    const publicationOrder = confirmationOrdering(item);
    const comparable = Boolean(category && trace && trace.comparableCount > 1);
    const source = trace ? trace.fspSource : fspEvidence(person);
    // Filtering-only search really sorts by test then FSP, whereas semantic
    // search only allows evidence to exchange positions within close bands.
    const testContribution = !category ? 'none' : !semantic ? 'filter-order' : comparable ? 'comparison' : 'none';
    const test = { status: !category ? 'absent' : person.synthetic === true ? 'demo' : 'confirmed',
      score: category?.score ?? null, contribution: testContribution,
      explanation: !category ? 'Серверного результата теста нет.'
        : !semantic ? 'Сначала учитывается результат теста; ФСП используется при равенстве результата.'
          : comparable ? 'Результат теста учитывается среди близких по задачам профилей той же категории.'
            : trace ? 'В этой выдаче нет близких профилей той же категории для сравнения по тесту.'
              : 'Влияние результата теста на смысловой порядок не подтверждено выполненным ранжированием.' };
    const fsp = fspExplanation(person, source, !category ? 'none' : semantic
      ? comparable ? 'comparison' : 'none' : 'filter-tiebreak');
    const categoryInfo = categoryExplanation(person, category);
    const evidence = evidenceExplanation(item, semantic);
    const conditions = matchedConditions(person, category, filters);
    if (filters.fsp && ['demo', 'verified'].includes(fsp.status)) conditions.push({ key: 'fsp', label: 'ФСП',
      value: fsp.status === 'demo' ? 'Учебный пример достижений ФСП.' : 'Есть подтверждённые достижения ФСП.' });
    const mode = !category ? 'unconfirmed' : !semantic ? 'filter-score' : comparable ? 'category-evidence-band' : 'semantic-only';
    const ordering = { mode, comparableCount: trace?.comparableCount ?? 0, changedWithinBand: trace?.changedWithinBand === true,
      confirmationPriority: { applied: Boolean(publicationOrder), policy: publicationOrder?.policy ?? null,
        group: publicationOrder?.group ?? null, mixedGroups: publicationOrder?.mixedGroups === true,
        changedPosition: publicationOrder?.changedPosition === true },
      explanation: !category ? 'Желаемый грейд и неподтверждённые достижения не повышают профиль.'
        : !semantic ? 'Порядок определяется результатом теста, затем достижениями ФСП; равные профили упорядочиваются стабильно.'
          : comparable ? (trace.changedWithinBand ? 'Положение изменилось при сравнении теста и достижений внутри группы близких профилей той же подтверждённой категории.'
            : 'Сравнение по тесту и достижениям сохранило положение среди близких профилей той же подтверждённой категории.')
            : 'Порядок определяется смысловым соответствием задачам; тест и ФСП здесь не меняют положение.' };
    if (publicationOrder?.mixedGroups) {
      const priority = publicationOrder.group === 'confirmed'
        ? 'Профили с подтверждённой категорией показаны первыми. Далее описан порядок внутри этой группы.'
        : 'Профиль показан после кандидатов с подтверждённой категорией.';
      ordering.explanation = `${priority} ${ordering.explanation}`;
    }
    const relevance = item.approximate === true ? 'nearest' : semantic ? 'semantic' : 'filters';
    const testSummary = !category ? test.explanation : `${person.synthetic === true ? 'Учебный результат теста' : 'Серверный результат теста'}: ${category.score}/100.`;
    const parts = [`${categoryInfo.label}. ${categoryInfo.explanation}`, item.approximate === true
      ? 'Это ближайший профиль: точных совпадений не найдено.' : '', evidence.text ? `${evidence.explanation} ${evidence.text}` : evidence.explanation,
    conditions.length ? `Условия: ${conditions.map(condition => condition.value).join('; ')}.` : '', testSummary,
    fsp.explanation, ordering.explanation];
    return { ...item, reason: parts.filter(Boolean).join(' '), explanation: { policy: SEARCH_EXPLANATION_POLICY,
      relevance, category: categoryInfo, evidence, conditions, test, fsp, ordering } };
  });
}
