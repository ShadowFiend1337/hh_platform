import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import { Check, MapPin, RotateCcw, Send, X } from 'lucide-react';
import type { Vacancy } from '../companies-api';
import { gradeLabels, initials, money, specializationLabels } from '../model';
import './vacancy-deck.css';

type Props = {
  items: Vacancy[];
  applied: Set<string>;
  onApply: (vacancy: Vacancy) => void;
};

export function VacancyDeck({ items, applied, onApply }: Props) {
  const [visited, setVisited] = useState<Set<string>>(() => new Set(applied));
  const [history, setHistory] = useState<string[]>([]);
  const [drag, setDrag] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const cardElement = useRef<HTMLElement | null>(null);
  const replayElement = useRef<HTMLButtonElement | null>(null);
  const pointer = useRef<{ id: number; x: number; y: number; time: number; dx: number; horizontal: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const acting = useRef(false);
  const focusNext = useRef(false);
  const previousApplied = useRef(applied);
  const helpId = useId();
  const current = items.find(item => !visited.has(item.id));
  const currentId = useRef(current?.id);
  currentId.current = current?.id;
  const position = current ? items.findIndex(item => item.id === current.id) + 1 : items.length;
  const sent = Boolean(current && applied.has(current.id));
  const lastVisited = [...history].reverse().find(id => items.some(item => item.id === id));

  useEffect(() => () => { window.clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (focusNext.current) {
      const target = current ? cardElement.current : replayElement.current;
      target?.focus({ preventScroll: true });
      focusNext.current = false;
    }
  }, [current?.id]);
  useEffect(() => {
    const previous = previousApplied.current;
    previousApplied.current = applied;
    if (!current || !applied.has(current.id) || previous.has(current.id)) return;
    // Advance after the server accepted the application, keeping failed or
    // cancelled forms on the same proposal and preserving review with undo.
    window.clearTimeout(timer.current);
    pointer.current = null;
    acting.current = false;
    focusNext.current = true;
    setVisited(value => new Set(value).add(current.id));
    setHistory(value => [...value, current.id]);
    setDrag(0); setLeaving(false);
    setAnnouncement('Отклик отправлен');
  }, [applied, current?.id]);

  function skip() {
    if (!current || acting.current) return;
    const vacancy = current;
    focusNext.current = document.activeElement === cardElement.current;
    acting.current = true;
    pointer.current = null;
    setDrag(0);
    setLeaving(true);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    timer.current = window.setTimeout(() => {
      if (currentId.current === vacancy.id) {
        setVisited(previous => new Set(previous).add(vacancy.id));
        setHistory(previous => [...previous, vacancy.id]);
        setAnnouncement(vacancy.title + ' — пропущено');
      } else focusNext.current = false;
      setLeaving(false);
      acting.current = false;
    }, reduced ? 0 : 180);
  }

  function undo() {
    if (!lastVisited || acting.current) return;
    setVisited(previous => {
      const next = new Set(previous);
      next.delete(lastVisited);
      return next;
    });
    setHistory(previous => previous.slice(0, previous.lastIndexOf(lastVisited)));
    setDrag(0);
    setAnnouncement('Последнее предложение возвращено');
  }

  function apply() {
    if (!current || acting.current) return;
    pointer.current = null;
    setDrag(0);
    if (applied.has(current.id)) {
      skip();
      return;
    }
    cardElement.current?.focus({ preventScroll: true });
    onApply(current);
  }

  function startPointer(event: PointerEvent<HTMLElement>) {
    if (acting.current || !current || !event.isPrimary || event.button !== 0
      || (event.target as HTMLElement).closest('button, a, summary, input, textarea, select, label')) return;
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY,
      time: performance.now(), dx: 0, horizontal: false };
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePointer(event: PointerEvent<HTMLElement>) {
    const start = pointer.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (!start.horizontal) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      if (Math.abs(dy) >= Math.abs(dx)) {
        pointer.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        return;
      }
      start.horizontal = true;
    }
    start.dx = dx;
    setDrag(dx);
  }

  function endPointer(event: PointerEvent<HTMLElement>) {
    const start = pointer.current;
    if (!start || start.id !== event.pointerId) return;
    pointer.current = null;
    const threshold = Math.min(100, event.currentTarget.clientWidth * 0.24);
    const quick = Math.abs(start.dx) > 35 && Math.abs(start.dx) / Math.max(1, performance.now() - start.time) > 0.65;
    if (start.horizontal && (Math.abs(start.dx) >= threshold || quick)) {
      if (start.dx < 0) skip(); else apply();
    } else setDrag(0);
  }

  const transform = leaving ? 'translateX(-600px) rotate(-16deg)'
    : `translateX(${drag}px) rotate(${Math.max(-12, Math.min(12, drag / 24))}deg)`;

  return <div className="candidate-deck vacancy-deck">
    <p className="sr-only" id={helpId}>Влево — пропустить, вправо — открыть форму отклика. Можно использовать кнопки или стрелки на клавиатуре.</p>
    <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
    {current ? <div className="swipe-stage"><article ref={cardElement} key={current.id}
      className={'swipe-card vacancy-deck-card' + (drag ? ' is-dragging' : '') + (leaving ? ' is-leaving' : '')}
      data-vacancy-id={current.id} tabIndex={0} aria-label={'Предложение: ' + current.title} aria-describedby={helpId}
      style={{ transform, opacity: leaving ? 0 : 1 }}
      onPointerDown={startPointer} onPointerMove={movePointer} onPointerUp={endPointer}
      onPointerCancel={() => { pointer.current = null; setDrag(0); }}
      onLostPointerCapture={() => { pointer.current = null; setDrag(0); }}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          if (event.key === 'ArrowLeft') skip(); else apply();
        }
      }}>
      <div className={'swipe-mark' + (drag > 35 && !sent ? ' is-like' : drag < -35 || leaving ? ' is-pass' : '')} aria-hidden="true">
        {drag > 0 && !leaving ? <Send size={25} /> : <X size={28} />}
      </div>
      <div className="swipe-person-top vacancy-deck-company">
        <div className="vacancy-deck-company-name"><div className="company-avatar" aria-hidden="true">{initials(current.company)}</div><span>{current.company}</span></div>
      </div>
      <h2 className="vacancy-deck-title">{current.title}</h2>
      <p className="candidate-specialization vacancy-deck-specialization">{specializationLabels[current.specialization]}<span className="dot-divider">·</span>{gradeLabels[current.grade]}</p>
      <div className="swipe-metadata">{current.city && <span><MapPin size={14} />{current.city}</span>}{current.format && <span>{current.format}</span>}</div>
      <p className="swipe-salary">{money(current.salaryFrom)} – {money(current.salaryTo)} ₽<span> / месяц, до налогов</span></p>
      {current.description && <div className="vacancy-deck-description">
        <p className="swipe-bio">{current.description}</p>
        <details className="swipe-reason"><summary>Полное описание</summary><p>{current.description}</p></details>
      </div>}
      {current.stack.length > 0 && <div className="tags swipe-stack">{current.stack.map(skill => <span className="tag" key={skill}>{skill}</span>)}</div>}
      <div className="swipe-card-footer vacancy-deck-footer"><span className="vacancy-deck-counter" aria-label={'Предложение ' + position + ' из ' + items.length}>{position} / {items.length}</span>
        <button className={'button compact ' + (sent ? 'secondary' : 'primary')} disabled={sent || leaving} onClick={apply}>
          {sent ? <Check size={16} /> : <Send size={16} />}{sent ? 'Отклик отправлен' : 'Откликнуться'}
        </button>
      </div>
    </article></div> : <div className="empty-state swipe-empty">
      <Send size={30} /><h3>{items.length ? 'Все предложения просмотрены' : 'Предложения не найдены'}</h3>
      {items.length > 0 && <button ref={replayElement} className="button secondary" onClick={() => {
        setVisited(new Set()); setHistory([]); setDrag(0);
        setAnnouncement('Предложения доступны для повторного просмотра');
      }}>Посмотреть снова</button>}
    </div>}
    <div className="swipe-actions vacancy-deck-actions">
      <button className="swipe-action swipe-undo" aria-label="Вернуть карточку" title="Вернуть карточку" disabled={!lastVisited || leaving} onClick={undo}><RotateCcw size={19} /></button>
      <button className="swipe-action swipe-pass" aria-label="Пропустить" title="Пропустить" disabled={!current || leaving} onClick={skip}><X size={27} /></button>
    </div>
  </div>;
}
