import assert from 'node:assert/strict';
import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';
import { chromium } from 'playwright';
import { createAssessmentServer } from '../../server/server.mjs';
import { CodeforcesProvider } from '../../server/integrations/codeforces.mjs';
import { createInitialState } from '../src/model.ts';

const codes=new Map(),seconds=Math.floor(Date.now()/1000),user={handle:'FixtureCoder',registrationTimeSeconds:1500000000,organization:'Fixture university',rating:1500,maxRating:1600};
const provider=new CodeforcesProvider({}, {spacingMs:0,fetcher:async url=>{
  const path=new URL(url).pathname;
  if(path==='/api/user.info')return Response.json({status:'OK',result:[{...user}]});
  if(path==='/api/user.rating')return Response.json({status:'OK',result:Array.from({length:8},(_,i)=>({handle:user.handle,contestId:1000+i,contestName:'Fixture Codeforces Round '+(i+1),rank:42,oldRating:1450,newRating:1500,ratingUpdateTimeSeconds:seconds-86400*(i+1)}))});
  if(path==='/api/user.status')return Response.json({status:'OK',result:[{id:1,creationTimeSeconds:seconds-100,verdict:'OK',problem:{contestId:1000,index:'A'},author:{members:[{handle:user.handle}]}}]});
  throw new Error('Unexpected fixture URL');
}});
const app=createAssessmentServer({dbPath:':memory:',authEnv:{},authMailer:async({email,code})=>codes.set(email,code),integrationOptions:{automatic:false,providers:[provider]}});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),employer=await browser.newContext();
  async function register(ctx,login,role){const email=login+'@example.invalid';assert.equal((await ctx.request.post(base+'/api/auth/register/request-code',{data:{email,login,role,password:'browser fixture password',consent:true,privacyVersion:PRIVACY_POLICY_VERSION,...(role==='candidate'?{name:'Кандидат Codeforces'}:{companyName:'Компания'})}})).status(),202);const verified=await ctx.request.post(base+'/api/auth/register/verify',{data:{email,code:codes.get(email)}});assert.equal(verified.status(),201);return (await verified.json()).account;}
  const account=await register(context,'codeforces-candidate','candidate');await register(employer,'codeforces-employer','employer');
  const state=createInitialState(),survey={id:'codeforces-browser-survey',date:new Date().toISOString(),industry:'ИТ',professionalRole:'Frontend разработчик',specialization:'Frontend',desiredGrade:'Junior',experience:'1 год',stack:['React'],softSkills:[]};
  Object.assign(state.profile,survey,{id:'candidate-anna',name:'Кандидат Codeforces',email:account.email,consent:true,visible:true,surveyCompletedAt:survey.date});state.surveys=[survey];
  async function save(){const snapshot=await context.request.get(base+'/api/platform/state'),payload=await snapshot.json();assert.equal((await context.request.put(base+'/api/platform/state',{headers:{'X-Platform-Identity':snapshot.headers()['x-platform-identity']},data:{state,baseRevision:payload.revision}})).status(),200);}
  await save();
  const started=await context.request.post(base+'/api/assessment/attempts',{data:{survey,vacancyDescription:''}}),attempt=await started.json(),internal=app.store.get(attempt.id).attempt;
  const response=await context.request.post(base+`/api/assessment/attempts/${attempt.id}/submit`,{data:{token:attempt.token,answers:internal.questions.map(q=>({questionId:q.id,optionId:q.correctOptionId}))}}),result=await response.json();assert(result.passed);
  state.history=[result];state.profile.confirmed={specialization:result.specialization,grade:result.grade,score:result.score,date:result.date,surveyId:survey.id};await save();
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/app?role=candidate&tab=profile');
  const panel=page.locator('.integration-panel'),source=panel.locator('.integration-source').filter({has:page.getByRole('heading',{name:'Codeforces',exact:true})});
  await source.getByLabel('Ник Codeforces').fill(user.handle);assert(await source.getByRole('button',{name:'Подключить Codeforces'}).isDisabled());
  await panel.getByRole('checkbox',{name:/Согласен на получение и хранение моих достижений/u}).check();await source.getByRole('button',{name:'Подключить Codeforces'}).click();
  await source.locator('.verification-code').waitFor();await source.getByRole('button',{name:'Я сохранил код — проверить'}).click();await source.getByRole('alert').filter({hasText:'Код не найден'}).waitFor();
  assert.equal((await (await context.request.get(base+'/api/profile/evidence')).json()).items.length,0);
  // Simulate the owner changing their external profile, never edit a real account.
  user.organization=await source.locator('.verification-code').innerText();await source.getByRole('button',{name:'Я сохранил код — проверить'}).click();
  await source.getByText(user.handle+' · Аккаунт подтверждён',{exact:true}).waitFor();await panel.getByText('Обновление завершено: получено записей — 10',{exact:true}).waitFor();
  assert.equal(await panel.locator('.evidence-list .achievement').count(),5);await panel.getByRole('button',{name:'Показать ещё 5 · всего 10'}).click();await panel.getByText('Fixture Codeforces Round 8',{exact:true}).waitFor();assert.equal(await panel.locator('.evidence-list .achievement').count(),10);
  const evidence=await (await context.request.get(base+'/api/profile/evidence')).json();assert.equal(evidence.items.length,10);assert(evidence.items.every(x=>x.verificationMethod==='profile_challenge'));
  const connection=app.integrations.db.prepare("SELECT * FROM integration_connections WHERE provider='codeforces'").get(),directory=app.directory.store.forOwner(connection.owner);assert.equal(directory.fsp,0);
  const publicResponse=await employer.request.get(base+'/api/directory/'+directory.id+'/evidence');assert.equal(publicResponse.status(),200);const publicEvidence=await publicResponse.json();assert.equal(publicEvidence.items.length,10);assert(!JSON.stringify(publicEvidence).includes(user.organization));assert(publicEvidence.items.every(x=>x.externalRecordId===undefined));
  assert.equal((await (await context.request.get(base+'/api/platform/state')).json()).state.profile.confirmed.grade,'Junior');
  await page.screenshot({path:'/tmp/hh-codeforces-connected.png',fullPage:true});
  user.organization='Fixture university';await source.getByRole('button',{name:'Обновить',exact:true}).click();await panel.getByText('Обновление завершено: получено записей — 10',{exact:true}).waitFor();
  await source.getByRole('button',{name:'Отключить и удалить данные'}).click();await source.getByLabel('Ник Codeforces').waitFor();assert.equal((await (await context.request.get(base+'/api/profile/evidence')).json()).items.length,0);
  assert.deepEqual(errors,[]);console.log('Codeforces browser flow passed: consent, incorrect proof, verification, import, employer privacy, grade unchanged, sync and disconnect.');
}catch(e){for(const c of browser?.contexts()||[])for(const p of c.pages())console.error(p.url(),(await p.locator('body').innerText()).slice(-5000));throw e;}finally{await browser?.close();await new Promise(resolve=>{app.server.close(resolve);app.server.closeAllConnections();});}
