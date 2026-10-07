import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectoryService } from '../directory.mjs';
import { validScoreCalibration } from '../semantic-worker.mjs';

// Deterministic protocol doubles test pair association; no model or network.
const rawQuery='Нужен специалист, который устранит дрейф датчика';
const retrievalQuery='устранит дрейф датчика';
const axis=cosine=>[cosine,Math.sqrt(1-cosine**2)];
const calibration=(changes={})=>({
  kind:'pooled-LDA-diagonal-shrinkage-v1',weights:[10,1],bias:0,threshold:4,shrink:0.1,split:'dev',
  featurePolicy:{features:['encoderCosine','crossEncoderRawLogit'],encoderQueryContext:'raw-query',
    encoderDocumentContext:'task-section-without-role',crossEncoderQueryContext:'raw-query',
    crossEncoderDocumentContext:'catalog-professional-role-newline-task-section',
    aggregation:'maximum-fused-score-over-task-sections',
    formula:'weights[0]*encoderCosine+weights[1]*crossEncoderRawLogit+bias'},
  hashes:{dataset:'a'.repeat(64),encoder:'b'.repeat(64),scores:'c'.repeat(64)},
  DEVmetrics:{resubstitution:true},...changes,
});
const quadraticCalibration=(changes={})=>{
  const value=calibration({kind:'class-QDA-diagonal-shrinkage-v1',quadraticMatrix:[[0,1],[1,0]],...changes});
  value.featurePolicy={...value.featurePolicy,
    formula:'features^T*quadraticMatrix*features+weights[0]*encoderCosine+weights[1]*crossEncoderRawLogit+bias'};
  return value;
};
const admission=(changes={})=>({kind:'query-max-applicability-top3-v1',threshold:2,limit:3,split:'dev',
  metrics:{resubstitution:true,heldOutScored:false,functionalBenchmarkScored:false},hashes:{dataset:'d'.repeat(64)},...changes});
const profile=(id,changes={})=>({id,name:'Вымышленный '+id,professionalRole:'Инженер электроники',
  specialization:'Embedded',desiredGrade:'Middle',confirmed:{specialization:'Embedded',grade:'Middle',score:90},
  visible:true,consent:true,synthetic:true,bio:`TASK:${id} Диагностика датчика`,stack:['C++'],
  city:'Москва',industry:'ИТ',format:'Гибрид',employmentType:'Полная занятость',experienceMonths:40,
  salaryFrom:100000,salaryTo:150000,languageCodes:['ru'],email:'private@example.com',phone:'+79990000000',
  portfolio:'',workHistory:'',careerAchievements:'',education:'',achievements:[],...changes});

class Encoder {
  info={status:'ready',name:'Synthetic unit encoder',version:'encoder-v1-fusion-pipeline',dimension:2,trained:true,
    threshold:0.75,reranker:{version:'ranker-v1-fusion',threshold:0.5,baseModel:'fixture/cross-encoder',
      revision:'a'.repeat(40),maxLength:512,scoreCalibration:calibration()}};
  sectionVectors={}; logits={}; calls=[]; rankCalls=[]; rawVector=[1,0];
  async start(){return this.info;}
  async encode(texts){
    this.calls.push(texts);
    return texts.map(text=>{
      if(text===rawQuery)return this.rawVector;
      if(text===retrievalQuery)return [1,0];
      const id=text.match(/TASK:([\w-]+)/u)?.[1];
      return id?this.sectionVectors[id]??axis(0.8):[1,0];
    });
  }
  async rerank(query,passages){
    this.rankCalls.push({query,passages});
    return passages.map(text=>this.logits[text.match(/TASK:([\w-]+)/u)?.[1]]??0);
  }
  close(){}
}
function service(t,seeds,encoder=new Encoder()){
  const value=new DirectoryService(':memory:',{seeds,encoder});t.after(()=>value.close());return value;
}

