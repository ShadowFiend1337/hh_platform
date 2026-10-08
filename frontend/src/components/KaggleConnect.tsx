import { useEffect, useState } from 'react';
import { integrationRequest, type IntegrationJob } from '../integrations-api';

export function KaggleConnect({accountId,consent,approved,enabled,onConnected}:{accountId:string;consent:boolean;approved:boolean;enabled:boolean;onConnected:(job:IntegrationJob)=>void}) {
  const [token,setToken]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [controller]=useState(()=>new AbortController());
  useEffect(()=>()=>controller.abort(),[controller]);
  useEffect(()=>{if(!consent)setToken('');},[consent]);
  async function connect() {
    const apiToken=token.trim();setToken('');setBusy(true);setError('');
    try {
      const result=await integrationRequest<{job:IntegrationJob}>('/api/integrations/kaggle/connect','POST',{consent:approved,apiToken},accountId,controller.signal);
      if(!controller.signal.aborted)onConnected(result.job);
    } catch(cause) {if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Не удалось подключить Kaggle.');}
    finally {if(!controller.signal.aborted)setBusy(false);}
  }
  return <div className="codeforces-connect">
    <p className="field-help">Позиции команд в публичных таблицах соревнований. Итоговые private leaderboard и личный вклад требуют отдельного подтверждения.</p>
    <p className="field-help">Создайте API Token в <a href="https://www.kaggle.com/settings" target="_blank" rel="noopener noreferrer">настройках Kaggle</a> и вставьте сам токен. Аккаунт определится по ответу Kaggle. Токен хранится зашифрованным для обновлений; отключение удалит его из платформы. Отозвать доступ у Kaggle можно в его настройках.</p>
    <label className="field"><span>API-токен Kaggle</span><input type="password" autoComplete="off" maxLength={4096} value={token} onChange={event=>setToken(event.target.value)} placeholder="API Token из настроек Kaggle" /></label>
    <button className="button secondary compact" disabled={busy||!enabled||!consent||!approved||!token.trim()} onClick={()=>void connect()}>Подключить Kaggle</button>
    {busy&&<p role="status">Проверяем Kaggle…</p>}{error&&<p className="form-error" role="alert">{error}</p>}
  </div>;
}
