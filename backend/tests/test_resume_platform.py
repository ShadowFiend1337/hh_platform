"""Resume-state round trips use an isolated in-memory database, without HTTP or mail."""
import unittest
from copy import deepcopy

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend.database import Base
from backend.models import Account
from backend.services import platform
from backend.services.common import ApiError


def fields():
    return {"workExperiences": [{"period": "2024-01 — 2025-02", "company": "Лаборатория", "tasks": "API и очереди"}],
            "petProjects": [{"name": "Телеметрия", "description": "MQTT и датчики", "stack": ["ESP32", "Python"]}],
            "achievementItems": ["Призёр хакатона"], "interests": ["Робототехника"]}


class ResumePlatformTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.owner = "resume_owner"
        self.session.add(Account(id="resume_account", email="resume@example.invalid", login="resume_login", login_normalized="resume_login",
                                 role="candidate", name="Кандидат", company_name="", password_hash="unused", platform_owner=self.owner))
        self.session.commit()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def state(self):
        survey = {"id": "structured_survey", "date": "2026-10-11T12:00:00Z", "industry": "ИТ", "professionalRole": "Backend",
                  "specialization": "Backend", "desiredGrade": "Junior", "experience": "1 год", "stack": ["Python"], "softSkills": [], **fields()}
        return {"version": 2, "profile": {"id": "candidate-anna", "name": "Кандидат", "email": "resume@example.invalid", "consent": True,
                "visible": False, "confirmed": None, "surveyCompletedAt": survey["date"], **deepcopy(survey)},
                "company": {"id": "company-line", "name": "Компания"}, "invitations": [], "history": [], "surveys": [survey], "savedSearches": []}

    def test_roundtrip_maintains_projections_and_immutable_questionnaire(self):
        saved = platform.save(self.session, self.owner, self.state(), 0, "candidate")
        for key, value in fields().items():
            self.assertEqual(saved["state"]["profile"][key], value)
            self.assertEqual(saved["state"]["surveys"][0][key], value)
        self.assertEqual(saved["state"]["profile"]["workHistory"], "Лаборатория\n2024-01 — 2025-02\nAPI и очереди")
        self.assertEqual(saved["state"]["profile"]["careerAchievements"], "Призёр хакатона")
        changed = deepcopy(saved["state"])
        changed["profile"]["petProjects"][0]["description"] = "Новое описание"
        next_state = platform.save(self.session, self.owner, changed, saved["revision"], "candidate")
        self.assertEqual(next_state["state"]["surveys"][0]["petProjects"][0]["description"], "MQTT и датчики")
        changed = deepcopy(next_state["state"])
        changed["surveys"][0]["interests"].append("Переписанная история")
        with self.assertRaises(ApiError) as caught:
            platform.save(self.session, self.owner, changed, next_state["revision"], "candidate")
        self.assertEqual(caught.exception.status, 403)

    def test_arrays_cannot_bypass_consent_or_candidate_role(self):
        for key, value in (("interests", ["Личная информация"]), ("petProjects", fields()["petProjects"])):
            for role, expected in (("candidate", 400), ("employer", 403)):
                state = {"version": 2, "profile": {"consent": False, key: value}, "company": {}, "invitations": [], "history": [], "surveys": [], "savedSearches": []}
                with self.assertRaises(ApiError) as caught:
                    platform.save(self.session, self.owner, state, 0, role)
                self.assertEqual(caught.exception.status, expected)

    def test_current_frontend_empty_optional_collections_are_compatible(self):
        state = self.state()
        state.update({"hiringNeeds": [], "candidateDecisions": []})
        saved = platform.save(self.session, self.owner, state, 0, "candidate")
        self.assertEqual(saved["state"]["hiringNeeds"], [])
        self.assertEqual(saved["state"]["candidateDecisions"], [])
        for key, item in (("hiringNeeds", [{"id": "not-supported"}]), ("candidateDecisions", [{"candidateId": "not-supported"}]), ("hiringNeeds", {})):
            edited = deepcopy(saved["state"])
            edited[key] = item
            with self.assertRaises(ApiError) as caught:
                platform.save(self.session, self.owner, edited, saved["revision"], "candidate")
            self.assertEqual(caught.exception.status, 400)
        self.assertEqual(platform.read(self.session, self.owner)["revision"], saved["revision"])
