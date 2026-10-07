import { useEffect, useRef, useState } from 'react';
import { ClaimForm } from './ClaimForm';
import { integrationRequest } from '../integrations-api';
type PublicResult = { id: string; participantName: string; title: string; occurredOn: string; place: number;
  solvedTasks: number; completionTime: number; region: string; sourceUrl: string; sourcePage: number };
type SearchResult = { items: PublicResult[]; total: number; coverage: { sources: number; records: number; complete: false } };
export function PublicFspSearch({ accountId, consent, onClaimCreated }: { accountId: string; consent: boolean; onClaimCreated: () => void }) {
  const [selected,setSelected]=useState<PublicResult|null>(null);
  const [name,setName] = useState(''); const [result,setResult] = useState<SearchResult | null>(null);
  const [error,setError] = useState(''); const [busy,setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => { setSelected(null); setResult(null); setName(''); setError(''); setBusy(false); return () => pending.current?.abort(); },[accountId,consent]);
  async function search() {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setSelected(null); setBusy(true); setError(''); setResult(null);
    try {
      const data = await integrationRequest<SearchResult>('/api/integrations/fsp-public/search?name='+encodeURIComponent(name.trim()),'GET',undefined,accountId,controller.signal);
      if (!controller.signal.aborted) setResult(data);
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Не удалось найти результаты.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <div className="integration-source"><h3>Публичные протоколы ФСП</h3>
    <p className="field-help">Найдите своё ФИО в опубликованных результатах соревнований. Принадлежность записи требует отдельной проверки.</p>
    <label className="field"><span>Фамилия и имя участника</span><input value={name} maxLength={100} placeholder="Фамилия Имя Отчество" onChange={event => { pending.current?.abort(); setBusy(false); setSelected(null); setName(event.target.value); setResult(null); setError(''); }} /></label>
    <button className="button secondary compact" disabled={busy || !consent || name.trim().split(/\s+/u).length < 2} onClick={() => void search()}>{busy ? 'Ищем…' : 'Найти в протоколах'}</button>
    {error && <p className="form-error" role="alert">{error}</p>}
    {result && <><p className="field-help" role="status">Найдено: {result.total}. В каталоге {result.coverage.records} записей из {result.coverage.sources} протокола. Каталог пока охватывает часть соревнований.</p>
      {result.items.map(item => <article className="integration-source" key={item.id}><strong>{item.participantName}</strong><p>{item.title} · {item.occurredOn}</p>
        <p>Место: {item.place} · Решено задач: {item.solvedTasks} · Регион: {item.region}</p>
        <p className="field-help">Публичная запись · Принадлежность аккаунту не подтверждена</p>
        <div className="integration-actions"><button className="button secondary compact" disabled={!consent} onClick={()=>setSelected(item)}>Это мой результат</button></div>
        <a href={item.sourceUrl+'#page='+item.sourcePage} target="_blank" rel="noopener noreferrer">Оригинал протокола, страница {item.sourcePage}</a>
      </article>)}
      {result.total === 0 && <p>Совпадений в текущем каталоге нет. Это не означает отсутствия участия в соревнованиях.</p>}
    </>}
    {selected && <ClaimForm key={selected.id} accountId={accountId} recordId={selected.id} onDone={()=>{setSelected(null);onClaimCreated();}} onCancel={()=>setSelected(null)} />}
  </div>;
}
