import { useEffect, useState, type FormEvent } from 'react';
import { CalendarClock, ClipboardCheck, Plus, Repeat, Sparkles } from 'lucide-react';
import { dateLabel, initials, type Role } from '../model';
import {
  aiReviewTask, answerTask, assignTask, freshnessLabel, listTaskCandidates, listTasks, recurrenceLabels, reviewTask, taskStatusLabels,
  type EmployerTask, type TaskCandidate, type TaskFreshness, type TaskRecurrence, type TaskReview,
} from '../tasks-api';

const errorMessage = (cause: unknown) => cause instanceof Error ? cause.message : 'Не удалось выполнить действие.';
const deadlines = [{ days: 1, label: '1 день' }, { days: 3, label: '3 дня' }, { days: 7, label: '7 дней' }, { days: 14, label: '14 дней' }];
const templates = [
  { title: 'Код-ревью фрагмента', description: 'Посмотрите фрагмент кода ниже: найдите ошибки и риски, предложите исправления и объясните, почему так лучше.\n\n' },
  { title: 'Разбор инцидента', description: 'Сервис стал отвечать медленно после релиза. Опишите по шагам, как найдёте причину, какие метрики и логи проверите и как не допустить повторения.' },
  { title: 'Мини-задача по стеку', description: 'Решите небольшую задачу на основном стеке. Приложите решение и кратко опишите выбранный подход и его ограничения.\n\n' },
];
const statusClass = (status: EmployerTask['status']) => 'status task-status-' + status;

export function TaskBoard({ role, revision = 0, notify }: { role: Role; revision?: number; notify?: (message: string) => void }) {
  const [items, setItems] = useState<EmployerTask[]>([]);
  const [freshness, setFreshness] = useState<TaskFreshness | null>(null);
  const [candidates, setCandidates] = useState<TaskCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    Promise.all([listTasks(controller.signal), role === 'employer' ? listTaskCandidates(controller.signal) : Promise.resolve({ items: [] })])
      .then(([page, eligible]) => {
        if (controller.signal.aborted) return;
        setItems(page.items); setFreshness(page.freshness); setCandidates(eligible.items); setLoading(false);
      })
      .catch(cause => { if (!controller.signal.aborted) { setError(errorMessage(cause)); setLoading(false); } });
    return () => controller.abort();
  }, [role, revision, reload]);

  const replace = (task: EmployerTask, next?: EmployerTask | null) =>
    setItems(previous => [...(next ? [next] : []), ...previous.map(item => item.id === task.id ? task : item)]);
  const open = items.filter(item => ['assigned', 'submitted'].includes(item.status)).length;

  return <>
    <div className="page-heading tasks-heading">
      <h1>Задания{open > 0 && <span className="heading-count">{open}</span>}</h1>
      {role === 'employer' && !creating && <button className="button primary" disabled={!candidates.length} onClick={() => setCreating(true)}><Plus size={16} />Новое задание</button>}
    </div>
    <p className="tasks-intro">{role === 'employer'
      ? 'Короткие практические задания кандидатам, которые откликнулись или приняли приглашение. Можно сделать задание регулярным: принятое задание показывает в подборке, что навыки кандидата актуальны.'
      : 'Короткие задания от компаний, с которыми вы на связи. Принятое работодателем задание показывает в подборке, что навыки актуальны. На подтверждённый тестом грейд задания не влияют.'}</p>
    {role === 'candidate' && freshness && <p className="task-freshness"><ClipboardCheck size={16} />Последнее принятое задание — {freshnessLabel(freshness)}</p>}
    {role === 'employer' && !loading && !candidates.length && !items.length && <p className="tasks-intro muted">Назначить задание можно после отклика кандидата или принятого приглашения.</p>}
    {creating && <TaskForm candidates={candidates} onCancel={() => setCreating(false)}
      onCreated={task => { setItems(previous => [task, ...previous]); setCreating(false); notify?.('Задание отправлено'); }} />}
    {error && <div className="directory-error" role="alert"><p>{error}</p><button className="button secondary compact" onClick={() => setReload(value => value + 1)}>Повторить</button></div>}
    {loading && <div className="directory-feedback" role="status">Загружаем задания…</div>}
    {!loading && !error && !items.length && <div className="empty-state"><ClipboardCheck size={32} /><h2>Заданий пока нет</h2>
      <p>{role === 'employer' ? 'Отправьте первое задание кандидату из откликов или приглашений.' : 'Здесь появятся задания от компаний после отклика или принятого приглашения.'}</p></div>}
    {!loading && items.length > 0 && <div className="invitation-list">
      {items.map(task => role === 'employer'
        ? <EmployerTaskCard key={task.id} task={task} onChange={replace} notify={notify} />
        : <CandidateTaskCard key={task.id} task={task} onChange={replace} notify={notify} />)}
    </div>}
  </>;
}