test('fusion pairs each cross logit with its own section vector and explains the winning fused section',async t=>{
  const encoder=new Encoder();encoder.sectionVectors={bio:axis(0.2),history:axis(0.8)};encoder.logits={bio:3,history:0};
  const value=service(t,[profile('person',{bio:'TASK:bio Первичная диагностика',workHistory:'TASK:history Устранил дрейф датчика'})],encoder);
  const result=await value.search(rawQuery);
  assert.equal(result.total,1);
  const item=result.items[0];
  assert.equal(item.semanticScore,1,'Identity retains the original first-stage retrieval cosine');
  assert.ok(Math.abs(item.rank-8)<1e-5);
  assert.equal(item.rerankerScore,0,'The winning fused section has a lower raw logit than biography');
  assert.match(item.reason,/Устранил дрейф датчика/u);assert.doesNotMatch(item.reason,/Первичная диагностика/u);
  assert.equal(result.model.rerankerAggregation,'max-fused-task-sections-v1');
  assert.equal(encoder.rankCalls[0].query,rawQuery);
  assert.doesNotMatch(JSON.stringify(item),/sectionVectors|sectionCosines|publicPayload|private@example|79990000000/u);
});

test('fusion encodes and caches the raw task query rather than reusing the stripped retrieval vector',async t=>{
  const encoder=new Encoder();encoder.rawVector=[0,1];encoder.sectionVectors={bio:[1,0],history:[0,1]};
  encoder.logits={bio:5,history:0};encoder.info.reranker.scoreCalibration.threshold=8;
  const value=service(t,[profile('person',{bio:'TASK:bio Общая диагностика',workHistory:'TASK:history Компенсация дрейфа'})],encoder);
  const result=await value.search(rawQuery);
  assert.equal(result.total,1);assert.equal(result.items[0].rank,10);assert.equal(result.items[0].rerankerScore,0);
  assert.match(result.items[0].reason,/Компенсация дрейфа/u);
  assert.equal(encoder.calls.filter(texts=>texts.length===1&&texts[0]===rawQuery).length,1);
  assert.equal(encoder.calls.filter(texts=>texts.length===1&&texts[0]===retrievalQuery).length,1);
  const before=encoder.calls.length;await value.search(rawQuery);
  assert.equal(encoder.calls.length,before,'Both query contexts reuse versioned cached vectors');
});

test('fusion score determines ordering and its own cutoff without changing the frozen stage cutoff',async t=>{
  const encoder=new Encoder();encoder.sectionVectors={logit:axis(0.2),cosine:axis(0.9),rejected:axis(0.1)};
  encoder.logits={logit:5,cosine:0,rejected:1};
  const result=await service(t,[profile('logit'),profile('cosine'),profile('rejected')],encoder).search(rawQuery);
  assert.deepEqual(result.items.map(item=>item.person.id),['cosine','logit']);
  assert.equal(result.items[0].rerankerScore,0,'A raw logit below the original cutoff may pass valid fusion');
  assert.ok(Math.abs(result.items[0].rank-9)<1e-5);assert.ok(Math.abs(result.items[1].rank-7)<1e-5);
  assert.equal(encoder.info.reranker.threshold,0.5);assert.equal(encoder.info.reranker.scoreCalibration.threshold,4);
});

test('QDA includes both off-diagonal terms and selects the winning paired section',async t=>{
  const encoder=new Encoder();encoder.sectionVectors={bio:axis(0.2),history:axis(0.8)};encoder.logits={bio:3,history:1};
  encoder.info.reranker.scoreCalibration=quadraticCalibration({weights:[0,0],threshold:0.5});
  const result=await service(t,[profile('person',{bio:'TASK:bio Первичная диагностика',workHistory:'TASK:history Компенсировал дрейф'})],encoder).search(rawQuery);
  assert.equal(result.total,1);assert.ok(Math.abs(result.items[0].rank-1.6)<1e-5);assert.equal(result.items[0].rerankerScore,1);
  assert.match(result.items[0].reason,/Компенсировал дрейф/u);
  assert.equal(result.items[0].semanticScore,1);
});

