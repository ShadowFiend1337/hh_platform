import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { Employer } from './pages/Employer';
import { Company } from './pages/Company';
import { Invitations } from './pages/Invitations';
import { Moderation } from './pages/Moderation';
import { Profile } from './pages/Profile';
import { Assessment } from './pages/Assessment';
import { Onboarding } from './pages/Onboarding';
import { Privacy } from './pages/Privacy';
import { Dialog } from './components/Dialog';
import { CandidateDetails } from './components/CandidateDetails';
import { InviteForm } from './components/InviteForm';
import { Brand } from './components/Brand';
import { AssistantWidget } from './components/AssistantWidget';
import { readinessFor } from './components/ReadinessPanel';
import { Landing } from './pages/Landing';
import { Auth, type AuthMode } from './pages/Auth';
import { readCandidateContacts, syncCacheKey, usePlatformPersistence } from './platform-api';
import {
  currentSurvey, emptyFilters, ownCandidateId, readState, saveState, storageKey,
  type Candidate, type Page, type Role,
} from './model';

const navigation: Record<Role, { page: Page; label: string }[]> = {
  employer: [{ page: 'candidates', label: 'Кандидаты' }, { page: 'invitations', label: 'Приглашения' }, { page: 'company', label: 'Компания' }],
  candidate: [{ page: 'profile', label: 'Профиль' }, { page: 'assessment', label: 'Тестирование' }, { page: 'invitations', label: 'Приглашения' }],
};

type AppRoute = { role: Role; page: Page; home: boolean; privacy: boolean; auth: AuthMode | null };
type AuthAccount = { canModerate?: boolean; id: string; login: string; email: string; role: Role; name?: string; companyName?: string; testAccount?: boolean };
const accountCacheKey = 'predel:account:v1';
const pendingSearchKey = 'predel:pending-search';

function clearLocalPlatformCache() {
  localStorage.removeItem(storageKey);
  localStorage.removeItem('predel:platform:v1');
  localStorage.removeItem(syncCacheKey);
  sessionStorage.removeItem('predel:assessment:v1');
  sessionStorage.removeItem('predel:search');
}

function routeFromLocation(): AppRoute {
  const params = new URLSearchParams(location.search);
  const role = params.get('role') === 'candidate' ? 'candidate' : 'employer';
  const requested = params.get('tab');
  const page = role === 'candidate' && requested === 'onboarding' ? 'onboarding'
    : navigation[role].find(item => item.page === requested)?.page || navigation[role][0].page;
  const home = location.pathname === '/' && !params.has('role') && !params.has('tab');
  const auth = location.pathname === '/auth' ? (params.get('mode') === 'login' ? 'login' : 'register') : null;
  return { role, page, home, privacy: location.pathname === '/privacy', auth };
}

