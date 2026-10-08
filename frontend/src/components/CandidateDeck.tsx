import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import { ArrowUpRight, BadgeCheck, Heart, MapPin, Medal, RotateCcw, X } from 'lucide-react';
import { gradeLabels, initials, specializationLabels, type Candidate, type CandidateDecision } from '../model';
import type { DirectoryItem } from '../directory-api';

type Decision = CandidateDecision['decision'];
type Props = {
  items: DirectoryItem[]; decisions: CandidateDecision[]; favorites: boolean;
  loading: boolean; loadingMore: boolean; hasMore: boolean; failed: boolean;
  onLoadMore: () => void; onDecision: (id: string, decision: Decision | null) => void;
  onReset: () => void; onProfile: (person: Candidate) => void;
  onInvite: (person: Candidate) => void; pendingIds: Set<string>;
};
const amount = (value: number) => new Intl.NumberFormat('ru-RU').format(value);

export function CandidateDeck({ items, decisions, favorites, loading, loadingMore, hasMore, failed,
  onLoadMore, onDecision, onReset, onProfile, onInvite, pendingIds }: Props) {
  const [visited, setVisited] = useState<Set<string>>(() => new Set());
  const [history, setHistory] = useState<{ id: string; previous: Decision | null }[]>([]);
  const [drag, setDrag] = useState(0);
  const [flight, setFlight] = useState<'left' | 'right' | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const pointer = useRef<{ id: number; x: number; y: number; time: number; dx: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const acting = useRef(false);
  const cardElement = useRef<HTMLElement | null>(null);
  const focusNext = useRef(false);
  const helpId = useId();
  const choice = new Map(decisions.map(item => [item.candidateId, item.decision]));
  const remaining = items.filter(item => !visited.has(item.person.id)
    && (favorites ? choice.get(item.person.id) === 'liked' : !choice.has(item.person.id)));
  const current = remaining[0];
  const disabled = loading || loadingMore || failed || Boolean(flight);

  useEffect(() => () => { window.clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (current && focusNext.current) {
      cardElement.current?.focus({ preventScroll: true }); focusNext.current = false;
    }
  }, [current?.person.id]);
  useEffect(() => {
    if (!current && hasMore && !loading && !loadingMore && !failed) onLoadMore();
  }, [current, hasMore, loading, loadingMore, failed, onLoadMore]);

  function decide(decision: Decision | null, direction: 'left' | 'right') {
    if (!current || disabled || acting.current) return;
    const person = current.person;
    const previous = choice.get(person.id) || null;
    focusNext.current = document.activeElement === cardElement.current;
    acting.current = true; pointer.current = null; setDrag(0); setFlight(direction);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    timer.current = window.setTimeout(() => {
      onDecision(person.id, decision);
      setVisited(before => new Set(before).add(person.id));
      setHistory(before => [...before, { id: person.id, previous }]);
      setAnnouncement(person.name + (decision === 'liked' ? ' — в избранном' : decision === 'passed' ? ' — пропущен' : ' — удалён из избранного'));
      setFlight(null); acting.current = false;
    }, reduced ? 0 : 180);
  }
  function undo() {
    const last = history.at(-1);
    if (!last || disabled || acting.current) return;
    onDecision(last.id, last.previous);
    setVisited(before => { const next = new Set(before); next.delete(last.id); return next; });
    setHistory(before => before.slice(0, -1)); setDrag(0);
    setAnnouncement('Последняя карточка возвращена');
  }
  function startPointer(event: PointerEvent<HTMLElement>) {
    if (disabled || !current || !event.isPrimary || event.button !== 0
      || (event.target as HTMLElement).closest('button, a, summary, input, textarea, select')) return;
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), dx: 0 };
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function movePointer(event: PointerEvent<HTMLElement>) {
    const start = pointer.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if ((!start.dx && Math.abs(dx) < 8) || (!start.dx && Math.abs(dy) > Math.abs(dx))) return;
    start.dx = dx; setDrag(dx);
  }
  function endPointer(event: PointerEvent<HTMLElement>) {
    const start = pointer.current;
    if (!start || start.id !== event.pointerId) return;
    pointer.current = null;
    const threshold = Math.min(100, event.currentTarget.clientWidth * 0.24);
    const quick = Math.abs(start.dx) > 35 && Math.abs(start.dx) / Math.max(1, performance.now() - start.time) > 0.65;
    if (Math.abs(start.dx) >= threshold || quick) decide(start.dx > 0 ? 'liked' : 'passed', start.dx > 0 ? 'right' : 'left');
    else setDrag(0);
  }
  const transform = flight ? `translateX(${flight === 'right' ? 600 : -600}px) rotate(${flight === 'right' ? 16 : -16}deg)`
    : `translateX(${drag}px) rotate(${Math.max(-12, Math.min(12, drag / 24))}deg)`;

  return <div className="candidate-deck">
    <p className="sr-only" id={helpId}>Вправо — нравится, влево — пропустить. Можно использовать кнопки или стрелки на клавиатуре.</p>
    <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
    {current ? <>
      <div className="swipe-stage"><article ref={cardElement} key={current.person.id} className={'swipe-card' + (drag ? ' is-dragging' : '') + (flight ? ' is-leaving' : '')}
        data-candidate-id={current.person.id} tabIndex={0} aria-label={'Карточка: ' + current.person.name} aria-describedby={helpId}
        style={{ transform, opacity: flight ? 0 : 1 }}
        onPointerDown={startPointer} onPointerMove={movePointer} onPointerUp={endPointer}
        onPointerCancel={() => { pointer.current = null; setDrag(0); }}
        onKeyDown={event => {
          if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
          if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault(); decide(event.key === 'ArrowRight' ? 'liked' : 'passed', event.key === 'ArrowRight' ? 'right' : 'left');
          }
        }}>
        <div className={'swipe-mark' + (drag > 35 || flight === 'right' ? ' is-like' : drag < -35 || flight === 'left' ? ' is-pass' : '')} aria-hidden="true">
          {drag > 0 || flight === 'right' ? <Heart size={28} /> : <X size={28} />}
        </div>
        <div className="swipe-person-top"><div className="avatar swipe-avatar">{initials(current.person.name)}</div>
          <div className="swipe-badges">
            {current.person.demoProfile && <span className="tag" title="Вымышленный профиль для проверки подбора">Демо</span>}
            {current.person.achievements.length > 0 && <Medal size={18} aria-label={current.person.synthetic || current.person.fspEvidence?.mode === 'demo' ? 'ФСП · демо: вымышленные результаты' : 'Есть сведения ФСП в профиле'} />}</div>
        </div>
        <div className="swipe-person-heading"><button className="person-link" onClick={() => onProfile(current.person)}>{current.person.name}<ArrowUpRight size={19} /></button>
          <p className="candidate-specialization">{specializationLabels[current.person.confirmed?.specialization || current.person.specialization]}
            <span className="dot-divider">·</span>{current.person.confirmed ? gradeLabels[current.person.confirmed.grade] : 'Грейд не подтверждён'}</p>
        </div>
        <div className="swipe-metadata"><span>{current.person.city && <><MapPin size={14} />{current.person.city}</>}{current.person.format && <><span className="dot-divider">·</span>{current.person.format}</>}</span>
          {current.person.experience && <span>{current.person.experience}</span>}</div>
        {(current.person.salaryFrom != null || current.person.salaryTo != null) && <p className="swipe-salary">{current.person.salaryFrom != null ? amount(current.person.salaryFrom) : ''}
          {current.person.salaryFrom != null && current.person.salaryTo != null ? '–' : current.person.salaryFrom != null ? '+' : 'до '}
          {current.person.salaryTo != null ? amount(current.person.salaryTo) : ''} ₽<span> / месяц</span></p>}
        <p className="swipe-bio">{current.person.bio || current.person.workHistory || 'Профессиональные сведения в профиле'}</p>
        <div className="tags swipe-stack">{current.person.stack.slice(0, 6).map(skill => <span className="tag" key={skill}>{skill}</span>)}</div>
        <div className="swipe-card-footer"><div className="swipe-test"><BadgeCheck size={18} /><strong>{current.person.confirmed?.score ?? '—'}<span>/100</span></strong></div>
          {!current.person.demoProfile && <button className="button secondary compact" disabled={disabled || pendingIds.has(current.person.id)} onClick={() => onInvite(current.person)}>{pendingIds.has(current.person.id) ? 'Отправлено' : 'Пригласить'}</button>}
        </div>
        <details className="swipe-reason"><summary>Почему подходит</summary><p>{current.reason}</p></details>
      </article></div>
    </> : <div className="empty-state swipe-empty">
      {loading || loadingMore || hasMore && !failed ? <><div className="swipe-loader" aria-hidden="true" /><p role="status">Загружаем карточки…</p></>
        : failed ? <p>Карточки временно недоступны</p>
        : <><Heart size={30} /><h3>{favorites ? items.some(item => choice.get(item.person.id) === 'liked') ? 'Избранное просмотрено' : 'В избранном пока пусто' : items.length ? 'Все карточки просмотрены' : 'Кандидатов пока нет'}</h3>
          {(visited.size > 0 || items.some(item => choice.get(item.person.id) === 'passed')) && <button className="button secondary" onClick={() => {
            setVisited(new Set()); setHistory([]); if (!favorites) onReset();
          }}>Посмотреть снова</button>}</>}
    </div>}
    <div className="swipe-actions">
      <button className="swipe-action swipe-undo" aria-label="Вернуть карточку" title="Вернуть карточку" disabled={!history.length || disabled} onClick={undo}><RotateCcw size={19} /></button>
      <button className="swipe-action swipe-pass" aria-label="Пропустить" title="Пропустить" disabled={!current || disabled} onClick={() => decide('passed', 'left')}><X size={27} /></button>
      <button className={'swipe-action swipe-like' + (favorites ? ' is-favorite' : '')} aria-label={favorites ? 'Убрать из избранного' : 'Нравится'} title={favorites ? 'Убрать из избранного' : 'Нравится'}
        disabled={!current || disabled} onClick={() => decide(favorites ? null : 'liked', 'right')}><Heart size={25} fill={favorites ? 'currentColor' : 'none'} /></button>
    </div>
  </div>;
}
