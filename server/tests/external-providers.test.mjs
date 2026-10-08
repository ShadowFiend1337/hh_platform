import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectoryStore } from '../directory-store.mjs';
import { IntegrationService } from '../integrations/service.mjs';
import { AtCoderProvider } from '../integrations/atcoder.mjs';
import { KaggleProvider } from '../integrations/kaggle.mjs';
import { GitHubProvider } from '../integrations/github.mjs';
import { createInitialState } from '../../frontend/src/model.ts';

const time=Date.parse('2026-10-08T09:00:00Z'),now=()=>time,day=new Date(time-86400000).toISOString();
const ownerA='a'.repeat(64),ownerB='b'.repeat(64),status=n=>e=>e.status===n,code=c=>e=>e.code===c;
const apiToken='KGAT_fixture_secret_'+'a'.repeat(40);
const html=(handle,affiliation)=>`<h3><b>Rank</b><a href="/users/${handle}" class="username"><span>${handle}</span></a></h3><table class="dl-table"><tr><th class="no-break">Affiliation</th><td class="break-all">${affiliation}</td></tr></table>`;
function atcoderSource(){
  const state={handle:'Alice_1',affiliation:'Fixture &amp; University',history:[{IsRated:true,Place:12,OldRating:800,NewRating:1000,ContestScreenName:'abc999.contest.atcoder.jp',ContestName:'AtCoder Fixture',ContestNameEn:'',EndTime:day}],beforeUser:null,fail:false};
  state.fetcher=async(url,options)=>{
    const uri=new URL(url);assert.equal(uri.origin,'https://atcoder.jp');assert.equal(options.redirect,'error');
    if(state.fail)return new Response('',{status:503});
    if(uri.pathname.endsWith('/history/json'))return Response.json(state.history);
    if(state.beforeUser)await state.beforeUser();
    return new Response(html(state.handle,state.affiliation));
  };
  return state;
}
function kaggleSource(){
  const state={me:{active:true,userId:42,username:'fixture-kaggler',exp:Math.floor(time/1000)+3600},calls:[],beforeMe:null,fail:false,
    pages:[{competitions:[{id:1,ref:'https://www.kaggle.com/competitions/public-fixture',userHasEntered:true,userRank:7},{id:2,ref:'private-fixture',userHasEntered:true,userRank:1},{id:3,ref:'no-submissions',userHasEntered:true,userRank:0}],nextPageToken:''}]};
  state.fetcher=async(url,options)=>{
    const uri=new URL(url),body=JSON.parse(options.body);assert.equal(uri.origin,'https://api.kaggle.com');assert.equal(options.redirect,'error');assert.equal(options.method,'POST');
    state.calls.push({path:uri.pathname,body,headers:options.headers});
    if(state.fail)return new Response('',{status:503});
    if(uri.pathname.endsWith('/IntrospectToken')){if(state.beforeMe)await state.beforeMe();assert.equal(body.token,options.headers.Authorization.slice(7));return Response.json(state.me);}
    if(uri.pathname.endsWith('/ListCompetitions')){assert.equal(body.group,1);assert(options.headers.Authorization);return Response.json(state.pages[body.pageToken?1:0]);}
    if(uri.pathname.endsWith('/GetCompetition')){assert.equal(options.headers.Authorization,undefined);return body.competitionName==='private-fixture'?new Response('',{status:403}):Response.json({id:1,ref:'https://www.kaggle.com/competitions/public-fixture',title:'Public competition fixture'});}
    throw new Error('Unexpected Kaggle fixture path');
  };
  return state;
}
function githubSource(){
  const repo=(id,changes={})=>({id,name:'fixture-project-'+id,owner:{id:42},private:false,fork:false,updated_at:day,stargazers_count:3,language:'TypeScript',...changes});
  const item={id:99,number:7,user:{id:42},repository_url:'https://api.github.com/repos/public-org/public-project'};
  const state={me:{id:42,login:'fixture-user',type:'User'},repos:[repo(1),repo(2,{fork:true}),repo(3,{private:true})],search:{items:[item],total_count:1,incomplete_results:false},
    pr:{id:99,number:7,user:{id:42},base:{repo:{private:false,full_name:'public-org/public-project'}},title:'Fixture improvement',merged_at:day},
    token:{access_token:'gho_fixture_access',token_type:'bearer',expires_in:3600,refresh_token:'ghr_fixture_refresh'},calls:[],beforeToken:null,failApi:false};
  state.fetcher=async(url,options)=>{
    const uri=new URL(url);assert.equal(options.redirect,'error');state.calls.push({url:uri,options});
    if(uri.origin==='https://github.com'){
      assert.equal(uri.pathname,'/login/oauth/access_token');assert.equal(options.method,'POST');
      if(state.beforeToken)await state.beforeToken();return Response.json(state.token);
    }
    assert.equal(uri.origin,'https://api.github.com');assert(options.headers.Authorization);
    if(state.failApi)return new Response('',{status:503});
    if(uri.pathname==='/user')return Response.json(state.me);
    if(uri.pathname.endsWith('/repos')){assert.equal(uri.searchParams.get('type'),'owner');return Response.json(state.repos);}
    if(uri.pathname==='/search/issues'){assert.match(uri.searchParams.get('q'),/is:public/u);return Response.json(state.search);}
    if(uri.pathname==='/repos/public-org/public-project/pulls/7')return Response.json(state.pr);
    throw new Error('Unexpected GitHub fixture path');
  };
  return state;
}
const githubEnv={GITHUB_CLIENT_ID:'fixture-client',GITHUB_CLIENT_SECRET:'fixture-secret',GITHUB_REDIRECT_URI:'https://platform.example/api/integrations/github/callback',INTEGRATION_ENCRYPTION_KEY:'1'.repeat(64)};
function fixture(t,kind){
  const state=({atcoder:atcoderSource,kaggle:kaggleSource,github:githubSource})[kind](),store=new DirectoryStore(':memory:');
  for(const owner of [ownerA,ownerB]){const profile={...createInitialState().profile,name:'Кандидат',consent:true,visible:true};store.db.prepare('INSERT INTO platform_accounts VALUES(?,?,?,?,?,?)').run(owner,'public-'+owner[0],1,JSON.stringify(profile),'{}',day);store.upsert({...profile,id:'public-'+owner[0]},owner,true);}
  const Type=({atcoder:AtCoderProvider,kaggle:KaggleProvider,github:GitHubProvider})[kind];
  const provider=new Type(kind==='github'?githubEnv:{},{fetcher:state.fetcher,now,spacingMs:0});
  const service=new IntegrationService(store,{providers:[provider],now,automatic:false,retryDelayMs:1});
  t.after(()=>{service.close();store.close();});return {state,store,provider,service};
}
async function settled(service,id){for(let i=0;i<200;i++){const job=service.job(ownerA,id);if(!['queued','running'].includes(job.status))return job;await new Promise(r=>setTimeout(r,5));}throw new Error('Worker did not finish');}
async function link(f,kind){
  if(kind==='kaggle')return f.service.connect(ownerA,kind,{consent:true,apiToken});
  const pending=await f.service.connect(ownerA,kind,{consent:true,...(kind==='atcoder'?{handle:f.state.handle}:{})});
  if(kind==='atcoder'){f.state.affiliation=pending.challenge.token;return f.service.verifyChallenge(ownerA,kind,{challengeId:pending.challenge.id});}
  return f.service.callback(ownerA,kind,{state:new URL(pending.authorizationUrl).searchParams.get('state'),code:'fixture-code'});
}

