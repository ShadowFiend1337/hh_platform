import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { recordAssessmentIntegrity, type AssessmentAttempt } from './assessment';

const storagePrefix = 'predel:assessment:guard:';

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

/** Browser focus events are signals, not evidence that a candidate cheated. */
export function useAssessmentGuard(
  attempt: AssessmentAttempt | null,
  submitting: boolean,
  contentRef: RefObject<HTMLDivElement | null>,
) {
  const active = attempt && attempt.status !== 'completed' ? attempt : null;
  const attemptId = active?.id || null;
  const activeRef = useRef(active);
  const submittingRef = useRef(submitting);
  const pausedRef = useRef(false);
  const [pausedId, setPausedId] = useState<string | null>(null);
  const [auditUnavailable, setAuditUnavailable] = useState(false);
  const mountedRef = useRef(true);
  const lastCopyAt = useRef(0);
  activeRef.current = active;
  submittingRef.current = submitting;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const report = useCallback((kind: 'focus_lost' | 'visibility_hidden' | 'copy_blocked') => {
    const current = activeRef.current;
    if (!current || submittingRef.current) return;
    const id = crypto.randomUUID();
    void recordAssessmentIntegrity(current, { id, kind }).catch(() => {
      if (mountedRef.current && activeRef.current?.id === current.id) setAuditUnavailable(true);
    });
  }, []);

  const suspend = useCallback((kind: 'focus_lost' | 'visibility_hidden') => {
    const current = activeRef.current;
    if (!current || submittingRef.current || pausedRef.current) return;
    // Blur and visibilitychange commonly describe the same departure.
    pausedRef.current = true;
    savePause(current.id, true);
    setPausedId(current.id);
    report(kind);
  }, [report]);

  useLayoutEffect(() => {
    const paused = attemptId ? storedPause(attemptId) : false;
    pausedRef.current = paused;
    setPausedId(paused ? attemptId : null);
    setAuditUnavailable(false);
    lastCopyAt.current = 0;
    if (attemptId && !paused && (document.hidden || !document.hasFocus())) {
      suspend(document.hidden ? 'visibility_hidden' : 'focus_lost');
    }
  }, [attemptId, suspend]);

  useEffect(() => {
    if (!attemptId) return;
    const blur = () => suspend('focus_lost');
    const visibility = () => { if (document.hidden) suspend('visibility_hidden'); };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!activeRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [attemptId, suspend]);

  const paused = !!attemptId && pausedId === attemptId;
  useEffect(() => {
    const content = contentRef.current;
    if (!attemptId || paused || !content) return;
    let lastPointerInContent = false;
    const inContent = (node: Node | null) => !!node && content.contains(node);
    const scoped = (event: Event) => {
      const selection = document.getSelection();
      return inContent(event.target instanceof Node ? event.target : null)
        || inContent(selection?.anchorNode || null) || inContent(selection?.focusNode || null)
        || inContent(document.activeElement)
        || (lastPointerInContent && document.activeElement === document.body);
    };
    const recordCopy = () => {
      const now = Date.now();
      if (now - lastCopyAt.current > 750) {
        lastCopyAt.current = now;
        report('copy_blocked');
      }
    };
    const block = (event: Event) => {
      if (!activeRef.current) return;
      event.preventDefault();
      if (['copy', 'cut', 'contextmenu'].includes(event.type)) recordCopy();
    };
    const pointer = (event: PointerEvent) => {
      lastPointerInContent = inContent(event.target instanceof Node ? event.target : null);
    };
    const clipboard = (event: ClipboardEvent) => {
      if (scoped(event)) block(event);
    };
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && ['c', 'x'].includes(event.key.toLowerCase()) && scoped(event)) {
        block(event);
        recordCopy();
      }
    };
    const blockedEvents = ['contextmenu', 'dragstart', 'selectstart'];
    for (const name of blockedEvents) content.addEventListener(name, block);
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('copy', clipboard);
    document.addEventListener('cut', clipboard);
    document.addEventListener('keydown', keydown);
    return () => {
      for (const name of blockedEvents) content.removeEventListener(name, block);
      document.removeEventListener('pointerdown', pointer, true);
      document.removeEventListener('copy', clipboard);
      document.removeEventListener('cut', clipboard);
      document.removeEventListener('keydown', keydown);
    };
  }, [attemptId, paused, contentRef, report]);

  const continueTest = useCallback(() => {
    const current = activeRef.current;
    if (!current || document.hidden || !document.hasFocus() || submittingRef.current) return;
    pausedRef.current = false;
    savePause(current.id, false);
    setPausedId(null);
  }, []);

  return { paused, continueTest, auditUnavailable };
}
