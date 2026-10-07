from __future__ import annotations

import json
import logging
import math
import os
import secrets
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Any

from fastapi import Depends, FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.database import SessionLocal, dispose_database, get_session, init_database
from backend.services import assessment, auth, directory, platform
from backend.services.common import ApiError, clone_json, sha256


LOGGER = logging.getLogger(__name__)
ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "frontend" / "dist"
SECURE_COOKIE = os.getenv("COOKIE_SECURE", "").strip() == "1"
STATIC_MIME = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2",
    ".webp": "image/webp", ".ico": "image/x-icon", ".wasm": "application/wasm",
    ".gz": "application/gzip", ".bcmap": "application/octet-stream", ".ttf": "font/ttf",
    ".pfb": "application/octet-stream", ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
}


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_database()
    yield
    dispose_database()


app = FastAPI(title="Предел API", version="2.0", lifespan=lifespan)

_web_origin = os.getenv("WEB_ORIGIN", "").strip()
_local_origins = {
    "http://127.0.0.1:5173", "http://127.0.0.1:4173", "http://localhost:5173", "http://localhost:4173",
    f"http://{os.getenv('HOST', '127.0.0.1')}:{os.getenv('PORT', '8787')}",
}
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted({_web_origin, *_local_origins} - {""}),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Attempt-Token"],
)


@app.middleware("http")
async def api_cache_control(request: Request, call_next: Any) -> Response:
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(ApiError)
async def api_error_handler(_: Request, error: ApiError) -> JSONResponse:
    return JSONResponse(status_code=error.status, content={"error": error.message}, headers={"Cache-Control": "no-store"})


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, __: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"error": "Некорректный JSON."}, headers={"Cache-Control": "no-store"})


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(_: Request, error: StarletteHTTPException) -> JSONResponse:
    detail = "Метод не поддерживается." if error.status_code == 405 else (
        error.detail if isinstance(error.detail, str) else "Страница не найдена."
    )
    return JSONResponse(status_code=error.status_code, content={"error": detail}, headers={"Cache-Control": "no-store"})


@app.exception_handler(Exception)
async def unexpected_error_handler(_: Request, error: Exception) -> JSONResponse:
    LOGGER.exception("Unhandled API error", exc_info=error)
    return JSONResponse(status_code=500, content={"error": "Сервис временно недоступен. Попробуйте снова."}, headers={"Cache-Control": "no-store"})


class RateLimiter:
    def __init__(self) -> None:
        self._values: dict[str, tuple[int, float]] = {}
        self._lock = Lock()

    def check(self, key: str, maximum: int, period: float) -> None:
        now = time.monotonic()
        with self._lock:
            if len(self._values) > 5_000:
                self._values = {entry: value for entry, value in self._values.items() if value[1] > now}
            count, until = self._values.get(key, (0, now + period))
            if until <= now:
                count, until = 0, now + period
            count += 1
            self._values[key] = (count, until)
        if count > maximum:
            raise ApiError(429, "Слишком много запросов. Попробуйте позже.")


LIMITS = RateLimiter()


@dataclass(slots=True)
class Identity:
    owner: str
    account: dict[str, str] | None
    auth_token: str | None


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _set_cookie(response: Response, key: str, value: str, max_age: int) -> None:
    response.set_cookie(
        key=key, value=value, max_age=max_age, path="/api", httponly=True, samesite="strict", secure=SECURE_COOKIE,
    )


def _delete_cookie(response: Response, key: str) -> None:
    response.delete_cookie(key=key, path="/api", httponly=True, samesite="strict", secure=SECURE_COOKIE)


def resolve_identity(request: Request, response: Response, session: Session) -> Identity:
    auth_token = request.cookies.get(auth.AUTH_COOKIE)
    account = auth.account_for_token(session, auth_token)
    if account is not None:
        return Identity(owner=account.platform_owner, account=auth.account_payload(account), auth_token=auth_token)
    supplied = request.cookies.get(auth.ANONYMOUS_COOKIE)
    if isinstance(supplied, str) and len(supplied) == 64 and all(character in "0123456789abcdef" for character in supplied):
        owner = sha256(supplied)
        if auth.account_for_owner(session, owner) is None:
            return Identity(owner=owner, account=None, auth_token=None)
        _delete_cookie(response, auth.ANONYMOUS_COOKIE)
    anonymous_token = secrets.token_hex(32)
    _set_cookie(response, auth.ANONYMOUS_COOKIE, anonymous_token, 30 * 24 * 60 * 60)
    return Identity(owner=sha256(anonymous_token), account=None, auth_token=None)


