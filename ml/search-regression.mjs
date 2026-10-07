/**
 * Authored functional retrieval regression suite on fictional directory seeds.
 * These cases are intentionally separate from train/dev/test query literals.
 * They are NOT an independently labelled scientific test or real hiring data.
 * Do not train, select thresholds or tune model parameters on these cases.
 *
 * Default: schema/fixture/no-verbatim-copy validation, with no model or HTTP call.
 * Run: node ml/search-regression.mjs --run --model server/data/semantic-model
 *       --output server/data/search-regression-before.json
 * Compare: add --compare server/data/search-regression-before.json
 * --strict fails mandatory requirements/transport; challenge failures are reported.
 * --case <id> runs one case. All calls are sequential, directly against an isolated
 * DirectoryService :memory: instance; no HTTP rate limits or live data are involved.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { directoryCandidates } from '../server/directory-seed.mjs';
import { specializationOptions } from '../shared/catalog.ts';

export const suiteVersion = 'functional-search-v1';
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const hash = text => createHash('sha256').update(text).digest('hex');
const positive = (id, group, query, rolesAny, seedIdsAny, extra = {}) => ({
  id, group, tier: 'mandatory', query, filters: {}, expected: { rolesAny, seedIdsAny, minItems: 1 }, ...extra,
});
const challenge = (...args) => ({ ...positive(...args), tier: 'challenge' });
const empty = (id, group, query, filters = {}, tier = 'mandatory') => ({
  id, group, tier, query, filters, expected: { empty: true },
});

export const cases = [
  positive('role-frontend', 'role-paraphrase', 'Нужен исполнитель, который напишет браузерную часть анкеты: связанные поля, сохранение введённого и понятное исправление ошибок.', ['Frontend'], ['demo-frontend-8', 'demo-frontend-1', 'demo-frontend-2']),
  positive('role-backend', 'role-paraphrase', 'Нужен разработчик обработки денежных операций: повтор запроса после обрыва связи не должен списать покупку второй раз.', ['Backend'], ['demo-backend-2', 'demo-backend-4']),
  positive('role-fullstack', 'role-paraphrase', 'Один разработчик должен сделать складской кабинет целиком: видимые таблицы остатков, обработку списания на стороне сервиса и хранение изменений.', ['Fullstack'], ['demo-fullstack-2', 'demo-fullstack-5']),
  positive('role-mobile', 'role-paraphrase', 'Нужен разработчик программы для смартфона курьера: положение на карте, обновления в фоне и экономный расход заряда.', ['Mobile'], ['demo-mobile-6', 'demo-mobile-1']),
  positive('role-ml', 'role-paraphrase', 'Нужен специалист, который по архиву размеченных писем наладит автоматический выбор темы для новых обращений и проверит ошибки на ещё не просмотренных письмах.', ['ML'], ['demo-ml-2']),
  positive('role-data-analysis', 'role-paraphrase', 'Нужен человек, который разберёт, отчего упала маржа продаж: сверит покупки со скидками и возвратами, покажет различия каналов и объяснит выводы.', ['DataAnalysis'], ['demo-dataanalysis-1', 'demo-dataanalysis-4']),
  positive('role-data-engineering', 'role-paraphrase', 'Нужен исполнитель ежедневного переноса записей из клиентской системы в аналитическое хранилище: целая партия, запоздалые записи и безопасный повтор загрузки.', ['DataEngineering'], ['demo-dataengineering-1', 'demo-dataengineering-6', 'demo-dataengineering-7']),
  positive('role-devops', 'role-paraphrase', 'Нужен человек, который уберёт ручное выкладывание сборки: соберёт образ, доставит его на стенд и даст вернуть предыдущий выпуск.', ['DevOps'], ['demo-devops-1', 'demo-devops-10']),
  positive('role-qa', 'role-paraphrase', 'Нужен специалист, который воспроизводимо проверит путь покупки перед выпуском, поймает дефекты на границах ввода и разберёт нестабильные проверки.', ['QA'], ['demo-qa-1', 'demo-qa-5', 'demo-qa-7']),
  positive('role-security', 'role-paraphrase', 'Нужен специалист для расследования чужих входов: сопоставить следы доступа, отличить ложную тревогу и подтвердить, была ли учётная запись захвачена.', ['Security'], ['demo-security-2', 'demo-security-7']),
  positive('role-uxui', 'role-paraphrase', 'Нужен дизайнер, который выяснит, где люди путаются при покупке: наблюдает попытки, рисует варианты экранов и проверяет их до написания кода.', ['UXUI'], ['demo-uxui-1', 'demo-uxui-2', 'demo-uxui-8']),
  positive('role-business-analysis', 'role-paraphrase', 'Нужен специалист, который соберёт противоречивые условия расчёта возврата, согласует исключения и составит однозначные примеры для разработчиков.', ['BusinessAnalysis'], ['demo-businessanalysis-1', 'demo-businessanalysis-6']),
  positive('role-product-management', 'role-paraphrase', 'Нужен человек, который выберет, куда вложить ограниченную команду: сравнит пользу инициатив, подтверждения спроса, расходы и риски и пересмотрит план.', ['ProductManagement'], ['demo-productmanagement-6', 'demo-productmanagement-10']),
  positive('role-embedded', 'role-paraphrase', 'Нужен инженер, который разберёт рисунок электрических соединений устройства, пояснит назначение узлов и найдёт, почему небольшая плата не включается.', ['Embedded'], ['demo-embedded-1', 'demo-embedded-9']),

  positive('ml-visual-defects', 'ml-without-role-keywords', 'Есть снимки изделий с пометками о браке. Нужен человек, который настроит автоматическое обнаружение дефектного изделия по новому снимку и разберёт ложные тревоги.', ['ML'], ['demo-ml-3']),
  positive('ml-demand-ahead', 'ml-without-role-keywords', 'Есть история покупок и отсутствия товаров. Нужен специалист, который заранее оценит потребность на следующие недели с учётом праздников и проверит прогноз на будущем периоде.', ['ML'], ['demo-ml-4']),
  positive('ml-personal-choice', 'ml-without-role-keywords', 'Хотим подбирать каждому посетителю подходящие товары из истории просмотров и покупок. Нужен человек, который реализует подбор и отдельно проверит новых посетителей без истории.', ['ML'], ['demo-ml-1']),

  positive('electronics-explain', 'electronics', 'Ищу человека, способного терпеливо пояснить, как питание, резисторы и измерительные узлы связаны на электронной плате; требуется разбор схемы, а не веб-страницы.', ['Embedded'], ['demo-embedded-1', 'demo-embedded-2', 'demo-embedded-9']),
  positive('electronics-measurement', 'electronics', 'Нужен инженер, чтобы найти источник шумов в измерительном тракте: датчик, усиление, фильтрация, преобразование сигнала и проверка приборами.', ['Embedded'], ['demo-embedded-2', 'demo-embedded-9']),
  positive('electronics-budget', 'electronics', 'Нужен человек, который объяснит цепи питания и сигналы электронной платы и поможет с измерениями. Бюджет до 200 тысяч рублей в месяц.', ['Embedded'], ['demo-embedded-1', 'demo-embedded-2', 'demo-embedded-9'], { expected: { rolesAny: ['Embedded'], seedIdsAny: ['demo-embedded-1', 'demo-embedded-2', 'demo-embedded-9'], minItems: 1, constraints: { salaryMax: 200000 }, interpreted: { salaryMax: 200000 } } }),

  challenge('ambiguous-device-link', 'ambiguous', 'Данные датчика иногда теряются на пути в приложение пользователя. Нужен человек, который проверит обмен устройства с периферией или переподключение клиента и локализует место обрыва.', ['Embedded', 'Mobile'], ['demo-embedded-5', 'demo-mobile-4']),
  challenge('ambiguous-experiment-decision', 'ambiguous', 'Нужен человек, который разберёт результат пробного изменения покупки: проверить группы и числа или организовать эксперимент и решить, что выпускать дальше.', ['DataAnalysis', 'ProductManagement'], ['demo-dataanalysis-3', 'demo-productmanagement-5']),

  empty('reject-plumbing', 'out-of-scope', 'Нужен мастер заменить протекающий сифон под раковиной и устранить засор канализационной трубы.'),
  empty('reject-school-geometry', 'out-of-scope', 'Нужен репетитор проводить очные уроки геометрии школьнику: доказательства теорем, задачи с циркулем и подготовка к контрольной.'),
  empty('reject-tax-accounting', 'out-of-scope', 'Нужен практикующий бухгалтер составить налоговые декларации организации и вести официальную первичную документацию.'),
  empty('reject-mains-installation', 'out-of-scope', 'Нужен электромонтажник заменить розетки, проложить силовую проводку 220 вольт в квартире и собрать распределительный щит.', {}, 'challenge'),

  positive('filter-city-budget', 'hard-filters', '', ['Frontend'], ['demo-frontend-1'], { filters: { specialization: 'Frontend', city: 'Москва', salaryMax: 160000 }, expected: { rolesAny: ['Frontend'], seedIdsAny: ['demo-frontend-1'], minItems: 1, constraints: { specialization: 'Frontend', city: 'Москва', salaryMax: 160000 } } }),
  positive('filter-salary-boundary', 'hard-filters', '', ['Embedded'], ['demo-embedded-2'], { filters: { specialization: 'Embedded', grade: 'Senior', salaryMax: 180000 }, expected: { rolesAny: ['Embedded'], seedIdsAny: ['demo-embedded-2'], minItems: 1, constraints: { specialization: 'Embedded', grade: 'Senior', salaryMax: 180000 } } }),
  positive('filter-experience-boundary', 'hard-filters', '', ['ML'], ['demo-ml-6'], { filters: { specialization: 'ML', experienceMin: 47, experienceMax: 47 }, expected: { rolesAny: ['ML'], seedIdsAny: ['demo-ml-6'], minItems: 1, constraints: { specialization: 'ML', experienceMin: 47, experienceMax: 47 } } }),
  positive('filter-language-portfolio', 'hard-filters', '', ['QA'], ['demo-qa-3'], { filters: { specialization: 'QA', city: 'Москва', language: 'de', hasPortfolio: true, salaryMax: 120000 }, expected: { rolesAny: ['QA'], seedIdsAny: ['demo-qa-3'], minItems: 1, constraints: { specialization: 'QA', city: 'Москва', language: 'de', hasPortfolio: true, salaryMax: 120000 } } }),
  positive('filter-combined', 'hard-filters', '', ['Embedded'], ['demo-embedded-2'], { filters: { specialization: 'Embedded', city: 'Екатеринбург', format: 'Удалённо', language: 'en', hasPortfolio: true, experienceMin: 78, experienceMax: 80, salaryMax: 180000, stack: ['STM32', 'Осциллограф'] }, expected: { rolesAny: ['Embedded'], seedIdsAny: ['demo-embedded-2'], minItems: 1, constraints: { specialization: 'Embedded', city: 'Екатеринбург', format: 'Удалённо', language: 'en', hasPortfolio: true, experienceMin: 78, experienceMax: 80, salaryMax: 180000, stack: ['STM32', 'Осциллограф'] } } }),
  empty('filter-no-city', 'hard-filters', '', { city: 'Магадан' }),
  empty('filter-zero-budget', 'hard-filters', '', { salaryMax: 0 }),
  empty('filter-no-language', 'hard-filters', '', { language: 'fr' }),
  positive('filter-natural-budget-stricter', 'hard-filters', 'Нужен инженер для разбора питания и измерений на электронной плате, до 160 тысяч рублей в месяц.', ['Embedded'], ['demo-embedded-1', 'demo-embedded-9'], { filters: { salaryMax: 200000 }, expected: { rolesAny: ['Embedded'], seedIdsAny: ['demo-embedded-1', 'demo-embedded-9'], minItems: 1, constraints: { salaryMax: 160000 }, interpreted: { salaryMax: 160000 } } }),

  challenge('negation-ml-versus-reports', 'negation', 'Не нужен ML-инженер для создания алгоритмов. Нужен аналитик данных, который сверит продажи с возвратами и покажет причины падения выручки в отчёте.', ['DataAnalysis'], ['demo-dataanalysis-1', 'demo-dataanalysis-4'], { expected: { rolesAny: ['DataAnalysis'], seedIdsAny: ['demo-dataanalysis-1', 'demo-dataanalysis-4'], minItems: 1, forbiddenTopRoles: ['ML'] } }),
  challenge('negation-server-versus-browser', 'negation', 'Не ищем Backend и DevOps: сервер и выпуск уже готовы. Нужен Frontend, чтобы исправить связанные поля большой анкеты и не терять введённое при переходах.', ['Frontend'], ['demo-frontend-8', 'demo-frontend-1'], { expected: { rolesAny: ['Frontend'], seedIdsAny: ['demo-frontend-8', 'demo-frontend-1'], minItems: 1, forbiddenTopRoles: ['Backend', 'DevOps'] } }),
  challenge('negation-no-remote', 'negation', 'Инженер электроники должен быть в офисе: удалённо не подходит, приборы и плата находятся на стенде. Нужна диагностика питания устройства.', ['Embedded'], ['demo-embedded-1', 'demo-embedded-4'], { expected: { rolesAny: ['Embedded'], seedIdsAny: ['demo-embedded-1', 'demo-embedded-4'], minItems: 1, constraints: { format: 'Офис' }, interpreted: { format: 'Офис' } } }),

  challenge('typo-text-routing', 'typos', 'Нужен спецалист, чтобы по размеченым письмам автоматичеки определять тему новых абращений и проверять ошибки на незнакомых примерах.', ['ML'], ['demo-ml-2']),
  challenge('typo-electronics', 'typos', 'Ищем инженера разабраться в электонике: объяснить питание платы, соединение датчиков и измерить сигнлы осцилографом.', ['Embedded'], ['demo-embedded-1', 'demo-embedded-2', 'demo-embedded-9']),

  challenge('long-task-at-end', 'long-description', [
    'У нас небольшая команда и уже работающая организация. Сейчас обсуждаем найм ещё одного сотрудника.',
    'Планируем совместно уточнить обязанности, описать ожидаемый результат и выделить время на знакомство.',
    'Рабочие встречи проходят заранее, вопросы собираем письменно, общий план пересматриваем каждую неделю.',
    'Человек будет общаться с несколькими отделами и объяснять ход работы коллегам с разным опытом.',
    'Необходима аккуратная передача результатов, понятное описание ограничений и проверяемые выводы.',
    'Команда предоставляет материалы и время на погружение. Мы учитываем возможные вопросы при старте.',
    'Мы ценим последовательную работу, документирование решений и спокойное обсуждение обнаруженных проблем.',
    'Это общая информация о взаимодействии, она не задаёт техническое направление искомого сотрудника.',
    'Конкретная задача: автоматически находить брак на фотографиях изделий по прошлым помеченным снимкам и измерить число ошибочных тревог.',
  ].join(' '), ['ML'], ['demo-ml-3']),
  challenge('long-task-in-middle', 'long-description', [
    'Новый сотрудник получит доступ к рабочим материалам и сможет уточнить детали на вводной встрече.',
    'Важно фиксировать допущения, согласовывать результат и делать работу понятной всем участникам.',
    'Предоставим время для знакомства с контекстом; необязательно знать все особенности организации заранее.',
    'Главная задача: собрать однозначные правила расчёта тарифов и возвратов, согласовать граничные даты, исключения и примеры для разработки.',
    'После выполнения нужно передать документы коллегам, ответить на вопросы и указать оставшиеся ограничения.',
    'Дальнейшие встречи назначаются по необходимости. Обсуждения не заменяют самостоятельно проверяемый результат.',
    'Порядок коммуникации согласуем при начале работы. Это описание условий команды, а не отдельная профессия.',
  ].join(' '), ['BusinessAnalysis'], ['demo-businessanalysis-6', 'demo-businessanalysis-1']),
];

export async function validateSuite() {
  const ids = new Set(), knownRoles = new Set(specializationOptions.map(item => item.value));
  const seeds = new Map(directoryCandidates.map(person => [person.id, person]));
  const corpusSources = Object.fromEntries(await Promise.all(['dataset.py', 'dataset_v2.py', 'dataset_v3.py'].map(async name =>
    [name, await readFile(new URL('./' + name, import.meta.url), 'utf8')])));
  const normalized = value => value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('ru');
  // Corpora store authored rows as double-quoted string literals. Do not
  // execute training code or import a Python environment just to check copies.
  const corpusLiterals = new Set(Object.values(corpusSources).flatMap(source => Array.from(source.matchAll(/"(?:[^"\\]|\\.)*"/gu), match => {
    try { return normalized(JSON.parse(match[0])); } catch { return ''; }
  })));
  for (const item of cases) {
    assert(!ids.has(item.id), `Duplicate case ${item.id}`); ids.add(item.id);
    assert(['mandatory', 'challenge'].includes(item.tier));
    assert.equal(typeof item.query, 'string'); assert(item.query.length <= 1200, item.id);
    assert(item.expected.empty || item.expected.rolesAny?.length && item.expected.seedIdsAny?.length, item.id);
    if (item.query) assert(!corpusLiterals.has(normalized(item.query)), `Verbatim corpus copy in ${item.id}`);
    for (const role of item.expected.rolesAny || []) assert(knownRoles.has(role), `Unknown role ${role}`);
    for (const id of item.expected.seedIdsAny || []) {
      assert(seeds.has(id), `Unknown seed ${id}`);
      assert(item.expected.rolesAny.includes(seeds.get(id).specialization), `Seed role mismatch in ${item.id}`);
    }
    if (item.group === 'ml-without-role-keywords') assert(!/\bml\b|машинн|обучени|нейро|\bpython\b|\btensor|data science|модел/iu.test(item.query), `Explicit ML keyword in ${item.id}`);
  }
  assert.equal(cases.filter(item => item.group === 'role-paraphrase').length, 14);
  assert.equal(new Set(cases.filter(item => item.group === 'role-paraphrase').flatMap(item => item.expected.rolesAny)).size, 14);
  const codeSourceHashes = Object.fromEntries(await Promise.all([
    'server/directory.mjs', 'server/directory-store.mjs', 'server/semantic-worker.mjs',
    'server/query-role-scope.mjs', 'server/search-evidence.mjs', 'server/data-definitions/professional-role-scope.json',
    'shared/search.ts', 'shared/catalog.ts', 'ml/common.py', 'ml/worker.py', 'ml/reranker.py',
  ].map(async path => [path, hash(await readFile(resolve(projectRoot, path), 'utf8'))])));
  return { version: suiteVersion, cases: cases.length, mandatory: cases.filter(item => item.tier === 'mandatory').length,
    challenge: cases.filter(item => item.tier === 'challenge').length,
    suiteHash: hash(JSON.stringify(cases)), fixtureHash: hash(JSON.stringify(directoryCandidates)),
    seedSourceHash: hash(await readFile(new URL('../server/directory-seed.mjs', import.meta.url), 'utf8')),
    datasetSourceHash: hash(corpusSources['dataset.py']), datasetV2SourceHash: hash(corpusSources['dataset_v2.py']),
    corpusSourceHashes: Object.fromEntries(Object.entries(corpusSources).map(([name, source]) => [name, hash(source)])),
    codeSourceHashes, codeSourceFingerprint: hash(JSON.stringify(codeSourceHashes)), corpusVerbatimCopies: 0 };
}

function constraintViolations(person, constraints = {}) {
  const violations = [];
  const category = person.confirmed || {};
  for (const [key, field] of [['specialization', category.specialization], ['grade', category.grade], ['city', person.city], ['format', person.format]])
    if (constraints[key] !== undefined && field !== constraints[key]) violations.push(key);
  if (constraints.salaryMax !== undefined && !(Number.isFinite(person.salaryFrom) && person.salaryFrom <= constraints.salaryMax)) violations.push('salaryMax');
  if (constraints.experienceMin !== undefined && !(Number.isFinite(person.experienceMonths) && person.experienceMonths >= constraints.experienceMin)) violations.push('experienceMin');
  if (constraints.experienceMax !== undefined && !(Number.isFinite(person.experienceMonths) && person.experienceMonths <= constraints.experienceMax)) violations.push('experienceMax');
  if (constraints.language !== undefined && !person.languageCodes?.includes(constraints.language)) violations.push('language');
  if (constraints.hasPortfolio && !person.portfolio) violations.push('hasPortfolio');
  for (const skill of constraints.stack || []) if (!person.stack?.some(value => value.toLocaleLowerCase('ru') === skill.toLocaleLowerCase('ru'))) violations.push('stack:' + skill);
  return violations;
}

export function evaluateCase(item, result) {
  const items = result.items || [], failures = [], top = items.slice(0, 3);
  const rankOf = predicate => { const index = items.findIndex(predicate); return index < 0 ? null : index + 1; };
  const roleRank = item.expected.rolesAny ? rankOf(row => item.expected.rolesAny.includes(row.person.confirmed?.specialization || row.person.specialization)) : null;
  const seedRank = item.expected.seedIdsAny ? rankOf(row => item.expected.seedIdsAny.includes(row.person.id)) : null;
  if (item.expected.empty && result.total !== 0) failures.push('expected-empty');
  if (item.expected.minItems && items.length < item.expected.minItems) failures.push('missing-results');
  if (item.expected.rolesAny && !(roleRank !== null && roleRank <= 3)) failures.push('role-missing-in-top3');
  if (item.expected.seedIdsAny && !(seedRank !== null && seedRank <= 3)) failures.push('specific-task-seed-missing-in-top3');
  for (const row of top) if (item.expected.forbiddenTopRoles?.includes(row.person.confirmed?.specialization || row.person.specialization)) failures.push('negated-role-in-top3');
  for (const row of items) for (const violation of constraintViolations(row.person, item.expected.constraints)) failures.push(`constraint:${violation}:${row.person.id}`);
  for (const [key, value] of Object.entries(item.expected.interpreted || {})) if (result.interpreted?.[key] !== value) failures.push('interpreted:' + key);
  for (const row of items) {
    if (row.person.email || row.person.phone || row.person.fspId) failures.push('private-contact-in-public-card');
    if (!row.person.visible || !row.person.consent || !row.person.confirmed) failures.push('ineligible-public-card');
  }
  return { id: item.id, group: item.group, tier: item.tier, pass: failures.length === 0, failures: [...new Set(failures)],
    approximateCount: items.filter(row => row.approximate === true).length, warnings: result.warnings || [],
    total: result.total, roleRank, seedRank, top3: top.map(row => ({ id: row.person.id, role: row.person.confirmed?.specialization || row.person.specialization,
      approximate: row.approximate === true,
      rank: Number.isFinite(row.rank) ? Number(row.rank.toFixed(6)) : null,
      rerankerScore: Number.isFinite(row.rerankerScore) ? Number(row.rerankerScore.toFixed(6)) : null,
      score: Number.isFinite(row.semanticScore) ? Number(row.semanticScore.toFixed(6)) : null })) };
}

function summarize(rows) {
  const semantic = rows.filter(row => !row.group.startsWith('hard-filter') && row.group !== 'out-of-scope');
  const rate = predicate => semantic.length ? semantic.filter(predicate).length / semantic.length : null;
  const mandatory = rows.filter(row => row.tier === 'mandatory'), challengeRows = rows.filter(row => row.tier === 'challenge');
  const negatives = rows.filter(row => row.group === 'out-of-scope');
  return { cases: rows.length, passed: rows.filter(row => row.pass).length,
    mandatoryPassed: mandatory.filter(row => row.pass).length, mandatoryTotal: mandatory.length,
    challengePassed: challengeRows.filter(row => row.pass).length, challengeTotal: challengeRows.length,
    roleHitAt1: rate(row => row.roleRank === 1), roleHitAt3: rate(row => row.roleRank !== null && row.roleRank <= 3),
    roleMRRAt30: semantic.length ? semantic.reduce((sum, row) => sum + (row.roleRank ? 1 / row.roleRank : 0), 0) / semantic.length : null,
    taskHitAt1: rate(row => row.seedRank === 1), taskHitAt3: rate(row => row.seedRank !== null && row.seedRank <= 3),
    taskMRRAt30: semantic.length ? semantic.reduce((sum, row) => sum + (row.seedRank ? 1 / row.seedRank : 0), 0) / semantic.length : null,
    outOfScopeRejected: negatives.filter(row => row.pass).length, outOfScopeTotal: negatives.length,
    approximateQueries: rows.filter(row => row.approximateCount > 0).length,
    approximateProfiles: rows.reduce((count, row) => count + (row.approximateCount || 0), 0),
    transportErrors: rows.filter(row => row.error).length,
  };
}

export async function runSuite({ modelPath, onlyCase } = {}) {
  const metadata = await validateSuite();
  const { DirectoryService } = await import('../server/directory.mjs');
  const { SemanticWorker } = await import('../server/semantic-worker.mjs');
  const model = modelPath ? resolve(modelPath) : resolve('server/data/semantic-model');
  const encoder = new SemanticWorker({ modelPath: model, timeout: 120000 });
  const service = new DirectoryService(':memory:', { seeds: directoryCandidates, encoder });
  const selected = onlyCase ? cases.filter(item => item.id === onlyCase) : cases;
  assert(selected.length, `Unknown case ${onlyCase}`);
  const rows = [], started = performance.now();
  try {
    for (const item of selected) {
      const begin = performance.now();
      try { rows.push({ ...evaluateCase(item, await service.search(item.query, item.filters, { limit: 30 })), durationMs: Math.round(performance.now() - begin) }); }
      catch (error) { rows.push({ id: item.id, group: item.group, tier: item.tier, pass: false, failures: ['transport-or-model-unavailable'], error: error.status || error.name, durationMs: Math.round(performance.now() - begin) }); }
    }
    let artifact = null;
    try {
      let artifactPath = model;
      try {
        const active = JSON.parse(await readFile(resolve(model, 'active.json'), 'utf8'));
        if (typeof active.artifact === 'string' && active.artifact.trim()) artifactPath = resolve(projectRoot, active.artifact);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const source = JSON.parse(await readFile(resolve(artifactPath, 'metadata.json'), 'utf8'));
      artifact = { path: relative(projectRoot, artifactPath).replaceAll('\\', '/'),
        ...Object.fromEntries(['modelVersion', 'encoderModelVersion', 'pipelineFingerprint', 'reranker', 'weightsSha256', 'encodingFingerprint', 'encodingPolicy', 'datasetSha256', 'holdoutSha256', 'corpusSha256', 'baseModel', 'baseRevision', 'revision', 'threshold', 'dimension'].filter(key => source[key] !== undefined).map(key => [key, source[key]])) };
    } catch { /* A missing artifact is explicit in per-case errors and worker info. */ }
    return { kind: 'authored-functional-regression', limitation: 'Synthetic seeds and authored expectations; not independently labelled real-world validation. Never use for training or threshold selection.',
      ...metadata, runAt: new Date().toISOString(), seedCount: directoryCandidates.length,
      model: { ...encoder.info }, artifact, durationMs: Math.round(performance.now() - started), metrics: summarize(rows),
      groups: Object.fromEntries([...new Set(rows.map(row => row.group))].map(group => [group, summarize(rows.filter(row => row.group === group))])), results: rows };
  } finally { service.close(); }
}

