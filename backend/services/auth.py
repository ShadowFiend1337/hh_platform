from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import secrets
import smtplib
import ssl
import unicodedata
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Any

from sqlalchemy import delete, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.models import Account, AccountDeletionEvent, AuthSession, ConsentEvent, PendingRegistration, PendingRegistrationConsent
from backend.services.common import ApiError, is_email, require_string, sha256, utcnow


AUTH_COOKIE = "predel_account_session"
ANONYMOUS_COOKIE = "predel_session"
CODE_ATTEMPTS = 5
PASSWORD_N = 16_384
PASSWORD_R = 8
PASSWORD_P = 1
PASSWORD_MAXMEM = 64 * 1024 * 1024
LOGGER = logging.getLogger(__name__)
PRIVACY_POLICY_VERSION = "2026-10-08"


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _positive_env(name: str, fallback: int, minimum: int, maximum: int) -> int:
    raw = os.getenv(name, "")
    try:
        parsed = int(raw) if raw else fallback
    except ValueError:
        return fallback
    return parsed if minimum <= parsed <= maximum else fallback


def code_ttl() -> timedelta:
    return timedelta(minutes=_positive_env("AUTH_CODE_TTL_MINUTES", 10, 1, 60))


def session_ttl() -> timedelta:
    return timedelta(days=_positive_env("AUTH_SESSION_DAYS", 30, 1, 90))


def session_max_age() -> int:
    return int(session_ttl().total_seconds())


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def hash_password(value: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(
        value.encode("utf-8"), salt=salt, n=PASSWORD_N, r=PASSWORD_R, p=PASSWORD_P,
        dklen=64, maxmem=PASSWORD_MAXMEM,
    )
    return f"scrypt${PASSWORD_N}${PASSWORD_R}${PASSWORD_P}${_b64(salt)}${_b64(derived)}"


def password_matches(value: str, stored: str) -> bool:
    try:
        algorithm, cost_text, block_text, parallel_text, salt_text, digest_text = stored.split("$")
        cost, block, parallel = int(cost_text), int(block_text), int(parallel_text)
        if algorithm != "scrypt" or not (0 < cost <= 32_768 and 0 < block <= 16 and 0 < parallel <= 4):
            return False
        salt, expected = _unb64(salt_text), _unb64(digest_text)
        if not salt or not expected or _b64(salt) != salt_text or _b64(expected) != digest_text:
            return False
        actual = hashlib.scrypt(
            value.encode("utf-8"), salt=salt, n=cost, r=block, p=parallel,
            dklen=len(expected), maxmem=PASSWORD_MAXMEM,
        )
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError, UnicodeError):
        return False


def normalize_email(value: Any) -> str:
    email = unicodedata.normalize("NFKC", require_string(value, "e-mail", 254)).lower()
    local, separator, domain = email.partition("@")
    if not separator or not local or len(local) > 64 or not domain or not is_email(email):
        raise ApiError(400, "Укажите корректный e-mail.")
    return email


def normalize_login(value: Any) -> tuple[str, str]:
    login = unicodedata.normalize("NFKC", require_string(value, "логин", 32))
    if len(login) < 3 or not login[0].isalnum() or not all(char.isalnum() or char in "._-" for char in login):
        raise ApiError(400, "Логин должен содержать от 3 до 32 букв, цифр, точек, дефисов или подчёркиваний.")
    return login, login.casefold()


def validate_password(value: Any) -> str:
    if not isinstance(value, str):
        raise ApiError(400, "Укажите пароль.")
    if not 8 <= len(value) <= 128 or len(value.encode("utf-8")) > 512:
        raise ApiError(400, "Пароль должен содержать от 8 до 128 символов.")
    return value


