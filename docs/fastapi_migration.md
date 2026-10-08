# FastAPI, PostgreSQL и локальная SQLite

Backend платформы работает на FastAPI и SQLAlchemy. Он сохраняет URL и JSON-контракты интерфейса, может подключаться к PostgreSQL и автоматически использует SQLite, когда `DATABASE_URL` не задан. Этот документ описывает фактический запуск и границы переноса старых данных.

## Запуск

Нужны Python 3.11 или новее и Node.js 24 или новее для интерфейса. Установите зависимости один раз:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
npm ci --prefix frontend
```

Для разработки запустите:

```bash
npm run dev
```

Скрипт запускает Vite на `http://127.0.0.1:5173` и FastAPI на `http://127.0.0.1:8787`. Vite направляет запросы `/api` на FastAPI. Скрипты запуска сами выбирают `.venv`, если оно существует; другой интерпретатор задаётся через `PYTHON_BIN`. Для отдельного запуска API применяется `npm start`; порт и адрес берутся из `PORT` и `HOST`.

Для собранного интерфейса выполните:

```bash
npm run build
npm start
```

Когда существует `frontend/dist`, FastAPI раздаёт его на порту API. Он возвращает `index.html` для `/`, `/app`, `/auth` и `/privacy`; файлы интерфейса, включая локальные ресурсы OCR, отдаются как статика. Неизвестный `/api/*` не превращается в HTML-страницу.

## Выбор базы данных

Настройка хранения определяется только `DATABASE_URL`:

| Условие | Используемая база |
| --- | --- |
| `DATABASE_URL` отсутствует или пуст | SQLite: `backend/data/hh_platform.sqlite3` |
| `DATABASE_URL=sqlite:///…` | Указанный SQLite-файл |
| `DATABASE_URL=postgresql://…` или `postgres://…` | PostgreSQL через драйвер psycopg |

При старте FastAPI сам создаёт текущую схему. Поэтому локальный запуск не требует Docker, PostgreSQL или отдельной команды миграции. SQLite-файл в `backend/data/` исключён из Git.

### PostgreSQL в Docker Compose

1. Скопируйте `.env.example` в `.env` и задайте `POSTGRES_PASSWORD`.
2. Запустите только СУБД:

   ```bash
   docker compose up -d postgres
   ```

3. Замените `DATABASE_URL` в `.env` на адрес контейнера, используя те же `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT` и `POSTGRES_DB`. Например, при значениях из примера:

   ```dotenv
   DATABASE_URL=postgresql://hh_platform:ваш_пароль@127.0.0.1:5432/hh_platform
   ```

4. Запустите FastAPI через `npm run dev` или `npm start`. Таблицы создадутся при запуске приложения.

Контейнер Compose не запускает API: он предоставляет только PostgreSQL. Если пароль содержит символы, имеющие значение в URL, его нужно percent-encode в `DATABASE_URL`.

## Переменные окружения

