/** Public dictionaries shared by the questionnaire, resume import and assessment API. */
export const specializationOptions = [
  { value: 'Frontend', label: 'Frontend', role: 'Frontend-разработчик' },
  { value: 'Backend', label: 'Backend', role: 'Backend-разработчик' },
  { value: 'Fullstack', label: 'Fullstack', role: 'Fullstack-разработчик' },
  { value: 'Mobile', label: 'Мобильная разработка', role: 'Мобильный разработчик' },
  { value: 'ML', label: 'ML и Data Science', role: 'Специалист по машинному обучению' },
  { value: 'DataAnalysis', label: 'Аналитика данных', role: 'Аналитик данных' },
  { value: 'DataEngineering', label: 'Инженерия данных', role: 'Инженер данных' },
  { value: 'DevOps', label: 'DevOps и SRE', role: 'DevOps-инженер' },
  { value: 'QA', label: 'Тестирование', role: 'Инженер по тестированию' },
  { value: 'Security', label: 'Информационная безопасность', role: 'Специалист по информационной безопасности' },
  { value: 'UXUI', label: 'UX/UI дизайн', role: 'UX/UI-дизайнер' },
  { value: 'BusinessAnalysis', label: 'Бизнес и системный анализ', role: 'Бизнес и системный аналитик' },
  { value: 'ProductManagement', label: 'Управление продуктом', role: 'Менеджер продукта' },
  { value: 'Embedded', label: 'Embedded и электроника', role: 'Инженер встраиваемых систем и электроники' },
] as const;

export type Specialization = typeof specializationOptions[number]['value'];
export const specializationNames = Object.fromEntries(specializationOptions.map(item => [item.value, item.label])) as Record<Specialization, string>;
export const specializationLabels = Object.fromEntries(specializationOptions.map(item => [item.value, item.role])) as Record<Specialization, string>;
export function isSpecialization(value: string): value is Specialization {
  return specializationOptions.some(item => item.value === value);
}

export const industryOptions: string[] = [
  'ИТ', 'Финансы', 'Страхование', 'Образование', 'Наука', 'Здравоохранение', 'Фармацевтика',
  'Промышленность', 'Энергетика', 'Нефть и газ', 'Телекоммуникации', 'Ритейл', 'Электронная коммерция',
  'Транспорт и логистика', 'Строительство', 'Недвижимость', 'Сельское хозяйство', 'Государственный сектор',
  'Консалтинг', 'Маркетинг и реклама', 'Медиа и развлечения', 'Туризм и гостеприимство', 'Спорт', 'НКО', 'Другое',
];

export const specializationStacks: Record<Specialization, string[]> = {
  Frontend: ['React', 'TypeScript', 'JavaScript', 'HTML', 'CSS', 'Vue', 'Angular'],
  Backend: ['Python', 'FastAPI', 'Node.js', 'Java', 'Go', 'SQL', 'PostgreSQL', 'Docker'],
  Fullstack: ['React', 'TypeScript', 'JavaScript', 'Node.js', 'Python', 'SQL', 'PostgreSQL', 'Docker'],
  Mobile: ['Kotlin', 'Swift', 'Dart', 'Flutter', 'React Native', 'Java', 'Android', 'iOS'],
  ML: ['Python', 'Pandas', 'NumPy', 'scikit-learn', 'PyTorch', 'TensorFlow', 'SQL'],
  DataAnalysis: ['SQL', 'Python', 'Pandas', 'Excel', 'Power BI', 'Tableau'],
  DataEngineering: ['Python', 'SQL', 'PostgreSQL', 'Spark', 'Airflow', 'Kafka', 'Docker'],
  DevOps: ['Linux', 'Docker', 'Kubernetes', 'Terraform', 'Ansible', 'Prometheus', 'Git'],
  QA: ['Playwright', 'Selenium', 'Postman', 'SQL', 'Python', 'JavaScript', 'Jira'],
  Security: ['Linux', 'Python', 'OWASP', 'Burp Suite', 'Wireshark'],
  UXUI: ['Figma', 'FigJam', 'Miro'],
  BusinessAnalysis: ['BPMN', 'UML', 'SQL', 'Jira', 'Confluence', 'Miro'],
  ProductManagement: ['SQL', 'Excel', 'Jira', 'Miro', 'Power BI'],
  Embedded: ['C', 'C++', 'STM32', 'FreeRTOS', 'UART', 'SPI', 'I2C', 'KiCad', 'PCB', 'Осциллограф'],
};
export const stackOptions = [...new Set([
  'React', 'TypeScript', 'JavaScript', 'CSS', 'Python', 'FastAPI', 'Node.js', 'PostgreSQL', 'Docker',
  ...Object.values(specializationStacks).flat(),
])];
export const defaultStackOptions = stackOptions.slice(0, 9);