test('QDA quadratic, linear and bias terms jointly apply the calibrated cutoff',async t=>{
  const encoder=new Encoder();encoder.sectionVectors={person:axis(0.4)};encoder.logits={person:2};
  encoder.info.reranker.scoreCalibration=quadraticCalibration({quadraticMatrix:[[2,1],[1,-0.5]],weights:[3,2],bias:1,threshold:6});
  const value=service(t,[profile('person')],encoder),result=await value.search(rawQuery);
  assert.equal(result.total,1);assert.ok(Math.abs(result.items[0].rank-6.12)<1e-5);assert.equal(result.items[0].rerankerScore,2);
  encoder.info.reranker.scoreCalibration.threshold=6.2;
  assert.equal((await value.search(rawQuery)).total,0);
});

for(const [name,matrix] of [
  ['absent',undefined],['shape',[[1,0]]],['ragged',[[1,0],[0]]],['string',[[1,'0'],['0',1]]],
  ['nonfinite',[[1,Infinity],[Infinity,1]]],['asymmetric',[[1,0.2],[0.3,1]]],
])test('QDA with '+name+' quadratic matrix is rejected',async t=>{
  const encoder=new Encoder();encoder.info.reranker.scoreCalibration=quadraticCalibration({quadraticMatrix:matrix});
  await assert.rejects(service(t,[profile('person')],encoder).search(rawQuery),error=>error.status===503);
  assert.equal(encoder.rankCalls.length,0);
});

test('LDA does not silently accept an unrecognized quadratic term',async t=>{
  const encoder=new Encoder();encoder.info.reranker.scoreCalibration=calibration({quadraticMatrix:[[1,0],[0,1]]});
  await assert.rejects(service(t,[profile('person')],encoder).search(rawQuery),error=>error.status===503);
});

test('QDA requires its quadratic formula in the pinned feature policy',()=>{
  const value=quadraticCalibration();assert.ok(validScoreCalibration(value));
  value.featurePolicy.formula=calibration().featurePolicy.formula;
  assert.equal(validScoreCalibration(value),false);
});

test('an unchanged raw and retrieval query shares its embedding without extra inference',async t=>{
  const encoder=new Encoder();
  const value=service(t,[profile('person')],encoder);
  const result=await value.search(retrievalQuery);
  assert.equal(result.total,1);
  assert.equal(encoder.calls.filter(texts=>texts.length===1&&texts[0]===retrievalQuery).length,1);
});

for(const [name,changes] of [
  ['null',null],['kind',{kind:'unknown'}],['weights length',{weights:[1]}],['string coefficient',{weights:['1',1]}],
  ['nonfinite coefficient',{weights:[Infinity,1]}],['boolean coefficient',{weights:[true,1]}],
  ['bias',{bias:NaN}],['cutoff',{threshold:Infinity}],['shrink',{shrink:0.2}],['split',{split:'test'}],
  ['feature policy',{featurePolicy:{}}],['hashes',{hashes:{dataset:'invalid'}}],['missing hashes',{hashes:{}}],
  ['DEV provenance',{DEVmetrics:{resubstitution:false}}],
])test('invalid fusion '+name+' returns 503 without silent raw-logit fallback',async t=>{
  const encoder=new Encoder();encoder.info.reranker.scoreCalibration=changes===null?null:calibration(changes);
  const value=service(t,[profile('person')],encoder);
  await assert.rejects(value.search(rawQuery),error=>error.status===503);
  assert.equal(encoder.rankCalls.length,0);
  assert.equal((await value.search('',{specialization:'Embedded'})).total,1);
});

test('fusion descriptor validates feature order independently of JSON field order',()=>{
  const value=calibration();value.featurePolicy=Object.fromEntries(Object.entries(value.featurePolicy).reverse());
  assert.ok(validScoreCalibration(value));
  value.featurePolicy.features.reverse();assert.equal(validScoreCalibration(value),false);
});

test('task section absent from the indexed document returns 503 instead of pairing unrelated vectors',async t=>{
  const value=service(t,[profile('person')]);
  value.store.db.prepare('UPDATE directory_candidates SET document=?,document_hash=? WHERE id=?')
    .run(JSON.stringify(['TASK:other Другие задачи']),'unaligned-index','person');
  await assert.rejects(value.search(rawQuery),error=>error.status===503);
});