| Переменная | Назначение | Локальное значение из примера |
| --- | --- | --- |
| `HOST`, `PORT` | адрес и порт FastAPI | `127.0.0.1`, `8787` |
| `WEB_ORIGIN` | разрешённый origin интерфейса | `http://127.0.0.1:5173` |
| `COOKIE_SECURE` | добавить `Secure` к cookie для HTTPS | `0` |
| `DATABASE_URL` | адрес SQLite или PostgreSQL | `sqlite:///./backend/data/hh_platform.sqlite3` |
| `SQL_ECHO` | вывод SQLAlchemy в журнал | `0` |
| `APP_ENV` | режим приложения; в `production` SMTP обязателен | `development` по умолчанию |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT` | настройки контейнера PostgreSQL | `hh_platform`, `hh_platform`, задаётся пользователем, `5432` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_TLS` | адрес, порт и TLS SMTP | пусто, `587`, `starttls` |
| `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | учётные данные и отправитель SMTP | пусто |
| `AUTH_CODE_TTL_MINUTES`, `AUTH_SESSION_DAYS` | срок кода и сессии | `10`, `30` |

`SMTP_TLS=starttls` соответствует обычному порту 587, а `implicit` — 465. Без SMTP в development код подтверждения выводится только в журнал FastAPI. В `APP_ENV=production` регистрация возвращает `503`, пока почта не настроена полностью.

## API и сессии

Интерфейс использует относительные `/api` URL и `credentials: 'same-origin'`. Ошибка API имеет форму `{ "error": "сообщение" }`.

| Метод | Путь |
| --- | --- |
| `GET` | `/api/health` |
| `GET` | `/api/assessment/program` |
| `POST` | `/api/assessment/attempts` |
| `GET` | `/api/assessment/attempts/{id}` |
| `POST` | `/api/assessment/attempts/{id}/submit` |
| `POST` | `/api/auth/register/request-code` |
| `POST` | `/api/auth/register/verify` |
| `POST` | `/api/auth/login` |
| `GET` | `/api/auth/me` |
| `POST` | `/api/auth/logout` |
| `DELETE` | `/api/auth/account` |
| `GET`, `PUT`, `DELETE` | `/api/platform/state` |
| `GET` | `/api/directory/options` |
| `GET` | `/api/directory/search` |
| `GET` | `/api/directory/{id}/contacts` |

Сохранены две HttpOnly-cookie с `Path=/api` и `SameSite=Strict`:

| Cookie | Назначение |
| --- | --- |
| `predel_session` | анонимный владелец данных до регистрации |
| `predel_account_session` | сессия подтверждённого аккаунта |

Случайные значения cookie, сессий, кодов и паролей в базе представлены хешами. После регистрации анонимный владелец связывается с аккаунтом, поэтому данные открываются после входа с другого устройства. Выход отзывает серверную сессию и удаляет обе cookie.

Запрос регистрации должен передать актуальную `privacyVersion`; backend хранит версию и UTC-время согласия. Сохранённые анкеты в `/api/platform/state` доступны только для добавления: обновление и удаление существующих ID отклоняются. `DELETE /api/auth/account` удаляет аккаунт, сессии и связанные данные, а также записывает время операции без идентификатора аккаунта.

## Данные FastAPI

SQLAlchemy создаёт следующие таблицы:

| Назначение | Таблицы |
| --- | --- |
| Аккаунты и подтверждение почты | `auth_accounts`, `auth_pending_registrations`, `auth_sessions` |
| Состояние кабинета с версией сохранения | `platform_states` |
| Тесты, токены и результаты | `assessment_attempts` |

Полное состояние кабинета хранится JSON-документом в `platform_states`; проверка `revision` сохраняет ответ `409` при конфликте записи. Каталог складывается из демонстрационного файла и опубликованных профилей из этого состояния. PostgreSQL использует переносимые типы SQLAlchemy; SQLite и PostgreSQL используют одну модель.

Закрытый банк тестов и демонстрационный каталог находятся в `backend/app/data/assessment-bank.json` и `backend/app/data/directory-seed.json`. Они уже входят в репозиторий. Команда `npm run export:fastapi-data` нужна только после осознанного изменения авторских JavaScript-источников этих данных; для чистого checkout её запускать не требуется.

Старый файл `server/data/assessment.sqlite` не является базой FastAPI. Его нельзя подключить как PostgreSQL и нельзя подменять им текущую SQLite-базу без отдельного импорта и проверки данных.

## Эксплуатационные ограничения

- Код регистрации действует ограниченное время и блокируется после пяти неверных попыток.
- Роль `candidate` не ищет каталог и не отправляет приглашения; `employer` не создаёт тест и не изменяет кандидатский профиль.
- Восстановление попытки требует `X-Attempt-Token`; правильные ответы не выдаются API.
- Начальное сохранение личной анкеты требует согласия; контакты скрыты до принятия приглашения.
- FastAPI использует переносимый поиск по тексту профиля и структурным фильтрам. Ответ поиска возвращает предупреждение, что семантическая модель не подключена.
- Ограничители запросов сейчас находятся в памяти процесса FastAPI. При нескольких процессах или экземплярах их нужно вынести в общее хранилище.

Исходные точки реализации: [FastAPI-приложение](../backend/app.py), [конфигурация](../backend/config.py), [модели](../backend/models.py), [Compose PostgreSQL](../docker-compose.yml) и [пример окружения](../.env.example).
