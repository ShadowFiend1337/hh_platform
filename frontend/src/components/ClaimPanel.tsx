import { useEffect, useState } from 'react';
import { claimRequest, claimLabels, checkLabels, type AchievementClaim } from '../claims-api';
import { ClaimForm } from './ClaimForm';
export function ClaimPanel({accountId,consent,revision,onChange}:{accountId:string;consent:boolean;revision:number;onChange:()=>void}) {
  const [claims,setClaims]=useState<AchievementClaim[]>([]),[refresh,setRefresh]=useState(0),[error,setError]=useState(''),[editing,setEditing]=useState<string|null>(null),[busy,setBusy]=useState(false);
  useEffect(()=>{const controller=new AbortController();setError('');
    claimRequest<{claims:AchievementClaim[]}>('/api/achievement-claims','GET',undefined,accountId,controller.signal).then(data=>{if(!controller.signal.aborted)setClaims(data.claims);}).catch(cause=>{if(!controller.signal.aborted)setError(cause.message);});return()=>controller.abort();
  },[accountId,revision,refresh,consent]);
  const changed=()=>{setEditing(null);setRefresh(value=>value+1);onChange();};
  async function withdraw(claim:AchievementClaim){setBusy(true);setError('');try{await claimRequest('/api/achievement-claims/'+claim.id,'DELETE',{version:claim.version},accountId);changed();}catch(cause){setError(cause instanceof Error?cause.message:'Не удалось отозвать заявку.');setRefresh(value=>value+1);}finally{setBusy(false);}}
  return <div className="integration-source claim-panel"><h3>Мои заявки на достижения</h3>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!claims.length && <p className="field-help">Выберите свой результат в открытых источниках и отправьте материалы для проверки.</p>}
    {claims.map(claim=><article className="claim-card" key={claim.id}><strong>{claim.record.title}</strong><p>{claim.record.participantName} · Место {claim.record.place}</p>
      <p role="status">{claimLabels[claim.status]}{claim.status==='approved'&&!claim.active?' · требуется повторная проверка':''}</p>
      {claim.decisionNote && <p>Комментарий модератора: {claim.decisionNote}</p>}
      {claim.checks.reasons.filter(reason=>!claim.active||reason!=='team_membership_required').map(reason=><p className="field-help" key={reason}>{checkLabels[reason]||reason}</p>)}
      <p className="field-help">{claim.active?'Принадлежность подтверждена модератором. Публикация зависит от настроек профиля.':'Заявка не даёт подтверждённого достижения в профиле.'}</p>
      <details><summary>Мои материалы</summary><p className="claim-statement">{claim.statement}</p>{claim.links.map(link=><p key={link}><a href={link} target="_blank" rel="noopener noreferrer">Подтверждающая ссылка</a></p>)}
        {claim.document && <a href={'/api/achievement-claims/'+claim.id+'/attachment'}>Скачать {claim.document.name}</a>}</details>
      {editing===claim.id?<ClaimForm key={claim.id+':'+claim.version} accountId={accountId} recordId={claim.recordId} previous={claim} onDone={changed} onCancel={()=>setEditing(null)} />:<div className="integration-actions">
        {claim.status!=='approved' && <button className="button secondary compact" disabled={busy||!consent} onClick={()=>setEditing(claim.id)}>Дополнить и отправить</button>}
        {!['withdrawn','revoked'].includes(claim.status) && <button className="text-button" disabled={busy} onClick={()=>void withdraw(claim)}>Отозвать заявку</button>}
      </div>}
    </article>)}
  </div>;
}
