from __future__ import annotations

import re
from typing import Any

from backend.services.common import ApiError

MAX_SOFT_SKILLS = 30


def _legacy_work_history(source: Any) -> str:
    if not isinstance(source, str):
        return ""
    history = source.strip()[:20000]
    lines = history.split("\n")
    heading = next((index for index, line in enumerate(lines) if re.match(r"^(?:pet[- ]?проект(?:ы)?|пет[- ]?проект(?:ы)?|личные проекты|учебные проекты|pet projects?|personal projects|side projects)\s*:?[ \t]*$", line.strip(), re.I)), None)
    return "\n".join(lines[:heading]).strip() if heading is not None else history


def _legacy_work_entries(history: str) -> list[dict[str, str]]:
    entries = []
    rest = history
    while rest:
        edge = rest.rfind("\n", 0, 4001) if len(rest) > 4000 else len(rest)
        end = edge if edge > 0 else min(len(rest), 4000)
        entries.append({"period": "", "company": "", "tasks": rest[:end]})
        rest = rest[end:].removeprefix("\n")
    return entries


def work_history_text(entries: list[dict[str, Any]], legacy_source: Any = None) -> str:
    history = _legacy_work_history(legacy_source)
    if history and entries == _legacy_work_entries(history):
        return history
    return "\n\n".join("\n".join(entry[key] for key in ("company", "period", "tasks") if entry.get(key)) for entry in entries if any(entry.get(key) for key in ("company", "period", "tasks")))


def pet_projects_text(entries: list[dict[str, Any]]) -> str:
    result = []
    for entry in entries:
        values = [entry.get("name", ""), entry.get("description", "")]
        if entry.get("stack"):
            values.append("Стек: " + ", ".join(entry["stack"]))
        if any(values):
            result.append("\n".join(value for value in values if value))
    return "\n\n".join(result)


def _text(value: Any, maximum: int, field: str) -> str:
    if not isinstance(value, str) or len(value) > maximum:
        raise ApiError(400, f"{field}: допустимо до {maximum} символов.")
    return value.strip()


def _list(value: Any, maximum: int, field: str) -> list[Any]:
    if not isinstance(value, list) or len(value) > maximum:
        raise ApiError(400, f"Некорректный список: {field}.")
    return value


def _object(value: Any, keys: set[str], field: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) - keys:
        raise ApiError(400, f"Некорректный объект: {field}.")
    return value


