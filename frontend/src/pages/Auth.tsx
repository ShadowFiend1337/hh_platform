import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, BriefcaseBusiness, Check, KeyRound, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { Brand } from '../components/Brand';
import type { Role } from '../model';

export type AuthMode = 'login' | 'register';

type Account = {
  id: string;
  email: string;
  login: string;
  role: Role;
  name?: string;
  companyName?: string;
};

type AuthResponse = { account?: Account; role?: Role; message?: string; delivery?: 'development' | 'email' };

class AuthRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function authRequest(path: string, body: Record<string, unknown>): Promise<AuthResponse> {
  const response = await fetch(path, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => ({})) as AuthResponse & { error?: string };
  if (!response.ok) throw new AuthRequestError(payload.error || 'Не удалось выполнить запрос. Попробуйте ещё раз.', response.status);
  return payload;
}

function authErrorMessage(cause: unknown) {
  if (cause instanceof AuthRequestError) return cause.message;
  return 'Не удалось подключиться к сервису. Проверьте соединение и повторите попытку.';
}

export function Auth({
  mode, initialRole = 'candidate', onBack, onSwitchMode, onRoleChange, onAuthenticated,
}: {
  mode: AuthMode;
  initialRole?: Role;
  onBack: () => void;
  onSwitchMode: (mode: AuthMode) => void;
  onRoleChange: (role: Role) => void;
  onAuthenticated: (role: Role) => void;
}) {
  const [role, setRole] = useState<Role>(initialRole);
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [login, setLogin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordRepeat, setPasswordRepeat] = useState('');
  const [loginOrEmail, setLoginOrEmail] = useState('');
  const [code, setCode] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [step, setStep] = useState<'details' | 'code'>('details');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRole(initialRole);
  }, [initialRole]);
  useEffect(() => {
    if (step === 'code') codeInput.current?.focus();
  }, [step]);

  const formName = role === 'candidate' ? name.trim() : companyName.trim();
  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const loginIsValid = /^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/.test(login);

  async function requestCode() {
    setError(''); setNotice('');
    if (formName.length < 2) {
      setError(role === 'candidate' ? 'Укажите имя, под которым вас увидят работодатели.' : 'Укажите название компании.');
      return;
    }
    if (!loginIsValid) {
      setError('Логин должен состоять из 3–32 латинских букв, цифр, точек, дефисов или подчёркиваний.');
      return;
    }
    if (!emailIsValid) { setError('Укажите корректный адрес электронной почты.'); return; }
    if (password.length < 8) { setError('Пароль должен содержать не менее 8 символов.'); return; }
    if (password !== passwordRepeat) { setError('Пароли не совпадают.'); return; }
    if (!accepted) { setError('Подтвердите согласие с политикой конфиденциальности.'); return; }
    setBusy(true);
    try {
      const response = await authRequest('/api/auth/register/request-code', {
        email: email.trim().toLowerCase(), login, password, role, consent: accepted,
        ...(role === 'candidate' ? { name: formName } : { companyName: formName }),
      });
      setStep('code');
      setNotice(response.delivery === 'development' ? 'В локальном режиме письмо не отправляется.' : 'Письмо с кодом отправлено. Проверьте входящие и папку «Спам».');
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function submitRegistration(event: FormEvent) {
    event.preventDefault();
    void requestCode();
  }

  async function confirmCode(event: FormEvent) {
    event.preventDefault();
    setError(''); setNotice('');
    const normalizedCode = code.replace(/\D/g, '');
    if (normalizedCode.length !== 6) { setError('Введите шестизначный код из письма.'); return; }
    setBusy(true);
    try {
      const response = await authRequest('/api/auth/register/verify', { email: email.trim().toLowerCase(), code: normalizedCode });
      const accountRole = response.account?.role || response.role;
      if (!accountRole || !['candidate', 'employer'].includes(accountRole)) throw new AuthRequestError('Не удалось определить тип аккаунта. Попробуйте войти ещё раз.', 500);
      onAuthenticated(accountRole);
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    setError(''); setNotice('');
    if (!loginOrEmail.trim()) { setError('Введите логин или адрес электронной почты.'); return; }
    if (!password) { setError('Введите пароль.'); return; }
    setBusy(true);
    try {
      const response = await authRequest('/api/auth/login', { loginOrEmail: loginOrEmail.trim(), password });
      const accountRole = response.account?.role || response.role;
      if (!accountRole || !['candidate', 'employer'].includes(accountRole)) throw new AuthRequestError('Не удалось определить тип аккаунта. Попробуйте войти ещё раз.', 500);
      onAuthenticated(accountRole);
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function returnToDetails() {
    setStep('details'); setCode(''); setError(''); setNotice('');
  }

  const isRegister = mode === 'register';
  const codeStep = isRegister && step === 'code';
  const title = codeStep ? 'Подтвердите почту' : isRegister ? 'Регистрация' : 'Вход';

  return <div className="auth-page">
    <header className="auth-header"><Brand onHome={onBack} /><button className="auth-back" type="button" onClick={onBack}><ArrowLeft size={16} />На главную</button></header>
    <main className="auth-main">
      <section className="auth-card-wrap" aria-labelledby="auth-title">
        <div className="auth-card">
          <div className="auth-heading"><h1 id="auth-title">{title}</h1>{codeStep && <p>{email}</p>}</div>
          {error && <div className="auth-message error" role="alert">{error}</div>}
          {notice && <div className="auth-message notice" role="status">{notice}</div>}
          {codeStep ? <form className="auth-form" onSubmit={confirmCode}>
            <label className="auth-code-field" htmlFor="verification-code"><span className="sr-only">Код подтверждения</span><KeyRound size={20} />
              <input ref={codeInput} id="verification-code" name="code" disabled={busy} required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" />
            </label>
            <button className="button primary auth-submit" type="submit" disabled={busy}>{busy ? 'Подтверждаем…' : <>Подтвердить почту<ArrowRight size={17} /></>}</button>
            <button className="auth-link-button" type="button" disabled={busy} onClick={() => void requestCode()}>Отправить код ещё раз</button>
            <button className="auth-secondary-action" type="button" disabled={busy} onClick={returnToDetails}>Изменить данные</button>
          </form> : isRegister ? <form className="auth-form" onSubmit={submitRegistration}>
            <fieldset disabled={busy} className="auth-fields">
            <fieldset className="auth-role-picker" disabled={busy}><legend className="sr-only">Роль</legend><div>
              {([{ value: 'candidate', label: 'Кандидат', Icon: UserRound }, { value: 'employer', label: 'Работодатель', Icon: BriefcaseBusiness }] as const).map(item => <button key={item.value} type="button" className={role === item.value ? 'selected' : ''} aria-pressed={role === item.value} onClick={() => { setRole(item.value); onRoleChange(item.value); setError(''); }}><item.Icon size={18} /><span>{item.label}</span><i>{role === item.value && <Check size={14} />}</i></button>)}
            </div></fieldset>
            <label className="auth-field"><span>{role === 'candidate' ? 'Ваше имя' : 'Название компании'}</span><input autoComplete={role === 'candidate' ? 'name' : 'organization'} value={role === 'candidate' ? name : companyName} onChange={event => role === 'candidate' ? setName(event.target.value) : setCompanyName(event.target.value)} placeholder={role === 'candidate' ? 'Например, Анна Морозова' : 'Например, Предельные технологии'} /></label>
            <label className="auth-field"><span>Логин</span><input autoComplete="username" autoCapitalize="none" spellCheck="false" value={login} onChange={event => setLogin(event.target.value.replace(/\s/g, ''))} placeholder="anna.morozova" /><small>3–32 латинских символа, цифры, точки, дефисы или подчёркивания</small></label>
            <label className="auth-field"><span>Эл. почта</span><span className="auth-input-icon"><Mail size={17} /><input type="email" autoComplete="email" inputMode="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></span></label>
            <div className="auth-password-grid"><label className="auth-field"><span>Пароль</span><span className="auth-input-icon"><LockKeyhole size={17} /><input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Не менее 8 символов" /></span></label>
              <label className="auth-field"><span>Повторите пароль</span><input type="password" autoComplete="new-password" value={passwordRepeat} onChange={event => setPasswordRepeat(event.target.value)} placeholder="Повторите пароль" /></label></div>
            <label className="auth-consent"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} /><span>Согласен на обработку персональных данных по <a href="/privacy" target="_blank" rel="noopener noreferrer">политике конфиденциальности</a>.</span></label>
            </fieldset>
            <button className="button primary auth-submit" type="submit" disabled={busy}>{busy ? 'Отправляем код…' : <>Продолжить<ArrowRight size={17} /></>}</button>
          </form> : <form className="auth-form" onSubmit={submitLogin}>
            <fieldset disabled={busy} className="auth-fields">
            <label className="auth-field"><span>Логин или эл. почта</span><span className="auth-input-icon"><UserRound size={17} /><input autoComplete="username" autoCapitalize="none" value={loginOrEmail} onChange={event => setLoginOrEmail(event.target.value)} placeholder="anna.morozova или you@example.com" /></span></label>
            <label className="auth-field"><span>Пароль</span><span className="auth-input-icon"><LockKeyhole size={17} /><input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Ваш пароль" /></span></label>
            </fieldset>
            <button className="button primary auth-submit" type="submit" disabled={busy}>{busy ? 'Входим…' : <>Войти<ArrowRight size={17} /></>}</button>
          </form>}
          {!codeStep && <div className="auth-switch">{isRegister ? <>Уже есть аккаунт? <button disabled={busy} type="button" onClick={() => onSwitchMode('login')}>Войти</button></> : <>Нет аккаунта? <button disabled={busy} type="button" onClick={() => onSwitchMode('register')}>Регистрация</button></>}</div>}
        </div>
      </section>
    </main>
  </div>;
}
