from __future__ import annotations

import json
import re
from copy import deepcopy
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import Account, PlatformState
from backend.services.resume_structure import resume_sections, pet_projects_text, work_history_text
from backend.services.common import (
    ApiError, EMPLOYMENT_TYPES, FORMATS, GRADES, INDUSTRIES, LANGUAGES, LANGUAGE_OPTIONS,
    SPECIALIZATIONS, clone_json, company_id, public_id,
)


_SEED_PATH = Path(__file__).resolve().parents[1] / "app" / "data" / "directory-seed.json"
CONTACT_PATTERN = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+?\d[\d ()-]{8,}\d)")
DEFAULT_FILTERS: dict[str, Any] = {
    "specialization": "", "grade": "", "format": "", "stack": [], "fsp": False, "city": "",
    "industry": "", "salaryMax": None, "experienceMin": None, "experienceMax": None,
    "employmentType": "", "language": "", "hasPortfolio": False, "minScore": None,
}


def _load_seed() -> list[dict[str, Any]]:
    try:
        with _SEED_PATH.open(encoding="utf-8") as source:
            values = json.load(source)
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Не удалось загрузить демонстрационный каталог: {error}") from error
    if not isinstance(values, list) or not all(isinstance(item, dict) for item in values):
        raise RuntimeError("Некорректный переносимый каталог кандидатов.")
    return values


SEED_CANDIDATES = _load_seed()


def _scrub(value: Any) -> str:
    return CONTACT_PATTERN.sub("[контакт скрыт]", str(value or ""))


def public_candidate(person: dict[str, Any], candidate_id: str | None = None) -> dict[str, Any]:
    allowed = (
        "name", "specialization", "desiredGrade", "confirmed", "gradeChangedAt", "stack", "industry",
        "professionalRole", "surveyCompletedAt", "experience", "city", "format", "bio", "careerAchievements",
        "education", "workHistory", "portfolio", "languages", "achievements", "visible", "consent",
        "salaryFrom", "salaryTo", "experienceMonths", "employmentType", "availableFrom", "languageCodes", "synthetic",
    )
    result = {key: clone_json(person[key]) for key in allowed if key in person}
    sections = resume_sections(person)
    result["workExperiences"] = [{key: _scrub(value) for key, value in entry.items()} for entry in sections["workExperiences"]]
    result["petProjects"] = [{"name": _scrub(entry["name"]), "description": _scrub(entry["description"]), "stack": [_scrub(skill) for skill in entry["stack"]]} for entry in sections["petProjects"]]
    result["achievementItems"] = [_scrub(item) for item in sections["achievementItems"]]
    result["interests"] = [_scrub(item) for item in sections["interests"]]
    for key in ("name", "professionalRole", "experience", "city", "format", "bio", "careerAchievements", "education", "workHistory", "languages"):
        if result.get(key):
            result[key] = _scrub(result[key])
    if isinstance(result.get("stack"), list):
        result["stack"] = [_scrub(value) for value in result["stack"]]
    result.update({"id": candidate_id or str(person.get("id", "")), "email": "", "phone": "", "portfolio": "", "fspId": "", "softSkills": [_scrub(skill) for skill in person.get("softSkills", []) if isinstance(skill, str)]})
    return result


def _dynamic_candidates(session: Session) -> list[dict[str, Any]]:
    values: list[dict[str, Any]] = []
    for row in session.scalars(select(PlatformState).join(Account, Account.platform_owner == PlatformState.owner)
                               .where(Account.role == "candidate")).all():
        state = row.state if isinstance(row.state, dict) else {}
        profile = state.get("profile") if isinstance(state.get("profile"), dict) else {}
        confirmed = profile.get("confirmed") if isinstance(profile.get("confirmed"), dict) else None
        eligible = bool(
            profile.get("synthetic") is not True
            and profile.get("visible") is True and profile.get("consent") is True and profile.get("name")
            and profile.get("email") and profile.get("professionalRole") and profile.get("stack")
            and confirmed and confirmed.get("score", 0) >= 70
        )
        if eligible:
            value = deepcopy(profile)
            value["id"] = public_id(row.owner)
            value["_owner"] = row.owner
            values.append(value)
    return values


def candidates(session: Session) -> list[dict[str, Any]]:
    return _dynamic_candidates(session)


def options(session: Session) -> dict[str, Any]:
    values = candidates(session)
    return {
        "cities": sorted({_scrub(item.get("city")) for item in values if item.get("city")}),
        "industries": sorted({str(item.get("industry")) for item in values if item.get("industry")}),
        "languages": LANGUAGE_OPTIONS,
        "employmentTypes": sorted({str(item.get("employmentType")) for item in values if item.get("employmentType")}),
    }


def _integer(value: Any, maximum: int) -> int | None:
    if value is None:
        return None
    return value if isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= maximum else None


