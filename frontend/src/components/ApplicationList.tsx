import { useEffect, useRef, useState } from 'react';
import { dateLabel, gradeLabels, money, specializationNames, type Candidate, type Role } from '../model';
import { listApplications, respondToApplication, type Application } from '../companies-api';
import { readCandidateContacts } from '../platform-api';
import { CandidateDetails } from './CandidateDetails';
import { Dialog } from './Dialog';

const statusLabels = { sent: 'На рассмотрении', accepted: 'Отклик принят', rejected: 'Отклик отклонён' } as const;
const errorMessage = (cause: unknown) => cause instanceof Error ? cause.message : 'Не удалось выполнить действие.';
type Contact = { email: string; phone: string };
type ProfileDialog = { person: Candidate; loading: boolean; contacts: boolean; error: string };

export function ApplicationList({ role, revision = 0, notify, showEmpty = true, onLoaded }: {
  role: Role; revision?: number; notify?: (message: string) => void; showEmpty?: boolean;
  onProfile?: (person: Candidate) => void; onLoaded?: (items: Application[]) => void;
}) {
  const [items, setItems] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [loadingContact, setLoadingContact] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ProfileDialog | null>(null);
  const dialogSequence = useRef(0);
  const dialogPersonId = useRef<string | null>(null);
  const contactSequence = useRef(0);
  const onLoadedRef = useRef(onLoaded); onLoadedRef.current = onLoaded;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    contactSequence.current += 1;
    // A new server revision may revoke consent or remove the applicant. An
    // open dialog must not keep its earlier contact permission or PDF data.
    dialogSequence.current += 1;
    dialogPersonId.current = null;
    setDialog(null);
    setLoadingContact(null); setContacts({}); setContactErrors({});
    listApplications(role, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setItems(result.items); setLoading(false); setContacts({}); setContactErrors({});
    }).catch(cause => {
      if (!controller.signal.aborted) { setLoading(false); setError(errorMessage(cause)); }
    });
    return () => controller.abort();
  }, [role, revision, reload]);

  useEffect(() => { if (!loading) onLoadedRef.current?.(items); }, [items, loading]);

  useEffect(() => {
    return () => { dialogSequence.current += 1; };
  }, [role]);

  async function respond(application: Application, status: 'accepted' | 'rejected') {
    if (busy) return;
    setBusy(application.id); setError('');
    try {
      const updated = await respondToApplication(application.id, status);
      setItems(previous => previous.map(item => item.id === updated.id ? updated : item));
      if (!updated.candidate) {
        contactSequence.current += 1; setLoadingContact(null);
        if (dialogPersonId.current === updated.candidateId) {
          dialogSequence.current += 1; dialogPersonId.current = null; setDialog(null);
        }
        setContacts(previous => { const next = { ...previous }; delete next[updated.id]; return next; });
      }
      notify?.(status === 'accepted' ? 'Отклик принят' : 'Отклик отклонён');
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(null); }
  }

  async function openProfile(application: Application) {
    if (!application.candidate) return;
    const person = { ...application.candidate, email: '', phone: '' };
    const request = ++dialogSequence.current;
    dialogPersonId.current = person.id;
    setDialog({ person, loading: true, contacts: false, error: '' });
    try {
      const actual = await readCandidateContacts(application.candidateId);
      if (dialogSequence.current !== request) return;
      setDialog({ person: { ...person, ...actual }, loading: false, contacts: true, error: '' });
    } catch (cause) {
      if (dialogSequence.current === request) {
        setDialog({ person, loading: false, contacts: false, error: errorMessage(cause) });
        setContacts(previous => { const next = { ...previous }; delete next[application.id]; return next; });
      }
    }
  }

  async function showContacts(application: Application) {
    if (loadingContact) return;
    const request = ++contactSequence.current;
    setLoadingContact(application.id);
    setContactErrors(previous => ({ ...previous, [application.id]: '' }));
    setContacts(previous => { const next = { ...previous }; delete next[application.id]; return next; });
    try {
      const actual = await readCandidateContacts(application.candidateId);
      if (contactSequence.current === request) setContacts(previous => ({ ...previous, [application.id]: actual }));
    } catch (cause) {
      if (contactSequence.current === request) {
        setContactErrors(previous => ({ ...previous, [application.id]: errorMessage(cause) }));
        if (dialogPersonId.current === application.candidateId) {
          dialogSequence.current += 1;
          setDialog(previous => previous?.person.id === application.candidateId ? {
            ...previous, person: { ...previous.person, email: '', phone: '' }, loading: false, contacts: false, error: errorMessage(cause),
          } : previous);
        }
      }
    }
    finally { if (contactSequence.current === request) setLoadingContact(null); }
  }

  const closeDialog = () => { dialogSequence.current += 1; dialogPersonId.current = null; setDialog(null); };
  if (!loading && !error && !items.length && !showEmpty) return null;
  return <section className="application-list" aria-labelledby="application-heading">
    <h2 id="application-heading">{role === 'employer' ? 'Отклики' : 'Мои отклики'}</h2>
    {loading && <p role="status">Загружаем отклики…</p>}
    {error && <div className="form-error" role="alert">{error}<button className="text-button" onClick={() => setReload(value => value + 1)}>Повторить загрузку откликов</button></div>}
    {!loading && !error && !items.length && <div className="panel empty-state"><p>{role === 'candidate' ? 'Предложений пока нет' : 'Откликов пока нет'}</p>
      <p className="muted">{role === 'candidate' ? 'Посмотрите открытые позиции компаний: ваши отклики появятся здесь.' : 'Опубликуйте позицию в профиле компании, чтобы получать отклики.'}</p></div>}
    {items.map(application => <article className="panel application-card" data-application-id={application.id} key={application.id}>
      <div className="application-header"><div><h3>{role === 'employer' ? application.candidate?.name || 'Профиль кандидата недоступен' : application.vacancy.company || application.company}</h3>
        <p>{application.vacancy.title}</p></div><span className={'status application-status ' + application.status}>{statusLabels[application.status]}</span></div>
      <p className="offer-meta">{specializationNames[application.vacancy.specialization]} · {gradeLabels[application.vacancy.grade]} · {application.vacancy.city || 'Любой город'} · {application.vacancy.format}</p>
      <p className="offer-salary">{money(application.vacancy.salaryFrom)}–{money(application.vacancy.salaryTo)} ₽ в месяц</p>
      <details className="application-snapshot"><summary>Условия на момент отклика</summary>
        <p className="body-copy">{application.vacancy.description}</p>
        <div className="tags">{application.vacancy.stack.map(skill => <span className="tag" key={skill}>{skill}</span>)}</div>
        <p className="field-help">Сохранённые условия предложения не меняются после отправки отклика.</p>
      </details>
      {application.message && <div className="application-message"><h4>Сообщение кандидата</h4><p className="body-copy">{application.message}</p></div>}
      <p className="field-caption">Отклик от <time dateTime={application.date}>{dateLabel(application.date)}</time>{application.respondedAt && <> · Ответ от <time dateTime={application.respondedAt}>{dateLabel(application.respondedAt)}</time></>}</p>
      {role === 'employer' && <div className="application-actions">
        {application.candidate && <><button className="button secondary" onClick={() => { void openProfile(application); }}>Профиль</button>
          <button className="button secondary" disabled={loadingContact !== null} onClick={() => { void showContacts(application); }}>{loadingContact === application.id ? 'Загружаем контакты…' : 'Контакты'}</button></>}
        {application.status === 'sent' && <><button className="button primary" disabled={busy !== null} onClick={() => { void respond(application, 'accepted'); }}>{busy === application.id ? 'Сохраняем…' : 'Принять'}</button>
          <button className="button secondary" disabled={busy !== null} onClick={() => { void respond(application, 'rejected'); }}>Отклонить</button></>}
      </div>}
      {role === 'employer' && application.candidate && contacts[application.id] && <div className="contact-data application-contacts">
        {contacts[application.id].email && <a href={'mailto:' + contacts[application.id].email}>{contacts[application.id].email}</a>}
        {contacts[application.id].phone && <a href={'tel:' + contacts[application.id].phone}>{contacts[application.id].phone}</a>}
      </div>}
      {contactErrors[application.id] && <p className="form-error" role="alert">{contactErrors[application.id]}</p>}
    </article>)}
    {dialog && <Dialog title="Профиль кандидата" onClose={closeDialog} wide>
      {dialog.loading ? <p role="status">Загружаем профиль…</p> : <>
        {dialog.error && <p className="form-error" role="alert">{dialog.error}</p>}
        <CandidateDetails person={dialog.person} contacts={dialog.contacts} contactNote="Контакты сейчас недоступны" />
      </>}
    </Dialog>}
  </section>;
}
