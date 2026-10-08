import type { Candidate } from './model';
import { normalizeSearchFilters, type SearchFilters } from '../../shared/search.ts';
import type { Specialization } from '../../shared/catalog.ts';
import type { Grade } from '../../shared/grading.ts';

export interface DirectoryCategorySelection { specialization: Specialization; grade: Grade }
export interface DirectoryCategory extends DirectoryCategorySelection {
  count: number;
  demoCount?: number;
  candidateIds: string[];
  reason: string;
  approximate: boolean;
}

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
  rerankerScore?: number;
  approximate?: true;
  evidenceKind?: 'professional' | 'competencies';
}
export interface DirectoryReranker {
  version: string;
  threshold: number;
  baseModel: string;
  revision: string;
  maxLength: number;
  weightsSha256?: string;
  scoreCalibration?: {
    kind: 'pooled-LDA-diagonal-shrinkage-v1' | 'class-QDA-diagonal-shrinkage-v1';
    quadraticMatrix?: [[number, number], [number, number]];
    weights: [number, number]; bias: number; threshold: number;
    shrink: 0.1; split: 'dev'; hashes: Record<string, string>;
    featurePolicy: { features: ['encoderCosine', 'crossEncoderRawLogit']; encoderQueryContext: 'raw-query';
      encoderDocumentContext: 'task-section-without-role'; crossEncoderQueryContext: 'raw-query';
      crossEncoderDocumentContext: 'catalog-professional-role-newline-task-section';
      aggregation: 'maximum-fused-score-over-task-sections';
      formula: 'weights[0]*encoderCosine+weights[1]*crossEncoderRawLogit+bias'
        | 'features^T*quadraticMatrix*features+weights[0]*encoderCosine+weights[1]*crossEncoderRawLogit+bias' };
    DEVmetrics: { resubstitution: true; [key: string]: unknown };
    admission?: { kind: 'query-max-applicability-top3-v1'; threshold: number; limit: 3; split: 'dev';
      metrics: { resubstitution: true; heldOutScored: false; functionalBenchmarkScored: false; [key: string]: unknown };
      hashes: Record<string, string> };
  };
}
export interface DirectorySearch {
  items: DirectoryItem[];
  categories?: DirectoryCategory[];
  selectedCategory?: DirectoryCategorySelection | null;
  total: number;
  offset: number;
  limit: number;
  query: string;
  interpreted: { salaryMax?: number; specialization?: string; grade?: string; format?: string; city?: string;
    experienceMin?: number; experienceMax?: number; stack?: string[]; language?: string; hasPortfolio?: boolean; unsupportedRole?: string[];
    queryConstraints?: { exclude?: Record<string, string[]>; any?: Record<string, string[]>; all?: Record<string, string[]>;
      groups?: Record<string, string[][]> } };
  effectiveFilters?: SearchFilters;
  model: { status: 'ready' | 'unavailable'; name: string; version: string; dimension: number; trained: boolean;
    indexPolicy?: string; profileEvidencePolicy?: string; taskEvidencePolicy?: string; categoryRecommendationPolicy?: string;
    reranker?: DirectoryReranker; stage?: DirectoryReranker;
    rerankerAggregation?: 'max-task-sections-v1' | 'max-fused-task-sections-v1'
      | 'max-professional-sections-v2' | 'max-fused-professional-sections-v2' };
  warnings?: string[];
}
export interface DirectoryOptions {
  cities: string[];
  industries: string[];
  languages: { value: string; label: string }[];
  employmentTypes: string[];
}

async function request<T>(path: string, signal?: AbortSignal, timeoutMs = 30_000): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/directory' + path, {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
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

export function searchDirectory(query: string, filters: SearchFilters, offset = 0, signal?: AbortSignal, category?: DirectoryCategorySelection | null): Promise<DirectorySearch> {
  const params = new URLSearchParams({ q: query, filters: JSON.stringify(normalizeSearchFilters(filters)), limit: '30', offset: String(offset) });
  if (category) params.set('category', JSON.stringify(category));
  // A cold local model must load and index profiles before answering. Keep
  // this wait bounded while allowing a newer query to cancel it immediately.
  return request<DirectorySearch>('/search?' + params, signal, 120_000);
}
export function directoryOptions(signal?: AbortSignal): Promise<DirectoryOptions> {
  return request<DirectoryOptions>('/options', signal);
}
