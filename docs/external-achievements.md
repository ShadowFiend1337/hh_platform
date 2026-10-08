# AtCoder, Kaggle и GitHub

Реализованы в основном **Node.js backend** и кабинете кандидата. Это привязка дополнительных источников к уже зарегистрированному аккаунту платформы. Она не заменяет регистрацию с подтверждением email, серверный тест и профессиональный грейд. Достижения этих источников не включают признак/бонус ФСП.

| Источник | Подтверждение аккаунта | Что импортируется | Ограничение подтверждения |
| --- | --- | --- | --- |
| AtCoder | Точный случайный код в публичном Affiliation | Рейтинг Algorithm по истории, места и изменение рейтинга; до 1000 последних соревнований | Публичного immutable account ID нет; код остаётся в поле и перепроверяется при каждом обновлении. Heuristic и общее число решённых задач не импортируются |
| Kaggle | Современный API Token → официальный IntrospectToken → immutable числовой userId | Позиция команды в public leaderboard среди до 50 entered соревнований, упорядоченных по последнему сроку завершения | userRank не доказывает итоговое место в private leaderboard, медаль или личный вклад. Одно вступление без позиции не создаёт достижение |
| GitHub | Собственное OAuth-приложение, state + PKCE S256, проверка GET /user → immutable числовой ID | До 300 последних обновлённых принадлежащих аккаунту публичных репозиториев, исключая форки; до 20 последних обновлённых публичных принятых PR | Владение репозиторием не доказывает авторство всего кода. Для PR проверяются автор, фактический merged_at и публичный базовый репозиторий; качество/размер вклада отдельно не оцениваются |

## Пользовательский путь

Войти кандидатом, сохранить профиль с согласием и открыть «Внешние подтверждения». Для каждого подключения отдельно отметить согласие на импорт. Публикацией управляют настройки профиля; работодатель получает записи только опубликованного доступного профиля и без внутренних ID, токенов и приватных материалов.

AtCoder: указать ник, получить challenge, записать код в Affiliation через настройки своего аккаунта и нажать «Я сохранил код — проверить». Запросить и подтвердить challenge нужно за 30 минут. Сохранить прежнее значение поля перед заменой; восстановить его после отключения. В отличие от Codeforces, удаление кода при активной привязке блокирует следующее обновление: открытого стабильного ID, позволяющего безопасно продолжить импорт по одному нику, у этого адаптера нет. Изменение ника требует отключения и новой проверки.