def validate_registration(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        raise ApiError(400, "Некорректные данные регистрации.")
    allowed = {"email", "login", "password", "role", "name", "companyName", "consent", "privacyVersion"}
    if set(value) - allowed:
        raise ApiError(400, "Недопустимые поля регистрации.")
    if value.get("consent") is not True:
        raise ApiError(400, "Для регистрации необходимо согласие на обработку данных.")
    if value.get("privacyVersion") != PRIVACY_POLICY_VERSION:
        raise ApiError(400, "Примите актуальную версию политики конфиденциальности.")
    role = value.get("role")
    if role not in {"candidate", "employer"}:
        raise ApiError(400, "Выберите роль: соискатель или работодатель.")
    login, login_normalized = normalize_login(value.get("login"))
    result = {
        "email": normalize_email(value.get("email")), "login": login, "login_normalized": login_normalized,
        "password": validate_password(value.get("password")), "role": role, "name": "", "company_name": "",
    }
    if role == "candidate":
        result["name"] = require_string(value.get("name"), "имя", 100)
        if value.get("companyName") is not None and require_string(value.get("companyName"), "название компании", 160, required=False):
            raise ApiError(400, "Название компании можно указать при регистрации работодателя.")
    else:
        result["company_name"] = require_string(value.get("companyName"), "название компании", 160)
        if value.get("name") is not None and require_string(value.get("name"), "имя", 100, required=False):
            raise ApiError(400, "Имя можно указать при регистрации соискателя.")
    return result


def account_payload(account: Account) -> dict[str, str]:
    return {
        "id": account.id, "email": account.email, "login": account.login, "role": account.role,
        "name": account.name or "", "companyName": account.company_name or "",
    }


def _smtp_settings() -> dict[str, Any]:
    mode = os.getenv("SMTP_TLS", "").strip().lower()
    if mode in {"1", "true", "yes"}:
        mode = "starttls"
    if mode not in {"implicit", "starttls", "none"}:
        mode = "none"
    values = {
        "host": os.getenv("SMTP_HOST", "").strip(), "user": os.getenv("SMTP_USER", "").strip(),
        "password": os.getenv("SMTP_PASSWORD", ""), "from": os.getenv("SMTP_FROM", "").strip(), "tls": mode,
    }
    try:
        values["port"] = int(os.getenv("SMTP_PORT", "465" if mode == "implicit" else "587"))
    except ValueError:
        values["port"] = 465 if mode == "implicit" else 587
    values["supplied"] = any(values[key] for key in ("host", "user", "password", "from"))
    values["valid"] = not values["supplied"] or all(values[key] for key in ("host", "user", "password", "from"))
    return values


def send_registration_email(email: str, code: str, expires_at: datetime) -> str:
    config = _smtp_settings()
    if not config["valid"]:
        raise ApiError(503, "Почтовый сервис настроен не полностью. Попробуйте позже.")
    if not config["supplied"]:
        if any(os.getenv(key, "").strip().lower() == "production" for key in ("APP_ENV", "NODE_ENV")):
            raise ApiError(503, "Почтовый сервис временно недоступен. Попробуйте позже.")
        LOGGER.info("Registration verification code for %s: %s", email, code)
        return "development"
    message = EmailMessage()
    message["From"] = config["from"]
    message["To"] = email
    message["Subject"] = "Код подтверждения Предел"
    message.set_content(
        f"Ваш код подтверждения: {code}\n\n"
        "Он действует ограниченное время. Если вы не регистрировались, проигнорируйте это письмо."
    )
    try:
        if config["tls"] == "implicit":
            client: smtplib.SMTP = smtplib.SMTP_SSL(config["host"], config["port"], timeout=15)
        else:
            client = smtplib.SMTP(config["host"], config["port"], timeout=15)
        with client:
            client.ehlo()
            if config["tls"] == "starttls":
                client.starttls(context=ssl.create_default_context())
                client.ehlo()
            client.login(config["user"], config["password"])
            client.send_message(message)
        return "email"
    except (OSError, smtplib.SMTPException) as error:
        LOGGER.warning("Could not send registration e-mail: %s", error)
        raise ApiError(503, "Не удалось отправить код на e-mail. Попробуйте позже.") from error


def request_registration(session: Session, input_value: Any, platform_owner: str) -> dict[str, Any]:
    if not isinstance(platform_owner, str) or len(platform_owner) != 64 or any(char not in "0123456789abcdef" for char in platform_owner):
        raise ApiError(401, "Сессия недоступна.")
    registration = validate_registration(input_value)
    now = utcnow()
    # A code that can no longer be verified must not reserve its login forever.
    # This runs in the same transaction as the next pending registration, so
    # PostgreSQL and SQLite both enforce the unique login on live requests.
    session.execute(delete(PendingRegistration).where(PendingRegistration.code_expires_at <= now))
    existing = session.scalar(select(Account).where(or_(
        Account.email == registration["email"], Account.login_normalized == registration["login_normalized"],
    )))
    if existing:
        raise ApiError(409, "Этот e-mail или логин уже зарегистрирован.")
    pending_by_login = session.scalar(select(PendingRegistration).where(
        PendingRegistration.login_normalized == registration["login_normalized"],
        PendingRegistration.email != registration["email"],
    ))
    if pending_by_login:
        raise ApiError(409, "Этот логин уже ожидает подтверждения.")
    expires_at = now + code_ttl()
    code = f"{secrets.randbelow(1_000_000):06d}"
    pending = session.get(PendingRegistration, registration["email"])
    values = {
        **registration, "password_hash": hash_password(registration["password"]), "platform_owner": secrets.token_hex(32),
        "code_hash": sha256(code), "code_expires_at": expires_at, "attempts": 0, "updated_at": now,
    }
    values.pop("password")
    if pending is None:
        pending = PendingRegistration(**values, created_at=now)
        session.add(pending)
    else:
        for key, item in values.items():
            setattr(pending, key, item)
    try:
        session.flush()
        consent = session.get(PendingRegistrationConsent, registration["email"])
        if consent is None:
            consent = PendingRegistrationConsent(
                email=registration["email"], policy_version=PRIVACY_POLICY_VERSION, accepted_at=now,
            )
            session.add(consent)
        else:
            consent.policy_version = PRIVACY_POLICY_VERSION
            consent.accepted_at = now
        session.commit()
    except IntegrityError as error:
        # A repeated click can race with another registration request.  The
        # database remains authoritative, and the browser gets a recoverable
        # conflict instead of a generic 500 response.
        session.rollback()
        raise ApiError(409, "Этот e-mail или логин уже ожидает подтверждения.") from error
    delivery = send_registration_email(registration["email"], code, expires_at)
    return {"email": registration["email"], "expiresAt": expires_at.isoformat().replace("+00:00", "Z"), "delivery": delivery}


def verify_registration(session: Session, value: Any) -> Account:
    if not isinstance(value, dict) or set(value) - {"email", "code"}:
        raise ApiError(400, "Некорректные данные подтверждения.")
    email = normalize_email(value.get("email"))
    code = value.get("code")
    if not isinstance(code, str) or not code.isdecimal() or len(code) != 6:
        raise ApiError(400, "Введите шестизначный код.")
    pending = session.get(PendingRegistration, email)
    if pending is None:
        raise ApiError(400, "Код истёк. Запросите новый.")
    now = utcnow()
    pending_consent = session.get(PendingRegistrationConsent, email)
    if pending_consent is None or pending_consent.policy_version != PRIVACY_POLICY_VERSION:
        raise ApiError(409, "Примите актуальную политику конфиденциальности и запросите новый код.")
    if _aware(pending.code_expires_at) <= now:
        session.delete(pending)
        session.commit()
        raise ApiError(400, "Код истёк. Запросите новый.")
    if not hmac.compare_digest(sha256(code), pending.code_hash):
        pending.attempts += 1
        if pending.attempts >= CODE_ATTEMPTS:
            session.delete(pending)
            session.commit()
            raise ApiError(429, "Слишком много неверных попыток. Запросите новый код.")
        pending.updated_at = now
        session.commit()
        raise ApiError(400, "Неверный код.")
    existing = session.scalar(select(Account).where(or_(
        Account.email == pending.email, Account.login_normalized == pending.login_normalized,
        Account.platform_owner == pending.platform_owner,
    )))
    if existing:
        raise ApiError(409, "Этот e-mail или логин уже зарегистрирован.")
    account = Account(
        id=secrets.token_hex(16), email=pending.email, login=pending.login, login_normalized=pending.login_normalized,
        role=pending.role, name=pending.name, company_name=pending.company_name, password_hash=pending.password_hash,
        platform_owner=pending.platform_owner, created_at=now, updated_at=now,
    )
    session.add(account)
    try:
        session.flush()
        session.add(ConsentEvent(
            id=secrets.token_hex(16), owner=account.platform_owner, account_id=account.id,
            policy_version=pending_consent.policy_version,
            scope="registration", action="accepted", occurred_at=_aware(pending_consent.accepted_at),
        ))
        session.delete(pending)
        session.commit()
    except IntegrityError as error:
        # Two tabs can submit the same code at once.  Only one account may be
        # created; the other request is a normal registration conflict.
        session.rollback()
        raise ApiError(409, "Этот e-mail или логин уже зарегистрирован.") from error
    return account


def login(session: Session, value: Any) -> Account:
    if not isinstance(value, dict):
        raise ApiError(400, "Некорректные данные входа.")
    allowed = {"loginOrEmail", "login", "email", "password"}
    if set(value) - allowed:
        raise ApiError(400, "Недопустимые поля входа.")
    supplied = [value[key] for key in ("loginOrEmail", "login", "email") if key in value]
    if len(supplied) != 1 or not isinstance(supplied[0], str):
        raise ApiError(400, "Укажите логин или e-mail.")
    identifier = unicodedata.normalize("NFKC", supplied[0]).strip()
    if not identifier or len(identifier) > 254:
        raise ApiError(400, "Укажите логин или e-mail.")
    normalized = identifier.lower() if "@" in identifier else identifier.casefold()
    password = validate_password(value.get("password"))
    account = session.scalar(select(Account).where(or_(Account.email == normalized, Account.login_normalized == normalized)))
    if account is None or not password_matches(password, account.password_hash):
        raise ApiError(401, "Неверный логин, e-mail или пароль.")
    return account


def create_session(session: Session, account: Account) -> tuple[str, dict[str, str]]:
    now, expires_at = utcnow(), utcnow() + session_ttl()
    session.execute(delete(AuthSession).where(AuthSession.expires_at <= now))
    token = secrets.token_hex(32)
    session.add(AuthSession(token_hash=sha256(token), account_id=account.id, created_at=now, expires_at=expires_at))
    session.commit()
    return token, account_payload(account)


def account_for_token(session: Session, token: Any) -> Account | None:
    if not isinstance(token, str) or len(token) != 64 or any(char not in "0123456789abcdef" for char in token):
        return None
    now = utcnow()
    session.execute(delete(AuthSession).where(AuthSession.expires_at <= now))
    account_session = session.scalar(select(AuthSession).where(AuthSession.token_hash == sha256(token), AuthSession.expires_at > now))
    if not account_session:
        session.commit()
        return None
    # Release SQLite's write transaction before an auth endpoint opens its
    # separate worker session for scrypt/SMTP work. `expire_on_commit=False`
    # keeps the already loaded account usable after this commit.
    account = account_session.account
    session.commit()
    return account


def cleanup_expired_registrations(session: Session) -> None:
    """Remove pending registration data as soon as a later API request arrives."""

    deleted = session.execute(delete(PendingRegistration).where(PendingRegistration.code_expires_at <= utcnow()))
    if deleted.rowcount:
        session.commit()


def account_for_owner(session: Session, owner: str) -> Account | None:
    return session.scalar(select(Account).where(Account.platform_owner == owner))


def revoke_token(session: Session, token: Any) -> None:
    if isinstance(token, str) and len(token) == 64 and all(char in "0123456789abcdef" for char in token):
        session.execute(delete(AuthSession).where(AuthSession.token_hash == sha256(token)))
        session.commit()


def delete_account(session: Session, account_id: str) -> datetime:
    """Remove an account and write only an unlinked deletion timestamp."""

    account = session.get(Account, account_id)
    if account is None:
        raise ApiError(401, "Войдите в аккаунт.")
    deleted_at = utcnow()
    session.add(AccountDeletionEvent(id=secrets.token_hex(16), deleted_at=deleted_at))
    session.delete(account)
    session.commit()
    return deleted_at
