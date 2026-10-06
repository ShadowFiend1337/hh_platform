/** Public search filters. Experience is measured in complete calendar months. */
export interface SearchFilters {
  specialization: string;
  grade: string;
  format: string;
  stack: string[];
  fsp: boolean;
  city: string;
  industry: string;
  salaryMax: number | null;
  experienceMin: number | null;
  experienceMax: number | null;
  employmentType: string;
  language: string;
  hasPortfolio: boolean;
  minScore: number | null;
}

export const languageOptions = [
  { value: 'en', label: 'Английский' }, { value: 'de', label: 'Немецкий' },
  { value: 'fr', label: 'Французский' }, { value: 'es', label: 'Испанский' },
  { value: 'zh', label: 'Китайский' }, { value: 'ru', label: 'Русский' },
];
export const employmentTypes = ['Полная занятость', 'Частичная занятость', 'Проектная работа', 'Стажировка'];

export const defaultSearchFilters: SearchFilters = {
  specialization: '', grade: '', format: '', stack: [], fsp: false,
  city: '', industry: '', salaryMax: null, experienceMin: null, experienceMax: null,
  employmentType: '', language: '', hasPortfolio: false, minScore: null,
};

/** Restore older saved selections without inventing additional restrictions. */
export function normalizeSearchFilters(input: unknown): SearchFilters {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const text = (key: string) => typeof value[key] === 'string' ? value[key].trim().slice(0, 100) : '';
  const number = (key: string, max = Number.MAX_SAFE_INTEGER) => typeof value[key] === 'number'
    && Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= max ? Math.round(value[key]) : null;
  return {
    specialization: text('specialization'), grade: text('grade'), format: text('format'),
    stack: Array.isArray(value.stack) ? [...new Set(value.stack.filter((item): item is string => typeof item === 'string')
      .map(item => item.trim().slice(0, 80)).filter(Boolean))].slice(0, 100) : [],
    fsp: value.fsp === true, city: text('city'), industry: text('industry'),
    salaryMax: number('salaryMax', 10_000_000), experienceMin: number('experienceMin', 1200), experienceMax: number('experienceMax', 1200),
    employmentType: text('employmentType'), language: text('language'),
    hasPortfolio: value.hasPortfolio === true, minScore: number('minScore', 100),
  };
}