for(const [name,change] of [
  ['encoder version',encoder=>{encoder.info.version='replacement';}],
  ['calibration coefficients',encoder=>{encoder.info.reranker.scoreCalibration.weights[0]+=1;}],
])test(name+' changed while encoding raw fusion query cannot enter cache or ranking',async t=>{
  const encoder=new Encoder(),value=service(t,[profile('person')],encoder);
  const original=encoder.encode.bind(encoder);
  encoder.encode=async texts=>{const vectors=await original(texts);if(texts[0]===rawQuery)change(encoder);return vectors;};
  await assert.rejects(value.search(rawQuery),error=>error.status===503);
  assert.equal(encoder.rankCalls.length,0);
  assert.ok([...value.queryCache.keys()].every(key=>!key.endsWith('\n'+rawQuery)));
});

test('fusion calibration changed during neural scoring rejects mixed-policy results',async t=>{
  const encoder=new Encoder(),value=service(t,[profile('person')],encoder),original=encoder.rerank.bind(encoder);
  encoder.rerank=async(query,passages)=>{const scores=await original(query,passages);encoder.info.reranker.scoreCalibration.bias+=1;return scores;};
  await assert.rejects(value.search(rawQuery),error=>error.status===503);
});

test('consent revoked during raw query encoding excludes the profile after fusion',async t=>{
  const encoder=new Encoder(),person=profile('owner'),value=service(t,[],encoder);
  value.store.upsert(person,'owner-A',true);
  const original=encoder.encode.bind(encoder);
  encoder.encode=async texts=>{const vectors=await original(texts);if(texts[0]===rawQuery)value.store.upsert({...person,consent:false},'owner-A',true);return vectors;};
  assert.equal((await value.search(rawQuery,{}, {owner:'owner-A'})).total,0);
});

test('admission does not append weak profiles to a nonempty strong result list',async t=>{
  const encoder=new Encoder();encoder.info.reranker.scoreCalibration.admission=admission();
  encoder.sectionVectors={strong:axis(0.8),weak:axis(0.3)};
  const result=await service(t,[profile('strong'),profile('weak')],encoder).search(rawQuery);
  assert.deepEqual(result.items.map(item=>item.person.id),['strong']);
  assert.equal(result.items[0].approximate,undefined);assert.deepEqual(result.warnings,[]);
  assert.equal(encoder.info.reranker.scoreCalibration.threshold,4,'The strong cutoff stays unchanged');
});

test('only zero strong matches admits at most three nearest profiles above the DEV floor',async t=>{
  const encoder=new Encoder();encoder.info.reranker.scoreCalibration.admission=admission();
  encoder.sectionVectors={first:axis(0.39),second:axis(0.35),third:axis(0.3),fourth:axis(0.25),tooWeak:axis(0.1)};
  const result=await service(t,['first','second','third','fourth','tooWeak'].map(id=>profile(id)),encoder).search(rawQuery);
  assert.equal(result.total,3);assert.deepEqual(result.items.map(item=>item.person.id),['first','second','third']);
  assert.ok(result.items.every(item=>item.approximate===true&&item.rank>=2&&item.rank<4));
  assert.deepEqual(result.warnings,['Точных совпадений нет. Показаны ближайшие профили.']);
});

test('profiles below the admission floor remain an empty result without an approximate warning',async t=>{
  const encoder=new Encoder();encoder.info.reranker.scoreCalibration.admission=admission();encoder.sectionVectors={person:axis(0.1)};
  const result=await service(t,[profile('person')],encoder).search(rawQuery);
  assert.equal(result.total,0);assert.deepEqual(result.warnings,[]);
});

test('without admission metadata the original strong cutoff still produces empty results',async t=>{
  const encoder=new Encoder();encoder.sectionVectors={person:axis(0.3)};
  const result=await service(t,[profile('person')],encoder).search(rawQuery);
  assert.equal(result.total,0);assert.deepEqual(result.warnings,[]);
});