Kaggle: в [собственных настройках](https://www.kaggle.com/settings) создать современный API Token и вставить сам токен в поле. Формат legacy `kaggle.json` с username/key не используется. Ник не вводится: источник сообщает username и userId при интроспекции. Если API не сообщает активность токена или числовой userId, привязка отклоняется. Поле очищается при отправке и токен не сохраняется в localStorage. Платформа использует только операции чтения; сам токен может иметь более широкие права, поэтому пользователь может отозвать его в настройках Kaggle. Отключение удаляет локальную копию, но не отзывает токен у Kaggle.

GitHub: «Подключить» открывает выбор аккаунта и согласие GitHub. После возврата привязка создаётся только для ID из ответа `/user`. Пароли GitHub и персональные PAT не запрашиваются. OAuth scope пустой: нужен доступ к публичным данным, `repo`/email/private repositories не запрашиваются. Старый grant того же OAuth-приложения может вернуть ранее разрешённые scopes; адаптер всё равно читает только публичное портфолио.

Синхронизация выполняется в фоновой очереди; доступны ручное обновление, ежедневное обновление и отключение с удалением локальных credentials/данных. Подтверждение актуально 7 дней. Ошибка источника сохраняет прежний снимок со статусом `stale`; частичный/невалидный ответ не публикуется. Отсутствующая в новом снимке запись получает `revoked`: для ограниченной выборки это может означать выход за её пределы, а не санкцию источника. Место AtCoder — опубликованная историческая позиция, данные Kaggle — состояние public leaderboard на момент проверки, а не финальный результат.

## Контракты

[OpenAPI 1.4.0](api/integrations.openapi.json) описывает реализованные маршруты, тела, ответы и ошибки. Общие контракты очереди и доказательств — в [integrations.md](integrations.md). Запросы кандидата требуют сессионный cookie и актуальный `X-Platform-Identity`; OAuth callback проверяет owner-bound state вместо заголовка вкладки.

```http
POST /api/integrations/atcoder/connect
Content-Type: application/json
X-Platform-Identity: auth:<account-id>

{"consent":true,"handle":"your_handle"}
```

Ответ 202 содержит `challenge: {id, token, handle, field:"affiliation", profileUrl, keepProof:true, expiresAt}`; до проверки connection/job равны null. `POST /api/integrations/atcoder/verify` с `{"challengeId":"<id>"}` возвращает 200 с connection и фоновой job. Неверный код — 403, чужой/использованный/просроченный challenge — 400, отключение или смена подключения во время проверки — 409.

`POST /api/integrations/kaggle/connect` принимает строго `{"consent":true,"apiToken":"<your-modern-token>"}` и возвращает 202 с connection/job после успешной интроспекции. Заявленные username/userId не принимаются. Ошибка токена/личности — 403, временная недоступность — 503.

`POST /api/integrations/github/connect` принимает `{"consent":true}` и возвращает 202 с authorizationUrl и expiresAt (10 минут). GitHub возвращает на `GET /api/integrations/github/callback?state=...&code=...`. Bridge очищает URL и делает same-origin POST, сохраняя SameSite=Strict сессию; затем возвращает в профиль. State одноразовый; повтор/чужой state — 400. Новый connect, disconnect и отзыв согласия блокируют позднюю привязку, включая результат уже начавшегося token exchange.

Общие: `POST /api/integrations/{provider}/sync`, `GET /api/integration-jobs/{id}`, `GET /api/profile/evidence`, `GET /api/directory/{id}/evidence`, `DELETE /api/integrations/{provider}`. Provider IDs: `atcoder`, `kaggle`, `github`; способы проверки: `profile_challenge`, `api_token`, `oauth2`. Mapping versions: `atcoder-algorithms-v1`, `kaggle-competitions-v1`, `github-portfolio-v1`. GitHub использует discipline `software_development` без автоматически выведенных навыков.

## Настройка

```dotenv
ATCODER_ENABLED=1
KAGGLE_ENABLED=1
GITHUB_ENABLED=1
INTEGRATION_ENCRYPTION_KEY=<64-hex-characters>
GITHUB_CLIENT_ID=<your-registered-oauth-client>
GITHUB_CLIENT_SECRET=<your-client-secret>
GITHUB_REDIRECT_URI=https://<platform-origin>/api/integrations/github/callback
COOKIE_SECURE=1
```

В development основной сервер сохраняет локальный ключ с правами 0600; в production для любого live-подключения обязателен стабильный `INTEGRATION_ENCRYPTION_KEY`. Его можно сгенерировать командой `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` и записать в локальный `.env`/secret store. Ключ не коммитить. Credentials и pending proofs зашифрованы AES-256-GCM; общедоступные API-ответы их не содержат.

Для GitHub зарегистрировать **собственное** [OAuth-приложение](https://github.com/settings/applications/new): имя платформы, Homepage URL нашего интерфейса, Authorization callback URL ровно из `GITHUB_REDIRECT_URI`. Скопировать Client ID и создать Client Secret в приватную конфигурацию сервера. Для Vite development использовать `http://127.0.0.1:5173/api/integrations/github/callback` и открывать сам интерфейс на `http://127.0.0.1:5173`; адрес callback должен относиться к тому же origin интерфейса, где пользователь вошёл. Production — HTTPS. До задания client/secret/callback/key GitHub отображается недоступным. Реальные credentials и регистрация приложения требуют доступа владельца GitHub: чужой client ID не используется.

AtCoder и Kaggle не требуют серверного OAuth-клиента. AtCoder использует строго `https://atcoder.jp/users/<handle>?lang=en` и `/history/json?contestType=algo`; это публичные ресурсы сайта, не обещанный стабильный внешний API. Изменение HTML/JSON должно приводить к отказу обновления, а не догадкам о данных. Запросы последовательные, не чаще одного в 2.1 секунды на экземпляр адаптера.

Kaggle использует транспорт актуального официального `kagglesdk` 0.1.37: POST `https://api.kaggle.com/v1/security.OAuthService/IntrospectToken`, `competitions.CompetitionApiService/ListCompetitions` (`group=ENTERED`, до двух страниц по 25), `GetCompetition`. Перед публикацией информации о соревновании `GetCompetition` проверяется **без токена**: приватные/недоступные анонимному читателю соревнования исключаются. Запросы не чаще одного в 1.1 секунды; токены не передаются в URL.

GitHub: фиксированные `github.com` и `api.github.com`, REST API version `2022-11-28`. Ротация refresh token сохраняется до запроса ресурсов. Ограничение rate limit учитывает `Retry-After`/`X-RateLimit-*`; пагинация строится адаптером, произвольные upstream URL не запрашиваются. Запросы не чаще одного в 1.1 секунды. Все источники: redirect запрещён, таймаут запроса 10 секунд, тело ответа до 1 MB, строгая проверка схемы и принадлежности. Очередь рассчитана на один процесс основного Node-сервера; для нескольких процессов нужен общий rate limiter.

## Проверки и границы готовности

- `npm run test:server` — source parsing, exact proof, token introspection, immutable ID, OAuth PKCE/state/refresh, приватность, malformed/foreign responses и гонки при отмене/смене подключения.
- `npm run test:external-providers-browser` — все три подключения через реальный интерфейс/HTTP на изолированном backend с фиктивными внешними ответами; в том числе переход GitHub с другого hostname и SameSite=Strict bridge, отдельное согласие, неверный код/токен, импорт, видимость работодателю, неизменный грейд, обновление и удаление.
- `npm run test:codeforces-browser`, `test:integrations-browser`, `test:moderation-browser` — регрессия прежних источников и модерации; `npm run build` — TypeScript и сборка.

Публичный профиль и настоящая история AtCoder прочитаны без изменения чужих аккаунтов. У Kaggle проверен анонимный GetCompetition на публичном Titanic и ответ интроспекции на заведомо недействительный токен. **Успешная привязка реального AtCoder/Kaggle аккаунта и реальный GitHub OAuth не проверены:** необходимы собственный аккаунт, токен кандидата или зарегистрированный OAuth-клиент соответственно. Проверки с fixtures не означают получение реального доступа. CTFtime пока не подключён: отдельная задача — подтвердить состав команды, личный вклад и допустимый сценарий использования API.

Источники реализации: [AtCoder FAQ](https://atcoder.jp/faq?lang=en), [публичная история AtCoder](https://atcoder.jp/users/tourist/history), [официальный Kaggle CLI](https://github.com/Kaggle/kaggle-cli), [Kaggle: authentication](https://github.com/Kaggle/kaggle-cli/blob/main/docs/README.md), [Kaggle: competitions](https://github.com/Kaggle/kaggle-cli/blob/main/docs/competitions.md), [GitHub OAuth/PKCE/refresh](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [GitHub repository API](https://docs.github.com/en/rest/repos/repos#list-repositories-for-a-user), [GitHub pull requests](https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request).
