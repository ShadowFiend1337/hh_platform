import { normalizeSearchFilters, type SearchFilters } from './search.ts';

export const MAX_HIRING_NEEDS = 20;
export const HIRING_NEED_LIMITS = Object.freeze({ id: 100, title: 200, team: 2000, tasks: 1200 });

/** Private employer brief; category recommendations are derived from current profiles. */
export interface HiringNeed {
  id: string;
  title: string;
  team: string;
  tasks: string;
  filters: SearchFilters;
}

// Browser draft recovery only. The server validates the original submission
// strictly and binds every saved need to the authenticated employer.
export function normalizeHiringNeeds(input: unknown): HiringNeed[] {
  if (!Array.isArray(input)) return [];
  const ids = new Set<string>();
  const result: HiringNeed[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const value = item as Record<string, unknown>;
    const text = (key: keyof typeof HIRING_NEED_LIMITS) => typeof value[key] === 'string'
      ? value[key].slice(0, HIRING_NEED_LIMITS[key]).trim() : '';
    const id = text('id'), title = text('title');
    if (!id || !title || ids.has(id)) continue;
    const filters = normalizeSearchFilters(value.filters);
    const tasks = text('tasks');
    if (!tasks && !filters.specialization && !filters.stack.length) continue;
    ids.add(id);
    result.push({ id, title, team: text('team'), tasks, filters });
    if (result.length === MAX_HIRING_NEEDS) break;
  }
  return result;
}
