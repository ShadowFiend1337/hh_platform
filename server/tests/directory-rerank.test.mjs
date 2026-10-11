import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectoryService } from '../directory.mjs';
import { specializationLabels } from '../../shared/catalog.ts';

// Local authored profiles and deterministic protocol doubles; no model scoring.
const query = 'Устранить дрейф датчика';
const profile = (id, changes = {}) => ({ id, name: 'Вымышленный ' + id, professionalRole: 'Инженер электроники',
  specialization: 'Embedded', desiredGrade: 'Middle', confirmed: { specialization: 'Embedded', grade: 'Middle', score: 90 },
  visible: true, consent: true, synthetic: true, bio: `TASK:${id} Измерения и калибровка датчика`, stack: ['C++'],
  city: 'Москва', industry: 'ИТ', format: 'Гибрид', employmentType: 'Полная занятость', experienceMonths: 40,
  salaryFrom: 100000, salaryTo: 150000, languageCodes: ['ru'], email: 'private@example.com', phone: '+79990000000',
  portfolio: '', workHistory: '', careerAchievements: '', education: '', achievements: [], ...changes });

class Encoder {
  info = { status: 'ready', name: 'Synthetic unit encoder', version: 'encoder-v1-ranked-pipeline', dimension: 2,
    trained: true, threshold: 0.75, reranker: { version: 'rerank-v1', threshold: 0.5,
      baseModel: 'fixture/cross-encoder', revision: 'a'.repeat(40), maxLength: 512 } };
  cosine = {};
  scores = {};
  encodeCalls = [];
  rerankCalls = [];
  async start() { return this.info; }
  async encode(texts) {
    this.encodeCalls.push(texts);
    return texts.map(text => {
      if (text === query) return [1, 0];
      const id = text.match(/TASK:([\w-]+)/u)?.[1];
      if (!id) return [0, 1];
      const score = this.cosine[id] ?? 0.8;
      return [score, Math.sqrt(1 - score ** 2)];
    });
  }
  async rerank(text, passages) {
    this.rerankCalls.push({ query: text, passages });
    return passages.map(passage => this.scores[passage.match(/TASK:([\w-]+)/u)?.[1]] ?? 2);
  }
  close() {}
}
function service(t, seeds, encoder = new Encoder()) {
  const value = new DirectoryService(':memory:', { seeds, encoder });
  t.after(() => value.close()); return value;
}

test('neural reranking rescues low cosine and rejects an unrelated high-cosine candidate', async t => {
  const encoder = new Encoder(); encoder.cosine = { related: 0.2, unrelated: 0.95 }; encoder.scores = { related: 2, unrelated: -3 };
  const value = service(t, [profile('related'), profile('unrelated')], encoder);
  const result = await value.search(query);
  assert.deepEqual(result.items.map(item => item.person.id), ['related']);
  assert.ok(result.items[0].semanticScore < encoder.info.threshold, 'The old recall cutoff must not hide candidates from the second stage');
  assert.equal(result.items[0].rerankerScore, 2); assert.equal(result.items[0].rank, 2);
  assert.equal(encoder.rerankCalls[0].passages.length, 2);
  assert.deepEqual(result.model.stage, encoder.info.reranker);
  assert.equal(result.query, query);
  assert.ok(encoder.rerankCalls[0].passages.every(passage => passage.startsWith(specializationLabels.Embedded + '\nTASK:')),
    'Runtime context matches DEV: canonical specialization label plus actual professional section');
  assert.equal(result.model.rerankerAggregation,'max-professional-sections-v2');
  assert.doesNotMatch(JSON.stringify(result.items), /passage|documentHash|sourceId|taskSections|reasonSuffix|roleLabel|private@example|79990000000/u);
});

