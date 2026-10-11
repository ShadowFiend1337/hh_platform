import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,readFileSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { PublicSourceCollector,publicSourceRegistry } from '../integrations/public-collector.mjs';
import { PublicAchievementCatalog } from '../integrations/public-catalog.mjs';
import { parsePublicSource,registeredUrl,validateSource } from '../integrations/public-parsers.mjs';
import { IntegrationService } from '../integrations/service.mjs';
import { DirectoryStore } from '../directory-store.mjs';
import { createInitialState } from '../../frontend/src/model.ts';
import { createAssessmentServer } from '../server.mjs';
import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';

const sources=publicSourceRegistry(),news=sources[1],individual=sources[2],table={...sources[0],expectedRows:2};
const now=()=>Date.parse('2026-10-08T12:00:00Z');
const newsHtml=(places=[1,2,3],extra='')=>`<h1>${news.requiredTitle}</h1><div class="opis"><p>С 25 по 28 июня 2026 года; 26 и 27 июня.</p><h4>Итоги турнира<br>· ${places[0]}-е место — команда «Гутид» (Санкт-Петербург);<br>· ${places[1]}-е место — сборная Чувашской Республики;<br>· ${places[2]}-е место — сборная Самарской области.<br>Победители и призёры получили награды.</h4></div>${extra}`;
const tableHtml=(first=1,extra='')=>`<title>${table.requiredTitle}</title><h1>Final Scoreboard</h1><p>The contest has ended</p><table><tr>${['Rank','Name','Solved','Time'].map(h=>'<th>'+h+'</th>').join('')}</tr>${[[first,'1 University A',10,100],[2,'2 University B',8,200]].map((values,i)=>`<tr class="${i?'odd':'even'}">${[...values,...Array(13).fill('-')].map(v=>'<td>'+v+'</td>').join('')}</tr>`).join('')}</table>${extra}`;
const itmoHtml='<h1>Геннадий Короткевич стал победителем VK Cup</h1><article>Engine — олимпиадное программирование. 2 ноября 2020 года.</article>';
const status=n=>e=>e.status===n;
async function settled(collector,id){for(let i=0;i<200;i++){const job=collector.job(id);if(['succeeded','failed'].includes(job.status))return job;await new Promise(resolve=>setTimeout(resolve,5));}throw new Error('Collection did not finish');}
function collectorFixture(t,options={}){
 const db=new DatabaseSync(':memory:');let clock=now();
 const collector=new PublicSourceCollector(db,{sources:[news],seed:{snapshots:[parsePublicSource(news,newsHtml(),()=>clock)]},automatic:false,spacingMs:0,now:()=>clock,fetcher:async()=>new Response(newsHtml()),...options});
 t.after(()=>{collector.close();db.close();});return {db,collector,advance:ms=>clock+=ms};
}
test('registered HTML adapters extract factual rows, individual names, excerpts and stable event identities',()=>{
 const n=parsePublicSource(news,newsHtml(),now);assert.equal(n.items.length,3);assert.equal(n.items[0].participantName,'Гутид');assert.equal(n.items[0].region,'Санкт-Петербург');assert.equal(n.items[0].sourcePage,null);assert.equal(n.items[0].identityVerified,false);assert.equal(n.items[0].participation,'team');assert.match(n.items[0].excerpt,/1-е место/);
 const t=parsePublicSource(table,tableHtml(),now);assert.equal(t.items[0].solvedTasks,10);assert.equal(t.items[0].completionTime,100);assert.match(t.items[0].result,/Состав команды/);
 const person=parsePublicSource(individual,itmoHtml,now).items[0];assert.equal(person.participantName,'Геннадий Короткевич');assert.equal(person.participation,'individual');assert.equal(person.dateBasis,'publication');
 const changed=parsePublicSource(news,newsHtml([2,1,3]),now);assert.equal(changed.items[0].id,n.items[0].id);assert.notEqual(changed.items[0].documentHash,n.items[0].documentHash);assert.equal(changed.items[2].documentHash,n.items[2].documentHash);
});
test('banner and script changes do not change result fingerprints or execute page code',()=>{
 const a=parsePublicSource(news,newsHtml(),now),b=parsePublicSource(news,newsHtml([1,2,3],'<aside>Новая реклама</aside><script>globalThis.PARSE_EXECUTED=true</script>'),now);
 assert.notEqual(a.source.rawHash,b.source.rawHash);assert.equal(a.source.documentHash,b.source.documentHash);assert.equal(globalThis.PARSE_EXECUTED,undefined);
 assert.throws(()=>parsePublicSource(individual,itmoHtml.replace('Engine','<script>Engine</script>'),now),e=>e.code==='invalid_source_response');
});
test('partial, duplicate, wrong-event and structurally changed pages fail closed',()=>{
 for(const html of [newsHtml().replace('2026','2025'),newsHtml().replace('Программирование робототехники','Алгоритмическое программирование'),newsHtml().replace('· 3-е место','3rd'),newsHtml().replace('сборная Самарской области','Гутид').replace('команда «Гутид» (Санкт-Петербург)','Гутид'),newsHtml().replace('1-е место','неизвестное место')])assert.throws(()=>parsePublicSource(news,html,now),e=>e.code==='invalid_source_response');
 assert.throws(()=>parsePublicSource(table,tableHtml().replace('Time','Penalty'),now));assert.throws(()=>parsePublicSource({...news,occurredOn:'2027-01-01'},newsHtml(),now));assert.throws(()=>parsePublicSource(news,'x'.repeat(1000001),now));
});
test('only reviewed HTTPS hosts, paths, parser names and valid registry metadata are accepted',()=>{
 for(const url of ['http://www.fsp-russia.ru/press/news/test/','https://evil.example/press/news/test/','https://www.fsp-russia.ru@evil.example/press/news/test/','https://www.fsp-russia.ru/press/news/test/?url=http://127.0.0.1/','https://www.fsp-russia.ru/press/news/test/#x','https://www.fsp-russia.ru/other/'])assert.throws(()=>registeredUrl({...news,sourceUrl:url}));
 assert.throws(()=>validateSource({...news,occurredOn:'2026-02-30'}));assert.throws(()=>validateSource({...news,participation:'individual'}));assert.throws(()=>validateSource({...news,requiredMarkers:[]}));
});
test('collector keeps last successful data on failures, marks missing/stale sources and refreshes atomically',async t=>{
 let html=newsHtml(),statusCode=200;const {collector,advance}=collectorFixture(t,{fetcher:async(url,options)=>{assert.equal(options.redirect,'error');assert.equal(url,news.sourceUrl);return new Response(html,{status:statusCode});}});
 const before=collector.snapshot(news.id);assert.equal((await collector.refresh(news.id)).status,'matched');
 html='malformed';assert.equal((await collector.refresh(news.id)).error,'invalid_source_response');assert.deepEqual(collector.snapshot(news.id).items,before.items);assert.equal(collector.availability(news.id),'unavailable');
 statusCode=404;assert.equal((await collector.refresh(news.id)).status,'missing');statusCode=200;html=newsHtml([2,1,3]);assert.equal((await collector.refresh(news.id)).status,'changed');assert.equal(collector.availability(news.id),'matched');
 advance(7*86400000);assert.equal(collector.availability(news.id),'unavailable');
});
test('queue deduplicates active source jobs, reports failures and preserves restartable work',async t=>{
 let resolveFetch;const {collector,db}=collectorFixture(t,{fetcher:()=>new Promise(resolve=>resolveFetch=resolve)});
 const job=collector.enqueue(news.id);assert.equal(collector.enqueue(news.id).id,job.id);await new Promise(resolve=>setImmediate(resolve));assert.equal(collector.job(job.id).status,'running');
 resolveFetch(new Response(newsHtml()));assert.equal((await settled(collector,job.id)).resultCount,3);
 collector.fetcher=async()=>new Response('',{status:503});const failed=collector.enqueue(news.id);assert.equal((await settled(collector,failed.id)).error,'source_unavailable');
 collector.close();db.prepare("INSERT INTO public_collection_jobs VALUES(?,?,'running',?,?,NULL,NULL)").run('restart-job',news.id,new Date(now()).toISOString(),new Date(now()).toISOString());
 const restarted=new PublicSourceCollector(db,{sources:[news],seed:{snapshots:[]},automatic:false,spacingMs:0,now,fetcher:async()=>new Response(newsHtml())});t.after(()=>restarted.close());assert.equal((await settled(restarted,'restart-job')).status,'succeeded');
});
test('registry changes invalidate cached snapshots and bootstrap data until a fresh successful extraction',async t=>{
 const {collector,db}=collectorFixture(t);collector.close();const changed={...news,title:'Новое официальное название'};
 const restarted=new PublicSourceCollector(db,{sources:[changed],automatic:false,seed:{snapshots:[parsePublicSource(news,newsHtml(),now)]},fetcher:async()=>new Response(newsHtml()),now});t.after(()=>restarted.close());
 assert.equal(restarted.snapshot(news.id),null);assert.equal(restarted.availability(news.id),'unavailable');assert.equal(restarted.list().sources[0].recordCount,0);
 await restarted.refresh(news.id);assert.equal(restarted.snapshot(news.id).items[0].title,changed.title);
});
test('shutdown during external IO prevents late snapshot writes',async t=>{
 let resolveFetch;const {collector,db}=collectorFixture(t,{fetcher:()=>new Promise(resolve=>resolveFetch=resolve)});
 const refresh=collector.refresh(news.id),before=db.prepare('SELECT payload FROM public_source_snapshots').get().payload;collector.close();resolveFetch(new Response(newsHtml([2,1,3])));await assert.rejects(refresh,status(503));assert.equal(db.prepare('SELECT payload FROM public_source_snapshots').get().payload,before);
});
test('general catalogue searches teams/names with pagination and stays usable when the legacy PDF catalogue fails',t=>{
 const {collector}=collectorFixture(t),legacy={read(){throw Object.assign(new Error('PDF outage'),{status:503});},get(){throw Object.assign(new Error('PDF outage'),{status:503});}},catalog=new PublicAchievementCatalog(collector,legacy);
 const result=catalog.search('сборная',1,1);assert.equal(result.total,2);assert.equal(result.items.length,1);assert.equal(result.items[0].sourceStatus,'matched');assert.equal(result.coverage.complete,false);assert.equal(catalog.get(collector.snapshot(news.id).items[0].id).participantName,'Гутид');
 assert.throws(()=>catalog.search('a'),status(400));assert.throws(()=>catalog.search('Гутид',20,0,'unknown-source'),status(400));
});
const ownerA='a'.repeat(64),ownerB='b'.repeat(64),ownerM='c'.repeat(64),moderator={id:'mod',platformOwner:ownerM,canModerate:true};
const approval=version=>({version,decision:'approve',reason:'Проверены материалы и участие в соревновании.',ownershipConfirmed:true,teamMembershipConfirmed:true,verificationMethod:'organizer_confirmation',verificationReference:'Организатор подтвердил состав команды и участие кандидата в указанном финале.'});
function claimsFixture(t){
 const store=new DirectoryStore(':memory:');let clock=now(),html=newsHtml();const service=new IntegrationService(store,{dbPath:':memory:',automatic:false,providers:[],now:()=>clock,publicFetcher:async()=>new Response(html),publicCollectorOptions:{sources:[news,individual],seed:{snapshots:[parsePublicSource(news,html,()=>clock),parsePublicSource(individual,itmoHtml,()=>clock)]},spacingMs:0}});
 for(const [owner,id,name] of [[ownerA,'a','Иван Петров'],[ownerB,'b','Пётр Иванов'],[ownerM,'m','Модератор']]){const profile={...createInitialState().profile,name,consent:true,visible:true};store.db.prepare('INSERT INTO platform_accounts VALUES(?,?,?,?,?,?)').run(owner,id,1,JSON.stringify(profile),'{}',new Date(clock).toISOString());store.upsert({...profile,id},owner,true);}
 t.after(()=>{service.close();store.close();});return {service,store,claims:service.claims,setHtml:value=>html=value,advance:ms=>clock+=ms};
}
const support=recordId=>({recordId,consent:true,statement:'Я участвовал в этой команде; сведения и документ — private@example.com.',links:['https://proof.example/private']});
test('team approval requires separate membership proof, supports several members and never grants personal grade or FSP boost',t=>{
 const {service,store,claims}=claimsFixture(t),record=service.publicAchievements.search('Гутид').items[0];
 const a=claims.submit(ownerA,'a',support(record.id)),b=claims.submit(ownerB,'b',support(record.id));assert.equal(a.checks.nameMatch,null);assert(a.checks.reasons.includes('team_membership_required'));assert.equal(a.checks.ownershipAutomaticallyConfirmed,false);
 assert.throws(()=>claims.decide(moderator,a.id,{...approval(1),teamMembershipConfirmed:false}),status(400));assert.throws(()=>claims.decide(moderator,a.id,{...approval(1),teamMembershipConfirmed:'true'}),status(400));
 assert(claims.decide(moderator,a.id,approval(1)).active);assert(claims.decide(moderator,b.id,approval(1)).active);assert.equal(store.forOwner(ownerA).fsp,0);assert.equal(claims.count(ownerA),0);
 const evidence=service.employerEvidence(ownerB,'a').items[0];assert.equal(evidence.provider,'public-achievements');assert.equal(evidence.participation,'team');assert.match(evidence.teamRole,/личный вклад/);assert.equal(evidence.sourceUrl.includes('#page='),false);assert(!JSON.stringify(evidence).includes('private@example.com'));assert.equal(evidence.snapshotHash,undefined);
 const algorithm=service.publicAchievements.get(parsePublicSource(individual,itmoHtml,now).items[0].id);assert.equal(algorithm.dateBasis,'publication');assert.equal(claims.profile(ownerA).confirmed,null);
});
test('one individual result cannot be approved for two owners',t=>{
 const {service,claims}=claimsFixture(t),id=service.publicAchievements.search('Геннадий').items[0].id;
 const a=claims.submit(ownerA,'a',support(id)),b=claims.submit(ownerB,'b',support(id));claims.decide(moderator,a.id,approval(1));assert.throws(()=>claims.decide(moderator,b.id,approval(1)),status(409));assert.equal(service.evidence(ownerA).items[0].skills[0].scope,'individual_result');
});
test('per-result corrections, outage, profile rename and source expiry invalidate verification; unrelated formatting does not',async t=>{
 const {service,store,claims,setHtml,advance}=claimsFixture(t),id=service.publicAchievements.search('Гутид').items[0].id,row=claims.submit(ownerA,'a',support(id));claims.decide(moderator,row.id,approval(1));
 setHtml(newsHtml([1,2,3],'<nav>Changed menu</nav>'));await service.publicCollector.refresh(news.id);assert.equal(service.evidence(ownerA).items[0].status,'verified');
 const profile=claims.profile(ownerA);profile.name='Другой Кандидат';store.db.prepare('UPDATE platform_accounts SET profile=? WHERE owner=?').run(JSON.stringify(profile),ownerA);assert.equal(service.evidence(ownerA).items[0].status,'stale');profile.name='Иван Петров';store.db.prepare('UPDATE platform_accounts SET profile=? WHERE owner=?').run(JSON.stringify(profile),ownerA);
 setHtml(newsHtml([2,1,3]));await service.publicCollector.refresh(news.id);assert.equal(service.evidence(ownerA).items[0].status,'stale');assert.throws(()=>claims.decide(moderator,row.id,approval(2)),status(409));
 claims.withdraw(ownerA,'a',row.id,{version:2});claims.revise(ownerA,'a',row.id,{statement:support(id).statement,links:support(id).links,consent:true,version:3});claims.decide(moderator,row.id,approval(4));
 advance(7*86400000);assert.equal(service.evidence(ownerA).items[0].status,'stale');await service.publicCollector.refresh(news.id);assert.equal(service.evidence(ownerA).items[0].status,'verified');
 service.publicCollector.fetcher=async()=>new Response('',{status:503});await service.publicCollector.refresh(news.id);assert.equal(claims.view(claims.get(row.id)).checks.sourceStatus,'unavailable');assert.equal(service.evidence(ownerA).items[0].status,'stale');
});

