import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'parse5';
import {publicSourceRegistry} from '../server/integrations/public-collector.mjs';
import {fetchPublicSource,parsePublicSource,nodes,registeredUrl} from '../server/integrations/public-parsers.mjs';
import {remoteText} from '../server/integrations/provider-http.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
async function main(){
  const args=process.argv.slice(2),options={};
  for(let i=0;i<args.length;i++){if(args[i]==='--discover')options.discover=true;else if(['--source','--cached-dir','--output'].includes(args[i])&&args[i+1]&&!args[i+1].startsWith('--'))options[args[i].slice(2)]=args[++i];else throw new Error('Usage: npm run import:public-achievements -- [--source ID] [--cached-dir PATH] [--output PATH] [--discover]');}
  const registry=publicSourceRegistry();let selected=registry;
  if(options.source){selected=registry.filter(source=>source.id===options.source);if(!selected.length)throw new Error('Source is not registered');}
  if(options.discover){
    const url='https://www.fsp-russia.ru/press/news/',html=await remoteText(url,{headers:{'User-Agent':'Predel-Public-Discovery/1.0'}}),candidates=new Set();
    for(const anchor of nodes(parse(html),n=>n.tagName==='a')){try{const link=new URL(anchor.attrs?.find(a=>a.name==='href')?.value,url);registeredUrl({parser:'fsp-news-places-v1',sourceUrl:link.href});candidates.add(link.href);}catch{}}
    console.log(JSON.stringify({discoveryUrl:url,candidates:[...candidates],automaticallyRegistered:false},null,2));return;
  }
  const output=resolve(options.output||resolve(root,'server/integrations/data/public-achievements.json'));let existing={snapshots:[]};
  try{existing=JSON.parse(await readFile(output,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  const snapshots=new Map(existing.snapshots.map(snapshot=>[snapshot.source.id,snapshot])),results=[];
  for(const source of selected){
    try{const html=options['cached-dir']?await readFile(resolve(options['cached-dir'],source.id+'.html'),'utf8'):await fetchPublicSource(source);
      const snapshot=parsePublicSource(source,html);snapshots.set(source.id,snapshot);results.push({sourceId:source.id,status:'parsed',records:snapshot.items.length});}
    catch(error){results.push({sourceId:source.id,status:'failed',error:['invalid_source_response','identity_not_found'].includes(error.code)?error.code:'source_unavailable',previousSnapshotRetained:snapshots.has(source.id)});}
  }
  await mkdir(dirname(output),{recursive:true});const temp=output+'.tmp';await writeFile(temp,JSON.stringify({schemaVersion:1,snapshots:[...snapshots.values()]},null,2)+'\n');await rename(temp,output);
  console.log(JSON.stringify({output,results,identityVerified:false},null,2));if(results.some(result=>result.status==='failed'))process.exitCode=1;
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
