import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { RequestError } from '../assessment.mjs';
import { fetchPublicSource, parsePublicSource, validateSource, compatibleSnapshot } from './public-parsers.mjs';

const registryPath=new URL('./data/public-achievement-sources.json',import.meta.url);
const seedPath=new URL('./data/public-achievements.json',import.meta.url);
const iso=now=>new Date(now()).toISOString();
export function publicSourceRegistry() {return JSON.parse(readFileSync(registryPath,'utf8')).sources;}
export class PublicSourceCollector {
  constructor(db,{sources=publicSourceRegistry(),seed,now=Date.now,fetcher=fetch,automatic=true,onChange=()=>{},spacingMs=1100}={}) {
    this.db=db;this.now=now;this.fetcher=fetcher;this.sources=new Map();this.onChange=onChange;this.spacingMs=spacingMs;this.running=new Set();this.closed=false;this.processing=false;
    for(const source of sources){validateSource(source);if(this.sources.has(source.id))throw new Error('Duplicate public source ID');this.sources.set(source.id,structuredClone(source));}
    db.exec(`CREATE TABLE IF NOT EXISTS public_source_snapshots (
      source_id TEXT PRIMARY KEY, payload TEXT, status TEXT NOT NULL, last_success_at TEXT, last_attempt_at TEXT, error TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS public_collection_jobs (
      id TEXT PRIMARY KEY, source_id TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, error TEXT, result_count INTEGER
    ) STRICT;
    CREATE UNIQUE INDEX IF NOT EXISTS public_one_active_job ON public_collection_jobs(source_id) WHERE status IN ('queued','running');`);
    if(seed===undefined){try{seed=JSON.parse(readFileSync(seedPath,'utf8'));}catch{seed={snapshots:[]};}}
    for(const source of this.sources.values()){
      const snapshot=seed.snapshots?.find(item=>compatibleSnapshot(source,item));
      db.prepare('INSERT INTO public_source_snapshots VALUES(?,?,?,?,?,?) ON CONFLICT(source_id) DO NOTHING').run(source.id,snapshot?JSON.stringify(snapshot):null,snapshot?'ready':'empty',snapshot?.source.checkedAt||null,null,null);
    }
    db.prepare("UPDATE public_collection_jobs SET status='queued' WHERE status='running'").run();
    this.wake();
    if(automatic){this.timer=setInterval(()=>this.tick(),60000);this.timer.unref();}
  }
  source(id){const source=this.sources.get(id);if(!source)throw new RequestError(404,'Источник не зарегистрирован.');return source;}
  state(id){this.source(id);return this.db.prepare('SELECT * FROM public_source_snapshots WHERE source_id=?').get(id);}
  snapshot(id){const state=this.state(id),snapshot=state.payload?JSON.parse(state.payload):null;return compatibleSnapshot(this.source(id),snapshot)?snapshot:null;}
  availability(id){const state=this.state(id);if(state.status==='missing')return 'missing';if(!this.snapshot(id)||state.status!=='ready'||!state.last_success_at||Date.parse(state.last_success_at)+7*86400000<=this.now())return 'unavailable';return 'matched';}
  list(){return {sources:[...this.sources.values()].map(source=>{const state=this.state(source.id),snapshot=this.snapshot(source.id),job=this.db.prepare("SELECT * FROM public_collection_jobs WHERE source_id=? AND status IN ('queued','running')").get(source.id);return {
    id:source.id,publisher:source.publisher,title:source.title,sourceUrl:source.sourceUrl,sourceKind:source.sourceKind,parserVersion:source.parser,
    status:this.availability(source.id),lastSuccessAt:state.last_success_at,lastAttemptAt:state.last_attempt_at,lastError:state.error,recordCount:snapshot?.items.length||0,activeJob:job?this.publicJob(job):null,
  };})};}
  publicJob(row){return {id:row.id,sourceId:row.source_id,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at,error:row.error,resultCount:row.result_count};}
  job(id){const row=this.db.prepare('SELECT * FROM public_collection_jobs WHERE id=?').get(id);if(!row)throw new RequestError(404,'Задача сбора не найдена.');return this.publicJob(row);}
  enqueue(id){this.source(id);const existing=this.db.prepare("SELECT * FROM public_collection_jobs WHERE source_id=? AND status IN ('queued','running')").get(id);if(existing)return this.publicJob(existing);
    const job=randomUUID(),at=iso(this.now);this.db.prepare("INSERT INTO public_collection_jobs VALUES(?,?,'queued',?,?,NULL,NULL)").run(job,id,at,at);this.wake();return this.job(job);}
  wake(){setImmediate(()=>{if(!this.closed)void this.drain().catch(()=>{});});}
  async refresh(id){
    const source=this.source(id);if(this.running.has(id))throw new RequestError(409,'Источник уже обновляется.');this.running.add(id);
    const previous=this.snapshot(id);let snapshot,error=null,status='ready';
    this.db.prepare('UPDATE public_source_snapshots SET last_attempt_at=? WHERE source_id=?').run(iso(this.now),id);
    try{snapshot=parsePublicSource(source,await fetchPublicSource(source,this.fetcher),this.now);}
    catch(cause){error=cause.code==='identity_not_found'?'source_missing':cause.code==='invalid_source_response'?'invalid_source_response':'source_unavailable';status=error==='source_missing'?'missing':'error';}
    finally{this.running.delete(id);}
    if(this.closed)throw new RequestError(503,'Сервис завершает работу.');
    if(snapshot)this.db.prepare("UPDATE public_source_snapshots SET payload=?,status='ready',last_success_at=?,error=NULL WHERE source_id=?").run(JSON.stringify(snapshot),iso(this.now),id);
    else this.db.prepare('UPDATE public_source_snapshots SET status=?,error=? WHERE source_id=?').run(status,error,id);
    this.onChange();this.wake();
    return {sourceId:id,reviewedHash:previous?.source.documentHash||'0'.repeat(64),fetchedHash:snapshot?.source.documentHash||null,
      status:snapshot?(previous?.source.documentHash===snapshot.source.documentHash?'matched':'changed'):status==='missing'?'missing':'unavailable',checkedAt:iso(this.now),resultCount:snapshot?.items.length||null,error};
  }
  async drain(){if(this.closed||this.processing)return;this.processing=true;
    try{while(!this.closed){const row=this.db.prepare("SELECT * FROM public_collection_jobs WHERE status='queued' ORDER BY created_at,id LIMIT 1").get();if(!row)break;
      if(this.running.has(row.source_id))break;
      this.db.prepare("UPDATE public_collection_jobs SET status='running',updated_at=? WHERE id=?").run(iso(this.now),row.id);
      try{const outcome=await this.refresh(row.source_id);this.db.prepare('UPDATE public_collection_jobs SET status=?,error=?,result_count=?,updated_at=? WHERE id=?').run(outcome.error?'failed':'succeeded',outcome.error,outcome.resultCount,iso(this.now),row.id);}
      catch(cause){if(!this.closed)this.db.prepare("UPDATE public_collection_jobs SET status='failed',error='source_unavailable',updated_at=? WHERE id=?").run(iso(this.now),row.id);}
      if(!this.closed&&this.spacingMs)await new Promise(resolve=>{this.resume=resolve;this.delay=setTimeout(resolve,this.spacingMs);this.delay.unref();});
    }}finally{this.processing=false;}
  }
  tick(){for(const source of this.sources.values()){const state=this.state(source.id),interval=state.status==='ready'?86400000:3600000;
    if(!state.last_attempt_at||Date.parse(state.last_attempt_at)+interval<=this.now())this.enqueue(source.id);}
    // Bound completed operational history; preserve active work.
    this.db.prepare("DELETE FROM public_collection_jobs WHERE status IN ('succeeded','failed') AND updated_at<?").run(new Date(this.now()-30*86400000).toISOString());}
  close(){this.closed=true;clearInterval(this.timer);clearTimeout(this.delay);this.resume?.();}
}
