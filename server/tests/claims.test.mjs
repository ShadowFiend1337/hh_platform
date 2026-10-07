import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectoryStore } from '../directory-store.mjs';
import { IntegrationService } from '../integrations/service.mjs';
import { PublicFspCatalog } from '../integrations/public-fsp.mjs';
import { evaluateClaim, digestRecord } from '../integrations/claim-checks.mjs';
import { createInitialState } from '../../frontend/src/model.ts';
import { createAssessmentServer } from '../server.mjs';
const ownerA='a'.repeat(64),ownerB='b'.repeat(64),ownerM='c'.repeat(64);
const moderator={id:'moderator-account',platformOwner:ownerM,canModerate:true};
const recordId=new PublicFspCatalog().search('Ромашов Федор').items[0].id;
const support={recordId,consent:true,statement:'Я участвовал в финале. Документ доступен модератору: private@example.com.',links:['https://materials.example/certificate']};
const approval=version=>({version,decision:'approve',reason:'Результат и принадлежность проверены.',ownershipConfirmed:true,verificationMethod:'organizer_confirmation',verificationReference:'Сверены сведения участника и независимое подтверждение организатора.'});
function fixture(t,env={}) {
  const store=new DirectoryStore(':memory:');
  let clock=Date.parse('2026-10-07T19:00:00Z');
  const catalogData=structuredClone(new PublicFspCatalog().read()),catalog=new PublicFspCatalog({data:catalogData});
  const service=new IntegrationService(store,{dbPath:':memory:',providers:[],automatic:false,env,now:()=>clock,publicCatalog:catalog});
  for(const [owner,id] of [[ownerA,'public-a'],[ownerB,'public-b'],[ownerM,'public-m']]) {
    const profile={...createInitialState().profile,name:'Ромашов Фёдор Викторович',consent:true,visible:true};
    store.db.prepare('INSERT INTO platform_accounts VALUES(?,?,?,?,?,?)').run(owner,id,1,JSON.stringify(profile),'{}',new Date(clock).toISOString());
    store.upsert({...profile,id},owner,true);
  }
  t.after(()=>{service.close();store.close();});
  return {service,claims:service.claims,store,catalogData,advance:ms=>clock+=ms};
}
const status=n=>e=>e.status===n;
test('claim lifecycle requires manual ownership verification, keeps materials private and reindexes approval/withdrawal',t=>{
  const {claims,store,service}=fixture(t);
  const pending=claims.submit(ownerA,'candidate-a',support);
  assert.equal(pending.status,'pending');assert.equal(pending.active,false);
  assert.equal(pending.checks.nameMatch,true);assert.equal(pending.checks.ownershipAutomaticallyConfirmed,false);
  assert.equal(store.forOwner(ownerA).fsp,0);assert.deepEqual(service.evidence(ownerA).items,[]);
  assert.throws(()=>claims.decide(moderator,pending.id,{...approval(1),ownershipConfirmed:false}),status(400));
  const info=claims.decide(moderator,pending.id,{version:1,decision:'request_information',reason:'Предоставьте независимое подтверждение участия.'});
  assert.equal(info.status,'needs_info');assert.equal(info.version,2);
  const resubmitted=claims.revise(ownerA,'candidate-a',pending.id,{version:2,consent:true,statement:support.statement,links:support.links});
  assert.equal(resubmitted.status,'pending');
  const approved=claims.decide(moderator,pending.id,approval(3));assert.equal(approved.active,true);assert.equal(store.forOwner(ownerA).fsp,1);
  const publicEvidence=service.employerEvidence(ownerB,'public-a').items;
  assert.equal(publicEvidence[0].verificationMethod,'manual_review');assert.equal(publicEvidence[0].status,'verified');
  assert(!JSON.stringify(publicEvidence).includes('private@example.com'));assert.equal(publicEvidence[0].snapshotHash,undefined);
  assert.throws(()=>claims.decide(moderator,pending.id,approval(1)),status(409));
  const withdrawn=claims.withdraw(ownerA,'candidate-a',pending.id,{version:4});assert.equal(withdrawn.status,'withdrawn');
  assert.equal(store.forOwner(ownerA).fsp,0);assert.deepEqual(service.evidence(ownerA).items,[]);
  assert.equal(claims.view(claims.get(pending.id),{moderator:true}).audit.length,5);
});
test('approval cannot be self-reviewed, forged, duplicated or assigned to another owner',t=>{
  const {claims}=fixture(t);
  const a=claims.submit(ownerA,'candidate-a',support),b=claims.submit(ownerB,'candidate-b',support);
  assert.throws(()=>claims.get(a.id,ownerB),status(404));
  assert.throws(()=>claims.decide({...moderator,canModerate:false},a.id,approval(1)),status(403));
  assert.throws(()=>claims.decide({...moderator,platformOwner:ownerA},a.id,approval(1)),status(403));
  assert.throws(()=>claims.submit(ownerA,'candidate-a',support),status(409));
  claims.decide(moderator,a.id,approval(1));
  assert.equal(claims.view(claims.get(b.id)).checks.duplicateApproved,true);
  assert.throws(()=>claims.decide(moderator,b.id,approval(1)),status(409));
  claims.decide(moderator,a.id,{version:2,decision:'revoke',reason:'Подтверждение организатора было отозвано.'});
  assert.equal(claims.decide(moderator,b.id,approval(1)).active,true);
});
test('source changes, catalog outages, profile renaming and expiry remove active verification',t=>{
  const {claims,store,catalogData,advance,service}=fixture(t);
  const row=claims.submit(ownerA,'candidate-a',support);claims.decide(moderator,row.id,approval(1));
  const source=catalogData.sources[0];source.documentHash='0'.repeat(64);
  assert.equal(claims.count(ownerA),0);assert.equal(service.evidence(ownerA).items[0].status,'stale');
  claims.tick();assert.equal(store.forOwner(ownerA).fsp,0);
  assert.throws(()=>claims.decide(moderator,row.id,approval(2)),status(409));
  source.documentHash=JSON.parse(claims.get(row.id).snapshot).documentHash;
  const profile=claims.profile(ownerA);profile.name='Другой Участник';store.db.prepare('UPDATE platform_accounts SET profile=? WHERE owner=?').run(JSON.stringify(profile),ownerA);
  assert.equal(claims.count(ownerA),0);
  profile.name='Ромашов Фёдор Викторович';store.db.prepare('UPDATE platform_accounts SET profile=? WHERE owner=?').run(JSON.stringify(profile),ownerA);
  advance(90*86400000+1);assert.equal(claims.count(ownerA),0);
  assert.equal(claims.decide(moderator,row.id,approval(2)).active,true);
  service.publicCatalog={get(){throw Object.assign(new Error('outage'),{status:503});}};
  assert.equal(claims.count(ownerA),0);assert.equal(claims.view(claims.get(row.id)).checks.sourceStatus,'unavailable');
});
test('attachments are encrypted, MIME checked, reusable on revision and removed with revoked consent',t=>{
  const {claims,service,store}=fixture(t);
  const bytes=Buffer.from('%PDF-1.4\nprivate-document-fixture\n%%EOF');
  const document={name:'certificate.pdf',mediaType:'application/pdf',dataBase64:bytes.toString('base64')};
  assert.throws(()=>claims.submit(ownerA,'candidate-a',{...support,links:[],document:{...document,mediaType:'image/png'}}),status(415));
  const pending=claims.submit(ownerA,'candidate-a',{...support,links:[],document});
  assert(!JSON.stringify(pending).includes(document.dataBase64));
  const stored=claims.get(pending.id);assert(!stored.materials.includes('private-document-fixture'));assert(!stored.materials.includes('private@example.com'));
  assert(claims.attachment(stored,'moderator').bytes.equals(bytes));
  const revised=claims.revise(ownerA,'candidate-a',pending.id,{version:1,consent:true,statement:support.statement,links:[],retainDocument:true});
  assert.equal(revised.document.sha256,pending.document.sha256);
  service.removeOwner(ownerA);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM achievement_claims').get().n,0);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM achievement_claim_audit').get().n,0);
});
test('automated parsing checks distinguish source integrity from identity and never auto-confirm ownership',()=>{
  const record=new PublicFspCatalog().get(recordId);
  const matching=evaluateClaim({snapshot:record,current:record,candidateName:'Ромашов Федор Викторович',documentProvided:true});
  assert.equal(matching.recommendation,'manual_review');assert.equal(matching.ownershipAutomaticallyConfirmed,false);
  assert.notEqual(digestRecord(record),digestRecord({...record,place:2}));
  assert.equal(evaluateClaim({snapshot:record,current:{...record,place:2},candidateName:record.participantName}).sourceStatus,'changed');
  assert.equal(evaluateClaim({snapshot:record,current:null,candidateName:record.participantName}).recommendation,'blocked');
});