export function App() {
  const [identity, setIdentity] = useState<{ ready: boolean; account: AuthAccount | null; error: string }>({ ready: false, account: null, error: '' });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);
    void fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal }).then(async response => {
      if (response.status !== 401 && !response.ok) throw new Error('Не удалось проверить сессию.');
      const payload = response.status === 401 ? {} : await response.json() as { account?: AuthAccount };
      const account = payload.account || null;
      if (account && (!account.id || !['candidate', 'employer'].includes(account.role))) throw new Error('Не удалось проверить сессию.');
      if (!active) return;
      const scope = account?.id || 'anonymous';
      try {
        const previous = localStorage.getItem(accountCacheKey);
        if (!account || previous !== scope && (previous !== null || account)) clearLocalPlatformCache();
        if (account) {
          const pendingSearch = sessionStorage.getItem(pendingSearchKey);
          if (pendingSearch && account.role === 'employer') sessionStorage.setItem('predel:search', pendingSearch);
          sessionStorage.removeItem(pendingSearchKey);
        }
        localStorage.setItem(accountCacheKey, scope);
      } catch { /* Server identity still separates accounts when cache storage is unavailable. */ }
      setIdentity({ ready: true, account, error: '' });
    }).catch(() => {
      if (active) setIdentity(previous => ({ ...previous, ready: false, error: 'Не удалось проверить сессию. Повторите попытку.' }));
    }).finally(() => window.clearTimeout(timer));
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [retry]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === accountCacheKey && event.newValue !== (identity.account?.id || 'anonymous')) window.location.reload();
    };
    const refresh = () => setRetry(value => value + 1);
    window.addEventListener('storage', sync); window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('focus', refresh); };
  }, [identity.account?.id]);
  if (!identity.ready) return <main className="main-content"><div className="panel empty-state">
    {identity.error ? <><p role="alert">{identity.error}</p><button className="button secondary" onClick={() => setRetry(value => value + 1)}>Повторить</button></> : <p role="status">Загружаем…</p>}
  </div></main>;
  if (location.pathname === '/moderation') return identity.account?.canModerate
    ? <Moderation accountId={identity.account.id} role={identity.account.role} />
    : <main className="main-content"><div className="panel empty-state"><h1>Модерация достижений</h1><p>Для доступа требуется назначенное право модератора.</p><a href={identity.account ? '/app?role='+identity.account.role : '/auth?mode=login'}>Вернуться в кабинет</a></div></main>;
  return <Workspace key={identity.account?.id || 'anonymous'} authAccount={identity.account} />;
}

