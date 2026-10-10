import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Hourglass, Sparkles, X } from 'lucide-react';
import { claimRequest } from '../claims-api';
import { dateLabel, gradeLabels, specializationNames, type Grade, type Specialization } from '../model';

type ReviewStatus = 'pending' | 'completed' | 'invalidated';
interface QueueItem { id: string; candidate: string; specialization: Specialization; grade: Grade; status: ReviewStatus; version: number;
  submittedAt: string; decidedAt: string | null; closedScore: number | null; score: number | null; passed: boolean; openCount: number; departures: number }
interface Criterion { id: string; expected: string; scale: Record<string, string> }
interface OpenTask { id: string; topic: string; title: string; text: string; answerFormat: string; minutes: number; rubric: Criterion[]; reference: string;
  criticalErrors: string[]; answer: { text: string | null; late: boolean; seconds: number } | null;
  origin: { kind: 'authored' | 'generated'; anchorId?: string; model?: string; generatedAt?: string; equivalence?: string;
    changes?: { dimension: string; beforeQuote: string; afterQuote: string; explanation: string }[]; anchor?: { id: string; title: string; prompt: string } } }
interface ClosedItem { id: string; topic: string; text: string; options: { id: string; text: string }[]; correctOptionId: string; correct: boolean; pilot: boolean;
  answer: { optionId: string | null; late: boolean; seconds: number } | null;
  origin: { kind: 'authored' | 'generated'; generator?: string; verifier?: string | null; confidence?: number | null } }
interface Detail { id: string; candidate: string; specialization: Specialization; grade: Grade; status: ReviewStatus; version: number; submittedAt: string;
  integrity: { departures: number; blockedCopies: number; blockedActions: number; fullscreenExits: number };
  result: { closedScore?: number; score: number; openScore?: number; passed: boolean; review?: { note: string } };
  decision: { decision: string; note: string; marks?: { questionId: string; criteria: { id: string; score: number }[]; comment: string }[] } | null;
  closed: ClosedItem[]; open: OpenTask[]; policy: { threshold: number; closedWeight: number; openWeight: number } }
interface Suggestion { model: string; tasks: { questionId: string; comment: string; criteria: { id: string; score: number; reason: string }[] }[] }

const statusLabels: Record<ReviewStatus, string> = { pending: 'На проверке', completed: 'Проверено', invalidated: 'Аннулировано' };
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : 'Не удалось выполнить действие.';
const formatLabels: Record<string, string> = { code: 'код', sql: 'SQL', calculation: 'расчёт', case: 'разбор кейса' };

/** Moderator view of attempts with open tasks: answers, keys, rubrics, item provenance and the decision. */
export function AssessmentReviews({ accountId }: { accountId: string }) {
  const [status, setStatus] = useState<ReviewStatus>('pending');
  const [items, setItems] = useState<QueueItem[]>([]);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    claimRequest<{ items: QueueItem[] }>('/api/moderation/assessments?status=' + status, 'GET', undefined, accountId, controller.signal)
      .then(data => { if (!controller.signal.aborted) setItems(data.items); })
      .catch(cause => { if (!controller.signal.aborted) { setItems([]); setError(errorText(cause)); } });
    return () => controller.abort();
  }, [accountId, status, reload]);

  async function open(id: string) {
    setBusy('open'); setError('');
    try { setSelected(await claimRequest<Detail>('/api/moderation/assessments/' + id, 'GET', undefined, accountId)); }
    catch (cause) { setError(errorText(cause)); } finally { setBusy(null); }
  }

  return <div className="review-layout">
    <section className="panel review-queue">
      <div className="moderation-tabs review-status" role="tablist" aria-label="Статус проверки">
        {(Object.keys(statusLabels) as ReviewStatus[]).map(value => <button key={value} role="tab" aria-selected={status === value}
          onClick={() => { setStatus(value); setSelected(null); }}>{statusLabels[value]}</button>)}
      </div>
      {error && !selected && <p className="form-error" role="alert">{error}</p>}
      {!items.length && !error && <p className="muted">{status === 'pending' ? 'Очередь пуста: новые попытки с открытыми задачами появятся здесь.' : 'Пока ничего нет.'}</p>}
      {items.map(item => <button key={item.id} className={'review-item' + (selected?.id === item.id ? ' active' : '')} onClick={() => void open(item.id)} disabled={busy === 'open'}>
        <strong>{item.candidate}</strong>
        <span>{specializationNames[item.specialization]} · {gradeLabels[item.grade]}</span>
        <span className="review-item-meta">{item.status === 'pending' ? `Закрытая часть ${item.closedScore}/100 · открытых ${item.openCount}` : `Итог ${item.score}/100 · ${item.passed ? 'пройден' : 'не пройден'}`}
          {item.departures > 0 && <span className="review-departures">уходов: {item.departures}</span>}</span>
        <time dateTime={item.submittedAt}>{dateLabel(item.submittedAt)}</time>
      </button>)}
    </section>
    {selected ? <ReviewCard key={selected.id + ':' + selected.version} detail={selected} accountId={accountId}
      onDecided={next => { setSelected(next); setReload(value => value + 1); }} />
      : <section className="panel review-empty"><Hourglass size={28} /><p className="muted">Выберите попытку: здесь будут ответы кандидата, ключи, рубрики и происхождение каждого задания.</p></section>}
  </div>;
}

