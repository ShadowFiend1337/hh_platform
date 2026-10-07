import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { createInitialState, storageKey, type Candidate, type PlatformState } from './model';

interface PlatformResponse { state: PlatformState | null; revision: number; directoryPeople: Candidate[]; contactCandidateIds?: string[]; identity?: string }
class ApiError extends Error { constructor(message: string, readonly status: number) { super(message); } }
const hash = (value: unknown) => JSON.stringify(value);
export const syncCacheKey = 'predel:sync:v1';
interface SyncCache { baseline: PlatformState | null; draftHash: string; dirty: boolean; identity?: string }
function readSyncCache(): SyncCache | null {
  try {
    const value = JSON.parse(localStorage.getItem(syncCacheKey) || 'null');
    return value && typeof value.draftHash === 'string' && typeof value.dirty === 'boolean'
      && (value.baseline === null || value.baseline?.version === 2)
      && (value.identity === undefined || typeof value.identity === 'string') ? value : null;
  } catch { return null; }
}

function directoryFingerprint(result: PlatformResponse) {
  const invited = new Set(result.state?.invitations.map(item => item.candidateId) || []);
  const people = (result.directoryPeople || []).filter(person => invited.has(person.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  return hash([result.state?.profile || null, people]);
}

async function request(method = 'GET', value?: unknown, expectedIdentity?: string): Promise<PlatformResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('/api/platform/state', { method, credentials: 'same-origin', signal: controller.signal,
      headers: { ...(value === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(expectedIdentity ? { 'X-Platform-Identity': expectedIdentity } : {}) }, body: value === undefined ? undefined : hash(value) });
    const identity = response.headers.get('X-Platform-Identity') || undefined;
    if (expectedIdentity && identity && expectedIdentity !== identity) {
      // A login/logout in another tab changed the shared cookie. This is not
      // a revision conflict: an old draft must never be rebased to that user.
      try {
        localStorage.removeItem(storageKey); localStorage.removeItem('predel:platform:v1'); localStorage.removeItem(syncCacheKey);
        sessionStorage.removeItem('predel:assessment:v1'); sessionStorage.removeItem('predel:search');
      } catch { /* Reload still discards the in-memory draft. */ }
      window.location.reload();
      throw new ApiError('Аккаунт изменился. Обновите страницу.', 403);
    }
    const data = await response.json();
    if (!response.ok) throw new ApiError(data.error || 'Не удалось сохранить данные.', response.status);
    return { ...data, identity };
  } finally { window.clearTimeout(timeout); }
}

/** Apply local changes to a fresh server revision, keeping unrelated remote changes. */
export function rebaseState(local: PlatformState, base: PlatformState | null, remote: PlatformState): PlatformState {
  const result = { ...remote };
  const fieldBaseline = base || createInitialState();
  for (const key of ['profile', 'company'] as const) {
    const previous = fieldBaseline[key];
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
  const oldDecisions = new Map((base?.candidateDecisions || []).map(item => [item.candidateId, item]));
  const currentDecisions = new Map((local.candidateDecisions ?? base?.candidateDecisions ?? []).map(item => [item.candidateId, item]));
  const combinedDecisions = new Map((remote.candidateDecisions || []).map(item => [item.candidateId, item]));
  for (const [id, item] of currentDecisions) if (hash(item) !== hash(oldDecisions.get(id))) combinedDecisions.set(id, item);
  for (const id of oldDecisions.keys()) if (!currentDecisions.has(id)) combinedDecisions.delete(id);
  result.candidateDecisions = [...combinedDecisions.values()];
  return result;
}

/** SQLite is authoritative; the browser cache also buffers unsaved changes. */
export function usePlatformPersistence(state: PlatformState, update: Dispatch<SetStateAction<PlatformState>>, initialIdentity?: string) {
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [directoryRevision, setDirectoryRevision] = useState(0);
  const [people, setPeople] = useState<Candidate[]>([]);
  const [contactCandidateIds, setContactCandidateIds] = useState<string[]>([]);
  const [status, setStatus] = useState<'loading' | 'saving' | 'saved' | 'error'>('loading');
  const [error, setError] = useState('');
  const [retryVersion, setRetryVersion] = useState(0);
  const current = useRef(state); current.current = state;
  const baseline = useRef<PlatformState | null>(null);
  const persisted = useRef('');
  const failedWriteHash = useRef<string | null>(null);
  const serverRevision = useRef(0);
  const serverIdentity = useRef<string | undefined>(initialIdentity);
  const directoryHash = useRef<string | null>(null);
  const likedPeople = useRef(new Map<string, string | null>());
  const writing = useRef<Promise<void> | null>(null);
  const blocked = useRef(false);
  const mounted = useRef(true);
  const [recoveryCache] = useState(readSyncCache);
  const recovery = useRef(recoveryCache);

  function receive(result: PlatformResponse, isWrite = false) {
    const nextDirectoryHash = directoryFingerprint(result);
    let directoryChanged = nextDirectoryHash !== directoryHash.current;
    const publicPeople = new Map((result.directoryPeople || []).map(person => [person.id, hash(person)]));
    const nextLikedPeople = new Map((result.state?.candidateDecisions || []).filter(item => item.decision === 'liked')
      .map(item => [item.candidateId, publicPeople.get(item.candidateId) ?? null] as const));
    for (const [id, previousPerson] of likedPeople.current) {
      if (nextLikedPeople.has(id) ? nextLikedPeople.get(id) !== previousPerson : !isWrite) directoryChanged = true;
    }
    directoryHash.current = nextDirectoryHash; likedPeople.current = nextLikedPeople;
    if (directoryChanged) setDirectoryRevision(value => value + 1);
    serverRevision.current = result.revision;
    serverIdentity.current = result.identity || serverIdentity.current;
    baseline.current = result.state;
    persisted.current = result.state ? hash(result.state) : '';
    setRevision(result.revision); setPeople(result.directoryPeople || []);
    setContactCandidateIds(result.contactCandidateIds || []);
  }

  useEffect(() => {
    mounted.current = true;
    let active = true;
    request('GET', undefined, serverIdentity.current).then(result => {
      if (!active) return;
      const buffered = recovery.current;
      const identityChanged = Boolean(buffered?.identity && result.identity && buffered.identity !== result.identity);
      const recover = !identityChanged && buffered?.dirty && buffered.draftHash === hash(current.current);
      // A known server account that disappeared was deleted elsewhere. Do
      // not migrate its browser cache back as a newly created account.
      const deleted = !result.state && Boolean(buffered?.baseline);
      const neutral = !result.state && hash(current.current) === hash(createInitialState());
      const merged = deleted || neutral || identityChanged && !result.state ? createInitialState()
        : result.state && recover ? rebaseState(current.current, buffered.baseline, result.state) : result.state;
      receive(result);
      if (deleted || neutral) persisted.current = hash(merged);
      recovery.current = null;
      if (merged) { current.current = merged; update(merged); }
      setReady(true); setStatus(merged && hash(merged) === persisted.current ? 'saved' : 'saving');
    }).catch(cause => { if (active) { setError(cause.message); setStatus('error'); } });
    return () => { active = false; mounted.current = false; };
  }, [update, retryVersion]);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(syncCacheKey, hash({ baseline: baseline.current, draftHash: hash(state), dirty: hash(state) !== persisted.current, identity: serverIdentity.current })); }
    catch { /* The interface reports browser-cache failures separately. */ }
  }, [ready, state, revision, status]);

  useEffect(() => {
    if (!ready || blocked.current || writing.current) return;
    if (status === 'error') {
      // Keep an unchanged failed draft available for explicit retry. A user
      // correction (for example new consent) is a new save, not that retry.
      if (failedWriteHash.current === null || hash(state) === failedWriteHash.current) return;
      failedWriteHash.current = null; setError(''); setStatus(hash(state) === persisted.current ? 'saved' : 'saving'); return;
    }
    if (hash(state) === persisted.current) return;
    setStatus('saving');
    const timer = window.setTimeout(() => {
      if (blocked.current || writing.current) return;
      writing.current = (async () => {
        let conflicts = 0;
        let attemptedHash = hash(current.current);
        try {
          while (mounted.current && !blocked.current && hash(current.current) !== persisted.current) {
            const snapshot = current.current;
            const snapshotHash = hash(snapshot);
            attemptedHash = snapshotHash;
            let result: PlatformResponse;
            try { result = await request('PUT', { state: snapshot, baseRevision: serverRevision.current }, serverIdentity.current); }
            catch (cause) {
              if (!(cause instanceof ApiError) || cause.status !== 409 || ++conflicts > 3) throw cause;
              const fresh = await request('GET', undefined, serverIdentity.current);
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
            receive(result, true);
            if (hash(current.current) === snapshotHash && result.state) { current.current = result.state; update(result.state); }
          }
          if (mounted.current && !blocked.current) { failedWriteHash.current = null; setStatus('saved'); setError(''); }
        } catch (cause) {
          if (mounted.current && !blocked.current) {
            failedWriteHash.current = attemptedHash;
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
        const result = await request('GET', undefined, serverIdentity.current);
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

  return { ready, revision, directoryRevision, people, contactCandidateIds, status, error,
    retry: () => {
      setError('');
      if (ready) setStatus('saving');
      else { setStatus('loading'); setRetryVersion(value => value + 1); }
    },
    clear: async () => {
      blocked.current = true;
      try {
        await writing.current;
        await request('DELETE', undefined, serverIdentity.current);
        const empty = createInitialState();
        current.current = empty; baseline.current = null; persisted.current = hash(empty); serverRevision.current = 0;
        directoryHash.current = null; likedPeople.current = new Map(); setDirectoryRevision(0);
        localStorage.removeItem(syncCacheKey);
        update(empty); setRevision(0); setPeople([]); setContactCandidateIds([]); setError(''); setStatus('saved'); setReady(true);
      } finally { blocked.current = false; }
    } };
}

export async function readCandidateContacts(id: string): Promise<{ email: string; phone: string }> {
  const response = await fetch('/api/directory/' + encodeURIComponent(id) + '/contacts', { credentials: 'same-origin' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Контакты пока недоступны.');
  return data;
}