def _request_registration_in_worker(body: dict[str, Any], owner: str) -> dict[str, Any]:
    # SMTP and scrypt are synchronous by design. Give them a dedicated session
    # and worker thread so a slow mail relay cannot block the ASGI event loop.
    with SessionLocal() as worker:
        return auth.request_registration(worker, body, owner)


def _verify_registration_in_worker(body: dict[str, Any]) -> tuple[str, dict[str, str]]:
    with SessionLocal() as worker:
        account = auth.verify_registration(worker, body)
        return auth.create_session(worker, account)


def _login_in_worker(body: dict[str, Any]) -> tuple[str, dict[str, str]]:
    with SessionLocal() as worker:
        account = auth.login(worker, body)
        return auth.create_session(worker, account)


async def json_object(request: Request, maximum: int = 20_000) -> dict[str, Any]:
    if not request.headers.get("content-type", "").lower().startswith("application/json"):
        raise ApiError(415, "Ожидается JSON.")
    try:
        declared_length = int(request.headers.get("content-length", "0"))
    except ValueError:
        declared_length = 0
    if declared_length > maximum:
        raise ApiError(413, "Запрос слишком большой.")
    raw = await request.body()
    if len(raw) > maximum:
        raise ApiError(413, "Запрос слишком большой.")
    def reject_non_finite(_: str) -> None:
        raise ValueError("JSON numbers must be finite")
    def finite_float(value: str) -> float:
        parsed = float(value)
        if not math.isfinite(parsed):
            raise ValueError("JSON numbers must be finite")
        return parsed
    try:
        value = json.loads(raw, parse_constant=reject_non_finite, parse_float=finite_float)
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        raise ApiError(400, "Некорректный JSON.") from error
    if not isinstance(value, dict):
        raise ApiError(400, "Некорректный JSON.")
    return value


def api_guard(request: Request) -> None:
    LIMITS.check(f"requests:{_client_key(request)}", 180, 60)
    origin = request.headers.get("origin")
    if not origin:
        return
    allowed = {_web_origin, *_local_origins, f"{request.url.scheme}://{request.headers.get('host', '')}"} - {""}
    if origin not in allowed:
        raise ApiError(403, "Источник запроса не разрешён.")


def _identity(request: Request, response: Response, session: Session) -> Identity:
    api_guard(request)
    return resolve_identity(request, response, session)


@app.get("/api/health")
def health(request: Request) -> dict[str, str]:
    api_guard(request)
    return {"status": "ok"}


@app.get("/api/assessment/program")
def assessment_program(request: Request, specialization: str | None = None, grade: str | None = None) -> dict[str, Any]:
    api_guard(request)
    return assessment.program_info(specialization, grade)


@app.post("/api/auth/register/request-code", status_code=202)
async def request_code(request: Request, response: Response, session: Session = Depends(get_session)) -> dict[str, Any]:
    identity = _identity(request, response, session)
    LIMITS.check(f"auth-code-ip:{_client_key(request)}", 12, 600)
    body = await json_object(request)
    email = body.get("email")
    if isinstance(email, str) and email.strip():
        LIMITS.check(f"auth-code-email:{email.strip().casefold()}", 4, 600)
    result = await run_in_threadpool(_request_registration_in_worker, body, identity.owner)
    return {"status": "code_sent", **result}


@app.post("/api/auth/register/verify", status_code=201)
async def verify_code(request: Request, response: Response, session: Session = Depends(get_session)) -> dict[str, Any]:
    _identity(request, response, session)
    LIMITS.check(f"auth-verify-ip:{_client_key(request)}", 20, 600)
    token, payload = await run_in_threadpool(_verify_registration_in_worker, await json_object(request))
    _set_cookie(response, auth.AUTH_COOKIE, token, auth.session_max_age())
    return {"account": payload}


@app.post("/api/auth/login")
async def login(request: Request, response: Response, session: Session = Depends(get_session)) -> dict[str, Any]:
    _identity(request, response, session)
    LIMITS.check(f"auth-login-ip:{_client_key(request)}", 20, 600)
    token, payload = await run_in_threadpool(_login_in_worker, await json_object(request))
    _set_cookie(response, auth.AUTH_COOKIE, token, auth.session_max_age())
    return {"account": payload}


@app.get("/api/auth/me")
def auth_me(request: Request, response: Response, session: Session = Depends(get_session)) -> dict[str, Any]:
    identity = _identity(request, response, session)
    if identity.account is None:
        raise ApiError(401, "Войдите в аккаунт.")
    return {"account": identity.account}


@app.post("/api/auth/logout")
def logout(request: Request, response: Response, session: Session = Depends(get_session)) -> dict[str, str]:
    identity = _identity(request, response, session)
    auth.revoke_token(session, identity.auth_token)
    _delete_cookie(response, auth.AUTH_COOKIE)
    _delete_cookie(response, auth.ANONYMOUS_COOKIE)
    return {"status": "signed_out"}


