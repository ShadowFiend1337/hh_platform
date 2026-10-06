import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { createInitialState, type Candidate, type PlatformState } from './model';

interface PlatformResponse { state: PlatformState | null; revision: number; directoryPeople: Candidate[] }
class ApiError extends Error { constructor(message: string, readonly status: number) { super(message); } }
const hash = (value: unknown) => JSON.stringify(value);
export const syncCacheKey = 'predel:sync:v1';
interface SyncCache { baseline: PlatformState | null; draftHash: string; dirty: boolean }
function readSyncCache(): SyncCache | null {
  try {
    const value = JSON.parse(localStorage.getItem(syncCacheKey) || 'null');
    return value && typeof value.draftHash === 'string' && typeof value.dirty === 'boolean'
      && (value.baseline === null || value.baseline?.version === 2) ? value : null;
  } catch { return null; }
}

async function request(method = 'GET', value?: unknown): Promise<PlatformResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('/api/platform/state', { method, credentials: 'same-origin', signal: controller.signal,
      headers: value === undefined ? undefined : { 'Content-Type': 'application/json' }, body: value === undefined ? undefined : hash(value) });
    const data = await response.json();
    if (!response.ok) throw new ApiError(data.error || 'Не удалось сохранить данные.', response.status);
    return data;
  } finally { window.clearTimeout(timeout); }
}

/** Apply local changes to a fresh server revision, keeping unrelated remote changes. */
export function rebaseState(local: PlatformState, base: PlatformState | null, remote: PlatformState): PlatformState {
  const result = { ...remote };
  for (const key of ['profile', 'company'] as const) {
    const previous = base?.[key];
    const changes = Object.fromEntries(Object.entries(local[key]).filter(([field, value]) => hash(value) !== hash(previous?.[field as keyof typeof previous])));
    Object.assign(result, { [key]: { ...remote[key], ...changes } });
  }
  for (const key of ['surveys', 'savedSearches', 'invitations'] as const) {
    const old = new Map<string, unknown>((base?.[key] || []).map(item => [item.id, item]));
    const current = new Map<string, { id: string }>(local[key].map(item => [item.id, item]));
    const combined = new Map<string, { id: string }>(remote[key].map(item => [item.id, item]));
    for (const [id, item] of current) if (hash(item) !== hash(old.get(id))) combined.set(id, item);
    if (key !== 'invitations') for (const id of old.keys()) if (!current.has(id)) combined.delete(id);
    Object.assign(result, { [key]: [...combined.values()] });
  }
  return result;
}

