export interface Evidence {
  id: string; provider: string; title: string; discipline: string; occurredAt: string; result: string;
  place: number | null; participation: 'individual' | 'team'; teamRole: string | null; sourceUrl: string | null;
  status: 'verified' | 'unverified' | 'demo' | 'stale' | 'revoked'; identityVerified: boolean;
  checkedAt: string; validUntil: string; verificationMethod?: 'manual_review' | 'profile_challenge' | 'api_token' | 'oauth2';
  skills: { skill: string; scope: 'individual_result' | 'team_result'; ruleVersion: string }[];
}
export interface IntegrationProvider { id: string; name: string; mode: 'live' | 'demo'; auth?: 'oidc' | 'demo' | 'profile_challenge' | 'api_token' | 'oauth2'; enabled: boolean; scenarios?: string[] }
export interface IntegrationConnection {
  id: string; provider: string; externalId: string; identityVerified: boolean; status: string;
  lastSyncedAt: string | null; lastError: string | null; evidenceCount: number;
  activeJob: IntegrationJob | null;
}
export interface IntegrationJob { id: string; provider: string; status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'; error: string | null; resultCount: number | null }
export async function integrationRequest<T>(path: string, method = 'GET', value?: unknown, accountId?: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method, credentials: 'same-origin', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    headers: { ...(value === undefined ? {} : { 'Content-Type': 'application/json' }), ...(accountId ? { 'X-Platform-Identity': 'auth:' + accountId } : {}) },
    body: value === undefined ? undefined : JSON.stringify(value) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Не удалось получить данные источника.');
  return data as T;
}
export const evidenceStatusLabels: Record<Evidence['status'], string> = {
  verified: 'Подтверждено источником', unverified: 'Требует проверки', demo: 'Демонстрационные данные',
  stale: 'Требует обновления', revoked: 'Подтверждение отозвано',
};
export const integrationErrorLabels: Record<string, string> = {
  source_unavailable: 'Источник временно недоступен', identity_not_found: 'Участник не найден',
  reauthorization_required: 'Нужно подключить аккаунт заново', identity_mismatch: 'Данные принадлежат другому аккаунту',
  invalid_source_response: 'Источник вернул неподдерживаемый формат', rate_limited: 'Источник ограничил частоту запросов',
  identity_revoked: 'Источник отозвал привязку аккаунта', consent_revoked: 'Согласие отозвано',
  disconnected: 'Источник отключён', invalid_identity: 'Внешний аккаунт не подтверждён', retry_exhausted: 'Попытки обновления исчерпаны',
};
