import { useEffect, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { Employer } from './pages/Employer';
import { Company } from './pages/Company';
import { Invitations } from './pages/Invitations';
import { Profile } from './pages/Profile';
import { Assessment } from './pages/Assessment';
import { Dialog } from './components/Dialog';
import { CandidateDetails } from './components/CandidateDetails';
import { InviteForm } from './components/InviteForm';
import {
  hasContactAccess, otherCandidates, ownCandidateId, readState, saveState,
  type Candidate, type Page, type Role,
} from './model';

const navigation: Record<Role, { page: Page; label: string }[]> = {
  employer: [{ page: 'candidates', label: 'Кандидаты' }, { page: 'invitations', label: 'Приглашения' }, { page: 'company', label: 'Компания' }],
  candidate: [{ page: 'profile', label: 'Профиль' }, { page: 'assessment', label: 'Тестирование' }, { page: 'invitations', label: 'Приглашения' }],
};

function routeFromLocation(): { role: Role; page: Page } {
  const params = new URLSearchParams(location.search);
  const role = params.get('role') === 'candidate' ? 'candidate' : 'employer';
  const requested = params.get('tab');
  const page = navigation[role].find(item => item.page === requested)?.page || navigation[role][0].page;
  return { role, page };
}

export function App() {
  const [state, setState] = useState(readState);
  const [route, setRoute] = useState(routeFromLocation);
  const [roleMenu, setRoleMenu] = useState(false);
  const [toast, setToast] = useState('');
  const [dialog, setDialog] = useState<{ type: 'profile' | 'invite'; person: Candidate } | null>(null);
  const candidates = [state.profile, ...otherCandidates];
  const pending = state.invitations.filter(invitation => (invitation.status === 'sent' || invitation.status === 'viewed')
    && (route.role === 'candidate' ? invitation.candidateId === ownCandidateId : invitation.companyId === state.company.id)).length;

  useEffect(() => { if (!saveState(state)) setToast('Хранилище браузера недоступно. Изменения сохранятся до закрытия страницы.'); }, [state]);
  useEffect(() => {
    const pop = () => { setRoute(routeFromLocation()); setDialog(null); setRoleMenu(false); };
    const sync = (event: StorageEvent) => { if (event.key === 'predel:platform:v1') setState(readState()); };
    window.addEventListener('popstate', pop); window.addEventListener('storage', sync);
    return () => { window.removeEventListener('popstate', pop); window.removeEventListener('storage', sync); };
  }, []);
  useEffect(() => {
    document.title = (navigation[route.role].find(item => item.page === route.page)?.label || 'predel') + ' · predel';
  }, [route]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!roleMenu) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setRoleMenu(false); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [roleMenu]);

  function navigate(role: Role, page: Page) {
    history.pushState(null, '', '?role=' + role + '&tab=' + page);
    setRoute({ role, page }); setRoleMenu(false); setDialog(null);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  const onProfile = (person: Candidate) => setDialog({ type: 'profile', person });
  const onInvite = (person: Candidate) => setDialog({ type: 'invite', person });

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">К содержимому</a>
    <header className="site-header"><div className="header-inner">
      <a className="brand" href="?role=employer&tab=candidates" onClick={event => { event.preventDefault(); navigate('employer', 'candidates'); }} aria-label="predel, главная"><span className="brand-symbol" aria-hidden="true"><i /></span>predel<span className="brand-period">.</span></a>
      <nav className="main-nav" aria-label="Основная навигация">{navigation[route.role].map(item =>
        <a href={'?role=' + route.role + '&tab=' + item.page} key={item.page} aria-current={route.page === item.page ? 'page' : undefined}
          onClick={event => { event.preventDefault(); navigate(route.role, item.page); }}>{item.label}{item.page === 'invitations' && pending > 0 && <span className="nav-count">{pending}</span>}</a>,
      )}</nav>
      <div className="header-account"><span className="demo-label">Демо</span><div className="role-control">
        <button className="role-button" aria-expanded={roleMenu} aria-controls="role-options" onClick={() => setRoleMenu(!roleMenu)}>{route.role === 'employer' ? 'Работодатель' : 'Кандидат'}<ChevronDown size={15} /></button>
        {roleMenu && <><button className="menu-dismiss" tabIndex={-1} aria-label="Закрыть выбор роли" onClick={() => setRoleMenu(false)} /><div className="role-menu" id="role-options"><span className="menu-caption">Личный кабинет</span>
          {(['employer', 'candidate'] as const).map(role => <button key={role} onClick={() => navigate(role, navigation[role][0].page)}>{role === 'employer' ? 'Работодатель' : 'Кандидат'}{route.role === role && <Check size={15} />}</button>)}
        </div></>}
      </div></div>
    </div></header>
    <main id="main-content" className="main-content" key={route.role + ':' + route.page}>
      {route.page === 'candidates' && <Employer state={state} candidates={candidates} update={setState} onProfile={onProfile} onInvite={onInvite} notify={setToast} />}
      {route.page === 'invitations' && <Invitations state={state} candidates={candidates} role={route.role} update={setState} notify={setToast} onProfile={onProfile} />}
      {route.page === 'company' && <Company state={state} update={setState} notify={setToast} />}
      {route.page === 'profile' && <Profile state={state} update={setState} notify={setToast} onTest={() => navigate('candidate', 'assessment')} onPreview={() => onProfile(state.profile)} />}
      {route.page === 'assessment' && <Assessment state={state} update={setState} notify={setToast} onProfile={() => navigate('candidate', 'profile')} />}
    </main>
    <footer className="site-footer"><div className="footer-inner"><span className="footer-brand">predel</span><div className="partner-logos">
      <img className="fsp-logo" src="/brand/fsp.png" alt="Федерация спортивного программирования России" />
      <img className="partners-logo" src="/brand/partners.png" alt="Проект мэра Москвы, Бизнес Москвы, Развитие человеческого капитала, Лидеры цифровой трансформации" />
    </div><span className="footer-year">2026</span></div></footer>
    {toast && <div className="toast" role="status"><Check size={17} /><span>{toast}</span><button className="icon-button" onClick={() => setToast('')} aria-label="Закрыть уведомление"><X size={15} /></button></div>}
    {dialog && <Dialog title={dialog.type === 'profile' ? 'Профиль кандидата' : 'Приглашение'} wide={dialog.type === 'profile'} onClose={() => setDialog(null)}>
      {dialog.type === 'profile' ? <CandidateDetails person={candidates.find(person => person.id === dialog.person.id) || dialog.person}
        contacts={route.role === 'candidate' ? dialog.person.id === ownCandidateId : hasContactAccess(state, dialog.person.id)}
        onInvite={route.role === 'employer' ? () => onInvite(dialog.person) : undefined} />
        : <InviteForm person={dialog.person} state={state} onSubmit={invitation => {
          setState(previous => {
            const existing = previous.invitations.some(item => item.candidateId === invitation.candidateId && item.companyId === invitation.companyId && (item.status === 'sent' || item.status === 'viewed'));
            return existing ? previous : { ...previous, invitations: [...previous.invitations, invitation] };
          });
          setDialog(null); setToast('Приглашение отправлено');
        }} />}
    </Dialog>}
  </div>;
}