/** SQLite is authoritative; the browser cache also buffers unsaved changes. */
export function usePlatformPersistence(state: PlatformState, update: Dispatch<SetStateAction<PlatformState>>) {
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [people, setPeople] = useState<Candidate[]>([]);
  const [status, setStatus] = useState<'loading' | 'saving' | 'saved' | 'error'>('loading');
  const [error, setError] = useState('');
  const [retryVersion, setRetryVersion] = useState(0);
  const current = useRef(state); current.current = state;
  const baseline = useRef<PlatformState | null>(null);
  const persisted = useRef('');
  const serverRevision = useRef(0);
  const writing = useRef<Promise<void> | null>(null);
  const blocked = useRef(false);
  const mounted = useRef(true);
  const [recoveryCache] = useState(readSyncCache);
  const recovery = useRef(recoveryCache);

  function receive(result: PlatformResponse) {
    serverRevision.current = result.revision;
    baseline.current = result.state;
    persisted.current = result.state ? hash(result.state) : '';
    setRevision(result.revision); setPeople(result.directoryPeople || []);
  }

  useEffect(() => {
    mounted.current = true;
    let active = true;
    request().then(result => {
      if (!active) return;
      const buffered = recovery.current;
      const recover = buffered?.dirty && buffered.draftHash === hash(current.current);
      const merged = result.state && recover ? rebaseState(current.current, buffered.baseline, result.state) : result.state;
      receive(result);
      recovery.current = null;
      if (merged) { current.current = merged; update(merged); }
      setReady(true); setStatus(merged && hash(merged) === persisted.current ? 'saved' : 'saving');
    }).catch(cause => { if (active) { setError(cause.message); setStatus('error'); } });
    return () => { active = false; mounted.current = false; };
  }, [update, retryVersion]);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(syncCacheKey, hash({ baseline: baseline.current, draftHash: hash(state), dirty: hash(state) !== persisted.current })); }
    catch { /* The interface reports browser-cache failures separately. */ }
  }, [ready, state, revision, status]);

  useEffect(() => {
    if (!ready || blocked.current || writing.current || status === 'error' || hash(state) === persisted.current) return;
    setStatus('saving');
    const timer = window.setTimeout(() => {
      if (blocked.current || writing.current) return;
      writing.current = (async () => {
        let conflicts = 0;
        try {
          while (mounted.current && !blocked.current && hash(current.current) !== persisted.current) {
            const snapshot = current.current;
            const snapshotHash = hash(snapshot);
            let result: PlatformResponse;
            try { result = await request('PUT', { state: snapshot, baseRevision: serverRevision.current }); }
            catch (cause) {
              if (!(cause instanceof ApiError) || cause.status !== 409 || ++conflicts > 3) throw cause;
              const fresh = await request();
              if (blocked.current || !mounted.current) return;
              if (!fresh.state && baseline.current) {
                const empty = createInitialState();
                receive(fresh); persisted.current = hash(empty); current.current = empty; update(empty);
                setStatus('saved'); setError(''); return;
              }
              const merged = fresh.state ? rebaseState(current.current, baseline.current, fresh.state) : current.current;
              receive(fresh); current.current = merged; update(merged);
              continue;
            }
            if (blocked.current || !mounted.current) return;
            receive(result);
            if (hash(current.current) === snapshotHash && result.state) { current.current = result.state; update(result.state); }
          }
          if (mounted.current && !blocked.current) { setStatus('saved'); setError(''); }
        } catch (cause) {
          if (mounted.current && !blocked.current) {
            setStatus('error'); setError(cause instanceof Error ? cause.message : 'Не удалось сохранить данные.');
          }
        } finally { writing.current = null; }
      })();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [ready, state, update, status]);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    const refresh = async () => {
      if (blocked.current || writing.current || document.visibilityState === 'hidden' || hash(current.current) !== persisted.current) return;
      try {
        const result = await request();
        if (!active || blocked.current || writing.current || hash(current.current) !== persisted.current) return;
        receive(result);
        const next = result.state || createInitialState();
        if (!result.state) persisted.current = hash(next);
        current.current = next; update(next);
      } catch { /* Keep saved state; a failed write remains visibly recoverable. */ }
    };
    const timer = window.setInterval(() => { void refresh(); }, 20000);
    window.addEventListener('focus', refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [ready, update]);

  return { ready, revision, people, status, error,
    retry: () => {
      setError('');
      if (ready) setStatus('saving');
      else { setStatus('loading'); setRetryVersion(value => value + 1); }
    },
    clear: async () => {
      blocked.current = true;
      try {
        await writing.current;
        await request('DELETE');
        const empty = createInitialState();
        current.current = empty; baseline.current = null; persisted.current = hash(empty); serverRevision.current = 0;
        localStorage.removeItem(syncCacheKey);
        update(empty); setRevision(0); setPeople([]); setError(''); setStatus('saved'); setReady(true);
      } finally { blocked.current = false; }
    } };
}

export async function readCandidateContacts(id: string): Promise<{ email: string; phone: string }> {
  const response = await fetch('/api/directory/' + encodeURIComponent(id) + '/contacts', { credentials: 'same-origin' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Контакты пока недоступны.');
  return data;
}
