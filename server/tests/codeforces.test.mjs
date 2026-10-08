import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectoryStore } from '../directory-store.mjs';
import { IntegrationService } from '../integrations/service.mjs';
import { CodeforcesProvider } from '../integrations/codeforces.mjs';
import { integrationRoutes } from '../integrations/http.mjs';
import { createInitialState } from '../../frontend/src/model.ts';

const time=Date.parse('2026-10-08T09:00:00Z'),ownerA='a'.repeat(64),ownerB='b'.repeat(64),status=n=>e=>e.status===n;
function source(){
  const user={handle:'Alice',registrationTimeSeconds:1500000000,organization:'University',rating:1500,maxRating:1600};
  const history=[{contestId:1000,contestName:'Codeforces Round fixture',handle:'Alice',rank:42,oldRating:1450,newRating:1500,ratingUpdateTimeSeconds:Math.floor(time/1000)-86400}];
  const submission=(id,index,changes={})=>({id,creationTimeSeconds:Math.floor(time/1000)-100,verdict:'OK',problem:{contestId:1000,index},author:{members:[{handle:'Alice'}]},...changes});
  const state={user,history,submissions:[submission(4,'A'),submission(3,'A'),submission(2,'B',{author:{members:[{handle:'Alice'},{handle:'Bob'}]}}),submission(1,'C',{verdict:'WRONG_ANSWER'})],calls:[],fail:false,beforeUser:null};
  state.fetcher=async(url,options)=>{
    const uri=new URL(url);assert.equal(uri.origin,'https://codeforces.com');assert.equal(options.redirect,'error');
    state.calls.push(uri);
    if(state.fail)return new Response('',{status:503});
    if(uri.pathname==='/api/user.info'){if(state.beforeUser)await state.beforeUser();return Response.json({status:'OK',result:[{...state.user}]});}
    if(uri.pathname==='/api/user.rating')return Response.json({status:'OK',result:state.history});
    if(uri.pathname==='/api/user.status'){const start=Number(uri.searchParams.get('from'))-1;return Response.json({status:'OK',result:state.submissions.slice(start,start+250)});}
    throw new Error('Unexpected upstream path');
  };
  return state;
}
function fixture(t){
  const upstream=source(),store=new DirectoryStore(':memory:');let clock=time;
  for(const owner of [ownerA,ownerB]){const profile={...createInitialState().profile,name:'Кандидат',consent:true,visible:true};store.db.prepare('INSERT INTO platform_accounts VALUES(?,?,?,?,?,?)').run(owner,'public-'+owner[0],1,JSON.stringify(profile),'{}',new Date(time).toISOString());store.upsert({...profile,id:'public-'+owner[0]},owner,true);}
  const provider=new CodeforcesProvider({}, {fetcher:upstream.fetcher,spacingMs:0,now:()=>clock});
  const service=new IntegrationService(store,{providers:[provider],automatic:false,retryDelayMs:1,now:()=>clock});
  t.after(()=>{service.close();store.close();});
  return {upstream,store,provider,service,advance:ms=>clock+=ms};
}
async function settled(service,id){for(let i=0;i<100;i++){const job=service.job(ownerA,id);if(!['queued','running'].includes(job.status))return job;await new Promise(r=>setTimeout(r,5));}throw new Error('Worker did not finish');}
async function linked(f){const result=await f.service.connect(ownerA,'codeforces',{consent:true,handle:'Alice'});f.upstream.user.organization=result.challenge.token;return f.service.verifyChallenge(ownerA,'codeforces',{challengeId:result.challenge.id});}