test('approximate selection uses fresh consent and filters before deciding whether strong matches exist',async t=>{
  const encoder=new Encoder(),strong=profile('strong'),weak=profile('weak');
  encoder.info.reranker.scoreCalibration.admission=admission();encoder.sectionVectors={strong:axis(0.8),weak:axis(0.3)};
  const value=service(t,[],encoder);value.store.upsert(strong,'owner-strong',true);value.store.upsert(weak,'owner-weak',true);
  const original=encoder.rerank.bind(encoder);
  encoder.rerank=async(query,passages)=>{const scores=await original(query,passages);value.store.upsert({...strong,consent:false},'owner-strong',true);return scores;};
  const result=await value.search(rawQuery);
  assert.deepEqual(result.items.map(item=>item.person.id),['weak']);assert.equal(result.items[0].approximate,true);
});

test('withdrawn weak profiles are excluded from the approximate list after neural scoring',async t=>{
  const encoder=new Encoder(),person=profile('owner');encoder.info.reranker.scoreCalibration.admission=admission();
  encoder.sectionVectors={owner:axis(0.3)};const value=service(t,[],encoder);value.store.upsert(person,'owner-A',true);
  const original=encoder.rerank.bind(encoder);
  encoder.rerank=async(query,passages)=>{const scores=await original(query,passages);value.store.upsert({...person,consent:false},'owner-A',true);return scores;};
  const result=await value.search(rawQuery);assert.equal(result.total,0);assert.deepEqual(result.warnings,[]);
});

test('approximate candidates remain constrained by explicit SQL filters',async t=>{
  const encoder=new Encoder();encoder.info.reranker.scoreCalibration.admission=admission();
  encoder.sectionVectors={allowed:axis(0.3),excluded:axis(0.8)};
  const result=await service(t,[profile('allowed'),profile('excluded',{salaryFrom:250000})],encoder).search(rawQuery,{salaryMax:150000});
  assert.deepEqual(result.items.map(item=>item.person.id),['allowed']);assert.equal(result.items[0].approximate,true);
});

test('an admitted list paginates within its three-result total',async t=>{
  const encoder=new Encoder();encoder.info.reranker.scoreCalibration.admission=admission();
  encoder.sectionVectors={first:axis(0.39),second:axis(0.35),third:axis(0.3),fourth:axis(0.25)};
  const result=await service(t,['first','second','third','fourth'].map(id=>profile(id)),encoder).search(rawQuery,{}, {offset:2,limit:2});
  assert.equal(result.total,3);assert.deepEqual(result.items.map(item=>item.person.id),['third']);assert.equal(result.items[0].approximate,true);
});

test('an admission descriptor never masks a neural failure',async t=>{
  const encoder=new Encoder();encoder.info.reranker.scoreCalibration.admission=admission();
  encoder.rerank=async()=>{throw new Error('fixture model failure');};
  await assert.rejects(service(t,[profile('person')],encoder).search(rawQuery),error=>error.status===503);
});

for(const [name,changes] of [
  ['null',null],['kind',{kind:'unknown'}],['threshold',{threshold:Infinity}],['string threshold',{threshold:'2'}],
  ['limit',{limit:4}],['split',{split:'test'}],['metrics',{metrics:{resubstitution:false,heldOutScored:false,functionalBenchmarkScored:false}}],
  ['heldout use',{metrics:{resubstitution:true,heldOutScored:true,functionalBenchmarkScored:false}}],
  ['benchmark use',{metrics:{resubstitution:true,heldOutScored:false,functionalBenchmarkScored:true}}],
  ['hashes',{hashes:{dataset:'invalid'}}],
])test('invalid admission '+name+' rejects the descriptor instead of changing search semantics',async t=>{
  const encoder=new Encoder();encoder.info.reranker.scoreCalibration.admission=changes===null?null:admission(changes);
  await assert.rejects(service(t,[profile('person')],encoder).search(rawQuery),error=>error.status===503);
  assert.equal(encoder.rankCalls.length,0);
});

test('changing admission during inference rejects mixed-policy approximate results',async t=>{
  const encoder=new Encoder();encoder.info.reranker.scoreCalibration.admission=admission();encoder.sectionVectors={person:axis(0.3)};
  const original=encoder.rerank.bind(encoder);
  encoder.rerank=async(query,passages)=>{const scores=await original(query,passages);encoder.info.reranker.scoreCalibration.admission.threshold-=1;return scores;};
  await assert.rejects(service(t,[profile('person')],encoder).search(rawQuery),error=>error.status===503);
});
