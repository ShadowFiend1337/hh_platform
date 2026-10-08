import { useEffect, useRef, useState } from 'react';
import { Link2, RefreshCw, Unlink } from 'lucide-react';
import { Dialog } from './Dialog';
import type { Candidate } from '../model';
import './fsp-link.css';

interface FspEvidence {
  provider: 'fsp-demo'; mode: 'demo'; identityVerified: false; lastSyncedAt: string;
  activeCount: number; revokedCount: number;
}
interface FspProfile {
  fspId: string; achievements: Candidate['achievements']; fspEvidence: FspEvidence | null;
}
interface FspResponse {
  enabled: boolean; revision: number;
  connection: { externalId: string; scenario: string; lastSyncedAt: string; identityVerified: false } | null;
  evidence: { id: string; title: string; result: string; year: string; status: 'active' | 'revoked'; source: 'demo' }[];
  profile: FspProfile;
}

/** A separate read-only provider control: achievements cannot be typed into the
 * profile form or obtained by claiming somebody else's federation ID. */
export function FspLink({ onChange, disabled = false }: { onChange: (profile: FspProfile) => void | Promise<void>; disabled?: boolean }) {
  const [data, setData] = useState<FspResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [scenario, setScenario] = useState('achievements');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const identity = useRef<string | null>(null);
  const mounted = useRef(true);

  async function request(method = 'GET', action = '', body?: Record<string, unknown>) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/integrations/fsp-demo' + action, { method, credentials: 'same-origin',
        signal: controller.signal, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(identity.current ? { 'X-Platform-Identity': identity.current } : {}) },
        body: body ? JSON.stringify(body) : undefined });
      const currentIdentity = response.headers.get('X-Platform-Identity');
      if (identity.current && currentIdentity && identity.current !== currentIdentity) {
        window.location.reload(); throw new Error('Аккаунт изменился. Обновите страницу.');
      }
      if (currentIdentity) identity.current = currentIdentity;
      if (response.status === 401) { window.location.replace('/auth?mode=login'); throw new Error('Войдите в аккаунт.'); }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Не удалось обновить привязку.');
      return result as FspResponse;
    } finally { window.clearTimeout(timer); }
  }

  useEffect(() => {
    mounted.current = true;
    request().then(result => { if (mounted.current) setData(result); })
      .catch(cause => { if (mounted.current) setError(cause instanceof Error ? cause.message : 'Привязка недоступна.'); });
    return () => { mounted.current = false; };
  }, []);

  async function change(action: 'connect' | 'sync' | 'disconnect') {
    if (!data || busy || disabled) return;
    setBusy(true); setError('');
    try {
      const current = await request();
      const result = await request(action === 'disconnect' ? 'DELETE' : 'POST', action === 'disconnect' ? '' : '/' + action,
        { baseRevision: current.revision, ...(action === 'connect' ? { scenario, consent } : {}) });
      if (!mounted.current) return;
      setData(result); await onChange(result.profile);
      if (mounted.current) { setOpen(false); setConsent(false); }
    } catch (cause) {
      if (!mounted.current) return;
      setError(cause instanceof Error ? cause.message : 'Не удалось обновить привязку.');
      // A stale snapshot must be fetched again before the next explicit action.
      try { const current = await request(); if (mounted.current) setData(current); } catch { /* Keep the action error visible. */ }
    } finally { if (mounted.current) setBusy(false); }
  }

  const unavailable = disabled || busy || !data;
  return <div className="fsp-link">
    {data?.connection ? <>
      <p className="field-help">Демонстрационная привязка · {data.connection.externalId}</p>
      {data.evidence.length > 0 ? <ul className="fsp-evidence-list">{data.evidence.map(item => <li key={item.id}>
        <strong>{item.title}</strong><p className="field-help">{item.result} · {item.year} · {item.status === 'revoked' ? 'Отозвано' : 'Демо'}</p>
      </li>)}</ul> : <p className="field-help">Источник не вернул достижений.</p>}
      <p className="field-help">Личность и достижения ФСП не подтверждены. Записи вымышленные.</p>
      <div className="fsp-actions">
        <button type="button" className="button secondary compact" disabled={unavailable || !data.enabled} onClick={() => void change('sync')}><RefreshCw size={15} />Обновить</button>
        <button type="button" className="button secondary compact" disabled={unavailable} onClick={() => void change('disconnect')}><Unlink size={15} />Отвязать</button>
      </div>
    </> : <>
      <button type="button" className="button secondary compact" disabled={unavailable || data?.enabled === false} onClick={() => { setOpen(true); setError(''); }}><Link2 size={15} />Привязать ФСП</button>
      <p className="field-help">{data?.enabled === false ? 'Демонстрационная привязка отключена.' : 'Доступен демонстрационный источник. Боевой API ФСП не подключён.'}</p>
    </>}
    {error && !open && <p className="form-error" role="alert">{error}</p>}
    {open && <Dialog title="Привязать ФСП" onClose={() => { if (!busy) setOpen(false); }}>
      <div className="dialog-form">
        <p className="field-help">Демонстрационный аккаунт создаётся для вашего пользователя. Чужой ID указать нельзя.</p>
        <label className="field"><span>Демоаккаунт</span><select value={scenario} disabled={busy} onChange={event => setScenario(event.target.value)}>
          <option value="achievements">С достижением</option><option value="empty">Без достижений</option><option value="revoked">С отозванным достижением</option>
        </select></label>
        <label className="checkbox-field"><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} /><span>Привязать демонстрационный аккаунт и загрузить вымышленные достижения</span></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions"><button type="button" className="button primary" disabled={busy || !consent || disabled} onClick={() => void change('connect')}>{busy ? 'Подключаем…' : 'Привязать'}</button></div>
      </div>
    </Dialog>}
  </div>;
}
