import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { recordAssessmentIntegrity, type AssessmentAttempt, type SignalKind, type StrikeKind } from './assessment';
import type { TestResult } from './model';

const storagePrefix = 'predel:assessment:guard:';
export const maxStrikes = 3;

function storedPause(id: string) {
  try { return sessionStorage.getItem(storagePrefix + id) === 'paused'; }
  catch { return false; }
}

function savePause(id: string, paused: boolean) {
  try {
    if (paused) sessionStorage.setItem(storagePrefix + id, 'paused');
    else sessionStorage.removeItem(storagePrefix + id);
  } catch { /* The in-memory guard still works when storage is unavailable. */ }
}

export function clearAssessmentGuard(id: string) {
  savePause(id, false);
}

export function fullscreenSupported() {
  return typeof document !== 'undefined' && typeof document.documentElement.requestFullscreen === 'function' && document.fullscreenEnabled !== false;
}

/** Must be called from a user gesture (button click). Resolves even when the browser refuses. */
export async function enterFullscreen() {
  if (!fullscreenSupported() || document.fullscreenElement) return Boolean(document.fullscreenElement);
  // Some embedded or background windows never settle the request; the test must still start.
  const timeout = new Promise<boolean>(resolve => window.setTimeout(() => resolve(false), 1500));
  try { return await Promise.race([document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => true), timeout]); }
  catch { return false; }
}

