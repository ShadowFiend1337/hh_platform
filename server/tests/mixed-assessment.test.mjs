import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAssessmentServer } from '../server.mjs';
import { createMixedDraft, mixedProgramInfo, MixedAssessmentPreparation } from '../mixed-assessment.mjs';
import { assessmentContentChecks } from '../assessment-review.mjs';
import { recordAnswer, retakeLock } from '../assessment.mjs';
import { specializationOptions } from '../../shared/catalog.ts';
import { gradeOptions } from '../../shared/grading.ts';
import { createInitialState } from '../../frontend/src/model.ts';
import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';
import { mixedLlm } from './fixtures/mixed-llm.mjs';

const survey=(specialization='DataAnalysis',desiredGrade='Middle')=>({id:randomUUID(),date:new Date().toISOString(),industry:'ИТ',professionalRole:'Аналитик',specialization,desiredGrade,experience:'3 года',stack:['SQL','Python'],softSkills:[]});
async function fixture(t, overrides={}) {
  const codes=new Map(),llm=mixedLlm();let time=Date.now();
  const service=createAssessmentServer({dbPath:':memory:',authEnv:{},llm,now:()=>time,integrationOptions:{automatic:false},authMailer:async({email,code})=>codes.set(email,code),...overrides});
  await new Promise(r=>service.server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>{service.server.close(r);service.server.closeAllConnections();}));
  const base='http://127.0.0.1:'+service.server.address().port;
  async function client(role='candidate') {
    const cookies=new Map();let account;
    const request=async(path,method='GET',input,headers={})=>{
      const response=await fetch(base+path,{method,headers:{Origin:base,Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),...(input?{'Content-Type':'application/json'}:{}),...headers},body:input?JSON.stringify(input):undefined});
      for(const c of response.headers.getSetCookie()){const [k,v]=c.split(';')[0].split('=');cookies.set(k,v);}
      return {status:response.status,data:await response.json()};
    };
    const login='mixed.'+randomUUID().slice(0,8),email=login+'@example.invalid';
    assert.equal((await request('/api/auth/register/request-code','POST',{role,login,email,password:'Mixed fixture password 2026!',consent:true,privacyVersion:PRIVACY_POLICY_VERSION,...(role==='candidate'?{name:'Тестовый кандидат'}:{companyName:'Проверка тестов'})})).status,202);
    const registered=await request('/api/auth/register/verify','POST',{email,code:codes.get(email)});assert.equal(registered.status,201);account=registered.data.account;
    return {request,account};
  }
  return {service,llm,client,advance:ms=>{time+=ms;}};
}
async function prepared(f,candidate,grade='Middle') {
  const existing=await candidate.request('/api/platform/state'),snapshot=survey('DataAnalysis',grade),state=existing.data.state || createInitialState();
  Object.assign(state.profile,snapshot,{id:'candidate-'+candidate.account.id,name:'Тестовый кандидат',email:candidate.account.email,consent:true,visible:true,surveyCompletedAt:snapshot.date});state.surveys=[snapshot,...state.surveys];
  const initial=await candidate.request('/api/platform/state','PUT',{state,baseRevision:existing.data.revision},{'X-Platform-Identity':'auth:'+candidate.account.id});assert.equal(initial.status,200,JSON.stringify(initial.data));
  const created=await candidate.request('/api/assessment/attempts','POST',{survey:snapshot});assert.equal(created.status,202,JSON.stringify(created.data));
  const {id,token}=created.data,path='/api/assessment/attempts/'+id;
  for(let i=0;i<100&&f.service.store.get(id).attempt.state==='preparing';i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(f.service.store.get(id).attempt.state,'ready');
  assert.equal((await candidate.request(path,'GET',undefined,{'X-Attempt-Token':token})).data.questions.length,0);
  f.advance(60000);
  const started=await candidate.request(path+'/start','POST',{token});assert.equal(started.status,200);
  assert.equal(started.data.position,0);assert.equal(started.data.questions.length,1);
  assert.equal((await candidate.request(path+'/start','POST',{token})).status,409);
  return {id,token,path,public:started.data};
}
async function solved(f,candidate,attempt,closedCorrect=15) {
  const privateAttempt=f.service.store.get(attempt.id).attempt;
  assert.equal(privateAttempt.questions.length,20);let closedIndex=0;
  for(const q of privateAttempt.questions){
    const input=q.type==='open'?{answerText:'SELECT count(*) FROM events;\nПояснение решения и проверка результата.'}:{optionId:closedIndex++<closedCorrect?q.correctOptionId:q.options.find(o=>o.id!==q.correctOptionId).id};
    const saved=await candidate.request(attempt.path+'/answer','POST',{token:attempt.token,questionId:q.id,...input});assert.equal(saved.status,200,JSON.stringify(saved.data));
    const exposed=JSON.stringify(saved.data);assert(!exposed.includes('referenceAnswer'));assert(!exposed.includes('correctOptionId'));assert(!exposed.includes('equivalence'));assert(!exposed.includes('rubric'));
  }
  const submitted=await candidate.request(attempt.path+'/submit','POST',{token:attempt.token});assert.equal(submitted.status,200);assert.equal(submitted.data.status,'pending-review');assert.equal(submitted.data.passed,false);
  return submitted.data;
}
const decision=(detail,score=1)=>({version:detail.version,decision:'grade',note:'Проверка завершена.',contentChecks:Object.fromEntries(assessmentContentChecks.map(k=>[k,true])),marks:detail.questions.filter(q=>q.type==='open').map(q=>({questionId:q.id,criteria:q.rubric.map(c=>({criterionId:c.id,score}))}))});

test('mixed blueprints cover every specialty and grade with exactly 15 closed and 5 open',()=>{
  for(const {value:spec} of specializationOptions)for(const {value:grade} of gradeOptions){
    const draft=createMixedDraft(survey(spec,grade));assert.equal(draft.generation.slots.length,13);
    assert.equal(draft.generation.slots.filter(s=>s.kind==='single-choice').reduce((sum,s)=>sum+s.count,0),15);
    assert.equal(draft.generation.slots.filter(s=>s.kind==='open').length,5);
    const program=mixedProgramInfo(spec,grade,mixedLlm(),{});assert.equal(program.questionCount,20);assert.deepEqual(program.weights,{closed:.5,open:.5});assert(program.topics.length>=3);
  }
});
test('generated mixed flow: locked text, private moderation, 50/50 final score and idempotence',async t=>{
  const f=await fixture(t),candidate=await f.client(),outsider=await f.client(),moderator=await f.client('employer');
  f.service.auth.store.setModerator(moderator.account.id,true,'fixture');
  const attempt=await prepared(f,candidate);assert.equal(f.llm.calls,13);
  const row=f.service.store.get(attempt.id),future=row.attempt.questions[1];
  assert.equal((await candidate.request(attempt.path+'/answer','POST',{token:attempt.token,questionId:future.id,optionId:future.correctOptionId})).status,409);
  assert.equal((await candidate.request(attempt.path+'/submit','POST',{token:attempt.token,answers:[]})).status,400);
  assert.equal((await candidate.request(attempt.path+'/submit','POST',{token:attempt.token})).status,400);
  const pending=await solved(f,candidate,attempt);assert.equal(pending.closedScore,100);
  assert.equal((await candidate.request('/api/assessment/results/'+attempt.id)).data.status,'pending-review');
  assert.equal((await outsider.request('/api/assessment/results/'+attempt.id)).status,404);
  assert.equal((await candidate.request('/api/moderation/assessments')).status,403);
  assert.equal(retakeLock(f.service.store.completed(row.owner),row.attempt.specialization,row.attempt.grade,Date.now(),7),null);
  assert.equal((await candidate.request(attempt.path+'/submit','POST',{token:attempt.token})).data.status,'pending-review');
  const queue=await moderator.request('/api/moderation/assessments');assert.equal(queue.data.total,1);
  const detail=(await moderator.request('/api/moderation/assessments/'+attempt.id)).data;
  assert(detail.questions[15].referenceAnswer);assert(Object.values(detail.cases).every(c=>c.sourceUrl&&c.content.equivalence.rationale));
  const url='/api/moderation/assessments/'+attempt.id+'/decision',headers={'X-Platform-Identity':'auth:'+moderator.account.id};
  assert.equal((await moderator.request(url,'POST',{...decision(detail),score:100},headers)).status,400);
  assert.equal((await moderator.request(url,'POST',{...decision(detail),marks:[]},headers)).status,400);
  const graded=await moderator.request(url,'POST',decision(detail),headers);assert.equal(graded.status,200);assert.equal(graded.data.result.score,75);assert.equal(graded.data.result.passed,true);assert.equal(graded.data.result.openScore,50);
  assert.equal((await moderator.request(url,'POST',decision(detail),headers)).status,409);
  assert.equal((await candidate.request('/api/assessment/results/'+attempt.id)).data.score,75);
  const fresh = (await candidate.request('/api/platform/state')).data;
  assert.equal(fresh.state.history[0].status,'completed');assert.equal(fresh.state.profile.confirmed.score,75,'Server confirms the reviewed pass without another candidate save');
  f.service.auth.store.setModerator(moderator.account.id,false,'fixture');assert.equal((await moderator.request('/api/moderation/assessments/'+attempt.id)).status,403);
  f.service.store.deleteOwner(row.owner);assert.equal(f.service.store.db.prepare('SELECT count(*) n FROM assessment_reviews').get().n,0);
});
test('closed answers alone do not confirm a grade; invalidation allows immediate retry; no self review',async t=>{
  const f=await fixture(t),candidate=await f.client(),moderator=await f.client('employer');f.service.auth.store.setModerator(moderator.account.id,true,'fixture');
  const a=await prepared(f,candidate);await solved(f,candidate,a);
  f.service.auth.store.setModerator(candidate.account.id,true,'fixture');
  const detail=(await moderator.request('/api/moderation/assessments/'+a.id)).data,url='/api/moderation/assessments/'+a.id+'/decision';
  assert.equal((await candidate.request(url,'POST',decision(detail),{'X-Platform-Identity':'auth:'+candidate.account.id})).status,403);
  const graded=await moderator.request(url,'POST',decision(detail,0),{'X-Platform-Identity':'auth:'+moderator.account.id});assert.equal(graded.data.result.score,50);assert.equal(graded.data.result.passed,false);
  assert.equal((await candidate.request('/api/assessment/attempts','POST',{survey:survey()})).status,409);
  const other=await f.client(),b=await prepared(f,other);await solved(f,other,b);
  const invalid=await moderator.request('/api/moderation/assessments/'+b.id+'/decision','POST',{version:1,decision:'invalidate',note:'В условии задачи обнаружена неоднозначность.'},{'X-Platform-Identity':'auth:'+moderator.account.id});assert.equal(invalid.data.result.status,'invalidated');
  assert.equal((await other.request('/api/assessment/attempts','POST',{survey:survey()})).status,202);
});
test('no configured LLM: 503 with no attempt; rejected drafts fail preparation without a result',async t=>{
  const f=await fixture(t,{llm:{configured:false}}),candidate=await f.client();assert.equal((await candidate.request('/api/assessment/attempts','POST',{survey:survey()})).status,503);assert.equal(f.service.store.db.prepare('SELECT count(*) n FROM attempts').get().n,0);
  const g=await fixture(t,{llm:{configured:true,chat:async()=>({json:{invalid:true}})}}),actor=await g.client();
  const created=await actor.request('/api/assessment/attempts','POST',{survey:survey()});await new Promise(r=>setTimeout(r,10));
  assert.equal(g.service.store.get(created.data.id).attempt.state,'failed');assert.equal(g.service.store.get(created.data.id).result,null);assert.equal(g.service.preparation.jobs.size,0);
});
test('open answers are immutable, size limited, and late or skipped answers cannot receive points',async t=>{
  const f=await fixture(t),candidate=await f.client(),a=await prepared(f,candidate),row=f.service.store.get(a.id);
  let progress=row.progress;
  for(const q of row.attempt.questions.slice(0,15))progress=recordAnswer(row.attempt,progress,{questionId:q.id,optionId:q.correctOptionId}).progress;
  const q=row.attempt.questions[15];assert.throws(()=>recordAnswer(row.attempt,progress,{questionId:q.id,optionId:null}),e=>e.status===400);
  assert.throws(()=>recordAnswer(row.attempt,progress,{questionId:q.id,answerText:'я'.repeat(12001)}),e=>e.status===400);
  progress=recordAnswer(row.attempt,progress,{questionId:q.id,answerText:'SELECT 1;'}).progress;
  assert.equal(recordAnswer(row.attempt,progress,{questionId:q.id,answerText:'SELECT 1;'}).changed,false);
  assert.throws(()=>recordAnswer(row.attempt,progress,{questionId:q.id,answerText:'SELECT 2;'}),e=>e.status===409);
  for(const q of row.attempt.questions.slice(16))progress=recordAnswer(row.attempt,progress,{questionId:q.id,answerText:null}).progress;
  f.service.store.saveProgress(a.id,progress,row.progress);await candidate.request(a.path+'/submit','POST',{token:a.token});
  const moderator=await f.client('employer');f.service.auth.store.setModerator(moderator.account.id,true,'fixture');
  const detail=f.service.assessmentReviews.get(a.id,{...moderator.account,canModerate:true});assert.throws(()=>f.service.assessmentReviews.decide(a.id,decision(detail),{...moderator.account,canModerate:true}),e=>e.status===400);
});
test('restart marks an interrupted preparation failed; expired queued drafts make no paid calls',async t=>{
  const f=await fixture(t),draft=createMixedDraft(survey());
  f.service.store.insert(draft,'a'.repeat(64),'b'.repeat(64));
  const restarted=new MixedAssessmentPreparation({store:f.service.store,variants:f.service.variants,llm:f.llm});
  assert.equal(f.service.store.get(draft.id).attempt.state,'failed');assert.equal(f.llm.calls,0);restarted.close();
  const expired=createMixedDraft(survey(),'',[],Date.now()-21*60000);f.service.store.insert(expired,'a'.repeat(64),'b'.repeat(64));
  f.service.preparation.enqueue(expired);await new Promise(r=>setTimeout(r,10));assert.equal(f.service.store.get(expired.id).attempt.state,'failed');assert.equal(f.llm.calls,0);assert.equal(f.service.preparation.jobs.size,0);
});
test('preparation is not an active proctored test; ready start is atomic and resets the clock',async t=>{
  let release;const gate=new Promise(r=>{release=r;}),llm=mixedLlm(),chat=llm.chat.bind(llm);llm.chat=async options=>{await gate;return chat(options);};
  const f=await fixture(t,{llm}),candidate=await f.client();
  const created=await candidate.request('/api/assessment/attempts','POST',{survey:survey()}),{id,token}=created.data,path='/api/assessment/attempts/'+id,row=f.service.store.get(id);
  assert.equal(f.service.store.activeAttempt(row.owner,new Date().toISOString()),null);
  assert.equal((await candidate.request(path+'/integrity','POST',{token,event:{id:randomUUID(),kind:'focus_lost'}})).status,409);
  assert.equal((await candidate.request(path+'/start','POST',{token})).status,409);
  release();for(let i=0;i<100&&f.service.store.get(id).attempt.state==='preparing';i++)await new Promise(r=>setTimeout(r,10));
  const ready=f.service.store.get(id);f.advance(5*60000);
  const started=await candidate.request(path+'/start','POST',{token});assert.equal(started.status,200);assert(Date.parse(started.data.createdAt)>Date.parse(ready.attempt.createdAt));
  assert.equal(Object.keys(f.service.store.get(id).progress.revealedAt).length,1);assert.equal(f.service.store.activeAttempt(row.owner,started.data.serverNow).id,id);
});
test('automatic review publication preserves the category cooldown and ignores an outdated questionnaire',async t=>{
  const f=await fixture(t),candidate=await f.client(),moderator=await f.client('employer');f.service.auth.store.setModerator(moderator.account.id,true,'fixture');
  const headers={'X-Platform-Identity':'auth:'+moderator.account.id};
  async function grade(a,score){const detail=(await moderator.request('/api/moderation/assessments/'+a.id)).data;const result=await moderator.request('/api/moderation/assessments/'+a.id+'/decision','POST',decision(detail,score),headers);assert.equal(result.status,200);return result.data.result;}
  const first=await prepared(f,candidate);await solved(f,candidate,first);await grade(first,1);
  const senior=await prepared(f,candidate,'Senior');await solved(f,candidate,senior);assert.equal((await grade(senior,2)).passed,true);
  assert.equal((await candidate.request('/api/platform/state')).data.state.profile.confirmed.grade,'Middle','A 75-point Middle pass does not bypass the 90-day category cooldown');
  const other=await f.client(),stale=await prepared(f,other);await solved(f,other,stale);
  const old=(await other.request('/api/platform/state')).data,state=old.state,newSurvey=survey('DataAnalysis','Lead');state.surveys.unshift(newSurvey);Object.assign(state.profile,newSurvey,{surveyCompletedAt:newSurvey.date});
  assert.equal((await other.request('/api/platform/state','PUT',{state,baseRevision:old.revision},{'X-Platform-Identity':'auth:'+other.account.id})).status,200);
  await grade(stale,2);assert.equal((await other.request('/api/platform/state')).data.state.profile.confirmed,null,'A review does not overwrite a newer questionnaire category');
});
