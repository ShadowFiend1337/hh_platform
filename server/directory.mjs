import { DirectoryStore, cosine } from './directory-store.mjs';
import { directoryCandidates } from './directory-seed.mjs';
import { SemanticWorker } from './semantic-worker.mjs';
import { detectSpecialization, industryOptions, isSpecialization } from '../shared/catalog.ts';
import { detectGrade, isGrade } from '../shared/grading.ts';
import { defaultSearchFilters, normalizeSearchFilters, employmentTypes, languageOptions } from '../shared/search.ts';
import { RequestError } from './assessment.mjs';

const legacySeeds = [
  ['candidate-mikhail','Михаил Соколов','Frontend','Middle',91,['React','TypeScript','JavaScript','CSS'],'Москва',48,true],
  ['candidate-daria','Дарья Волкова','Frontend','Middle',89,['React','TypeScript','CSS'],'Санкт-Петербург',36,false],
  ['candidate-artem','Артём Лебедев','Backend','Middle',94,['Python','FastAPI','PostgreSQL','Docker'],'Казань',60,true],
  ['candidate-sofia','София Белова','Frontend','Junior',82,['React','JavaScript','CSS'],'Москва',12,false],
  ['candidate-nikita','Никита Орлов','Backend','Middle',88,['Node.js','TypeScript','PostgreSQL','Docker'],'Екатеринбург',36,false],
  ['candidate-egor','Егор Крылов','Backend','Junior',85,['Python','FastAPI','PostgreSQL'],'Новосибирск',12,false],
].map(([id,name,specialization,grade,score,stack,city,experienceMonths,fsp]) => ({ id,name,specialization,desiredGrade:grade,
  confirmed:{ specialization,grade,score,date:'2026-01-01T00:00:00.000Z',synthetic:true }, stack,industry:'ИТ',
  professionalRole:specialization==='Frontend'?'Frontend разработчик':'Backend разработчик',
  experience: `${experienceMonths / 12} ${experienceMonths === 12 ? 'год' : experienceMonths === 60 ? 'лет' : 'года'}`, experienceMonths,
  city,format:'Удалённо',bio:specialization==='Frontend'?'Разрабатываю интерфейсы веб-приложений: доступные формы, дизайн-системы и производительность.'
    :'Разрабатываю API, интеграции и сервисы с базами данных.',workHistory:'Вымышленный демонстрационный профиль.',
  employmentType:'Полная занятость',languageCodes:['ru','en'],salaryFrom:experienceMonths===12?90000:160000,salaryTo:experienceMonths===12?120000:200000,
  email:id.slice(10)+'@example.com',phone:'',fspId:'',softSkills:[],achievements:fsp?[{title:'Демонстрационное соревнование ФСП',result:'Вымышленный финалист',year:'2025'}]:[],
  visible:true,consent:true,synthetic:true,
}));

function validateFilters(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RequestError(400,'Некорректные фильтры.');
  if (Object.keys(input).some(key => !Object.hasOwn(defaultSearchFilters,key))) throw new RequestError(400,'Неизвестный фильтр.');
  for (const key of ['specialization','grade','format','city','industry','employmentType','language']) {
    if (input[key]!==undefined&&(typeof input[key]!=='string'||input[key].length>100)) throw new RequestError(400,'Некорректный текстовый фильтр.');
  }
  for (const key of ['fsp','hasPortfolio']) if (input[key]!==undefined&&typeof input[key]!=='boolean') throw new RequestError(400,'Некорректный переключатель фильтра.');
  if (input.stack!==undefined&&(!Array.isArray(input.stack)||input.stack.length>100||input.stack.some(skill=>typeof skill!=='string'||!skill.trim()||skill.length>80))) throw new RequestError(400,'Некорректный фильтр навыков.');
  for (const key of ['salaryMax','experienceMin','experienceMax','minScore']) {
    if (input[key] !== undefined && input[key] !== null && (!Number.isFinite(input[key]) || !Number.isInteger(input[key]) || input[key]<0)) throw new RequestError(400,'Числовые фильтры должны быть неотрицательными целыми числами.');
  }
  const result=normalizeSearchFilters(input);
  if (result.specialization&&!isSpecialization(result.specialization) || result.grade&&!isGrade(result.grade)
    || result.industry&&!industryOptions.includes(result.industry) || result.format&&!['Удалённо','Гибрид','Офис'].includes(result.format)
    || result.employmentType&&!employmentTypes.includes(result.employmentType) || result.language&&!languageOptions.some(item=>item.value===result.language)
    || (input.salaryMax??0)>10000000 || (input.experienceMin??0)>1200 || (input.experienceMax??0)>1200 || (input.minScore??0)>100
    || result.experienceMin!==null&&result.experienceMax!==null&&result.experienceMin>result.experienceMax) throw new RequestError(400,'Проверьте значения фильтров.');
  return result;
}