def normalize_filters(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) - set(DEFAULT_FILTERS):
        raise ApiError(400, "Некорректные фильтры.")
    result = deepcopy(DEFAULT_FILTERS)
    for key in ("specialization", "grade", "format", "city", "industry", "employmentType", "language"):
        item = value.get(key, "")
        if not isinstance(item, str) or len(item) > 100:
            raise ApiError(400, "Некорректный текстовый фильтр.")
        result[key] = item.strip()
    for key in ("fsp", "hasPortfolio"):
        item = value.get(key, False)
        if not isinstance(item, bool):
            raise ApiError(400, "Некорректный переключатель фильтра.")
        result[key] = item
    stack = value.get("stack", [])
    if not isinstance(stack, list) or len(stack) > 100 or any(not isinstance(item, str) or not item.strip() or len(item) > 80 for item in stack):
        raise ApiError(400, "Некорректный фильтр навыков.")
    result["stack"] = list(dict.fromkeys(item.strip() for item in stack))
    for key, maximum in (("salaryMax", 10_000_000), ("experienceMin", 1200), ("experienceMax", 1200), ("minScore", 100)):
        item = value.get(key)
        if item is not None and _integer(item, maximum) is None:
            raise ApiError(400, "Числовые фильтры должны быть неотрицательными целыми числами.")
        result[key] = _integer(item, maximum)
    if result["specialization"] and result["specialization"] not in SPECIALIZATIONS:
        raise ApiError(400, "Неизвестная специализация фильтра.")
    if result["grade"] and result["grade"] not in GRADES:
        raise ApiError(400, "Неизвестный грейд фильтра.")
    if result["industry"] and result["industry"] not in INDUSTRIES:
        raise ApiError(400, "Неизвестная отрасль фильтра.")
    if result["format"] not in FORMATS or result["employmentType"] not in EMPLOYMENT_TYPES or result["language"] not in LANGUAGES | {""}:
        raise ApiError(400, "Некорректный фильтр.")
    if result["experienceMin"] is not None and result["experienceMax"] is not None and result["experienceMin"] > result["experienceMax"]:
        raise ApiError(400, "Проверьте диапазон стажа.")
    return result


def _matches(item: dict[str, Any], filters: dict[str, Any]) -> bool:
    confirmed = item.get("confirmed") if isinstance(item.get("confirmed"), dict) else {}
    specialization = confirmed.get("specialization") or item.get("specialization")
    grade = confirmed.get("grade") or item.get("desiredGrade")
    if filters["specialization"] and specialization != filters["specialization"]:
        return False
    if filters["grade"] and grade != filters["grade"]:
        return False
    for key in ("format", "city", "industry", "employmentType"):
        if filters[key] and item.get(key) != filters[key]:
            return False
    if filters["stack"] and not set(filters["stack"]).issubset(set(item.get("stack") or [])):
        return False
    if filters["fsp"] and not (item.get("fspId") or item.get("achievements")):
        return False
    if filters["salaryMax"] is not None and (not isinstance(item.get("salaryFrom"), int) or item["salaryFrom"] > filters["salaryMax"]):
        return False
    months = item.get("experienceMonths")
    if filters["experienceMin"] is not None and (not isinstance(months, int) or months < filters["experienceMin"]):
        return False
    if filters["experienceMax"] is not None and (not isinstance(months, int) or months > filters["experienceMax"]):
        return False
    if filters["language"] and filters["language"] not in (item.get("languageCodes") or []):
        return False
    if filters["hasPortfolio"] and not item.get("portfolio"):
        return False
    if filters["minScore"] is not None and (not isinstance(confirmed.get("score"), int) or confirmed["score"] < filters["minScore"]):
        return False
    return True


def _query_score(person: dict[str, Any], query: str) -> int:
    if not query:
        return 0
    sections = resume_sections(person)
    narrative = [work_history_text(sections["workExperiences"]), pet_projects_text(sections["petProjects"]),
                 "\n".join(sections["achievementItems"]), "\n".join(sections["interests"])]
    haystack = " ".join(_scrub(part) for part in [*narrative, *(str(person.get(key, "")) for key in (
        "name", "specialization", "desiredGrade", "professionalRole", "stack", "bio", "workHistory", "city", "industry",
    ))]).casefold()
    return sum(haystack.count(token) for token in re.findall(r"[\wа-яё+#.-]+", query.casefold()))


def search(session: Session, query: str, raw_filters: Any, *, owner: str | None, limit: int, offset: int) -> dict[str, Any]:
    if not isinstance(query, str) or len(query) > 1200:
        raise ApiError(400, "Некорректный поисковый запрос.")
    if not isinstance(limit, int) or not 1 <= limit <= 100 or not isinstance(offset, int) or offset < 0:
        raise ApiError(400, "Некорректный диапазон поиска.")
    filters = normalize_filters(raw_filters)
    selected = [item for item in candidates(session) if _matches(item, filters)]
    ranked = sorted(selected, key=lambda item: (
        -_query_score(item, query),
        -(item.get("confirmed", {}).get("score", 0) if isinstance(item.get("confirmed"), dict) else 0),
        str(item.get("name", "")),
    ))
    window = ranked[offset:offset + limit]
    items = []
    for index, person in enumerate(window, start=offset + 1):
        score = _query_score(person, query)
        items.append({
            "person": public_candidate(person), "rank": index,
            "reason": "Совпадение по запросу и фильтрам." if score else "Подходит по заданным фильтрам.",
            "semanticScore": None,
        })
    return {
        "items": items, "total": len(ranked), "offset": offset, "limit": limit, "query": query,
        "interpreted": {}, "effectiveFilters": filters,
        "model": {"status": "unavailable", "name": "local-filter", "version": "portable-v1", "dimension": 0, "trained": False},
        "warnings": ["Семантическая модель не подключена: используется поиск по профилям и фильтрам."],
    }


def candidate_by_id(session: Session, candidate_id: str) -> dict[str, Any] | None:
    return next((item for item in candidates(session) if item.get("id") == candidate_id), None)


def candidate_owner(session: Session, candidate_id: str) -> str | None:
    item = candidate_by_id(session, candidate_id)
    return str(item["_owner"]) if item and item.get("_owner") else None


def account_profile(session: Session, owner: str) -> dict[str, Any] | None:
    row = session.get(PlatformState, owner)
    if not row or not isinstance(row.state, dict):
        return None
    profile = row.state.get("profile")
    return deepcopy(profile) if isinstance(profile, dict) else None
