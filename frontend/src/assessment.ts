import type { CandidateSurvey, Grade, Specialization, TestResult } from './model';
import { readCodeDrafts, type CodeDraft } from './code-drafts';

export interface AssessmentProgram {
  closedCount?: number;
  openCount?: number;
  openMinutes?: { min: number; max: number };
  weights?: { closed: number; open: number };
  generation?: { configured: boolean; required: boolean };
  bankVersion: string;
  topics: string[];
  questionCount: number;
  threshold: number;
  expiresInMinutes: number;
  questionSeconds: number;
  maxDepartures: number;
  confidentThreshold: number;
  retryDays: number;
  delivery: 'sequential';
  bank: { authored: number; generated: { pilot: number; active: number; retired: number; rejected: number } | null };
  examples: { id: string; title: string; description: string }[];
}

export interface AssessmentQuestion {
  type?: 'open' | 'single-choice';
  context?: string;
  title?: string;
  answerFormat?: string;
  timeLimitSec?: number;
  id: string;
  topic: string;
  text: string;
  options: { id: string; text: string }[];
}

export interface AssessmentAttempt {
  id: string;
  token: string;
  bankVersion: string;
  specialization: Specialization;
  grade: Grade;
  surveyId: string;
  createdAt: string;
  expiresAt: string;
  serverNow?: string;
  questions: AssessmentQuestion[];
  blueprint: {
    topicCounts: Record<string, number>;
    difficultyCounts: Record<string, number>;
    difficultyBudget: number;
  };
  vacancy: {
    matchedSkills: string[];
    unmatchedSkills: string[];
    focusTopics: string[];
    recognized: boolean;
  } | null;
  status?: 'preparing' | 'ready' | 'failed' | 'active' | 'pending-review' | 'completed';
  generation?: { done: number; total: number };
  preparationError?: string;
  result?: TestResult;
  integrity?: AssessmentIntegrity;
  /** Sequential delivery: only answered questions and the current one are present. */
  delivery?: 'sequential' | 'all';
  questionCount?: number;
  position?: number;
  questionSeconds?: number;
  answeredIds?: string[];
  currentDeadline?: string | null;
  complete?: boolean;
}

export interface AssessmentIntegrity {
  departures: number;
  blockedCopies: number;
  blockedActions?: number;
  fullscreenExits?: number;
  lastEventAt: string | null;
}

export type StrikeKind = 'focus_lost' | 'visibility_hidden' | 'fullscreen_exit' | 'second_tab';
export type SignalKind = 'copy_blocked' | 'paste_blocked' | 'shortcut_blocked' | 'screenshot_key';

export interface AssessmentIntegrityEvent {
  id: string;
  kind: StrikeKind | SignalKind;
}

export interface IntegrityResponse extends AssessmentIntegrity {
  remaining: number;
  annulled: boolean;
  result?: TestResult;
}

export interface SavedAssessment {
  id: string;
  token: string;
  surveyId: string;
  answers: Record<string, string>;
  index: number;
  codeDrafts?: Record<string, CodeDraft>;
  answerDrafts?: Record<string, string>;
}

export class AssessmentError extends Error {
  status: number;
  details: { retryAt?: string; lowerGrades?: string[] };
  constructor(message: string, status: number, details: { retryAt?: string; lowerGrades?: string[] } = {}) {
    super(message);
    this.name = 'AssessmentError';
    this.status = status;
    this.details = details;
  }
}

const sessionKey = 'predel:assessment:v1';

export function readAssessment(): SavedAssessment | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
    if (!value || typeof value.id !== 'string' || typeof value.token !== 'string' || typeof value.surveyId !== 'string') return null;
    return {
      id: value.id, token: value.token, surveyId: value.surveyId,
      answers: value.answers && typeof value.answers === 'object' && !Array.isArray(value.answers)
        ? Object.fromEntries(Object.entries(value.answers).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : {},
      index: Number.isInteger(value.index) && value.index >= 0 ? value.index : 0,
      codeDrafts: readCodeDrafts(value.codeDrafts),
      answerDrafts: value.answerDrafts && typeof value.answerDrafts === 'object' && !Array.isArray(value.answerDrafts) ? Object.fromEntries(Object.entries(value.answerDrafts).filter((e): e is [string,string] => typeof e[1] === 'string' && e[1].length <= 12000)) : {},
    };
  } catch { return null; }
}

