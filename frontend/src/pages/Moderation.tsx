import { useEffect, useState } from 'react';
import { claimRequest, claimLabels, checkLabels, publicRecordUrl, type AchievementClaim, type PublicSource } from '../claims-api';
import { Brand } from '../components/Brand';
import { ItemBankModeration } from '../components/ItemBankModeration';
import { AssessmentReviews } from '../components/AssessmentReviews';
export function Moderation({accountId,role,testAccount=false}:{accountId:string;role:string;testAccount?:boolean}) {
  const [status,setStatus]=useState<AchievementClaim['status']>('pending'),[offset,setOffset]=useState(0),[total,setTotal]=useState(0);
  const [claims,setClaims]=useState<AchievementClaim[]>([]),[selected,setSelected]=useState<AchievementClaim|null>(null),[refresh,setRefresh]=useState(0);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [decision,setDecision]=useState('approve'),[reason,setReason]=useState(''),[method,setMethod]=useState('document_review'),[reference,setReference]=useState(''),[confirmed,setConfirmed]=useState(false);
  const [teamConfirmed,setTeamConfirmed]=useState(false),[sources,setSources]=useState<PublicSource[]>([]),[sourceRevision,setSourceRevision]=useState(0);
  const [sourceError,setSourceError]=useState(''),[section,setSection]=useState<'claims'|'bank'|'tests'>(()=>location.hash==='#bank'?'bank':location.hash==='#tests'||testAccount?'tests':'claims');
  useEffect(()=>{if(testAccount)return;const controller=new AbortController();claimRequest<{sources:PublicSource[]}>('/api/moderation/sources','GET',undefined,accountId,controller.signal).then(data=>{if(!controller.signal.aborted){setSources(data.sources);setSourceError('');}}).catch(cause=>{if(!controller.signal.aborted){setSources([]);setSourceError(cause instanceof Error?cause.message:'Не удалось загрузить источники.');}});return()=>controller.abort();},[accountId,sourceRevision,refresh]);
  useEffect(()=>{if(!sources.some(source=>source.activeJob))return;const timer=setTimeout(()=>setSourceRevision(value=>value+1),1500);return()=>clearTimeout(timer);},[sources]);
  async function collect(sourceId:string){setBusy(true);setError('');try{await claimRequest('/api/moderation/sources/'+sourceId+'/collect','POST',{},accountId);setSourceRevision(value=>value+1);}catch(cause){setError(cause instanceof Error?cause.message:'Сбор не запущен.');}finally{setBusy(false);}}
  useEffect(()=>{if(testAccount){setLoading(false);return;}const controller=new AbortController();setError('');setLoading(true);setSelected(null);
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
  return <div className="app-shell"><header className="site-header"><div className="header-inner"><Brand onHome={()=>window.location.assign('/')} />
    <a href={'/app?role='+role}>Вернуться в кабинет</a></div></header><main className="main-content"><div className="moderation-tabs" role="tablist" aria-label="Разделы модерации"><button role="tab" aria-selected={section==='tests'} onClick={()=>{setSection('tests');history.replaceState(null,'','#tests');}}>Тесты</button><button role="tab" aria-selected={section==='bank'} onClick={()=>{setSection('bank');history.replaceState(null,'','#bank');}}>Банк заданий</button>{!testAccount&&<button role="tab" aria-selected={section==='claims'} onClick={()=>{setSection('claims');history.replaceState(null,'','#claims');}}>Достижения</button>}</div>{section==='tests'?<><h1>Проверка тестов</h1><p className="muted">Попытки, где после закрытой части кандидат решил открытые задачи. Видны ответы, ключи, рубрики и происхождение каждого задания; итог — половина закрытой и половина открытой части, порог 70.{testAccount?' Тестовый модератор видит только тестовые аккаунты.':''}</p><AssessmentReviews accountId={accountId} /></>:section==='bank'?<><h1>Банк заданий</h1><p className="muted">Сгенерированные задания проходят локальные проверки и независимый решатель, затем показываются как незачётные пилотные. В зачёт они попадают после вашего одобрения или статистической калибровки. Ключ виден только модератору.</p><ItemBankModeration accountId={accountId} /></>:<><h1>Модерация достижений</h1>
    <p className="muted">Проверьте результат в официальном источнике и материалы, подтверждающие принадлежность кандидату. Автоматическая сверка помогает проверке.</p>
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
    </section></div></>}</main></div>;
}
