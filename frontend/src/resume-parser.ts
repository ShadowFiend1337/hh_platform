import { detectIndustry, detectSpecialization, type Specialization } from '../../shared/catalog.ts';
import { MAX_STACK_SKILLS, resumeTextLimits } from '../../shared/resume-limits.ts';

/** Fields are suggestions from explicit resume text; category and consent are never inferred. */
export interface ResumeFields {
  name?: string;
  email?: string;
  phone?: string;
  city?: string;
  industry?: string;
  professionalRole?: string;
  specialization?: Specialization;
  desiredGrade?: 'Junior' | 'Middle';
  stack?: string[];
  experience?: string;
  softSkills?: string[];
  careerAchievements?: string;
  education?: string;
  workHistory?: string;
  portfolio?: string;
  languages?: string;
  format?: string;
}

export interface ResumeParseOptions {
  onTruncate?: (field: keyof ResumeFields) => void;
}

type SectionKind = 'experience' | 'education' | 'achievements' | 'skills' | 'softSkills' | 'languages' | 'portfolio' | 'role' | 'other';
const sectionPatterns: Array<[SectionKind, RegExp]> = [
  ['experience', /^(?:опыт работы|профессиональный опыт|трудовая деятельность|work experience|employment history|experience|опыт)(?:\s*[:—–-]\s*|\s+(?=\d|без опыта)|\s*$)(.*)$/iu],
  ['education', /^(?:дополнительное образование|образование|education|qualifications)(?:\s*[:—–-]\s*|\s*$)(.*)$/iu],
  ['achievements', /^(?:достижения(?: и результаты)?|результаты|achievements|accomplishments|awards)(?:\s*[:—–-]\s*|\s*$)(.*)$/iu],
  ['languages', /^(?:знание языков|иностранные языки|языки|languages)(?:\s*[:—–-]\s*|\s*$)(.*)$/iu],
  ['portfolio', /^(?:портфолио(?: и ссылки)?|ссылки на проекты|portfolio|links)(?:\s*[:—–-]\s*|\s*$)(.*)$/iu],
  ['role', /^(?:желаемая должность(?: и зарплата)?|должность|роль(?: в команде)?|desired position|job title|position|role|цель|objective)(?:\s*[:—–-]\s*|\s*$)(.*)$/iu],
  ['softSkills', /^(?:софт[- ]?скиллы(?:[ ·]+самооценка)?|soft skills)(?:\s*[:—–-]\s*|\s*$)(.*)$/iu],
  ['skills', /^(?:технические навыки|ключевые навыки|профессиональные навыки|technical skills|навыки|skills|стек|технологии)(?:\s*[:—–-]\s*|\s+(?=[A-ZА-Я])|\s*$)(.*)$/iu],
  ['other', /^(?:о себе|обо мне|контакты|дополнительная информация|summary|about(?: me)?|contacts?|references|projects|проекты|специализации|занятость|график работы)(?:\s*[:—–-]\s*|\s*$)(.*)$/iu],
];

const monthName = '(?:январ[ья]|феврал[ья]|март[а]?|апрел[ья]|ма[йя]|июн[ья]|июл[ья]|август[а]?|сентябр[ья]|октябр[ья]|ноябр[ья]|декабр[ья]|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)';
const employmentDate = `(?:${monthName}\\s+\\d{4}|\\d{1,2}[./]\\d{4}|\\d{4}[./-]\\d{1,2}|\\d{4})`;
const employmentPeriod = new RegExp(`^${employmentDate}\\s*[-—–]\\s*(?:${employmentDate}|(?:по\\s+)?настоящее время|present|current|now)`, 'iu');
const headerFrom = (line: string) => sectionPatterns.map(([kind, pattern]) => ({ kind, match: pattern.exec(line) })).find(item => item.match);
const employerLine = /^(?:ООО|АО|ПАО|ЗАО|ИП|ОАО|компания|работодатель|company|employer)(?:\s|:|$)|(?:компания|company|ltd\.?|llc)\s*$/iu;
const employmentRoleLine = (line: string) => line.length <= 100 && roleWords.test(line)
  && !/[.!?]$/u.test(line) && !/^(?:создал|разработал|запустил|улучшил|сократил|built|created|developed|launched)\s/iu.test(line);

