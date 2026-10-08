import assert from 'node:assert/strict';
import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { createAssessmentServer } from '../../server/server.mjs';
import { AtCoderProvider } from '../../server/integrations/atcoder.mjs';
import { KaggleProvider } from '../../server/integrations/kaggle.mjs';
import { GitHubProvider } from '../../server/integrations/github.mjs';
import { createInitialState } from '../src/model.ts';

const codes=new Map(),day=new Date(Date.now()-86400000).toISOString(),token='KGAT_browser_fixture_'+'a'.repeat(40);
let affiliation='Fixture university',base;
const atcoder=new AtCoderProvider({}, {spacingMs:0,fetcher:async url=>new URL(url).pathname.endsWith('/history/json')
  ?Response.json([{IsRated:true,Place:12,OldRating:800,NewRating:1000,ContestScreenName:'abc999.contest.atcoder.jp',ContestName:'AtCoder browser fixture',EndTime:day}])
  :new Response(`<h3><a href="/users/FixtureCoder" class="username"><span>FixtureCoder</span></a></h3><tr><th>Affiliation</th><td>${affiliation}</td></tr>`)});
const kaggle=new KaggleProvider({}, {spacingMs:0,fetcher:async(url,options)=>{
  const method=new URL(url).pathname.split('/').at(-1),body=JSON.parse(options.body);
  if(method==='IntrospectToken')return Response.json(body.token===token?{active:true,userId:42,username:'fixture-kaggler'}:{active:false});
  if(method==='ListCompetitions')return Response.json({competitions:[{id:1,ref:'public-browser-fixture',userHasEntered:true,userRank:7}],nextPageToken:''});
  if(method==='GetCompetition'){assert.equal(options.headers.Authorization,undefined);return Response.json({id:1,ref:'public-browser-fixture',title:'Kaggle browser competition'});}
  throw new Error('Unexpected Kaggle fixture request');
}});
const github=new GitHubProvider({GITHUB_CLIENT_ID:'browser-fixture',GITHUB_CLIENT_SECRET:'fixture-secret',GITHUB_REDIRECT_URI:'http://127.0.0.1:8787/api/integrations/github/callback',INTEGRATION_ENCRYPTION_KEY:'1'.repeat(64)}, {spacingMs:0,fetcher:async url=>{
  const uri=new URL(url);
  if(uri.origin==='https://github.com')return Response.json({access_token:'gho_browser_fixture',token_type:'bearer'});
  if(uri.pathname==='/user')return Response.json({id:42,login:'fixture-user',type:'User'});
  if(uri.pathname.endsWith('/repos'))return Response.json([{id:1,name:'browser-project',owner:{id:42},private:false,fork:false,updated_at:day,stargazers_count:5,language:'TypeScript'}]);
  if(uri.pathname==='/search/issues')return Response.json({incomplete_results:false,total_count:1,items:[{id:99,number:7,user:{id:42},repository_url:'https://api.github.com/repos/fixture-org/public-project'}]});
  if(uri.pathname.endsWith('/pulls/7'))return Response.json({id:99,number:7,user:{id:42},base:{repo:{private:false,full_name:'fixture-org/public-project'}},title:'Browser fixture contribution',merged_at:day});
  throw new Error('Unexpected GitHub fixture request');
}});
const oauth=createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');assert.equal(url.pathname,'/authorize');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  const redirect=new URL('/api/integrations/github/callback',base);redirect.search=new URLSearchParams({code:'browser-code',state:url.searchParams.get('state')}).toString();
  res.writeHead(302,{Location:redirect.href});res.end();
});
await new Promise(resolve=>oauth.listen(0,'127.0.0.1',resolve));
const originalAuthorize=github.authorize.bind(github);github.authorize=input=>{const real=new URL(originalAuthorize(input));return 'http://localhost:'+oauth.address().port+'/authorize'+real.search;};
const app=createAssessmentServer({dbPath:':memory:',authEnv:{},authMailer:async({email,code})=>codes.set(email,code),integrationOptions:{automatic:false,providers:[atcoder,kaggle,github]}});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+app.server.address().port;github.redirectUri=base+'/api/integrations/github/callback';let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),employer=await browser.newContext();
  async function register(ctx,login,role){const email=login+'@example.invalid';assert.equal((await ctx.request.post(base+'/api/auth/register/request-code',{data:{email,login,role,password:'browser fixture password',consent:true,privacyVersion:PRIVACY_POLICY_VERSION,...(role==='candidate'?{name:'Кандидат интеграций'}:{companyName:'Компания'})}})).status(),202);const verified=await ctx.request.post(base+'/api/auth/register/verify',{data:{email,code:codes.get(email)}});assert.equal(verified.status(),201);return(await verified.json()).account;}
  const account=await register(context,'external-candidate','candidate');await register(employer,'external-employer','employer');
  const state=createInitialState(),survey={id:'external-browser-survey',date:new Date().toISOString(),industry:'ИТ',professionalRole:'Frontend разработчик',specialization:'Frontend',desiredGrade:'Junior',experience:'1 год',stack:['React'],softSkills:[]};
  Object.assign(state.profile,survey,{id:'candidate-anna',name:'Кандидат интеграций',email:account.email,consent:true,visible:true,surveyCompletedAt:survey.date});state.surveys=[survey];
  async function save(){const snapshot=await context.request.get(base+'/api/platform/state'),payload=await snapshot.json();assert.equal((await context.request.put(base+'/api/platform/state',{headers:{'X-Platform-Identity':snapshot.headers()['x-platform-identity']},data:{state,baseRevision:payload.revision}})).status(),200);}
  await save();
  const attempt=await(await context.request.post(base+'/api/assessment/attempts',{data:{survey,vacancyDescription:''}})).json(),internal=app.store.get(attempt.id).attempt;
  const result=await(await context.request.post(base+`/api/assessment/attempts/${attempt.id}/submit`,{data:{token:attempt.token,answers:internal.questions.map(q=>({questionId:q.id,optionId:q.correctOptionId}))}})).json();assert(result.passed);
  state.history=[result];state.profile.confirmed={specialization:result.specialization,grade:result.grade,score:result.score,date:result.date,surveyId:survey.id};await save();
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/app?role=candidate&tab=profile');
  const panel=page.locator('.integration-panel'),source=name=>panel.locator('.integration-source').filter({has:page.getByRole('heading',{name,exact:true})}),consent=()=>panel.getByRole('checkbox',{name:/Согласен на получение и хранение моих достижений/u}).check();
  await source('AtCoder').getByLabel('Ник AtCoder').fill('FixtureCoder');assert(await source('AtCoder').getByRole('button',{name:'Подключить AtCoder'}).isDisabled());await consent();
  await source('AtCoder').getByRole('button',{name:'Подключить AtCoder'}).click();await source('AtCoder').locator('.verification-code').waitFor();
  await source('AtCoder').getByRole('button',{name:'Я сохранил код — проверить'}).click();await source('AtCoder').getByRole('alert').filter({hasText:'Код не найден'}).waitFor();
  affiliation=await source('AtCoder').locator('.verification-code').innerText();await source('AtCoder').getByRole('button',{name:'Я сохранил код — проверить'}).click();
  await source('AtCoder').getByText('FixtureCoder · Аккаунт подтверждён',{exact:true}).waitFor();await panel.getByText('Обновление завершено: получено записей — 2',{exact:true}).waitFor();
  await consent();await source('Kaggle').getByLabel('API-токен Kaggle').fill('KGAT_invalid_browser_'+'a'.repeat(40));await source('Kaggle').getByRole('button',{name:'Подключить Kaggle'}).click();await source('Kaggle').getByRole('alert').filter({hasText:'Kaggle не подтвердил'}).waitFor();assert.equal(await source('Kaggle').getByLabel('API-токен Kaggle').inputValue(),'');
  await source('Kaggle').getByLabel('API-токен Kaggle').fill(token);await source('Kaggle').getByRole('button',{name:'Подключить Kaggle'}).click();await source('Kaggle').getByText('fixture-kaggler · Аккаунт подтверждён',{exact:true}).waitFor();await panel.getByText('Обновление завершено: получено записей — 1',{exact:true}).waitFor();
  await consent();await source('GitHub').getByRole('button',{name:'Подключить',exact:true}).click();await page.waitForURL(base+'/app?role=candidate&tab=profile');
  await source('GitHub').getByText('fixture-user · Аккаунт подтверждён',{exact:true}).waitFor();await panel.getByText('Принятый PR: Browser fixture contribution',{exact:true}).waitFor();
  const data=await(await context.request.get(base+'/api/profile/evidence')).json();assert.equal(data.items.length,5);assert(!JSON.stringify(data).includes(token));assert(!JSON.stringify(data).includes('gho_browser_fixture'));
  const owner=app.integrations.db.prepare("SELECT owner FROM integration_connections WHERE provider='github'").get().owner,directory=app.directory.store.forOwner(owner);assert.equal(directory.fsp,0);
  const publicData=await(await employer.request.get(base+'/api/directory/'+directory.id+'/evidence')).json();assert.equal(publicData.items.length,5);assert(publicData.items.every(x=>x.externalRecordId===undefined));assert(!JSON.stringify(publicData).includes(affiliation));
  assert.equal((await(await context.request.get(base+'/api/platform/state')).json()).state.profile.confirmed.grade,'Junior');
  await page.screenshot({path:'/tmp/hh-external-providers-connected.png',fullPage:true});
  for(const name of ['AtCoder','Kaggle','GitHub']){await source(name).getByRole('button',{name:'Обновить',exact:true}).click();await panel.getByText('Обновление завершено: получено записей — '+(name==='Kaggle'?1:2),{exact:true}).waitFor();}
  for(const name of ['AtCoder','Kaggle','GitHub'])await source(name).getByRole('button',{name:'Отключить и удалить данные'}).click();
  await source('AtCoder').getByLabel('Ник AtCoder').waitFor();await source('Kaggle').getByLabel('API-токен Kaggle').waitFor();await source('GitHub').getByRole('button',{name:'Подключить',exact:true}).waitFor();assert.equal((await(await context.request.get(base+'/api/profile/evidence')).json()).items.length,0);
  assert.deepEqual(errors,[]);console.log('External providers browser flow passed: AtCoder proof, Kaggle token validation, GitHub Strict-cookie OAuth callback, imports, employer privacy, grade unchanged, sync and removal.');
}catch(e){for(const c of browser?.contexts()||[])for(const p of c.pages())console.error(p.url(),(await p.locator('body').innerText()).slice(-5000));throw e;}
finally{await browser?.close();await Promise.all([app.server,oauth].map(server=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})));}