function TaskForm({ candidates, onCreated, onCancel }: {
  candidates: TaskCandidate[]; onCreated: (task: EmployerTask) => void; onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    const days = Number(fields.get('deadline'));
    setBusy(true); setError('');
    try {
      onCreated(await assignTask({ candidateId: String(fields.get('candidateId')), title: title.trim(), description: description.trim(),
        dueAt: new Date(Date.now() + days * 86400000).toISOString(), recurrenceDays: Number(fields.get('recurrence')) as TaskRecurrence }));
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <form className="panel task-form" onSubmit={submit} aria-label="Новое задание">
    <div className="form-grid">
      <label className="field"><span>Кандидат</span><select name="candidateId" required>
        {candidates.map(person => <option key={person.id} value={person.id}>{person.name}{person.specialization ? ' · ' + person.specialization : ''} — {person.source === 'application' ? 'отклик' : 'приглашение'}</option>)}
      </select></label>
      <label className="field"><span>Срок ответа</span><select name="deadline" defaultValue="7">
        {deadlines.map(item => <option key={item.days} value={item.days}>{item.label}</option>)}
      </select></label>
    </div>
    <div className="task-templates" aria-label="Шаблоны">{templates.map(item => <button type="button" className="filter-chip" key={item.title}
      onClick={() => { setTitle(item.title); setDescription(item.description); }}>{item.title}</button>)}</div>
    <label className="field"><span>Название</span><input name="title" required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} placeholder="Например, код-ревью формы входа" /></label>
    <label className="field"><span>Условие</span><textarea name="description" required maxLength={4000} rows={5} value={description} onChange={event => setDescription(event.target.value)} placeholder="Что нужно сделать и что прислать в ответ" /></label>
    <label className="field task-recurrence"><span>Повтор</span><select name="recurrence" defaultValue="0">
      {([0, 7, 30, 90] as TaskRecurrence[]).map(value => <option key={value} value={value}>{recurrenceLabels[value]}</option>)}
    </select><span className="field-caption">Следующее задание откроется автоматически после того, как вы примете ответ.</span></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button type="button" className="button secondary" onClick={onCancel}>Отмена</button><button className="button primary" type="submit" disabled={busy}>{busy ? 'Отправляем…' : 'Отправить задание'}</button></div>
  </form>;
}

function TaskMeta({ task }: { task: EmployerTask }) {
  return <p className="task-meta">
    <span><CalendarClock size={13} />{task.reviewedAt ? 'Проверено ' + dateLabel(task.reviewedAt)
      : task.status === 'scheduled' ? 'Откроется ' + dateLabel(task.availableAt) : 'Срок ' + dateLabel(task.dueAt)}</span>
    {task.recurrenceDays > 0 && <span><Repeat size={13} />{recurrenceLabels[task.recurrenceDays]} · цикл {task.cycle}</span>}
  </p>;
}

function EmployerTaskCard({ task, onChange, notify }: { task: EmployerTask; onChange: (task: EmployerTask, next?: EmployerTask | null) => void; notify?: (message: string) => void }) {
  const [feedback, setFeedback] = useState('');
  const [review, setReview] = useState<TaskReview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  async function decide(status: 'approved' | 'rejected' | 'cancelled') {
    if (busy) return;
    setBusy(status); setError('');
    try {
      const result = await reviewTask(task.id, status, feedback.trim());
      onChange(result.task, result.nextTask);
      notify?.(status === 'approved' ? (result.nextTask ? 'Ответ принят, следующее задание запланировано' : 'Ответ принят') : status === 'rejected' ? 'Отправлено на доработку' : 'Задание отменено');
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(null); }
  }
  async function analyse() {
    if (busy) return;
    setBusy('ai'); setError('');
    try { setReview(await aiReviewTask(task.id)); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(null); }
  }
  return <article className="invitation-card task-card">
    <div className="invitation-top"><div className="invite-person"><div className="avatar">{initials(task.candidate.name)}</div><div><strong>{task.candidate.name}</strong><span>{dateLabel(task.date)}</span></div></div><span className={statusClass(task.status)}>{taskStatusLabels[task.status]}</span></div>
    <h2>{task.title}</h2>
    <TaskMeta task={task} />
    <p className="invitation-description task-text">{task.description}</p>
    {task.answer && <div className="task-answer"><span>Ответ · {task.answeredAt ? dateLabel(task.answeredAt) : ''}</span><p>{task.answer}</p></div>}
    {review && <TaskReviewView review={review} />}
    {task.feedback && <div className="task-feedback"><span>Ваш комментарий</span><p>{task.feedback}</p></div>}
    {task.status === 'submitted' && <div className="task-review-actions">
      <label className="field"><span>Комментарий кандидату</span><textarea rows={2} maxLength={2000} value={feedback} onChange={event => setFeedback(event.target.value)} placeholder="Что получилось и что улучшить" /></label>
      <div className="button-group">
        {!review && <button className="button secondary" disabled={Boolean(busy)} onClick={() => void analyse()}><Sparkles size={16} />{busy === 'ai' ? 'Разбираем…' : 'ИИ-разбор'}</button>}
        <button className="button secondary" disabled={Boolean(busy)} onClick={() => void decide('rejected')}>На доработку</button>
        <button className="button primary" disabled={Boolean(busy)} onClick={() => void decide('approved')}>Принять</button>
      </div>
    </div>}
    {['assigned', 'scheduled'].includes(task.status) && <div className="invitation-bottom"><span className="privacy-note">Кандидат ещё не ответил</span><button className="text-button" disabled={Boolean(busy)} onClick={() => void decide('cancelled')}>Отменить задание</button></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </article>;
}

function TaskReviewView({ review }: { review: TaskReview }) {
  return <section className={'task-ai-review task-ai-' + review.verdict} aria-label="ИИ-разбор ответа">
    <header><Sparkles size={15} /><strong>{review.verdict === 'approve' ? 'Можно принять' : 'Стоит доработать'}</strong>{review.score !== null && <span>{review.score}/100</span>}</header>
    {review.summary && <p>{review.summary}</p>}
    {review.strengths.length > 0 && <><span className="task-ai-label">Сильные стороны</span><ul>{review.strengths.map(item => <li key={item}>{item}</li>)}</ul></>}
    {review.gaps.length > 0 && <><span className="task-ai-label">Пробелы</span><ul>{review.gaps.map(item => <li key={item}>{item}</li>)}</ul></>}
    {review.questions.length > 0 && <><span className="task-ai-label">Уточнить у кандидата</span><ul>{review.questions.map(item => <li key={item}>{item}</li>)}</ul></>}
    <footer>Подсказка, а не решение. {review.source === 'llm' ? 'Модель ' + review.model : 'Проверка полноты по ключевым словам: модель недоступна'}. Имя и контакты кандидата не передаются.</footer>
  </section>;
}

function CandidateTaskCard({ task, onChange, notify }: { task: EmployerTask; onChange: (task: EmployerTask) => void; notify?: (message: string) => void }) {
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !answer.trim()) return;
    setBusy(true); setError('');
    try { onChange(await answerTask(task.id, answer.trim())); notify?.('Ответ отправлен'); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <article className="invitation-card task-card">
    <div className="invitation-top"><div className="invite-person"><div className="avatar">{initials(task.company)}</div><div><strong>{task.company}</strong><span>{dateLabel(task.date)}</span></div></div><span className={statusClass(task.status)}>{taskStatusLabels[task.status]}</span></div>
    <h2>{task.title}</h2>
    <TaskMeta task={task} />
    <p className="invitation-description task-text">{task.description}</p>
    {task.answer && <div className="task-answer"><span>Ваш ответ · {task.answeredAt ? dateLabel(task.answeredAt) : ''}</span><p>{task.answer}</p></div>}
    {task.feedback && <div className="task-feedback"><span>Комментарий компании</span><p>{task.feedback}</p></div>}
    {task.status === 'assigned' && <form className="task-answer-form" onSubmit={submit}>
      <label className="field"><span>Ответ</span><textarea rows={6} maxLength={6000} value={answer} onChange={event => setAnswer(event.target.value)} placeholder="Решение, шаги, ссылки на код" /></label>
      <div className="invitation-bottom"><span className="privacy-note">{answer.length} / 6000</span><button className="button primary" type="submit" disabled={busy || !answer.trim()}>{busy ? 'Отправляем…' : 'Отправить ответ'}</button></div>
    </form>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </article>;
}