test('Codeforces requires proof of account control, imports official facts and does not grant an FSP bonus',async t=>{
  const f=fixture(t),{service,store,upstream}=f;
  await assert.rejects(service.connect(ownerA,'codeforces',{consent:false,handle:'Alice'}),status(400));
  for(const handle of ['https://internal.example','Alice&handles=Bob','../admin',''])await assert.rejects(service.connect(ownerA,'codeforces',{consent:true,handle}),status(400));
  const pending=await service.connect(ownerA,'codeforces',{consent:true,handle:'Alice'});
  assert.equal(service.connections(ownerA).connections.length,0);assert.equal(service.evidence(ownerA).items.length,0);
  await assert.rejects(service.verifyChallenge(ownerA,'codeforces',{challengeId:pending.challenge.id}),status(403));
  await assert.rejects(service.verifyChallenge(ownerB,'codeforces',{challengeId:pending.challenge.id}),status(400));
  const encrypted=store.db.prepare('SELECT secrets FROM integration_pending').get().secrets;assert(!encrypted.includes(pending.challenge.token));
  upstream.user.organization=pending.challenge.token;
  const result=await service.verifyChallenge(ownerA,'codeforces',{challengeId:pending.challenge.id});assert.equal((await settled(service,result.job.id)).status,'succeeded');
  const items=service.evidence(ownerA).items;assert.equal(items.length,3);assert(items.every(x=>x.status==='verified'&&x.verificationMethod==='profile_challenge'));
  assert.match(items.find(x=>x.externalRecordId==='solved-sample').result,/Уникальных задач с вердиктом OK: 1 среди 4/u);
  const contest=items.find(x=>x.externalRecordId==='contest:1000');assert.equal(contest.place,null);assert.match(contest.result,/исторический результат/u);
  assert.equal(store.forOwner(ownerA).fsp,0);assert.equal(items[0].skills[0].ruleVersion,'codeforces-algorithms-v1');
  assert(!JSON.stringify(service.employerEvidence(ownerB,'public-a')).includes(pending.challenge.token));
  assert.equal(service.employerEvidence(ownerB,'public-a').items[0].externalRecordId,undefined);
  await assert.rejects(service.verifyChallenge(ownerA,'codeforces',{challengeId:pending.challenge.id}),status(400));
  // Restoring Organization does not revoke a successfully proved account.
  upstream.user.organization='University';assert.equal((await settled(service,service.sync(ownerA,'codeforces').id)).status,'succeeded');
});

test('challenge expiry, replacement, duplicate owner and disconnect prevent stale claims',async t=>{
  const f=fixture(t),{service,upstream,advance}=f;
  const old=await service.connect(ownerA,'codeforces',{consent:true,handle:'Alice'}),current=await service.connect(ownerA,'codeforces',{consent:true,handle:'Alice'});
  upstream.user.organization=old.challenge.token;await assert.rejects(service.verifyChallenge(ownerA,'codeforces',{challengeId:old.challenge.id}),status(400));
  advance(30*60000+1);upstream.user.organization=current.challenge.token;await assert.rejects(service.verifyChallenge(ownerA,'codeforces',{challengeId:current.challenge.id}),status(400));
  const result=await linked(f);await settled(service,result.job.id);
  const other=await service.connect(ownerB,'codeforces',{consent:true,handle:'Alice'});upstream.user.organization=other.challenge.token;
  await assert.rejects(service.verifyChallenge(ownerB,'codeforces',{challengeId:other.challenge.id}),status(409));
  service.disconnect(ownerA,'codeforces');assert.equal(service.evidence(ownerA).items.length,0);
  service.disconnect(ownerB,'codeforces');await assert.rejects(service.verifyChallenge(ownerB,'codeforces',{challengeId:other.challenge.id}),status(400));
});

test('disconnect or loss of consent during upstream verification cannot attach an account',async t=>{
  const f=fixture(t),{service,upstream,store}=f;
  const pending=await service.connect(ownerA,'codeforces',{consent:true,handle:'Alice'});upstream.user.organization=pending.challenge.token;
  upstream.beforeUser=async()=>service.disconnect(ownerA,'codeforces');
  await assert.rejects(service.verifyChallenge(ownerA,'codeforces',{challengeId:pending.challenge.id}),status(409));assert.equal(service.connections(ownerA).connections.length,0);
  upstream.beforeUser=null;const next=await service.connect(ownerA,'codeforces',{consent:true,handle:'Alice'});upstream.user.organization=next.challenge.token;
  upstream.beforeUser=async()=>{const row=store.db.prepare('SELECT profile FROM platform_accounts WHERE owner=?').get(ownerA);const profile=JSON.parse(row.profile);profile.consent=false;store.db.prepare('UPDATE platform_accounts SET profile=? WHERE owner=?').run(JSON.stringify(profile),ownerA);};
  await assert.rejects(service.verifyChallenge(ownerA,'codeforces',{challengeId:next.challenge.id}),status(409));assert.equal(service.connections(ownerA).connections.length,0);
});