async function httpFixture(t) {
  const codes=new Map(),app=createAssessmentServer({dbPath:':memory:',authEnv:{},authMailer:async({email,code})=>codes.set(email,code),integrationOptions:{automatic:false}});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  t.after(()=>new Promise(resolve=>{app.server.close(resolve);app.server.closeAllConnections();}));
  function browser(){const cookies=new Map();let identity;return async(path,method='GET',input,headers={})=>{
    const res=await fetch(base+path,{method,headers:{Origin:base,Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),...(identity?{'X-Platform-Identity':identity}:{}),...(input===undefined?{}:{'Content-Type':'application/json'}),...headers},body:input===undefined?undefined:JSON.stringify(input)});
    for(const cookie of res.headers.getSetCookie()){const [k,v]=cookie.split(';')[0].split('=');cookies.set(k,v);}identity=res.headers.get('X-Platform-Identity')||identity;
    return {status:res.status,headers:res.headers,data:res.headers.get('content-type').includes('json')?await res.json():Buffer.from(await res.arrayBuffer())};
  };}
  async function register(client,login,role='candidate'){
    const email=login+'@example.invalid';assert.equal((await client('/api/auth/register/request-code','POST',{email,login,role,password:'integration test password',consent:true,...(role==='candidate'?{name:'Ромашов Фёдор Викторович'}:{companyName:'Модерация'})})).status,202);
    const registered=await client('/api/auth/register/verify','POST',{email,code:codes.get(email)});
    if(role==='candidate'){const state=createInitialState();state.profile.name='Ромашов Фёдор Викторович';state.profile.consent=true;const old=await client('/api/platform/state');assert.equal((await client('/api/platform/state','PUT',{state,baseRevision:old.data.revision})).status,200);}
    return registered.data.account;
  }
  return {...app,base,browser,register};
}
test('HTTP moderation privileges are server-granted, revoked immediately, and private files stay owner/moderator only',async t=>{
  const {browser,register,auth}=await httpFixture(t);
  const guest=browser(),candidate=browser(),other=browser(),reviewer=browser();
  const account=await register(candidate,'claim-candidate'),mod=await register(reviewer,'claim-moderator','employer');await register(other,'claim-other');
  assert.equal(account.canModerate,false);
  assert.equal((await guest('/api/achievement-claims')).status,401);
  assert.equal((await reviewer('/api/moderation/claims')).status,403);
  auth.store.setModerator(mod.id,true,'fixture');assert.equal((await reviewer('/api/auth/me')).data.account.canModerate,true);
  const bytes=Buffer.from('%PDF-1.4\nprivate-fixture\n%%EOF'),doc={name:'certificate.pdf',mediaType:'application/pdf',dataBase64:bytes.toString('base64')};
  const created=await candidate('/api/achievement-claims','POST',{...support,document:doc});assert.equal(created.status,201);
  const id=created.data.id;
  assert.equal((await other('/api/achievement-claims/'+id)).status,404);
  assert.equal((await other('/api/achievement-claims/'+id+'/attachment')).status,404);
  assert.equal((await candidate('/api/moderation/claims/'+id)).status,403);
  const downloaded=await reviewer('/api/moderation/claims/'+id+'/attachment');assert.equal(downloaded.status,200);assert(downloaded.data.equals(bytes));assert(downloaded.headers.get('content-disposition').startsWith('attachment;'));
  assert.equal((await reviewer('/api/moderation/claims/'+id+'/decision','POST',approval(1),{'X-Platform-Identity':'auth:wrong'})).status,409);
  assert.equal((await reviewer('/api/moderation/claims/'+id+'/decision','POST',{...approval(1),canModerate:true})).status,400);
  assert.equal((await reviewer('/api/moderation/claims/'+id+'/decision','POST',approval(1))).status,200);
  const evidence=(await candidate('/api/profile/evidence')).data.items;assert.equal(evidence[0].status,'verified');assert(!JSON.stringify(evidence).includes('private@example.com'));
  auth.store.setModerator(mod.id,false,'fixture');assert.equal((await reviewer('/api/moderation/claims/'+id)).status,403);
  assert.equal((await reviewer('/api/auth/me')).data.account.canModerate,false);
  assert.equal((await candidate('/api/achievement-claims/'+id,'DELETE',{version:2})).status,200);
  const current=await candidate('/api/platform/state');current.data.state.profile.consent=false;
  assert.equal((await candidate('/api/platform/state','PUT',{state:current.data.state,baseRevision:current.data.revision})).status,200);
  assert.equal((await candidate('/api/achievement-claims')).data.claims.length,0);
});

