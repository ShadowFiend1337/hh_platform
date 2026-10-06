import type { Candidate } from './model';
import { normalizeSearchFilters, type SearchFilters } from '../../shared/search.ts';

export interface DirectoryCandidate extends Candidate {
  salaryFrom?: number | null;
  salaryTo?: number | null;
  experienceMonths?: number | null;
  employmentType?: string;
  synthetic?: boolean;
}
export interface DirectoryItem {
  person: DirectoryCandidate;
  rank: number;
  reason: string;
  semanticScore: number | null;
}
export interface DirectorySearch {
  items: DirectoryItem[];
  total: number;
  offset: number;
  limit: number;
  query: string;
  interpreted: { salaryMax?: number; specialization?: string; grade?: string; format?: string; city?: string;
    experienceMin?: number; experienceMax?: number; stack?: string[]; language?: string; hasPortfolio?: boolean;
    queryConstraints?: { exclude?: Record<string, string[]>; any?: Record<string, string[]>; all?: Record<string, string[]>;
      groups?: Record<string, string[][]> } };
  effectiveFilters?: SearchFilters;
  model: { status: 'ready' | 'unavailable'; name: string; version: string; dimension: number; trained: boolean };
  warnings?: string[];
}
export interface DirectoryOptions {
  cities: string[];
  industries: string[];
  languages: { value: string; label: string }[];
  employmentTypes: string[];
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/directory' + path, {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
      credentials: 'same-origin', cache: 'no-store',
    });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new Error('Поиск сейчас недоступен. Повторите запрос.');
  }
  let value: unknown;
  try { value = await response.json(); }
  catch { throw new Error('Не удалось получить результаты. Повторите запрос.'); }
  if (!response.ok) {
    const message = value && typeof value === 'object' && 'error' in value ? value.error : null;
    throw new Error(typeof message === 'string' ? message : 'Поиск сейчас недоступен. Повторите запрос.');
  }
  return value as T;
}

export function searchDirectory(query: string, filters: SearchFilters, offset = 0, signal?: AbortSignal): Promise<DirectorySearch> {
  const params = new URLSearchParams({ q: query, filters: JSON.stringify(normalizeSearchFilters(filters)), limit: '30', offset: String(offset) });
  return request<DirectorySearch>('/search?' + params, signal);
}
export function directoryOptions(signal?: AbortSignal): Promise<DirectoryOptions> {
  return request<DirectoryOptions>('/options', signal);
}
