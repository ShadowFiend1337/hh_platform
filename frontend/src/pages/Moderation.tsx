import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { claimRequest, claimLabels, checkLabels, publicRecordUrl, type AchievementClaim, type PublicSource } from '../claims-api';
import { Brand } from '../components/Brand';
import { SiteFooter } from '../components/SiteFooter';
import { ItemBankModeration } from '../components/ItemBankModeration';
import { AssessmentReviews } from '../components/AssessmentReviews';

export type ModeratorAccount = { id: string; login: string; name?: string; canModerate?: boolean; testAccount?: boolean };
type Section = 'tests' | 'bank' | 'claims';
const sectionLabels: Record<Section, string> = { tests: 'Проверка тестов', bank: 'Банк заданий', claims: 'Достижения' };

/** The moderator cabinet: a separate staff workspace, not a page inside the employer or candidate cabinet. */
export function Moderation({ account }: { account: ModeratorAccount }) {
  const testAccount = Boolean(account.testAccount);
  // The public team test moderator reviews tests and the bank only; achievement claims hold private documents.
  const sections: Section[] = testAccount ? ['tests', 'bank'] : ['tests', 'bank', 'claims'];
  const fromHash = useCallback((): Section => sections.find(item => '#' + item === location.hash) || 'tests', [testAccount]);
  const [section, setSection] = useState<Section>(fromHash);
  const [pending, setPending] = useState(0), [queueRevision, setQueueRevision] = useState(0);
  const [signingOut, setSigningOut] = useState(false), [signOutError, setSignOutError] = useState('');

  useEffect(() => { if (location.pathname !== '/moderation') history.replaceState(null, '', '/moderation' + location.hash); }, []);
  useEffect(() => {
    const sync = () => setSection(fromHash());
    window.addEventListener('popstate', sync); window.addEventListener('hashchange', sync);
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); };
  }, [fromHash]);
  useEffect(() => { document.title = (account.canModerate ? sectionLabels[section] + ' · ' : '') + 'Модерация · predel'; }, [section, account.canModerate]);
  useEffect(() => {
    if (!account.canModerate) return;
    const controller = new AbortController();
    claimRequest<{ total: number }>('/api/moderation/assessments?status=pending&limit=1', 'GET', undefined, account.id, controller.signal)
      .then(data => { if (!controller.signal.aborted) setPending(data.total); }).catch(() => {});
    return () => controller.abort();
  }, [account.id, account.canModerate, queueRevision]);

  function open(next: Section) {
    if (next !== section || location.hash !== '#' + next) history.pushState(null, '', '/moderation#' + next);
    setSection(next); window.scrollTo({ top: 0, behavior: 'instant' });
  }
  async function signOut() {
    setSigningOut(true); setSignOutError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) throw new Error();
      window.location.assign('/');
    } catch { setSigningOut(false); setSignOutError('Не удалось завершить сессию. Повторите попытку.'); }
  }

  return <div className="app-shell moderator-shell">
    <a className="skip-link" href="#main-content">К содержимому</a>
    <header className="site-header"><div className="header-inner">
      <Brand onHome={() => open('tests')} />
      {account.canModerate && <nav className="main-nav" aria-label="Разделы модерации">{sections.map(item =>
        <a href={'#' + item} key={item} aria-current={section === item ? 'page' : undefined} onClick={event => { event.preventDefault(); open(item); }}>
          {sectionLabels[item]}{item === 'tests' && pending > 0 && <span className="nav-count" title="Ждут проверки">{pending}<span className="sr-only"> ждут проверки</span></span>}</a>)}</nav>}
      <div className="header-account">
        <span className="app-account-name" title={account.login}>{account.name || account.login}</span>
        {testAccount && <span className="role-static">Учебный аккаунт</span>}
        <button className="app-signout" disabled={signingOut} onClick={() => void signOut()}>{signingOut ? 'Выходим…' : 'Выйти'}</button>
        <span className="role-button role-static moderator-role"><ShieldCheck size={16} aria-hidden="true" />Модератор</span>
      </div>
    </div></header>
    <main id="main-content" className="main-content">
      {signOutError && <div className="data-error" role="alert"><span>{signOutError}</span></div>}
      {!account.canModerate ? <div className="panel empty-state"><h1>Доступ к модерации приостановлен</h1>
        <p className="muted">Администратор отозвал права этого аккаунта. Кабинет откроется снова, когда доступ восстановят.</p></div>
        : section === 'tests' ? <><h1>Проверка тестов</h1><p className="muted moderation-lead">Итоги тестов с ответами, ключами, рубриками и происхождением каждого задания. Открытые задачи оценивает модератор: итог — половина закрытой и половина открытой части, порог 70.{testAccount ? ' Тестовый модератор видит только тестовые аккаунты.' : ''}</p>
          <AssessmentReviews accountId={account.id} onDecided={() => setQueueRevision(value => value + 1)} /></>
        : section === 'bank' ? <><h1>Банк заданий</h1><p className="muted moderation-lead">Сгенерированные задания проходят локальные проверки и независимый решатель, затем показываются как незачётные пилотные. В зачёт они попадают после вашего одобрения или статистической калибровки. Ключ виден только модератору.</p>
          <ItemBankModeration accountId={account.id} /></>
        : <AchievementClaims accountId={account.id} />}
    </main>
    <SiteFooter />
  </div>;
}

