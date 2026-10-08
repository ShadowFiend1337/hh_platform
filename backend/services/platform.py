from __future__ import annotations

import secrets
from copy import deepcopy
from datetime import timedelta
from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.models import Account, AssessmentAttempt, ConsentEvent, PlatformState
from backend.services import assessment, directory
from backend.services.common import ApiError, clone_json, company_id, json_size, public_id, utcnow


OWN_CANDIDATE_ID = "candidate-anna"
OWN_COMPANY_ID = "company-line"
STATE_KEYS = {"version", "profile", "company", "invitations", "history", "surveys", "savedSearches"}
INVITATION_STATUSES = {"sent", "viewed", "accepted", "rejected"}


def _state_row(session: Session, owner: str) -> PlatformState | None:
    return session.get(PlatformState, owner)


def _validate_state(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or value.get("version") != 2 or set(value) - STATE_KEYS:
        raise ApiError(400, "Неподдерживаемый формат состояния.")
    if json_size(value) > 1_000_000:
        raise ApiError(413, "Данные профиля слишком велики.")
    if not isinstance(value.get("profile"), dict) or not isinstance(value.get("company"), dict):
        raise ApiError(400, "Некорректные данные профиля.")
    if "consent" in value["profile"] and not isinstance(value["profile"]["consent"], bool):
        raise ApiError(400, "Некорректное согласие на обработку данных.")
    for key, maximum in (("invitations", 500), ("history", 500), ("surveys", 100), ("savedSearches", 100)):
        if not isinstance(value.get(key), list) or len(value[key]) > maximum:
            raise ApiError(400, "Некорректный список данных.")
    return clone_json(value)


def _has_private_profile(profile: dict[str, Any]) -> bool:
    fields = (
        "name", "email", "phone", "city", "bio", "careerAchievements", "education", "workHistory", "portfolio",
        "languages", "industry", "professionalRole", "experience", "employmentType", "availableFrom",
    )
    return any(bool(profile.get(key)) for key in fields) or bool(profile.get("stack") or profile.get("languageCodes") or profile.get("confirmed") or profile.get("surveyCompletedAt")) or profile.get("salaryFrom") is not None or profile.get("salaryTo") is not None or profile.get("experienceMonths") is not None


def _valid_saved_searches(items: list[Any]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    ids: set[str] = set()
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str) or not item["id"].strip() or len(item["id"]) > 100:
            raise ApiError(400, "Некорректный сохранённый поиск.")
        if item["id"] in ids or not isinstance(item.get("title"), str) or not item["title"].strip() or len(item["title"]) > 200:
            raise ApiError(400, "Укажите название сохранённого поиска.")
        if not isinstance(item.get("query", ""), str) or len(item.get("query", "")) > 1200:
            raise ApiError(400, "Некорректный сохранённый поиск.")
        directory.normalize_filters(item.get("filters"))
        ids.add(item["id"])
        result.append(clone_json(item))
    return result


def _valid_surveys(items: list[Any]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    ids: set[str] = set()
    for item in items:
        checked = assessment.validate_survey(item)
        if checked["id"] in ids:
            raise ApiError(400, "Повторяющийся ID: анкеты.")
        # Preserve the optional profile fields the UI places on the survey, but
        # only after the core assessment input was checked above.
        optional = ("careerAchievements", "education", "workHistory", "portfolio", "languages", "format")
        result.append({**checked, **{key: item[key] for key in optional if isinstance(item, dict) and key in item and isinstance(item[key], str)}})
        ids.add(checked["id"])
    return result


def _validate_invitation(item: Any) -> dict[str, Any]:
    if not isinstance(item, dict):
        raise ApiError(400, "Некорректное приглашение.")
    allowed = {"id", "candidateId", "companyId", "company", "title", "description", "contact", "salaryFrom", "salaryTo", "status", "date"}
    if set(item) - allowed:
        raise ApiError(400, "Некорректное приглашение.")
    text_limits = {"id": 100, "candidateId": 100, "title": 200, "description": 4000, "contact": 254}
    result: dict[str, Any] = {}
    for key, limit in text_limits.items():
        value = item.get(key)
        if not isinstance(value, str) or not value.strip() or len(value) > limit:
            raise ApiError(400, "Заполните корректное предложение и зарплатный диапазон.")
        result[key] = value.strip()
    for key in ("salaryFrom", "salaryTo"):
        value = item.get(key)
        if not isinstance(value, int) or isinstance(value, bool) or not 0 < value <= 10_000_000:
            raise ApiError(400, "Заполните корректное предложение и зарплатный диапазон.")
        result[key] = value
    if result["salaryFrom"] > result["salaryTo"] or "@" not in result["contact"]:
        raise ApiError(400, "Заполните корректное предложение и зарплатный диапазон.")
    status = item.get("status")
    if status not in INVITATION_STATUSES:
        raise ApiError(400, "Некорректный статус приглашения.")
    result["status"] = status
    for key in ("companyId", "company", "date"):
        if isinstance(item.get(key), str):
            result[key] = item[key]
    return result


def _outgoing(state: dict[str, Any]) -> list[dict[str, Any]]:
    invitations = state.get("invitations")
    return [item for item in invitations if isinstance(item, dict)] if isinstance(invitations, list) else []


def _account_role(session: Session, owner: str) -> str | None:
    return session.scalar(select(Account.role).where(Account.platform_owner == owner))


def _employer_states():
    return select(PlatformState).join(Account, Account.platform_owner == PlatformState.owner).where(Account.role == "employer")


def _incoming(session: Session, owner: str) -> list[dict[str, Any]]:
    if _account_role(session, owner) != "candidate":
        return []
    target_id = public_id(owner)
    result: list[dict[str, Any]] = []
    for row in session.scalars(_employer_states().where(PlatformState.owner != owner)).all():
        for invitation in _outgoing(row.state if isinstance(row.state, dict) else {}):
            if invitation.get("candidateId") == target_id:
                value = clone_json(invitation)
                value["candidateId"] = OWN_CANDIDATE_ID
                value["companyId"] = company_id(row.owner)
                result.append(value)
    return result


def _state_for_read(session: Session, owner: str, row: PlatformState) -> dict[str, Any]:
    state = clone_json(row.state)
    state["history"] = assessment.completed_results(session, owner)
    own = _outgoing(state) if _account_role(session, owner) == "employer" else []
    # A state only stores invitations sent by this owner. Received invitations
    # are derived from their sender, so the two participants always see a
    # single authoritative status.
    state["invitations"] = own + _incoming(session, owner)
    state.setdefault("version", 2)
    state.setdefault("profile", {})
    state.setdefault("company", {})
    return state


def _directory_people(session: Session, state: dict[str, Any], owner: str) -> list[dict[str, Any]]:
    ids = {item.get("candidateId") for item in state.get("invitations", []) if isinstance(item, dict)}
    people: list[dict[str, Any]] = []
    for candidate_id in ids:
        if candidate_id == OWN_CANDIDATE_ID:
            candidate_id = public_id(owner)
        if not isinstance(candidate_id, str):
            continue
        person = directory.candidate_by_id(session, candidate_id)
        if person:
            people.append(directory.public_candidate(person, OWN_CANDIDATE_ID if candidate_id == public_id(owner) else candidate_id))
    return people


def read(session: Session, owner: str) -> dict[str, Any]:
    row = _state_row(session, owner)
    if row is None:
        return {"state": None, "revision": 0, "directoryPeople": []}
    state = _state_for_read(session, owner, row)
    return {"state": state, "revision": row.revision, "directoryPeople": _directory_people(session, state, owner)}


def _proof_for(results: list[dict[str, Any]], value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    for result in results:
        if result.get("passed") is True and result.get("score", 0) >= assessment.THRESHOLD and all(
            result.get(key) == value.get(key) for key in ("specialization", "grade", "date")
        ) and (not value.get("surveyId") or value.get("surveyId") == result.get("surveyId")):
            return result
    return None


def _apply_proof(profile: dict[str, Any], old_profile: dict[str, Any] | None, results: list[dict[str, Any]], surveys: list[dict[str, Any]]) -> None:
    requested = _proof_for(results, profile.get("confirmed"))
    old = _proof_for(results, old_profile.get("confirmed") if old_profile else None)
    selected = requested or old
    if selected is None:
        profile["confirmed"] = None
        return
    old_confirmed = old_profile.get("confirmed") if old_profile else None
    changed = bool(old_confirmed and (old_confirmed.get("specialization") != selected["specialization"] or old_confirmed.get("grade") != selected["grade"]))
    changed_at = old_profile.get("gradeChangedAt") if old_profile else None
    if changed and isinstance(changed_at, str):
        try:
            from datetime import datetime, timezone
            previous = datetime.fromisoformat(changed_at.replace("Z", "+00:00"))
            previous = previous.replace(tzinfo=timezone.utc) if previous.tzinfo is None else previous
            if utcnow() < previous + timedelta(days=90):
                raise ApiError(409, "Смена подтверждённой категории доступна раз в 90 дней.")
        except ValueError:
            pass
    profile["confirmed"] = {key: selected[key] for key in ("specialization", "grade", "score", "date", "surveyId")}
    profile["gradeChangedAt"] = selected["date"] if changed or not old else (changed_at or old.get("date"))
    if selected.get("surveyId") and not any(item.get("id") == selected["surveyId"] for item in surveys):
        attempt = next((row for row in results if row.get("id") == selected.get("id")), None)
        # The client already retains its questionnaire. A later save can add it
        # normally; do not invent personal answers in this fallback.
        del attempt


def _resolve_candidate_id(session: Session, owner: str, candidate_id: str) -> str:
    target = public_id(owner) if candidate_id == OWN_CANDIDATE_ID else candidate_id
    candidate = directory.candidate_by_id(session, target)
    if candidate is None or candidate.get("visible") is not True or candidate.get("consent") is not True:
        raise ApiError(404, "Кандидат недоступен для приглашения.")
    return target


def _update_received_invitation(session: Session, owner: str, value: dict[str, Any]) -> None:
    if _account_role(session, owner) != "candidate":
        raise ApiError(403, "Ответить на приглашение может только соискатель.")
    target = public_id(owner)
    for source in session.scalars(_employer_states().where(PlatformState.owner != owner)).all():
        state = clone_json(source.state)
        invitations = _outgoing(state)
        for stored in invitations:
            if stored.get("id") != value["id"] or stored.get("candidateId") != target:
                continue
            immutable = ("title", "description", "contact", "salaryFrom", "salaryTo")
            if any(value.get(key) != stored.get(key) for key in immutable):
                raise ApiError(403, "Отправленное предложение нельзя подменить.")
            if value["status"] == stored.get("status"):
                return
            if stored.get("status") not in {"sent", "viewed"} or value["status"] not in {"viewed", "accepted", "rejected"}:
                raise ApiError(403, "Изменить ответ может только получатель приглашения.")
            stored["status"] = value["status"]
            state["invitations"] = invitations
            # The sender state is a shared JSON document.  Compare its
            # revision in SQL so accepting one invitation cannot overwrite a
            # different invitation accepted at the same time.
            changed = session.execute(
                update(PlatformState).where(
                    PlatformState.owner == source.owner,
                    PlatformState.revision == source.revision,
                ).values(state=state, revision=source.revision + 1, updated_at=utcnow())
            )
            if changed.rowcount != 1:
                session.rollback()
                raise ApiError(409, "Данные изменились в другой вкладке. Обновите страницу.")
            # A single candidate save may acknowledge several invitations from
            # one employer. Reload the source before a later acknowledgement
            # so it compares against the revision just written above.
            session.expire(source)
            return
    raise ApiError(403, "Приглашение принадлежит другой сессии.")


def _merge_invitations(session: Session, owner: str, role: str | None, state: dict[str, Any], company: dict[str, Any], previous: dict[str, Any] | None) -> list[dict[str, Any]]:
    incoming = state.get("invitations", [])
    parsed = [_validate_invitation(item) for item in incoming]
    if len({item["id"] for item in parsed}) != len(parsed):
        raise ApiError(400, "Повторяющийся ID: приглашения.")
    old_outgoing = {item.get("id"): item for item in _outgoing(previous or {})} if role == "employer" else {}
    stored: list[dict[str, Any]] = []
    for invitation in parsed:
        old = old_outgoing.get(invitation["id"])
        incoming_to_self = invitation.get("candidateId") == OWN_CANDIDATE_ID and invitation.get("companyId") not in {None, OWN_COMPANY_ID, company_id(owner)}
        if incoming_to_self:
            if role == "employer":
                raise ApiError(403, "Ответить на приглашение может только соискатель.")
            _update_received_invitation(session, owner, invitation)
            continue
        if old is not None:
            immutable = ("candidateId", "title", "description", "contact", "salaryFrom", "salaryTo")
            if any(invitation.get(key) != old.get(key) for key in immutable):
                raise ApiError(403, "Отправленное предложение нельзя подменить.")
            if invitation["status"] != old.get("status"):
                raise ApiError(403, "Изменить ответ может только получатель приглашения.")
            stored.append(old)
            continue
        if role == "candidate":
            raise ApiError(403, "Отправлять приглашения может только работодатель.")
        if invitation["status"] != "sent":
            raise ApiError(403, "Работодатель может только отправить приглашение.")
        if not isinstance(company.get("name"), str) or not company["name"].strip():
            raise ApiError(400, "Укажите название компании.")
        candidate_id = _resolve_candidate_id(session, owner, invitation["candidateId"])
        stored.append({
            **invitation, "candidateId": candidate_id, "companyId": company_id(owner), "company": company["name"].strip(),
            "date": invitation.get("date") or utcnow().isoformat().replace("+00:00", "Z"),
        })
    # Sender-side deletions intentionally do not revoke an already delivered
    # invitation. The web client never deletes invitation rows, and retaining
    # them preserves its historical statuses.
    for key, invitation in old_outgoing.items():
        if key not in {item["id"] for item in parsed}:
            stored.append(invitation)
    return stored


def save(session: Session, owner: str, value: Any, base_revision: Any, role: str | None, account_id: str | None = None) -> dict[str, Any]:
    if role is not None and role not in {"candidate", "employer"}:
        raise ApiError(403, "Роль аккаунта недоступна.")
    if not isinstance(base_revision, int) or isinstance(base_revision, bool) or base_revision < 0:
        raise ApiError(400, "Некорректная версия данных.")
    state = _validate_state(value)
    row = _state_row(session, owner)
    if (row.revision if row else 0) != base_revision:
        raise ApiError(409, "Данные изменились в другой вкладке. Обновите страницу.")
    profile = clone_json(state["profile"])
    company = clone_json(state["company"])
    profile["id"] = OWN_CANDIDATE_ID
    company["id"] = OWN_COMPANY_ID
    searches = _valid_saved_searches(state["savedSearches"])
    surveys = _valid_surveys(state["surveys"])
    if role == "candidate" and searches:
        raise ApiError(403, "Сохранённые поиски доступны работодателю.")
    old_state = clone_json(row.state) if row else None
    old_profile = old_state.get("profile") if isinstance(old_state, dict) and isinstance(old_state.get("profile"), dict) else None
    old_surveys = {item["id"]: item for item in _valid_surveys(old_state.get("surveys", []))} if old_state else {}
    new_surveys = {item["id"]: item for item in surveys}
    for survey_id, old_survey in old_surveys.items():
        if survey_id not in new_surveys:
            raise ApiError(403, "Сохранённую анкету нельзя удалить из истории.")
        if new_surveys[survey_id] != old_survey:
            raise ApiError(403, "Сохранённую анкету нельзя изменить.")
    if role == "employer" and (_has_private_profile(profile) or bool(profile.get("consent")) or surveys):
        raise ApiError(403, "Профиль и анкеты доступны соискателю.")
    if not profile.get("consent") and (_has_private_profile(profile) or surveys) and not _has_private_profile(old_profile or {}):
        raise ApiError(400, "Для сохранения личной анкеты необходимо согласие.")
    results = assessment.completed_results(session, owner)
    _apply_proof(profile, old_profile, results, surveys)
    if profile.get("surveyCompletedAt") and not any(item.get("date") == profile.get("surveyCompletedAt") for item in surveys):
        profile["surveyCompletedAt"] = None
    state.update({"profile": profile, "company": company, "surveys": surveys, "savedSearches": searches, "history": results})
    state["invitations"] = _merge_invitations(session, owner, role, state, company, old_state)
    now = utcnow()
    if bool(old_profile and old_profile.get("consent")) != bool(profile.get("consent")):
        from backend.services.auth import PRIVACY_POLICY_VERSION

        session.add(ConsentEvent(
            id=secrets.token_hex(16), owner=owner, account_id=account_id,
            policy_version=PRIVACY_POLICY_VERSION, scope="candidate_profile",
            action="accepted" if profile.get("consent") is True else "withdrawn", occurred_at=now,
        ))
    if row is None:
        session.add(PlatformState(owner=owner, revision=1, state=state, updated_at=now))
        try:
            session.commit()
        except IntegrityError as error:
            # Concurrent first saves race on the owner primary key.  Report it
            # with the same optimistic-locking contract as an existing state.
            session.rollback()
            raise ApiError(409, "Данные изменились в другой вкладке. Обновите страницу.") from error
    else:
        # The condition belongs in SQL, rather than only in the earlier read:
        # two PostgreSQL workers may have read the same revision concurrently.
        changed = session.execute(
            update(PlatformState).where(
                PlatformState.owner == owner,
                PlatformState.revision == base_revision,
            ).values(revision=base_revision + 1, state=state, updated_at=now)
        )
        if changed.rowcount != 1:
            session.rollback()
            raise ApiError(409, "Данные изменились в другой вкладке. Обновите страницу.")
        session.commit()
    session.expire_all()
    return read(session, owner)


def contacts(session: Session, owner: str, candidate_id: str) -> dict[str, str]:
    if not isinstance(candidate_id, str) or not candidate_id or len(candidate_id) > 100:
        raise ApiError(400, "Некорректный кандидат.")
    target = public_id(owner) if candidate_id == OWN_CANDIDATE_ID else candidate_id
    target_owner = directory.candidate_owner(session, target)
    if target_owner is None:
        raise ApiError(404, "Контакты недоступны.")
    profile = directory.account_profile(session, target_owner)
    if profile is None:
        raise ApiError(404, "Контакты недоступны.")
    if target_owner != owner:
        accepted = any(
            invitation.get("candidateId") == target and invitation.get("status") == "accepted"
            for row in session.scalars(_employer_states().where(PlatformState.owner == owner)).all()
            for invitation in _outgoing(row.state if isinstance(row.state, dict) else {})
        )
        if not profile.get("consent") or not accepted:
            raise ApiError(403, "Контакты доступны после принятия приглашения и при действующем согласии.")
    return {"email": str(profile.get("email", "")), "phone": str(profile.get("phone", ""))}


def erase_owner_data(session: Session, owner: str, *, include_consent_events: bool = False) -> None:
    """Erase a platform owner and their references without committing."""

    own_public_id = public_id(owner)
    for row in session.scalars(select(PlatformState)).all():
        if row.owner == owner:
            session.delete(row)
            continue
        state = clone_json(row.state)
        invitations = [item for item in _outgoing(state) if item.get("candidateId") != own_public_id]
        if len(invitations) != len(_outgoing(state)):
            state["invitations"] = invitations
            row.state = state
            row.revision += 1
            row.updated_at = utcnow()
    session.execute(delete(AssessmentAttempt).where(AssessmentAttempt.owner == owner))
    if include_consent_events:
        session.execute(delete(ConsentEvent).where(ConsentEvent.owner == owner))


def delete(session: Session, owner: str) -> dict[str, Any]:
    erase_owner_data(session, owner, include_consent_events=True)
    session.commit()
    return {"state": None, "revision": 0, "directoryPeople": []}
