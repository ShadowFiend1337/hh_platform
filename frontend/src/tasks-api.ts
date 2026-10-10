export type TaskStatus = 'assigned' | 'scheduled' | 'overdue' | 'submitted' | 'approved' | 'rejected' | 'cancelled';
export type TaskRecurrence = 0 | 7 | 30 | 90;
export interface TaskFreshness { lastCompletedAt: string; source: 'employer_review' }

export interface EmployerTask {
  id: string;
  seriesId: string;
  cycle: number;
  candidateId: string;
  candidate: { id: string; name: string };
  company: string;
  title: string;
  description: string;
  recurrenceDays: TaskRecurrence;
  availableAt: string;
  dueAt: string;
  status: TaskStatus;
  answer: string;
  answeredAt: string | null;
  feedback: string;
  reviewedAt: string | null;
  date: string;
}
export interface TaskPage {
  items: EmployerTask[];
  total: number;
  nextOffset: number | null;
  freshness: TaskFreshness | null;
}
export interface TaskCandidate {
  id: string;
  name: string;
  specialization: string;
  source: 'invitation' | 'application';
  freshness: TaskFreshness | null;
}
export interface TaskInput {
  candidateId: string;
  title: string;
  description: string;
  dueAt: string;
  recurrenceDays: TaskRecurrence;
}
export interface TaskReview {
  verdict: 'approve' | 'revise';
  score: number | null;
  summary: string;
  strengths: string[];
  gaps: string[];
  questions: string[];
  source: 'llm' | 'rules';
  model: string | null;
}

async function request<T>(path: string, method = 'GET', data?: unknown, signal?: AbortSignal, timeout = 15000): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api' + path, {
      method, credentials: 'same-origin', cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
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
    throw new Error(typeof error === 'string' ? error : 'Не удалось выполнить действие.');
  }
  return value as T;
}

export const listTasks = (signal?: AbortSignal) => request<TaskPage>('/tasks?limit=100', 'GET', undefined, signal);
export const listTaskCandidates = (signal?: AbortSignal) => request<{ items: TaskCandidate[] }>('/tasks/candidates', 'GET', undefined, signal);
export const assignTask = (input: TaskInput) => request<EmployerTask>('/tasks', 'POST', input);
export const answerTask = (id: string, answer: string) => request<EmployerTask>('/tasks/' + encodeURIComponent(id) + '/answer', 'POST', { answer });
export const reviewTask = (id: string, status: 'approved' | 'rejected' | 'cancelled', feedback = '') =>
  request<{ task: EmployerTask; nextTask: EmployerTask | null }>('/tasks/' + encodeURIComponent(id) + '/review', 'POST', { status, feedback });
export const aiReviewTask = (id: string) => request<TaskReview>('/tasks/' + encodeURIComponent(id) + '/ai-review', 'POST', {}, undefined, 60000);

export const taskStatusLabels: Record<TaskStatus, string> = {
  assigned: 'Ждёт ответа', scheduled: 'Запланировано', overdue: 'Срок истёк', submitted: 'На проверке',
  approved: 'Принято', rejected: 'На доработку', cancelled: 'Отменено',
};
export const recurrenceLabels: Record<TaskRecurrence, string> = { 0: 'Разово', 7: 'Каждую неделю', 30: 'Каждый месяц', 90: 'Раз в квартал' };

/** «сегодня», «вчера», «5 дн. назад» — how fresh the last approved task is. */
export function freshnessLabel(freshness: TaskFreshness | null | undefined, now = Date.now()) {
  if (!freshness) return '';
  const days = Math.max(0, Math.floor((now - Date.parse(freshness.lastCompletedAt)) / 86400000));
  return days === 0 ? 'сегодня' : days === 1 ? 'вчера' : days + ' дн. назад';
}
