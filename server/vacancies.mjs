import { programs } from './bank.mjs';
import { dataExamples, dataSkillAliases } from './banks/data.mjs';
import { engineeringExamples, engineeringSkillAliases } from './banks/engineering.mjs';
import { productExamples, productSkillAliases } from './banks/product.mjs';

// Synthetic examples, not scraped vacancies or a labour-market dataset.
export const vacancyExamples = [
  ...dataExamples,
  ...engineeringExamples,
  ...productExamples,
  {
    id: 'frontend-junior', title: 'Frontend Junior', specialization: 'Frontend', grade: 'Junior',
    description: 'Создавать доступные формы и адаптивные страницы на HTML, CSS и JavaScript. Работать с flex и grid, событиями браузера и запросами fetch. Проверять управление с клавиатуры.',
  },
  {
    id: 'frontend-react', title: 'React разработчик', specialization: 'Frontend', grade: 'Middle',
    description: 'Разрабатывать интерфейс на React и JavaScript. Управлять состоянием, эффектами и асинхронными HTTP-запросами. Писать пользовательские тесты, обеспечивать доступность модальных окон и измерять производительность интерфейса.',
  },
  {
    id: 'frontend-product', title: 'Frontend продуктовой команды', specialization: 'Frontend', grade: 'Middle',
    description: 'Развивать кабинет пользователя на React, TypeScript и JavaScript. Работать с Promise, обработкой сетевых ошибок и профилированием. Предусмотреть тестирование и защиту от XSS. Часть старого интерфейса написана на Vue.',
  },
  {
    id: 'backend-junior', title: 'Backend Junior', specialization: 'Backend', grade: 'Junior',
    description: 'Разрабатывать HTTP REST API. Использовать SQL и PostgreSQL: JOIN, ограничения и транзакции. Проверять входные данные и права доступа, хранить пароли безопасно. Изучать рекомендации OWASP.',
  },
  {
    id: 'backend-payments', title: 'Backend платёжного сервиса', specialization: 'Backend', grade: 'Middle',
    description: 'Разрабатывать идемпотентные операции платежей. Использовать PostgreSQL, SQL и транзакции, контролировать конкурентные изменения. Доставлять события через transactional outbox. Настраивать retry, backoff, метрики и распределённую трассировку.',
  },
  {
    id: 'backend-orders', title: 'Backend сервиса заказов', specialization: 'Backend', grade: 'Middle',
    description: 'Проектировать REST API заказов, SQL-запросы и транзакции PostgreSQL. Обрабатывать сообщения RabbitMQ с повторной доставкой и dead-letter queue. Применять circuit breaker и наблюдаемость. Разворачивать сервисы в Docker и Kubernetes.',
  },
];

