import type { Candidate, Grade, Specialization } from './model';

export interface VacancyInput {
  title: string;
  description: string;
  salaryFrom: number;
  salaryTo: number;
  specialization: Specialization;
  grade: Grade;
  city: string;
  format: string;
  stack: string[];
}

export interface Vacancy extends VacancyInput {
  id: string;
  companyId: string;
  company: string;
  currency: 'RUB';
  status: 'open' | 'closed';
  date: string;
  synthetic: boolean;
}

export interface CompanyDirectoryItem {
  id: string;
  name: string;
  industry: string;
  website: string;
  contact: string;
  description: string;
  synthetic: boolean;
  vacancies: Vacancy[];
}

export interface CompaniesQuery { offset?: number; limit?: number; q?: string }
export interface CompanyPage {
  items: CompanyDirectoryItem[];
  total: number;
  offset: number;
  limit: number;
  nextOffset: number | null;
}

export type ApplicationStatus = 'sent' | 'accepted' | 'rejected';
export interface Application {
  id: string;
  vacancyId: string;
  candidateId: string;
  companyId: string;
  company: string;
  vacancy: Vacancy;
  candidate: Candidate | null;
  status: ApplicationStatus;
  date: string;
  respondedAt: string | null;
  message: string;
  synthetic: boolean;
}

export class CompaniesApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function request<T>(path: string, method = 'GET', data?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api' + path, {
      method, credentials: 'same-origin', cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
      headers: data === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new Error('Не удалось связаться с сервисом. Повторите попытку.');
  }
  let value: unknown;
  try { value = await response.json(); }
  catch { throw new Error('Не удалось получить ответ. Повторите попытку.'); }
  if (!response.ok) {
    const error = value && typeof value === 'object' && 'error' in value ? value.error : null;
    throw new CompaniesApiError(typeof error === 'string' ? error : 'Не удалось выполнить действие.', response.status);
  }
  return value as T;
}

export function listCompanies(signal?: AbortSignal): Promise<CompanyPage>;
export function listCompanies(params?: CompaniesQuery, signal?: AbortSignal): Promise<CompanyPage>;
export function listCompanies(paramsOrSignal: CompaniesQuery | AbortSignal = {}, signal?: AbortSignal): Promise<CompanyPage> {
  const params = paramsOrSignal instanceof AbortSignal ? {} : paramsOrSignal;
  const requestSignal = paramsOrSignal instanceof AbortSignal ? paramsOrSignal : signal;
  const query = new URLSearchParams();
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.q) query.set('q', params.q);
  return request<CompanyPage>('/companies' + (query.size ? '?' + query : ''), 'GET', undefined, requestSignal);
}
export const readCompanies = listCompanies;
export const listVacancies = (signal?: AbortSignal) => request<{ items: Vacancy[] }>('/vacancies', 'GET', undefined, signal);
export const listOwnVacancies = (signal?: AbortSignal) => request<{ items: Vacancy[] }>('/vacancies?own=1', 'GET', undefined, signal);
export const createVacancy = (input: VacancyInput) => request<Vacancy>('/vacancies', 'POST', input);
export const updateVacancy = (id: string, input: VacancyInput) => request<Vacancy>('/vacancies/' + encodeURIComponent(id), 'PATCH', input);
export const closeVacancy = (id: string) => request<Vacancy>('/vacancies/' + encodeURIComponent(id), 'PATCH', { status: 'closed' });
export const applyToVacancy = (id: string, message = '') => request<Application>('/vacancies/' + encodeURIComponent(id) + '/applications', 'POST', { message });
export const listApplications = (role: 'employer' | 'candidate', signal?: AbortSignal) => request<{ items: Application[] }>('/applications?role=' + role, 'GET', undefined, signal);
export const respondToApplication = (id: string, status: 'accepted' | 'rejected') => request<Application>('/applications/' + encodeURIComponent(id), 'PATCH', { status });