function ReviewCard({ detail, accountId, onDecided }: { detail: Detail; accountId: string; onDecided: (detail: Detail) => void }) {
  const decided = detail.decision?.marks;
  const [scores, setScores] = useState<Record<string, Record<string, number>>>(() => Object.fromEntries(detail.open.map(task => [task.id,
    Object.fromEntries((decided?.find(mark => mark.questionId === task.id)?.criteria || []).map(item => [item.id, item.score]))])));
  const [comments, setComments] = useState<Record<string, string>>(() => Object.fromEntries(detail.open.map(task => [task.id, decided?.find(mark => mark.questionId === task.id)?.comment || ''])));
  const [note, setNote] = useState(detail.decision?.note || '');
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const pending = detail.status === 'pending';

  const preview = useMemo(() => {
    const taskScores = detail.open.map(task => {
      const values = task.rubric.map(item => scores[task.id]?.[item.id]);
      return values.every(value => value !== undefined) ? values.reduce((sum, value) => sum + (value as number), 0) / (2 * values.length) * 100 : null;
    });
    if (taskScores.some(value => value === null)) return null;
    const open = Math.round((taskScores as number[]).reduce((sum, value) => sum + value, 0) / taskScores.length);
    const closed = detail.result.closedScore ?? detail.result.score;
    return { open, final: Math.round(detail.policy.closedWeight * closed + detail.policy.openWeight * open) };
  }, [detail, scores]);

  async function suggest() {
    setBusy('ai'); setError('');
    try {
      const value = await claimRequest<Suggestion>(`/api/moderation/assessments/${detail.id}/ai-review`, 'POST', {}, accountId);
      setSuggestion(value);
      setScores(previous => Object.fromEntries(detail.open.map(task => [task.id, { ...Object.fromEntries((value.tasks.find(item => item.questionId === task.id)?.criteria || [])
        .map(item => [item.id, item.score])), ...previous[task.id] }])));
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(null); }
  }
  async function decide(decision: 'grade' | 'invalidate') {
    setBusy(decision); setError('');
    try {
      const body = decision === 'grade'
        ? { version: detail.version, decision, note, marks: detail.open.map(task => ({ questionId: task.id, comment: comments[task.id] || '',
          criteria: task.rubric.map(item => ({ id: item.id, score: scores[task.id]?.[item.id] })) })) }
        : { version: detail.version, decision, note };
      onDecided(await claimRequest<Detail>(`/api/moderation/assessments/${detail.id}/decision`, 'POST', body, accountId));
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(null); }
  }

  const closedCorrect = detail.closed.filter(item => item.correct && !item.pilot).length, closedTotal = detail.closed.filter(item => !item.pilot).length;
  return <section className="panel review-card" aria-label="Проверка попытки">
    <header className="review-head">
      <div><h2>{detail.candidate}</h2><p className="muted">{specializationNames[detail.specialization]} · {gradeLabels[detail.grade]} · отправлено {dateLabel(detail.submittedAt)}</p></div>
      <span className={'status review-status-' + detail.status}>{statusLabels[detail.status]}</span>
    </header>
    <div className="review-summary">
      <div><span>Закрытая часть</span><strong>{detail.result.closedScore ?? detail.result.score}/100</strong><small>{closedCorrect} из {closedTotal} верно</small></div>
      <div><span>Открытая часть</span><strong>{pending ? (preview ? preview.open + '/100' : '—') : (detail.result.openScore ?? '—') + '/100'}</strong><small>{detail.open.length} задачи по рубрике</small></div>
      <div><span>Итог</span><strong>{pending ? (preview ? preview.final + '/100' : '—') : detail.result.score + '/100'}</strong>
        <small>{pending ? (preview ? (preview.final >= detail.policy.threshold ? 'пройдёт' : 'не пройдёт') + ` · порог ${detail.policy.threshold}` : 'оцените все критерии') : detail.result.passed ? 'грейд подтверждён' : 'не подтверждён'}</small></div>
      <div><span>Контроль</span><strong>{detail.integrity.departures}</strong><small>уходов · копирований {detail.integrity.blockedCopies}</small></div>
    </div>
    {pending && <div className="review-ai"><button className="button secondary" disabled={!!busy} onClick={() => void suggest()}><Sparkles size={16} />{busy === 'ai' ? 'Модель оценивает…' : 'ИИ-подсказка оценок'}</button>
      <span className="field-help">{suggestion ? `Подставлены оценки ${suggestion.model}; проверьте каждую. Имя и контакты в модель не передаются.` : 'Модель предложит баллы по рубрике; решение за вами.'}</span></div>}

    <h3 className="review-section">Открытые задачи</h3>
    {detail.open.map((task, index) => {
      const advice = suggestion?.tasks.find(item => item.questionId === task.id);
      return <article className="review-task" key={task.id}>
        <header><span className="question-topic">Задача {index + 1} · {task.topic} · {formatLabels[task.answerFormat] || task.answerFormat} · {task.minutes} мин</span>
          <span className={'review-origin review-origin-' + task.origin.kind}>{task.origin.kind === 'generated' ? `Сгенерировано ${task.origin.model}` : 'Авторская задача банка'}</span></header>
        <h4>{task.title}</h4>
        <p className="review-text">{task.text}</p>
        {task.origin.kind === 'generated' && <details className="review-details"><summary>Как модель сделала задачу <ChevronDown size={14} /></summary>
          {task.origin.anchor && <><p className="field-caption">Исходный кейс: {task.origin.anchor.title}</p><p className="review-text muted">{task.origin.anchor.prompt}</p></>}
          {task.origin.changes?.length ? <ul className="review-changes">{task.origin.changes.map(change => <li key={change.dimension}><strong>{change.dimension}:</strong> {change.explanation}</li>)}</ul> : null}
          {task.origin.equivalence && <p className="field-help">Почему путь решения тот же: {task.origin.equivalence}</p>}
        </details>}
        <div className="review-answer"><span className="field-caption">Ответ кандидата{task.answer ? ` · ${Math.round(task.answer.seconds / 60)} мин` : ''}{task.answer?.late ? ' · после лимита времени' : ''}</span>
          {task.answer?.text ? <pre>{task.answer.text}</pre> : <p className="muted">Ответа нет — все критерии оцениваются нулём.</p>}</div>
        <details className="review-details"><summary>Эталон и типичные ошибки <ChevronDown size={14} /></summary>
          <pre className="review-reference">{task.reference}</pre>
          <ul className="review-changes">{task.criticalErrors.map(item => <li key={item}>{item}</li>)}</ul></details>
        <div className="review-rubric">{task.rubric.map(criterion => {
          const value = scores[task.id]?.[criterion.id], reason = advice?.criteria.find(item => item.id === criterion.id)?.reason;
          return <div className="review-criterion" key={criterion.id}>
            <p>{criterion.expected}</p>
            <div className="review-scale" role="radiogroup" aria-label={criterion.expected}>{[0, 1, 2].map(score => <button key={score} type="button" role="radio" aria-checked={value === score}
              title={criterion.scale[String(score)]} disabled={!pending || (score > 0 && (!task.answer?.text || task.answer.late))}
              onClick={() => setScores(previous => ({ ...previous, [task.id]: { ...previous[task.id], [criterion.id]: score } }))}>{score}</button>)}</div>
            {value !== undefined && <span className="field-help">{criterion.scale[String(value)]}</span>}
            {reason && pending && <span className="review-reason">ИИ: {reason}</span>}
          </div>;
        })}</div>
        <label className="field"><span>Комментарий к задаче</span><textarea rows={2} maxLength={2000} disabled={!pending} value={comments[task.id] || ''}
          onChange={event => setComments(previous => ({ ...previous, [task.id]: event.target.value }))} placeholder={advice?.comment || 'Что получилось и чего не хватило'} /></label>
      </article>;
    })}

    <details className="review-details review-closed"><summary>Закрытая часть: {closedCorrect} из {closedTotal} <ChevronDown size={14} /></summary>
      <ol>{detail.closed.map(item => <li key={item.id} className={item.correct ? 'correct' : 'wrong'}>
        <p><strong>{item.topic}.</strong> {item.text} {item.pilot && <span className="tag">пилот, не в зачёте</span>}</p>
        <p className="field-help">{item.correct ? <Check size={13} /> : <X size={13} />} Ответ: {item.options.find(option => option.id === item.answer?.optionId)?.text || 'нет ответа'}{item.answer?.late ? ' (после лимита)' : ''}
          {!item.correct && <> · ключ: {item.options.find(option => option.id === item.correctOptionId)?.text}</>}</p>
        <p className="field-caption">{item.origin.kind === 'generated' ? `Сгенерировано ${item.origin.generator}, решатель ${item.origin.verifier || '—'}${typeof item.origin.confidence === 'number' ? `, уверенность ${item.origin.confidence.toFixed(2)}` : ''}` : 'Авторское задание банка'}</p>
      </li>)}</ol>
    </details>

    <label className="field"><span>Комментарий кандидату</span><textarea rows={3} maxLength={2000} disabled={!pending} value={note} onChange={event => setNote(event.target.value)}
      placeholder="Итог проверки; для аннулирования — причина" /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    {pending ? <div className="button-group review-actions">
      <button className="button secondary" disabled={!!busy || note.trim().length < 10} title="Дефект задания: попытка не засчитывается и не блокирует пересдачу" onClick={() => void decide('invalidate')}>Аннулировать</button>
      <button className="button primary" disabled={!!busy || !preview} onClick={() => void decide('grade')}>{busy === 'grade' ? 'Сохраняем…' : 'Утвердить оценку'}</button>
    </div> : <p className="field-help">Решение принято{detail.decision?.note ? ': ' + detail.decision.note : ''}.</p>}
  </section>;
}
