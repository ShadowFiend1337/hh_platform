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

/** Supported IT team roles; shared by import and both profile forms. */
export const professionalRoleOptions: string[] = [
  'Frontend-разработчик', 'Backend-разработчик', 'Fullstack-разработчик', 'Разработчик ПО',
  'Мобильный разработчик', 'Android-разработчик', 'iOS-разработчик',
  'Специалист по машинному обучению', 'Аналитик данных', 'BI-аналитик', 'Инженер данных', 'Архитектор данных',
  'DevOps-инженер', 'SRE-инженер', 'Системный администратор',
  'Инженер по тестированию', 'Инженер по автоматизации тестирования',
  'Специалист по информационной безопасности', 'UX/UI-дизайнер', 'UX-исследователь',
  'Бизнес-аналитик', 'Системный аналитик', 'Бизнес и системный аналитик',
  'Менеджер продукта', 'Менеджер ИТ-проектов',
  'Инженер встраиваемых систем и электроники', 'Разработчик прошивок',
  'Архитектор ПО', 'Технический руководитель', 'Руководитель команды разработки',
];

export function normalizeProfessionalRole(role: string, specialization?: Specialization): string {
  const normalized = role.normalize('NFKC').trim().replace(/[–—]/g, '-');
  const exact = professionalRoleOptions.find(item => item.toLocaleLowerCase() === normalized.toLocaleLowerCase());
  if (exact) return exact;
  const statedRoles = specializationPatterns.filter(([, pattern]) => pattern.test(normalized));
  if (statedRoles.length > 1 && !detectSpecialization(normalized)) return '';
  const aliases: Array<[string, RegExp]> = [
    ['Специалист по машинному обучению', /ml[- ]?(?:engineer|инженер)/iu],
    ['Разработчик ПО', /unity.*(?:developer|разработ)|(?:developer|разработ).*unity/iu],
    ['Разработчик ПО', /unreal.*(?:developer|разработ)|(?:developer|разработ).*unreal/iu],
    ['Разработчик ПО', /game developer|gamedev|разработчик игр/iu],
    ['Разработчик ПО', /(?:1[сc]).*(?:developer|разработ|программист)|(?:developer|разработ|программист).*1[сc]/iu],
    ['Разработчик ПО', /desktop.*(?:developer|разработ)|разработчик десктоп/iu],
    ['Системный администратор', /technical support|инженер.*(?:технич.*)?поддержк/iu],
    ['Системный администратор', /network engineer|(?:сетевой инженер|инженер по сетям)/iu],
    ['Архитектор данных', /database administrator|администратор баз данных|\bdba\b/iu],
    ['Разработчик прошивок', /firmware|прошив/iu], ['Инженер встраиваемых систем и электроники', /схемотехник/iu],
    ['Android-разработчик', /android.*(?:developer|разработ)|(?:developer|разработ).*android/iu],
    ['iOS-разработчик', /ios.*(?:developer|разработ)|(?:developer|разработ).*ios/iu],
    ['Мобильный разработчик', /flutter.*(?:developer|разработ)|(?:developer|разработ).*flutter/iu],
    ['Специалист по машинному обучению', /data scientist|data science|дата[- ]сайентист/iu],
    ['Специалист по машинному обучению', /\bai[- ]?(?:engineer|инженер)/iu], ['Специалист по машинному обучению', /\bnlp[- ]?(?:engineer|инженер)/iu],
    ['Специалист по машинному обучению', /computer vision|компьютерн.*зрени/iu],
    ['BI-аналитик', /bi[- ]?(?:analyst|аналитик)/iu], ['Аналитик данных', /product analyst|продуктов.*аналитик/iu],
    ['Архитектор данных', /data architect|архитектор данных/iu], ['SRE-инженер', /\bsre\b|site reliability/iu],
    ['DevOps-инженер', /cloud engineer|облачн.*инженер/iu], ['Системный администратор', /sysadmin|system administrator|системн.*администратор/iu],
    ['Инженер по автоматизации тестирования', /automation.*(?:test|qa)|автоматизаци.*тест/iu],
    ['Специалист по информационной безопасности', /soc.*(?:analyst|аналитик)|аналитик soc/iu], ['Специалист по информационной безопасности', /pentest|пентест/iu], ['Специалист по информационной безопасности', /appsec/iu],
    ['UX-исследователь', /ux researcher|ux[- ]исследовател/iu], ['UX/UI-дизайнер', /product designer|продуктов.*дизайнер/iu],
    ['Бизнес-аналитик', /business analyst|бизнес[- ]аналитик/iu], ['Системный аналитик', /systems? analyst|системн.*аналитик/iu],
    ['Менеджер продукта', /product owner|владелец продукта/iu], ['Менеджер ИТ-проектов', /project manager|менеджер.*проект|руководитель.*проект/iu],
    ['Менеджер ИТ-проектов', /scrum[- ]?(?:master|мастер)|скрам[- ]?мастер/iu], ['Архитектор ПО', /software architect|архитектор (?:по|программного)/iu],
    ['Руководитель команды разработки', /team lead|тимлид|руководитель команды/iu], ['Технический руководитель', /tech lead|technical lead|технический руководитель/iu],
  ];
  const matched = [...new Set(aliases.filter(([, expression]) => expression.test(normalized)).map(([canonical]) => canonical))];
  if (matched.length === 1 && professionalRoleOptions.includes(matched[0])) return matched[0];
  if (matched.length > 1) return '';
  if (/^(?:тестировщик|tester)(?:\s|$)/iu.test(normalized)) return 'Инженер по тестированию';
  const stated = detectSpecialization(normalized);
  if (stated) return specializationLabels[stated];
  if (/^(?:(?:junior|middle|senior|lead|стаж[её]р)\s+)?(?:(?:python|java|javascript|typescript|c#|c\+\+|go|golang|rust|php|\.net)\s+)?(?:разработчик|developer|software (?:engineer|developer|разработчик)|программист)(?:\s+(?:junior|middle|senior|lead|стаж[её]р))?$/iu.test(normalized)) {
    return specialization ? specializationLabels[specialization] : 'Разработчик ПО';
  }
  return '';
}

export const softSkillOptions: string[] = [
  'Коммуникация', 'Работа в команде', 'Самоорганизация', 'Решение задач', 'Лидерство',
  'Критическое мышление', 'Аналитическое мышление', 'Креативность', 'Адаптивность',
  'Ответственность', 'Внимание к деталям', 'Управление временем', 'Приоритизация',
  'Проактивность', 'Обучаемость', 'Эмоциональный интеллект', 'Эмпатия', 'Переговоры',
  'Публичные выступления', 'Обратная связь', 'Разрешение конфликтов', 'Наставничество',
  'Принятие решений', 'Планирование', 'Стрессоустойчивость',
];

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
/** Stable technologies referenced by the assessment bank and exact search filters. */
export const stackOptions: string[] = [...new Set([
  'React', 'TypeScript', 'JavaScript', 'CSS', 'Python', 'FastAPI', 'Node.js', 'PostgreSQL', 'Docker',
  ...Object.values(specializationStacks).flat(),
])];

/** The editable resume catalog covers all IT directions, independent of assessed technologies. */
export const competenceOptions: string[] = [...new Set([
  'React', 'TypeScript', 'JavaScript', 'CSS', 'Python', 'FastAPI', 'Node.js', 'PostgreSQL', 'Docker',
  ...Object.values(specializationStacks).flat(),
  'Next.js', 'Nuxt', 'Svelte', 'SvelteKit', 'Astro', 'Redux', 'Zustand', 'MobX', 'RxJS',
  'Tailwind CSS', 'Sass', 'Less', 'Bootstrap', 'Webpack', 'Vite', 'Babel', 'Storybook',
  'Jest', 'Vitest', 'Cypress', 'Testing Library', 'REST', 'GraphQL', 'WebSocket', 'gRPC',
  'Django', 'Flask', 'Express', 'NestJS', 'Spring', 'Spring Boot', 'Hibernate', 'Maven', 'Gradle',
  'C#', '.NET', 'ASP.NET Core', 'Entity Framework', 'PHP', 'Laravel', 'Symfony', 'Ruby', 'Ruby on Rails',
  'Rust', 'Scala', 'Elixir', 'Erlang', 'Haskell', 'Lua', 'Perl', '1С', 'Qt', 'Unity', 'Unreal Engine',
  'MongoDB', 'Redis', 'MariaDB', 'SQLite', 'Oracle Database', 'Microsoft SQL Server', 'ClickHouse',
  'Elasticsearch', 'OpenSearch', 'RabbitMQ', 'NATS', 'Cassandra', 'DynamoDB', 'Neo4j',
  'SQLAlchemy', 'Prisma', 'Drizzle', 'Alembic', 'dbt', 'Hadoop', 'Flink', 'Databricks', 'Snowflake',
  'Matplotlib', 'Seaborn', 'SciPy', 'Statsmodels', 'Jupyter', 'OpenCV', 'XGBoost', 'LightGBM',
  'CatBoost', 'Keras', 'Transformers', 'Hugging Face', 'ONNX', 'MLflow', 'DVC', 'LangChain',
  'AWS', 'Azure', 'Google Cloud', 'Yandex Cloud', 'Nginx', 'Apache', 'Helm', 'Argo CD', 'Jenkins',
  'GitHub Actions', 'GitLab CI', 'CI/CD', 'Grafana', 'Loki', 'Zabbix', 'OpenTelemetry', 'Bash', 'PowerShell',
  'JUnit', 'pytest', 'unittest', 'TestNG', 'Appium', 'Robot Framework', 'Cucumber', 'Allure', 'JMeter', 'k6',
  'Charles', 'Swagger', 'OpenAPI', 'TestRail', 'Zephyr', 'Detox', 'XCTest', 'Espresso',
  'Jetpack Compose', 'SwiftUI', 'UIKit', 'Objective-C', 'Expo', 'Firebase', 'Android SDK', 'Xcode',
  'Metabase', 'Looker', 'Superset', 'Qlik', 'R', 'Google Analytics', 'A/B-тестирование',
  'Adobe XD', 'Sketch', 'Photoshop', 'Illustrator', 'InVision', 'Axure', 'Balsamiq',
  'Nmap', 'Metasploit', 'Kali Linux', 'Splunk', 'SIEM', 'OAuth 2.0', 'OpenID Connect', 'SAML',
  'TLS', 'TCP/IP', 'DNS', 'HTTP', 'VPN', 'Active Directory', 'LDAP',
  'ESP32', 'Arduino', 'Raspberry Pi', 'Zephyr RTOS', 'Embedded Linux', 'Yocto', 'I2S',
  'CAN', 'Modbus', 'MQTT', 'Verilog', 'VHDL', 'FPGA', 'Altium Designer', 'PlatformIO',
])];
export const defaultStackOptions = stackOptions.slice(0, 9);

const stackAliases: Record<string, string> = {
  'react.js': 'React', reactjs: 'React', 'vue.js': 'Vue', vuejs: 'Vue', 'nextjs': 'Next.js',
  'next js': 'Next.js', 'nodejs': 'Node.js', 'node js': 'Node.js', 'nuxt.js': 'Nuxt',
  ts: 'TypeScript', js: 'JavaScript', html5: 'HTML', css3: 'CSS', golang: 'Go',
  postgres: 'PostgreSQL', 'postgre sql': 'PostgreSQL', 'mongo db': 'MongoDB',
  'c sharp': 'C#', 'csharp': 'C#', 'dotnet': '.NET', 'net core': '.NET',
  'scikit learn': 'scikit-learn', sklearn: 'scikit-learn', k8s: 'Kubernetes',
  'apache spark': 'Spark', 'apache kafka': 'Kafka', 'apache airflow': 'Airflow',
  'tailwind': 'Tailwind CSS', 'tailwindcss': 'Tailwind CSS', 'sass/scss': 'Sass', scss: 'Sass',
  'react-native': 'React Native', 'powerbi': 'Power BI', 'ms sql': 'Microsoft SQL Server',
  'mssql': 'Microsoft SQL Server', 'sql server': 'Microsoft SQL Server', 'oracle': 'Oracle Database',
  'asp.net': 'ASP.NET Core', 'asp net core': 'ASP.NET Core', 'ef core': 'Entity Framework',
  '1c': '1С', '1с:предприятие': '1С', '1c:enterprise': '1С', 'a/b testing': 'A/B-тестирование',
};

/** Normalize aliases only when the entire competency matches, preserving specific and custom tools. */
export function normalizeStackSkill(value: string): string {
  const normalized = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  const key = normalized.toLocaleLowerCase();
  return stackAliases[key] || competenceOptions.find(skill => skill.toLocaleLowerCase() === key) || normalized;
}
export function normalizeStackSkills(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.map(normalizeStackSkill).filter(skill => {
    const key = skill.toLocaleLowerCase();
    if (!skill || seen.has(key)) return false;
    seen.add(key); return true;
  });
}


/** Search the resume dictionary by displayed name or a familiar alias; exact matches come first. */
export function searchStackCompetencies(query: string, values: readonly string[] = competenceOptions): string[] {
  const term = query.normalize('NFKC').trim().toLocaleLowerCase();
  if (!term) return [...values];
  const canonical = normalizeStackSkill(query).toLocaleLowerCase();
  const aliasTargets = new Set(Object.entries(stackAliases).filter(([alias]) => alias.startsWith(term)).map(([, value]) => value));
  const matches = values.filter(value => value.toLocaleLowerCase().includes(term)
    || value.toLocaleLowerCase().includes(canonical) || aliasTargets.has(value));
  return matches.sort((left, right) => Number(right.toLocaleLowerCase() === canonical) - Number(left.toLocaleLowerCase() === canonical));
}

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