function sections(lines: string[]): Partial<Record<SectionKind, string[]>> {
  const result: Partial<Record<SectionKind, string[]>> = {};
  let current: SectionKind | undefined;
  let embeddedAchievements = false;
  let collectingAchievements = false;
  for (const [index, line] of lines.entries()) {
    const header = headerFrom(line);
    if (current === 'experience' && header?.kind === 'achievements') {
      // A job's results must not hide all employment entries that follow it.
      let nextEmployment = -1;
      for (let next = index + 1; next < lines.length; next++) {
        const nextHeader = headerFrom(lines[next]);
        if (nextHeader && nextHeader.kind !== 'achievements') break;
        if (employmentPeriod.test(`${lines[next]} ${lines[next + 1] || ''}`)) { nextEmployment = next; break; }
      }
      if (nextEmployment >= 0 || embeddedAchievements) {
        embeddedAchievements = true;
        collectingAchievements = true;
        result.experience?.push(line);
        result.achievements ??= [];
        if (header.match?.[1]?.trim()) result.achievements.push(header.match[1].trim());
        continue;
      }
    }
    if (header) {
      current = header.kind;
      embeddedAchievements = false;
      collectingAchievements = false;
      result[current] ??= [];
      if (header.match?.[1]?.trim()) result[current]?.push(header.match[1].trim());
    } else if (current) {
      result[current]?.push(line);
      if (collectingAchievements) {
        if (employmentPeriod.test(`${line} ${lines[index + 1] || ''}`)) {
          // Remove only recognizable employer/title metadata, never a result
          // immediately followed by the next date-first employment entry.
          const previous = lines[index - 1];
          if (previous && result.achievements?.at(-1) === previous && (employerLine.test(previous) || employmentRoleLine(previous))) {
            result.achievements.pop();
            const employer = lines[index - 2];
            if (employmentRoleLine(previous) && employer && employerLine.test(employer) && result.achievements.at(-1) === employer) result.achievements.pop();
          }
          collectingAchievements = false;
        } else result.achievements?.push(line);
      }
    }
  }
  return result;
}

