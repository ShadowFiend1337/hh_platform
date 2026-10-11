from __future__ import annotations

import json
import random
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from backend.models import AssessmentAttempt
from backend.services.common import ApiError, GRADES, INDUSTRIES, SPECIALIZATIONS, clone_json, iso, sha256, utcnow
from backend.services.resume_structure import MAX_SOFT_SKILLS


THRESHOLD = 70
EXPIRES_IN_MINUTES = 30
_RANDOM = random.SystemRandom()
_DATA_PATH = Path(__file__).resolve().parents[1] / "app" / "data" / "assessment-bank.json"


def _read_bank() -> dict[str, Any]:
    try:
        with _DATA_PATH.open(encoding="utf-8") as source:
            value = json.load(source)
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Не удалось загрузить банк заданий: {error}") from error
    if not isinstance(value, dict) or not isinstance(value.get("programs"), dict):
        raise RuntimeError("Некорректный переносимый банк заданий.")
    return value


_BANK = _read_bank()
BANK_VERSION = str(_BANK["bankVersion"])
PROGRAMS: dict[str, dict[str, dict[str, Any]]] = _BANK["programs"]
VACANCY_EXAMPLES: list[dict[str, Any]] = _BANK.get("vacancyExamples", [])


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _program(specialization: Any, grade: Any) -> dict[str, Any]:
    if not isinstance(specialization, str) or not isinstance(grade, str):
        raise ApiError(400, "Выберите поддерживаемую специализацию и грейд.")
    program = PROGRAMS.get(specialization, {}).get(grade)
    if not program:
        raise ApiError(400, "Выберите поддерживаемую специализацию и грейд.")
    return program


def program_info(specialization: str | None, grade: str | None) -> dict[str, Any]:
    program = _program(specialization, grade)
    return {
        "bankVersion": BANK_VERSION,
        "topics": clone_json(program["topics"]),
        "questionCount": len(program["topics"]) * 2,
        "threshold": THRESHOLD,
        "expiresInMinutes": EXPIRES_IN_MINUTES,
        "examples": [
            {key: example[key] for key in ("id", "title", "description")}
            for example in VACANCY_EXAMPLES
            if example.get("specialization") == specialization and example.get("grade") == grade
        ],
    }


def _require_text(value: Any, maximum: int) -> str:
    return value.strip() if isinstance(value, str) and 0 < len(value.strip()) <= maximum else ""


def _validated_string_list(value: Any, maximum: int, *, minimum: int = 1) -> list[str] | None:
    if not isinstance(value, list) or not minimum <= len(value) <= maximum:
        return None
    result = [_require_text(item, 80) for item in value]
    return result if all(result) and len(set(result)) == len(result) else None


