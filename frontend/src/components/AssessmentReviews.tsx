import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Hourglass, Sparkles, X } from 'lucide-react';
import { claimRequest } from '../claims-api';
import { dateLabel, gradeLabels, specializationNames, type Grade, type Specialization } from '../model';

type ReviewStatus = 'pending' | 'ai' | 'completed' | 'invalidated' | 'all';
type ItemStatus = Exclude<ReviewStatus, 'all'> | 'auto';
interface QueueItem { id: string; candidate: string; specialization: Specialization; grade: Grade; status: ItemStatus; version: number; annulled?: boolean;
  submittedAt: string; decidedAt: string | null; closedScore: number | null; score: number | null; passed: boolean; openCount: number; departures: number;
  openStatus?: 'ai' | 'queued' | 'expert' | null; reviewedByExpert?: boolean }
interface Criterion { id: string; expected: string; scale: Record<string, string> }
interface OpenTask { id: string; topic: string; title: string; text: string; answerFormat: string; minutes: number; rubric: Criterion[]; reference: string;
  criticalErrors: string[]; answer: { text: string | null; late: boolean; seconds: number } | null;
  origin: { kind: 'authored' | 'generated'; anchorId?: string; model?: string; generatedAt?: string; equivalence?: string;
    changes?: { dimension: string; beforeQuote: string; afterQuote: string; explanation: string }[]; anchor?: { id: string; title: string; prompt: string } } }
interface ClosedItem { id: string; topic: string; text: string; options: { id: string; text: string }[]; correctOptionId: string; correct: boolean; pilot: boolean;
  answer: { optionId: string | null; late: boolean; seconds: number } | null;
  origin: { kind: 'authored' | 'generated'; generator?: string; verifier?: string | null; confidence?: number | null } }
interface Detail { id: string; candidate: string; specialization: Specialization; grade: Grade; status: ItemStatus; version: number; submittedAt: string; answersRecorded: boolean;
  integrity: { departures: number; blockedCopies: number; blockedActions: number; fullscreenExits: number };
  result: { closedScore?: number; score: number; openScore?: number; passed: boolean; annulled?: boolean; pending?: boolean; invalidated?: boolean;
    openStatus?: 'ai' | 'queued' | 'expert'; openTimedOut?: boolean; reviewedByExpert?: boolean;
    review?: { note: string; previousScore?: number; previousOpenScore?: number | null; previousStatus?: 'ai' | 'queued' };
    competencies?: { topic: string; correct: number; total: number }[] };
  aiReview?: null | { status: 'scored'; model: string | null; at: string; marks: AiMark[]; graders?: GraderOpinion[] }
    | { status: 'failed'; reason: string; at: string; flags?: { questionId: string; fragment?: string; model?: string }[]; graders?: GraderOpinion[] };
  confirmation?: null | { applied: boolean; action?: 'confirmed' | 'revoked'; reason?: string };
  decision: { decision: string; note: string; marks?: { questionId: string; criteria: { id: string; score: number }[]; comment: string }[] } | null;
  closed: ClosedItem[]; open: OpenTask[]; policy: { threshold: number; closedWeight: number; openWeight: number } }
interface AiCriterion { id: string; score: number; reason: string; scores?: number[]; evidence?: string; unsupported?: number }
interface AiMark { questionId: string; score?: number; comment: string; manipulation?: boolean; criteria: AiCriterion[] }
/** One model's own marks, kept when two graders scored the practice. */
interface GraderOpinion { model: string | null; marks: AiMark[] }
interface Suggestion { model: string; tasks: { questionId: string; comment: string; criteria: { id: string; score: number; reason: string }[] }[] }

const statusLabels: Record<ReviewStatus, string> = { pending: 'Ждут эксперта', ai: 'Оценено ИИ', completed: 'Проверено', invalidated: 'Аннулировано', all: 'Все попытки' };
const itemLabels: Record<ItemStatus, string> = { pending: 'Ждёт эксперта', ai: 'Оценено ИИ', completed: 'Проверено экспертом', invalidated: 'Аннулировано экспертом', auto: 'Автоматически' };
const failureLabels: Record<string, string> = { 'no-key': 'на сервере не задан ключ модели', timeout: 'модель не ответила вовремя', format: 'ответ модели в неожиданном формате',
  incomplete: 'модель оценила не все критерии', unavailable: 'модель недоступна', invalid_response: 'ответ модели не разобран', configuration: 'модель не настроена',
  manipulation: 'в ответе попытка повлиять на проверку', disagreement: 'две модели разошлись в оценке' };
