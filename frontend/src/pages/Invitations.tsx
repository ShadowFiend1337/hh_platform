import { useEffect, useState } from 'react';
import { Building2, Check, ClipboardCheck, Heart, Inbox, LockKeyhole, Send, X } from 'lucide-react';
import { CompanyDirectory } from '../components/CompanyDirectory';
import { ApplicationList } from '../components/ApplicationList';
import { TaskBoard } from '../components/TaskBoard';
import {
  dateLabel, gradeLabels, initials, money, ownCandidateId, specializationLabels, statusLabels,
  type Candidate, type PlatformState, type Role,
} from '../model';

export function Invitations({ state, role, candidates, contactCandidateIds = [], update, notify, onProfile, onInvite, syncStatus, revision }: {
  state: PlatformState; role: Role; candidates: Candidate[]; contactCandidateIds?: string[];
  update: (fn: (state: PlatformState) => PlatformState) => void;
  notify: (message: string) => void; onProfile: (person: Candidate) => void; onInvite?: (person: Candidate) => void;
  syncStatus: 'loading' | 'saving' | 'saved' | 'error'; revision: number;
}) {
  const [view, setView] = useState<'companies' | 'offers' | 'applications' | 'tasks' | 'favorites'>(() =>
    location.hash === '#tasks' ? 'tasks' : location.hash === '#favorites' && role === 'employer' ? 'favorites' : 'offers');
  // Liked candidates from both search modes, newest first; the server returns their public cards.
  const liked = (state.candidateDecisions || []).filter(item => item.decision === 'liked')
    .sort((a, b) => b.date.localeCompare(a.date))
    .flatMap(item => { const person = candidates.find(candidate => candidate.id === item.candidateId); return person ? [{ person, date: item.date }] : []; });
  function unlike(id: string) {
    update(previous => ({ ...previous, candidateDecisions: (previous.candidateDecisions || []).filter(item => !(item.candidateId === id && item.decision === 'liked')) }));
    notify('Убрано из избранного');
  }
  const [applicationsRevision, setApplicationsRevision] = useState(0);
  useEffect(() => {
    if (role !== 'candidate' || view !== 'offers' || !state.invitations.some(invitation => invitation.candidateId === ownCandidateId && invitation.status === 'sent')) return;
    update(previous => ({ ...previous, invitations: previous.invitations.map(invitation =>
      invitation.candidateId === ownCandidateId && invitation.status === 'sent' ? { ...invitation, status: 'viewed' } : invitation,
    ) }));
  }, [role, view, state.invitations, update]);
  const invitations = state.invitations.filter(invitation => role === 'candidate'
    ? invitation.candidateId === ownCandidateId : invitation.companyId === state.company.id);
  function respond(id: string, status: 'accepted' | 'rejected') {
    update(previous => ({ ...previous, invitations: previous.invitations.map(invitation =>
      invitation.id === id && invitation.candidateId === ownCandidateId && (invitation.status === 'sent' || invitation.status === 'viewed')
        ? { ...invitation, status } : invitation,
    ) }));
    notify(status === 'accepted' ? 'Приглашение принято' : 'Приглашение отклонено');
  }
  return <div className="opportunities-layout">
    <nav className="opportunities-nav" aria-label={role === 'candidate' ? 'Компании и предложения' : 'Приглашения и отклики'}>
      {role === 'candidate' ? <>
        <button aria-current={view === 'companies' ? 'page' : undefined} onClick={() => setView('companies')}><Building2 size={18} />Найти компании</button>
        <button aria-current={view === 'offers' ? 'page' : undefined} onClick={() => setView('offers')}><Inbox size={18} />Предложения</button>
        <button aria-current={view === 'tasks' ? 'page' : undefined} onClick={() => setView('tasks')}><ClipboardCheck size={18} />Задания</button>
      </> : <>
        <button aria-current={view === 'offers' ? 'page' : undefined} onClick={() => setView('offers')}><Send size={18} />Приглашения</button>
        <button aria-current={view === 'favorites' ? 'page' : undefined} onClick={() => setView('favorites')}><Heart size={18} />Избранные{liked.length > 0 && <span className="nav-count">{liked.length}</span>}</button>
        <button aria-current={view === 'applications' ? 'page' : undefined} onClick={() => setView('applications')}><Inbox size={18} />Отклики</button>
        <button aria-current={view === 'tasks' ? 'page' : undefined} onClick={() => setView('tasks')}><ClipboardCheck size={18} />Задания</button>
      </>}
    </nav>
    <section className="opportunities-content">
    {view === 'favorites' ? <>
      <div className="page-heading"><h1>Избранные{liked.length > 0 && <span className="heading-count">{liked.length}</span>}</h1></div>
      {liked.length ? <div className="favorite-list">{liked.map(({ person, date }) => {
        const pending = state.invitations.some(invitation => invitation.companyId === state.company.id && invitation.candidateId === person.id && (invitation.status === 'sent' || invitation.status === 'viewed'));
        const invited = state.invitations.some(invitation => invitation.companyId === state.company.id && invitation.candidateId === person.id);
        return <article className="favorite-card" key={person.id}>
          <button className="avatar" onClick={() => onProfile(person)} aria-label={'Открыть профиль ' + person.name}>{initials(person.name)}</button>
          <div className="favorite-main">
            <button className="person-link" onClick={() => onProfile(person)}>{person.name}</button>
            <p className="candidate-specialization">{specializationLabels[person.confirmed?.specialization || person.specialization]}<span className="dot-divider">·</span>{person.confirmed ? gradeLabels[person.confirmed.grade] : 'Грейд не подтверждён'}</p>
            <div className="tags">{person.demoProfile && <span className="tag" title="Вымышленный профиль для проверки подбора">Демо</span>}{person.stack.slice(0, 4).map(skill => <span className="tag" key={skill}>{skill}</span>)}</div>
            <span className="muted favorite-date">В избранном с {dateLabel(date)}</span>
          </div>
          <div className="favorite-actions">
            {person.demoProfile ? <span className="privacy-note" title="У демопрофиля нет аккаунта: приглашение и контакты недоступны"><LockKeyhole size={14} />Только просмотр</span>
              : onInvite && <button className="button primary compact" disabled={pending} onClick={() => onInvite(person)}>{pending ? 'Отправлено' : invited ? 'Пригласить снова' : 'Пригласить'}</button>}
            <button className="button secondary compact" onClick={() => onProfile(person)}>Профиль</button>
            <button className="text-button" onClick={() => unlike(person.id)}><Heart size={14} />Убрать</button>
          </div>
        </article>;
      })}</div> : <div className="empty-state"><Heart size={32} /><h2>Избранных пока нет</h2><p>Отмечайте кандидатов сердечком в подборе — в обычном списке или в «Предельном режиме». Они появятся здесь, отсюда их удобно пригласить.</p></div>}
    </> : view === 'tasks' ? <TaskBoard role={role} revision={revision + applicationsRevision} notify={notify} />
      : view === 'companies' ? <CompanyDirectory notify={notify} syncStatus={syncStatus} onApplied={() => setApplicationsRevision(value => value + 1)} />
      : view === 'applications' ? <><div className="page-heading"><h1>Отклики</h1></div><ApplicationList role={role} revision={revision + applicationsRevision} notify={notify} /></>
        : <>
    <div className="page-heading"><h1>{role === 'candidate' ? 'Предложения' : 'Приглашения'}{invitations.length > 0 && <span className="heading-count">{invitations.length}</span>}</h1></div>
    {(invitations.length > 0 || role === 'employer') && <div className="invitation-list">
      {invitations.length ? [...invitations].reverse().map(invitation => {
        const person = candidates.find(candidate => candidate.id === invitation.candidateId);
        const pending = invitation.status === 'sent' || invitation.status === 'viewed';
        return <article className="invitation-card" key={invitation.id}>
          <div className="invitation-top"><div className="invite-person"><div className="avatar">{initials(role === 'candidate' ? invitation.company : person?.name || '')}</div><div><strong>{role === 'candidate' ? invitation.company : person?.name}</strong><span>{dateLabel(invitation.date)}</span></div></div><span className={'status status-' + invitation.status}>{statusLabels[invitation.status]}</span></div>
          <h2>{invitation.title}</h2><p className="salary">{money(invitation.salaryFrom)} – {money(invitation.salaryTo)} ₽<span> / месяц, до налогов</span></p>
          <p className="invitation-description">{invitation.description}</p>
          {role === 'candidate' ? <><div className="invitation-contact"><a href={'mailto:' + invitation.contact}>{invitation.contact}</a></div>
            {pending && <div className="invitation-bottom"><span className="privacy-note"><LockKeyhole size={15} />При принятии компания получит ваши контакты</span><div className="button-group"><button className="button secondary" onClick={() => respond(invitation.id, 'rejected')}><X size={16} />Отклонить</button><button className="button primary" onClick={() => respond(invitation.id, 'accepted')}><Check size={16} />Принять</button></div></div>}
          </> : <div className="invitation-bottom">
            {person?.email && contactCandidateIds.includes(person.id) ? <a className="contact-link" href={'mailto:' + person.email}>{person.email}</a> : <span className="privacy-note"><LockKeyhole size={15} />Контакты скрыты</span>}
            {person && <button className="button secondary compact" onClick={() => onProfile(person)}>Профиль</button>}
          </div>}
        </article>;
      }) : <div className="empty-state"><Inbox size={32} /><h2>Приглашений пока нет</h2>{role === 'employer' && <p>Выберите кандидата и отправьте предложение.</p>}</div>}
    </div>}
    {role === 'candidate' && <ApplicationList role={role} revision={revision + applicationsRevision} notify={notify} showEmpty={!invitations.length} />}
    </>}
    </section>
  </div>;
}
