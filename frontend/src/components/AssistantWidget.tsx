import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowUp, ArrowUpRight, RotateCcw, Sparkles, X } from 'lucide-react';
import { askAssistant, assistantCopy, assistantInfo, type AssistantInfo, type AssistantPage, type AssistantTurn } from '../assistant-api';
import type { Role } from '../model';

const maxLength = 800;

function readTurns(key: string): AssistantTurn[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter(turn => turn && ['user', 'assistant'].includes(turn.role) && typeof turn.content === 'string').slice(-20) : [];
  } catch { return []; }
}

function inline(text: string) {
  // Only **bold** is interpreted; everything else stays plain text.
  return text.split(/(\*\*[^*]+\*\*)/gu).map((part, index) => part.startsWith('**') && part.endsWith('**')
    ? <strong key={index}>{part.slice(2, -2)}</strong> : <Fragment key={index}>{part}</Fragment>);
}

/** Paragraphs and "- " lists from the model reply, rendered without HTML injection. */
function Formatted({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={'l' + blocks.length}>{list.map((item, index) => <li key={index}>{inline(item)}</li>)}</ul>);
    list = [];
  };
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    const item = /^(?:[-•*]|\d+[.)])\s+(.*)$/u.exec(trimmed);
    if (item) { list.push(item[1]); continue; }
    flush();
    if (trimmed) blocks.push(<p key={'p' + blocks.length}>{inline(trimmed.replace(/^#+\s*/u, ''))}</p>);
  }
  flush();
  return <>{blocks}</>;
}

/**
 * Floating assistant for the signed-in cabinet. Candidates and employers get
 * different assistants (server-side prompts); the client only adds a small,
 * non-identifying context such as readiness percent or invitation counters.
 */
export function AssistantWidget({ role, accountId, page, context, onNavigate }: {
  role: Role; accountId: string; page: string; context: Record<string, unknown>; onNavigate: (page: AssistantPage) => void;
}) {
  const storageKey = 'predel:assistant:' + accountId;
  const copy = assistantCopy[role];
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<AssistantTurn[]>(() => readTurns(storageKey));
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState<AssistantInfo | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(turns.slice(-20))); } catch { /* The dialog stays in memory. */ }
  }, [storageKey, turns]);
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    if (!info) void assistantInfo().then(setInfo).catch(() => {});
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [open, info]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [turns, busy, open]);
  useEffect(() => () => controller.current?.abort(), []);

  async function send(text: string) {
    const message = text.trim().slice(0, maxLength);
    if (!message || busy) return;
    const history = turns;
    setTurns([...history, { role: 'user', content: message }]);
    setDraft(''); setError(''); setBusy(true);
    const current = new AbortController(); controller.current = current;
    try {
      const answer = await askAssistant(message, history, page, context, current.signal);
      setTurns(previous => [...previous, { role: 'assistant', content: answer.reply, links: answer.links, source: answer.source }]);
    } catch (cause) {
      if (current.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : 'Помощник недоступен.');
      setTurns(previous => previous.slice(0, -1)); setDraft(message);
    } finally {
      if (controller.current === current) { controller.current = null; setBusy(false); }
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }

  if (!open) return <button className="assistant-launcher" onClick={() => setOpen(true)} aria-haspopup="dialog">
    <Sparkles size={18} />Помощник
  </button>;

  return <section className="assistant-panel" role="dialog" aria-label={copy.title}>
    <header className="assistant-header">
      <span className="assistant-badge" aria-hidden="true"><Sparkles size={17} /></span>
      <div><h2>{copy.title}</h2><p>{info?.llm ? 'ИИ на открытой модели Qwen' : 'Готовые подсказки'}</p></div>
      {turns.length > 0 && <button className="icon-button" onClick={() => { controller.current?.abort(); setTurns([]); setError(''); setBusy(false); }} aria-label="Начать заново" title="Начать заново"><RotateCcw size={16} /></button>}
      <button className="icon-button" onClick={() => setOpen(false)} aria-label="Закрыть помощника"><X size={17} /></button>
    </header>
    <div className="assistant-messages" ref={listRef} aria-live="polite">
      <div className="assistant-message from-assistant"><p>{copy.greeting}</p></div>
      {!turns.length && <div className="assistant-suggestions">{copy.suggestions.map(item =>
        <button key={item} className="filter-chip" onClick={() => void send(item)}>{item}</button>)}</div>}
      {turns.map((turn, index) => <div key={index} className={'assistant-message ' + (turn.role === 'user' ? 'from-user' : 'from-assistant')}>
        {turn.role === 'user' ? <p>{turn.content}</p> : <Formatted text={turn.content} />}
        {turn.links?.length ? <div className="assistant-links">{turn.links.map(link =>
          <button key={link.page} className="assistant-link" onClick={() => { onNavigate(link.page); if (window.innerWidth < 640) setOpen(false); }}>{link.label}<ArrowUpRight size={13} /></button>)}</div> : null}
      </div>)}
      {busy && <div className="assistant-message from-assistant assistant-typing" role="status" aria-label="Помощник печатает"><i /><i /><i /></div>}
      {error && <p className="assistant-error" role="alert">{error}</p>}
    </div>
    <form className="assistant-form" onSubmit={submit}>
      <textarea ref={inputRef} value={draft} maxLength={maxLength} rows={1} placeholder="Спросите о профиле, тесте или подборе"
        aria-label="Вопрос помощнику" onChange={event => setDraft(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(draft); } }} />
      <button className="assistant-send" type="submit" disabled={!draft.trim() || busy} aria-label="Отправить"><ArrowUp size={17} /></button>
    </form>
    <p className="assistant-footnote">{info?.notice || 'Не указывайте в вопросах персональные данные.'}</p>
  </section>;
}
