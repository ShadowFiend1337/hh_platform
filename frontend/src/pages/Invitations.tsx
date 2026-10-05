import { useEffect } from 'react';
import { Check, Inbox, LockKeyhole, X } from 'lucide-react';
import {
  dateLabel, hasContactAccess, initials, money, ownCandidateId, statusLabels,
  type Candidate, type PlatformState, type Role,
} from '../model';

export function Invitations({ state, role, candidates, update, notify, onProfile }: {
  state: PlatformState; role: Role; candidates: Candidate[];
  update: (fn: (state: PlatformState) => PlatformState) => void;
  notify: (message: string) => void; onProfile: (person: Candidate) => void;
}) {
  useEffect(() => {
    if (role !== 'candidate' || !state.invitations.some(invitation => invitation.candidateId === ownCandidateId && invitation.status === 'sent')) return;
    update(previous => ({ ...previous, invitations: previous.invitations.map(invitation =>
      invitation.candidateId === ownCandidateId && invitation.status === 'sent' ? { ...invitation, status: 'viewed' } : invitation,
    ) }));
  }, [role, state.invitations, update]);
  const invitations = state.invitations.filter(invitation => role === 'candidate'
    ? invitation.candidateId === ownCandidateId : invitation.companyId === state.company.id);
  function respond(id: string, status: 'accepted' | 'rejected') {
    update(previous => ({ ...previous, invitations: previous.invitations.map(invitation =>
      invitation.id === id && invitation.candidateId === ownCandidateId && (invitation.status === 'sent' || invitation.status === 'viewed')
        ? { ...invitation, status } : invitation,
    ) }));
    notify(status === 'accepted' ? 'Приглашение принято' : 'Приглашение отклонено');
  }
  return <>
    <div className="page-heading"><h1>Приглашения<span className="heading-count">{invitations.length}</span></h1></div>
    <div className="invitation-list">
      {invitations.length ? [...invitations].reverse().map(invitation => {
        const person = candidates.find(candidate => candidate.id === invitation.candidateId);
        const pending = invitation.status === 'sent' || invitation.status === 'viewed';
        return <article className="invitation-card" key={invitation.id}>
          <div className="invitation-top"><div className="invite-person"><div className="avatar">{initials(role === 'candidate' ? invitation.company : person?.name || '')}</div><div><strong>{role === 'candidate' ? invitation.company : person?.name}</strong><span>{dateLabel(invitation.date)}</span></div></div><span className={'status status-' + invitation.status}>{statusLabels[invitation.status]}</span></div>
          <h2>{invitation.title}</h2><p className="salary">{money(invitation.salaryFrom)} – {money(invitation.salaryTo)} ₽<span> / месяц</span></p><span className="field-help">До вычета налогов</span>
          <p className="invitation-description">{invitation.description}</p>
          {role === 'candidate' ? <><div className="invitation-contact"><span className="muted">Связь с компанией</span><a href={'mailto:' + invitation.contact}>{invitation.contact}</a></div>
            {pending && <div className="invitation-bottom"><span className="privacy-note"><LockKeyhole size={15} />При принятии компания получит ваши контакты</span><div className="button-group"><button className="button secondary" onClick={() => respond(invitation.id, 'rejected')}><X size={16} />Отклонить</button><button className="button primary" onClick={() => respond(invitation.id, 'accepted')}><Check size={16} />Принять</button></div></div>}
          </> : <div className="invitation-bottom">
            {person && hasContactAccess(state, person.id) ? <a className="contact-link" href={'mailto:' + person.email}>{person.email}</a> : <span className="privacy-note"><LockKeyhole size={15} />Контакты скрыты</span>}
            {person && <button className="button secondary compact" onClick={() => onProfile(person)}>Профиль кандидата</button>}
          </div>}
        </article>;
      }) : <div className="empty-state"><Inbox size={32} /><h2>Приглашений пока нет</h2><p>{role === 'candidate' ? 'Новые предложения появятся здесь.' : 'Выберите кандидата и отправьте предложение.'}</p></div>}
    </div>
  </>;
}
