import type { Role } from './model';

export type AssistantPage = 'profile' | 'onboarding' | 'assessment' | 'invitations' | 'candidates' | 'company' | 'privacy';
export interface AssistantLink { label: string; page: AssistantPage }
export interface AssistantTurn { role: 'user' | 'assistant'; content: string; links?: AssistantLink[]; source?: 'llm' | 'rules' }
export interface AssistantInfo { llm: boolean; model: string | null; notice: string }

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/assistant' + path, { ...init, credentials: 'same-origin', cache: 'no-store',
      headers: init.body ? { 'Content-Type': 'application/json' } : undefined });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('Помощник недоступен. Проверьте соединение.');
  }
  const value = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(value?.error || 'Помощник недоступен. Попробуйте позже.');
  return value as T;
}

export function assistantInfo(signal?: AbortSignal) {
  return request<AssistantInfo>('/info', { signal });
}

/** Sends the question, recent turns and a non-identifying context; never profile text or contacts. */
export function askAssistant(message: string, history: AssistantTurn[], page: string, context: Record<string, unknown>, signal?: AbortSignal) {
  return request<{ reply: string; links: AssistantLink[]; source: 'llm' | 'rules' }>('/chat', { method: 'POST', signal,
    body: JSON.stringify({ message, page, context, history: history.slice(-8).map(({ role, content }) => ({ role, content: content.slice(0, 2000) })) }) });
}

export const assistantCopy: Record<Role, { title: string; greeting: string; suggestions: string[] }> = {
  candidate: {
    title: 'Карьерный помощник',
    greeting: 'Здравствуйте! Подскажу, как довести профиль до 100%, подготовиться к тесту и разобраться с приглашениями.',
    suggestions: ['Что сделать дальше, чтобы меня нашли?', 'Как проходит тест и что запрещено?', 'Не прошёл тест — что дальше?',
      'Как привязать ФСП?', 'Когда работодатель увидит мои контакты?'],
  },
  employer: {
    title: 'Помощник по подбору',
    greeting: 'Здравствуйте! Помогу сформулировать запрос, разобраться в подборке и написать приглашение кандидату.',
    suggestions: ['Помогите составить запрос для поиска', 'Напишите текст приглашения', 'Как считается процент совпадения?',
      'Что значит «грейд не подтверждён»?', 'Как опубликовать вакансию?'],
  },
};