test('AtCoder verifies exact profile proof, imports Algorithm places and rechecks proof on sync',async t=>{
  const f=fixture(t,'atcoder'),{service,state,store}=f;
  for(const handle of ['../../admin','Alice?x=1','https://private','abc.def'])await assert.rejects(service.connect(ownerA,'atcoder',{consent:true,handle}),status(400));
  const pending=await service.connect(ownerA,'atcoder',{consent:true,handle:state.handle});assert.equal(pending.challenge.field,'affiliation');assert.equal(pending.challenge.keepProof,true);
  assert.equal(service.connections(ownerA).connections.length,0);
  await assert.rejects(service.verifyChallenge(ownerB,'atcoder',{challengeId:pending.challenge.id}),status(400));
  state.affiliation=pending.challenge.token+' extra';await assert.rejects(service.verifyChallenge(ownerA,'atcoder',{challengeId:pending.challenge.id}),status(403));
  state.affiliation=pending.challenge.token;const linked=await service.verifyChallenge(ownerA,'atcoder',{challengeId:pending.challenge.id});assert.equal((await settled(service,linked.job.id)).status,'succeeded');
  await assert.rejects(service.verifyChallenge(ownerA,'atcoder',{challengeId:pending.challenge.id}),status(400));
  const evidence=service.evidence(ownerA).items;assert.equal(evidence.length,2);assert(evidence.every(x=>x.identityVerified&&x.verificationMethod==='profile_challenge'));
  assert.equal(evidence.find(x=>x.externalRecordId==='contest:abc999').place,12);assert.equal(store.integrationCount(ownerA),0);
  state.affiliation='Restored university';assert.equal((await settled(service,service.sync(ownerA,'atcoder').id)).error,'identity_mismatch');assert(service.evidence(ownerA).items.every(x=>x.status==='stale'));
  service.disconnect(ownerA,'atcoder');assert.equal(service.evidence(ownerA).items.length,0);
});
test('AtCoder fails closed on foreign profiles, duplicate/future history and changed layouts',async()=>{
  const state=atcoderSource(),p=new AtCoderProvider({}, {fetcher:state.fetcher,now,spacingMs:0});
  assert.equal((await p.user(state.handle)).affiliation,'Fixture & University');
  state.affiliation='predel-'+'a'.repeat(43);const identity=p.identity(await p.user(state.handle));
  state.history.push({...state.history[0]});await assert.rejects(p.load(identity),code('invalid_source_response'));state.history.pop();
  state.history[0].EndTime=new Date(time+86400000).toISOString();await assert.rejects(p.load(identity),code('invalid_source_response'));
  state.history=[];assert.deepEqual((await p.load(identity)).achievements,[]);
  state.handle='OtherUser';await assert.rejects(p.user('Alice_1'),code('invalid_source_response'));
  const broken=new AtCoderProvider({}, {spacingMs:0,fetcher:async()=>new Response('<h3>Sign in</h3>')});await assert.rejects(broken.user('Alice_1'),code('invalid_source_response'));
});
test('Kaggle binds token introspection ID, excludes private/rankless results and keeps credentials private',async t=>{
  const f=fixture(t,'kaggle'),{service,state,store}=f;
  await assert.rejects(service.connect(ownerA,'kaggle',{consent:false,apiToken}),status(400));
  await assert.rejects(service.connect(ownerA,'kaggle',{consent:true,apiToken,username:'another-user'}),status(400));
  await assert.rejects(service.connect(ownerA,'kaggle',{consent:true,apiToken:'invalid'}),status(400));
  state.me.active=false;await assert.rejects(service.connect(ownerA,'kaggle',{consent:true,apiToken}),status(403));assert.equal(service.connections(ownerA).connections.length,0);state.me.active=true;
  const linked=await link(f,'kaggle');assert.equal((await settled(service,linked.job.id)).status,'succeeded');
  const items=service.evidence(ownerA).items;assert.equal(items.length,1);assert.equal(items[0].participation,'team');assert.equal(items[0].place,null);assert.match(items[0].result,/публичной таблице/u);assert.equal(items[0].verificationMethod,'api_token');
  const row=store.db.prepare('SELECT * FROM integration_connections').get();assert.equal(row.subject,'kaggle:42');assert(!row.credentials.includes(apiToken));assert.equal(service.unseal(row.credentials).apiToken,apiToken);
  assert(!JSON.stringify([service.connections(ownerA),service.evidence(ownerA),service.descriptors(),service.job(ownerA,linked.job.id)]).includes(apiToken));
  const publicData=service.employerEvidence(ownerB,'public-a');assert(!JSON.stringify(publicData).includes(apiToken));assert.equal(publicData.items[0].externalRecordId,undefined);assert.equal(store.integrationCount(ownerA),0);
  await assert.rejects(service.connect(ownerB,'kaggle',{consent:true,apiToken}),status(409));
  state.me.userId=43;assert.equal((await settled(service,service.sync(ownerA,'kaggle').id)).error,'identity_mismatch');assert(service.evidence(ownerA).items.every(x=>x.status==='stale'));
});
test('Kaggle rejects absent immutable ID, loops, duplicates and hostile source URLs',async()=>{
  const state=kaggleSource(),p=new KaggleProvider({}, {fetcher:state.fetcher,now,spacingMs:0});
  delete state.me.userId;await assert.rejects(p.connectToken(apiToken),code('invalid_identity'));state.me.userId=42;
  const identity=await p.connectToken(apiToken),first=state.pages[0];
  first.competitions[0].ref='https://internal.example/secret';await assert.rejects(p.load(identity),code('invalid_source_response'));first.competitions[0].ref='public-fixture';
  first.nextPageToken='loop';state.pages[1]={competitions:[],nextPageToken:'loop'};await assert.rejects(p.load(identity),code('invalid_source_response'));
  first.nextPageToken='';first.competitions.push({...first.competitions[0]});await assert.rejects(p.load(identity),code('invalid_source_response'));
});
test('Kaggle late token verification cannot resurrect a disconnected account or bypass consent',async t=>{
  const {service,state,store}=fixture(t,'kaggle');
  state.beforeMe=()=>service.disconnect(ownerA,'kaggle');await assert.rejects(service.connect(ownerA,'kaggle',{consent:true,apiToken}),status(409));assert.equal(service.connections(ownerA).connections.length,0);
  state.beforeMe=()=>{const row=store.db.prepare('SELECT profile FROM platform_accounts WHERE owner=?').get(ownerA),profile=JSON.parse(row.profile);profile.consent=false;store.db.prepare('UPDATE platform_accounts SET profile=? WHERE owner=?').run(JSON.stringify(profile),ownerA);};
  await assert.rejects(service.connect(ownerA,'kaggle',{consent:true,apiToken}),status(409));assert.equal(service.connections(ownerA).connections.length,0);
});
test('GitHub OAuth uses owner-bound state and PKCE; public repos and actual merged PRs do not grant grade/FSP bonus',async t=>{
  const f=fixture(t,'github'),{service,state,store}=f,pending=await service.connect(ownerA,'github',{consent:true}),url=new URL(pending.authorizationUrl);
  assert.equal(url.origin,'https://github.com');assert.equal(url.searchParams.get('scope'),'');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('code_challenge').length,43);
  const secret=service.unseal(store.db.prepare('SELECT secrets FROM integration_pending').get().secrets);
  const oauthState=url.searchParams.get('state');await assert.rejects(service.callback(ownerB,'github',{state:oauthState,code:'fixture'}),status(400));
  const result=await service.callback(ownerA,'github',{state:oauthState,code:'fixture'});assert.equal((await settled(service,result.job.id)).status,'succeeded');
  const sent=new URLSearchParams(state.calls.find(x=>x.url.origin==='https://github.com').options.body);assert.equal(sent.get('code_verifier'),secret.verifier);assert.equal(sent.get('client_secret'),githubEnv.GITHUB_CLIENT_SECRET);
  await assert.rejects(service.callback(ownerA,'github',{state:oauthState,code:'fixture'}),status(400));
  const items=service.evidence(ownerA).items;assert.equal(items.length,2);assert(items.every(x=>x.verificationMethod==='oauth2'&&x.skills.length===0));assert(items.some(x=>x.title==='Принятый PR: Fixture improvement'));
  const row=store.db.prepare('SELECT * FROM integration_connections').get();assert.equal(row.subject,'github:42');assert(!row.credentials.includes(state.token.access_token));assert.equal(store.integrationCount(ownerA),0);
  assert(!JSON.stringify(service.employerEvidence(ownerB,'public-a')).includes(state.token.access_token));
});
test('GitHub callback exchange cannot relink after disconnect or a replacement OAuth flow',async t=>{
  const {service,state}=fixture(t,'github');
  let pending=await service.connect(ownerA,'github',{consent:true});state.beforeToken=()=>service.disconnect(ownerA,'github');
  await assert.rejects(service.callback(ownerA,'github',{state:new URL(pending.authorizationUrl).searchParams.get('state'),code:'fixture'}),status(409));assert.equal(service.connections(ownerA).connections.length,0);
  pending=await service.connect(ownerA,'github',{consent:true});state.beforeToken=()=>service.connect(ownerA,'github',{consent:true});
  await assert.rejects(service.callback(ownerA,'github',{state:new URL(pending.authorizationUrl).searchParams.get('state'),code:'fixture'}),status(409));assert.equal(service.connections(ownerA).connections.length,0);
});
test('GitHub rejects foreign ownership, unverified search hits and private PRs without following external URLs',async()=>{
  const state=githubSource(),p=new GitHubProvider(githubEnv,{fetcher:state.fetcher,now,spacingMs:0}),identity=await p.exchange('fixture',{verifier:'fixture'});
  state.repos[0].owner.id=99;await assert.rejects(p.load(identity,()=>{}),code('invalid_source_response'));state.repos[0].owner.id=42;
  state.search.items[0].repository_url='https://internal.example/repos/foo/bar';await assert.rejects(p.load(identity,()=>{}),code('invalid_source_response'));state.search.items[0].repository_url='https://api.github.com/repos/public-org/public-project';
  state.pr.user.id=99;await assert.rejects(p.load(identity,()=>{}),code('invalid_source_response'));state.pr.user.id=42;
  state.pr.base.repo.private=true;assert.equal((await p.load(identity,()=>{})).achievements.length,1);
  state.me.id=99;await assert.rejects(p.load(identity,()=>{}),code('identity_mismatch'));
});
test('GitHub persists rotated credentials before API failure and classifies rate limits',async()=>{
  const state=githubSource(),p=new GitHubProvider(githubEnv,{fetcher:state.fetcher,now,spacingMs:0}),identity=await p.exchange('fixture',{verifier:'fixture'});
  identity.credentials.expiresAt=day;state.token.access_token='gho_rotated';state.token.refresh_token='ghr_rotated';state.failApi=true;
  let persisted;await assert.rejects(p.load(identity,value=>persisted=value),code('source_unavailable'));assert.equal(persisted.refreshToken,'ghr_rotated');
  const limited=new GitHubProvider(githubEnv,{now,spacingMs:0,fetcher:async()=>new Response('',{status:403,headers:{'x-ratelimit-remaining':'0','x-ratelimit-reset':String(time/1000+10)}})});
  await assert.rejects(limited.me('gho_fixture'),e=>e.code==='rate_limited'&&e.retryable&&e.retryAfter===10);
});
