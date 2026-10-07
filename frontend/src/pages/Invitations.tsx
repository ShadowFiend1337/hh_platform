import { useEffect, useState } from 'react';
import { Building2, Check, Inbox, LockKeyhole, Send, X } from 'lucide-react';
import { CompanyDirectory } from '../components/CompanyDirectory';
import { ApplicationList } from '../components/ApplicationList';
import {
  dateLabel, hasContactAccess, initials, money, ownCandidateId, statusLabels,
  type Candidate, type PlatformState, type Role,
} from '../model';

export function Invitations({ state, role, candidates, update, notify, onProfile, syncStatus, revision }: {
  state: PlatformState; role: Role; candidates: Candidate[];
  update: (fn: (state: PlatformState) => PlatformState) => void;
  notify: (message: string) => void; onProfile: (person: Candidate) => void;
  syncStatus: 'loading' | 'saving' | 'saved' | 'error'; revision: number;
}) {
  const [view, setView] = useState<'companies' | 'offers' | 'applications'>('offers');
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
      </> : <>
        <button aria-current={view === 'offers' ? 'page' : undefined} onClick={() => setView('offers')}><Send size={18} />Приглашения</button>
        <button aria-current={view === 'applications' ? 'page' : undefined} onClick={() => setView('applications')}><Inbox size={18} />Отклики</button>
      </>}
    </nav>
    <section className="opportunities-content">
    {view === 'companies' ? <CompanyDirectory notify={notify} syncStatus={syncStatus} onApplied={() => setApplicationsRevision(value => value + 1)} />
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
            {person?.email && hasContactAccess(state, person.id) ? <a className="contact-link" href={'mailto:' + person.email}>{person.email}</a> : <span className="privacy-note"><LockKeyhole size={15} />Контакты скрыты</span>}
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
