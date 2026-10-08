import { createHash } from 'node:crypto';
import { parse } from 'parse5';
import { ProviderError, remoteText } from './provider-http.mjs';

export const digest = value => createHash('sha256').update(value).digest('hex');
const bad = () => { throw new ProviderError('invalid_source_response'); };
const attr = (node,name) => node.attrs?.find(item=>item.name===name)?.value;
export function nodes(root,predicate) {
  const found=[],stack=[root];let visited=0;
  while(stack.length){const node=stack.pop();if(++visited>50000)bad();if(predicate(node))found.push(node);stack.push(...(node.childNodes||[]).slice().reverse());}
  return found;
}
export function plain(node) {
  const stack=[node],text=[];let visited=0;
  while(stack.length){const n=stack.pop();if(++visited>50000)bad();if(['script','style','template','noscript'].includes(n.tagName)||attr(n,'hidden')!==undefined||attr(n,'aria-hidden')==='true')continue;
    if(n.nodeName==='#text')text.push(n.value);else{if(['br','p','li','h1','h2','h3','h4','div','tr'].includes(n.tagName))text.push('\n');stack.push(...(n.childNodes||[]).slice().reverse());}}
  return text.join('').replace(/[\t \u00a0]+/gu,' ').replace(/ *\n */gu,'\n').trim();
}
const clean = value => value.replace(/\s+/gu,' ').trim();
const normalized = value => clean(value).normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/gu,'е');
const numeric = (value,max) => /^\d{1,7}$/u.test(value)&&Number(value)<=max?Number(value):bad();
const hosts={
  'icpc-pc2-table-v1':url=>url.origin==='https://worldfinals.icpc.global'&&/^\/scoreboard\/\d{4}\/finals\/index\.html$/u.test(url.pathname),
  'fsp-news-places-v1':url=>['https://fsp-russia.ru','https://www.fsp-russia.ru'].includes(url.origin)&&/^\/press\/news\/[a-z0-9-]+\/$/u.test(url.pathname),
  'itmo-vk-winner-v1':url=>url.origin==='https://news.itmo.ru'&&/^\/ru\/news\/\d+\/$/u.test(url.pathname),
};
export function registeredUrl(source) {
  let url;try{url=new URL(source.sourceUrl);}catch{throw new Error('Invalid registered public source');}
  if(!hosts[source.parser]?.(url)||url.search||url.hash||url.username||url.password)throw new Error('Untrusted public source URL or parser');
  return url;
}
export function validateSource(source) {
  registeredUrl(source);
  for(const field of ['id','eventKey','title','publisher','requiredTitle','discipline']) {
    if(typeof source[field]!=='string'||!source[field].trim()||source[field].length>300)throw new Error('Invalid source metadata: '+field);
  }
  if(!/^[a-z0-9-]{1,100}$/u.test(source.id)||!['team','individual'].includes(source.participation)
    ||!['news','table'].includes(source.sourceKind)||!['organizer','university'].includes(source.authority)
    ||!['event','publication'].includes(source.dateBasis)||!Number.isInteger(source.expectedRows)||source.expectedRows<1||source.expectedRows>2000
    ||!Array.isArray(source.requiredMarkers)||!source.requiredMarkers.length||source.requiredMarkers.some(value=>typeof value!=='string'||!value||value.length>300)
    ||!/^\d{4}-\d{2}-\d{2}$/u.test(source.occurredOn)||!Number.isFinite(Date.parse(source.occurredOn))
    ||new Date(source.occurredOn).toISOString().slice(0,10)!==source.occurredOn)throw new Error('Invalid public source metadata');
  if(source.parser==='icpc-pc2-table-v1'&&(source.participation!=='team'||source.sourceKind!=='table'))throw new Error('Invalid table participation');
  if(source.parser==='fsp-news-places-v1'&&(source.participation!=='team'||source.sourceKind!=='news'))throw new Error('Invalid team news metadata');
  if(source.parser==='itmo-vk-winner-v1'&&(source.participation!=='individual'||source.sourceKind!=='news'||source.dateBasis!=='publication'))throw new Error('Invalid individual news metadata');
}
export function compatibleSnapshot(source,snapshot) {
  // A changed registry definition needs a fresh extraction before approval.
  const fields=['id','eventKey','parser','sourceUrl','title','publisher','authority','sourceKind','discipline','occurredOn','dateBasis','participation','nomination','expectedRows','requiredTitle','requiredMarkers'];
  return Boolean(snapshot?.source&&Array.isArray(snapshot.items)&&snapshot.items.length===source.expectedRows
    &&fields.every(field=>JSON.stringify(source[field])===JSON.stringify(snapshot.source[field])));
}
export async function fetchPublicSource(source,fetcher=fetch) {
  return remoteText(registeredUrl(source).href,{headers:{Accept:'text/html','User-Agent':'Predel-Public-Achievements/1.0'}},fetcher);
}
function tableRows(source,root) {
  const text=plain(root);if(!text.includes(source.requiredTitle)||!text.includes('Final Scoreboard')||!text.includes('The contest has ended'))bad();
  const tables=nodes(root,n=>n.tagName==='table').filter(table=>{
    const headers=nodes(table,n=>n.tagName==='th').slice(0,4).map(n=>clean(plain(n)));
    return headers.join('|')==='Rank|Name|Solved|Time';
  });if(tables.length!==1)bad();
  const rows=[];
  for(const tr of nodes(tables[0],n=>n.tagName==='tr')){
    if(!['even','odd'].includes(attr(tr,'class')))continue;
    const cells=(tr.childNodes||[]).filter(n=>n.tagName==='td');if(!cells.length)continue;
    if(cells.length!==17)bad();
    const place=numeric(clean(plain(cells[0])),1000000),name=clean(plain(cells[1])).match(/^(\d{1,4}) (.+)$/u);
    if(!place||!name||name[2].length>200)bad();
    const solvedTasks=numeric(clean(plain(cells[2])),12),completionTime=numeric(clean(plain(cells[3])),10000000);
    rows.push({key:'team:'+name[1],participantName:name[2],place,solvedTasks,completionTime,region:null,
      result:`Место ${place}; командой решено задач: ${solvedTasks}; штрафное время: ${completionTime}. Состав команды в этой таблице не указан.`,
      excerpt:`${place} | ${name[2]} | ${solvedTasks} | ${completionTime}`,sourceLocator:'Строка команды '+name[1]});
  }
  return rows;
}
function fspNews(source,root) {
  const headings=nodes(root,n=>n.tagName==='h1');if(headings.length!==1||!plain(headings[0]).includes(source.requiredTitle))bad();
  const articles=nodes(root,n=>attr(n,'class')?.split(/\s/u).includes('opis'));if(articles.length!==1)bad();
  const text=plain(articles[0]);if(source.requiredMarkers.some(marker=>!clean(text).includes(marker)))bad();
  const block=text.match(/Итоги турнира([\s\S]+?)(?:Победители и призёры|Организаторы и партнёры)/u)?.[1];if(!block)bad();
  const rows=[];
  for(const line of block.split('\n').map(clean).filter(Boolean)){
    const match=line.match(/^[·•-]?\s*(\d+)-[ео] место\s*[—–-]\s*(.+?)[;.]*$/u);if(!match){if(/\d.*место/u.test(line))bad();continue;}
    const place=numeric(match[1],1000);if(!place)bad();
    const target=match[2].replace(/[;.]+$/u,'').trim(),team=target.match(/^команда «([^»]+)»(?: \(([^)]+)\))?$/u);
    const participantName=team?team[1]:target;if(!participantName||participantName.length>200)bad();
    rows.push({key:'team:'+normalized(participantName),participantName,place,solvedTasks:null,completionTime:null,region:team?.[2]||null,
      result:`Призовое место команды: ${place}. Новость организатора; состав команды и личный вклад не указаны.`,excerpt:clean(line).slice(0,160),sourceLocator:'Итоги турнира'});
  }
  return rows;
}
function itmoWinner(source,root) {
  const headings=nodes(root,n=>n.tagName==='h1');if(headings.length!==1)bad();
  const headline=clean(plain(headings[0])),match=headline.match(/^([А-ЯЁ][а-яё-]+ [А-ЯЁ][а-яё-]+) стал победителем VK Cup$/u);
  if(!match||!plain(root).includes('Engine')||!plain(root).includes('олимпиадное программирование'))bad();
  return [{key:'person:'+normalized(match[1]),participantName:match[1],place:1,solvedTasks:null,completionTime:null,region:null,
    result:'Победитель трека Engine (олимпиадное программирование) VK Cup 2020 по публикации университета. Указана дата публикации; точная дата соревнования из этой записи не устанавливается.',
    excerpt:headline,sourceLocator:'Заголовок новости'}];
}
const parsers={'icpc-pc2-table-v1':tableRows,'fsp-news-places-v1':fspNews,'itmo-vk-winner-v1':itmoWinner};
export function parsePublicSource(source,html,now=Date.now) {
  validateSource(source);
  if(typeof html!=='string'||Buffer.byteLength(html)>1000000||!parsers[source.parser])bad();
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(source.occurredOn)||!Number.isFinite(Date.parse(source.occurredOn))||Date.parse(source.occurredOn)>now())bad();
  const root=parse(html);
  if(source.requiredMarkers.some(marker=>!clean(plain(root)).includes(marker)))bad();
  const rows=parsers[source.parser](source,root);
  if(!rows.length||rows.length>2000||rows.length!==source.expectedRows||new Set(rows.map(row=>row.key)).size!==rows.length)bad();
  const checkedAt=new Date(now()).toISOString();
  const items=rows.map(row=>{
    const {key,...fields}=row;
    const record={id:digest(source.eventKey+'\0'+key),sourceId:source.id,provider:'public-achievements',title:source.title,
      publisher:source.publisher,authority:source.authority,sourceKind:source.sourceKind,discipline:source.discipline,occurredOn:source.occurredOn,dateBasis:source.dateBasis,
      participation:source.participation,nomination:source.nomination,role:source.participation==='team'?'team':'participant',
      sourceUrl:source.sourceUrl,sourcePage:null,...fields,extractionStatus:'parsed',identityVerified:false,parserVersion:source.parser};
    record.documentHash=digest(JSON.stringify(record));return record;
  });
  return {source:{...source,documentHash:digest(JSON.stringify(items.map(item=>[item.id,item.documentHash]).sort())),rawHash:digest(html),checkedAt},items};
}