const bounded = (expression: string) => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${expression})(?![\\p{L}\\p{N}_])`, 'iu');
const specializationPatterns: Array<[Specialization, RegExp]> = [
  ['Embedded', bounded('embedded|firmware|встраиваем[а-я]*\\s+(?:систем[а-я]*|разработ[а-я]*)|инженер[а-я]*\\s+(?:по\\s+)?электроник[а-я]*|электронщик[а-я]*|схемотехник[а-я]*|разработ[а-я]*\\s+прошив[а-я]*|embedded и электроника')],
  ['ProductManagement', bounded('product\\s*(?:manager|management|owner)|продакт[а-я]*|менеджер\\s+продукта|управление\\s+продуктом|владелец\\s+продукта')],
  ['Fullstack', bounded('full[- ]?stack|фулл?ст[эе]к[а-я]*')],
  ['BusinessAnalysis', bounded('business\\s*analys[а-яa-z]*|system[s]?\\s*analys[а-яa-z]*|бизнес[- ]аналит[а-я]*|системн[а-я]*\\s+аналит[а-я]*|бизнес и системный анализ')],
  ['DataEngineering', bounded('data\\s*engineer[а-яa-z]*|инженер[а-я]*\\s+данных|инженерия данных')],
  ['DevOps', bounded('devops|sre|site\\s+reliability\\s+engineer[а-яa-z]*|девопс[а-я]*')],
  ['Security', bounded('cybersecurity|information\\s+security|информационн[а-я]*\\s+безопасност[а-я]*|кибербезопасност[а-я]*|soc\\s*analyst|appsec|pentest[а-яa-z]*')],
  ['UXUI', bounded('ux(?:[ /-]*ui)?|ui(?:[ /-]*ux)?|uxui|product\\s*design[а-яa-z]*|дизайн[а-я]*\\s+интерфейс[а-я]*|продуктов[а-я]*\\s+дизайн[а-я]*')],
  ['Mobile', bounded('mobile|мобильн[а-я]*\\s+разработ[а-я]*|android|ios|flutter|react\\s+native')],
  ['QA', bounded('qa|quality\\s+assurance|тестировщик[а-я]*|тестирование|инженер[а-я]*\\s+(?:по\\s+)?тестировани[а-я]*|automation\\s+(?:test|engineer)[а-яa-z]*')],
  ['ML', bounded('ml|ai\\s*engineer[а-яa-z]*|machine[-\\s]+learning|data\\s*scientist|data\\s*science|машинн[а-я]*\\s+обучени[а-я]*|computer\\s+vision|компьютерн[а-я]*\\s+зрени[а-я]*|nlp')],
  ['DataAnalysis', bounded('data\\s*analys[а-яa-z]*|аналитик[а-я]*\\s+данных|аналитика данных|bi[- ]?аналитик[а-я]*|bi\\s*analyst')],
  ['Frontend', bounded('front[- ]?end|фронт[- ]?[эе]нд[а-я]*|разработ[а-я]*\\s+интерфейс[а-я]*')],
  ['Backend', bounded('back[- ]?end|б[эе]к[- ]?[эе]нд[а-я]*|серверн[а-я]*\\s+разработ[а-я]*')],
];

/** Recognizes the stated role, never infers a specialization from Python or other skills alone. */
export function detectSpecialization(text: string): Specialization | undefined {
  const normalized = text.normalize('NFKC');
  if (isSpecialization(normalized.trim())) return normalized.trim() as Specialization;
  let matches = specializationPatterns.filter(([value, pattern]) => pattern.test(normalized) || bounded(value).test(normalized)).map(([value]) => value);
  // Android and Flutter may describe a technology used by another stated role.
  if (matches.length > 1 && matches.includes('Mobile')
    && !bounded('mobile|мобильн[а-я]*\\s+разработ[а-я]*|(?:android|ios|flutter|react\\s+native)\\s+(?:developer|engineer|разработчик[а-я]*)').test(normalized)) {
    matches = matches.filter(value => value !== 'Mobile');
  }
  if (matches.includes('Fullstack') && matches.every(value => ['Fullstack', 'Frontend', 'Backend'].includes(value))) return 'Fullstack';
  // Multiple different roles require manual selection rather than an arbitrary priority.
  return matches.length === 1 ? matches[0] : undefined;
}

const industryPatterns: Array<[string, RegExp]> = [
  ['Нефть и газ', /нефт|нефте?газ|oil|petroleum|gas/iu],
  ['Электронная коммерция', /электронн[а-я]* коммерци|e[- ]?commerce|маркетплейс|marketplace/iu],
  ['Страхование', /страхов|insurance/iu], ['Фармацевтика', /фармацев|pharma/iu],
  ['Телекоммуникации', /телеком|связь|telecom/iu], ['Энергетика', /энергет|energy|power/iu],
  ['Наука', /наука|научн|research|science/iu], ['Финансы', /финанс|банк|financ|bank/iu],
  ['Образование', /образован|education/iu], ['Здравоохранение', /здравоохран|медицин|healthcare/iu],
  ['Промышленность', /промышлен|industrial|manufacturing/iu], ['Ритейл', /ритейл|торгов|retail/iu],
  ['Транспорт и логистика', /транспорт|логист|transport|logistics/iu], ['Строительство', /строитель|construction/iu],
  ['Недвижимость', /недвижим|real estate/iu], ['Сельское хозяйство', /сельск|агро|agriculture/iu],
  ['Государственный сектор', /государств|госслуж|public sector|government/iu], ['Консалтинг', /консалт|consulting/iu],
  ['Маркетинг и реклама', /маркетинг|реклам|marketing|advertising/iu], ['Медиа и развлечения', /медиа|развлечен|media|entertainment|gamedev|игров/iu],
  ['Туризм и гостеприимство', /туризм|гостеприим|гостиниц|tourism|hospitality/iu], ['Спорт', /спорт|sport/iu],
  ['НКО', /нко|некоммерческ|nonprofit|ngo/iu], ['ИТ', /^(?:ит|it|информационные технологии|software)(?![\p{L}\p{N}_])/iu],
];
export function detectIndustry(text: string): string {
  const exact = industryOptions.find(item => item.toLocaleLowerCase() === text.trim().toLocaleLowerCase());
  return exact || industryPatterns.find(([, pattern]) => pattern.test(text))?.[0] || 'Другое';
}
