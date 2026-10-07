import { useState } from 'react';
import { claimRequest, encodeDocument, type AchievementClaim } from '../claims-api';
export function ClaimForm({accountId,recordId,previous,onDone,onCancel}:{accountId:string;recordId:string;previous?:AchievementClaim;onDone:()=>void;onCancel:()=>void}) {
  const [statement,setStatement]=useState(previous?.statement || ''); const [links,setLinks]=useState(previous?.links.join('\n') || '');
  const [file,setFile]=useState<File|null>(null),[approved,setApproved]=useState(false),[retain,setRetain]=useState(Boolean(previous?.document));
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(){setBusy(true);setError('');try{
    const document=file?await encodeDocument(file):undefined;
    await claimRequest(previous?'/api/achievement-claims/'+previous.id:'/api/achievement-claims',previous?'PUT':'POST',{
      ...(previous?{version:previous.version,retainDocument:retain&&!file}:{recordId}),consent:approved,statement,
      links:links.split('\n').map(value=>value.trim()).filter(Boolean),...(document?{document}:{})},accountId);
    onDone();
  }catch(cause){setError(cause instanceof Error?cause.message:'Не удалось отправить заявку.');}finally{setBusy(false);}}
  return <div className="claim-form"><h4>{previous?'Дополнить заявку':'Подтвердить участие'}</h4>
    <p className="field-help">Опишите участие и приложите материалы, позволяющие проверить принадлежность результата. Материалы доступны вам и модераторам.</p>
    <label className="field"><span>Описание участия</span><textarea value={statement} maxLength={3000} rows={4} onChange={event=>setStatement(event.target.value)} placeholder="Команда, роль и материалы для проверки вашего участия" /></label>
    <label className="field"><span>Ссылки на подтверждающие материалы</span><textarea value={links} maxLength={5000} rows={2} onChange={event=>setLinks(event.target.value)} placeholder="Каждая HTTPS-ссылка с новой строки" /></label>
    <label className="field"><span>Подтверждающий файл — до 2 МБ</span><input type="file" accept="application/pdf,image/png,image/jpeg" onChange={event=>setFile(event.target.files?.[0] || null)} /></label>
    {previous?.document && !file && <label className="checkbox-field"><input type="checkbox" checked={retain} onChange={event=>setRetain(event.target.checked)} /><span>Сохранить файл {previous.document.name}</span></label>}
    <label className="checkbox-field"><input type="checkbox" checked={approved} onChange={event=>setApproved(event.target.checked)} /><span>Это мой результат. Согласен на проверку материалов и публикацию достижения после одобрения согласно настройкам профиля.</span></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="integration-actions"><button className="button secondary compact" disabled={busy||!approved||statement.trim().length<20} onClick={()=>void submit()}>{busy?'Отправляем…':'Отправить на проверку'}</button>
      <button className="text-button" disabled={busy} onClick={onCancel}>Отмена</button></div>
  </div>;
}