const stackPatterns: Array<[string, RegExp]> = [
  ['React', /\breact(?:\.js|js)?\b/i], ['TypeScript', /\btypescript\b/i], ['JavaScript', /\bjavascript\b/i],
  ['CSS', /\bcss\b/i], ['HTML', /\bhtml(?:5)?\b/i], ['Vue', /\bvue(?:\.js|js)?\b/i], ['Angular', /\bangular\b/i],
  ['Next.js', /\bnext(?:\.js|js)\b/i], ['Python', /\bpython\b/i], ['FastAPI', /\bfastapi\b/i], ['Django', /\bdjango\b/i],
  ['Node.js', /\bnode(?:\.js|js)\b/i], ['Java', /\bjava\b/i], ['C#', /(?<![\p{L}\p{N}])c#(?![\p{L}\p{N}])/iu],
  ['C++', /(?<![\p{L}\p{N}])c\+\+(?![\p{L}\p{N}])/iu], ['Go', /\bgolang\b|\bGo(?=\s*[,;/])/],
  ['PHP', /\bphp\b/i], ['SQL', /\bsql\b/i], ['PostgreSQL', /\bpostgres(?:ql)?\b/i], ['MySQL', /\bmysql\b/i],
  ['MongoDB', /\bmongodb\b/i], ['Redis', /\bredis\b/i], ['Docker', /\bdocker\b/i], ['Kubernetes', /\bkubernetes\b|\bk8s\b/i],
  ['Git', /\bgit\b/i], ['Linux', /\blinux\b/i], ['Pandas', /\bpandas\b/i], ['NumPy', /\bnumpy\b/i],
  ['PyTorch', /\bpytorch\b/i], ['TensorFlow', /\btensorflow\b/i], ['scikit-learn', /\bscikit[- ]?learn\b/i],
  ['Matplotlib', /\bmatplotlib\b/i], ['Excel', /\bexcel\b/i], ['Power BI', /\bpower\s*bi\b/i],
  ['Jira', /\bjira\b/i], ['Figma', /\bfigma\b/i], ['BPMN', /\bbpmn\b/i], ['UML', /\buml\b/i],
  ['Kotlin', /\bkotlin\b/i], ['Swift', /\bswift\b/i], ['Dart', /\bdart\b/i], ['Flutter', /\bflutter\b/i],
  ['React Native', /\breact\s+native\b/i], ['Android', /\bandroid\b/i], ['iOS', /\bios\b/i],
  ['Spark', /\b(?:apache\s+)?spark\b/i], ['Airflow', /\bairflow\b/i], ['Kafka', /\bkafka\b/i],
  ['Terraform', /\bterraform\b/i], ['Ansible', /\bansible\b/i], ['Prometheus', /\bprometheus\b/i],
  ['Playwright', /\bplaywright\b/i], ['Selenium', /\bselenium\b/i], ['Postman', /\bpostman\b/i],
  ['Tableau', /\btableau\b/i], ['Confluence', /\bconfluence\b/i], ['Miro', /\bmiro\b/i], ['FigJam', /\bfigjam\b/i],
  ['OWASP', /\bowasp\b/i], ['Burp Suite', /\bburp\s+suite\b/i], ['Wireshark', /\bwireshark\b/i],
];
const softSkillPatterns: Array<[string, RegExp]> = [
  ['Коммуникация', /коммуникация|коммуникабельность|communication skills/iu],
  ['Работа в команде', /работа в команде|teamwork|team player/iu],
  ['Самоорганизация', /самоорганизация|тайм[- ]?менеджмент|time management|self[- ]organization/iu],
  ['Решение задач', /решение (?:задач|проблем)|problem[- ]solving/iu],
  ['Лидерство', /лидерство|leadership/iu],
];
const roleWords = /(?:front[- ]?end|back[- ]?end|full[- ]?stack|developer|engineer|analyst|manager|designer|scientist|разработчик|программист|аналитик|менеджер|дизайнер|тестировщик|инженер|devops|\b(?:ml|qa|sre)\b|машинное обучение)/iu;
const nameReject = /резюме|curriculum|resume|product|project|manager|developer|engineer|analyst|designer|scientist|frontend|backend|опыт|образование|навыки|контакты|университет|достижения|бизнес|работа|менеджер|разработчик|аналитик|инженер|дизайнер|тестировщик|junior|middle|senior|москва|петербург|казань|новосибирск|екатеринбург|moscow|london|berlin/iu;

function nameFrom(lines: string[]): string | undefined {
  for (const raw of lines.slice(0, 12)) {
    const labeled = /^(?:имя(?: и фамилия)?|фио|ф\.и\.о\.|name)\s*[:—-]\s*(.+)$/iu.exec(raw);
    const line = (labeled?.[1] || raw.split(/[,|]/)[0]).trim();
    if (line.length > resumeTextLimits.name || nameReject.test(line)) continue;
    if (!/^[\p{Lu}][\p{L}'’.-]+(?:\s+[\p{Lu}][\p{L}'’.-]+){1,2}$/u.test(line)) continue;
    return line === line.toUpperCase()
      ? line.toLocaleLowerCase().replace(/(?:^|\s)\p{L}/gu, letter => letter.toLocaleUpperCase()) : line;
  }
  return undefined;
}

function directLabel(lines: string[], label: RegExp): string | undefined {
  for (const line of lines) { const match = label.exec(line); if (match?.[1]?.trim()) return match[1].trim(); }
  return undefined;
}

function notNegated(text: string, expression: RegExp): boolean {
  for (const match of text.matchAll(new RegExp(expression.source, expression.flags.replace('g', '') + 'g'))) {
    if (!/(?:\bno\b|\bnot\b|без|не|нет)\s+(?:\S+\s+){0,2}$/iu.test(text.slice(Math.max(0, match.index - 35), match.index))) return true;
  }
  return false;
}