test('collector schedules daily checks, backs off failed sources and blocks approval during network checks',async t=>{
 const {collector,db,advance}=collectorFixture(t);await collector.refresh(news.id);collector.tick();assert.equal(db.prepare('SELECT COUNT(*) AS n FROM public_collection_jobs').get().n,0);
 advance(86400000);collector.tick();const id=db.prepare('SELECT id FROM public_collection_jobs').get().id;await settled(collector,id);assert.equal(collector.availability(news.id),'matched');
 collector.fetcher=async()=>new Response('',{status:503});await collector.refresh(news.id);collector.tick();assert.equal(db.prepare('SELECT COUNT(*) AS n FROM public_collection_jobs').get().n,1);advance(3600000);collector.tick();assert.equal(db.prepare('SELECT COUNT(*) AS n FROM public_collection_jobs').get().n,2);await settled(collector,db.prepare("SELECT id FROM public_collection_jobs WHERE status='queued'").get().id);
 const fixture=claimsFixture(t),record=fixture.service.publicAchievements.search('Гутид').items[0],claim=fixture.claims.submit(ownerA,'a',support(record.id));let resolveFetch;fixture.service.publicCollector.fetcher=()=>new Promise(resolve=>resolveFetch=resolve);const check=fixture.service.publicCollector.refresh(news.id);assert.throws(()=>fixture.claims.decide(moderator,claim.id,approval(1)),status(409));resolveFetch(new Response(newsHtml()));await check;assert(fixture.claims.decide(moderator,claim.id,approval(1)).active);
});
test('bootstrap contains only extracted factual results and CLI retains last good snapshots on failed imports',t=>{
 const seed=JSON.parse(readFileSync(new URL('../integrations/data/public-achievements.json',import.meta.url),'utf8'));assert.equal(seed.snapshots.length,2);assert.equal(seed.snapshots.reduce((n,s)=>n+s.items.length,0),142);for(const snapshot of seed.snapshots){assert.equal(snapshot.items.length,sources.find(s=>s.id===snapshot.source.id).expectedRows);assert(snapshot.items.every(item=>item.identityVerified===false&&item.sourcePage===null));}
 const folder=mkdtempSync(join(tmpdir(),'hh-public-cli-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));const output=join(folder,'out.json'),file=join(folder,news.id+'.html');writeFileSync(file,newsHtml());
 const args=['scripts/import-public-achievements.mjs','--source',news.id,'--cached-dir',folder,'--output',output];const imported=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(imported.status,0,imported.stderr);assert.equal(JSON.parse(readFileSync(output)).snapshots[0].items.length,3);
 writeFileSync(file,'changed invalid markup');const failed=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(failed.status,1);assert.equal(JSON.parse(failed.stdout).results[0].previousSnapshotRetained,true);assert.equal(JSON.parse(readFileSync(output)).snapshots[0].items[0].place,1);
});
test('public search and source collection HTTP require candidate consent, moderator role and current identity',async t=>{
 const codes=new Map(),app=createAssessmentServer({dbPath:':memory:',authEnv:{},authMailer:async({email,code})=>codes.set(email,code),integrationOptions:{automatic:false,publicFetcher:async()=>new Response(newsHtml()),publicCollectorOptions:{sources:[news],seed:{snapshots:[parsePublicSource(news,newsHtml(),now)]},spacingMs:0,now}}});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;t.after(()=>new Promise(resolve=>{app.server.close(resolve);app.server.closeAllConnections();}));
 function client(){let identity;const cookies=new Map();return async(path,method='GET',data,headers={})=>{const res=await fetch(base+path,{method,headers:{Origin:base,Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),...(identity?{'X-Platform-Identity':identity}:{}),...(data===undefined?{}:{'Content-Type':'application/json'}),...headers},body:data===undefined?undefined:JSON.stringify(data)});for(const cookie of res.headers.getSetCookie()){const [k,v]=cookie.split(';')[0].split('=');cookies.set(k,v);}identity=res.headers.get('X-Platform-Identity')||identity;return {status:res.status,data:await res.json()};};}
 const guest=client(),candidate=client(),reviewer=client();async function register(c,login,role){const email=login+'@example.invalid';assert.equal((await c('/api/auth/register/request-code','POST',{email,login,role,password:'integration test password',consent:true,privacyVersion:PRIVACY_POLICY_VERSION,...(role==='candidate'?{name:'Иван Петров'}:{companyName:'Проверка'})})).status,202);return (await c('/api/auth/register/verify','POST',{email,code:codes.get(email)})).data.account;}
 await register(candidate,'public-parser-candidate','candidate');const mod=await register(reviewer,'public-parser-reviewer','employer');const old=await candidate('/api/platform/state'),state=createInitialState();state.profile.consent=true;state.profile.name='Иван Петров';assert.equal((await candidate('/api/platform/state','PUT',{state,baseRevision:old.data.revision})).status,200);
 assert.equal((await guest('/api/integrations/public-achievements/search?name=Гутид')).status,401);assert.equal((await reviewer('/api/integrations/public-achievements/search?name=Гутид')).status,403);assert.equal((await candidate('/api/integrations/public-achievements/search?name=Гутид&url=https://evil.example')).status,400);assert.equal((await candidate('/api/integrations/public-achievements/search?name=Гутид&name=Другой')).status,400);
 const result=await candidate('/api/integrations/public-achievements/search?name=Гутид');assert.equal(result.status,200);assert.equal(result.data.items[0].identityVerified,false);assert.equal((await candidate('/api/integrations/public-achievements/sources?x=1')).status,400);
 assert.equal((await candidate('/api/moderation/sources')).status,403);assert.equal((await reviewer('/api/moderation/sources')).status,403);assert.throws(()=>app.auth.store.setModerator(mod.id,true,'fixture'),error=>error.status===409);const staff=await app.auth.createModerator({login:'public-parser-moderator',email:'public-parser-moderator@example.invalid',password:'integration test password',actor:'fixture'});assert.equal((await reviewer('/api/auth/login','POST',{loginOrEmail:'public-parser-moderator',password:'integration test password'})).status,200);assert.equal((await reviewer('/api/moderation/sources')).status,200);
 const collect='/api/moderation/sources/'+news.id+'/collect';assert.equal((await reviewer(collect,'POST',{}, {'X-Platform-Identity':'auth:wrong'})).status,409);assert.equal((await reviewer(collect,'POST',{url:'https://evil.example'})).status,400);assert.equal((await reviewer('/api/moderation/sources/unknown/collect','POST',{})).status,404);assert.equal((await reviewer(collect,'GET')).status,405);
 const created=await reviewer(collect,'POST',{});assert.equal(created.status,202);assert.equal((await candidate('/api/moderation/sources/jobs/'+created.data.job.id)).status,403);await settled(app.integrations.publicCollector,created.data.job.id);assert.equal((await reviewer('/api/moderation/sources/jobs/'+created.data.job.id)).data.status,'succeeded');app.auth.store.setModerator(staff.id,false,'fixture');assert.equal((await reviewer('/api/moderation/sources/jobs/'+created.data.job.id)).status,403);
 const current=await candidate('/api/platform/state');current.data.state.profile.consent=false;assert.equal((await candidate('/api/platform/state','PUT',{state:current.data.state,baseRevision:current.data.revision})).status,200);assert.equal((await candidate('/api/integrations/public-achievements/search?name=Гутид')).status,409);
});
test('same event/team reported on registered mirror pages is deduplicated with stable search order',t=>{
 const db=new DatabaseSync(':memory:'),mirror={...table,id:'icpc-mirror-2025'},collector=new PublicSourceCollector(db,{sources:[table,mirror],seed:{snapshots:[parsePublicSource(table,tableHtml(),now),parsePublicSource(mirror,tableHtml(),now)]},automatic:false,now});t.after(()=>{collector.close();db.close();});const catalog=new PublicAchievementCatalog(collector,{read:()=>({items:[],sources:[]}),get(){throw Object.assign(new Error('not found'),{status:404});}}),result=catalog.search('University');assert.equal(result.total,2);assert.equal(result.items[0].place,1);assert.equal(new Set(result.items.map(item=>item.id)).size,2);
});
