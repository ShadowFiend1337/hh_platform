from __future__ import annotations

import hashlib
import json
import re
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any


class ApiError(Exception):
    """An expected API failure that is safe to return to the browser."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime | None = None) -> str:
    return (value or utcnow()).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def json_size(value: Any) -> int:
    return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


def clone_json(value: Any) -> Any:
    # SQLAlchemy JSON values must not be mutated in place without MutableDict.
    return deepcopy(value)


def is_object(value: Any) -> bool:
    return isinstance(value, dict)


def require_object(value: Any, label: str) -> dict[str, Any]:
    if not is_object(value):
        raise ApiError(400, f"Некорректный объект: {label}.")
    return value


def require_string(value: Any, label: str, maximum: int, *, required: bool = True) -> str:
    if value is None:
        if required:
            raise ApiError(400, f"Укажите {label}.")
        return ""
    if not isinstance(value, str):
        raise ApiError(400, f"Некорректное значение: {label}.")
    result = value.strip()
    if required and not result:
        raise ApiError(400, f"Укажите {label}.")
    if len(result) > maximum:
        raise ApiError(400, f"{label}: допустимо до {maximum} символов.")
    return result


def optional_string(value: Any, label: str, maximum: int) -> str:
    if value is None:
        return ""
    return require_string(value, label, maximum, required=False)


def is_email(value: str) -> bool:
    return bool(re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@.]+", value))


SPECIALIZATIONS = {
    "Frontend", "Backend", "Fullstack", "Mobile", "ML", "DataAnalysis", "DataEngineering",
    "DevOps", "QA", "Security", "UXUI", "BusinessAnalysis", "ProductManagement", "Embedded",
}
GRADES = {"Intern", "Junior", "Middle", "Senior", "Lead"}
INDUSTRIES = {
    "ИТ", "Финансы", "Страхование", "Образование", "Наука", "Здравоохранение", "Фармацевтика",
    "Промышленность", "Энергетика", "Нефть и газ", "Телекоммуникации", "Ритейл", "Электронная коммерция",
    "Транспорт и логистика", "Строительство", "Недвижимость", "Сельское хозяйство", "Государственный сектор",
    "Консалтинг", "Маркетинг и реклама", "Медиа и развлечения", "Туризм и гостеприимство", "Спорт", "НКО", "Другое",
}
FORMATS = {"", "Удалённо", "Гибрид", "Офис"}
EMPLOYMENT_TYPES = {"", "Полная занятость", "Частичная занятость", "Проектная работа", "Стажировка"}
LANGUAGES = {"en", "de", "fr", "es", "zh", "ru"}
LANGUAGE_OPTIONS = [
    {"value": "en", "label": "Английский"}, {"value": "de", "label": "Немецкий"},
    {"value": "fr", "label": "Французский"}, {"value": "es", "label": "Испанский"},
    {"value": "zh", "label": "Китайский"}, {"value": "ru", "label": "Русский"},
]


def public_id(owner: str) -> str:
    return f"user-{owner[:20]}"


def company_id(owner: str) -> str:
    return f"company-{owner[:20]}"
