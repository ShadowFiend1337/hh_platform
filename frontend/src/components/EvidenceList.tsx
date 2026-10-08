import { useEffect, useState } from 'react';
import { evidenceStatusLabels, integrationRequest, type Evidence } from '../integrations-api';
import { dateLabel } from '../model';

export function EvidenceList({ items }: { items: Evidence[] }) {
  const [visible,setVisible]=useState(5);
  useEffect(()=>setVisible(5),[items]);
  return <div className="evidence-list">{items.slice(0,visible).map(item => <article className="achievement" key={item.id}>
    <strong>{item.title}</strong><span>{item.result} · {dateLabel(item.occurredAt)}</span>
    <span>{item.status === 'verified' && item.verificationMethod === 'manual_review' ? 'Подтверждено модератором' : evidenceStatusLabels[item.status]} · {({fsp:'ФСП','fsp-public':'ФСП','fsp-demo':'ФСП, демо',codeforces:'Codeforces',atcoder:'AtCoder',kaggle:'Kaggle',github:'GitHub','public-achievements':'Открытая публикация'} as Record<string,string>)[item.provider] || item.provider}</span>
    {item.verificationMethod === 'profile_challenge' && <span>Контроль над аккаунтом подтверждён одноразовым кодом</span>}
    {item.verificationMethod === 'api_token' && <span>Аккаунт подтверждён API-токеном источника</span>}
    {item.verificationMethod === 'oauth2' && <span>Аккаунт подтверждён через OAuth</span>}
    <span>{item.participation === 'team' ? 'Командный результат' : 'Индивидуальный результат'}{item.teamRole ? ' · ' + item.teamRole : ''}</span>
    {item.status === 'verified' && item.skills.length > 0 && <span>Свидетельство по направлениям: {item.skills.map(value => value.skill).join(', ')}</span>}
    <span>Проверено: {dateLabel(item.checkedAt)}{item.status === 'verified' ? ' · актуально до ' + dateLabel(item.validUntil) : ''}</span>
    {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Запись источника</a>}
  </article>)}{items.length>visible&&<button className="button secondary compact" onClick={()=>setVisible(value=>value+5)}>Показать ещё {Math.min(5,items.length-visible)} · всего {items.length}</button>}</div>;
}
export function CandidateEvidence({ candidateId }: { candidateId: string }) {
  const [items, setItems] = useState<Evidence[]>([]); const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController(); setItems([]); setError(''); setLoading(true);
    integrationRequest<{ items: Evidence[] }>(`/api/directory/${encodeURIComponent(candidateId)}/evidence`, 'GET', undefined, undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setItems(result.items); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [candidateId]);
  return <section><h4>Подтверждения из внешних источников</h4><EvidenceList items={items} />
    {!items.length && <p className="muted" role="status">{loading ? 'Проверяем внешние подтверждения…' : error || 'Внешних подтверждений пока нет'}</p>}</section>;
}
