import { useEffect, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { Employer } from './pages/Employer';
import { Company } from './pages/Company';
import { Invitations } from './pages/Invitations';
import { Profile } from './pages/Profile';
import { Assessment } from './pages/Assessment';
import { Onboarding } from './pages/Onboarding';
import { Privacy } from './pages/Privacy';
import { Dialog } from './components/Dialog';
import { CandidateDetails } from './components/CandidateDetails';
import { InviteForm } from './components/InviteForm';
import { Brand } from './components/Brand';
import { Landing } from './pages/Landing';
import { readCandidateContacts, usePlatformPersistence } from './platform-api';
import {
  currentSurvey, emptyFilters, hasContactAccess, otherCandidates, ownCandidateId, readState, saveState, storageKey,
  type Candidate, type Page, type Role,
} from './model';

const navigation: Record<Role, { page: Page; label: string }[]> = {
  employer: [{ page: 'candidates', label: 'Кандидаты' }, { page: 'invitations', label: 'Приглашения' }, { page: 'company', label: 'Компания' }],
  candidate: [{ page: 'profile', label: 'Профиль' }, { page: 'assessment', label: 'Тестирование' }, { page: 'invitations', label: 'Приглашения' }],
};

function routeFromLocation(): { role: Role; page: Page; home: boolean; privacy: boolean } {
  const params = new URLSearchParams(location.search);
  const role = params.get('role') === 'candidate' ? 'candidate' : 'employer';
  const requested = params.get('tab');
  const page = role === 'candidate' && requested === 'onboarding' ? 'onboarding'
    : navigation[role].find(item => item.page === requested)?.page || navigation[role][0].page;
  const home = location.pathname === '/' && !params.has('role') && !params.has('tab');
  return { role, page, home, privacy: location.pathname === '/privacy' };
}

export function App() {
  const [state, setState] = useState(readState);
  const [route, setRoute] = useState(routeFromLocation);
  const [roleMenu, setRoleMenu] = useState(false);
  const [toast, setToast] = useState('');
  const [dialog, setDialog] = useState<{ type: 'profile' | 'invite'; person: Candidate } | null>(null);
  const [knownPeople, setKnownPeople] = useState<Candidate[]>([]);
  const persistence = usePlatformPersistence(state, setState);
  const candidates = [...new Map([...otherCandidates, ...persistence.people, ...knownPeople, state.profile].map(person => [person.id, person])).values()];
  const surveyComplete = Boolean(currentSurvey(state));
  const candidatePage = !surveyComplete ? 'onboarding' : !state.profile.confirmed && route.page !== 'onboarding' && route.page !== 'invitations' ? 'assessment' : route.page;
  const page = route.role === 'candidate' ? candidatePage : route.page;
  const candidateStarted = surveyComplete;
  const contactsAllowed = (id: string) => hasContactAccess(state, id) || persistence.contactCandidateIds.includes(id);
  const pending = state.invitations.filter(invitation => (invitation.status === 'sent' || invitation.status === 'viewed')
    && (route.role === 'candidate' ? invitation.candidateId === ownCandidateId : invitation.companyId === state.company.id)).length;

  useEffect(() => { if (!saveState(state)) setToast('Хранилище браузера недоступно. Изменения сохранятся до закрытия страницы.'); }, [state]);
  useEffect(() => {
    if (!persistence.ready || route.home || route.privacy || route.role !== 'candidate' || route.page === candidatePage) return;
    history.replaceState(null, '', '/app?role=candidate&tab=' + candidatePage);
    setRoute(previous => ({ ...previous, page: candidatePage }));
  }, [route, candidatePage, persistence.ready]);
  useEffect(() => {
    const pop = () => { setRoute(routeFromLocation()); setDialog(null); setRoleMenu(false); };
    const sync = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) setState(readState()); };
    window.addEventListener('popstate', pop); window.addEventListener('storage', sync);
    return () => { window.removeEventListener('popstate', pop); window.removeEventListener('storage', sync); };
  }, []);
  useEffect(() => {
    document.title = route.privacy ? 'Политика конфиденциальности · predel' : route.home ? 'predel · Ваша следующая команда' : (page === 'onboarding' ? 'Анкета' : navigation[route.role].find(item => item.page === page)?.label || 'predel') + ' · predel';
  }, [route, page]);
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
  useEffect(() => {
    if (route.role !== 'employer') return;
    let active = true;
    const ids = [...new Set([...persistence.contactCandidateIds, ...state.invitations.filter(item => item.status === 'accepted' && item.companyId === state.company.id
      && item.candidateId !== ownCandidateId).map(item => item.candidateId)])];
    for (const id of ids) {
      const person = candidates.find(item => item.id === id);
      if (!person) continue;
      void readCandidateContacts(id).then(contacts => {
        if (active) setKnownPeople(previous => [...previous.filter(item => item.id !== id), { ...person, ...contacts }]);
      }).catch(() => {
        if (active) setKnownPeople(previous => previous.map(item => item.id === id ? { ...item, email: '', phone: '' } : item));
      });
    }
    return () => { active = false; };
  }, [route.role, state.invitations, state.company.id, persistence.revision, persistence.contactCandidateIds]);

  function navigate(role: Role, page: Page) {
    history.pushState(null, '', '/app?role=' + role + '&tab=' + page);
    setRoute({ role, page, home: false, privacy: false }); setRoleMenu(false); setDialog(null);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  const remember = (person: Candidate) => setKnownPeople(previous => [...previous.filter(item => item.id !== person.id), person]);
  const onProfile = (person: Candidate) => {
    remember(person); setDialog({ type: 'profile', person });
    if (route.role === 'employer' && contactsAllowed(person.id) && person.id !== ownCandidateId) {
      void readCandidateContacts(person.id).then(contacts => {
        const updated = { ...person, ...contacts }; remember(updated);
        setDialog(previous => previous?.person.id === person.id ? { ...previous, person: updated } : previous);
      }).catch(cause => setToast(cause.message));
    }
  };
  const onInvite = (person: Candidate) => { remember(person); setDialog({ type: 'invite', person }); };
  function goHome() {
    history.pushState(null, '', '/');
    setRoute({ role: 'employer', page: 'candidates', home: true, privacy: false }); setRoleMenu(false); setDialog(null);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function start(role: Role = 'employer', query?: string) {
    if (query) {
      try { sessionStorage.setItem('predel:search', JSON.stringify({ draft: query, query, filters: { ...emptyFilters, stack: [] } })); }
      catch { /* Opening the workspace still works when storage is disabled. */ }
    }
    navigate(role, navigation[role][0].page);
  }

  if (route.privacy) return <Privacy onHome={goHome} onClearLocal={async () => {
    await persistence.clear();
    localStorage.removeItem(storageKey);
    localStorage.removeItem('predel:platform:v1');
    sessionStorage.removeItem('predel:assessment:v1');
    sessionStorage.removeItem('predel:search');
    setKnownPeople([]);
    setDialog(null);
  }} />;
  if (route.home) return <Landing onStart={start} />;
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">К содержимому</a>
    <header className="site-header"><div className="header-inner">
      <Brand onHome={goHome} />
      <nav className="main-nav" aria-label="Основная навигация">{(route.role === 'candidate' && !candidateStarted ? [{ page: 'onboarding' as Page, label: 'Анкета' }, { page: 'assessment' as Page, label: 'Тестирование' }] : navigation[route.role]).map(item =>
        <a href={'?role=' + route.role + '&tab=' + item.page} key={item.page} aria-current={page === item.page ? 'page' : undefined}
          onClick={event => { event.preventDefault(); navigate(route.role, item.page); }}>{item.label}{item.page === 'invitations' && pending > 0 && <span className="nav-count">{pending}</span>}</a>,
      )}</nav>
      <div className="header-account"><span className="demo-label">Демо</span><div className="role-control">
        <button className="role-button" aria-expanded={roleMenu} aria-controls="role-options" onClick={() => setRoleMenu(!roleMenu)}>{route.role === 'employer' ? 'Работодатель' : 'Кандидат'}<ChevronDown size={15} /></button>
        {roleMenu && <><button className="menu-dismiss" tabIndex={-1} aria-label="Закрыть выбор роли" onClick={() => setRoleMenu(false)} /><div className="role-menu" id="role-options">
          {(['employer', 'candidate'] as const).map(role => <button key={role} onClick={() => navigate(role, navigation[role][0].page)}>{role === 'employer' ? 'Работодатель' : 'Кандидат'}{route.role === role && <Check size={15} />}</button>)}
        </div></>}
      </div></div>
    </div></header>
    <main id="main-content" className="main-content" data-sync-status={persistence.status} key={route.role + ':' + page}>
      {!persistence.ready ? <div className="panel empty-state"><p role="status">Загружаем ваши данные…</p>{persistence.error && <><p role="alert">{persistence.error}</p><button className="button secondary" onClick={persistence.retry}>Повторить загрузку</button></>}</div> : <>
      {persistence.status === 'error' && <div className="data-error" role="alert"><span>{persistence.error}</span><button className="text-button" onClick={persistence.retry}>Повторить сохранение</button></div>}
      {page === 'candidates' && <Employer directoryRevision={persistence.directoryRevision} state={state} candidates={candidates} update={setState} onProfile={onProfile} onInvite={onInvite} notify={setToast} />}
      {page === 'invitations' && <Invitations state={state} candidates={candidates} role={route.role} update={setState} notify={setToast} onProfile={onProfile} syncStatus={persistence.status} revision={persistence.revision} />}
      {page === 'company' && <Company state={state} update={setState} notify={setToast} syncStatus={persistence.status} />}
      {page === 'profile' && <Profile state={state} update={setState} notify={setToast} onTest={() => navigate('candidate', 'assessment')} onPreview={() => onProfile(state.profile)} />}
      {page === 'onboarding' && <Onboarding state={state} update={setState} onComplete={() => navigate('candidate', 'assessment')} />}
      {page === 'assessment' && <Assessment state={state} update={setState} notify={setToast} onProfile={() => navigate('candidate', 'profile')} onSurvey={() => navigate('candidate', 'onboarding')} />}
      </>}
    </main>
    <footer className="site-footer"><div className="footer-inner"><span className="footer-brand">predel</span><div className="partner-logos">
      <img className="fsp-logo" src="/brand/fsp.png" alt="Федерация спортивного программирования России" />
      <img className="partners-logo" src="/brand/partners.png" alt="Проект мэра Москвы, Бизнес Москвы, Развитие человеческого капитала, Лидеры цифровой трансформации" />
    </div><a className="footer-year" href="/privacy" target="_blank" rel="noopener noreferrer">Конфиденциальность</a><span className="footer-year">2026</span></div></footer>
    {toast && <div className="toast" role="status"><Check size={17} /><span>{toast}</span><button className="icon-button" onClick={() => setToast('')} aria-label="Закрыть уведомление"><X size={15} /></button></div>}
    {dialog && <Dialog title={dialog.type === 'profile' ? 'Профиль кандидата' : 'Приглашение'} wide={dialog.type === 'profile'} onClose={() => setDialog(null)}>
      {dialog.type === 'profile' ? <CandidateDetails person={candidates.find(person => person.id === dialog.person.id) || dialog.person}
        contacts={route.role === 'candidate' ? dialog.person.id === ownCandidateId : contactsAllowed(dialog.person.id)}
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