const modelName = (model: string | null) => model ? model.split('/').pop()!.split('-').slice(0, 2).join('-') : 'ИИ';
const emptyLabels: Partial<Record<ReviewStatus, string>> = { pending: 'Очередь пуста: попытки, практику которых ИИ не смог оценить, появятся здесь.',
  ai: 'Пока нет попыток, оценённых ИИ: они появятся сразу после завершения теста.' };

function itemMeta(item: QueueItem) {
  if (item.annulled) return 'Аннулирована: уходы со страницы';
  if (item.status === 'pending') return item.openStatus === 'queued'
    ? `Закрытая часть ${item.closedScore}/100 · практика ${item.openCount} ждёт оценки · грейд ${item.passed ? 'подтверждён' : 'не подтверждён до решения'}`
    : `Закрытая часть ${item.closedScore}/100 · открытых ${item.openCount}`;
  if (item.status === 'ai') return `Итог ${item.score}/100 · ${item.passed ? 'пройден' : 'не пройден'} · практику оценил ИИ`;
  return `Итог ${item.score}/100 · ${item.passed ? 'пройден' : 'не пройден'}${item.reviewedByExpert ? ' · проверено экспертом' : ''}`;
}
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : 'Не удалось выполнить действие.';
const formatLabels: Record<string, string> = { code: 'код', sql: 'SQL', calculation: 'расчёт', case: 'разбор кейса' };

/** Moderator view of attempts with open tasks: answers, keys, rubrics, item provenance and the decision. */
export function AssessmentReviews({ accountId, onDecided }: { accountId: string; onDecided?: () => void }) {
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
      {!items.length && !error && <p className="muted">{emptyLabels[status] || 'Пока ничего нет.'}</p>}
      {items.map(item => <button key={item.id} className={'review-item' + (selected?.id === item.id ? ' active' : '')} onClick={() => void open(item.id)} disabled={busy === 'open'}>
        <strong>{item.candidate}</strong>
        <span>{specializationNames[item.specialization]} · {gradeLabels[item.grade]}</span>
        <span className="review-item-meta">{itemMeta(item)}
          {status === 'all' && <span>{itemLabels[item.status]}</span>}
          {item.departures > 0 && <span className="review-departures">уходов: {item.departures}</span>}</span>
        <time dateTime={item.submittedAt}>{dateLabel(item.submittedAt)}</time>
      </button>)}
    </section>
    {selected ? <ReviewCard key={selected.id + ':' + selected.version} detail={selected} accountId={accountId}
      onDecided={next => { setSelected(next); setReload(value => value + 1); onDecided?.(); }} />
      : <section className="panel review-empty"><Hourglass size={28} /><p className="muted">Выберите попытку: здесь будут ответы кандидата, ключи, рубрики и происхождение каждого задания.</p></section>}
  </div>;
}

function confirmationText(detail: Detail) {
  const value = detail.confirmation;
  if (!value) return detail.result.passed ? 'Профиль кандидата не менялся.' : 'Категория профиля не менялась: попытка её не подтверждала.';
  if (value.applied) return value.action === 'revoked' ? 'Категория снята с профиля кандидата.' : 'Категория подтверждена в профиле кандидата.';
  return `Профиль не изменён${value.reason ? ': ' + value.reason : '.'}`;
}