test('source outages preserve prior snapshots as stale and account changes require new proof',async t=>{
  const f=fixture(t),{service,upstream,advance}=f,result=await linked(f);await settled(service,result.job.id);
  upstream.fail=true;assert.equal((await settled(service,service.sync(ownerA,'codeforces').id)).status,'failed');assert(service.evidence(ownerA).items.every(x=>x.status==='stale'));
  upstream.fail=false;assert.equal((await settled(service,service.sync(ownerA,'codeforces').id)).status,'succeeded');
  advance(8*86400000);assert(service.evidence(ownerA).items.every(x=>x.status==='stale'));
  upstream.user.registrationTimeSeconds++;assert.equal((await settled(service,service.sync(ownerA,'codeforces').id)).error,'identity_mismatch');assert.equal(service.connections(ownerA).connections[0].status,'reauthorization_required');
});

test('bounded solutions sample is explicit and empty history does not fabricate achievements',async()=>{
  const state=source(),provider=new CodeforcesProvider({}, {fetcher:state.fetcher,spacingMs:0,now:()=>time});
  const identity=provider.identity(state.user);
  state.submissions=Array.from({length:2001},(_,i)=>({id:2001-i,creationTimeSeconds:time/1000-100,verdict:'OK',problem:{contestId:1,index:'A'},author:{members:[{handle:'Alice'}]}}));
  const snapshot=await provider.load(identity),sample=snapshot.achievements.find(x=>x.id==='solved-sample');assert.match(sample.result,/среди 2000/u);assert.match(sample.result,/не общее число/u);
  assert.equal(state.calls.filter(x=>x.pathname==='/api/user.status').length,8);
  state.history=[];state.submissions=[];delete state.user.rating;delete state.user.maxRating;
  assert.deepEqual((await provider.load(identity)).achievements,[]);
});

test('upstream ownership, oversized error envelopes and rate limits are validated',async()=>{
  const state=source(),provider=new CodeforcesProvider({}, {fetcher:state.fetcher,spacingMs:0,now:()=>time}),identity=provider.identity(state.user);
  state.submissions[0].author.members=[{handle:'Bob'}];await assert.rejects(provider.load(identity),e=>e.code==='invalid_source_response');
  for(const [response,expected] of [[Response.json({status:'FAILED',comment:'handles: User with handle Missing not found'},{status:400}),'identity_not_found'],[Response.json({status:'FAILED',comment:'Call limit exceeded'}),'rate_limited'],[new Response('x'.repeat(1000001),{status:400}),'invalid_source_response']]){
    const p=new CodeforcesProvider({}, {fetcher:async()=>response,spacingMs:0});await assert.rejects(p.user('Alice'),e=>e.code===expected);
  }
});

test('HTTP verification enforces authentication, role and current tab identity',async t=>{
  const {service}=fixture(t),scope='auth:candidate-id';
  const call=async(account,header=scope)=>integrationRoutes({request:{method:'POST',headers:{'x-platform-identity':header}},response:{setHeader(){}},url:new URL('https://platform.example/api/integrations/codeforces/verify'),identity:{account,owner:ownerA},integrations:service,body:async()=>({challengeId:'x'.repeat(43)}),send(){},limit(){}});
  await assert.rejects(call(null),status(401));await assert.rejects(call({id:'candidate-id',role:'employer'}),status(403));
  await assert.rejects(call({id:'candidate-id',role:'candidate'},'auth:old'),status(409));await assert.rejects(call({id:'candidate-id',role:'candidate'}),status(400));
});