test('neural scoring sees all factual sections and explains the strongest task instead of the nearest identity', async t => {
  const encoder=new Encoder();
  encoder.scores={bio:-3,history:-2,achievement:2.25,education:-1};
  encoder.encode=async texts=>{
    encoder.encodeCalls.push(texts);
    return texts.map(text=>text===query||text.includes('Инженер электроники')?[1,0]:[0.2,Math.sqrt(0.96)]);
  };
  const person=profile('person',{bio:'TASK:bio Диагностика датчика',workHistory:'TASK:history Разработка протокола обмена',
    careerAchievements:'TASK:achievement Уменьшил дрейф датчика после калибровки',education:'TASK:education Радиотехника'});
  const result=await service(t,[person],encoder).search(query);
  assert.equal(result.items.length,1);
  assert.equal(result.items[0].semanticScore,1,'The nearest recall evidence was the identity section');
  assert.equal(result.items[0].rank,2.25);
  assert.match(result.items[0].reason,/Уменьшил дрейф датчика после калибровки/u);
  assert.doesNotMatch(result.items[0].reason,/Разработка протокола|Инженер электроники/u);
  assert.deepEqual(encoder.rerankCalls[0].passages, [person.bio,person.workHistory,person.careerAchievements,person.education].map(text=>specializationLabels.Embedded+'\n'+text));
  assert.equal(encoder.info.reranker.threshold,0.5,'Aggregation never changes the frozen cutoff');
});

test('50 complete profiles score all 200 task sections within the worker packet bound', async t => {
  const encoder=new Encoder();
  const people=Array.from({length:50},(_,index)=>profile('person-'+index,{
    workHistory:`TASK:history-${index} Работа с протоколом`,careerAchievements:`TASK:achievement-${index} Калибровка`,education:`TASK:education-${index} Радиотехника`}));
  const result=await service(t,people,encoder).search(query,{}, {limit:50});
  assert.equal(result.total,50);
  assert.equal(encoder.rerankCalls.flatMap(call=>call.passages).length,200);
  assert.ok(encoder.rerankCalls.every(call=>call.passages.length<=256));
  assert.ok(encoder.rerankCalls.flatMap(call=>call.passages).every(text=>!text.includes('Инженер электроники')&&!text.includes('C++')),'Role and stack are not fabricated task descriptions');
});

test('hiring wrappers remain in calibrated reranker input while exact metadata leaves both neural inputs', async t => {
  const encoder=new Encoder();
  encoder.encode=async texts=>{encoder.encodeCalls.push(texts);return texts.map(()=>[1,0]);};
  const value=service(t,[profile('person')],encoder);
  const original='Нужен специалист, который измерит дрейф датчика, Москва, с зарплатой до 200 тысяч рублей';
  const result=await value.search(original);
  assert.equal(encoder.encodeCalls.at(-1)[0],'измерит дрейф датчика');
  assert.equal(encoder.rerankCalls.at(-1).query,'Нужен специалист, который измерит дрейф датчика');
  assert.equal(result.query,original);
  assert.equal(result.effectiveFilters.city,'Москва');
  assert.equal(result.effectiveFilters.salaryMax,200000);
  const declared='Компания: Дружная команда и общая кухня. Конкретная задача: Нужен человек, который калибрует датчик без замены платы. Требования: C++. Условия: удобное пространство.';
  const result2=await value.search(declared);
  assert.equal(encoder.encodeCalls.at(-1)[0],'калибрует датчик без замены платы. C++');
  assert.equal(encoder.rerankCalls.at(-1).query,'Нужен человек, который калибрует датчик без замены платы. C++');
  assert.equal(result2.query,declared);
});

test('a sparse profile can match its actual role and skills without claiming described work', async t => {
  const encoder=new Encoder();
  encoder.encode=async texts=>texts.map(()=>[1,0]);
  const person=profile('identity-only',{bio:'',workHistory:'',careerAchievements:'',education:''});
  const value=service(t,[person],encoder);
  assert.equal((await value.search('',{specialization:'Embedded'})).total,1);
  const result=await value.search('Нужен инженер электроники с C++');
  assert.equal(result.total,1);
  assert.deepEqual(encoder.rerankCalls[0].passages,[specializationLabels.Embedded+'\n'+person.professionalRole+'\nC++']);
  assert.match(result.items[0].reason,/Роль и навыки в профиле: Инженер электроники\nC\+\+/u);
  assert.doesNotMatch(result.items[0].reason,/Похожие задачи|опыт работы/iu);
  assert.equal(result.items[0].rerankerScore,2);
  assert.equal(result.items[0].evidenceKind,'competencies');
  assert.equal(encoder.info.reranker.threshold,0.5,'The existing stage cutoff is unchanged');
  assert.equal(result.model.profileEvidencePolicy,'structured-professional-sections-with-strict-sparse-competencies-v3');
  assert.doesNotMatch(JSON.stringify(result.items),/taskSections|private@example|79990000000/u);
  assert.equal(result.items[0].explanation.evidence.kind,'competencies');
});