@app.get("/api/platform/state")
def platform_read(request: Request, response: Response, session: Session = Depends(get_session)) -> dict[str, Any]:
    identity = _identity(request, response, session)
    return platform.read(session, identity.owner)


@app.put("/api/platform/state")
async def platform_save(request: Request, response: Response, session: Session = Depends(get_session)) -> dict[str, Any]:
    identity = _identity(request, response, session)
    body = await json_object(request, 1_000_000)
    if set(body) - {"state", "baseRevision"}:
        raise ApiError(400, "Недопустимые поля запроса.")
    return platform.save(session, identity.owner, body.get("state"), body.get("baseRevision"), identity.account.get("role") if identity.account else None)


@app.delete("/api/platform/state")
def platform_delete(request: Request, response: Response, session: Session = Depends(get_session)) -> dict[str, Any]:
    identity = _identity(request, response, session)
    return platform.delete(session, identity.owner)


@app.get("/api/directory/options")
def directory_options(request: Request, response: Response, session: Session = Depends(get_session)) -> dict[str, Any]:
    _identity(request, response, session)
    return directory.options(session)


@app.get("/api/directory/search")
def directory_search(
    request: Request, response: Response, q: str = "", filters: str = "{}", limit: int = 30, offset: int = 0,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    identity = _identity(request, response, session)
    if identity.account and identity.account.get("role") == "candidate":
        raise ApiError(403, "Поиск кандидатов доступен работодателю.")
    try:
        filter_value = json.loads(filters)
    except json.JSONDecodeError as error:
        raise ApiError(400, "Некорректные фильтры.") from error
    return directory.search(session, q, filter_value, owner=identity.owner, limit=limit, offset=offset)


@app.get("/api/directory/{candidate_id}/contacts")
def candidate_contacts(request: Request, response: Response, candidate_id: str, session: Session = Depends(get_session)) -> dict[str, str]:
    identity = _identity(request, response, session)
    return platform.contacts(session, identity.owner, candidate_id)


@app.post("/api/assessment/attempts", status_code=201)
async def assessment_create(request: Request, response: Response, session: Session = Depends(get_session)) -> dict[str, Any]:
    identity = _identity(request, response, session)
    if identity.account and identity.account.get("role") == "employer":
        raise ApiError(403, "Тестирование доступно соискателю.")
    LIMITS.check(f"starts:{_client_key(request)}", 40, 3600)
    if assessment.starts_in_last_hour(session, identity.owner) >= 20:
        raise ApiError(429, "Слишком много попыток. Попробуйте позже.")
    body = await json_object(request)
    if set(body) - {"survey", "vacancyDescription"}:
        raise ApiError(400, "Недопустимые поля запроса.")
    attempt, token = assessment.create_attempt(session, identity.owner, body.get("survey"), body.get("vacancyDescription", ""))
    return {**attempt, "token": token}


@app.get("/api/assessment/attempts/{attempt_id}")
def assessment_resume(request: Request, response: Response, attempt_id: str, session: Session = Depends(get_session)) -> dict[str, Any]:
    identity = _identity(request, response, session)
    return assessment.get_attempt(session, identity.owner, attempt_id, request.headers.get("x-attempt-token"))


@app.post("/api/assessment/attempts/{attempt_id}/submit")
async def assessment_submit(request: Request, response: Response, attempt_id: str, session: Session = Depends(get_session)) -> dict[str, Any]:
    identity = _identity(request, response, session)
    body = await json_object(request)
    if set(body) - {"token", "answers"}:
        raise ApiError(400, "Недопустимые поля ответа.")
    return assessment.submit_attempt(session, identity.owner, attempt_id, body.get("token"), body.get("answers"))


def _spa_response(path: str) -> Response:
    if not DIST.exists():
        raise ApiError(404, "Страница не найдена.")
    if path in {"", "app", "auth", "privacy"}:
        asset = DIST / "index.html"
    else:
        asset = (DIST / path).resolve()
        try:
            asset.relative_to(DIST.resolve())
        except ValueError as error:
            raise ApiError(404, "Страница не найдена.") from error
    if not asset.is_file():
        raise ApiError(404, "Страница не найдена.")
    media_type = STATIC_MIME.get(asset.suffix)
    if media_type is None:
        raise ApiError(404, "Страница не найдена.")
    headers = {"Cache-Control": "no-cache" if asset.suffix == ".html" or path.startswith("resume-assets/") else "public, max-age=3600"}
    return FileResponse(asset, media_type=media_type, headers=headers)


@app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
def spa(path: str) -> Response:
    if path == "api" or path.startswith("api/"):
        raise ApiError(404, "Страница не найдена.")
    return _spa_response(path)