test('official PDF hash checks detect changes, refuse foreign URLs and invalidate approved claims',async t=>{
  const {claims,store,service,catalogData}=fixture(t),bytes=Buffer.from('%PDF-1.4\nofficial-fixture');
  const {createHash}=await import('node:crypto');catalogData.sources[0].documentHash=createHash('sha256').update(bytes).digest('hex');
  const claim=claims.submit(ownerA,'candidate-a',support);claims.decide(moderator,claim.id,approval(1));
  let changed=false,fail=false;
  service.publicSourceChecks.fetcher=async(url,options)=>{
    assert.equal(options.redirect,'error');assert.equal(new URL(url).hostname,'fsp-russia.ru');
    return fail?new Response('unavailable',{status:503}):new Response(changed?Buffer.from('%PDF-1.4\nchanged-fixture'):bytes);
  };
  const sourceId=catalogData.sources[0].id;
  assert.equal((await service.publicSourceChecks.check(sourceId)).status,'matched');assert.equal(claims.count(ownerA),1);
  changed=true;assert.equal((await service.publicSourceChecks.check(sourceId)).status,'changed');assert.equal(claims.count(ownerA),0);assert.equal(store.forOwner(ownerA).fsp,0);
  assert.throws(()=>claims.decide(moderator,claim.id,approval(2)),status(409));
  fail=true;assert.equal((await service.publicSourceChecks.check(sourceId)).status,'unavailable');assert.equal(claims.view(claims.get(claim.id)).checks.sourceStatus,'unavailable');
  catalogData.sources[0].sourceUrl='https://other.example/protocol.pdf';
  await assert.rejects(service.publicSourceChecks.check(sourceId),status(400));
});

test('production rejects private materials without a persistent operator encryption key',t=>{
  const {claims}=fixture(t,{APP_ENV:'production'});
  assert.throws(()=>claims.submit(ownerA,'candidate-a',support),status(503));
});