function AchievementClaims({accountId}:{accountId:string}) {
  const [status,setStatus]=useState<AchievementClaim['status']>('pending'),[offset,setOffset]=useState(0),[total,setTotal]=useState(0);
  const [claims,setClaims]=useState<AchievementClaim[]>([]),[selected,setSelected]=useState<AchievementClaim|null>(null),[refresh,setRefresh]=useState(0);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [decision,setDecision]=useState('approve'),[reason,setReason]=useState(''),[method,setMethod]=useState('document_review'),[reference,setReference]=useState(''),[confirmed,setConfirmed]=useState(false);
  const [teamConfirmed,setTeamConfirmed]=useState(false),[sources,setSources]=useState<PublicSource[]>([]),[sourceRevision,setSourceRevision]=useState(0);
  const [sourceError,setSourceError]=useState('');
  useEffect(()=>{const controller=new AbortController();claimRequest<{sources:PublicSource[]}>('/api/moderation/sources','GET',undefined,accountId,controller.signal).then(data=>{if(!controller.signal.aborted){setSources(data.sources);setSourceError('');}}).catch(cause=>{if(!controller.signal.aborted){setSources([]);setSourceError(cause instanceof Error?cause.message:'Не удалось загрузить источники.');}});return()=>controller.abort();},[accountId,sourceRevision,refresh]);
  useEffect(()=>{if(!sources.some(source=>source.activeJob))return;const timer=setTimeout(()=>setSourceRevision(value=>value+1),1500);return()=>clearTimeout(timer);},[sources]);
  async function collect(sourceId:string){setBusy(true);setError('');try{await claimRequest('/api/moderation/sources/'+sourceId+'/collect','POST',{},accountId);setSourceRevision(value=>value+1);}catch(cause){setError(cause instanceof Error?cause.message:'Сбор не запущен.');}finally{setBusy(false);}}
  useEffect(()=>{const controller=new AbortController();setError('');setLoading(true);setSelected(null);
    claimRequest<{claims:AchievementClaim[];total:number}>('/api/moderation/claims?status='+status+'&limit=20&offset='+offset,'GET',undefined,accountId,controller.signal)
      .then(data=>{if(!controller.signal.aborted){setClaims(data.claims);setTotal(data.total);}}).catch(cause=>{if(!controller.signal.aborted){setError(cause.message);setClaims([]);}})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
  },[accountId,status,offset,refresh]);
  async function inspect(id:string){setBusy(true);setError('');try{const claim=await claimRequest<AchievementClaim>('/api/moderation/claims/'+id,'GET',undefined,accountId);setSelected(claim);setReason('');setReference('');setConfirmed(false);setTeamConfirmed(false);setDecision(claim.status==='approved'?'revoke':'approve');}
    catch(cause){setError(cause instanceof Error?cause.message:'Заявка недоступна.');}finally{setBusy(false);}}
  async function decide(){if(!selected)return;setBusy(true);setError('');try{
    await claimRequest('/api/moderation/claims/'+selected.id+'/decision','POST',{version:selected.version,decision,reason,
      ...(decision==='approve'?{ownershipConfirmed:confirmed,verificationMethod:method,verificationReference:reference,...(selected.record.participation==='team'?{teamMembershipConfirmed:teamConfirmed}:{})}:{})},accountId);
    setSelected(null);setRefresh(value=>value+1);
  }catch(cause){setError(cause instanceof Error?cause.message:'Решение не сохранено.');}finally{setBusy(false);}}
  async function checkSource(){if(!selected)return;setBusy(true);setError('');try {
    await claimRequest('/api/moderation/sources/'+selected.record.sourceId+'/check','POST',{},accountId);
    setSelected(await claimRequest<AchievementClaim>('/api/moderation/claims/'+selected.id,'GET',undefined,accountId));
  }catch(cause){setError(cause instanceof Error?cause.message:'Проверка источника не завершена.');}finally{setBusy(false);}}
  const actionable=selected&&['pending','needs_info','approved'].includes(selected.status);
  return <><h1>Модерация достижений</h1>
    <p className="muted moderation-lead">Проверьте результат в официальном источнике и материалы, подтверждающие принадлежность кандидату. Автоматическая сверка помогает проверке.</p>
    <details className="panel public-source-management"><summary>Сбор из открытых источников</summary>{sourceError&&<p className="form-error" role="alert">{sourceError}</p>}{sources.map(source=><article className="integration-source" key={source.id}><strong>{source.publisher} · {source.title}</strong><p>{source.activeJob?'Обновляется…':source.status==='matched'?'Источник актуален':'Требуется обновление'} · записей: {source.recordCount}</p><p className="field-help">{source.lastSuccessAt?'Последний успешный разбор: '+new Date(source.lastSuccessAt).toLocaleString('ru-RU'):'Успешного разбора пока нет'}{source.lastError?' · '+(source.lastError==='invalid_source_response'?'Формат изменился; нужна проверка парсера':'Источник недоступен'):''}</p><button className="button secondary compact" disabled={busy||!!source.activeJob} onClick={()=>void collect(source.id)}>Обновить источник</button></article>)}</details>
    <div className="moderation-layout"><section className="panel"><h2>Очередь заявок</h2><label className="field"><span>Статус заявки</span><select value={status} onChange={event=>{setStatus(event.target.value as AchievementClaim['status']);setOffset(0);}}>{Object.entries(claimLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
      <button className="button secondary compact" disabled={busy} onClick={()=>setRefresh(value=>value+1)}>Обновить очередь</button>
      <p className="field-help" role="status">{loading?'Загружаем…':`Всего заявок: ${total}`}</p>
      {claims.map(claim=><article className="claim-card" key={claim.id}><strong>{claim.candidateName}</strong><p>{claim.record.title}</p><p>{claim.record.participantName} · Место {claim.record.place}</p>
        <p>{claimLabels[claim.status]}</p><button className="button secondary compact" disabled={busy} onClick={()=>void inspect(claim.id)}>Рассмотреть заявку</button></article>)}
      <div className="integration-actions"><button className="text-button" disabled={offset===0||busy} onClick={()=>setOffset(value=>Math.max(0,value-20))}>Назад</button><button className="text-button" disabled={offset+20>=total||busy} onClick={()=>setOffset(value=>value+20)}>Следующие</button></div>
    </section><section className="panel moderation-detail"><h2>Проверка заявки</h2>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!selected?<p className="muted">Выберите заявку из очереди.</p>:<><h3>{selected.record.participantName}</h3><p>Кандидат: {selected.currentCandidateName}</p><p>{selected.record.title} · {selected.record.occurredOn} · Место {selected.record.place}</p>
        <a href={publicRecordUrl(selected.record)} target="_blank" rel="noopener noreferrer">{selected.record.sourcePage?'Официальный протокол, страница '+selected.record.sourcePage:'Оригинальная публикация'}</a>
        {selected.record.excerpt&&<blockquote>{selected.record.excerpt}</blockquote>}
        {selected.record.participation==='team'&&<p className="field-help">Это результат команды. Проверьте, что кандидат входил в её состав на этом соревновании. Личный вклад не устанавливается по месту команды.</p>}
        <p><button className="button secondary compact" disabled={busy} onClick={()=>void checkSource()}>Проверить свежесть источника</button></p>
        {selected.sourceCheck && <p className="field-help">Последняя проверка источника: {new Date(selected.sourceCheck.checkedAt).toLocaleString('ru-RU')} · {selected.sourceCheck.status==='matched'?'совпадает с каталогом':'выполнена; сравните текущий результат'}</p>}
        <h3>Автоматическая сверка</h3><p>Источник: {selected.checks.sourceStatus==='matched'?'совпадает с проверенным каталогом':'нужна повторная проверка'}</p>
        <p>{selected.checks.nameMatch===null?'Проверка состава команды требует подтверждающих материалов.':'ФИО: '+(selected.checks.nameMatch?'совпадает':'различается')+'.'} Принадлежность автоматически не подтверждается.</p>
        {selected.checks.reasons.map(item=><p className="field-help" key={item}>{checkLabels[item]||item}</p>)}
        <h3>Материалы кандидата</h3><p className="claim-statement">{selected.statement}</p>
        {selected.links.map((link,i)=><p key={link}><a href={link} target="_blank" rel="noopener noreferrer">Материал {i+1}: {new URL(link).hostname}</a></p>)}
        {selected.document && <p><a href={'/api/moderation/claims/'+selected.id+'/attachment'}>Скачать {selected.document.name}</a> · {Math.ceil(selected.document.size/1024)} КБ</p>}
        {selected.decisionNote && <p>Предыдущее решение: {selected.decisionNote}</p>}
        {actionable&&<div className="claim-form"><h3>Решение модератора</h3><label className="field"><span>Решение</span><select value={decision} onChange={event=>setDecision(event.target.value)}>
          {selected.status==='approved'?<><option value="revoke">Отозвать подтверждение</option><option value="approve">Повторно подтвердить</option></>:<><option value="approve">Одобрить</option><option value="request_information">Запросить уточнение</option><option value="reject">Отклонить</option></>}</select></label>
          <label className="field"><span>Обоснование решения для кандидата</span><textarea value={reason} maxLength={1500} rows={3} onChange={event=>setReason(event.target.value)} /></label>
          {decision==='approve'&&<><label className="field"><span>Способ проверки принадлежности</span><select value={method} onChange={event=>setMethod(event.target.value)}><option value="document_review">Проверка подтверждающих материалов</option><option value="organizer_confirmation">Подтверждение организатора</option><option value="account_ownership">Проверка владения аккаунтом участника</option></select></label>
            <label className="field"><span>Основание проверки — доступно модераторам</span><textarea value={reference} maxLength={2000} rows={3} onChange={event=>setReference(event.target.value)} placeholder="Что проверено, каким способом установлена связь кандидата с результатом" /></label>
            <label className="checkbox-field"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} /><span>Проверил материалы и подтверждаю принадлежность результата кандидату. Совпадения ФИО недостаточно.</span></label>
            {selected.record.participation==='team'&&<label className="checkbox-field"><input type="checkbox" checked={teamConfirmed} onChange={event=>setTeamConfirmed(event.target.checked)} /><span>Проверил участие кандидата в составе команды на этом соревновании.</span></label>}
          </>}
          <button className="button primary" disabled={busy||reason.trim().length<10||decision==='approve'&&(!confirmed||selected.record.participation==='team'&&!teamConfirmed||reference.trim().length<20||selected.checks.sourceStatus!=='matched'||selected.checks.duplicateApproved)} onClick={()=>void decide()}>{busy?'Сохраняем…':'Сохранить решение'}</button>
        </div>}
        <details><summary>История действий</summary>{selected.audit?.map(event=><p key={event.id}>{new Date(event.createdAt).toLocaleString('ru-RU')} · {event.action} · версия {event.version}</p>)}</details>
      </>}
    </section></div></>;
}