async function main() {
  const args = process.argv.slice(2), option = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
  if (!args.includes('--run')) { console.log(JSON.stringify(await validateSuite(), null, 2)); return; }
  const report = await runSuite({ modelPath: option('--model'), onlyCase: option('--case') });
  if (option('--compare')) {
    const previous = JSON.parse(await readFile(resolve(option('--compare')), 'utf8'));
    assert.equal(previous.suiteHash, report.suiteHash, 'Cannot compare different case definitions');
    assert.equal(previous.seedSourceHash, report.seedSourceHash, 'Cannot compare changed seed fixtures');
    assert.equal(previous.fixtureHash, report.fixtureHash, 'Cannot compare changed generated candidate contents');
    assert.deepEqual(previous.results.map(row => row.id).sort(), report.results.map(row => row.id).sort(), 'Cannot compare different selected cases');
    const before = new Map(previous.results.map(row => [row.id, row]));
    report.comparison = { previousModel: previous.model?.version, currentModel: report.model.version,
      before: previous.metrics, after: report.metrics,
      improved: report.results.filter(row => row.pass && before.get(row.id)?.pass === false).map(row => row.id),
      regressed: report.results.filter(row => !row.pass && before.get(row.id)?.pass === true).map(row => row.id) };
  }
  if (option('--output')) { const output = resolve(option('--output')); await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + '\n', 'utf8'); }
  console.log(JSON.stringify({ version: report.version, model: report.model.version, metrics: report.metrics,
    failures: report.results.filter(row => !row.pass).map(({ id, tier, failures }) => ({ id, tier, failures })), comparison: report.comparison }, null, 2));
  if (args.includes('--strict') && report.results.some(row => !row.pass && (row.tier === 'mandatory' || row.error))) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