export function interpretQuery(query, options) {
  const interpreted={};
  const salary=/(?:до|не\s+(?:выше|больше)|максимум|бюджет(?:ом)?(?:\s+до)?)\s*(\d[\d\s]*(?:[.,]\d+)?)\s*(тыс(?:яч(?:и|у)?)?\.?|k|к|руб(?:лей|ля)?\.?|₽)?/iu.exec(query);
  if (salary) {
    const raw=Number(salary[1].replace(/\s/gu,'').replace(',','.'));
    const amount=raw*(salary[2]&&/^(?:тыс|k|к)/iu.test(salary[2])?1000:1);
    const tail=query.slice(salary.index+salary[0].length,salary.index+salary[0].length+45);
    const unsupported=/^\s*(?:доллар|евро|usd|eur|\$|€|в\s+год|за\s+год|запрос|пользоват|устройств|задач|операц|строк|ватт|вольт)/iu.test(tail);
    if (!unsupported&&amount>=0&&amount<=10000000&&(amount>=10000||salary[2]&&/руб|₽|тыс|^[kк]$/iu.test(salary[2]))) interpreted.salaryMax=Math.round(amount);
  }
  const specialization=detectSpecialization(query);
  if (specialization) interpreted.specialization=specialization;
  const grade=detectGrade(query);
  if (grade) interpreted.grade=grade;
  if (/удал[её]нн(?:о|ая|ую)|remote/iu.test(query)&&!/не\s+удал/iu.test(query)) interpreted.format='Удалённо';
  else if (/гибрид/iu.test(query)) interpreted.format='Гибрид';
  else if (/(?:в\s+офисе|офисный\s+формат|on-site)/iu.test(query)) interpreted.format='Офис';
  const city=options.cities.find(city=>query.toLocaleLowerCase('ru').includes(city.toLocaleLowerCase('ru')));
  if (city) interpreted.city=city;
  return interpreted;
}

export class DirectoryService {
  constructor(path, { seeds=[...directoryCandidates,...legacySeeds], encoder=new SemanticWorker() }={}) {
    this.store=new DirectoryStore(path,seeds);
    this.encoder=encoder;
    this.indexing=null;
    this.queryCache=new Map();
  }
  options() { return {...this.store.options(),languages:languageOptions,employmentTypes}; }
  async ensureIndex() {
    if (this.indexing) return this.indexing;
    this.indexing=(async()=>{
      await this.encoder.start();
      const previous=this.store.vectors();
      const missing=this.store.all().filter(row=>{
        const old=previous.get(row.id);
        return !old||old.model_version!==this.encoder.info.version||old.document_hash!==row.document_hash;
      });
      for (let index=0;index<missing.length;index+=32) {
        const batch=missing.slice(index,index+32);
        const vectors=await this.encoder.encode(batch.map(row=>row.document));
        this.store.transaction(()=>batch.forEach((row,offset)=>this.store.putVector(row,this.encoder.info.version,vectors[offset])));
      }
    })().finally(()=>{this.indexing=null;});
    return this.indexing;
  }
  async search(query, inputFilters={}, {offset=0,limit=30,owner}={}) {
    if (typeof query!=='string'||query.length>1200 || !Number.isInteger(offset)||offset<0||offset>100000 || !Number.isInteger(limit)||limit<1||limit>50) throw new RequestError(400,'Некорректный запрос подбора.');
    query=query.trim();
    const filters=validateFilters(inputFilters);
    const interpreted=interpretQuery(query,this.options());
    for (const key of ['specialization','grade','format','city']) if (interpreted[key]&&!filters[key]) filters[key]=interpreted[key];
    if (interpreted.salaryMax!==undefined) filters.salaryMax=filters.salaryMax===null?interpreted.salaryMax:Math.min(filters.salaryMax,interpreted.salaryMax);
    let rows=this.store.matching(filters);
    let vector=null, vectors=null;
    if (query) {
      try {
        await this.ensureIndex(); vectors=this.store.vectors();
        const cacheKey=this.encoder.info.version+'\n'+query;
        vector=this.queryCache.get(cacheKey);
        if (!vector) {
          [vector]=await this.encoder.encode([query]);
          if (this.queryCache.size>=128) this.queryCache.delete(this.queryCache.keys().next().value);
          this.queryCache.set(cacheKey,vector);
        }
        // Visibility or profile contents may change while the encoder is busy.
        rows=this.store.matching(filters);
      } catch { throw new RequestError(503,'Поиск по смыслу недоступен. Повторите запрос или используйте фильтры без текста.'); }
    }
    const items=rows.map(row=>{
      const cached=vector?vectors.get(row.id):null;
      const stored=cached&&cached.document_hash===row.document_hash&&cached.model_version===this.encoder.info.version?cached:null;
      const semanticScore=stored?cosine(vector,stored.vector):null;
      const person=JSON.parse(row.public_payload);
      if (owner&&row.owner===owner) person.id='candidate-anna';
      const evidence=person.bio||person.workHistory||person.professionalRole;
      const reasons=[query?`Похожие задачи в профиле: ${evidence.slice(0,350)}`:'Соответствует выбранным фильтрам.'];
      if (filters.salaryMax!==null) reasons.push(`Ожидания от ${row.salary_from.toLocaleString('ru-RU')} ₽ в месяц укладываются в бюджет.`);
      if (person.synthetic) reasons.push('Вымышленный профиль; результат теста демонстрационный.');
      else reasons.push(`Результат серверного теста ${row.score}/100.`);
      return {person,semanticScore,rank:(semanticScore??0)*100+row.score*0.03+row.fsp*0.3,reason:reasons.join(' ')};
    }).filter(item=>!query||item.semanticScore!==null&&item.semanticScore>=this.encoder.info.threshold)
      .sort((a,b)=>b.rank-a.rank||a.person.name.localeCompare(b.person.name,'ru'));
    return {items:items.slice(offset,offset+limit),total:items.length,offset,limit,query,interpreted,
      model:{...this.encoder.info},warnings:[]};
  }
  close() { this.encoder.close();this.store.close(); }
}