test('sparse competency evidence below the frozen cutoff is never admitted as a match, even with perfect recall', async t => {
  const encoder=new Encoder();encoder.encode=async texts=>texts.map(()=>[1,0]);
  encoder.rerank=async(text,passages)=>{encoder.rerankCalls.push({query:text,passages});return passages.map(()=>-3);};
  const value=service(t,[profile('identity-only',{bio:'',workHistory:'',careerAchievements:'',education:''})],encoder);
  assert.equal((await value.search('Нужен человек, который поможет с устройством')).total,0,'Without a named role or skill the frozen cutoff decides alone');
  const named=await value.search('Нужен инженер электроники с C++');
  assert.equal(named.total,1,'A named role still yields its nearest profile');
  assert.equal(named.items[0].approximate,true);
  assert.equal(named.items[0].match.confidence.level,'low');
  assert.equal(named.warnings.length,1);
  assert.equal(encoder.rerankCalls.length,2,'The model evaluates competencies instead of blanket admission by identity');
});

test('generic education does not hide sparse role and skill evidence', async t => {
  const encoder=new Encoder();encoder.encode=async texts=>texts.map(()=>[1,0]);
  encoder.rerank=async(text,passages)=>{
    encoder.rerankCalls.push({query:text,passages});
    return passages.map(passage=>passage.includes('C++')?2:-3);
  };
  const person=profile('identity-only',{bio:'',workHistory:'',careerAchievements:'',education:'Высшее образование'});
  const result=await service(t,[person],encoder).search('Нужен инженер электроники с C++');
  assert.equal(result.total,1);
  assert.deepEqual(encoder.rerankCalls[0].passages,[specializationLabels.Embedded+'\nВысшее образование',
    specializationLabels.Embedded+'\n'+person.professionalRole+'\nC++']);
  assert.match(result.items[0].reason,/Роль и навыки в профиле/u);
  assert.equal(result.items[0].evidenceKind,'competencies');
  assert.doesNotMatch(result.items[0].reason,/Высшее образование/u);
});

test('changing sparse skills during reranking discards the obsolete competency result', async t => {
  const encoder=new Encoder();encoder.encode=async texts=>texts.map(()=>[1,0]);
  const person=profile('owner',{bio:'',workHistory:'',careerAchievements:'',education:''});
  const value=service(t,[],encoder);value.store.upsert(person,'owner-A',true);
  const original=encoder.rerank.bind(encoder);
  encoder.rerank=async(text,passages)=>{const scores=await original(text,passages);value.store.upsert({...person,stack:['Rust']},'owner-A',true);return scores;};
  assert.equal((await value.search('Нужен инженер электроники с C++',{}, {owner:'owner-A'})).total,0);
});

test('consent revocation and achievement changes after multi-section scoring discard every obsolete result', async t => {
  for (const changes of [{consent:false},{careerAchievements:'TASK:new Новая калибровка'}]) {
    const encoder=new Encoder(), person=profile('owner',{workHistory:'TASK:history Обмен данными',
      careerAchievements:'TASK:old Калибровка датчика',education:'TASK:education Радиотехника'});
    const value=service(t,[],encoder); value.store.upsert(person,'owner-A',true);
    const original=encoder.rerank.bind(encoder);
    encoder.rerank=async(text,passages)=>{
      assert.equal(passages.length,4);
      const scores=await original(text,passages);
      value.store.upsert({...person,...changes},'owner-A',true);
      return scores;
    };
    assert.equal((await value.search(query,{}, {owner:'owner-A'})).total,0);
  }
});

