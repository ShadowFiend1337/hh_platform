import { RequestError } from '../assessment.mjs';
import { PublicFspCatalog } from './public-fsp.mjs';
const norm=value=>value.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/gu,'е').replace(/\s+/gu,' ').trim();
export class PublicAchievementCatalog {
  constructor(collector,legacy=new PublicFspCatalog()){this.collector=collector;this.legacy=legacy;}
  read(){let legacy;try{legacy=this.legacy.read();}catch{legacy={items:[],sources:[]};}
    const items=[],sources=[...legacy.sources];
    for(const item of legacy.items){try{items.push({...item,...this.legacy.get(item.id),provider:'fsp-public',sourceKind:'pdf',publisher:'ФСП России'});}catch{/* An unavailable PDF must not hide independent HTML results. */}}
    for(const id of this.collector.sources.keys()){const snapshot=this.collector.snapshot(id);if(snapshot){sources.push(snapshot.source);items.push(...snapshot.items);}}
    // The same event/target key has one record, even if two registered pages
    // report it. Structured result sources take precedence over news.
    items.sort((a,b)=>(a.sourceKind==='news'?1:0)-(b.sourceKind==='news'?1:0)||a.sourceId.localeCompare(b.sourceId));
    const seen=new Set();
    return {schemaVersion:2,checkedAt:new Date(this.collector.now()).toISOString(),sources,items:items.filter(item=>{if(seen.has(item.id))return false;seen.add(item.id);return true;})};
  }
  get(id){let legacyError;try{return this.legacy.get(id);}catch(error){legacyError=error;}
    const item=this.read().items.find(item=>item.id===id);if(!item)throw legacyError.status!==404?legacyError:new RequestError(404,'Публичный результат не найден.');return item;}
  search(name,limit='20',offset='0',sourceId){
    if(typeof name!=='string'||name.trim().length<2||name.length>100||!/[\p{L}\p{N}]/u.test(name)||/[\u0000-\u001f]/u.test(name))throw new RequestError(400,'Введите имя участника или название команды, не менее двух символов.');
    if(!/^\d{1,2}$/u.test(String(limit))||+limit<1||+limit>50||!/^\d{1,6}$/u.test(String(offset)))throw new RequestError(400,'Недопустимые параметры страницы.');
    const data=this.read();if(sourceId&&!data.sources.some(source=>source.id===sourceId)&&!this.collector.sources.has(sourceId))throw new RequestError(400,'Источник не зарегистрирован.');
    const tokens=norm(name).split(' '),items=data.items.filter(item=>(!sourceId||item.sourceId===sourceId)&&tokens.every(token=>norm(item.participantName).includes(token)));
    return {provider:'public-achievements',status:'unverified',identityVerified:false,checkedAt:data.checkedAt,coverage:{sources:data.sources.length,records:data.items.length,complete:false},total:items.length,limit:+limit,offset:+offset,
      items:items.slice(+offset,+offset+(+limit)).map(item=>({...item,status:'unverified',sourceStatus:item.provider==='public-achievements'?this.collector.availability(item.sourceId):'matched'}))};
  }
}
