export const advancedOperationsDistractors = {
  'systems-networking:Senior:1': [
    'Проверить packet loss только по одному client capture и увеличить TCP timeout; MTU изменение влияет на latency, но не на доступность отдельных путей',
    'Сравнить MSS на server и сделать rollback без сохранения одинаковой нагрузки; совпадение CPU30% до/после доказывает сетевую причинность',
    'Проверить только TLS сертификаты и CPU, поскольку успешный маленький ping исключает PMTU black hole для любых packet sizes и client маршрутов',
  ],
  'systems-networking:Senior:2': [
    'Duplicate ACK в одном capture однозначно локализует network loss на сервере; capture drops и offload не меняют видимость TCP sequence ranges',
    'Если CPU30%, любой retransmit является Wireshark артефактом; дополнительные captures и retransmission metrics для affected clients не нужны',
    'Один capture и его timestamp достаточны: packet arrival order всегда совпадает с order на wire, даже при hardware offload и пропущенных frames',
  ],
  'systems-networking:Lead:1': [
    'Третий регион делает DNS и VPN failures независимыми автоматически, потому что все compute VM находятся на разных физических площадках',
    'Общий DNS остаётся риском, общий VPN больше не влияет на journey после добавления VM, даже если routing всех регионов по-прежнему проходит через него',
    'Любой локальный power outage одновременно выключит все три региона, но общий control plane не влияет на доступность уже запущенных клиентских маршрутов',
  ],
  'systems-networking:Lead:2': [
    'Тест полного выключения одного региона и ping другого, без DNS/cache/partial split; успешный ping доказывает99.95% customer journey availability',
    'Fault injection DNS без real client cache, считать TTL точной верхней границей failover для всех resolvers и не проверять authority при split',
    'Проверить uptime VM и один synthetic route, failover объявить автоматическим; общие dependencies и partial partition не входят в availability model',
  ],
  'containers:Senior:1': [
    'PDB позволит eviction, поскольку всего desired replicas3 и minAvailable2; readiness текущей третьей replica не влияет на число разрешённых disruptions',
    'PDB сам запустит недостающую replica и перенесёт local WAL перед drain; дополнительная replication/fencing подготовка не требуется',
    'Force delete сохраняет смысл PDB и graceful handoff, поскольку Kubernetes обязательно ждёт durable flush любого локального процесса перед удалением',
  ],
  'containers:Senior:2': [
    'Readiness restore и PDB достаточно для WAL durability, node crash является involuntary, но PDB всё равно гарантирует сохранность pending операций',
    'Реплицировать WAL, но не fencing старого worker; после partial node outage два владельца безопасны, если оба имеют одинаковый log на момент drain',
    'Graceful termination с fixed sleep, local WAL удалить после eviction; новый pod восстанавливает state автоматически из Deployment spec без external data',
  ],
  'containers:Lead:1': [
    'Namespaces являются полной security/resource boundary; RBAC нужен только для удобства пользователей, network policies и node isolation избыточны',
    'Namespace и ResourceQuota гарантируют disk/network latency API; supply-chain доверие автоматически следует из размещения image в том же cluster',
    'RBAC внутри namespace ограничивает все runtime parser/network effects, поэтому egress policy, admission и workload resource isolation не нужны',
  ],
  'containers:Lead:2': [
    'ResourceQuota manifests и низкий average CPU доказывают isolation; одновременную disk/network нагрузку измерять отдельно от customer latency не требуется',
    'Запустить burst job на пустом cluster, подтвердить её memory bound и считать это доказательством отсутствия noisy-neighbor при20командах',
    'Проверить CPU contention, остальные shared resources и threat requirements исключить; отдельная граница никогда не нужна при наличии namespaces',
  ],
  'infrastructure:Senior:1': [
    'Повторить apply, Terraform обнаружит любой real resource с тем же display name даже без state record и автоматически сохранит его identity',
    'Удалить весь partial stack и state, затем повторить apply; это единственный idempotent recovery, сохранность двух рабочих VM обеспечена provider names',
    'Внести предполагаемый ID в state вручную без проверки provider identity, затем skip plan; существование похожего ресурса достаточно для безопасного import',
  ],
  'infrastructure:Senior:2': [
    'Повторить весь pipeline без reconciliation и health gates; успешный Terraform автоматически откатывает частичные изменения Ansible предыдущего запуска',
    'Вернуть Git version Ansible и уничтожить сеть перед повтором, старые working VM сохранятся независимо от network dependencies и provider lifecycle',
    'Продолжить только последний упавший task без проверки версий configuration; idempotency одного модуля доказывает согласованность всех stages',
  ],
  'infrastructure:Lead:1': [
    'Version modules/roles закрепить, state mappings не нужны при одинаковом display name; secrets format v2 сразу применить всем старым consumers',
    'Сделать reviewed plans двух пилотов, потом обновить остальные latest без locking; успешный pilot доказывает identity сохранность любого environment',
    'Сначала contract старого secrets format, затем migrate network и clients; план rollback по Git SHA автоматически восстанавливает old provider resources',
  ],
  'infrastructure:Lead:2': [
    'Git revert modules/roles достаточно: новые ресурсы и записи state автоматически вернут старые identity даже после confirmed data writes в новой схеме',
    'Сохранить old state snapshot, force restore поверх нового без real resource audit; state backup одновременно является backup содержимого новых resources',
    'Проверить только VM names и outage длительность, новые data/contracts не рассматривать; одинаковые имена доказывают возможность обратного перехода',
  ],
  'observability:Senior:1': [
    'Traffic-weighted average replica p99 gauges: веса requests делают quantile линейным и дают точный общий p99 независимо от распределений latency',
    'max(replica_p99) всегда равен общему p99; это учитывает проблемную replica и не зависит от её доли traffic среди всех запросов',
    'Сложить histogram bucket rates без le grouping и затем взять99% от total rate; cumulative buckets эквивалентны отдельным latency samples',
  ],
  'observability:Senior:2': [
    'Summary p99 агрегировать по traffic weights, buckets выбирать далеко от250ms; это даёт такую же точность SLO как индивидуальные request measurements',
    'Общий histogram p99 достаточно для всех replicas; per-replica tails не нужны даже при сильно разных traffic weights и user routing',
    'Два buckets0ms/10s обеспечивают точный p99 около250ms; quantile estimator восстанавливает любой реальный distribution внутри bucket без данных',
  ],
  'observability:Lead:1': [
    'Journey SLI как average success трёх сервисов, retries включить как отдельные successes; это точно равно доле успешных customer operations',
    'Operation IDs и end-to-end success, но timeout и429 исключить из denominator; overload не является failure, поэтому SLO остаётся пользовательским',
    'Умножить service SLO без проверки зависимости и populations; одинаковые названия99.9% гарантируют одинаковый journey denominator',
  ],
  'observability:Lead:2': [
    'Golden successful journeys и health probes достаточно; retries/timeouts/429 можно не replay, поскольку они исключены текущими сервисными dashboards',
    'Сверить общий success count без input operation IDs, versions SLI не хранить; совпадение aggregate гарантирует неизменность denominator',
    'Проверить alerts только на CPU и synthetic availability; monitor semantics отдельных сервисов автоматически согласуется после одинакового SLO label',
  ],
  'delivery-git:Senior:1': [
    'Вернуть old binary и Git migration file, удалённая колонка с данными восстановится автоматически при следующем старом SELECT без дополнительных recovery',
    'Rollback binary всегда безопасен, если image digest сохранён; schema и новые rows не относятся к совместимости артефакта приложения',
    'Canary10% гарантирует отсутствие incompatible writes в остальных90%, поэтому deleted schema не влияет на old version rollout ни при каких данных',
  ],
  'delivery-git:Senior:2': [
    'Сначала удалить old fields, потом обновлять readers/writers; old binary fixture проверять только на empty DB, чтобы избежать irrelevant historical data',
    'Expand schema и canary, сразу contract после первого successful request; наличие активных old consumers не влияет на safe rollback window',
    'Проверить compile old/new versions и schema syntax, new rows со старым reader не запускать; совпадение типов доказывает runtime data compatibility',
  ],
  'delivery-git:Lead:1': [
    'Producer serialization fixtures и schema syntax; consumer contract tests лишние, потому что все сообщения соответствуют одной опубликованной JSON schema',
    'Consumer-owned fixtures только old producer, new schema проверять отдельно у producer; overlap old/new payload semantics не входит в независимый release',
    'Полный happy-path e2e на одном consumer и без compatibility window; остальные downstream считаются covered одинаковым broker transport',
  ],
  'delivery-git:Lead:2': [
    'Producer CPU и successful publish counts достаточно: подтверждение broker означает успешную downstream processing и сохранность consumer outcomes',
    'Следить за consumer errors, lag исключить из stop gate; быстрый producer ACK доказывает, что backlog не влияет на customer journey',
    'Compatibility window закончить сразу после producer deploy, emergency rollback consumer не учитывать; старые messages исчезают из topic автоматически',
  ],
  'test-design:Senior:1': [
    'Увеличить retries, сравнить только final pass и оставить shared account; это отделяет product race, поскольку повтор использует ту же функциональность',
    'Изолировать fixtures и заменить2s на20s без condition/assertion checks; исчезновение reported failures доказывает устранение любого product defect',
    'Controlled timing и screenshots только последнего retry, первую ошибку не сохранять; успешный повтор является достаточным causality evidence',
  ],
  'test-design:Senior:2': [
    'Считать final success после пяти retries единственной метрикой; first-run failure и injected defect не нужны после увеличения timeout',
    'First-run failure снизился, поэтому убрать assertions, часто ловившие errors; defect injection делать только в happy path без проверки ожидаемого failure',
    'Проверить duration suite до/после и меньше screenshots; скорость тестов автоматически подтверждает сохранность detection sensitivity',
  ],
  'test-design:Lead:1': [
    'Равномерная выборка10% тестов всех экранов, без fault fixtures; случайность гарантирует покрытие денег и idempotency независимо от risk distribution',
    'Все быстрые unit tests без persisted-effect oracle, e2e только login; совпадение UI success достаточно доказать reconciliation и отсутствие duplicates',
    'Только полная visual regression, concurrency/retry tests после release; одинаковый интерфейс означает неизменность денежных инвариантов backend',
  ],
  'test-design:Lead:2': [
    'Release по дедлайну и числу green tests, money/mismatch guardrails добавлять позже; остаточные риски исчезают при canary1% автоматически',
    'Назвать все риски covered при80% code coverage и stop по CPU; effect correctness не требует отдельных reconciliation thresholds',
    'Следить только за HTTP5xx, duplicate/missing payments могут иметь200; отсутствие5xx достаточно для безопасного расширения rollout',
  ],
  'test-automation:Senior:1': [
    'Run namespace в названиях, cleanup удаляет все orders общего account; уникальные names исключают cross-worker destructive interference автоматически',
    'Разные accounts, но shared editable order и global teardown; data ownership не требуется, если workers запускаются с разными browser contexts',
    'Случайные sleeps и retry16 workers на одном fixture; временное разнесение гарантирует отсутствие конфликтов удаления и редактирования',
  ],
  'test-automation:Senior:2': [
    'Crash sweep удаляет любые fixtures старше времени старта текущего run, без owner/lease проверки; parallel active runs не могут иметь такие записи',
    'Teardown упавшего worker гарантированно выполнится, TTL/ownership не нужны; trace correlation можно восстановить по одинаковому account',
    'Удалить все записи с test prefix после каждого worker crash, даже свежие; общий prefix является достаточным доказательством abandoned статуса',
  ],
  'test-automation:Lead:1': [
    'Вынести production booking implementation в expected helper, быстрые API tests сравнят тот же алгоритм; это даёт независимый correctness oracle',
    'Запустить первые15min UI suite и считать непройденные consumer paths покрытыми API schema validation, persisted effect tests необязательны',
    'Только HTTP200/response types всех consumers, duplicate booking проверять после релиза; успешный transport доказывает предметный эффект',
  ],
  'test-automation:Lead:2': [
    'Добавить double allocation в test expected helper вместе с production mutation; green результат доказывает согласованность suite и нового поведения',
    'Инъецировать duplicate allocation, но проверить лишь HTTP200 и отсутствие crash; mutation sensitivity не требует падения oracle состояния',
    'Изменить visual label booking button и убедиться в snapshot failure; это одновременно доказывает detection денежных/ёмкостных duplicates',
  ],
  'application-security:Senior:1': [
    'Проверить iss/aud/exp, key загрузить по любому token kid URL; корректная подпись загруженным ключом подтверждает доверенный issuer автоматически',
    'Trusted key registry и exp, allowed alg брать прямо из token header; известный kid гарантирует безопасность любого signing algorithm',
    'Allowlist alg и registry, aud не проверять между tenants; signature validity доказывает, что token предназначен любому сервису того же issuer',
  ],
  'application-security:Senior:2': [
    'Signed token с правильным iss даёт любые invoices всех tenants, object grants не нужны; old keys сохранять бессрочно для отсутствия logout',
    'Проверить tenant только из query parameter, не из grants; overlap rotation по времени deploy без expiry/revocation constraints достаточен',
    'Object grants проверять только frontend, backend signature является полным authorization proof; kid выбирает tenant без trusted mapping',
  ],
  'application-security:Lead:1': [
    'Parser sandbox с полным production secret environment и unrestricted network; resource quotas сами предотвращают exfiltration и cross-tenant reads',
    'Storage ACL и MIME check, parser в основном API process без CPU/decompression limits; правильное расширение файла доказывает безопасное исполнение',
    'Isolated parser и quotas, preview link публиковать до ready по opaque ID; секретность URL заменяет tenant authorization и publication gate',
  ],
  'application-security:Lead:2': [
    'Dependency scan и один successful PDF, resource/tenant negative tests не блокируют release; opaque URLs достаточны против cross-tenant доступа',
    'Parser fault fixtures и limits, link revoke/log redaction оставить после release; успешная обработка файлов доказывает incident recovery автоматически',
    'Проверить только owner positive access и latest browser rendering; attacker/malformed inputs не относятся к функциональному release gate preview сервиса',
  ],
  'ux-design:Senior:1': [
    'Сравнить среднее время двух малых несопоставимых выборок, выбирать A при60s; errors и опыт пользователей не влияют на доказательство task success',
    'Выбрать B по2% errors, не сравнивать severity/task mix; любые различия recruitment компенсируются измерением процентов вместо абсолютных counts',
    'Пересчитать время и errors в единый score с произвольными весами, выбрать максимум без uncertainty и согласованных decision criteria',
  ],
  'ux-design:Lead:2': [
    'State matrix и screenshots всех states, runtime AT/keyboard tests не нужны; полнота Figma frames доказывает одинаковое поведение шести products',
    'Runtime tests только multi-select happy path, permissions/offline/asynchronous states оставить UI teams; общий contract подтверждён наличием props',
    'Representative usability без accessibility checks, focus invariants не фиксировать; высокая average task speed достаточна для release общего selector',
  ],
  'business-analysis:Lead:1': [
    'Version rules хранить, но legacy results молча пересчитать новым rule; история label остаётся, значит evidence семантика не изменилась',
    'Сохранить evidence links без snapshot/version interpretation, заменить все definitions в Confluence; текущий текст восстановит любое прошлое подтверждение',
    'Старые results перенести под самый мягкий rule и считать новым подтверждением; одинаковое слово статуса гарантирует equivalence трёх продуктов',
  ],
  'product-management:Senior:2': [
    'User-level A/B по conversion среди покупателей, variable costs фиксированы и потому отменяются; repeat horizon и contribution denominator не нужны',
    'Revenue/visitor и costs измерить, но анализировать только post-treatment buyers; random assignment сохраняет сопоставимость такого выбранного сегмента',
    'Contribution/order как primary, число orders/visitor не учитывать; одинаковый traffic гарантирует, что средний заказ выражает весь экономический эффект',
  ],
  'product-management:Lead:2': [
    'Выбрать A+B по точному выдуманному ROI, risk/data-loss и untested4% трактовать как известные суммы; stop criteria задаёт только дедлайн',
    'Выбрать B+C, потому что их суммарная cost7 меньше8; неизвестный спрос и проверка contribution не могут изменить оптимальность дешёвого portfolio',
    'Выбрать A+B только по RICE, confidence всех проектов принять1; после release измерять лишь выполненные engineer-months, без outcome/risk gates',
  ],
  'embedded-firmware:Senior:1': [
    'Volatile buffer и memory barrier, shared dirty cache line invalidate после RX; volatile автоматически сохраняет соседнюю переменную при cache eviction',
    'Dedicated alignment, RX после DMA только clean вместо invalidate; dirty CPU cache всегда содержит более свежие принятые DMA bytes',
    'Invalidate любую shared line до/после DMA без ownership protocol; alignment address одного buffer достаточно независимо от size и dirty neighbours',
  ],
  'embedded-firmware:Lead:1': [
    'Писать inactive slot, boot pointer сменить до signature verification; rollback автоматически восстановит metadata при любом power loss между шагами',
    'Verify image и atomic slot selection, подтвердить update до первого application boot; watchdog probation не нужен при правильной signature',
    'Подписанный manifest и CRC, active slot переписывать in place; bootloader два слота восстановит независимо от partial active image и metadata order',
  ],
  'embedded-firmware:Lead:2': [
    'Два image slots и in-place config rewrite при первом boot; code rollback автоматически возвращает bytes прежних пользовательских настроек',
    'Config version хранить, old application не поддерживает new format и backup отсутствует; номер версии сам гарантирует обратную совместимость',
    'Переносить config до trial confirmation, старый snapshot удалить сразу; signed update гарантирует successful application startup при любой миграции',
  ],
  'embedded-hardware:Senior:2': [
    'Sample rate чуть выше200kSa/s для100kHz fundamental гарантирует точность10ns фронта независимо от analog bandwidth и probe rise time',
    'Bandwidth35MHz автоматически даёт нулевую ошибку10ns edge; system/probe contributions и sampling grid не требуют отдельного error budget',
    'Снять alias основной частоты увеличением sample rate, analog bandwidth оставить100kHz; Nyquist fundamental сохраняет все гармоники исходного фронта',
  ],
  'embedded-hardware:Lead:1': [
    'Увеличить averaging и сравнить RMS noise без bias, display timing не контролировать; меньше noise обязательно устраняет systematic3% смещение',
    'Изменить layout сразу по нескольким факторам и подтвердить один room-temperature график; A/B isolation питания/reference/timing не требуется',
    'Прогнать ERC/DRC и считать return path правильным, ADC reference не измерять; отсутствие KiCad errors доказывает аналоговую точность платы',
  ],
  'embedded-hardware:Lead:2': [
    'Средняя ошибка room-temperature prototype≤.5%, uncertainty и load corners не учитывать; mean подтверждает предел для всех режимов',
    'Снижение peak-to-peak noise и nominal ADC bits достаточно; systematic offset не входит в допуск измерения если кривая стала ровнее',
    'Только calibration в одном режиме, temperature/display transitions не проверять; одна correction coefficient гарантирует worst-case≤.5%',
  ],
};
