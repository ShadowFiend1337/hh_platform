import { useEffect, useState } from 'react';
import { integrationRequest, type IntegrationJob, type IntegrationProvider } from '../integrations-api';

interface Challenge { id: string; token: string; handle: string; field: 'organization' | 'affiliation'; profileUrl: string; keepProof: boolean; expiresAt: string }
export function ProfileChallengeConnect({ provider, accountId, consent, approved, enabled, onConnected }: {
  provider: IntegrationProvider; accountId: string; consent: boolean; approved: boolean; enabled: boolean; onConnected: (job: IntegrationJob) => void;
}) {
  const [handle,setHandle]=useState(''),[challenge,setChallenge]=useState<Challenge|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [controller]=useState(()=>new AbortController());
  useEffect(()=>()=>controller.abort(),[controller]);
  useEffect(()=>{if(!consent){setChallenge(null);setError('');}},[consent]);
  async function start(){
    setBusy(true);setError('');
    try{const result=await integrationRequest<{challenge:Challenge}>(`/api/integrations/${provider.id}/connect`,'POST',{handle:handle.trim(),consent:approved},accountId,controller.signal);if(!controller.signal.aborted)setChallenge(result.challenge);}
    catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Не удалось начать подключение.');}
    finally{if(!controller.signal.aborted)setBusy(false);}
  }
  async function verify(){
    if(!challenge)return;setBusy(true);setError('');
    try{const result=await integrationRequest<{job:IntegrationJob}>(`/api/integrations/${provider.id}/verify`,'POST',{challengeId:challenge.id},accountId,controller.signal);if(!controller.signal.aborted){setChallenge(null);onConnected(result.job);}}
    catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Не удалось подтвердить аккаунт.');}
    finally{if(!controller.signal.aborted)setBusy(false);}
  }
  async function cancel(){
    setBusy(true);setError('');
    try{await integrationRequest(`/api/integrations/${provider.id}`,'DELETE',undefined,accountId,controller.signal);if(!controller.signal.aborted)setChallenge(null);}
    catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Не удалось отменить подключение.');}
    finally{if(!controller.signal.aborted)setBusy(false);}
  }
  return <div className="codeforces-connect">
    <p className="field-help">{provider.id==='atcoder'?'Рейтинг и места из публичной истории Algorithm AtCoder.':'Рейтинг, рейтинговые выступления и принятые решения из официального API.'} Принадлежность аккаунта проверяется одноразовым кодом; грейд определяется нашим тестом.</p>
    {!challenge?<><label className="field"><span>Ник {provider.name}</span><input value={handle} maxLength={provider.id==='atcoder'?16:24} onChange={event=>setHandle(event.target.value)} placeholder={`Ваш ник на ${provider.name}`} /></label>
      <button className="button secondary compact" disabled={busy||!enabled||!consent||!approved||!handle.trim()} onClick={()=>void start()}>Подключить {provider.name}</button></>:<>
      <p>Откройте настройки профиля <a href={challenge.profileUrl} target="_blank" rel="noopener noreferrer">{challenge.handle}</a>. Сохраните прежнее значение поля <strong>{challenge.field==='affiliation'?'Affiliation / Принадлежность':'Organization / Организация'}</strong>, замените его кодом и сохраните профиль.</p>
      <p><code className="verification-code">{challenge.token}</code></p>
      <p className="field-help">Подтвердите код до {new Date(challenge.expiresAt).toLocaleString('ru-RU')}. {challenge.keepProof?'Оставьте код в поле, пока аккаунт подключён: он проверяется при каждом обновлении.':'После успешной проверки можно вернуть прежнее значение.'} Проверка подтверждает контроль над аккаунтом, а не паспортную личность или отсутствие списывания.</p>
      <div className="integration-actions"><button className="button secondary compact" disabled={busy||!enabled||!consent} onClick={()=>void verify()}>Я сохранил код — проверить</button>
        <button className="button secondary compact" disabled={busy} onClick={()=>void cancel()}>Отменить подключение</button></div>
    </>}
    {busy&&<p role="status">Проверяем {provider.name}…</p>}{error&&<p className="form-error" role="alert">{error}</p>}
  </div>;
}
