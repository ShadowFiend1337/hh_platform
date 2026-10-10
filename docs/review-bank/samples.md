# Случайные задачи для согласования

Версия 2026.10.10-research-v1. Выборка сохранена; повтор команды создаст новую. Равновероятный выбор трёх разных областей компетенций на каждом уровне. Уровни и время предварительные. Эталонные ответы не включены.

## Стажёр

### Flutter: состояния запроса

ID: `research:mobile-cross:Intern` · Flutter/Dart и React Native · код · ориентир 15 мин.

Flutter-экран на Dart должен показывать loading, empty, data и error для Future&lt;List&lt;Item>>. Напишите реализацию без запуска нового запроса при каждом build; добавьте Retry. Покажите поведение пустого ответа и объясните, где хранится Future.

### Форма без мыши

ID: `research:web-platform:Intern` · HTML, CSS и доступность · код · ориентир 15 мин.

Форма содержит два input без label и div с текстом «Отправить» и обработчиком click. Напишите доступную HTML-версию: email обязателен, ошибка привязана к полю, отправка работает с клавиатуры. Объясните порядок Tab и поведение Enter; CSS должен сохранять видимый фокус.

### Vue: фильтр списка

ID: `research:vue-angular:Intern` · Реактивность Vue и Angular · код · ориентир 15 мин.

Во Vue 3 есть ref массив товаров и ref search. Напишите computed для фильтрации без изменения массива и шаблон с устойчивыми key. После изменения названия товара фильтр должен обновиться. Объясните разницу computed и ручного пересчёта по клику.

## Junior

### Swift: состояние редактирования

ID: `research:mobile-native:Junior` · Android/Kotlin и iOS/Swift · код · ориентир 20 мин.

В SwiftUI список редактирует запись value type. Редактор получает копию записи; после Save список не обновляется. Покажите контракт Binding либо явного callback, отмену без изменения исходной записи и стабильную identity строки. Чем @State черновика отличается от canonical модели?

### Метрика приглашений

ID: `research:product-management:Junior` · Продукт: метрики, экономика и решения · развёрнутый кейс · ориентир 20 мин.

Команда увеличила число отправленных приглашений на 40%, но принятых стало меньше. Предложите основную метрику полезного контакта, guardrails spam/качества и воронку для диагностики. Уточните знаменатели, период и duplicates; оформите гипотезу и acceptance эксперимента в Jira.

### Angular: валидация формы

ID: `research:vue-angular:Junior` · Реактивность Vue и Angular · код · ориентир 20 мин.

Angular-форма имеет email и confirmEmail. Нужны обязательность, проверка формата и совпадения; серверный 409 сообщает занятый email. Опишите typed reactive form, validator уровня группы и отображение ошибок после touched/submit. Покажите тест, где серверная ошибка исчезает только после изменения email.

## Middle

### Предсказание для новых организаций

ID: `research:classical-ml:Middle` · Машинное обучение и scikit-learn · развёрнутый кейс · ориентир 25 мин.

Есть 100000 строк от 400 организаций. Внутри организации повторы; целевая эксплуатация — новые организации. Random split даёт ROC-AUC 0.94, GroupKFold 0.72. Спроектируйте validation, baseline, confidence interval и анализ признаков, позволяющих узнавать организацию. Как поступить с почти уникальным organization_id?

### Один artifact между средами

ID: `research:delivery-git:Middle` · Git и доставка изменений · развёрнутый кейс · ориентир 25 мин.

CI собирает Docker image отдельно для staging и production из того же commit; зависимости floating latest, результаты различаются. Спроектируйте build once/promote by digest, lockfiles, provenance и smoke gate. Как rollback выбирает точно проверенный image?

### UML: платёж с неопределённым исходом

ID: `research:business-analysis:Middle` · Требования, BPMN и UML · развёрнутый кейс · ориентир 30 мин.

Платёжный сервис получил timeout после отправки провайдеру. Клиент повторяет запрос; провайдер поддерживает operation key и status API. Нарисуйте UML state machine и sequence для retry/reconciliation, задайте invariants и Jira acceptance cases. Как различаются failed и unknown?

## Senior

### Данные не помещаются в RAM

ID: `research:dataframes:Senior` · Pandas и NumPy: подготовка данных · развёрнутый кейс · ориентир 30 мин.

CSV 120 ГБ с событиями нужно агрегировать по (day,user_id); RAM 4 ГБ, пользователей 80 млн. Чтение chunks решает размер входа, но итоговый dict растёт. Предложите Pandas/NumPy решение с внешним разбиением, dtype и merge агрегатов; оцените память и проверки equivalence на небольшом наборе.

### Паритет экспорта модели

ID: `research:deep-learning:Senior` · PyTorch и TensorFlow: обучение и inference · развёрнутый кейс · ориентир 30 мин.

Модель PyTorch экспортирована для inference в TensorFlow-пайплайн; top-1 отличается на 3% примеров. Возможны другой порядок каналов, resize, dtype и режим batch normalization. Составьте порядок локализации по промежуточным tensors, golden inputs и численным допускам. Как отличить малую logit ошибку на границе решения от семантической ошибки preprocessing?

### Node.js: CPU и хвост задержки

ID: `research:backend-api:Senior` · API: FastAPI и Node.js · развёрнутый кейс · ориентир 30 мин.

API Node.js обрабатывает 300 req/s; синхронный расчёт в одном endpoint занимает 80ms CPU. После его вызовов p99 всех endpoints превышает 2s, CPU одного ядра 100%. Выведите ограничение пропускной способности расчёта, предложите изоляцию и backpressure. Как тестом отделить event loop lag от ожидания БД?

## Lead

### Версионирование бизнес-правил

ID: `research:business-analysis:Lead` · Требования, BPMN и UML · развёрнутый кейс · ориентир 40 мин.

Три продукта трактуют «подтверждённый кандидат» по-разному. Требуется новый единый контракт без переоценки прошлых результатов: правила, test evidence и версии должны сохраняться. Спроектируйте decision model, requirement-to-test traceability и миграцию Jira/Confluence спецификаций. Как докажете, что новый термин не изменил старый факт?

### Контракт выпуска платформы

ID: `research:delivery-git:Lead` · Git и доставка изменений · развёрнутый кейс · ориентир 40 мин.

12 сервисов должны выпускать изменения независимо, но shared event schema ломает downstream. Нужны consumer contracts, compatibility window и emergency rollback; полная integration среда стоит дорого. Предложите уровни проверок, ownership схем и критерии canary. Как предотвратить ситуацию, когда producer test проходит, а consumer падает?

### SDK для нескольких потребителей

ID: `research:javascript-typescript:Lead` · JavaScript и TypeScript · развёрнутый кейс · ориентир 35 мин.

Один TypeScript SDK используется браузером, Node.js и React Native. Новая версия меняет формат ошибок и способ отмены; старые потребители обновятся через 3 месяца. Опишите public API, совместимость ESM/CJS по целевым окружениям, adapter layer и набор контрактных тестов. Как проверить, что типы и фактическое поведение ошибок совпадают?