test('test results reorder close neural matches before pagination without altering raw model scores', async t => {
  const encoder = new Encoder();
  encoder.cosine = { relevant: 0.95, tested: 0.2, distant: 0.99 };
  encoder.scores = { relevant: 1.2, tested: 1.1, distant: 0.7 };
  const value = service(t, [profile('relevant', { confirmed: { specialization: 'Embedded', grade: 'Middle', score: 83 } }),
    profile('tested', { confirmed: { specialization: 'Embedded', grade: 'Middle', score: 100 } }),
    profile('distant', { confirmed: { specialization: 'Embedded', grade: 'Middle', score: 100 }, achievements: [{ title: 'Demo' }] })], encoder);
  const first = await value.search(query, {}, { limit: 1 });
  assert.equal(first.total, 3);
  assert.equal(first.items[0].person.id, 'tested');
  assert.equal(first.items[0].rank, 1.1);
  assert.equal(first.items[0].rerankerScore, 1.1);
  assert.match(first.items[0].reason, /той же подтверждённой категории/u);
  assert.equal(first.model.categoryRankingPolicy.version, 'category-evidence-bands-v1');
  const rest = await value.search(query, {}, { offset: 1 });
  assert.deepEqual(rest.items.map(item => item.person.id), ['relevant', 'distant']);
  assert.equal(rest.items[0].rank, 1.2, 'A test bonus changes positions, not the reported neural relevance');
  assert.equal(encoder.info.reranker.threshold, 0.5);
});

test('FSP provenance affects comparable matches but a real self-entered claim earns no bonus', async t => {
  const encoder = new Encoder();
  encoder.scores = { baseline: 1.2, federation: 1.1 };
  const noMedal = profile('baseline');
  const medal = profile('federation', { achievements: [{ title: 'Демонстрационный турнир ФСП', result: 'Вымышленный результат' }] });
  const value = service(t, [noMedal, medal], encoder);
  const demo = await value.search(query);
  assert.deepEqual(demo.items.map(item => item.person.id), ['federation', 'baseline']);
  assert.match(demo.items[0].reason, /Демонстрационные достижения ФСП.*учебный пример/u);
  value.store.upsert({ ...noMedal, synthetic: false }, 'registered-baseline', true);
  value.store.upsert({ ...medal, synthetic: false, fspId: 'SELF-ENTERED', achievements: [{ title: 'ФСП', verified: true }] }, 'registered-federation', true);
  const real = await value.search(query);
  assert.deepEqual(real.items.map(item => item.person.id), ['baseline', 'federation']);
  assert.doesNotMatch(real.items.map(item => item.reason).join(' '), /достижения ФСП.*учтены/iu);
});

test('evidence preserves slots of other confirmed categories and cannot admit a below-cutoff profile', async t => {
  const encoder = new Encoder();
  encoder.scores = { first: 1.2, senior: 1.18, backend: 1.16, tested: 1.1, rejected: 0.49 };
  const value = service(t, [profile('first', { confirmed: { specialization: 'Embedded', grade: 'Middle', score: 83 } }),
    profile('senior', { confirmed: { specialization: 'Embedded', grade: 'Senior', score: 100 } }),
    profile('backend', { specialization: 'Backend', confirmed: { specialization: 'Backend', grade: 'Middle', score: 100 } }),
    profile('tested', { confirmed: { specialization: 'Embedded', grade: 'Middle', score: 100 } }),
    profile('rejected', { confirmed: { specialization: 'Embedded', grade: 'Middle', score: 100 }, achievements: [{ title: 'Demo' }] })], encoder);
  const result = await value.search(query);
  assert.deepEqual(result.items.map(item => item.person.id), ['tested', 'senior', 'backend', 'first']);
  assert.equal(result.total, 4, 'Evidence cannot bypass model admission');
});