def validate_resume_fields(value: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    if "workHistory" in value:
        _text(value["workHistory"], 20000, "История работы")
    if "careerAchievements" in value:
        _text(value["careerAchievements"], 4000, "Достижения")
    if "workExperiences" in value:
        entries = []
        for raw in _list(value["workExperiences"], 30, "Опыт работы"):
            entry = _object(raw, {"period", "company", "tasks"}, "Опыт работы")
            entries.append({key: _text(entry.get(key), maximum, key) for key, maximum in (("period", 100), ("company", 200), ("tasks", 4000))})
        result["workExperiences"] = entries
        result["workHistory"] = work_history_text(entries, value.get("workHistory"))
    else:
        result["workHistory"] = _text(value.get("workHistory", ""), 20000, "История работы")
    if len(result["workHistory"]) > 20000:
        raise ApiError(400, "История работы: допустимо до 20000 символов.")
    if "petProjects" in value:
        projects = []
        for raw in _list(value["petProjects"], 30, "Pet-проекты"):
            entry = _object(raw, {"name", "description", "stack"}, "Pet-проект")
            stack = list(dict.fromkeys(_text(skill, 80, "Навык проекта") for skill in _list(entry.get("stack"), 100, "Стек проекта")))
            projects.append({"name": _text(entry.get("name"), 200, "Название проекта"), "description": _text(entry.get("description"), 4000, "Описание проекта"), "stack": [skill for skill in stack if skill]})
        if len(pet_projects_text(projects)) > 20000:
            raise ApiError(400, "Pet-проекты: допустимо до 20000 символов.")
        result["petProjects"] = projects
    for field in ("achievementItems", "interests"):
        if field in value:
            items = list(dict.fromkeys(_text(item, 4000, field) for item in _list(value[field], 50, field)))
            result[field] = [item for item in items if item]
            if len("\n".join(result[field])) > 4000:
                raise ApiError(400, f"{field}: допустимо до 4000 символов.")
    result["careerAchievements"] = "\n".join(result["achievementItems"]) if "achievementItems" in result else _text(value.get("careerAchievements", ""), 4000, "Достижения")
    return result


def validate_soft_skills(value: Any) -> list[str]:
    return [skill for skill in dict.fromkeys(_text(skill, 80, "Софт-скиллы") for skill in _list(value, MAX_SOFT_SKILLS, "Софт-скиллы")) if skill]


def validate_resume_metadata(value: dict[str, Any]) -> dict[str, Any]:
    return {key: item for key, item in validate_resume_fields(value).items()
            if key in value or key == "workHistory" and "workExperiences" in value
            or key == "careerAchievements" and "achievementItems" in value}


def resume_sections(value: dict[str, Any]) -> dict[str, Any]:
    """Read old text as editable sections without changing immutable snapshots."""
    def safe_text(item: Any, maximum: int) -> str:
        return item.strip()[:maximum] if isinstance(item, str) else ""

    def list_items(lines: list[str]) -> list[str]:
        result: list[str] = []
        bullet = False
        for raw in lines:
            line = raw.strip()
            if not line:
                continue
            marked = re.match(r"^(?:[•*·▪●–—-]|\d+[.)])\s*", line)
            item = re.sub(r"^(?:[•*·▪●–—-]|\d+[.)])\s*", "", line).strip()
            if not item:
                continue
            if not marked and bullet and result:
                result[-1] += "\n" + item
            else:
                result.append(item)
            bullet = bool(marked) or bullet
        return result

    legacy: dict[str, list[str]] = {"achievementItems": [], "interests": []}
    target = "achievementItems"
    for line in safe_text(value.get("careerAchievements"), 8000).splitlines():
        header = re.match(r"^(?:интересы(?:\s*/\s*дополнительно)?|увлечения|хобби|дополнительно|дополнительная информация|interests|hobbies|additional(?: information)?)\s*(?:[:—–-]\s*(.*))?$", line.strip(), re.I)
        if header:
            target = "interests"
            if header.group(1):
                legacy[target].append(header.group(1))
        elif re.match(r"^(?:достижения|achievements|accomplishments)\s*:?[ \t]*$", line.strip(), re.I):
            target = "achievementItems"
        else:
            legacy[target].append(line)
    legacy_history = safe_text(value.get("workHistory"), 20000)
    lines = legacy_history.split("\n")
    heading = next((index for index, line in enumerate(lines) if re.match(r"^(?:pet[- ]?проект(?:ы)?|пет[- ]?проект(?:ы)?|личные проекты|учебные проекты|pet projects?|personal projects|side projects)\s*:?[ \t]*$", line.strip(), re.I)), None)
    legacy_projects: list[dict[str, Any]] = []
    if heading is not None:
        legacy_history = "\n".join(lines[:heading]).strip()
        entry: dict[str, Any] = {"name": "", "description": "", "stack": []}
        for raw in lines[heading + 1:]:
            line = raw.strip()
            if not line:
                continue
            name = re.match(r"^(?:название(?: проекта)?|проект|project(?: name)?|name)\s*[:—–-]\s*(.*)$", line, re.I)
            stack = re.match(r"^(?:стек|технологии|stack|technologies)\s*[:—–-]\s*(.*)$", line, re.I)
            description = re.match(r"^(?:описание(?: проекта)?|description)\s*[:—–-]\s*(.*)$", line, re.I)
            if name:
                if entry["name"] or entry["description"] or entry["stack"]:
                    legacy_projects.append(entry)
                entry = {"name": name.group(1), "description": "", "stack": []}
            elif stack:
                entry["stack"] = list(dict.fromkeys([*entry["stack"], *(skill.strip() for skill in re.split(r"[,;|•]", stack.group(1)) if skill.strip())]))
            else:
                entry["description"] += ("\n" if entry["description"] else "") + (description.group(1) if description else raw)
        if entry["name"] or entry["description"] or entry["stack"]:
            legacy_projects.append(entry)
    result: dict[str, Any] = {"workExperiences": [], "petProjects": []}
    if isinstance(value.get("workExperiences"), list) and legacy_history and value["workExperiences"] == _legacy_work_entries(legacy_history):
        result["workExperiences"] = _legacy_work_entries(legacy_history)
    elif isinstance(value.get("workExperiences"), list):
        remaining = 20000
        for source in value["workExperiences"][:30]:
            if not isinstance(source, dict):
                continue
            entry = {"period": "", "company": "", "tasks": ""}
            populated = 0
            for key, maximum in (("company", 200), ("period", 100), ("tasks", 4000)):
                separator = 1 if populated else 2 if result["workExperiences"] else 0
                item = safe_text(source.get(key), min(maximum, max(0, remaining - separator)))
                if item:
                    remaining -= len(item) + separator
                    entry[key] = item
                    populated += 1
            if populated:
                result["workExperiences"].append(entry)
            if remaining <= 0:
                break
    else:
        result["workExperiences"] = _legacy_work_entries(legacy_history)
    remaining = 20000
    for entry in value["petProjects"] if isinstance(value.get("petProjects"), list) else legacy_projects:
        if not isinstance(entry, dict):
            continue
        stack = list(dict.fromkeys(safe_text(skill, 80) for skill in entry.get("stack", [])[:100])) if isinstance(entry.get("stack"), list) else []
        project = {"name": safe_text(entry.get("name"), 200), "description": safe_text(entry.get("description"), 4000), "stack": [skill for skill in stack if skill]}
        available = max(0, remaining - (2 if result["petProjects"] else 0))
        projected = pet_projects_text([project])
        if not projected:
            continue
        if len(projected) > available:
            budget = available
            name = project["name"][:budget]
            budget -= len(name)
            description = project["description"][:max(0, budget - bool(name))]
            budget -= len(description) + bool(description and name)
            retained: list[str] = []
            for skill in project["stack"]:
                cost = len(skill) + (2 if retained else len("Стек: ") + bool(name or description))
                if cost > budget:
                    break
                retained.append(skill)
                budget -= cost
            project = {"name": name, "description": description, "stack": retained}
        length = len(pet_projects_text([project]))
        if length:
            remaining -= length + (2 if result["petProjects"] else 0)
            result["petProjects"].append(project)
        if len(result["petProjects"]) >= 30:
            break
    for key in ("achievementItems", "interests"):
        items = value[key] if isinstance(value.get(key), list) else list_items(legacy[key])
        result[key] = []
        remaining = 4000
        for item in items[:50]:
            item = safe_text(item, max(0, remaining - bool(result[key])))
            if item:
                remaining -= len(item) + bool(result[key])
                result[key].append(item)
    return result
