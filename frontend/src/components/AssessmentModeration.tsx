import { useEffect, useState } from 'react';
import { claimRequest } from '../claims-api';
import type { AssessmentQuestion } from '../assessment';
import { specializationNames, type TestResult } from '../model';

interface QueueItem { id: string; status: string; version: number; submittedAt: string; specialization: keyof typeof specializationNames; grade: string; closedCorrect: number; candidate: { login: string }; selfReview: boolean }
interface ReviewQuestion extends AssessmentQuestion { correctOptionId?: string; explanation?: string; caseId: string; referenceAnswer?: string; rubric?: { id: string; expected: string; scale: Record<string,string> }[] }
interface CaseProof { sourceUrl: string; sourceRefs: {url:string;sourceId:string;title:string;limitation?:string}[]; content: { solution: string; equivalence: {rationale:string;risks:string[]} }; passport: { intent:string; solutionPath:unknown; grade:string; difficulty:{rationale:string} } }
interface Detail extends QueueItem { questions: ReviewQuestion[]; answers: Record<string,{optionId?:string;answerText?:string;late:boolean}>; cases: Record<string,CaseProof>; result: TestResult; requiredChecks: string[]; note: string; marks: {questionId:string;criteria:{criterionId:string;score:number}[];comment:string}[]; contentChecks:Record<string,boolean>; reviewerId:string|null; reviewedAt:string|null }
const labels: Record<string,string> = {solutionCorrect:'Эталонные решения и ключи правильные',sameReasoning:'Путь решения исходных кейсов сохранён',gradeAppropriate:'Задания соответствуют указанному грейду',similarWorkload:'Объём работы сопоставим с исходными задачами',unambiguous:'Условия и варианты ответа однозначны'};