function ReviewCard({ detail, accountId, onDecided }: { detail: Detail; accountId: string; onDecided: (detail: Detail) => void }) {
  // A decision shows the expert's marks; an attempt scored by the models starts from their agreed marks.
  // A criterion where the two models differ by a point stays empty: the expert chooses.
  const aiMarks = detail.aiReview?.status === 'scored' ? detail.aiReview.marks : null;
  const graders = detail.aiReview?.graders || null;
  const flags = detail.aiReview?.status === 'failed' ? detail.aiReview.flags || [] : [];
  const decided = detail.decision?.marks || (detail.status === 'ai' ? aiMarks : null);
  const [scores, setScores] = useState<Record<string, Record<string, number>>>(() => Object.fromEntries(detail.open.map(task => [task.id,
    Object.fromEntries((decided?.find(mark => mark.questionId === task.id)?.criteria || []).filter(item => Number.isInteger(item.score)).map(item => [item.id, item.score]))])));
  const [comments, setComments] = useState<Record<string, string>>(() => Object.fromEntries(detail.open.map(task => [task.id, decided?.find(mark => mark.questionId === task.id)?.comment || ''])));
  const [note, setNote] = useState(detail.decision?.note || '');
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  // Waiting for an expert or scored by the model: the expert may grade or annul.
  const pending = detail.status === 'pending' || detail.status === 'ai';
  const scoredByAi = detail.status === 'ai';

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

  const closedTotal = detail.closed.filter(item => !item.pilot).length;
  const closedCorrect = detail.answersRecorded ? detail.closed.filter(item => item.correct && !item.pilot).length
    : (detail.result.competencies || []).reduce((sum, item) => sum + item.correct, 0);
  return <section className="panel review-card" aria-label="Проверка попытки">
    <header className="review-head">
      <div><h2>{detail.candidate}</h2><p className="muted">{specializationNames[detail.specialization]} · {gradeLabels[detail.grade]} · отправлено {dateLabel(detail.submittedAt)}</p></div>
      <span className={'status review-status-' + detail.status}>{itemLabels[detail.status]}</span>
    </header>
    <div className="review-summary">
      <div><span>Закрытая часть</span><strong>{detail.result.closedScore ?? detail.result.score}/100</strong><small>{closedCorrect} из {closedTotal} верно</small></div>
      {detail.open.length > 0 && <div><span>Открытая часть</span><strong>{pending ? (preview ? preview.open + '/100' : '—') : (detail.result.openScore ?? '—') + '/100'}</strong><small>{detail.open.length} задачи по рубрике</small></div>}
      <div><span>Итог</span><strong>{pending ? (preview ? preview.final + '/100' : '—') : detail.result.score + '/100'}</strong>
        <small>{pending ? (preview ? (preview.final >= detail.policy.threshold ? 'пройдёт' : 'не пройдёт') + ` · порог ${detail.policy.threshold}` : 'оцените все критерии') : detail.result.passed ? 'грейд подтверждён' : 'не подтверждён'}
          {pending && detail.result.openStatus && ` · сейчас ${detail.result.score}/100, ${detail.result.passed ? 'грейд подтверждён' : 'не подтверждён'}`}</small></div>
      <div><span>Контроль</span><strong>{detail.integrity.departures}</strong><small>уходов · копирований {detail.integrity.blockedCopies}</small></div>
    </div>
    {scoredByAi && <p className="review-ai-note"><Sparkles size={15} />Практику оценили {graders && graders.length > 1 ? 'две модели' : 'ИИ'}{detail.aiReview?.status === 'scored' && detail.aiReview.model ? ` (${detail.aiReview.model})` : ''} по рубрике: {detail.result.openScore}/100, итог {detail.result.score}/100 — грейд {detail.result.passed ? 'подтверждён' : 'не подтверждён'}. Каждый балл подтверждён цитатой из ответа. Согласованные баллы подставлены ниже; где модели разошлись на балл, выберите сами. Подтвердите оценку или аннулируйте попытку.{detail.result.openTimedOut ? ' Время истекло на практическом этапе.' : ''}</p>}
    {detail.status === 'pending' && detail.result.openStatus === 'queued' && <p className="review-ai-note review-ai-failed">ИИ не выставил оценку практики{detail.aiReview?.status === 'failed' ? `: ${failureLabels[detail.aiReview.reason] || detail.aiReview.reason}` : ''}. Грейд не подтверждён до вашего решения; закрытая часть — {detail.result.closedScore}/100.</p>}
    {flags.some(flag => flag.fragment) && <div className="review-ai-note review-ai-failed"><span>Фрагменты, обращённые к проверяющему:</span>{flags.filter(flag => flag.fragment).map(flag => <q key={flag.questionId}>{flag.fragment}</q>)}</div>}
    {detail.status === 'pending' && <div className="review-ai"><button className="button secondary" disabled={!!busy} onClick={() => void suggest()}><Sparkles size={16} />{busy === 'ai' ? 'Модель оценивает…' : 'ИИ-подсказка оценок'}</button>
      <span className="field-help">{suggestion ? `Подставлены оценки ${suggestion.model}; проверьте каждую. Имя и контакты в модель не передаются.` : 'Модель предложит баллы по рубрике; решение за вами.'}</span></div>}

    {detail.open.length > 0 && <h3 className="review-section">Открытые задачи</h3>}
    {!detail.open.length && <p className="muted">Открытых задач нет: {detail.result.annulled ? 'попытка аннулирована за уходы со страницы' : detail.result.passed ? 'тест прошёл без практического этапа' : 'закрытая часть не пройдена, практический этап не выдавался'}.</p>}
    {detail.open.map((task, index) => {
      const advice = suggestion?.tasks.find(item => item.questionId === task.id) || aiMarks?.find(item => item.questionId === task.id);
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
          const value = scores[task.id]?.[criterion.id], advised = advice?.criteria.find(item => item.id === criterion.id) as AiCriterion | undefined;
          const opinions = graders?.map(grader => ({ model: grader.model, item: grader.marks.find(mark => mark.questionId === task.id)?.criteria.find(item => item.id === criterion.id) })).filter(entry => entry.item);
          return <div className="review-criterion" key={criterion.id}>
            <p>{criterion.expected}</p>
            <div className="review-scale" role="radiogroup" aria-label={criterion.expected}>{[0, 1, 2].map(score => <button key={score} type="button" role="radio" aria-checked={value === score}
              title={criterion.scale[String(score)]} disabled={!pending || (score > 0 && (!task.answer?.text || task.answer.late))}
              onClick={() => setScores(previous => ({ ...previous, [task.id]: { ...previous[task.id], [criterion.id]: score } }))}>{score}</button>)}</div>
            {value !== undefined && <span className="field-help">{criterion.scale[String(value)]}</span>}
            {opinions?.length ? opinions.map(({ model, item }) => <span className="review-reason" key={model}>{modelName(model)}: {item!.unsupported !== undefined ? `${item!.unsupported} без цитаты → не засчитано` : item!.score}{item!.reason ? ' — ' + item!.reason : ''}{item!.evidence ? <> · <q>{item!.evidence}</q></> : null}</span>)
              : advised?.reason && <span className="review-reason">ИИ: {advised.reason}{advised.evidence ? <> · <q>{advised.evidence}</q></> : null}</span>}
          </div>;
        })}</div>
        <label className="field"><span>Комментарий к задаче</span><textarea rows={2} maxLength={2000} disabled={!pending} value={comments[task.id] || ''}
          onChange={event => setComments(previous => ({ ...previous, [task.id]: event.target.value }))} placeholder={advice?.comment || 'Что получилось и чего не хватило'} /></label>
        {aiMarks && !scoredByAi && <p className="field-help">ИИ при сдаче: {aiMarks.find(item => item.questionId === task.id)?.score ?? '—'}/100</p>}
      </article>;
    })}

    {!detail.answersRecorded && <p className="field-help">Попытка проверена целиком: по вопросам видны условия и ключи, ответы кандидата по каждому вопросу не сохранялись.</p>}
    <details className="review-details review-closed"><summary>Закрытая часть: {closedCorrect} из {closedTotal} <ChevronDown size={14} /></summary>
      <ol>{detail.closed.map(item => <li key={item.id} className={item.correct ? 'correct' : 'wrong'}>
        <p><strong>{item.topic}.</strong> {item.text} {item.pilot && <span className="tag">пилот, не в зачёте</span>}</p>
        <p className="field-help">{item.correct ? <Check size={13} /> : <X size={13} />} Ответ: {item.options.find(option => option.id === item.answer?.optionId)?.text || 'нет ответа'}{item.answer?.late ? ' (после лимита)' : ''}
          {!item.correct && <> · ключ: {item.options.find(option => option.id === item.correctOptionId)?.text}</>}</p>
        <p className="field-caption">{item.origin.kind === 'generated' ? `Сгенерировано ${item.origin.generator}, решатель ${item.origin.verifier || '—'}${typeof item.origin.confidence === 'number' ? `, уверенность ${item.origin.confidence.toFixed(2)}` : ''}` : 'Авторское задание банка'}</p>
      </li>)}</ol>
    </details>

    {(pending || detail.decision) && <label className="field"><span>Комментарий кандидату</span><textarea rows={3} maxLength={2000} disabled={!pending} value={note} onChange={event => setNote(event.target.value)}
      placeholder="Итог проверки; для аннулирования — причина" /></label>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {pending ? <div className="button-group review-actions">
      <button className="button secondary" disabled={!!busy || note.trim().length < 10} title={detail.result.openStatus ? 'Попытка не засчитывается; категория, подтверждённая ею, снимается с профиля. Нужна причина от 10 символов' : 'Дефект задания: попытка не засчитывается и не блокирует пересдачу'} onClick={() => void decide('invalidate')}>{busy === 'invalidate' ? 'Сохраняем…' : 'Аннулировать'}</button>
      <button className="button primary" disabled={!!busy || !preview} onClick={() => void decide('grade')}>{busy === 'grade' ? 'Сохраняем…' : 'Утвердить оценку'}</button>
    </div> : detail.status === 'auto' ? <p className="field-help">Результат посчитан автоматически: проверка модератора не требовалась.</p>
      : <p className="field-help review-decided">{detail.status === 'invalidated' ? 'Аннулировано экспертом' : 'Проверено экспертом'}{detail.decision?.note ? ': ' + detail.decision.note : ''}.
        {detail.result.review?.previousScore !== undefined && ` До проверки: ${detail.result.review.previousScore}/100${detail.result.review.previousStatus === 'ai' ? `, практика ИИ ${detail.result.review.previousOpenScore ?? '—'}/100` : ', практика не оценена'}.`}</p>}
    {detail.confirmation !== undefined && <p className={'review-confirmation' + (detail.confirmation && !detail.confirmation.applied ? ' review-confirmation-skipped' : '')} role="status">{confirmationText(detail)}</p>}
  </section>;
}
