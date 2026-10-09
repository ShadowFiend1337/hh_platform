// Employer-facing match percentage. It summarises signals that already decided
// admission and order, so it never contradicts the explanation:
//   tasks      — semantic fit of described work (only for a text query; every
//                shown profile passed the model's admission cutoff, so the scale
//                starts at 55% and spreads by the executed rank within the result);
//   category   — confirmed specialization/grade versus the employer's request;
//   stack      — share of requested technologies present in the profile;
//   test       — server test score of the confirmed category;
//   fsp        — provider-backed FSP achievements.
// Components the employer did not ask about are left out and weights renormalised.
export const MATCH_POLICY = 'weighted-public-signals-v1';
const weights = { tasks: 45, category: 20, stack: 15, test: 15, fsp: 5 };
const fold = value => String(value || '').normalize('NFKC').toLocaleLowerCase('ru');

function categoryFit(person, filters) {
  const confirmed = person.confirmed;
  const wantSpecialization = filters.specialization || '';
  const wantGrade = filters.grade || '';
  const specialization = confirmed?.specialization || person.specialization;
  if (wantSpecialization && specialization !== wantSpecialization) return 0.2;
  if (!confirmed) return wantGrade ? 0.35 : 0.45;
  if (wantGrade && confirmed.grade !== wantGrade) return 0.6;
  return 1;
}

export function annotateMatches(items, { semantic = false, filters = {} } = {}) {
  const ranks = items.map(item => item.rank).filter(Number.isFinite);
  const top = Math.max(...ranks), bottom = Math.min(...ranks);
  const requestedStack = (Array.isArray(filters.stack) ? filters.stack : []).map(fold);
  return items.map(item => {
    const person = item.person || {};
    const parts = [];
    if (semantic) {
      const spread = top - bottom;
      const relative = !Number.isFinite(item.rank) ? 0 : spread > 1e-9 ? (item.rank - bottom) / spread : 1;
      const value = item.approximate ? 0.35 + 0.15 * relative : 0.55 + 0.45 * relative;
      parts.push({ key: 'tasks', label: item.approximate ? 'Задачи (ближайшее совпадение)' : 'Задачи из профиля', value });
    }
    parts.push({ key: 'category', label: person.confirmed ? 'Подтверждённая категория' : 'Категория не подтверждена', value: categoryFit(person, filters) });
    if (requestedStack.length) {
      const stack = new Set((Array.isArray(person.stack) ? person.stack : []).map(fold));
      parts.push({ key: 'stack', label: 'Требуемый стек', value: requestedStack.filter(skill => stack.has(skill)).length / requestedStack.length });
    }
    const score = Number(person.confirmed?.score);
    parts.push({ key: 'test', label: 'Результат теста', value: Number.isFinite(score) ? Math.max(0, Math.min(1, score / 100)) : 0 });
    const fspStatus = item.explanation?.fsp?.status;
    parts.push({ key: 'fsp', label: 'Достижения ФСП', value: fspStatus === 'verified' || fspStatus === 'demo' ? 1 : 0 });
    const total = parts.reduce((sum, part) => sum + weights[part.key], 0);
    const percent = Math.round(parts.reduce((sum, part) => sum + weights[part.key] * part.value, 0) / total * 100);
    // Largest-remainder rounding keeps the displayed weights summing to exactly 100.
    const shares = parts.map(part => weights[part.key] / total * 100);
    const rounded = shares.map(Math.floor);
    shares.map((share, index) => [share - rounded[index], index]).sort((a, b) => b[0] - a[0])
      .slice(0, 100 - rounded.reduce((sum, value) => sum + value, 0)).forEach(([, index]) => { rounded[index]++; });
    return { ...item, match: { policy: MATCH_POLICY, percent,
      parts: parts.map((part, index) => ({ ...part, value: Math.round(part.value * 100), weight: rounded[index] })) } };
  });
}