export function AssessmentModeration({accountId}:{accountId:string}) {
  const [status,setStatus] = useState('pending'), [offset,setOffset] = useState(0), [revision,setRevision] = useState(0);
  const [items,setItems] = useState<QueueItem[]>([]), [total,setTotal] = useState(0), [detail,setDetail] = useState<Detail|null>(null);
  const [scores,setScores] = useState<Record<string,number>>({}), [comments,setComments] = useState<Record<string,string>>({}), [checks,setChecks] = useState<Record<string,boolean>>({});
  const [decision,setDecision] = useState('grade'), [note,setNote] = useState(''), [busy,setBusy] = useState(false), [error,setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();setError('');setDetail(null);
    claimRequest<{items:QueueItem[];total:number}>(`/api/moderation/assessments?status=${status}&limit=20&offset=${offset}`,'GET',undefined,accountId,controller.signal)
      .then(value => {if(!controller.signal.aborted){setItems(value.items);setTotal(value.total);}})
      .catch(cause => {if(!controller.signal.aborted)setError(cause.message);});
    return () => controller.abort();
  },[accountId,status,offset,revision]);
  async function inspect(id:string) {
    setBusy(true);setError('');
    try {const value = await claimRequest<Detail>('/api/moderation/assessments/'+id,'GET',undefined,accountId);
      setDetail(value);setScores(Object.fromEntries(value.marks.flatMap(m=>m.criteria.map(c=>[m.questionId+':'+c.criterionId,c.score]))));
      setComments(Object.fromEntries(value.marks.map(m=>[m.questionId,m.comment])));setChecks(value.contentChecks);setDecision('grade');setNote(value.note || '');
    } catch(cause){setError(cause instanceof Error ? cause.message : 'Тест недоступен.');}finally{setBusy(false);}
  }
  async function submit() {
    if(!detail)return;setBusy(true);setError('');
    try {
      await claimRequest('/api/moderation/assessments/'+detail.id+'/decision','POST',{version:detail.version,decision,note,
        ...(decision === 'grade' ? {contentChecks:checks,marks:detail.questions.filter(q=>q.type==='open').map(q=>({questionId:q.id,comment:comments[q.id] || '',criteria:q.rubric!.map(c=>({criterionId:c.id,score:scores[q.id+':'+c.id]}))}))} : {})},accountId);
      setDetail(null);setRevision(v=>v+1);
    } catch(cause){setError(cause instanceof Error ? cause.message : 'Решение не сохранено.');}finally{setBusy(false);}
  }
  const open = detail?.questions.filter(q=>q.type==='open') || [];
  const complete = detail?.requiredChecks.every(c=>checks[c]) && open.every(q=>q.rubric?.every(c=>Number.isInteger(scores[q.id+':'+c.id])));
  return <div className="moderation-layout"><section className="panel"><h2>Очередь тестов</h2>
    <label className="field"><span>Статус теста</span><select aria-label="Статус теста" value={status} onChange={e=>{setStatus(e.target.value);setOffset(0);}}><option value="pending">На проверке</option><option value="completed">Проверены</option><option value="invalidated">Отозваны</option></select></label>
    <button className="button secondary" onClick={()=>setRevision(v=>v+1)}>Обновить тесты</button><p role="status">Всего: {total}</p>
    {items.map(item=><article className="claim-card" key={item.id}><strong>{item.candidate.login}</strong><p>{specializationNames[item.specialization]} · {item.grade}</p><p>Закрытые: {item.closedCorrect}/15</p><button className="button secondary" disabled={busy} onClick={()=>void inspect(item.id)}>Проверить тест</button></article>)}
    <div className="button-group"><button className="text-button" disabled={!offset} onClick={()=>setOffset(v=>v-20)}>Назад</button><button className="text-button" disabled={offset+20>=total} onClick={()=>setOffset(v=>v+20)}>Следующие</button></div>
  </section><section className="panel moderation-detail"><h2>Ручная проверка</h2>{error&&<p role="alert" className="form-error">{error}</p>}
    {!detail ? <p>Выберите тест из очереди.</p> : <><p>{detail.candidate.login} · {detail.grade}. Веса закрытой и открытой частей — 50/50. Итог вычисляет сервер.</p>
      <p className="field-help">Обоснование LLM — гипотеза. Проверьте условия, решения и грейд самостоятельно. Статистическая эквивалентность сложности пока не подтверждена.</p>
      {detail.questions.map((q,i)=>{const a=detail.answers[q.id], proof=detail.cases[q.caseId];return <details key={q.id} open={q.type==='open'}><summary>{i+1}. {q.topic} · {q.type==='open'?'Открытый ответ':'Закрытый вопрос'}</summary>
        {q.context&&<p style={{whiteSpace:'pre-wrap'}}>{q.context}</p>}<h3 style={{whiteSpace:'pre-wrap'}}>{q.text}</h3>
        {q.type==='open' ? <><h4>Ответ кандидата{a.late?' — просрочен':''}</h4><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{a.answerText || 'Пропущено'}</pre><h4>Эталон</h4><pre style={{whiteSpace:'pre-wrap'}}>{q.referenceAnswer}</pre>
          {q.rubric?.map(c=><label className="field" key={c.id}><span>{c.expected}</span><select aria-label={`Оценка ${i+1} ${c.id}`} disabled={detail.status!=='pending'||busy||detail.selfReview} value={scores[q.id+':'+c.id] ?? ''} onChange={e=>setScores(v=>({...v,[q.id+':'+c.id]:Number(e.target.value)}))}><option value="" disabled>Выберите оценку</option>{[0,1,2].map(n=><option key={n} value={n}>{n} — {c.scale[String(n)] || (n===0?'Не выполнено':n===1?'Частично':'Полностью')}</option>)}</select></label>)}
          {detail.status==='pending'?<label className="field"><span>Комментарий кандидату к ответу</span><textarea rows={2} maxLength={2000} value={comments[q.id]||''} onChange={e=>setComments(v=>({...v,[q.id]:e.target.value}))}/></label>:comments[q.id]&&<p>{comments[q.id]}</p>}
        </> : <><ul>{q.options.map(o=><li key={o.id}>{o.text}{o.id===q.correctOptionId?' · правильный':''}{o.id===a.optionId?' · ответ кандидата':''}</li>)}</ul><p>{a.late?'Ответ просрочен. ':''}{!a.optionId?'Пропущено. ':''}{q.explanation}</p></>}
        <details><summary>Источники и обоснование сложности</summary><p>Исходный грейд: {proof.passport.grade}. {proof.passport.difficulty.rationale}</p>{proof.sourceRefs.map(source=><p key={source.sourceId}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>{source.limitation&&<span className="field-help"> · Авторский кейс по материалам источника; не дословное упражнение.</span>}</p>)}<p>{proof.passport.intent}</p><pre style={{whiteSpace:'pre-wrap'}}>{typeof proof.passport.solutionPath === 'string' ? proof.passport.solutionPath : JSON.stringify(proof.passport.solutionPath,null,2)}</pre><p>{proof.content.equivalence.rationale}</p><p>Риски: {proof.content.equivalence.risks.join('; ')}</p></details>
      </details>;})}
      {detail.selfReview&&<p role="alert">Собственный тест должен проверить другой модератор.</p>}
      {detail.status==='pending'&&!detail.selfReview&&<><label className="field"><span>Решение по тесту</span><select value={decision} onChange={e=>setDecision(e.target.value)}><option value="grade">Оценить ответы</option><option value="invalidate">Отозвать: ошибка в заданиях</option></select></label>
        {decision==='grade'&&detail.requiredChecks.map(c=><label className="checkbox-field" key={c}><input type="checkbox" checked={!!checks[c]} onChange={e=>setChecks(v=>({...v,[c]:e.target.checked}))}/><span>{labels[c] || c}</span></label>)}
        <label className="field"><span>Комментарий кандидату / причина отзыва</span><textarea rows={3} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/></label>
        <button className="button primary" disabled={busy||(decision==='grade'?!complete:note.trim().length<10)} onClick={()=>void submit()}>Сохранить проверку</button>
      </>}{detail.status!=='pending'&&<p>Проверено: {detail.reviewedAt ? new Date(detail.reviewedAt).toLocaleString('ru-RU') : '—'} · Модератор {detail.reviewerId}. Решение: {detail.status==='invalidated'?'отозвано':`${detail.result.score}/100`}. {detail.note}</p>}
    </>}
  </section></div>;
}
