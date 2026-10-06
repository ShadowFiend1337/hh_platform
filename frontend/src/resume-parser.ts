/** Fields are suggestions from explicit resume text; category and consent are never inferred. */
export interface ResumeFields {
  name?: string;
  email?: string;
  phone?: string;
  city?: string;
  industry?: string;
  professionalRole?: string;
  specialization?: 'Frontend' | 'Backend';
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

type SectionKind = 'experience' | 'education' | 'achievements' | 'skills' | 'languages' | 'portfolio' | 'role' | 'other';
const sectionPatterns: Array<[SectionKind, RegExp]> = [
  ['experience', /^(?:опыт работы|профессиональный опыт|трудовая деятельность|work experience|employment history|experience|опыт)(?:\s*[:—–-]\s*|\s+(?=\d|без опыта)|\s*$)(.*)$/iu],
  ['education', /^(?:дополнительное образование|образование|education|qualifications)(?:\s*[:—–-]\s*|\s*$)(.*)$/iu],
  ['achievements', /^(?:достижения(?: и результаты)?|результаты|achievements|accomplishments|awards)(?:\s*[:—–-]\s*|\s*$)(.*)$/iu],
  ['languages', /^(?:знание языков|иностранные языки|языки|languages)(?:\s*[:—–-]\s*|\s*$)(.*)$/iu],
  ['portfolio', /^(?:портфолио(?: и ссылки)?|ссылки на проекты|portfolio|links)(?:\s*[:—–-]\s*|\s*$)(.*)$/iu],
  ['role', /^(?:желаемая должность(?: и зарплата)?|должность|роль(?: в команде)?|desired position|job title|position|role|цель|objective)(?:\s*[:—–-]\s*|\s*$)(.*)$/iu],
  ['skills', /^(?:технические навыки|ключевые навыки|профессиональные навыки|софт[- ]?скиллы(?:[ ·]+самооценка)?|soft skills|technical skills|навыки|skills|стек|технологии)(?:\s*[:—–-]\s*|\s+(?=[A-ZА-Я])|\s*$)(.*)$/iu],
  ['other', /^(?:о себе|обо мне|контакты|дополнительная информация|summary|about(?: me)?|contacts?|references|projects|проекты|специализации|занятость|график работы)(?:\s*[:—–-]\s*|\s*$)(.*)$/iu],
];

function sections(lines: string[]): Partial<Record<SectionKind, string[]>> {
  const result: Partial<Record<SectionKind, string[]>> = {};
  let current: SectionKind | undefined;
  for (const line of lines) {
    const header = sectionPatterns.map(([kind, pattern]) => ({ kind, match: pattern.exec(line) })).find(item => item.match);
    if (header) {
      current = header.kind;
      result[current] ??= [];
      if (header.match?.[1]?.trim()) result[current]?.push(header.match[1].trim());
    } else if (current) result[current]?.push(line);
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
];
const softSkillPatterns: Array<[string, RegExp]> = [
  ['Коммуникация', /коммуникация|коммуникабельность|communication skills/iu],
  ['Работа в команде', /работа в команде|teamwork|team player/iu],
  ['Самоорганизация', /самоорганизация|тайм[- ]?менеджмент|time management|self[- ]organization/iu],
  ['Решение задач', /решение (?:задач|проблем)|problem[- ]solving/iu],
  ['Лидерство', /лидерство|leadership/iu],
];
const roleWords = /(?:front[- ]?end|back[- ]?end|full[- ]?stack|developer|engineer|analyst|manager|разработчик|программист|аналитик|менеджер|дизайнер|тестировщик|инженер)/iu;
const nameReject = /резюме|curriculum|resume|product|project|manager|developer|engineer|analyst|frontend|backend|опыт|образование|навыки|контакты|университет|достижения|бизнес|работа|менеджер|разработчик|аналитик|инженер|junior|middle|senior|москва|петербург|казань|новосибирск|екатеринбург|moscow|london|berlin/iu;

function nameFrom(lines: string[]): string | undefined {
  for (const raw of lines.slice(0, 12)) {
    const labeled = /^(?:имя(?: и фамилия)?|фио|ф\.и\.о\.|name)\s*[:—-]\s*(.+)$/iu.exec(raw);
    const line = (labeled?.[1] || raw.split(/[,|]/)[0]).trim();
    if (line.length > 80 || nameReject.test(line)) continue;
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
  const match = expression.exec(text);
  if (!match) return false;
  return !/(?:\bno\b|\bnot\b|без|не|нет)\s+(?:\S+\s+){0,2}$/iu.test(text.slice(Math.max(0, match.index - 35), match.index));
}

export function parseResumeText(raw: string): ResumeFields {
  const text = raw.slice(0, 100_000).replace(/\u00a0/g, ' ').replace(/[\u200b-\u200d\ufeff]/g, '');
  const lines = text.split(/\r?\n/).map(line => line.replace(/[\t ]+/g, ' ').trim()).filter(Boolean);
  const parts = sections(lines);
  const fields: ResumeFields = {};
  const sectionText = (kind: SectionKind, limit: number) => parts[kind]?.join('\n').trim().slice(0, limit);
  const name = nameFrom(lines);
  if (name) fields.name = name;
  const email = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/i.exec(text)?.[0];
  if (email) fields.email = email.slice(0, 254);
  const phone = Array.from(text.matchAll(/(?:\+?\d[\d \t().-]{8,}\d)/g))
    .find(match => {
      const value = match[0].trim();
      const digits = value.replace(/\D/g, '').length;
      // A pair of employment dates is not an international telephone number.
      if (/\d{1,2}[./]\d{4}\s*[-—–]\s*\d{1,2}[./]\d{4}/u.test(value)) return false;
      const contactLine = text.slice(text.lastIndexOf('\n', match.index) + 1, text.indexOf('\n', match.index) < 0 ? text.length : text.indexOf('\n', match.index));
      return digits >= 10 && digits <= 15 && (value.startsWith('+') || /телефон|phone|\btel\b/iu.test(contactLine) || (match.index || 0) < lines.slice(0, 20).join('\n').length);
    })?.[0].trim();
  if (phone) fields.phone = phone.slice(0, 30);
  const labeledCity = directLabel(lines, /^(?:город(?: проживания)?|проживает|location|city)\s*[:—-]\s*(.+)$/iu);
  const cityMatch = /(?:Москва|Санкт[- ]Петербург|Казань|Екатеринбург|Новосибирск|Нижний Новгород|Самара|Уфа|Краснодар|Ростов-на-Дону|Воронеж|Пермь|Тюмень|Томск|Омск|Челябинск|Саратов|Ижевск|Волгоград|Сочи|Moscow|Saint Petersburg|Kazan|London|Berlin|New York)/iu.exec(lines.slice(0, 12).join('\n'))?.[0];
  if (labeledCity || cityMatch) fields.city = (labeledCity || cityMatch)?.split(/[,|]/)[0].trim().slice(0, 80);

  const roleLines = parts.role?.slice(0, 3).filter(line => !/^(?:специализации|занятость|график|salary|зарплата)/iu.test(line));
  const headline = lines.slice(0, 14).find(line => line.length <= 120 && roleWords.test(line)
    && !/^(?:я |о себе|опыт|образование|навыки|работал|работала|участвовал|участвовала|начинающий.+с опытом)/iu.test(line));
  const role = roleLines?.[0] || headline;
  if (role) {
    const next = roleLines?.[1] || (headline ? lines[lines.indexOf(headline) + 1] : '');
    fields.professionalRole = (role.endsWith('/') && next && roleWords.test(next) ? `${role} ${next}` : role).slice(0, 100);
    const desired = fields.professionalRole;
    const frontend = /front[- ]?end|фронт[- ]?енд/iu.test(desired);
    const backend = /back[- ]?end|б[эе]к[- ]?енд/iu.test(desired);
    // Fullstack, PM, BA, ML and other roles retain their text and no test category is invented.
    if (frontend !== backend && !/full[- ]?stack|фулл?ст[эе]к/iu.test(desired)) fields.specialization = frontend ? 'Frontend' : 'Backend';
    if (/\bjunior\b|джуниор/iu.test(desired) && !/\b(?:middle|senior)\b|мидл|сеньор/iu.test(desired)) fields.desiredGrade = 'Junior';
    if (/\bmiddle\b|мидл/iu.test(desired) && !/\b(?:junior|senior)\b|джуниор|сеньор/iu.test(desired)) fields.desiredGrade = 'Middle';
  }
  const explicitSpecialization = directLabel(lines.slice(0, 25), /^(?:специализация|specialization)\s*[:—-]\s*(.+)$/iu);
  if (explicitSpecialization) delete fields.specialization;
  if (explicitSpecialization && /^(?:front[- ]?end|фронт[- ]?енд)(?:\s+разработчик|\s+developer)?$/iu.test(explicitSpecialization)) fields.specialization = 'Frontend';
  if (explicitSpecialization && /^(?:back[- ]?end|б[эе]к[- ]?енд)(?:\s+разработчик|\s+developer)?$/iu.test(explicitSpecialization)) fields.specialization = 'Backend';
  const explicitGrade = directLabel(lines.slice(0, 25), /^(?:предполагаемый грейд|грейд|grade|seniority)\s*[:—-]\s*(.+)$/iu);
  if (explicitGrade) delete fields.desiredGrade;
  if (explicitGrade && /^(?:junior|джуниор)$/iu.test(explicitGrade)) fields.desiredGrade = 'Junior';
  if (explicitGrade && /^(?:middle|мидл)$/iu.test(explicitGrade)) fields.desiredGrade = 'Middle';
  const industry = directLabel(lines, /^(?:отрасль|сфера(?: деятельности)?|industry)\s*[:—-]\s*(.+)$/iu);
  if (industry) {
    const categories: Array<[string, RegExp]> = [
      ['ИТ', /^(?:ит|it|информационные технологии|software)/iu], ['Финансы', /финанс|банки|financ|bank/iu],
      ['Образование', /образован|education/iu], ['Здравоохранение', /здравоохран|медицин|healthcare/iu],
      ['Промышленность', /промышлен|industrial|manufacturing/iu], ['Ритейл', /ритейл|торгов|retail/iu],
    ];
    fields.industry = categories.find(([, expression]) => expression.test(industry))?.[0] || 'Другое';
  }

  const stack = stackPatterns.filter(([, expression]) => notNegated(text, expression)).map(([skill]) => skill).slice(0, 20);
  if (stack.length) fields.stack = stack;
  const softSkills = softSkillPatterns.filter(([, expression]) => notNegated(text, expression)).map(([skill]) => skill);
  if (softSkills.length) fields.softSkills = softSkills;
  const history = sectionText('experience', 4000);
  if (history) fields.workHistory = history;
  const durationSource = [history || '', ...lines.filter(line => /опыт|experience/iu.test(line))].join('\n');
  const duration = /(?:\b\d{1,2}\s*(?:лет|год[а]?|years?)(?:\s+\d{1,2}\s*(?:месяц[а-я]*|months?))?|\b\d{1,2}\s*(?:месяц[а-я]*|months?))/iu.exec(durationSource)?.[0];
  if (duration) fields.experience = duration.slice(0, 100);
  else if (/без опыта|no (?:work )?experience/iu.test(durationSource)) fields.experience = 'Без опыта';
  else if (history) fields.experience = history.split('\n')[0].slice(0, 100);
  const achievements = sectionText('achievements', 2000);
  if (achievements) fields.careerAchievements = achievements;
  const education = sectionText('education', 2000);
  if (education) fields.education = education;
  const languageRows = lines.filter(line => /(?:русский|английский|немецкий|французский|испанский|english|russian|german|french|spanish).*(?:родной|native|[ABC][12]|intermediate|advanced|начальн|свободн)|\b(?:RU|EN)\s+(?:родной|native|[ABC][12])/iu.test(line));
  const languages = sectionText('languages', 500) || languageRows.join('\n').slice(0, 500);
  if (languages) fields.languages = languages;
  const portfolioText = sectionText('portfolio', 1000);
  const portfolioLinks = Array.from(text.matchAll(/(?:https?:\/\/)?(?:www\.)?(?:github\.com|gitlab\.com|behance\.net|dribbble\.com)\/[^\s<>()]+/gi))
    .map(match => match[0].replace(/[.,;]+$/, ''));
  if (portfolioText || portfolioLinks.length) fields.portfolio = Array.from(new Set([portfolioText, ...portfolioLinks].filter(Boolean))).join('\n').slice(0, 1000);
  const formatSource = directLabel(lines, /^(?:формат(?: работы)?|work format)\s*[:—-]\s*(.+)$/iu) || lines.slice(0, 20).join('\n');
  const formats: Array<[string, RegExp]> = [['Гибрид', /гибрид|hybrid/iu], ['Удалённо', /удал[её]нн?о|remote/iu], ['Офис', /офис|on[- ]?site/iu]];
  const format = formats.find(([, expression]) => notNegated(formatSource, expression))?.[0];
  if (format) fields.format = format;
  return fields;
}
