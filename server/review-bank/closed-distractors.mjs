// Subject-specific alternative plans: each fails a concrete invariant, not mere terminology.
// Keys are competency:grade:question; values replace the three wrong authoring alternatives.
import { advancedOperationsDistractors } from './closed-distractors-operations.mjs';
export const advancedDistractors = {
  ...advancedOperationsDistractors,
  'mathematics:Senior:2': [
    'Публиковать коэффициенты: стабильные прогнозы и малый residual подтверждают их точность; sensitivity y проверять только для будущих новых данных',
    'Перейти на QR и публиковать коэффициенты без sensitivity analysis: QR устраняет как вычислительную, так и исходную обусловленность задачи',
    'Уменьшить residual итерациями normal equations до machine epsilon и считать отдельные коэффициенты надёжными независимо от возмущений y',
  ],
  'mathematics:Lead:2': [
    'Повторить SVD на том же наборе, подтвердить Frobenius bound и dtype; это уже гарантирует сохранность ближайших соседей для любых queries',
    'Проверить память и средний cosine similarity всех пар; совпадение среднего достаточно для сохранения exact top-k каждого запроса',
    'Проверить только recall@k training queries после подбора rank на них; зафиксированный Frobenius bound исключает необходимость независимой retrieval оценки',
  ],
  'probability:Senior:2': [
    'Сохранить Poisson(50), увеличить число наблюдений и считать дисперсию180 допустимой новой дисперсией того же однородного пуассоновского процесса',
    'Перейти на Poisson(180), поскольку новая дисперсия даёт intensity; среднее50 сохранить отдельной нормировкой и не исследовать общие факторы',
    'Однозначно выбрать negative binomial по двум моментам и больше не проверять временную неоднородность, независимость потоков и механизм общей рассылки',
  ],
  'statistics:Senior:2': [
    'Заранее выбрать primary, ежедневно применять Holm к20 метрикам и завершать при первом crossing; daily Holm одновременно контролирует optional stopping',
    'Использовать fixed horizon для каждого теста, затем объявить primary метрику с минимальным p-value, поскольку горизонт был зафиксирован заранее',
    'Применять FDR к19 secondary, primary проверять ежедневно приα=.05 без sequential correction, поскольку primary была выбрана до эксперимента',
  ],
  'statistics:Lead:2': [
    'Сохранить assignment totals и среднюю выручку, текущую SQL формулу и dashboard snapshot; этого достаточно восстановить все версии метрики и поздние события',
    'Сохранить сырые revenue events и текущие assignment, перезаписав историю дубликатов; версию метрики применить последнюю ко всем дням без отдельного контракта',
    'Сохранить assignment и events, убрать48-часовые задержки фильтром по ingest day; metric version, maturity policy и порядок дедупликации не фиксировать',
  ],
  'sql:Senior:1': [
    'В одной транзакции SELECT available и затем безусловный UPDATE, после commit записать UNIQUE request_id; при retry читать существующий результат',
    'Сначала commit уникального request_id, затем условный UPDATE stocks в другой транзакции; это исключает частичный успех даже при падении между commits',
    'В одной транзакции условный UPDATE и reservations, но каждый retry получает новый request_id; concurrency безопасна, поэтому повторное списание исключено',
  ],
  'sql:Senior:2': [
    'Вернуть существующий success независимо от нового qty: uniqueness request_id делает любую смену payload безопасной и не требует сообщения клиенту',
    'Под тем же request_id списать положительную разницу qty отдельной транзакцией, сохранив старый success; это продолжение исходной операции, не новая',
    'Удалить старую reservation и выполнить запрос с новым qty под прежним key; прежний stock decrement компенсируется отсутствием записи автоматически',
  ],
  'sql:Lead:2': [
    'INVALID unique index всегда эквивалентен valid для новых writes; вернуть старый UNIQUE можно без collision audit, поскольку раньше он уже существовал',
    'Пересоздать INVALID concurrently после проверки, но при rollback достаточно вернуть старый binary: межtenant duplicate email автоматически получат новые имена',
    'Удалить INVALID и восстановить глобальный UNIQUE без предварительной обработки новых cross-tenant duplicates; уникальность по tenant уже исключает любые коллизии',
  ],
  'python:Senior:2': [
    'Поймать CancelledError, вернуть текущие частичные results и закрыть batch; children сами завершатся, поэтому ждать их и cleanup не требуется',
    'Вызвать cancel() на children и немедленно вернуть управление без await; факт выставления флага cancellation равен завершению сетевых операций',
    'Shield все workers, преобразовать внешнюю отмену в ошибку каждого элемента и оставить requests работать; это сохраняет результаты без orphan операций',
  ],
  'python:Lead:1': [
    'Snapshot ID, OFFSET и counts прочитанных строк; checkpoint публиковать перед upload, потому что retry может восстановить missing части по номеру страницы',
    'Snapshot ID и stable key границы, но новый случайный part ID на retry; manifest перечисляет все попытки, дедупликация строк после export решит повторы',
    'Последний ключ и hash части без snapshot version; после потери ответа продолжить live keyset pagination, поскольку порядок ключей гарантирует согласованность данных',
  ],
  'python:Lead:2': [
    'Продолжить по последнему ключу на live snapshot и использовать прежний manifest; отсутствие duplicate IDs гарантирует один согласованный временной срез',
    'Начать новый snapshot только для оставшихся ключей, сохранить прежние части и публиковать общий manifest после проверки count без version reconciliation',
    'Повторить истёкший snapshot ID в metadata, а читать новые данные; стабильные part names и hashes гарантируют историческое содержимое исходного export',
  ],
  'algorithms:Senior:1': [
    'Sorted runs по1GB и одноэтапный merge всех примерно500 файлов; FD ограничение обходится тем, что heap хранит лишь один ключ от каждого файла',
    'Hash partition по user_id, sort внутри partitions и concatenate по номеру bucket; это даёт глобальный порядок всех трёх полей без merge',
    'Sort runs в bounded RAM и concatenate по минимальному ключу каждого run; перекрытие диапазонов не влияет на полный порядок внутри каждого run',
  ],
  'algorithms:Senior:2': [
    'Удалять точные дубли внутри каждого sorted run, затем обычный merge без межrun сравнения: одинаковые полные ключи всегда попадут в один run',
    'При merge хранить seen по user_id и удалять все последующие строки этого пользователя: это сохраняет точные события и ограничивает память1GB',
    'Сравнивать соседние (user_id,event_time), игнорируя event_id; сортировка по трём полям делает все такие записи точными дублями автоматически',
  ],
  'algorithms:Lead:2': [
    'Routing epoch и dual reads, при miss всегда fallback старой записи; versions учитывать только при совпадении ключа в обоих шардах, tombstones можно удалить',
    'Version-aware copy и tombstones, но подтверждать старые writes после cutover без barrier/fencing; version сравнение гарантирует отсутствие stale reads всегда',
    'Остановить копирование при delete, удалять tombstone после локального apply; read нового шарда при miss возвращает старый, согласование routing не требуется',
  ],
  'web-platform:Senior:1': [
    'Виртуализировать строки, stable record IDs и aria indices, но focus хранить только в DOM node; unmount активной строки не влияет на keyboard continuity',
    'Сохранить весь DOM и скрыть offscreen rows opacity:0; screen reader и browser Tab сами обеспечат доступность и render budget100000 строк',
    'Использовать pagination и row indices от0 на каждой странице, без общего identity; доступность подтверждать только автоматическим screenshot сравнением',
  ],
  'web-platform:Senior:2': [
    'Измерить server500ms и считать их полным UI latency; удалённую focused строку оставить detached node как постоянный navigation anchor без fallback',
    'Измерить render/input на пустом списке и network отдельно; удаление active row проверять только мышью, поскольку Tab order определяется CSS автоматически',
    'Измерить суммарную среднюю latency одного запроса и автоматически focus body после любых updates; screen-reader путь отдельно тестировать не требуется',
  ],
  'web-platform:Lead:1': [
    'Типизированные props, design tokens и screenshot fixtures; HTML/ARIA states и keyboard events оставлять каждому приложению, объявив library behavior единым',
    'Единые HTML/ARIA states и глобальные CSS overrides; errors/events не версионировать, потому что визуальный API библиотеки не является behavior contract',
    'Единые CSS tokens и TypeScript events без runtime conformance; наличие одинаковых declarations доказывает одинаковый focus и submit во всех runtimes',
  ],
  'web-platform:Lead:2': [
    'Выбрать три самых похожих формы, проверить screenshot и сразу считать остальные девять compatible; одинаковый вид достаточен для keyboard contract',
    'Выбрать разнообразные пилоты, но мигрировать только CSS без adapters/runtime regressions; семантика старого HTML автоматически станет общей',
    'Сначала заменить все поля без rollback boundary, затем проводить AT tests только в новом приложении; проблемы остальных исправлять после полного cutover',
  ],
  'javascript-typescript:Senior:1': [
    'Runtime parser проверяет currency/date, amount всегда преобразуется Number(); schema validation типа number гарантирует точность любых денежных integers',
    'Version adapter и decimal string в DTO, но SDK сначала делает parseFloat и затем string round-trip; TypeScript string type восстановит исходную точность',
    'Получить unknown, применить as Payment и проверять только наличие полей; assertion является runtime validator, а null currency заменять default без contract',
  ],
  'javascript-typescript:Lead:1': [
    'Compile fixtures во всех runtimes и package exports check; actual error/cancellation поведение не проверять, declarations гарантируют runtime соответствие',
    'Runtime smoke в Node и compile в браузере; React Native и CJS считать equivalent ESM, если bundle собирается без syntax errors',
    'Runtime fixtures всех errors, но без compile fixtures и cancellation traces; совпадение текстов сообщений гарантирует совместимость типов и AbortSignal',
  ],
  'javascript-typescript:Lead:2': [
    'Оставить старые declarations на3 месяца, runtime errors сразу заменить; consumers компилируются, поэтому behavior compatibility автоматически сохранена',
    'Версионировать ошибки и cancellation, убрать CJS немедленно под тем же minor; только browser ESM consumers определяют обратную совместимость SDK',
    'Сохранить exports и старую error shape, но abort игнорировать в React Native без маркировки; наличие AbortSignal в типах достаточно для общего contract',
  ],
  'react:Senior:1': [
    'CDN key=URL+User-Agent, personal initial state в общем HTML; разные devices обычно изолируют пользователей, дополнительная identity scope не нужна',
    'URL cache оставить, personal имя скрывать до hydration; байты общего HTML доступны, но client replacement исключает возможность утечки',
    'Shared HTML с user name и экспериментом кешировать60s, после logout очистить browser cache; короткий TTL исключает межuser sharing на CDN',
  ],
  'react:Senior:2': [
    'Сервер и client независимо выбирают random/time initial values, suppression hydration warnings; matching после первого effect считается корректной hydration',
    'Сериализовать identity state и token в общий CDN HTML, client проверит своё имя и исправит; это одновременно гарантирует SSR consistency и privacy',
    'Первый client render пересчитывает эксперимент по новой seed, server HTML не менять; одинаковые component types достаточны для hydration совпадения',
  ],
  'react:Lead:1': [
    'Cache keys по URL+tenant, logout удаляет session cookie; inflight responses могут дописать cache, потому что API уже проверил прежнюю identity',
    'Identity/tenant keys и очистка values на logout, но reuse одного inflight Promise для разных identities; dedup безопасен при одинаковом endpoint',
    'Один global SSR cache с коротким TTL и permission flags только в UI; быстрое истечение гарантирует отсутствие cross-user data при server render',
  ],
  'react:Lead:2': [
    'Contract suite cache hit/dedup и optimistic success; logout во время inflight и SSR isolation считать покрытыми unit test HTTP endpoint',
    'Compile fixtures hooks и runtime только read path; offline replay и mutation conflict передать приложениям без определения общей revision семантики',
    'Проверить каждый cache отдельно на одной identity, затем объединить без adapter traces; индивидуальная корректность гарантирует совместимость lifecycle',
  ],
  'vue-angular:Senior:1': [
    'switchMap для latest-only, catchError снаружи всего input потока и destroy cleanup; после ошибки outer stream продолжает ввод автоматически',
    'mergeMap и distinctUntilChanged с destroy cleanup; distinctUntilChanged гарантирует, что поздняя старая деталь не заменит новую',
    'concatMap с внутренним catchError и cleanup; каждый queued выбор обязан показать detail независимо от текущего selection, это latest-only contract',
  ],
  'vue-angular:Lead:1': [
    'Два framework stores владеют draft независимо; timestamps синхронизируют последний save, а Web Component сам устраняет concurrent sources of truth',
    'Canonical owner общий, draft по одному в каждом framework; оба freely commit один revision, отдельный ordering contract не нужен',
    'Один owner и DTO, но mount/unmount не прекращают старые event handlers; одинаковый payload schema предотвращает stale commits после перехода',
  ],
  'vue-angular:Lead:2': [
    'Одинаковые screenshots после save и bundle tests; lifecycle traces не нужны, потому что framework-neutral DTO гарантирует cleanup',
    'Mount/edit/save happy path в обоих adapters; conflict/unmount и сохранение черновика проверять только в одном, behavior считается framework-independent',
    'Compile DTO fixtures и round-trip JSON; runtime events порядок, ownership и route rollback не входят в совместимость этого integration contract',
  ],
  'backend-api:Senior:2': [
    'Оставить CPU на event loop, увеличить HTTP timeout и DB pool; async handler автоматически изолирует80ms синхронную часть от прочих endpoints',
    'Вынести расчёт в worker pool, очередь без bound и без deadlines; p99 измерять только worker execution, ожидание очереди не является временем API',
    'Добавить await Promise.resolve перед расчётом и несколько keep-alive connections; измерять только DB spans, поскольку CPU utilization30% исключает loop lag',
  ],
  'backend-api:Lead:2': [
    'Version adapters и stable key, amountMinor всегда через Number для старых clients; невозможные значения округлять, чтобы сохранить HTTP200 compatibility',
    'Сохранить точный string DTO и consumer fixtures, но new version создаёт новые keys для pending retries; разные версии обозначают разные платежи',
    'Expand DTO и safe subset старых клиентов, digest считать по raw JSON каждой версии без operation normalization; изменение representation не влияет на retry',
  ],
  'java-go:Senior:1': [
    'Fixed pool и unbounded queue, сокращённый HTTP timeout; возврат timeout клиенту автоматически отменяет работу executor и освобождает connection',
    'Bounded queue с rejection, отклонённые tasks запускать отдельными threads без ограничения; это сохраняет concurrency budget основного pool',
    'Bounded executor и deadlines только на Future.get клиента; внешним операциям deadlines не передавать, поскольку ожидание Future всегда останавливает I/O',
  ],
  'java-go:Senior:2': [
    'Future.cancel(true) на timeout, сразу вернуть success cleanup без join; interrupt гарантирует мгновенное освобождение любых connection resources',
    'Нагрузочный тест только до overload, метрики active и average CPU; отсутствие crash доказывает восстановление очереди после снятия нагрузки',
    'Close connection только в успешной ветви, исключения логировать; bounded queue предотвращает resource leaks независимо от cleanup path',
  ],
  'java-go:Lead:1': [
    'Cancel перед запуском batch и сравнить result count; эта трасса доказывает остановку уже активных requests в течение2s без child tracking',
    'Cancel при blocked request, проверить только время возврата batch≤2s; outstanding work не учитывать, быстрый возврат равен успешному завершению',
    'После cancel ждать один произвольный child, остальные завершатся кооперативно; отсутствие одного error доказывает drain всех операций',
  ],
  'java-go:Lead:2': [
    'Одинаковые API names и max8, ошибки выдавать в completion order; callers сами восстановят input ordering, это не часть общего contract',
    'Общий ordering/deadline, но item error отменяет всех siblings; изоляция ошибок несущественна, если SDK возвращает error list',
    'Ordering и isolated errors одинаковы, Go ждёт workers, Java возвращает сразу после future.cancel; обе реализации имеют одинаковый cancellation contract',
  ],
  'mobile-native:Senior:1': [
    'MainActor для всех UI writes и Task.cancel старого запроса; любой уже готовый callback может commit, actor isolation автоматически делает его актуальным',
    'Actor repository и revision check до await; после await проверку не повторять, потому что actor не допускает смену выбранной карточки в ожидании',
    'Revision guard после await без screen lifetime и MainActor contract; callback после исчезновения экрана всегда безопасен, если entity совпадает',
  ],
  'mobile-native:Lead:1': [
    'Transactional schema migration и сохранение текста, operation IDs заново генерировать для new wire payload; retry новой версии не относится к старой записи',
    'Одна version для local schema/server DTO, server old adapter убрать после первого нового app release; все offline clients обновляются при reconnect',
    'Версии payload и stable IDs, но pending outbox удалять при migration для чистого recovery; текст в draft позволяет восстановить все операции без дублей',
  ],
  'mobile-native:Lead:2': [
    'Clean install новых iOS/Android и successful sync, migration paths с pending outbox считать эквивалентными пустой БД после schema update',
    'Upgrade всех supported versions на empty outbox, без interrupted migration; atomic write гарантирует recovery всех внешних операций',
    'Test old payload adapter в API отдельно, local recovery и operation IDs не проверять; одинаковый server JSON достаточен для end-to-end совместимости',
  ],
  'mobile-cross:Senior:1': [
    'Bounded ring для всех events, drop oldest при перегрузке включая alarms; durable alert summary раз в минуту заменяет каждый individual alarm',
    'Batch обычные events и alarms вместе, без верхнего queue bound в background; foreground60fps гарантирует последующий drain и ограничение RAM',
    'Downsample только в JS после bridge, upstream очередь не ограничивать; уменьшение числа render calls автоматически ограничивает native backlog',
  ],
  'mobile-cross:Senior:2': [
    'Sort по JS receipt wall-clock после resume, timestamp source отбросить; этот порядок точно восстанавливает исходную последовательность измерений',
    'Проверить source timestamps только foreground и FPS60; background replay не влияет на memory/order contract при native batching',
    'Сохранить source sequence, но после background сбросить queue и alarms; отсутствие backlog доказывает выполнение требований сохранности событий',
  ],
  'mobile-cross:Lead:1': [
    'UI migration обоих frameworks до operation versioning; одинаковые screens устраняют различия offline retries и push delivery автоматически',
    'Stable operation IDs и outbox только Flutter, React Native использует random keys; одинаковая API schema достаточна для единого sync contract',
    'Version DTO и conflict protocol, outbox хранить только в JS/Dart memory; framework state restoration гарантирует recovery после process death',
  ],
  'mobile-cross:Lead:2': [
    'Одинаковые screenshots и successful sync, lost response проверить только server unit test; native lifecycle не влияет на retry operation identity',
    'Failure fixtures обоих clients только new payload, pending old operations не включать; rollback UI автоматически возвращает старую wire совместимость',
    'Повторить restart и conflict, но каждый retry с новым key; сравнить лишь итоговый UI текст, не persisted effects и server operation count',
  ],
  'dataframes:Senior:1': [
    'Очень маленькие chunks и один global aggregate dict на80млн users; chunk RAM bound автоматически распространяется на итоговую cardinality состояния',
    'Преобразовать все user_id в category и сохранить весь dictionary в RAM без оценки cardinality; categorical dtype всегда занимает меньше любой partitioning схемы',
    'Hash partition только по day, не учитывать hot day и размер user groups; один день любого размера гарантированно помещается в4GB',
  ],
  'dataframes:Lead:1': [
    'Сохранить Git commit transform и текущий input path, timezone брать local default среды; одинаковый код гарантирует одинаковые суточные границы через год',
    'Schema versions и lineage, missing values в inference заменять0, в training NaN; различие engines допустимо, если feature name одинаковый',
    'Golden dataset только типичных чисел, версии cutoff/timezone не хранить; floating tolerance можно применить к category и date semantics',
  ],
  'dataframes:Lead:2': [
    'Разрешить один день timezone расхождения и совпадение monthly average; категориальные значения сравнить после произвольного кодирования числами',
    'Считать null эквивалентным0 и empty string во всех engines, иначе test слишком строгий; floating sum проверять только по округлённому total',
    'Сравнивать все columns единым relative tolerance, включая IDs и даты; небольшая numeric разница не может менять семантику join или cutoff',
  ],
  'classical-ml:Lead:1': [
    'Сравнить loss до/после на выданных кредитах, policy mix не учитывать; mature labels и temporal split сами устраняют selection bias новой выдачи',
    'Shadow на всех applicants, затем объявить причинный+4% policy эффект по predictions; отсутствие реальных новых outcomes не ограничивает такой вывод',
    'Использовать только cohorts с labels раньше90дней и stratify по income; быстрое созревание является случайным и не требует проверки selection',
  ],
  'classical-ml:Lead:2': [
    'Overall loss−4%, drift monitor и canary по uptime; редкие новые сегменты допустить без uncertainty, aggregate автоматически покрывает их риск',
    'Temporal mature validation и segment checks, fallback убрать после первого дня;90-day labels delay не влияет на post-release outcome monitoring',
    'Best train AUC и calibration старого prevalence, thresholds оставить прежними; policy change учитывать только в marketing dashboard',
  ],
  'deep-learning:Senior:1': [
    'Сравнить top-1 на одинаковых inputs, сразу увеличить global tolerance до совпадения; промежуточные tensors и preprocessing mode не фиксировать',
    'Golden raw inputs и layer checks, resize/layout в engines оставить default; одинаковые weights гарантируют одинаковую семантику preprocessing',
    'Переобучить TensorFlow модель на том же dataset и сравнить accuracy, batch norm mode не закреплять; это локализует ошибку export конкретного слоя',
  ],
  'deep-learning:Senior:2': [
    'Игнорировать все label disagreements при малом max logit error; margin и downstream error cost не меняют достаточность численного tolerance',
    'Любой top-1 disagreement считать доказательством channel permutation, даже если layer tensors близки; margin никогда не влияет на выбор класса',
    'Сравнить только mean logit по batch и total accuracy; совпадение двух агрегатов доказывает одинаковый preprocessing и individual predictions',
  ],
  'deep-learning:Lead:1': [
    'Фиксировать concurrency8 и batch8 по request count, поскольку6GB weights оставляют10GB; token lengths не влияют на activation memory',
    'Token-budget batching и bounded queue, deadlines считать только после dequeue; очередь не входит в p99≤300ms API результата',
    'Length buckets и retry любого OOM без admission/rejection, queue unbounded; средний GPU utilization определяет гарантированный tail latency',
  ],
  'deep-learning:Lead:2': [
    'Одинаковый length mix, но исключить timeouts/rejections и queue wait; p99 успешного GPU execution достаточен для заявленного end-to-end SLO',
    'Сравнить engines при разных concurrency, выбрать минимальную average latency; memory/errors не учитывать, если weights одинакового размера',
    'Benchmark коротких warm requests, затем экстраполировать p99 на4000tokens; admission profile и реальный length mix не требуются',
  ],
  'business-intelligence:Senior:1': [
    'Единая timezone и currency, refunds всегда исключить из одного отчёта и включить в другом; одинаковый display month задаёт согласованную revenue метрику',
    'Единый SQL query текст, timezone и cutoff получать из локальных настроек Excel/Power BI/Tableau; идентичный SQL гарантирует состав месяца',
    'Согласовать округление monthly totals, late events включать только по current ingest date; historical period semantics и FX source не сохранять',
  ],
  'business-intelligence:Lead:1': [
    'Все quarterly отчёты пересчитать по новому active rule и сохранить прежние названия; одинаковый total важнее исторической версии определения',
    'Хранить старые screenshots и текущий semantic SQL без входных snapshots; изображения обеспечивают полный reproducible lineage всех агрегатов',
    'Version definitions сохранить, но source access и data snapshots брать только текущие; прошлые результаты всегда воспроизводятся на новых данных',
  ],
  'business-intelligence:Lead:2': [
    'Сверить общий total administrator до/после RLS, отдельные authorised cohorts не нужны; сумма доказывает сохранение разрешённого состава',
    'Проверить positive access одной роли, negative tenant fixtures не выполнять; RLS автоматически исключает все cross-tenant варианты',
    'Снять access filters на время сверки и объявить authorised aggregates доказанными; итоговую permission policy проверить только по UI visibility',
  ],
  'batch-pipelines:Senior:1': [
    'Один corrected mutable view с30-day window, monthly close автоматически пересчитывать последней версией; это сохраняет историческую воспроизводимость',
    'Immutable close и corrected view, но source dimension брать latest без version; закреплённый fact snapshot достаточен для воспроизведения любого join',
    'Отбрасывать все events старше7дней и ретро-справочник, без изменения бизнес-контракта; исходный close считается точным только благодаря фиксированному окну',
  ],
  'batch-pipelines:Senior:2': [
    'Manifest version и validation каждой partition отдельно; pointer переключать после первой готовой, остальные добавлять по мере окончания backfill',
    'Перезаписать старые partitions in place, после failure восстановить только counts; rollback сохраняет согласованность без старого полного snapshot',
    'Build полный snapshot, удалить предыдущий до validation и switch; при ошибке rollback заново читает mutable sources без pinning versions',
  ],
  'batch-pipelines:Lead:1': [
    'Потребитель берёт latest каждой таблицы с близким publish timestamp; dependency snapshots не нужны, если все jobs прошли в одной календарной дате',
    'Manifest фиксирует IDs только terminal витрин, upstream versions заменяются latest; одинаковые row counts гарантируют consistent bundle',
    'Фиксировать cutoff, разрешать смешанные dependency versions без совместимости; временной cutoff сам доказывает семантический join контракт',
  ],
  'batch-pipelines:Lead:2': [
    'К06:00 публиковать готовые новые tables с любыми старыми upstream и статусом fresh; соблюдение SLA важнее явного consistency режима',
    'Block весь daily pipeline на годовой backfill без resource quotas; правильный historical run всегда гарантирует текущийSLA06:00',
    'Заменить failed upstream пустым snapshot без failure marker и разрешить downstream; counts могут уменьшиться, но bundle остаётся достоверно свежим',
  ],
  'streaming:Senior:1': [
    'Version check для upserts, deletes не хранить после apply; поздний upsert на отсутствующий key применять независимо от прежней delete version',
    'Сохранять tombstones, но при replay ordering использовать ingest timestamp; более поздняя доставка upsert означает более свежую бизнес-версию',
    'Применять только newer versions пока строка существует; после delete убрать last version, чтобы bootstrap мог повторно создать строку',
  ],
  'streaming:Senior:2': [
    'Считать одинаковую version гарантированным дублем, игнорировать отличие payload и не регистрировать нарушение producer contract',
    'Выбирать payload с более поздним ingest_time и переписывать same-version state; network ordering всегда разрешает conflicting logical identity',
    'Merge поля двух payload произвольно, сохранить прежнюю version; это детерминированно восстановит исходное единичное событие без дополнительного evidence',
  ],
  'streaming:Lead:1': [
    'Kafka transaction с offset, sink update и outbox гарантирует exactly-one HTTP notification, даже если внешний endpoint не распознаёт operation IDs',
    'Durable outbox и retry доHTTP200: timeout всегда означает отсутствие эффекта, поэтому внешние дубли невозможны при at-least-once попытках',
    'Commit offset доHTTP и никогда не retry uncertain: это даёт exactly-one notification, поскольку повтор устранён независимо от возможной потери',
  ],
  'streaming:Lead:2': [
    'Stable key только в локальной outbox, provider игнорирует его и не даёт status; локальный уникальный ключ уже разрешает lost-response ambiguity',
    'Provider receipts без привязки к operation identity, новый key на retry; сверка общего числа уведомлений гарантирует отсутствие individual duplicates',
    'Увеличить timeout и хранить outbox до отправки всех TCP bytes, после удалить; успешная транспортная запись доказывает единственный внешний эффект',
  ],
};