test('recall evaluates all SQL matches and bounds neural scoring to the 50 most similar profiles', async t => {
  const encoder = new Encoder();
  const people = Array.from({ length: 70 }, (_, index) => {
    const id = 'candidate-' + String(index).padStart(2, '0'); encoder.cosine[id] = 0.9 - index * 0.01;
    return profile(id);
  });
  people.push(profile('excluded', { salaryFrom: 200000 })); encoder.cosine.excluded = 1;
  const value = service(t, people, encoder);
  const result = await value.search(query, { salaryMax: 150000 }, { limit: 50 });
  const passages = encoder.rerankCalls[0].passages;
  assert.equal(passages.length, 50); assert.equal(result.total, 50);
  assert.ok(passages[0].includes('TASK:candidate-00')); assert.ok(passages[49].includes('TASK:candidate-49'));
  assert.ok(passages.every(passage => !passage.includes('TASK:excluded')));
  assert.ok(encoder.encodeCalls.flat().some(text => text.includes('TASK:candidate-69')), 'Recall vectors cover every eligible SQL match');
});

test('consent revoked during neural reranking removes the private account result immediately', async t => {
  const encoder = new Encoder(), person = profile('private-owner');
  const value = service(t, [], encoder); value.store.upsert(person, 'owner-A', true);
  const original = encoder.rerank.bind(encoder);
  encoder.rerank = async (text, passages) => { const scores = await original(text, passages); value.store.upsert({ ...person, consent: false }, 'owner-A', true); return scores; };
  assert.equal((await value.search(query, {}, { owner: 'owner-A' })).total, 0);
});

test('professional content changed during reranking is discarded instead of paired with an obsolete score', async t => {
  const encoder = new Encoder(), person = profile('private-owner', { bio: 'TASK:old Старые профессиональные задачи. private@example.com' });
  const value = service(t, [], encoder); value.store.upsert(person, 'owner-A', true);
  const original = encoder.rerank.bind(encoder);
  encoder.rerank = async (text, passages) => {
    const scores = await original(text, passages);
    value.store.upsert({ ...person, bio: 'TASK:new Обновлённые профессиональные задачи' }, 'owner-A', true);
    return scores;
  };
  assert.equal((await value.search(query, {}, { owner: 'owner-A' })).total, 0);
  assert.doesNotMatch(encoder.rerankCalls[0].passages.join(' '), /private@example/u);
  encoder.rerank = original;
  const fresh = await value.search(query, {}, { owner: 'owner-A' });
  assert.equal(fresh.total, 1); assert.equal(fresh.items[0].person.id, 'candidate-anna');
  assert.match(fresh.items[0].reason, /Обновлённые профессиональные задачи/u);
});

for (const [name, change] of [
  ['encoder version', encoder => { encoder.info.version = 'new-pipeline'; }],
  ['reranker version', encoder => { encoder.info.reranker.version = 'rerank-v2'; }],
  ['reranker threshold', encoder => { encoder.info.reranker.threshold = -2; }],
]) test(`${name} changed during reranking returns 503 instead of mixed-model results`, async t => {
  const encoder = new Encoder(), value = service(t, [profile('person')], encoder);
  const original = encoder.rerank.bind(encoder);
  encoder.rerank = async (text, passages) => { const scores = await original(text, passages); change(encoder); return scores; };
  await assert.rejects(value.search(query), error => error.status === 503);
});

for (const [name, override] of [
  ['missing method', undefined], ['worker error', async () => { throw new Error('fixture failure'); }],
  ['wrong length', async () => []], ['nonfinite score', async () => [Infinity]],
]) test(`declared neural stage with ${name} never falls back to cosine`, async t => {
  const encoder = new Encoder(); encoder.rerank = override;
  const value = service(t, [profile('person')], encoder);
  await assert.rejects(value.search(query), error => error.status === 503);
  assert.equal((await value.search('', { salaryMax: 150000 })).total, 1, 'Exact SQL filters remain independent of neural availability');
});

test('legacy encoder metadata keeps the original cosine filter, score and ordering', async t => {
  const encoder = new Encoder(); delete encoder.info.reranker; encoder.rerank = undefined;
  encoder.cosine = { strong: 0.9, below: 0.2 };
  const result = await service(t, [profile('strong'), profile('below')], encoder).search(query);
  assert.deepEqual(result.items.map(item => item.person.id), ['strong']);
  assert.equal(result.items[0].rerankerScore, undefined); assert.equal(result.items[0].rank, result.items[0].semanticScore);
  assert.equal(result.model.stage, undefined); assert.equal(encoder.rerankCalls.length, 0);
});
