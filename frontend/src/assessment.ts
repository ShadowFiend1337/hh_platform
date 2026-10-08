import type { CandidateSurvey, Grade, Specialization, TestResult } from './model';

export interface AssessmentProgram {
  bankVersion: string;
  topics: string[];
  questionCount: number;
  threshold: number;
  expiresInMinutes: number;
  examples: { id: string; title: string; description: string }[];
}

export interface AssessmentQuestion {
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
  status?: 'active' | 'completed';
  result?: TestResult;
  integrity?: AssessmentIntegrity;
}

export interface AssessmentIntegrity {
  departures: number;
  blockedCopies: number;
  lastEventAt: string | null;
}

export interface AssessmentIntegrityEvent {
  id: string;
  kind: 'focus_lost' | 'visibility_hidden' | 'copy_blocked';
}

export interface SavedAssessment {
  id: string;
  token: string;
  surveyId: string;
  answers: Record<string, string>;
  index: number;
}

export class AssessmentError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AssessmentError';
    this.status = status;
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
    };
  } catch { return null; }
}

export function saveAssessment(value: SavedAssessment | null) {
  try {
    if (value) sessionStorage.setItem(sessionKey, JSON.stringify(value));
    else sessionStorage.removeItem(sessionKey);
  } catch { /* An attempt remains usable in memory when session storage is unavailable. */ }
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
    throw new AssessmentError(message, response.status);
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

export function submitAssessment(attempt: AssessmentAttempt, answers: Record<string, string>, signal?: AbortSignal) {
  return request<TestResult>('/attempts/' + encodeURIComponent(attempt.id) + '/submit', {
    method: 'POST', signal,
    body: JSON.stringify({ token: attempt.token, answers: attempt.questions.map(question => ({ questionId: question.id, optionId: answers[question.id] })) }),
  });
}

export function recordAssessmentIntegrity(attempt: AssessmentAttempt, event: AssessmentIntegrityEvent, signal?: AbortSignal) {
  return request<AssessmentIntegrity>('/attempts/' + encodeURIComponent(attempt.id) + '/integrity', {
    method: 'POST', signal, keepalive: true,
    body: JSON.stringify({ token: attempt.token, event: { id: event.id, kind: event.kind } }),
  });
}
