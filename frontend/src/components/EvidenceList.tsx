import { useEffect, useState } from 'react';
import { evidenceStatusLabels, integrationRequest, type Evidence } from '../integrations-api';
import { dateLabel } from '../model';

export function EvidenceList({ items }: { items: Evidence[] }) {
  return <div className="evidence-list">{items.map(item => <article className="achievement" key={item.id}>
    <strong>{item.title}</strong><span>{item.result} · {dateLabel(item.occurredAt)}</span>
    <span>{item.status === 'verified' && item.verificationMethod === 'manual_review' ? 'Подтверждено модератором' : evidenceStatusLabels[item.status]} · {['fsp','fsp-public'].includes(item.provider) ? 'ФСП' : item.provider === 'fsp-demo' ? 'ФСП, демо' : item.provider}</span>
    <span>{item.participation === 'team' ? 'Командный результат' : 'Индивидуальный результат'}{item.teamRole ? ' · ' + item.teamRole : ''}</span>
    {item.status === 'verified' && item.skills.length > 0 && <span>Свидетельство по направлениям: {item.skills.map(value => value.skill).join(', ')}</span>}
    <span>Проверено: {dateLabel(item.checkedAt)}{item.status === 'verified' ? ' · актуально до ' + dateLabel(item.validUntil) : ''}</span>
    {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Запись источника</a>}
  </article>)}</div>;
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
