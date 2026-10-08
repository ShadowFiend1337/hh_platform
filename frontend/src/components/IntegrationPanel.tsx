import { useEffect, useRef, useState } from 'react';
import { integrationRequest, integrationErrorLabels, type IntegrationProvider, type IntegrationConnection, type IntegrationJob, type Evidence } from '../integrations-api';
import { ClaimPanel } from './ClaimPanel';
import { PublicAchievementSearch } from './PublicAchievementSearch';
import { EvidenceList } from './EvidenceList';
import { ProfileChallengeConnect } from './ProfileChallengeConnect';
import { KaggleConnect } from './KaggleConnect';

export function IntegrationPanel({ accountId, consent, onChange }: {
  accountId?: string; consent: boolean; onChange: () => Promise<void>;
}) {
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  const [claimsRevision,setClaimsRevision]=useState(0);
  const [providers, setProviders] = useState<IntegrationProvider[]>([]);
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [job, setJob] = useState<IntegrationJob | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false); const [scenario, setScenario] = useState('achievements');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!accountId) return;
    const controller = new AbortController();
    Promise.all([
      integrationRequest<{ providers: IntegrationProvider[] }>('/api/integrations/providers', 'GET', undefined, accountId, controller.signal),
      integrationRequest<{ connections: IntegrationConnection[] }>('/api/integrations', 'GET', undefined, accountId, controller.signal),
      integrationRequest<{ items: Evidence[] }>('/api/profile/evidence', 'GET', undefined, accountId, controller.signal),
    ]).then(([p,c,e]) => {
      if (controller.signal.aborted) return;
      setProviders(p.providers); setConnections(c.connections); setEvidence(e.items);
      const activeJob = c.connections.find(item => item.activeJob)?.activeJob;
      setJob(current => activeJob || current);
    })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [accountId, revision, consent]);
  useEffect(() => {
    if (!job || !['queued','running'].includes(job.status) || !accountId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      integrationRequest<{ job?: IntegrationJob } & IntegrationJob>('/api/integration-jobs/' + job.id, 'GET', undefined, accountId, controller.signal)
        .then(async next => { if (!controller.signal.aborted) { setJob(next); if (!['queued','running'].includes(next.status)) { setRevision(value => value + 1); await onChangeRef.current(); } } })
        .catch(cause => { if (!controller.signal.aborted) { setError(cause.message); setJob(null); } });
    }, 1500);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [job, accountId]);
  async function action(provider: IntegrationProvider, kind: 'connect' | 'sync' | 'disconnect') {
    setBusy(true); setError('');
    try {
      if (kind === 'connect') {
        const result = await integrationRequest<{ authorizationUrl: string | null; job: IntegrationJob | null }>(`/api/integrations/${provider.id}/connect`, 'POST',
          { consent: approved, ...(provider.mode === 'demo' ? { scenario } : {}) }, accountId);
        if (result.authorizationUrl) { window.location.assign(result.authorizationUrl); return; }
        setJob(result.job); setApproved(false);
      } else if (kind === 'sync') {
        const result = await integrationRequest<{ job: IntegrationJob }>(`/api/integrations/${provider.id}/sync`, 'POST', {}, accountId); setJob(result.job);
      } else {
        await integrationRequest(`/api/integrations/${provider.id}`, 'DELETE', undefined, accountId); setJob(null);
      }
      setRevision(value => value + 1);
      await onChangeRef.current();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Источник недоступен.'); }
    finally { setBusy(false); }
  }
  function changed() {
    setRevision(value => value + 1);
    void onChangeRef.current().catch(cause => setError(cause instanceof Error ? cause.message : 'Не удалось обновить профиль.'));
  }
  return <section className="panel integration-panel"><h2>Внешние подтверждения</h2>
    <p className="muted">Подключите источник, чтобы получить достижения с указанием происхождения. Грейд подтверждается тестированием.</p>
    {!accountId ? <p className="muted">Для подключения источников войдите в аккаунт кандидата.</p> : <>
      {!consent && <p className="muted">Сначала сохраните профиль с согласием на обработку данных.</p>}
      <label className="checkbox-field"><input type="checkbox" checked={approved} onChange={event => setApproved(event.target.checked)} /><span>Согласен на получение и хранение моих достижений из выбранного источника. Публикацией управляют настройки профиля.</span></label>
      <PublicAchievementSearch accountId={accountId} consent={consent} onClaimCreated={()=>{setClaimsRevision(value=>value+1);changed();}} />
      <ClaimPanel accountId={accountId} consent={consent} revision={claimsRevision} onChange={changed} />
      {providers.map(provider => {
        const connection = connections.find(item => item.provider === provider.id);
        return <div className="integration-source" key={provider.id}><h3>{provider.name}</h3>
          {provider.mode === 'demo' && <p className="field-help">Вымышленные записи не подтверждают навыки и не дают бонуса ФСП.</p>}
          {!provider.enabled && <p className="muted">{['codeforces','atcoder','kaggle'].includes(provider.id) ? 'Источник отключён администратором.' : 'Подключение будет доступно после настройки доступа к источнику.'}</p>}
          {provider.id==='github'&&<p className="field-help">Подтверждение аккаунта через GitHub. Импортируются публичные проекты и принятые PR; качество кода и грейд оцениваются отдельно.</p>}
          {connection ? <><p>{connection.externalId} · {connection.identityVerified ? 'Аккаунт подтверждён' : 'Демонстрационная привязка'}</p>
            {provider.id==='atcoder'&&<p className="field-help">Оставьте проверочный код в Affiliation до отключения аккаунта: он нужен для каждого обновления.</p>}
            <p className="field-help">{connection.lastSyncedAt ? 'Последнее обновление: ' + new Date(connection.lastSyncedAt).toLocaleString('ru-RU') : 'Ожидает первого обновления'}</p>
            {connection.lastError && <p role="status">{integrationErrorLabels[connection.lastError] || 'Обновление не завершено'}</p>}
            <div className="integration-actions"><button className="button secondary compact" disabled={busy || !consent || connection.status === 'reauthorization_required'} onClick={() => void action(provider, 'sync')}>Обновить</button>
              <button className="button secondary compact" disabled={busy} onClick={() => void action(provider, 'disconnect')}>Отключить и удалить данные</button></div>
          </> : provider.auth === 'profile_challenge' ? <ProfileChallengeConnect key={accountId + ':' + consent} provider={provider} accountId={accountId} consent={consent} approved={approved} enabled={provider.enabled} onConnected={next=>{setJob(next);setApproved(false);changed();}} /> : provider.auth==='api_token' ? <KaggleConnect key={accountId+':'+consent} accountId={accountId} consent={consent} approved={approved} enabled={provider.enabled} onConnected={next=>{setJob(next);setApproved(false);changed();}} /> : <>
            {provider.mode === 'demo' && <label className="field"><span>Демонстрационный сценарий</span><select value={scenario} onChange={event => setScenario(event.target.value)}>
              <option value="achievements">Есть достижения</option><option value="empty">История пуста</option><option value="not-found">Участник не найден</option><option value="unavailable">Источник недоступен</option><option value="revoked">Достижение отозвано</option>
            </select></label>}
            <button className="button secondary compact" disabled={busy || !approved || !consent || !provider.enabled} onClick={() => void action(provider, 'connect')}>Подключить</button>
          </>}
        </div>;
      })}
      {job && <p role="status">{['queued','running'].includes(job.status) ? 'Обновляем достижения…' : job.status === 'succeeded' ? `Обновление завершено: получено записей — ${job.resultCount}` : integrationErrorLabels[job.error || ''] || 'Обновление не завершено'}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <EvidenceList items={evidence} />
    </>}
  </section>;
}