const bounded = expression => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${expression})(?![\\p{L}\\p{N}_])`, 'iu');
// Explicit lexical aliases are intentionally transparent: this is not an ML
// parser. A matched skill means its term is present, not that every task from
// a vacancy is assessed. Language, framework and infrastructure gaps remain
// visible rather than being silently treated as covered.
const skillLexicon = [
  ['HTML', bounded('html|семантическ[а-я]*|html5')],
  ['CSS', bounded('css|flex(?:box)?|grid|адаптивн[а-я]*|css3')],
  ['JavaScript', bounded('javascript|js|ecmascript|promise(?:s)?|fetch|async|await')],
  ['React', bounded('react|reactjs|useeffect|usestate|jsx')],
  ['Доступность', bounded('accessibility|a11y|aria|доступност[а-я]*|доступн[а-я]*|клавиатур[а-я]*')],
  ['HTTP', bounded('https?|сетев[а-я]*|http-запрос[а-я]*')],
  ['REST', bounded('rest|restful')],
  ['SQL', bounded('sql|join|n\\+1')],
  ['PostgreSQL', bounded('postgresql|postgres|постгрес[а-я]*')],
  ['Транзакции', bounded('transaction(?:s)?|транзакци[а-я]*|deadlock|блокировк[а-я]*|конкурентн[а-я]*|serialization')],
  ['Безопасность', bounded('security|безопасн[а-я]*|xss|csrf|парол[а-я]*|прав[а-я]* доступа|авторизаци[а-я]*')],
  ['OWASP', bounded('owasp')],
  ['Тестирование', bounded('testing|test(?:s)?|тестирован[а-я]*|тест[а-я]*|playwright|jest|vitest')],
  ['Производительность', bounded('performance|производительност[а-я]*|профилирован[а-я]*|профилиров[а-я]*|перцентил[а-я]*|p95|p99')],
  ['Идемпотентность', bounded('idempotenc[ey]|idempotent|идемпотентн[а-я]*')],
  ['Outbox', bounded('outbox')],
  ['Очереди', bounded('queue(?:s)?|очеред[а-я]*|брокер[а-я]*|rabbitmq|kafka|доставк[а-я]* событий|обработк[а-я]* сообщений')],
  ['Повторные запросы', bounded('retry|retries|backoff|jitter|circuit breaker|повторн[а-я]*|повтор[а-я]*')],
  ['Наблюдаемость', bounded('observability|наблюдаемост[а-я]*|tracing|trace(?:s)?|трассировк[а-я]*|метрик[а-я]*|telemetry')],
  ['Семантика HTML', bounded('семантическ[а-я]*|semantic[а-яa-z]*')],
  ['Формы HTML', bounded('form(?:s)?|форм[а-я]*|input|label')],
  ['Блочная модель', bounded('box-sizing|border-box|content-box|блочн[а-я]* модел[а-я]*')],
  ['Flexbox', bounded('flex(?:box)?|flex-элемент[а-я]*')],
  ['Адаптивная вёрстка', bounded('адаптивн[а-я]*|responsive|media quer(?:y|ies)')],
  ['Селекторы CSS', bounded('селектор[а-я]*|specificity|специфичност[а-я]*')],
  ['Массивы JavaScript', bounded('массив[а-я]*|array(?:s)?')],
  ['Сравнение JavaScript', bounded('строг[а-я]* сравнени[а-я]*|strict equality')],
  ['Promise', bounded('promise(?:s)?|async|await')],
  ['Неизменяемость', bounded('immutability|immutable|неизменяемост[а-я]*')],
  ['События DOM', bounded('dom|событи[а-я]* браузера|event listener|removeeventlistener')],
  ['Состояние React', bounded('usestate|состояни[а-я]*|react state')],
  ['Ключи React', bounded('react keys?|ключ[а-я]* react')],
  ['Эффекты React', bounded('useeffect|эффект[а-я]*|react effects?')],
  ['Promise.all', bounded('promise\\.all')],
  ['Promise.allSettled', bounded('promise\\.allsettled')],
  ['Асинхронные ошибки', bounded('асинхронн[а-я]* ошиб[а-я]*|обработк[а-я]* сетевых ошибок|promise rejection')],
  ['Параметризованные запросы', bounded('параметризованн[а-я]*|parameterized|prepared statements?|sql injection|sql-инъекци[а-я]*')],
  ['SQL JOIN', bounded('join(?:s)?')],
  ['NULL в SQL', bounded('null')],
  ['Уникальность данных', bounded('unique|уникальност[а-я]*|уникальн[а-я]*')],
  ['Внешние ключи', bounded('foreign keys?|внешн[а-я]* ключ[а-я]*')],
  ['Пароли', bounded('password(?:s)?|парол[а-я]*')],
  ['Секреты', bounded('secret(?:s)?|секрет[а-я]*|приватн[а-я]* ключ[а-я]*')],
  ['Логи', bounded('logs?|лог[а-я]*|журнал[а-я]*')],
  ['Права доступа', bounded('прав[а-я]* доступа|authorization|авторизаци[а-я]*')],
  ['Cookie', bounded('cookies?|httponly|samesite')],
  ['Разрешённые поля', bounded('mass assignment|разрешенн[а-я]* пол[а-я]*')],
  ['N+1', bounded('n\\+1')],
  ['Оптимистическая блокировка', bounded('optimistic locking|оптимистическ[а-я]* блокировк[а-я]*')],
  ['Deadlock', bounded('deadlock(?:s)?|взаимн[а-я]* блокировк[а-я]*')],
  ['Остатки', bounded('stock|остат[а-я]*|склад[а-я]*')],
  ['Изоляция транзакций', bounded('isolation|изоляци[а-я]*|read committed|serializ(?:able|ation)')],
  ['Circuit breaker', bounded('circuit breaker')],
  ['Перцентили', bounded('percentile(?:s)?|перцентил[а-я]*|p95|p99')],
  ['Jitter', bounded('jitter')],
  ['Трассировка', bounded('tracing|trace(?:s)?|трассировк[а-я]*|spans?')],
  ['Dead-letter queue', bounded('dead-letter queue|dlq')],
  // Known requirements outside this bank: recognizing these exposes coverage
  // gaps. The analyzer does not claim to recognize arbitrary unknown terms.
  ['TypeScript', bounded('typescript|ts')],
  ['Vue', bounded('vue(?:\\.js)?|vuejs')],
  ['Angular', bounded('angular')],
  ['Python', bounded('python|питон[а-я]*')],
  ['Go', bounded('go|golang')],
  ['Java', bounded('java')],
  ['C#', /(?<![\p{L}\p{N}_])c#(?![\p{L}\p{N}_])/iu],
  ['Node.js', bounded('node(?:\\.js)?|nodejs')],
  ['Docker', bounded('docker')],
  ['Kubernetes', bounded('kubernetes|k8s')],
  ['Redis', bounded('redis')],
  ['MongoDB', bounded('mongodb|mongo')],
  ['GraphQL', bounded('graphql')],
  ...[...dataSkillAliases, ...engineeringSkillAliases, ...productSkillAliases].map(([skill, expression]) => [skill, bounded(expression)]),
];

export function analyzeVacancy(description, specialization, grade) {
  const program = programs[specialization]?.[grade];
  if (!program) throw new Error('Неизвестная программа тестирования');
  const text = String(description ?? '').normalize('NFKC').replaceAll('ё', 'е');
  const identified = [...new Set(skillLexicon.filter(([, pattern]) => pattern.test(text)).map(([skill]) => skill))];
  const supported = new Set(program.families.flatMap(item => [...item.skills, ...item.variants.flatMap(variant => variant.skills || [])]));
  const matchedSkills = identified.filter(skill => supported.has(skill));
  const unmatchedSkills = identified.filter(skill => !supported.has(skill));
  const focusTopics = program.topics.filter(topic => program.families.some(item => item.topic === topic
    && [...item.skills, ...item.variants.flatMap(variant => variant.skills || [])].some(skill => matchedSkills.includes(skill))));
  return {
    matchedSkills,
    unmatchedSkills,
    focusTopics,
    recognized: matchedSkills.length > 0,
    summary: matchedSkills.length
      ? `Покрываются ${matchedSkills.length} навыков из явного словаря; общий состав теста сохранён.`
      : 'В описании не найдены навыки выбранной программы из явного словаря.',
  };
}