export function parseResumeText(raw: string, options: ResumeParseOptions = {}): ResumeFields {
  const text = raw.slice(0, 100_000).replace(/\u00a0/g, ' ').replace(/[\u200b-\u200d\ufeff]/g, '');
  const lines = text.split(/\r?\n/).map(line => line.replace(/[\t ]+/g, ' ').trim()).filter(Boolean);
  const parts = sections(lines);
  const fields: ResumeFields = {};
  const sectionText = (kind: SectionKind) => parts[kind]?.join('\n').trim();
  const boundedField = (field: keyof typeof resumeTextLimits, value: string) => {
    if (value.length > resumeTextLimits[field]) options.onTruncate?.(field);
    return value.slice(0, resumeTextLimits[field]);
  };
  const name = nameFrom(lines);
  if (name) fields.name = name;
  const email = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/i.exec(text)?.[0];
  if (email) fields.email = boundedField('email', email);
  const phone = Array.from(text.matchAll(/(?:\+?\d[\d \t().-]{8,}\d)/g))
    .find(match => {
      const value = match[0].trim();
      const digits = value.replace(/\D/g, '').length;
      // A pair of employment dates is not an international telephone number.
      if (/\d{1,2}[./]\d{4}\s*[-—–]\s*\d{1,2}[./]\d{4}/u.test(value)) return false;
      const contactLine = text.slice(text.lastIndexOf('\n', match.index) + 1, text.indexOf('\n', match.index) < 0 ? text.length : text.indexOf('\n', match.index));
      return digits >= 10 && digits <= 15 && (value.startsWith('+') || /телефон|phone|\btel\b/iu.test(contactLine) || (match.index || 0) < lines.slice(0, 20).join('\n').length);
    })?.[0].trim();
  if (phone) fields.phone = boundedField('phone', phone);
  const labeledCity = directLabel(lines, /^(?:город(?: проживания)?|проживает|location|city)\s*[:—-]\s*(.+)$/iu);
  const cityMatch = /(?:Москва|Санкт[- ]Петербург|Казань|Екатеринбург|Новосибирск|Нижний Новгород|Самара|Уфа|Краснодар|Ростов-на-Дону|Воронеж|Пермь|Тюмень|Томск|Омск|Челябинск|Саратов|Ижевск|Волгоград|Сочи|Moscow|Saint Petersburg|Kazan|London|Berlin|New York)/iu.exec(lines.slice(0, 12).join('\n'))?.[0];
  if (labeledCity || cityMatch) fields.city = boundedField('city', (labeledCity || cityMatch)!.split(/[,|]/)[0].trim());

  const roleLines = parts.role?.slice(0, 3).filter(line => !/^(?:специализации|занятость|график|salary|зарплата)/iu.test(line));
  const headline = lines.slice(0, 14).find(line => line.length <= 120 && (roleWords.test(line) || detectSpecialization(line))
    && !/^(?:я |о себе|опыт|образование|навыки|стек|skills|stack|technologies|specialization|специализация|grade|грейд|отрасль|industry|работал|работала|участвовал|участвовала|начинающий.+с опытом)/iu.test(line));
  const role = roleLines?.[0] || headline;
  if (role) {
    const next = roleLines?.[1] || (headline ? lines[lines.indexOf(headline) + 1] : '');
    fields.professionalRole = boundedField('professionalRole', role.endsWith('/') && next && roleWords.test(next) ? `${role} ${next}` : role);
    const desired = fields.professionalRole;
    const specialization = detectSpecialization(desired);
    if (specialization) fields.specialization = specialization;
    if (/\bjunior\b|джуниор/iu.test(desired) && !/\b(?:middle|senior)\b|мидл|сеньор/iu.test(desired)) fields.desiredGrade = 'Junior';
    if (/\bmiddle\b|мидл/iu.test(desired) && !/\b(?:junior|senior)\b|джуниор|сеньор/iu.test(desired)) fields.desiredGrade = 'Middle';
  }
  const explicitSpecialization = directLabel(lines.slice(0, 25), /^(?:специализация|specialization)\s*[:—-]\s*(.+)$/iu);
  if (explicitSpecialization) {
    delete fields.specialization;
    const specialization = detectSpecialization(explicitSpecialization);
    if (specialization) fields.specialization = specialization;
  }
  const explicitGrade = directLabel(lines.slice(0, 25), /^(?:предполагаемый грейд|грейд|grade|seniority)\s*[:—-]\s*(.+)$/iu);
  if (explicitGrade) delete fields.desiredGrade;
  if (explicitGrade && /^(?:junior|джуниор)$/iu.test(explicitGrade)) fields.desiredGrade = 'Junior';
  if (explicitGrade && /^(?:middle|мидл)$/iu.test(explicitGrade)) fields.desiredGrade = 'Middle';
  const industry = directLabel(lines, /^(?:отрасль|сфера(?: деятельности)?|industry)\s*[:—-]\s*(.+)$/iu);
  if (industry) fields.industry = detectIndustry(industry);

  const knownStack = stackPatterns.filter(([, expression]) => notNegated(text, expression)).map(([skill]) => skill);
  const explicitSkills = (parts.skills || []).flatMap(line => line.replace(/^[•*·-]\s*/u, '').split(/[,;|•]/u))
    .map(skill => skill.trim()).filter(skill => skill.length > 1 && skill.length <= 50
      && skill.split(/\s+/u).length <= 3 && /^[.\p{L}\p{N}][\p{L}\p{N}\s.+#/_-]*$/u.test(skill)
      && !/^(?:не|нет|без|no|not)\s/iu.test(skill)
      && !/^(?:есть|имею|умею|владею|работал[аи]?|использую|опыт|i |worked |used |experienced )/iu.test(skill)
      && !stackPatterns.some(([, expression]) => expression.test(skill))
      && !softSkillPatterns.some(([, expression]) => expression.test(skill)));
  const allStack = Array.from(new Map([...knownStack, ...explicitSkills].map(skill => [skill.toLocaleLowerCase(), skill])).values());
  const stack: string[] = [];
  for (const skill of allStack) {
    if (stack.length === MAX_STACK_SKILLS || [...stack, skill].join(', ').length > resumeTextLimits.stack) {
      options.onTruncate?.('stack'); break;
    }
    stack.push(skill);
  }
  if (stack.length) fields.stack = stack;
  const softSkills = softSkillPatterns.filter(([, expression]) => notNegated(text, expression)).map(([skill]) => skill);
  if (softSkills.length) fields.softSkills = softSkills;
  const totalExperienceLabel = /^(?:общий (?:опыт(?: работы)?|стаж)|стаж(?: работы)?|total (?:work )?experience)\s*[:—–-]\s*(.+)$/iu;
  const explicitTotal = directLabel(lines, totalExperienceLabel);
  const experienceHeaders = lines.flatMap((line, index) => {
    const header = sectionPatterns[0][1].exec(line);
    return header ? [header[1]?.trim() || lines[index + 1] || ''] : [];
  });
  const duration = /^(?:\d{1,2}\s*(?:лет|год[а]?|years?)(?:\s+\d{1,2}\s*(?:месяц[а-я]*|months?))?|\d{1,2}\s*(?:месяц[а-я]*|months?))$/iu;
  const summary = [explicitTotal || '', ...experienceHeaders].find(value => duration.test(value) || /^(?:без опыта|no (?:work )?experience)$/iu.test(value));
  if (summary) fields.experience = /^(?:без опыта|no (?:work )?experience)$/iu.test(summary) ? 'Без опыта' : boundedField('experience', summary);
  const historyRows = [...(parts.experience || [])];
  if (summary && (historyRows[0] === summary || totalExperienceLabel.exec(historyRows[0] || '')?.[1]?.trim() === summary)) historyRows.shift();
  const history = historyRows.join('\n').trim();
  if (history) fields.workHistory = boundedField('workHistory', history);
  const achievements = sectionText('achievements');
  if (achievements) fields.careerAchievements = boundedField('careerAchievements', achievements);
  const education = sectionText('education');
  if (education) fields.education = boundedField('education', education);
  const languageRows = lines.filter(line => /(?:русский|английский|немецкий|французский|испанский|english|russian|german|french|spanish).*(?:родной|native|[ABC][12]|intermediate|advanced|начальн|свободн)|\b(?:RU|EN)\s+(?:родной|native|[ABC][12])/iu.test(line));
  const languages = sectionText('languages') || languageRows.join('\n');
  if (languages) fields.languages = boundedField('languages', languages);
  const portfolioText = sectionText('portfolio');
  const portfolioLinks = Array.from(text.matchAll(/(?:https?:\/\/)?(?:www\.)?(?:github\.com|gitlab\.com|behance\.net|dribbble\.com)\/[^\s<>()]+/gi))
    .map(match => match[0].replace(/[.,;]+$/, ''));
  if (portfolioText || portfolioLinks.length) fields.portfolio = boundedField('portfolio', Array.from(new Set([portfolioText, ...portfolioLinks].filter(Boolean))).join('\n'));
  const formatSource = directLabel(lines, /^(?:формат(?: работы)?|work format)\s*[:—-]\s*(.+)$/iu) || lines.slice(0, 20).join('\n');
  const formats: Array<[string, RegExp]> = [['Гибрид', /гибрид|hybrid/iu], ['Удалённо', /удал[её]нн?о|remote/iu], ['Офис', /офис|on[- ]?site/iu]];
  const format = formats.find(([, expression]) => notNegated(formatSource, expression))?.[0];
  if (format) fields.format = format;
  return fields;
}