function Workspace({ authAccount: initialAccount }: { authAccount: AuthAccount | null }) {
  const [authAccount, setAuthAccount] = useState(initialAccount);
  const [state, setState] = useState(readState);
  const [route, setRoute] = useState(routeFromLocation);
  const [roleMenu, setRoleMenu] = useState(false);
  const [toast, setToast] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [assessmentActive, setAssessmentActive] = useState(false);
  const assessmentActiveRef = useRef(false);
  const onAssessmentActive = useCallback((active: boolean) => {
    assessmentActiveRef.current = active;
    setAssessmentActive(active);
  }, []);
  const [dialog, setDialog] = useState<{ type: 'profile' | 'invite'; person: Candidate } | null>(null);
  const [knownPeople, setKnownPeople] = useState<Candidate[]>([]);
  const persistence = usePlatformPersistence(state, setState, authAccount ? 'auth:' + authAccount.id : undefined, Boolean(authAccount));
  const contactAuthority = useRef({ revision: 0, ids: [] as string[] });
  const previousContactIds = useRef<string[]>([]);
  contactAuthority.current = { revision: persistence.revision, ids: persistence.contactCandidateIds };
  const candidates = [...new Map([...knownPeople, ...persistence.people, state.profile].map(person => [person.id, person])).values()]
    .map(person => {
      if (person.id === ownCandidateId) return person;
      if (person.demoProfile || !persistence.contactCandidateIds.includes(person.id)) return { ...person, email: '', phone: '' };
      const known = knownPeople.find(item => item.id === person.id);
      return { ...person, email: known?.email || '', phone: known?.phone || '' };
    });
  const surveyComplete = Boolean(currentSurvey(state));
  const provenCategory = state.profile.confirmed && state.history.some(result => result.passed
    && result.specialization === state.profile.confirmed?.specialization && result.grade === state.profile.confirmed.grade
    && result.date === state.profile.confirmed.date && result.score === state.profile.confirmed.score);
  const candidatePage = !surveyComplete ? 'onboarding' : !provenCategory && route.page !== 'onboarding' && route.page !== 'invitations' ? 'assessment' : route.page;
  const page = route.role === 'candidate' ? candidatePage : route.page;
  const candidateStarted = surveyComplete;
  const contactsAllowed = (id: string) => persistence.contactCandidateIds.includes(id) && !candidates.some(person => person.id === id && person.demoProfile);
  const pending = state.invitations.filter(invitation => (invitation.status === 'sent' || invitation.status === 'viewed')
    && (route.role === 'candidate' ? invitation.candidateId === ownCandidateId : invitation.companyId === state.company.id)).length;

  useEffect(() => { if (authAccount && !saveState(state)) setToast('Хранилище браузера недоступно. Изменения сохранятся до закрытия страницы.'); }, [state, authAccount]);
  useEffect(() => {
    if (!authAccount) {
      if (!route.home && !route.privacy && !route.auth) {
        history.replaceState(null, '', '/auth?mode=register&role=' + route.role);
        setRoute(previous => ({ ...previous, auth: 'register' }));
        setRoleMenu(false); setDialog(null);
      }
      return;
    }
    const role = authAccount.role;
    if (route.auth || (!route.home && !route.privacy && route.role !== role)) {
      const requestedPage = route.role === role && route.page === 'onboarding'
        ? 'onboarding' : navigation[role].some(item => item.page === route.page) ? route.page : navigation[role][0].page;
      history.replaceState(null, '', '/app?role=' + role + '&tab=' + requestedPage);
      setRoute({ role, page: requestedPage, home: false, privacy: false, auth: null });
      setRoleMenu(false); setDialog(null);
    }
  }, [authAccount, route.auth, route.home, route.privacy, route.role, route.page]);
  useEffect(() => {
    if (!authAccount || !persistence.ready || authAccount.role !== 'employer' || !authAccount.companyName) return;
    setState(previous => {
      if (previous.company.name !== 'Линия' || previous.company.contact !== 'team@example.com') return previous;
      return { ...previous, company: { ...previous.company, name: authAccount.companyName || previous.company.name, contact: authAccount.email || previous.company.contact } };
    });
  }, [authAccount, persistence.ready]);
  useEffect(() => {
    if (!persistence.ready || route.home || route.privacy || route.auth || route.role !== 'candidate' || route.page === candidatePage) return;
    history.replaceState(null, '', '/app?role=candidate&tab=' + candidatePage);
    setRoute(previous => ({ ...previous, page: candidatePage }));
  }, [route, candidatePage, persistence.ready]);
  useEffect(() => {
    const pop = () => {
      if (assessmentActiveRef.current) {
        history.pushState(null, '', '/app?role=candidate&tab=assessment');
        setToast('Сначала завершите тест.');
        return;
      }
      setRoute(routeFromLocation()); setDialog(null); setRoleMenu(false);
    };
    const sync = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) setState(readState()); };
    window.addEventListener('popstate', pop); window.addEventListener('storage', sync);
    return () => { window.removeEventListener('popstate', pop); window.removeEventListener('storage', sync); };
  }, []);
  useEffect(() => {
    document.title = route.privacy ? 'Политика конфиденциальности · predel'
      : route.auth === 'register' ? (new URLSearchParams(location.search).get('ticket') ? 'Вход через ФСП ID · predel' : 'Регистрация · predel')
        : route.auth === 'login' ? 'Вход · predel'
          : route.home ? 'predel · Ваша следующая команда' : (page === 'onboarding' ? 'Анкета' : navigation[route.role].find(item => item.page === page)?.label || 'predel') + ' · predel';
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
    if (!authAccount || route.role !== 'employer' || !persistence.ready) return;
    let active = true;
    const ids = persistence.contactCandidateIds;
    const revokedIds = previousContactIds.current.filter(id => !ids.includes(id));
    previousContactIds.current = ids;
    setKnownPeople(previous => previous.map(person => ids.includes(person.id) ? person : { ...person, email: '', phone: '' }));
    setDialog(previous => {
      if (!previous || ids.includes(previous.person.id)) return previous;
      return revokedIds.includes(previous.person.id) || previous.person.email || previous.person.phone
        ? null : { ...previous, person: { ...previous.person, email: '', phone: '' } };
    });
    for (const id of ids) {
      const person = candidates.find(item => item.id === id);
      if (!person || person.demoProfile) continue;
      void readCandidateContacts(id).then(contacts => {
        if (active) setKnownPeople(previous => [...previous.filter(item => item.id !== id), { ...person, ...contacts }]);
      }).catch(() => {
        if (active) forgetContacts(id);
      });
    }
    return () => { active = false; };
  }, [authAccount, route.role, persistence.ready, persistence.revision, persistence.contactCandidateIds]);

  function forgetContacts(id: string) {
    setKnownPeople(previous => previous.map(item => item.id === id ? { ...item, email: '', phone: '' } : item));
    setDialog(previous => previous?.person.id === id ? { ...previous, person: { ...previous.person, email: '', phone: '' } } : previous);
  }

  function navigate(requestedRole: Role, requestedPage: Page) {
    if (assessmentActiveRef.current) {
      if (requestedPage !== 'assessment') setToast('Сначала завершите тест.');
      return;
    }
    if (!authAccount) { openAuth('register', requestedRole); return; }
    const role = authAccount?.role || requestedRole;
    const page = role === requestedRole && (role === 'candidate' && requestedPage === 'onboarding' || navigation[role].some(item => item.page === requestedPage))
      ? requestedPage : navigation[role][0].page;
    history.pushState(null, '', '/app?role=' + role + '&tab=' + page);
    setRoute({ role, page, home: false, privacy: false, auth: null }); setRoleMenu(false); setDialog(null);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  const remember = (person: Candidate) => setKnownPeople(previous => [...previous.filter(item => item.id !== person.id), person]);
  const onProfile = (person: Candidate) => {
    remember(person); setDialog({ type: 'profile', person });
    if (route.role === 'employer' && contactsAllowed(person.id) && person.id !== ownCandidateId) {
      const revision = persistence.revision;
      void readCandidateContacts(person.id).then(contacts => {
        if (contactAuthority.current.revision !== revision || !contactAuthority.current.ids.includes(person.id)) return;
        const updated = { ...person, ...contacts }; remember(updated);
        setDialog(previous => previous?.person.id === person.id ? { ...previous, person: updated } : previous);
      }).catch(cause => {
        if (contactAuthority.current.revision !== revision || !contactAuthority.current.ids.includes(person.id)) return;
        forgetContacts(person.id); setToast(cause.message);
      });
    }
  };
  const onInvite = (person: Candidate) => {
    if (person.demoProfile) { setToast('Демопрофиль доступен только для просмотра.'); return; }
    remember(person); setDialog({ type: 'invite', person });
  };
  function goHome() {
    if (assessmentActiveRef.current) { setToast('Сначала завершите тест.'); return; }
    history.pushState(null, '', '/');
    setRoute({ role: 'employer', page: 'candidates', home: true, privacy: false, auth: null }); setRoleMenu(false); setDialog(null);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function openAuth(mode: AuthMode, preferredRole?: Role) {
    if (authAccount) {
      navigate(authAccount.role, navigation[authAccount.role][0].page);
      return;
    }
    const role = preferredRole || (mode === 'register' ? 'candidate' : route.role);
    history.pushState(null, '', '/auth?mode=' + mode + '&role=' + role);
    setRoute({ role, page: navigation[role][0].page, home: false, privacy: false, auth: mode }); setRoleMenu(false); setDialog(null);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function updateAuthRole(role: Role) {
    if (!route.auth || authAccount) return;
    history.replaceState(null, '', '/auth?mode=' + route.auth + '&role=' + role);
    setRoute(previous => ({ ...previous, role, page: navigation[role][0].page }));
  }
  function completeAuthentication(role: Role) {
    const page = role === 'candidate' ? 'onboarding' : 'candidates';
    clearLocalPlatformCache();
    window.location.assign('/app?role=' + role + '&tab=' + page);
  }
  async function signOut() {
    if (assessmentActiveRef.current) { setToast('Сначала завершите тест.'); return; }
    setSigningOut(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) throw new Error();
      clearLocalPlatformCache();
      sessionStorage.removeItem(pendingSearchKey);
      window.location.assign('/');
    } catch {
      setSigningOut(false); setToast('Не удалось завершить сессию. Повторите попытку.');
    }
  }
  function start(role: Role = 'employer', query?: string) {
    if (query) {
      try { sessionStorage.setItem(authAccount ? 'predel:search' : pendingSearchKey, JSON.stringify({ draft: query, query, filters: { ...emptyFilters, stack: [] } })); }
      catch { /* Opening the workspace still works when storage is disabled. */ }
    }
    if (authAccount) navigate(role, navigation[role][0].page);
    else openAuth('register', role);
  }

  if (route.privacy) return <Privacy isSignedIn={Boolean(authAccount)} onHome={goHome} onClearLocal={authAccount ? async deleteAccount => {
    const deletedAt = await persistence.clear(Boolean(deleteAccount));
    clearLocalPlatformCache();
    setKnownPeople([]);
    setDialog(null);
    if (deleteAccount) {
      setAuthAccount(null);
      localStorage.setItem(accountCacheKey, 'anonymous');
      sessionStorage.removeItem(pendingSearchKey);
    }
    return deletedAt;
  } : undefined} />;
  if (route.auth) return <Auth key={route.auth} mode={route.auth} initialRole={route.role} onBack={goHome}
    onSwitchMode={mode => openAuth(mode, route.role)} onRoleChange={updateAuthRole} onAuthenticated={completeAuthentication} />;
  if (route.home) return <Landing onStart={start} onAuth={openAuth} />;
  if (!authAccount) return <Auth mode="register" initialRole={route.role} onBack={goHome}
    onSwitchMode={mode => openAuth(mode, route.role)} onRoleChange={updateAuthRole} onAuthenticated={completeAuthentication} />;
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">К содержимому</a>
    <header className="site-header"><div className="header-inner">
      <Brand onHome={goHome} />
      <nav className="main-nav" aria-label="Основная навигация">{(route.role === 'candidate' && !candidateStarted ? [{ page: 'onboarding' as Page, label: 'Анкета' }, { page: 'assessment' as Page, label: 'Тестирование' }] : navigation[route.role]).map(item =>
        <a href={'?role=' + route.role + '&tab=' + item.page} key={item.page} aria-current={page === item.page ? 'page' : undefined}
          aria-disabled={assessmentActive && item.page !== 'assessment' ? true : undefined}
          onClick={event => { event.preventDefault(); navigate(route.role, item.page); }}>{item.label}{item.page === 'invitations' && pending > 0 && <span className="nav-count">{pending}</span>}</a>,
      )}{authAccount?.canModerate && <a href="/moderation">Модерация</a>}</nav>
      <div className="header-account">{authAccount ? <>
        <span className="app-account-name" title={authAccount.login}>{authAccount.companyName || authAccount.name || authAccount.login}</span>
        {authAccount.testAccount && <span className="role-static">Учебный аккаунт</span>}
        <button className="app-signout" disabled={signingOut} onClick={() => void signOut()}>{signingOut ? 'Выходим…' : 'Выйти'}</button>
        <span className="role-button role-static">{authAccount.role === 'employer' ? 'Работодатель' : 'Ищу работу'}</span>
      </> : <>
        <div className="app-auth-actions"><button onClick={() => openAuth('login')}>Войти</button><button onClick={() => openAuth('register')}>Регистрация</button></div>
        <div className="role-control">
          <button className="role-button" aria-expanded={roleMenu} aria-controls="role-options" onClick={() => setRoleMenu(!roleMenu)}>{route.role === 'employer' ? 'Работодатель' : 'Кандидат'}<ChevronDown size={15} /></button>
          {roleMenu && <><button className="menu-dismiss" tabIndex={-1} aria-label="Закрыть выбор роли" onClick={() => setRoleMenu(false)} /><div className="role-menu" id="role-options">
            {(['employer', 'candidate'] as const).map(role => <button key={role} onClick={() => navigate(role, navigation[role][0].page)}>{role === 'employer' ? 'Работодатель' : 'Кандидат'}{route.role === role && <Check size={15} />}</button>)}
          </div></>}
        </div>
      </>}</div>
    </div></header>
    <main id="main-content" className="main-content" data-sync-status={persistence.status} key={route.role + ':' + page}>
      {!persistence.ready ? <div className="panel empty-state"><p role="status">Загружаем ваши данные…</p>{persistence.error && <><p role="alert">{persistence.error}</p><button className="button secondary" onClick={persistence.retry}>Повторить загрузку</button></>}</div> : <>
      {persistence.status === 'error' && <div className="data-error" role="alert"><span>{persistence.error}</span><button className="text-button" onClick={persistence.retry}>Повторить сохранение</button></div>}
      {page === 'candidates' && <Employer directoryRevision={persistence.directoryRevision} state={state} candidates={candidates} update={setState} onProfile={onProfile} onInvite={onInvite} notify={setToast} />}
      {page === 'invitations' && <Invitations state={state} candidates={candidates} contactCandidateIds={persistence.contactCandidateIds} role={route.role} update={setState} notify={setToast} onProfile={onProfile} syncStatus={persistence.status} revision={persistence.revision} />}
      {page === 'company' && <Company state={state} update={setState} notify={setToast} syncStatus={persistence.status} />}
      {page === 'profile' && <Profile state={state} update={setState} notify={setToast} accountId={authAccount?.id} onTest={() => navigate('candidate', 'assessment')} onSurvey={() => navigate('candidate', 'onboarding')} onPreview={() => onProfile(state.profile)} onFspChange={persistence.refresh} syncStatus={persistence.status} />}
      {page === 'onboarding' && <Onboarding state={state} update={setState} onComplete={() => navigate('candidate', 'assessment')}
        accountPrefill={authAccount?.role === 'candidate' ? { name: authAccount.name, email: authAccount.email } : undefined} />}
      {page === 'assessment' && <Assessment state={state} update={setState} notify={setToast} onActiveChange={onAssessmentActive} onProfile={() => navigate('candidate', 'profile')} onSurvey={() => navigate('candidate', 'onboarding')} watermarkLabel={authAccount?.login} />}
      </>}
    </main>
    <footer className="site-footer"><div className="footer-inner"><span className="footer-brand">predel</span><div className="partner-logos">
      <img className="fsp-logo" src="/brand/fsp.png" alt="Федерация спортивного программирования России" />
      <img className="partners-logo" src="/brand/partners.png" alt="Проект мэра Москвы, Бизнес Москвы, Развитие человеческого капитала, Лидеры цифровой трансформации" />
    </div><a className="footer-year" href="/privacy" target="_blank" rel="noopener noreferrer">Конфиденциальность</a><span className="footer-year">2026</span></div></footer>
    {authAccount && persistence.ready && !assessmentActive && <AssistantWidget role={authAccount.role} accountId={authAccount.id} page={page}
      context={authAccount.role === 'candidate' ? (() => {
        const readiness = readinessFor(state);
        return { readiness: readiness.percent, missing: readiness.items.filter(item => !item.done).map(item => item.key),
          confirmed: Boolean(state.profile.confirmed), specialization: state.profile.confirmed?.specialization || state.profile.specialization,
          grade: state.profile.confirmed?.grade, newInvitations: pending };
      })() : { needs: state.hiringNeeds?.length || 0, pendingInvitations: pending,
        acceptedInvitations: state.invitations.filter(invitation => invitation.companyId === state.company.id && invitation.status === 'accepted').length }}
      onNavigate={target => { if (target === 'privacy') window.open('/privacy', '_blank', 'noopener'); else navigate(authAccount.role, target as Page); }} />}
    {toast && <div className="toast" role="status"><Check size={17} /><span>{toast}</span><button className="icon-button" onClick={() => setToast('')} aria-label="Закрыть уведомление"><X size={15} /></button></div>}
    {dialog && <Dialog title={dialog.type === 'profile' ? 'Профиль кандидата' : 'Приглашение'} wide={dialog.type === 'profile'} onClose={() => setDialog(null)}>
      {dialog.type === 'profile' ? <CandidateDetails person={candidates.find(person => person.id === dialog.person.id) || dialog.person}
        contacts={route.role === 'candidate' ? dialog.person.id === ownCandidateId : contactsAllowed(dialog.person.id)}
        onInvite={route.role === 'employer' && !dialog.person.demoProfile ? () => onInvite(dialog.person) : undefined} />
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