export function leaveFullscreen() {
  if (typeof document !== 'undefined' && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
}

const blockedKeys = new Set(['c', 'x', 'v', 'a', 'p', 's', 'u', 'f', 'g', 'h', 'j', 'o']);

/**
 * Proctoring for the active attempt. Leaving the tab, the window or full screen is
 * a departure (strike): questions hide and the server counts it; the third one
 * annuls the attempt on the server. Copying, pasting, printing, developer tools
 * shortcuts and the screenshot key are blocked and logged as signals.
 * Browser controls can be bypassed; server timing and sequential delivery remain.
 */
export function useAssessmentGuard(
  attempt: AssessmentAttempt | null,
  submitting: boolean,
  contentRef: RefObject<HTMLDivElement | null>,
  { onAnnulled }: { onAnnulled?: (result: TestResult) => void } = {},
) {
  const active = attempt && attempt.status !== 'completed' ? attempt : null;
  const attemptId = active?.id || null;
  const activeRef = useRef(active);
  const submittingRef = useRef(submitting);
  const pausedRef = useRef(false);
  const onAnnulledRef = useRef(onAnnulled);
  const [pausedId, setPausedId] = useState<string | null>(null);
  const [strikes, setStrikes] = useState(active?.integrity?.departures || 0);
  const [lastStrike, setLastStrike] = useState<StrikeKind | null>(null);
  const [auditUnavailable, setAuditUnavailable] = useState(false);
  const [shielded, setShielded] = useState(false);
  const [fullscreen, setFullscreen] = useState(typeof document !== 'undefined' && Boolean(document.fullscreenElement));
  const mountedRef = useRef(true);
  const lastSignal = useRef<Record<string, number>>({});
  activeRef.current = active;
  submittingRef.current = submitting;
  onAnnulledRef.current = onAnnulled;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const report = useCallback((kind: StrikeKind | SignalKind) => {
    const current = activeRef.current;
    if (!current || submittingRef.current) return;
    void recordAssessmentIntegrity(current, { id: crypto.randomUUID(), kind }).then(response => {
      if (!mountedRef.current || activeRef.current?.id !== current.id) return;
      setStrikes(response.departures);
      if (response.annulled && response.result) onAnnulledRef.current?.(response.result);
    }).catch(() => {
      if (mountedRef.current && activeRef.current?.id === current.id) setAuditUnavailable(true);
    });
  }, []);

  const signal = useCallback((kind: SignalKind) => {
    const now = Date.now();
    if (now - (lastSignal.current[kind] || 0) < 1500) return;
    lastSignal.current[kind] = now;
    report(kind);
  }, [report]);

  const suspend = useCallback((kind: StrikeKind) => {
    const current = activeRef.current;
    if (!current || submittingRef.current || pausedRef.current) return;
    // Blur, visibilitychange and leaving full screen often describe one departure.
    pausedRef.current = true;
    savePause(current.id, true);
    setPausedId(current.id);
    setLastStrike(kind);
    setStrikes(value => value + 1);
    report(kind);
  }, [report]);

  useLayoutEffect(() => {
    const paused = attemptId ? storedPause(attemptId) : false;
    pausedRef.current = paused;
    setPausedId(paused ? attemptId : null);
    setAuditUnavailable(false);
    setStrikes(activeRef.current?.integrity?.departures || 0);
    lastSignal.current = {};
    if (attemptId && !paused && (document.hidden || !document.hasFocus())) {
      suspend(document.hidden ? 'visibility_hidden' : 'focus_lost');
    }
  }, [attemptId, suspend]);

  useEffect(() => {
    if (!attemptId) return;
    const blur = () => suspend('focus_lost');
    const visibility = () => { if (document.hidden) suspend('visibility_hidden'); };
    const fullscreenChange = () => {
      const inside = Boolean(document.fullscreenElement);
      setFullscreen(inside);
      if (!inside && activeRef.current) suspend('fullscreen_exit');
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!activeRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('fullscreenchange', fullscreenChange);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('fullscreenchange', fullscreenChange);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [attemptId, suspend]);

  const paused = !!attemptId && pausedId === attemptId;
  useEffect(() => {
    if (!attemptId) return;
    const inEditor = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('.cm-editor'));
    const block = (event: Event) => {
      if (!activeRef.current) return;
      if (event.type === 'selectstart' && inEditor(event.target)) return;
      event.preventDefault();
      if (event.type === 'copy' || event.type === 'cut' || event.type === 'contextmenu') signal('copy_blocked');
      if (event.type === 'paste' || event.type === 'drop') signal('paste_blocked');
    };
    const keydown = (event: KeyboardEvent) => {
      if (!activeRef.current) return;
      const key = event.key.toLowerCase();
      const modifier = event.ctrlKey || event.metaKey;
      const devtools = event.key === 'F12' || modifier && event.shiftKey && ['i', 'j', 'c', 'k'].includes(key);
      if (devtools) { event.preventDefault(); signal('shortcut_blocked'); return; }
      if (!modifier || !blockedKeys.has(key)) return;
      // Typing shortcuts inside the scratch editor stay available except clipboard ones.
      if (inEditor(event.target) && !['c', 'x', 'v', 'p', 's', 'u'].includes(key)) return;
      event.preventDefault();
      signal(key === 'c' || key === 'x' ? 'copy_blocked' : key === 'v' ? 'paste_blocked' : 'shortcut_blocked');
    };
    const keyup = (event: KeyboardEvent) => {
      if (!activeRef.current || event.key !== 'PrintScreen') return;
      // The OS takes the screenshot; hide the question and record the signal.
      setShielded(true);
      window.setTimeout(() => { if (mountedRef.current) setShielded(false); }, 1500);
      signal('screenshot_key');
    };
    const beforePrint = () => signal('shortcut_blocked');
    const blockedEvents = ['copy', 'cut', 'paste', 'contextmenu', 'dragstart', 'drop', 'selectstart'];
    for (const name of blockedEvents) document.addEventListener(name, block, true);
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('keyup', keyup, true);
    window.addEventListener('beforeprint', beforePrint);
    return () => {
      for (const name of blockedEvents) document.removeEventListener(name, block, true);
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('keyup', keyup, true);
      window.removeEventListener('beforeprint', beforePrint);
    };
  }, [attemptId, signal, contentRef]);

  const continueTest = useCallback(async () => {
    const current = activeRef.current;
    if (!current || document.hidden || submittingRef.current) return;
    await enterFullscreen();
    if (!document.hasFocus()) return;
    pausedRef.current = false;
    savePause(current.id, false);
    setPausedId(null);
  }, []);

  return { paused, continueTest, auditUnavailable, strikes, remaining: Math.max(0, maxStrikes - strikes), lastStrike, shielded, fullscreen };
}
