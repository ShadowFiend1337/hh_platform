import { createHash } from 'node:crypto';
import { RequestError } from '../assessment.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export class PublicSourceChecks {
  constructor(integrations,{fetcher=fetch}={}) {
    this.integrations=integrations;this.db=integrations.db;this.now=integrations.now;this.fetcher=fetcher;this.running=new Set();
    this.db.exec(`CREATE TABLE IF NOT EXISTS fsp_public_source_checks (
      source_id TEXT PRIMARY KEY, reviewed_hash TEXT NOT NULL, fetched_hash TEXT,
      status TEXT NOT NULL CHECK(status IN ('matched','changed','unavailable','missing')),
      checked_at TEXT NOT NULL
    ) STRICT;`);
  }
  view(sourceId) {
    const row=this.db.prepare('SELECT * FROM fsp_public_source_checks WHERE source_id=?').get(sourceId);
    return row?{sourceId:row.source_id,reviewedHash:row.reviewed_hash,fetchedHash:row.fetched_hash,status:row.status,checkedAt:row.checked_at}:null;
  }
  status(source) {
    const row=this.view(source.sourceId);
    // A newly reviewed catalog supersedes a check against its older hash.
    if(!row || row.reviewedHash!==source.documentHash && row.fetchedHash===source.documentHash) return null;
    return row.status==='matched' && row.fetchedHash!==source.documentHash ? 'changed' : row.status;
  }
  async check(sourceId) {
    const source=this.integrations.publicCatalog.read().sources.find(source=>source.id===sourceId);
    if(!source) throw new RequestError(404,'Источник не найден.');
    const url=new URL(source.sourceUrl);
    if(url.origin!=='https://fsp-russia.ru' || !/^\/upload\/iblock\/[a-z\d]+\/[a-z\d]+\.pdf$/u.test(url.pathname) || url.search || url.hash || url.username || url.password) throw new RequestError(400,'Проверяется только зарегистрированный официальный PDF ФСП.');
    if(this.running.has(sourceId)) throw new RequestError(409,'Источник уже проверяется.');
    this.running.add(sourceId);
    let status='unavailable',fetchedHash=null;
    try {
      const response=await this.fetcher(url.href,{redirect:'error',signal:AbortSignal.timeout(10000),headers:{'User-Agent':'Predel-FSP-Source-Check/1.0',Accept:'application/pdf'}});
      if(response.status===404) status='missing';
      else if(response.ok) {
        if(Number(response.headers.get('content-length'))>10_000_000) throw new Error('too large');
        const chunks=[];let size=0;
        for await(const chunk of response.body){size+=chunk.length;if(size>10_000_000)throw new Error('too large');chunks.push(chunk);}
        const bytes=Buffer.concat(chunks);
        if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw new Error('not PDF');
        fetchedHash=hash(bytes);status=fetchedHash===source.documentHash?'matched':'changed';
      }
      if(this.integrations.closed) throw new RequestError(503,'Сервис завершает работу.');
    } catch(error) {if(this.integrations.closed)throw error;status='unavailable';}
    finally {this.running.delete(sourceId);}
    this.db.prepare(`INSERT INTO fsp_public_source_checks VALUES(?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET
      reviewed_hash=excluded.reviewed_hash,fetched_hash=excluded.fetched_hash,status=excluded.status,checked_at=excluded.checked_at`)
      .run(sourceId,source.documentHash,fetchedHash,status,new Date(this.now()).toISOString());
    this.integrations.claims.tick();return this.view(sourceId);
  }
}
