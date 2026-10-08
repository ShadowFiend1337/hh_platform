import { isSpecialization, specializationLabels } from '../shared/catalog.ts';
import { isGrade, gradeLabels } from '../shared/grading.ts';

export const CATEGORY_RECOMMENDATION_POLICY = 'admitted-confirmed-categories-v1';

/** Summarise current, admitted public candidates, never self-reported grades. */
export function recommendCategories(items, { semantic = false } = {}) {
  const groups = new Map();
  for (const [position, item] of items.entries()) {
    const category = item.person?.confirmed;
    if (!category || !isSpecialization(category.specialization) || !isGrade(category.grade)) continue;
    const key = `${category.specialization}:${category.grade}`;
    if (!groups.has(key)) groups.set(key, { specialization: category.specialization, grade: category.grade,
      count: 0, demoCount: 0, candidateIds: [], approximate: true, bestRank: -Infinity, position });
    const group = groups.get(key);
    group.count++;
    if (item.person.synthetic === true) group.demoCount++;
    if (group.candidateIds.length < 3) group.candidateIds.push(item.person.id);
    group.approximate &&= item.approximate === true;
    if (Number.isFinite(item.rank)) group.bestRank = Math.max(group.bestRank, item.rank);
  }
  return [...groups.values()].sort((a, b) => (semantic ? b.bestRank - a.bestRank : 0) || a.position - b.position)
    .map(({ bestRank, position, ...category }) => ({ ...category,
      reason: (semantic
        ? `${specializationLabels[category.specialization]} · ${gradeLabels[category.grade]}: ${category.approximate ? 'ближайшие профили по задачам' : 'профили соответствуют описанным задачам'} и условиям поиска.`
        : `${specializationLabels[category.specialization]} · ${gradeLabels[category.grade]}: опубликованные профили соответствуют выбранным условиям.`)
        + (category.demoCount ? ` Учебных профилей: ${category.demoCount}.` : ''),
    }));
}
