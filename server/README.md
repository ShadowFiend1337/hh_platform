# Сервер тестирования

Node.js 24, встроенные HTTP, криптография и SQLite. Банк и ключи ответов загружаются только сервером; дополнительных пакетов, внешних API и секретных ключей нет. Профили и приглашения ещё не перенесены с клиента.

Из корня: `npm run dev` запускает API на 8787 и Vite на 5173. После `npm run build` команда `npm start` обслуживает собранный сайт и API на http://127.0.0.1:8787. Сам сервер можно запустить отдельно: `node server/server.mjs`.

Попытки сохраняются в `server/data/assessment.sqlite`, папка исключена из Git. Для изменения пути используйте переменную окружения `ASSESSMENT_DB`; доступны также `PORT`, `HOST`, `WEB_ORIGIN` и `COOKIE_SECURE=1` для HTTPS за прокси. По умолчанию сервис слушает только 127.0.0.1.

Собранный сайт включает страницу `/privacy` и локальные ресурсы распознавания резюме: JavaScript-worker, WebAssembly, словари PDF и русскую/английскую OCR-модели. Сервер раздаёт их из `frontend/dist` с нужными MIME-типами; файлы резюме на сервер не загружаются. В запрос тестирования передаются только основные профессиональные поля анкеты, без контактов и дополнительных разделов резюме.

## Контракт

| Метод | Путь | Поведение |
| --- | --- | --- |
| GET | `/api/assessment/program?specialization=Frontend&grade=Middle` | Темы, порог, время и примеры описаний; ключей нет |
| POST | `/api/assessment/attempts` | Анкета и необязательное `vacancyDescription`; фиксирует вариант, возвращает задания и отдельный токен |
| GET | `/api/assessment/attempts/:id` | Восстановление по cookie и заголовку `X-Attempt-Token` |
| POST | `/api/assessment/attempts/:id/submit` | `token` и массив `{questionId, optionId}`; сервер возвращает балл и агрегаты по темам |

Владелец попытки определяется случайной HttpOnly-cookie с SameSite=Strict, а не переданным клиентом ID кандидата. В базе сохраняются хеши cookie и токена. Идентификаторы вопросов и вариантов создаются заново; закрытые ID семейств, правильный ответ и весь банк API не выдаёт.

Попытка длится 30 минут. Просроченная незавершённая попытка не создаёт провал. Повторная отправка одинаковых ответов возвращает тот же результат; изменение после проверки даёт 409. Порог — 70/100, веса заданий одинаковые. Есть технические лимиты: до 20 новых попыток на владельца в час, 40 на IP в час и 180 API-запросов на IP в минуту; они не заменяют правило смены категории раз в 90 дней, которое пока находится в клиентском прототипе.

Сессия браузера ещё не является настоящим аккаунтом. Она защищает доступ к серверной попытке и её проверке; подтверждение личности и защищённое хранение профиля требуют отдельной авторизации. Очистка cookie создаёт новую сессию и сбрасывает привязанную к ней историю исключения вариантов; IP-лимит остаётся.

## Банк и вакансии

65 программ: 13 специализаций × Стажёр/Junior/Middle/Senior/Lead, 390 семейств и 1560 вариантов задач. Доступные направления и отрасли определены общим открытым словарём `shared/catalog.ts`, грейды — `shared/grading.ts`; закрытые банки находятся в `server/banks`. Стажёр проверяет базовые механизмы, Senior — сложные технические сценарии, Lead — технические решения по ограничениям продукта, эксплуатации и выпуска. Эти программы имеют свои задания и не используют результат Middle для подтверждения другого грейда. Четыре варианта каждого семейства оставляют минимум два доступных после исключения последних двух попыток и предотвращают принудительный цикл из трёх наборов. Каждый тест проверяет три темы по двум фиксированным слотам: авторские уровни 1 и 2, бюджет 9. Теги вакансии выбирают наиболее подходящий из оставшихся вариантов; ядро и веса сохраняются.

67 описаний вакансий — синтетические, покрывают все 65 программ. Разбор использует явные термины, не ML; нераспознанные требования не считаются покрытыми. В клиенте показываются навыки именно выбранных задач и распознанные пробелы. Содержательное формирование не требует публикации вакансии работодателем.

Авторская сложность не является эмпирической. [Отчёт](../docs/assessment_validation.md) содержит автоматические результаты; [план](../docs/metrics_and_validation.md) и `calibrate.mjs` подготовлены для исследования на участниках. Небольшой банк не исключает запоминание и помощь извне.

При подготовке заданий использованы первичные справочники: [React useEffect](https://react.dev/reference/react/useEffect), [PostgreSQL isolation](https://www.postgresql.org/docs/current/transaction-iso.html), [Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch). Слой хранения использует [Node SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html).

Факты программ Junior/Middle сверены с [scikit-learn](https://scikit-learn.org/stable/common_pitfalls.html), [PyTorch autograd](https://docs.pytorch.org/docs/stable/notes/autograd.html), [Playwright](https://playwright.dev/docs/best-practices), [Android offline-first](https://developer.android.com/topic/architecture/data-layer/offline-first), [Kubernetes probes](https://kubernetes.io/docs/concepts/workloads/pods/probes/), [OWASP JWT](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html), [WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [Scrum Guide](https://scrumguides.org/scrum-guide.html). Эти источники подтверждают факты заданий, не калибровку грейда. Все пять уровней остаются авторскими: независимая проверка качества заданий и исследование на кандидатах ещё не проведены.

Для добавленных уровней выполнена выборочная сверка: стабильность ссылок свойств и `memo` — [React](https://react.dev/reference/react/memo); `maxSurge` с явно исключёнными завершающимися pods — [Kubernetes Deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/); проверка прав на объект для каждого действия — [OWASP API1](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/). Это подтверждает отдельные факты, а не весь банк или точность присвоения Senior/Lead.

Также выборочно сверены согласованность преобразований данных при обучении и инференсе и независимость контрольной выборки — [scikit-learn](https://scikit-learn.org/stable/common_pitfalls.html); управление фокусом при закрытии диалога — [W3C APG](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/); изоляция состояния тестов, наблюдаемые ожидания и диагностические traces — [Playwright](https://playwright.dev/docs/best-practices).

Проверки: `npm run test:server`, `npm run test:assessment` при работающем сайте, `npm run validate:assessment` после сборки.
