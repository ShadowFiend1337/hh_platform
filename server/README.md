# Backend платформы

API реализован на FastAPI и SQLAlchemy. Он обслуживает аккаунты, подтверждение email, тестирование, состояние кабинетов, каталог и приглашения. Браузер использует локальную копию состояния, а сервер остаётся источником данных и проверяет права, результаты тестов и версию сохранения.

## Запуск

Нужны Python 3.11 или новее и Node.js 24 или новее для Vite-интерфейса. Из корня репозитория:

```bash
cp .env.example .env
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
npm ci --prefix frontend
npm run dev
```

`npm run dev` запускает FastAPI с перезагрузкой на `http://127.0.0.1:8787` и Vite на `http://127.0.0.1:5173`. Vite проксирует `/api` на FastAPI. Скрипты сами используют `.venv`, если оно существует; `PYTHON_BIN` позволяет указать другой интерпретатор. Отдельный запуск API выполняется через `npm start`.

После сборки интерфейса FastAPI раздаёт сайт самостоятельно:

```bash
npm run build
npm start
```

Собранный сайт и API доступны на `http://127.0.0.1:8787`. FastAPI раздаёт `frontend/dist` для `/`, `/app`, `/auth` и `/privacy`, а также существующие статические ресурсы. Неизвестные пути `/api/*` не получают HTML в ответ.

## Хранилище

`DATABASE_URL` выбирает базу данных:

- Пустое значение или отсутствие переменной включает SQLite в `backend/data/hh_platform.sqlite3`.
- Значение `sqlite:///...` указывает другой SQLite-файл.
- Значение `postgresql://...` или `postgres://...` включает PostgreSQL через psycopg.

FastAPI автоматически создаёт текущую SQLAlchemy-схему при старте. Локальная SQLite находится в `backend/data/` и исключена из Git. В ней создаются `auth_accounts`, `auth_pending_registrations`, `auth_sessions`, `platform_states` и `assessment_attempts`. Полное состояние кабинета хранится JSON-документом в `platform_states`; его `revision` защищает от перезаписи изменений из другой вкладки.

### PostgreSQL через Compose

В `.env` задайте `POSTGRES_PASSWORD`, затем выполните:

```bash
docker compose up -d postgres
```

После запуска контейнера замените `DATABASE_URL` в `.env` на адрес PostgreSQL. Для значений по умолчанию пример выглядит так:

```dotenv
DATABASE_URL=postgresql://hh_platform:ваш_пароль@127.0.0.1:5432/hh_platform
```

Compose поднимает только PostgreSQL. FastAPI остаётся процессом на хосте и создаёт схему при следующем `npm run dev` или `npm start`. Если пароль содержит специальные символы URL, их нужно percent-encode в `DATABASE_URL`.

## Окружение и почта

| Переменная | Назначение |
| --- | --- |
| `HOST`, `PORT` | адрес и порт FastAPI; по умолчанию `127.0.0.1:8787` |
| `WEB_ORIGIN` | origin Vite, которому разрешены браузерные запросы |
| `COOKIE_SECURE` | `1` добавляет флаг `Secure` к сессионным cookie |
| `DATABASE_URL` | URL SQLite или PostgreSQL |
| `SQL_ECHO` | вывод SQLAlchemy в журнал |
| `APP_ENV` | режим среды; в `production` требуется SMTP |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_TLS` | адрес, порт и TLS-режим SMTP |
| `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | учётные данные и адрес отправителя |
| `AUTH_CODE_TTL_MINUTES`, `AUTH_SESSION_DAYS` | срок действия кода и сессии |

Для SMTP на порту 587 используйте `SMTP_TLS=starttls`, на 465 — `implicit`. Без SMTP FastAPI пишет код подтверждения только в журнал development-среды. В `APP_ENV=production` запрос кода вернёт `503`, пока почта не заполнена полностью.

## Контракт

| Метод | Путь | Поведение |
| --- | --- | --- |
| `GET` | `/api/health` | `{ "status": "ok" }` |
| `POST` | `/api/auth/register/request-code` | Сохраняет ожидающую регистрацию и отправляет шестизначный код |
| `POST` | `/api/auth/register/verify` | Подтверждает email, создаёт аккаунт и выдаёт HttpOnly-сессию |
| `POST` | `/api/auth/login` | Принимает `loginOrEmail` и пароль, выдаёт сессию |
| `GET` | `/api/auth/me` | Возвращает публичные сведения текущего аккаунта |
| `POST` | `/api/auth/logout` | Отзывает серверную сессию и очищает cookie |
| `GET` | `/api/assessment/program` | Возвращает программу без ключей ответов |
| `POST` | `/api/assessment/attempts` | Создаёт попытку и возвращает одноразовый токен |
| `GET` | `/api/assessment/attempts/{id}` | Требует `X-Attempt-Token` для восстановления попытки |
| `POST` | `/api/assessment/attempts/{id}/submit` | Проверяет `{token, answers}`; повтор идентичных ответов возвращает прежний результат |
| `GET`, `PUT`, `DELETE` | `/api/platform/state` | Читает, сохраняет с `baseRevision` или удаляет состояние владельца |
| `GET` | `/api/directory/options` | Возвращает варианты фильтров |
| `GET` | `/api/directory/search` | Принимает `q`, JSON-параметр `filters`, `offset`, `limit` до 100 |
| `GET` | `/api/directory/{id}/contacts` | Открывает контакты по правилам согласия и приглашения |

Ошибки имеют форму `{ "error": "сообщение" }`. Интерфейс отправляет cookie через `credentials: 'same-origin'` и не читает токены из JavaScript.

До входа владельца определяет `predel_session`; после регистрации и входа используется `predel_account_session`. Обе cookie имеют `Path=/api`, `HttpOnly` и `SameSite=Strict`. В базе хранятся хеши случайных cookie, паролей, кодов и сессий. Подтверждённый аккаунт связан с прежним анонимным владельцем, поэтому данные открываются после входа с другого устройства. Выход отзывает сессию и очищает обе cookie.

Код подтверждения действует ограниченное время и блокируется после пяти неверных попыток. Роль `candidate` не ищет каталог и не отправляет приглашения; `employer` не создаёт тест и не сохраняет кандидатский профиль. Первичное сохранение личной анкеты требует согласия. Правильные ответы не выдаются через API, а попытка дополнительно защищена токеном.

## Каталог и данные тестов

Закрытый банк тестов и демонстрационный каталог находятся в `backend/app/data/assessment-bank.json` и `backend/app/data/directory-seed.json`. Эти файлы уже входят в репозиторий. `npm run export:fastapi-data` используется только после осознанного изменения авторских JavaScript-источников банка или каталога.

Текущая переносимая реализация поиска ранжирует профиль по текстовому совпадению и структурным фильтрам. Ответ поиска содержит предупреждение, что семантическая модель не подключена. Прежний ML-эксперимент находится в `ml/`, но FastAPI не запускает его worker.

Ограничители запросов находятся в памяти одного процесса FastAPI. Для нескольких процессов или экземпляров сервиса их нужно перенести в общее хранилище.

Подробная инструкция по FastAPI, PostgreSQL и SQLite — в [docs/fastapi_migration.md](../docs/fastapi_migration.md).
