import { DirectoryStore, semanticMatch, semanticSegments, parseSemanticSegments, PROFILE_INDEX_POLICY } from './directory-store.mjs';
import { directoryCandidates } from './directory-seed.mjs';
import { SemanticWorker, validScoreCalibration } from './semantic-worker.mjs';
import { industryOptions, isSpecialization, specializationLabels, stackOptions } from '../shared/catalog.ts';
import { gradeOptions, isGrade } from '../shared/grading.ts';
import { defaultSearchFilters, normalizeSearchFilters, employmentTypes, languageOptions } from '../shared/search.ts';
import { RequestError } from './assessment.mjs';
import { unsupportedRequestedRoles } from './query-role-scope.mjs';

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

const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const mentions = (text, values) => values.flatMap(([value, expression]) => {
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${expression})(?![\\p{L}\\p{N}_])`, 'giu');
  return [...text.matchAll(pattern)].map(match => ({ value, start: match.index, end: match.index + match[0].length }));
});
const roleAliases = [
  ['Frontend', 'front[- ]?end|фронт[- ]?[эе]нд[а-я]*|разработ[а-я]*\\s+интерфейс[а-я]*'],
  ['Backend', 'back[- ]?end|б[эе]к[- ]?[эе]нд[а-я]*|серверн[а-я]*\\s+разработ[а-я]*'],
  ['Fullstack', 'full[- ]?stack|фулл?ст[эе]к[а-я]*'],
  ['Mobile', 'mobile|мобильн[а-я]*\\s+разработ[а-я]*'],
  ['ML', 'ml|machine\\s+learning|data\\s+scien(?:ce|tist)|машинн[а-я]*\\s+обучени[а-я]*'],
  ['DataAnalysis', 'data\\s+analys[а-яa-z]*|аналитик[а-я]*\\s+данных|аналитика данных|bi[- ]?аналитик[а-я]*'],
  ['DataEngineering', 'data\\s+engineer[а-яa-z]*|инженер[а-я]*\\s+данных|инженерия данных'],
  ['DevOps', 'devops|sre|девопс[а-я]*'],
  ['QA', 'qa|quality\\s+assurance|тестировщик[а-я]*|инженер[а-я]*\\s+(?:по\\s+)?тестировани[а-я]*'],
  ['Security', 'security|cybersecurity|информационн[а-я]*\\s+безопасност[а-я]*|кибербезопасност[а-я]*|appsec|pentest[а-яa-z]*'],
  ['UXUI', 'ux(?:[ /-]*ui)?|ui(?:[ /-]*ux)?|uxui|дизайн[а-я]*\\s+интерфейс[а-я]*'],
  ['BusinessAnalysis', 'business\\s+analys[а-яa-z]*|system[s]?\\s+analys[а-яa-z]*|бизнес[- ]аналит[а-я]*|системн[а-я]*\\s+аналит[а-я]*'],
  ['ProductManagement', 'product\\s*(?:manager|management|owner)|продакт[а-я]*|менеджер[а-я]*\\s+продукта'],
  ['Embedded', 'embedded|firmware|встраиваем[а-я]*\\s+(?:систем[а-я]*|разработ[а-я]*)|инженер[а-я]*\\s+(?:по\\s+)?электроник[а-я]*|электронщик[а-я]*|схемотехник[а-я]*'],
];
const grades = [
  ['Intern', 'intern|trainee|стаж[её]р(?:ка)?|стажировка'], ['Junior', 'junior|джуниор|джун'],
  ['Middle', 'middle|мидл|миддл'], ['Senior', 'senior|сеньор|синьор'], ['Lead', 'lead|team[ -]?lead|tech[ -]?lead|тимлид|техлид|лид'],
];
const formats = [['Удалённо', 'удал[её]нн[а-я]*|remote'], ['Гибрид', 'гибрид[а-я]*|hybrid'], ['Офис', 'офис[а-я]*|on-site|onsite']];
const languages = [['ru', 'русск[а-я]*|russian'], ['en', 'английск[а-я]*|english'], ['de', 'немецк[а-я]*|german'],
  ['fr', 'французск[а-я]*|french'], ['es', 'испанск[а-я]*|spanish'], ['zh', 'китайск[а-я]*|chinese']];
// Parsed non-professional constraints belong in SQL. Keep their exact source
// ranges private so budgets and locations do not distort task embeddings.
const constraintSpans = Symbol('constraintSpans');
const taskHeading = /^(?:задачи\s+команды|(?:основная|главная|конкретная)\s+задача)$/iu;
const professionalHeading = /^(?:требования(?:\s+к\s+кандидату)?|(?:обязательные|профессиональные|дополнительные)\s+требования|(?:ключевые|обязательные|профессиональные)\s+навыки|навыки|стек|роль|специализация|важно)$/iu;
const queryHeadings = /(?<![\p{L}\p{N}_])(?:задачи\s+команды|(?:основная|главная|конкретная)\s+задача|требования(?:\s+к\s+кандидату)?|(?:обязательные|профессиональные|дополнительные)\s+требования|(?:ключевые|обязательные|профессиональные)\s+навыки|навыки|стек|роль|специализация|важно|условия(?:\s+работы)?|(?:о|описание)\s+(?:компании|проекте)|компания|проект|контакты|что\s+предлагаем|кто\s+мы|зарплата|бюджет|этапы\s+отбора|преимущества)\s*:/giu;
function stripRequestWrapper(text) {
  return text.replace(/^\s*(?:нуж(?:ен|на|ны)|ищем|хотим)\s+(?:специалист[а]?|человек[а]?|разработчик[а]?|исполнител[ья])\s*,?\s+котор(?:ый|ая|ые|ого|ую)\s+/iu, '')
    .replace(/^\s*(?:нуж(?:ен|на|ны)|ищем|хотим)\s+/iu, '');
}
function declaredTaskQuery(text) {
  const headings = [...text.matchAll(queryHeadings)].map(match => ({
    label: match[0].replace(/\s*:\s*$/u, '').trim(), start: match.index, end: match.index + match[0].length,
  }));
  const sections = headings.map((heading, index) => ({ ...heading, text: text.slice(heading.end, headings[index + 1]?.start).trim() }));
  const tasks = sections.filter(section => taskHeading.test(section.label) && section.text);
  if (!tasks.length) return text;
  // The employer explicitly identified the work to rank for. Preserve other
  // stated professional requirements, without weighting company copy as work.
  const requirements = sections.filter(section => professionalHeading.test(section.label) && section.text);
  return [...tasks, ...requirements].map(section => section.text).join(' ');
}
function semanticQuery(query, interpreted, { stripWrapper = true } = {}) {
  const spans = [...(interpreted[constraintSpans] || [])].sort((a, b) => a.start - b.start);
  let cursor = 0, parts = [];
  for (const span of spans) {
    if (span.start > cursor) parts.push(query.slice(cursor, span.start));
    cursor = Math.max(cursor, span.end);
  }
  parts.push(query.slice(cursor));
  const taskQuery = declaredTaskQuery(parts.join(' '));
  return (stripWrapper ? stripRequestWrapper(taskQuery) : taskQuery).replace(/\s+/gu, ' ').replace(/\s+([,;.])/gu, '$1')
    .replace(/(?:[,;.]\s*){2,}/gu, ', ').replace(/^[\s,;.]+|[\s,;.]+$/gu, '').trim();
}

function polarity(text, match) {
  const prefix = text.slice(Math.max(text.lastIndexOf(',', match.start), text.lastIndexOf(';', match.start), text.lastIndexOf('.', match.start)) + 1, match.start)
    .split(/\s+(?:но|а|but)\s+/iu).at(-1).slice(-90);
  const suffix = text.slice(match.end).split(/[,;.]/u)[0].slice(0, 70);
  if (/^\s*(?:не\s*обязател[а-я]*|не\s+принципиал[а-я]*|желател[а-я]*|будет\s+плюсом|optional|preferred)/iu.test(suffix)
    || /(?:желател[а-я]*|например|preferably|не\s*обязательно)\s*$/iu.test(prefix)) return 'optional';
  // Comparative grade/experience phrases are requirements, not exclusions.
  const comparison = /(?:не\s+(?:ниже|выше|менее|более|меньше|больше)|not\s+(?:less|more)\s+than)\s*$/iu.test(prefix);
  const notOnly = /(?:не\s+только|not\s+only)\s*$/iu.test(prefix);
  if (!comparison && !notOnly && /(?:^|\s)(?:не|без|кроме|исключая|not|no|without|except)\s+(?:[\p{L}\p{N}+_-]+\s+){0,3}$/iu.test(prefix)
    || /^\s+(?:не\s+(?:нуж[а-я]*|подход[а-я]*|рассматрива[а-я]*|интерес[а-я]*)|исключ[а-я]*|not\s+(?:needed|wanted|required))/iu.test(suffix)) return 'negative';
  return 'positive';
}

export function interpretQuery(query, options) {
  const interpreted = { queryConstraints: { exclude: {}, any: {}, all: {}, groups: {} } };
  interpreted[constraintSpans] = [];
  const constraints = interpreted.queryConstraints;
  function categorical(key, matches, { conjunctive = false } = {}) {
    const positive = [], negative = [];
    for (const match of matches) {
      const kind = polarity(query, match);
      if (kind === 'negative') negative.push(match.value);
      else if (kind === 'positive') positive.push(match.value);
    }
    const unique = values => [...new Set(values)];
    if (negative.length) constraints.exclude[key] = unique(negative);
    const values = unique(positive);
    if (!values.length) return;
    if (conjunctive) {
      const accepted = matches.filter(match => polarity(query, match) === 'positive');
      const groups = [];
      for (const [index, match] of accepted.entries()) {
        const between = index ? query.slice(accepted[index - 1].end, match.start) : '';
        const alternative = !/[,;]/u.test(between) && /(?:^|\s)(?:или|либо|or)(?:\s|$)/iu.test(between);
        if (alternative) groups.at(-1).push(match.value);
        else groups.push([match.value]);
      }
      const alternatives = groups.map(unique).filter(group => group.length > 1);
      const required = unique(groups.filter(group => group.length === 1).flat());
      if (required.length) constraints.all[key] = required;
      if (alternatives.length === 1) constraints.any[key] = alternatives[0];
      else if (alternatives.length > 1) constraints.groups[key] = alternatives;
      if (key === 'stack' && required.length) interpreted.stack = required;
      else if (key === 'language' && required.length === 1) interpreted.language = required[0];
    } else {
      constraints.any[key] = values;
      if (values.length === 1) interpreted[key] = values[0];
    }
  }
  const roleMentions = mentions(query, roleAliases).sort((a, b) => a.start - b.start);
  categorical('specialization', roleMentions);
  const unsupportedRole = unsupportedRequestedRoles(query, { supportedMentions: roleMentions, classify: match => polarity(query, match) });
  if (unsupportedRole.length) interpreted.unsupportedRole = unsupportedRole;
  const gradeMentions = mentions(query, grades).sort((a, b) => a.start - b.start);
  categorical('grade', gradeMentions);
  if (gradeMentions.length === 1 && polarity(query, gradeMentions[0]) === 'positive') {
    const match = gradeMentions[0], before = query.slice(Math.max(0, match.start - 25), match.start), after = query.slice(match.end, match.end + 1);
    const minimum = /(?:не\s+ниже|от)\s*$/iu.test(before) || after === '+';
    const maximum = /(?:не\s+выше|до)\s*$/iu.test(before);
    if (minimum || maximum) {
      const index = gradeOptions.findIndex(item => item.value === match.value);
      constraints.any.grade = gradeOptions.filter((_, position) => minimum ? position >= index : position <= index).map(item => item.value);
      delete interpreted.grade;
    }
  }
  if (gradeMentions.length === 2 && gradeMentions.every(match => polarity(query, match) === 'positive')) {
    const [lower, upper] = gradeMentions;
    const before = query.slice(Math.max(0, lower.start - 20), lower.start);
    const between = query.slice(lower.end, upper.start);
    if (/от\s*$/iu.test(before) && /^\s*до\s*$/iu.test(between)) {
      const minimum = gradeOptions.findIndex(item => item.value === lower.value), maximum = gradeOptions.findIndex(item => item.value === upper.value);
      constraints.any.grade = minimum <= maximum ? gradeOptions.slice(minimum, maximum + 1).map(item => item.value) : [];
      delete interpreted.grade;
    }
  }
  categorical('format', mentions(query, formats).sort((a, b) => a.start - b.start));
  const cityAliases = { 'Москва': 'москв(?:а|е|у|ы|ой)', 'Казань': 'казан(?:ь|и|ью)', 'Санкт-Петербург': 'санкт[- ]петербург[а-я]*' };
  if (!/(?:любой\s+город|любого\s+города|город\s+не\s+важен|где\s+угодно|any\s+city)/iu.test(query)) {
    const cityMentions = mentions(query, options.cities.map(city => [city, cityAliases[city] || escaped(city)])).sort((a, b) => a.start - b.start);
    categorical('city', cityMentions);
    for (const match of cityMentions) {
      const kind = polarity(query, match);
      if (kind === 'optional') continue;
      const prefix = query.slice(0, match.start).match(/(?<![\p{L}\p{N}_])(?:(?:и|или|либо|or)\s+)?(?:(?:не|без|кроме|из|в|город(?:е|а)?)\s+)*$/iu)?.[0] || '';
      const suffix = kind === 'negative' ? query.slice(match.end).match(/^\s+(?:не\s+(?:нуж[а-я]*|подход[а-я]*|рассматрива[а-я]*)|исключ[а-я]*)/iu)?.[0] || '' : '';
      interpreted[constraintSpans].push({ start: match.start - prefix.length, end: match.end + suffix.length });
    }
  }
  const stack = mentions(query, stackOptions.map(skill => [skill, escaped(skill)]));
  const fullStackNames = stack.filter(match => !stack.some(other => other.start <= match.start && other.end >= match.end && other.end - other.start > match.end - match.start));
  categorical('stack', fullStackNames.sort((a, b) => a.start - b.start), { conjunctive: true });
  categorical('language', mentions(query, languages).sort((a, b) => a.start - b.start), { conjunctive: true });
  const portfolio = mentions(query, [['portfolio', 'портфолио|portfolio']]);
  if (portfolio.some(match => polarity(query, match) === 'positive')) interpreted.hasPortfolio = true;

  // A number is a salary only with monetary units or an explicit monetary
  // context. Reject yearly and foreign-currency amounts before applying SQL.
  const caps = /(?<![\p{L}\p{N}_])(?:до|не\s+(?:выше|больше|более)|максимум|бюджет(?:ом)?(?:\s+до)?)\s*(\d[\d\s]*(?:[.,]\d+)?)\s*(?:(тыс(?:яч(?:и|у)?)?\.?|k|к|руб(?:лей|ля)?\.?|₽)(?![\p{L}]))?/giu;
  for (const match of query.matchAll(caps)) {
    const before = query.slice(Math.max(0, match.index - 90), match.index).split(/[,;.]/u).at(-1);
    const tail = query.slice(match.index + match[0].length, match.index + match[0].length + 90)
      .replace(/(?<![\p{L}\p{N}_])(руб|тыс)\./giu, '$1').split(/[,;.]/u)[0];
    const monetary = /зарплат|оплат|вознагражден|оклад|бюджет|salary|budget/iu.test(before + match[0]);
    const rubles = /руб|₽/iu.test(match[2] || '') || /^\s*руб(?:лей|ля)?/iu.test(tail);
    const unsupported = /доллар|евро|usd|eur|\$|€|(?:в|за)\s+год|annual|per\s+year/iu.test(before+tail)
      || /запрос|пользоват|устройств|задач|операц|строк|ватт|вольт|документ|час|издел|клиент|rps|rpm/iu.test(tail)
      || /(?:нет\s+ограничени[а-я]*|без\s+ограничени[а-я]*|не\s+огранич[а-я]*)/iu.test(before);
    const raw = Number(match[1].replace(/\s/gu, '').replace(',', '.'));
    const amount = raw * (match[2] && /^(?:тыс|k|к)/iu.test(match[2]) ? 1000 : 1);
    if ((monetary || rubles) && !unsupported && amount >= 0 && amount <= 10000000) {
      interpreted.salaryMax = Math.min(interpreted.salaryMax ?? Infinity, Math.round(amount));
      const prefix = query.slice(0, match.index).match(/(?<![\p{L}\p{N}_])(?:с\s+)?(?:зарплат[а-я]*|оплат[а-я]*|вознагражден[а-я]*|оклад[а-я]*|бюджет[а-я]*)(?:\s+в\s+рублях)?\s*$/iu)?.[0] || '';
      const suffix = query.slice(match.index + match[0].length).match(/^\s*(?:руб(?:лей|ля)?\.?|₽)?(?:\s+(?:в\s+месяц|за\s+месяц|ежемесячно|per\s+month))?/iu)?.[0] || '';
      interpreted[constraintSpans].push({ start: match.index - prefix.length, end: match.index + match[0].length + suffix.length });
    }
  }
  const ranges = [...query.matchAll(/(?:опыт[а-я]*|стаж[а-я]*)(?:\s+работы)?\s+(?:от\s+)?(\d+(?:[.,]\d+)?)\s*(?:до|[-–])\s*(\d+(?:[.,]\d+)?)\s*(год[а-я]*|лет|месяц[а-я]*)/giu)];
  for (const match of ranges) {
    const multiplier = /год|лет/iu.test(match[3]) ? 12 : 1;
    const minimum = Math.round(Number(match[1].replace(',', '.')) * multiplier), maximum = Math.round(Number(match[2].replace(',', '.')) * multiplier);
    if (minimum <= maximum && maximum <= 1200) {
      interpreted.experienceMin = Math.max(interpreted.experienceMin ?? 0, minimum);
      interpreted.experienceMax = Math.min(interpreted.experienceMax ?? Infinity, maximum);
      interpreted[constraintSpans].push({ start: match.index, end: match.index + match[0].length });
    }
  }
  const durations = /(?:(от|до|не\s+менее|не\s+более|минимум|максимум|ровно)\s+)?(\d+(?:[.,]\d+)?)\s*(год[а-я]*|лет|месяц[а-я]*)(?:\s+(?:и\s+)?(\d+)\s+месяц[а-я]*)?/giu;
  for (const match of query.matchAll(durations)) {
    if (ranges.some(range => match.index >= range.index && match.index < range.index + range[0].length)) continue;
    const context = query.slice(Math.max(0, match.index - 65), match.index + match[0].length + 30).split(/[;]/u).join(' ');
    if (!/стаж|опыт/iu.test(context) || /возраст/iu.test(context)) continue;
    const months = Math.round(Number(match[2].replace(',', '.')) * (/год|лет/iu.test(match[3]) ? 12 : 1) + Number(match[4] || 0));
    if (months > 1200) continue;
    if (/до|более|максимум/iu.test(match[1] || '')) interpreted.experienceMax = Math.min(interpreted.experienceMax ?? Infinity, months);
    else interpreted.experienceMin = Math.max(interpreted.experienceMin ?? 0, months);
    if (match[1] === 'ровно') interpreted.experienceMax = months;
    const prefix = query.slice(0, match.index).match(/(?<![\p{L}\p{N}_])(?:с\s+)?(?:опыт[а-я]*|стаж[а-я]*)(?:\s+работы)?\s*$/iu)?.[0] || '';
    interpreted[constraintSpans].push({ start: match.index - prefix.length, end: match.index + match[0].length });
  }
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
  indexVersion() { return this.encoder.info.version + ':' + PROFILE_INDEX_POLICY; }
  currentVector(row, cached) {
    const dimension = parseSemanticSegments(row.document).length * this.encoder.info.dimension;
    return cached && cached.model_version === this.indexVersion() && cached.document_hash === row.document_hash
      && cached.dimension === dimension && cached.vector.byteLength === dimension * 4;
  }
  async encodeStable(texts) {
    const version=this.indexVersion(), dimension=this.encoder.info.dimension;
    const vectors=await this.encoder.encode(texts);
    // A reply from the preceding model must never acquire the replacement's
    // index/cache version, even if activation finishes just after inference.
    if (version!==this.indexVersion() || dimension!==this.encoder.info.dimension) {
      throw new Error('Модель поиска изменилась во время кодирования.');
    }
    return vectors;
  }
  async ensureIndex() {
    if (this.indexing) return this.indexing;
    this.indexing=(async()=>{
      await this.encoder.start();
      const previous=this.store.vectors();
      const missing=this.store.all().filter(row=>{
        const old=previous.get(row.id);
        return !this.currentVector(row, old);
      });
      for (let index=0;index<missing.length;index+=32) {
        const batch=missing.slice(index,index+32);
        const documents=batch.map(row=>parseSemanticSegments(row.document));
        const vectors=await this.encodeStable(documents.flat());
        if (!Array.isArray(vectors) || vectors.length!==documents.reduce((count,segments)=>count+segments.length,0)
          || vectors.some(vector=>!Array.isArray(vector)||vector.length!==this.encoder.info.dimension||vector.some(number=>!Number.isFinite(number)))) {
          throw new Error('Модель вернула некорректные векторы секций.');
        }
        let offset=0;
        this.store.transaction(()=>batch.forEach((row,index)=>{
          const bundle=vectors.slice(offset,offset+documents[index].length).flat();
          offset+=documents[index].length;
          this.store.putVector(row,this.indexVersion(),bundle);
        }));
      }
    })().finally(()=>{this.indexing=null;});
    return this.indexing;
  }
  async search(query, inputFilters={}, {offset=0,limit=30,owner}={}) {
    if (typeof query!=='string'||query.length>1200 || !Number.isInteger(offset)||offset<0||offset>100000 || !Number.isInteger(limit)||limit<1||limit>50) throw new RequestError(400,'Некорректный запрос подбора.');
    query=query.trim();
    const filters=validateFilters(inputFilters);
    const interpreted=interpretQuery(query,this.options());
    const embeddingQuery=semanticQuery(query,interpreted);
    const rerankerQuery=semanticQuery(query,interpreted,{stripWrapper:false});
    for (const key of ['specialization','grade','format','city','language']) if (interpreted[key]&&!filters[key]) filters[key]=interpreted[key];
    if (interpreted.salaryMax!==undefined) filters.salaryMax=filters.salaryMax===null?interpreted.salaryMax:Math.min(filters.salaryMax,interpreted.salaryMax);
    if (interpreted.experienceMin!==undefined) filters.experienceMin=Math.max(filters.experienceMin??0,interpreted.experienceMin);
    if (interpreted.experienceMax!==undefined) filters.experienceMax=Math.min(filters.experienceMax??Infinity,interpreted.experienceMax);
    if (interpreted.hasPortfolio) filters.hasPortfolio=true;
    if (interpreted.stack?.length) filters.stack=[...new Set([...filters.stack,...interpreted.stack])];
    // An explicitly requested profession outside our catalog has no eligible
    // profiles. This is a structural scope constraint, independent of neural
    // similarity, the model's availability or approximate admission scores.
    if (interpreted.unsupportedRole?.length) return {items:[],total:0,offset,limit,query,interpreted,effectiveFilters:filters,
      model:{...this.encoder.info,indexPolicy:PROFILE_INDEX_POLICY},warnings:[]};
    let rows=this.store.matching(filters,interpreted.queryConstraints);
    let vector=null, vectors=null;
    if (embeddingQuery) {
      try {
        await this.ensureIndex(); vectors=this.store.vectors();
        let version=this.indexVersion();
        const cacheKey=version+'\n'+embeddingQuery;
        vector=this.queryCache.get(cacheKey);
        if (!vector) {
          [vector]=await this.encodeStable([embeddingQuery]);
          if (this.queryCache.size>=128) this.queryCache.delete(this.queryCache.keys().next().value);
          version=this.indexVersion();
          this.queryCache.set(version+'\n'+embeddingQuery,vector);
        }
        // Visibility or profile contents may change while the encoder is busy.
        rows=this.store.matching(filters,interpreted.queryConstraints);
        if (rows.some(row => {
          const old=vectors.get(row.id);
          return !this.currentVector(row,old);
        })) {
          // One bounded catch-up handles publication/content changes during
          // query inference without ranking obsolete document embeddings.
          await this.ensureIndex();
          vectors=this.store.vectors();
          rows=this.store.matching(filters,interpreted.queryConstraints);
        }
        if (version!==this.indexVersion()) {
          [vector]=await this.encodeStable([embeddingQuery]);
          if (this.queryCache.size>=128) this.queryCache.delete(this.queryCache.keys().next().value);
          this.queryCache.set(this.indexVersion()+'\n'+embeddingQuery,vector);
          rows=this.store.matching(filters,interpreted.queryConstraints);
          vectors=this.store.vectors();
        }
      } catch { throw new RequestError(503,'Поиск по смыслу недоступен. Повторите запрос или используйте фильтры без текста.'); }
    }
    const stage=embeddingQuery?this.encoder.info.reranker:null;
    const order=(a,b)=>(embeddingQuery?b.rank-a.rank||b.semanticScore-a.semanticScore:0)||b.testScore-a.testScore||b.fsp-a.fsp
      ||a.person.name.localeCompare(b.person.name,'ru')||a.person.id.localeCompare(b.person.id);
    const candidates=rows.map(row=>{
      const cached=vector?vectors.get(row.id):null;
      const stored=this.currentVector(row,cached)?cached:null;
      const match=stored?semanticMatch(vector,stored.vector):null;
      const semanticScore=match?.score??null;
      const person=JSON.parse(row.public_payload);
      if (owner&&row.owner===owner) person.id='candidate-anna';
      const evidence=match?parseSemanticSegments(row.document)[match.index]:person.bio||person.workHistory||person.professionalRole||'';
      const reasons=[embeddingQuery?`Похожие задачи в профиле: ${evidence.slice(0,350)}`:'Соответствует выбранным фильтрам.'];
      if (filters.salaryMax!==null) reasons.push(`Ожидания от ${row.salary_from.toLocaleString('ru-RU')} ₽ в месяц укладываются в бюджет.`);
      if (person.synthetic) reasons.push('Вымышленный профиль; результат теста демонстрационный.');
      else reasons.push(`Результат серверного теста ${row.score}/100.`);
      return {person,semanticScore,rank:semanticScore??row.score,reason:reasons.join(' '),testScore:row.score,fsp:row.fsp,
        sourceId:row.id,documentHash:row.document_hash,publicPayload:row.public_payload,
        taskSections:stage?semanticSegments(person,{includeIdentity:false}):[],reasonSuffix:reasons.slice(1),
        roleLabel:specializationLabels[row.specialization] || row.specialization};
    });
    let items;
    const warnings=[];
    if (stage) {
      try {
        if (typeof this.encoder.rerank!=='function' || !Number.isFinite(stage.threshold)) throw new Error('Модель ранжирования недоступна.');
        const fusion=stage.scoreCalibration;
        if (fusion!==undefined && !validScoreCalibration(fusion)) throw new Error('Некорректная калибровка оценок поиска.');
        // Recall first: the cross-encoder may rescue a correct task below the
        // legacy cosine cutoff, so that cutoff never precedes neural scoring.
        const shortlist=candidates.filter(item=>item.semanticScore!==null&&item.taskSections.length).sort((a,b)=>b.semanticScore-a.semanticScore
          ||b.testScore-a.testScore||b.fsp-a.fsp||a.sourceId.localeCompare(b.sourceId)).slice(0,50);
        const version=this.indexVersion(), stageVersion=JSON.stringify(stage);
        let rawVector=null;
        if (fusion && shortlist.length) {
          const cacheKey=version+'\n'+rerankerQuery;
          rawVector=this.queryCache.get(cacheKey);
          if (!rawVector) {
            [rawVector]=await this.encodeStable([rerankerQuery]);
            if (version!==this.indexVersion() || stageVersion!==JSON.stringify(this.encoder.info.reranker)) {
              throw new Error('Модель поиска изменилась во время кодирования.');
            }
            if (!Array.isArray(rawVector) || rawVector.length!==this.encoder.info.dimension || rawVector.some(value=>!Number.isFinite(value))) {
              throw new Error('Модель вернула некорректный вектор запроса.');
            }
            if (this.queryCache.size>=128) this.queryCache.delete(this.queryCache.keys().next().value);
            this.queryCache.set(cacheKey,rawVector);
          }
          if (!Array.isArray(rawVector) || rawVector.length!==this.encoder.info.dimension || rawVector.some(value=>!Number.isFinite(value))) {
            throw new Error('Модель вернула некорректный вектор запроса.');
          }
        }
        // Identity helps recall; the calibrated second stage compares actual
        // work, achievements and education. It always sees biography evidence.
        const passages=shortlist.flatMap(item=>item.taskSections.map(text=>`${item.roleLabel}\n${text}`));
        // DEV calibration pairs the raw query with this exact task section,
        // never with the maximum retrieval cosine of the whole profile.
        const rowLookup=new Map(rows.map(row=>[row.id,row]));
        const sectionCosines=fusion?shortlist.flatMap(item=>{
          const row=rowLookup.get(item.sourceId), stored=vectors.get(item.sourceId);
          if (!row || !this.currentVector(row,stored)) throw new Error('Секции профиля не соответствуют индексу.');
          const indexed=parseSemanticSegments(row.document), stride=this.encoder.info.dimension*4;
          return item.taskSections.map(text=>{
            const index=indexed.indexOf(text);
            const match=index<0?null:semanticMatch(rawVector,stored.vector.subarray(index*stride,(index+1)*stride));
            if (!match || !Number.isFinite(match.score)) throw new Error('Секция профиля не соответствует вектору.');
            return match.score;
          });
        }):null;
        const scores=[];
        for (let offset=0;offset<passages.length;offset+=256) {
          const batch=passages.slice(offset,offset+256);
          const values=await this.encoder.rerank(rerankerQuery,batch);
          if (version!==this.indexVersion() || stageVersion!==JSON.stringify(this.encoder.info.reranker)
            || !Array.isArray(values) || values.length!==batch.length || values.some(score=>!Number.isFinite(score))) {
            throw new Error('Модель ранжирования изменилась или вернула некорректные оценки.');
          }
          scores.push(...values);
        }
        const ranks=fusion?scores.map((logit,index)=>{
          const cosine=sectionCosines[index];
          const linear=fusion.weights[0]*cosine+fusion.weights[1]*logit+fusion.bias;
          if (fusion.kind!=='class-QDA-diagonal-shrinkage-v1') return linear;
          const matrix=fusion.quadraticMatrix;
          return linear+matrix[0][0]*cosine*cosine+(matrix[0][1]+matrix[1][0])*cosine*logit+matrix[1][1]*logit*logit;
        }):scores;
        if (ranks.some(score=>!Number.isFinite(score))) throw new Error('Некорректная совместная оценка поиска.');
        // Never return an obsolete passage or a profile withdrawn while the
        // second neural stage was running. No mixed-model retry/fallback.
        const fresh=new Map(this.store.matching(filters,interpreted.queryConstraints).map(row=>[row.id,row]));
        let offset=0;
        const eligible=shortlist.flatMap(item=>{
          const sectionScores=scores.slice(offset,offset+item.taskSections.length);
          const sectionRanks=ranks.slice(offset,offset+item.taskSections.length);
          offset+=item.taskSections.length;
          const maximum=Math.max(...sectionRanks), winning=sectionRanks.indexOf(maximum);
          const row=fresh.get(item.sourceId);
          if (!row || row.document_hash!==item.documentHash || row.public_payload!==item.publicPayload
            || !this.currentVector(row,vectors.get(row.id))) return [];
          return [{...item,rerankerScore:sectionScores[winning],rank:maximum,
            reason:[`Похожие задачи в профиле: ${item.taskSections[winning].slice(0,350)}`,...item.reasonSuffix].join(' ')}];
        });
        items=eligible.filter(item=>item.rank>=(fusion?.threshold??stage.threshold));
        // A DEV applicability floor can offer a small nearest list only when
        // no current eligible profile passed the unchanged strong pair cutoff.
        if (!items.length && fusion?.admission) {
          items=eligible.filter(item=>item.rank>=fusion.admission.threshold).sort(order).slice(0,fusion.admission.limit)
            .map(item=>({...item,approximate:true}));
          if (items.length) warnings.push('Точных совпадений нет. Показаны ближайшие профили.');
        }
      } catch { throw new RequestError(503,'Поиск по смыслу недоступен. Повторите запрос или используйте фильтры без текста.'); }
    } else items=candidates.filter(item=>!embeddingQuery||item.semanticScore!==null&&item.semanticScore>=this.encoder.info.threshold);
    items.sort(order);
    return {items:items.slice(offset,offset+limit).map(({testScore,fsp,sourceId,documentHash,publicPayload,taskSections,reasonSuffix,roleLabel,...item})=>item),total:items.length,offset,limit,query,interpreted,effectiveFilters:filters,
      model:{...this.encoder.info,indexPolicy:PROFILE_INDEX_POLICY,...(stage?{stage:structuredClone(stage),rerankerAggregation:stage.scoreCalibration?'max-fused-task-sections-v1':'max-task-sections-v1'}:{})},warnings};
  }
  close() { this.encoder.close();this.store.close(); }
}