def validate_survey(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ApiError(400, "Сначала заполните анкету.")
    required = {name: _require_text(value.get(name), limit) for name, limit in {
        "id": 100, "date": 40, "industry": 100, "professionalRole": 100, "experience": 100,
    }.items()}
    stack = _validated_string_list(value.get("stack"), 100)
    soft_skills = _validated_string_list(value.get("softSkills"), MAX_SOFT_SKILLS, minimum=0)
    if not all(required.values()) or required["industry"] not in INDUSTRIES or stack is None or soft_skills is None:
        raise ApiError(400, "Сначала заполните анкету.")
    try:
        datetime.fromisoformat(required["date"].replace("Z", "+00:00"))
    except ValueError as error:
        raise ApiError(400, "Сначала заполните анкету.") from error
    specialization, grade = value.get("specialization"), value.get("desiredGrade")
    if specialization not in SPECIALIZATIONS or grade not in GRADES:
        raise ApiError(400, "Выберите поддерживаемую специализацию и грейд.")
    _program(specialization, grade)
    return {
        **required,
        "specialization": specialization,
        "desiredGrade": grade,
        "stack": stack,
        "softSkills": soft_skills,
    }


def _all_program_skills(program: dict[str, Any]) -> list[str]:
    values: list[str] = []
    for family in program.get("families", []):
        values.extend(skill for skill in family.get("skills", []) if isinstance(skill, str))
        for variant in family.get("variants", []):
            values.extend(skill for skill in variant.get("skills", []) if isinstance(skill, str))
    return list(dict.fromkeys(values))


def _word_in_text(word: str, text: str) -> bool:
    # Skills such as C++ and C# are not word-boundary friendly; direct matching
    # still leaves the matching rule explicit and local to the assessment bank.
    escaped = re.escape(word.casefold())
    return bool(re.search(rf"(?<![\wа-яё]){escaped}(?![\wа-яё])", text, re.IGNORECASE))


def _analyze_vacancy(description: str, program: dict[str, Any]) -> dict[str, Any]:
    normalized = description.casefold().replace("ё", "е")
    all_skills = _all_program_skills(program)
    identified = [skill for skill in all_skills if _word_in_text(skill.replace("ё", "е"), normalized)]
    focus_topics = [
        topic for topic in program.get("topics", [])
        if any(skill in identified for family in program.get("families", []) if family.get("topic") == topic
               for skill in [*family.get("skills", []), *(entry for variant in family.get("variants", []) for entry in variant.get("skills", []))])
    ]
    # Existing authored data does not contain a universal vocabulary for every
    # vacancy technology.  Unknown tokens stay visible rather than being marked
    # as covered by a loosely related question.
    return {
        "matchedSkills": identified,
        "unmatchedSkills": [],
        "focusTopics": focus_topics,
        "recognized": bool(identified),
        "summary": (
            f"Покрываются {len(identified)} навыков из явного словаря; общий состав теста сохранён."
            if identified else "В описании не найдены навыки выбранной программы из явного словаря."
        ),
    }


def _shuffle(values: list[Any]) -> list[Any]:
    copied = list(values)
    _RANDOM.shuffle(copied)
    return copied


def _choose_question(family: dict[str, Any], seen_variants: set[str], matched_skills: set[str]) -> dict[str, Any]:
    variants = [item for item in family.get("variants", []) if isinstance(item, dict)]
    fresh = [item for item in variants if item.get("id") not in seen_variants] or variants
    if not fresh:
        raise ApiError(500, "Банк заданий настроен не полностью.")
    relevance = lambda entry: len(set(entry.get("skills", [])) & matched_skills)
    top_score = max(relevance(entry) for entry in fresh)
    variant = _RANDOM.choice([entry for entry in fresh if relevance(entry) == top_score])
    options = [
        {"id": str(uuid.uuid4()), "text": text, "correct": index == variant.get("correct")}
        for index, text in enumerate(variant.get("options", []))
    ]
    options = _shuffle(options)
    correct = next((entry["id"] for entry in options if entry["correct"]), None)
    if not correct:
        raise ApiError(500, "Банк заданий настроен не полностью.")
    return {
        "id": str(uuid.uuid4()), "topic": family.get("topic"), "text": variant.get("text"),
        "options": [{"id": entry["id"], "text": entry["text"]} for entry in options],
        "correctOptionId": correct, "familyId": family.get("id"), "variantId": variant.get("id"),
        "difficulty": family.get("difficulty"), "skills": list(variant.get("skills", [])),
    }


def _recent_attempts(session: Session, owner: str, specialization: str, grade: str) -> list[dict[str, Any]]:
    rows = session.scalars(
        select(AssessmentAttempt).where(
            AssessmentAttempt.owner == owner,
            AssessmentAttempt.specialization == specialization,
            AssessmentAttempt.grade == grade,
        ).order_by(AssessmentAttempt.created_at.desc()).limit(2)
    ).all()
    return [row.payload for row in rows]


def create_attempt(session: Session, owner: str, survey_input: Any, vacancy_description: Any) -> tuple[dict[str, Any], str]:
    survey = validate_survey(survey_input)
    if vacancy_description is None:
        vacancy_description = ""
    if not isinstance(vacancy_description, str) or len(vacancy_description) > 4000:
        raise ApiError(400, "Описание вакансии — до 4000 символов.")
    program = _program(survey["specialization"], survey["desiredGrade"])
    description = vacancy_description.strip()
    vacancy = _analyze_vacancy(description, program) if description else None
    matched_skills = set(vacancy["matchedSkills"] if vacancy else [])
    seen_variants = {
        question.get("variantId") for attempt in _recent_attempts(session, owner, survey["specialization"], survey["desiredGrade"])
        for question in attempt.get("questions", []) if isinstance(question, dict)
    }
    selected: list[dict[str, Any]] = []
    for topic in program.get("topics", []):
        for difficulty in (1, 2):
            families = [
                family for family in program.get("families", [])
                if family.get("topic") == topic and family.get("difficulty") == difficulty
            ]
            priority = [
                family for family in families
                if set(family.get("skills", [])) & matched_skills
            ]
            family = _RANDOM.choice(priority or families) if families else None
            if not family:
                raise ApiError(500, "Банк заданий настроен не полностью.")
            selected.append(_choose_question(family, seen_variants, matched_skills))
    questions = _shuffle(selected)
    if vacancy:
        questions.sort(key=lambda question: question["topic"] not in vacancy["focusTopics"])
        covered = {skill for question in questions for skill in question.get("skills", [])}
        omitted = [skill for skill in vacancy["matchedSkills"] if skill not in covered]
        vacancy["matchedSkills"] = [skill for skill in vacancy["matchedSkills"] if skill in covered]
        vacancy["unmatchedSkills"] = list(dict.fromkeys([*vacancy["unmatchedSkills"], *omitted]))
        vacancy["recognized"] = bool(vacancy["matchedSkills"])
        vacancy["summary"] = "Совпадения относятся к выбранным заданиям; общий состав теста сохранён."
    now = utcnow()
    expires = now + timedelta(minutes=EXPIRES_IN_MINUTES)
    attempt = {
        "id": str(uuid.uuid4()), "bankVersion": BANK_VERSION,
        "specialization": survey["specialization"], "grade": survey["desiredGrade"], "surveyId": survey["id"],
        "survey": survey, "createdAt": iso(now), "expiresAt": iso(expires), "questions": questions,
        "vacancy": vacancy, "vacancyDescription": description,
        "blueprint": {
            "topicCounts": {topic: 2 for topic in program.get("topics", [])},
            "difficultyCounts": {"1": len(program.get("topics", [])), "2": len(program.get("topics", []))},
            "difficultyBudget": len(program.get("topics", [])) * 3,
        },
    }
    token = uuid.uuid4().hex + uuid.uuid4().hex
    session.add(AssessmentAttempt(
        id=attempt["id"], owner=owner, token_hash=sha256(token), specialization=attempt["specialization"],
        grade=attempt["grade"], payload=attempt, created_at=now, expires_at=expires,
    ))
    session.commit()
    return public_attempt(attempt), token


def public_attempt(attempt: dict[str, Any]) -> dict[str, Any]:
    keys = ("id", "bankVersion", "specialization", "grade", "surveyId", "createdAt", "expiresAt", "blueprint", "vacancy")
    value = {key: clone_json(attempt.get(key)) for key in keys}
    value["questions"] = [
        {key: clone_json(question.get(key)) for key in ("id", "topic", "text", "options")}
        for question in attempt.get("questions", [])
    ]
    return value


def _authorized(session: Session, owner: str, attempt_id: str, token: Any) -> AssessmentAttempt:
    row = session.get(AssessmentAttempt, attempt_id)
    if not row or row.owner != owner:
        raise ApiError(404, "Попытка не найдена.")
    if not isinstance(token, str) or len(token) != 64 or sha256(token) != row.token_hash:
        raise ApiError(403, "Нет доступа к попытке.")
    if row.result is None and utcnow() >= _aware(row.expires_at):
        raise ApiError(410, "Время теста истекло. Начните новую попытку.")
    return row


def get_attempt(session: Session, owner: str, attempt_id: str, token: Any) -> dict[str, Any]:
    row = _authorized(session, owner, attempt_id, token)
    result = public_attempt(row.payload)
    result["status"] = "completed" if row.result is not None else "active"
    if row.result is not None:
        result["result"] = clone_json(row.result)
    return result


def _evaluate(attempt: dict[str, Any], answers: Any) -> tuple[str, dict[str, Any]]:
    expires = datetime.fromisoformat(str(attempt["expiresAt"]).replace("Z", "+00:00"))
    if utcnow() >= _aware(expires):
        raise ApiError(410, "Время теста истекло. Начните новую попытку.")
    questions = attempt.get("questions", [])
    if not isinstance(answers, list) or len(answers) != len(questions):
        raise ApiError(400, "Ответьте на все вопросы.")
    selected: dict[str, str] = {}
    by_id = {question.get("id"): question for question in questions if isinstance(question, dict)}
    for answer in answers:
        if not isinstance(answer, dict) or set(answer) - {"questionId", "optionId"}:
            raise ApiError(400, "Некорректный ответ.")
        question_id, option_id = answer.get("questionId"), answer.get("optionId")
        question = by_id.get(question_id)
        if not question or question_id in selected or not any(option.get("id") == option_id for option in question.get("options", [])):
            raise ApiError(400, "Ответ не относится к этой попытке.")
        selected[question_id] = option_id
    topics = list(dict.fromkeys(question.get("topic") for question in questions))
    competencies = []
    for topic in topics:
        topic_questions = [question for question in questions if question.get("topic") == topic]
        correct = sum(selected.get(question.get("id")) == question.get("correctOptionId") for question in topic_questions)
        competencies.append({"topic": topic, "score": round(correct / len(topic_questions) * 100), "correct": correct, "total": len(topic_questions)})
    total_correct = sum(item["correct"] for item in competencies)
    score = round(total_correct / len(questions) * 100)
    normalized = sorted(selected.items())
    answer_digest = sha256(json.dumps(normalized, ensure_ascii=False, separators=(",", ":")))
    return answer_digest, {
        "id": attempt["id"], "date": iso(), "specialization": attempt["specialization"], "grade": attempt["grade"],
        "surveyId": attempt["surveyId"], "score": score, "passed": score >= THRESHOLD,
        "bankVersion": attempt["bankVersion"], "competencies": competencies,
        "vacancySkills": (attempt.get("vacancy") or {}).get("matchedSkills", []),
    }


def submit_attempt(session: Session, owner: str, attempt_id: str, token: Any, answers: Any) -> dict[str, Any]:
    row = _authorized(session, owner, attempt_id, token)
    # A completed attempt remains readable after its expiry.  Comparing an
    # identical replay preserves the existing idempotent client contract.
    if row.result is not None:
        questions = row.payload.get("questions", [])
        if not isinstance(answers, list) or len(answers) != len(questions):
            raise ApiError(409, "Попытка уже проверена. Ответы менять нельзя.")
        selected = sorted((entry.get("questionId"), entry.get("optionId")) for entry in answers if isinstance(entry, dict))
        replay_digest = sha256(json.dumps(selected, ensure_ascii=False, separators=(",", ":")))
        if replay_digest != row.answer_digest:
            raise ApiError(409, "Попытка уже проверена. Ответы менять нельзя.")
        return clone_json(row.result)
    answer_digest, result = _evaluate(row.payload, answers)
    # `result IS NULL` is the assessment's write-once guard.  Two browser
    # requests can both read an active attempt, but only the first result may
    # become authoritative in SQLite or PostgreSQL.
    saved = session.execute(
        update(AssessmentAttempt).where(
            AssessmentAttempt.id == row.id,
            AssessmentAttempt.result.is_(None),
        ).values(answer_digest=answer_digest, result=result)
    )
    if saved.rowcount == 1:
        session.commit()
        return clone_json(result)
    session.rollback()
    session.expire_all()
    stored = session.get(AssessmentAttempt, row.id)
    if stored and stored.answer_digest == answer_digest and stored.result is not None:
        return clone_json(stored.result)
    raise ApiError(409, "Попытка уже проверена. Ответы менять нельзя.")


def completed_results(session: Session, owner: str) -> list[dict[str, Any]]:
    rows = session.scalars(
        select(AssessmentAttempt).where(AssessmentAttempt.owner == owner, AssessmentAttempt.result.is_not(None))
        .order_by(AssessmentAttempt.created_at.desc()).limit(500)
    ).all()
    return [clone_json(row.result) for row in rows if row.result]


def delete_owner_attempts(session: Session, owner: str) -> None:
    for row in session.scalars(select(AssessmentAttempt).where(AssessmentAttempt.owner == owner)).all():
        session.delete(row)
    session.commit()


def starts_in_last_hour(session: Session, owner: str) -> int:
    since = utcnow() - timedelta(hours=1)
    return int(session.scalar(select(func.count()).select_from(AssessmentAttempt).where(
        AssessmentAttempt.owner == owner, AssessmentAttempt.created_at >= since
    )) or 0)