export function saveAssessment(value: SavedAssessment | null) {
  try {
    if (value) sessionStorage.setItem(sessionKey, JSON.stringify(value));
    else sessionStorage.removeItem(sessionKey);
    return true;
  } catch { return false; /* An attempt remains usable in memory when session storage is unavailable. */ }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/assessment' + path, {
      ...options, credentials: 'same-origin', cache: 'no-store',
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new AssessmentError('Сервис тестирования недоступен. Попробуйте ещё раз.', 0);
  }
  let value: unknown;
  try { value = await response.json(); }
  catch { throw new AssessmentError('Сервис тестирования недоступен. Попробуйте ещё раз.', response.status); }
  if (!response.ok) {
    const message = value && typeof value === 'object' && 'error' in value && typeof value.error === 'string'
      ? value.error : 'Не удалось выполнить запрос. Попробуйте ещё раз.';
    const details = value && typeof value === 'object' ? {
      retryAt: 'retryAt' in value && typeof value.retryAt === 'string' ? value.retryAt : undefined,
      lowerGrades: 'lowerGrades' in value && Array.isArray(value.lowerGrades) ? value.lowerGrades.filter((item): item is string => typeof item === 'string') : undefined,
    } : {};
    throw new AssessmentError(message, response.status, details);
  }
  return value as T;
}

export function getAssessmentProgram(specialization: Specialization, grade: Grade, signal?: AbortSignal) {
  return request<AssessmentProgram>('/program?' + new URLSearchParams({ specialization, grade }), { signal });
}

export function createAssessment(survey: CandidateSurvey, vacancyDescription: string, signal?: AbortSignal) {
  // The test service needs competencies, never resume contacts or additional biography.
  const { id, date, industry, professionalRole, specialization, desiredGrade, experience, stack, softSkills } = survey;
  return request<AssessmentAttempt>('/attempts', {
    method: 'POST', signal,
    body: JSON.stringify({ survey: { id, date, industry, professionalRole, specialization, desiredGrade, experience, stack, softSkills }, ...(vacancyDescription.trim() ? { vacancyDescription: vacancyDescription.trim() } : {}) }),
  });
}

export function resumeAssessment(attempt: SavedAssessment, signal?: AbortSignal) {
  return request<AssessmentAttempt>('/attempts/' + encodeURIComponent(attempt.id), {
    signal, headers: { 'X-Attempt-Token': attempt.token },
  });
}

export function startAssessment(attempt: AssessmentAttempt, signal?: AbortSignal) {
  return request<AssessmentAttempt>('/attempts/' + attempt.id + '/start', {method:'POST', signal, body:JSON.stringify({token:attempt.token})});
}
export function getAssessmentResult(id: string, signal?: AbortSignal) {
  return request<TestResult>('/results/' + encodeURIComponent(id), {signal});
}

/** Locks the answer to the current question; `null` records a skipped or timed-out question. */
export function answerAssessment(attempt: AssessmentAttempt, questionId: string, optionId: string | null, signal?: AbortSignal, answerText?: string | null) {
  return request<AssessmentAttempt>('/attempts/' + encodeURIComponent(attempt.id) + '/answer', {
    method: 'POST', signal, body: JSON.stringify({ token: attempt.token, questionId, ...(attempt.questions.find(q => q.id === questionId)?.type === 'open' ? {answerText:answerText ?? null} : {optionId}) }),
  });
}

/** Sequential attempts are graded from the answers already locked on the server. */
export function submitAssessment(attempt: AssessmentAttempt, signal?: AbortSignal) {
  return request<TestResult>('/attempts/' + encodeURIComponent(attempt.id) + '/submit', {
    method: 'POST', signal, body: JSON.stringify({ token: attempt.token }),
  });
}

export function recordAssessmentIntegrity(attempt: AssessmentAttempt, event: AssessmentIntegrityEvent, signal?: AbortSignal) {
  return request<IntegrityResponse>('/attempts/' + encodeURIComponent(attempt.id) + '/integrity', {
    method: 'POST', signal, keepalive: true,
    body: JSON.stringify({ token: attempt.token, event: { id: event.id, kind: event.kind } }),
  });
}
