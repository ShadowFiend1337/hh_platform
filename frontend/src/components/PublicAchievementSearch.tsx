import { useEffect, useRef, useState } from 'react';
import { ClaimForm } from './ClaimForm';
import { integrationRequest } from '../integrations-api';
import { publicRecordUrl, type PublicRecord, type PublicSource } from '../claims-api';
type SearchResult = { items: PublicRecord[]; total: number; coverage: { sources: number; records: number; complete: false } };
export function PublicAchievementSearch({ accountId, consent, onClaimCreated }: { accountId: string; consent: boolean; onClaimCreated: () => void }) {
  const [selected,setSelected]=useState<PublicRecord|null>(null);
  const [sources,setSources]=useState<PublicSource[]>([]),[sourceId,setSourceId]=useState(''),[offset,setOffset]=useState(0);
  const [name,setName] = useState(''); const [result,setResult] = useState<SearchResult | null>(null);
  const [error,setError] = useState(''); const [busy,setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => { setSelected(null); setResult(null); setName(''); setSourceId(''); setSources([]); setOffset(0); setError(''); setBusy(false); return () => pending.current?.abort(); },[accountId,consent]);
  useEffect(()=>{const controller=new AbortController();if(consent)void integrationRequest<{sources:PublicSource[]}>('/api/integrations/public-achievements/sources','GET',undefined,accountId,controller.signal).then(data=>{if(!controller.signal.aborted)setSources(data.sources);}).catch(()=>{});return()=>controller.abort();},[accountId,consent]);
  async function search(page=0) {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setSelected(null); setBusy(true); setError(''); setResult(null);
    try {
      const params=new URLSearchParams({name:name.trim(),limit:'10',offset:String(page),...(sourceId?{sourceId}:{})});
      const data = await integrationRequest<SearchResult>('/api/integrations/public-achievements/search?'+params.toString(),'GET',undefined,accountId,controller.signal);
      if (!controller.signal.aborted){setResult(data);setOffset(page);}
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Не удалось найти результаты.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <div className="integration-source"><h3>Результаты из открытых источников</h3>
    <p className="field-help">Поиск по протоколам, итоговым таблицам и новостям. Совпадение имени не подтверждает принадлежность; для команды отдельно проверяется ваш состав.</p>
    <label className="field"><span>Имя участника или команда</span><input value={name} maxLength={100} placeholder="Фамилия Имя или название команды" onChange={event => { pending.current?.abort(); setBusy(false); setSelected(null); setName(event.target.value); setResult(null); setError(''); }} /></label>
    <label className="field"><span>Источник результатов</span><select value={sourceId} onChange={event=>{pending.current?.abort();setBusy(false);setSourceId(event.target.value);setSelected(null);setResult(null);}}><option value="">Все источники, включая PDF ФСП</option>{sources.map(source=><option key={source.id} value={source.id}>{source.publisher} · {source.title}</option>)}</select></label>
    <button className="button secondary compact" disabled={busy || !consent || name.trim().length < 2} onClick={() => void search()}>{busy ? 'Ищем…' : 'Найти результат'}</button>
    {sources.some(source=>source.status!=='matched')&&<p className="field-help">Некоторые источники недоступны или ожидают обновления. Каталог может быть неполным.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {result && <><p className="field-help" role="status">Найдено: {result.total}. В каталоге {result.coverage.records} записей из {result.coverage.sources} источников. Каталог пока охватывает часть соревнований.</p>
      {result.items.map(item => <article className="integration-source" key={item.id}><strong>{item.participantName}</strong><p>{item.title} · {item.occurredOn}</p>
        <p>{item.result||`Место: ${item.place} · Решено задач: ${item.solvedTasks} · Регион: ${item.region}`}</p>
        <p className="field-help">{item.participation==='team'?'Командный результат':'Индивидуальный результат'} · {item.publisher||'ФСП России'} · {item.sourceKind==='news'?'Новость':item.sourceKind==='table'?'Итоговая таблица':'Протокол PDF'}{item.dateBasis==='publication'?' · указана дата публикации':''}</p>
        {item.excerpt&&<blockquote className="field-help">{item.excerpt}</blockquote>}
        {item.sourceStatus!=='matched'&&<p className="field-help">Нужно обновить источник перед подтверждением.</p>}
        <p className="field-help">Публичная запись · Принадлежность аккаунту не подтверждена</p>
        <div className="integration-actions"><button className="button secondary compact" disabled={!consent} onClick={()=>setSelected(item)}>Это мой результат</button></div>
        <a href={publicRecordUrl(item)} target="_blank" rel="noopener noreferrer">{item.sourcePage?'Оригинал протокола, страница '+item.sourcePage:'Оригинальная публикация'}</a>
      </article>)}
      {result.total === 0 && <p>Совпадений в текущем каталоге нет. Это не означает отсутствия участия в соревнованиях.</p>}
      {result.total>10&&<div className="integration-actions"><button className="text-button" disabled={busy||offset===0} onClick={()=>void search(Math.max(0,offset-10))}>Предыдущие результаты</button><button className="text-button" disabled={busy||offset+10>=result.total} onClick={()=>void search(offset+10)}>Следующие результаты</button></div>}
    </>}
    {selected && <ClaimForm key={selected.id} accountId={accountId} recordId={selected.id} onDone={()=>{setSelected(null);onClaimCreated();}} onCancel={()=>setSelected(null)} />}
  </div>;
}
