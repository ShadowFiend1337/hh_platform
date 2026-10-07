"""HTTP access checks with a temporary database and an in-memory mailer.

Run separately: python -m unittest backend.tests.test_access_gate
No production database, mailbox or SMTP connection is used.
"""
from __future__ import annotations

import os
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

_database_directory = tempfile.TemporaryDirectory(prefix="predel-access-")
os.environ["DATABASE_URL"] = "sqlite:///" + (Path(_database_directory.name) / "test.sqlite3").as_posix()

from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from backend.app import app
from backend.database import SessionLocal, engine
from backend.models import Account, AssessmentAttempt, PlatformState
from backend.services import auth
from backend.services.common import company_id, iso, public_id

# Fail before any request if another importer already initialised a live engine.
if Path(engine.url.database).resolve() != (Path(_database_directory.name) / "test.sqlite3").resolve():
    raise RuntimeError("Access tests require their own temporary database and a separate Python process.")


class AccessGateTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mail = {}
        cls.mailer = patch.object(auth, "send_registration_email", side_effect=cls.deliver)
        cls.mailer.start()
        cls.lifecycle = TestClient(app)
        cls.lifecycle.__enter__()
        cls.employer = cls.register("employer")
        cls.candidate = cls.register("candidate")
        cls.other_candidate = cls.register("candidate", "other")

    @classmethod
    def deliver(cls, email, code, _expires):
        cls.mail[email] = code
        return "development"

    @classmethod
    def register(cls, role, label=""):
        client = TestClient(app)
        account_label = role + ("_" + label if label else "")
        email = account_label + "@example.invalid"
        payload = {"role": role, "login": "access_" + account_label, "email": email,
                   "password": "IsolatedAccess927!", "consent": True}
        payload["companyName" if role == "employer" else "name"] = "Изолированная проверка"
        response = client.post("/api/auth/register/request-code", json=payload)
        assert response.status_code == 202, response.text
        assert "code" not in response.json()
        response = client.post("/api/auth/register/verify", json={"email": email, "code": cls.mail[email]})
        assert response.status_code == 201, response.text
        return client

    @classmethod
    def tearDownClass(cls):
        cls.employer.close()
        cls.candidate.close()
        cls.other_candidate.close()
        cls.lifecycle.__exit__(None, None, None)
        cls.mailer.stop()
        _database_directory.cleanup()

    def setUp(self):
        with SessionLocal() as session:
            session.execute(delete(PlatformState))
            session.execute(delete(AssessmentAttempt))
            session.commit()

    def owner(self, client):
        account = client.get("/api/auth/me").json()["account"]
        with SessionLocal() as session:
            return session.get(Account, account["id"]).platform_owner

    @staticmethod
    def empty_state():
        return {"version": 2, "profile": {"id": "candidate-anna", "consent": False, "visible": False},
                "company": {"id": "company-line", "name": "Проверочная компания"},
                "invitations": [], "history": [], "surveys": [], "savedSearches": []}

    def insert_state(self, owner, state):
        with SessionLocal() as session:
            session.add(PlatformState(owner=owner, revision=1, state=deepcopy(state)))
            session.commit()

    @staticmethod
    def invitation(invitation_id, recipient_owner, sender_owner, status="sent"):
        return {"id": invitation_id, "candidateId": public_id(recipient_owner),
                "companyId": company_id(sender_owner), "company": "Проверочная компания",
                "title": "Разработка интерфейсов", "description": "Формы на React и TypeScript",
                "contact": "company@example.invalid", "salaryFrom": 120_000, "salaryTo": 180_000,
                "status": status, "date": iso()}

    def publish_assessed_candidate(self, client):
        """Complete an actual isolated assessment so later saves preserve its proof."""
        survey = {"id": "survey-access", "date": iso(), "industry": "ИТ",
                  "professionalRole": "Разработчик", "experience": "3 года", "stack": ["React"],
                  "softSkills": [], "specialization": "Frontend", "desiredGrade": "Middle"}
        response = client.post("/api/assessment/attempts", json={"survey": survey})
        self.assertEqual(response.status_code, 201, response.text)
        attempt = response.json()
        # The test can inspect its private temporary DB; these answers never
        # come from a public endpoint or from an actual user's assessment.
        with SessionLocal() as session:
            private = session.get(AssessmentAttempt, attempt["id"]).payload
            answers = [{"questionId": question["id"], "optionId": question["correctOptionId"]}
                       for question in private["questions"]]
        response = client.post("/api/assessment/attempts/" + attempt["id"] + "/submit",
                               json={"token": attempt["token"], "answers": answers})
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertTrue(result["passed"])
        account = client.get("/api/auth/me").json()["account"]
        state = self.empty_state()
        state["profile"].update({"name": account["name"], "email": account["email"], "phone": "+79990000000",
                                 "professionalRole": survey["professionalRole"], "industry": survey["industry"],
                                 "experience": survey["experience"], "stack": survey["stack"], "softSkills": [],
                                 "specialization": "Frontend", "desiredGrade": "Middle", "consent": True,
                                 "visible": True, "synthetic": False, "surveyCompletedAt": survey["date"],
                                 "confirmed": {key: result[key] for key in ("specialization", "grade", "score", "date", "surveyId")}})
        state["surveys"] = [survey]
        response = client.put("/api/platform/state", json={"state": state, "baseRevision": 0})
        self.assertEqual(response.status_code, 200, response.text)
        return self.owner(client)

    def test_guest_and_forged_or_legacy_cookies_cannot_open_business_routes(self):
        routes = [(method, path) for path, methods in [
            ("/api/platform/state", ("GET", "PUT", "DELETE")),
            ("/api/directory/options", ("GET",)),
            ("/api/directory/search", ("GET",)),
            ("/api/directory/candidate-mikhail/contacts", ("GET",)),
            ("/api/assessment/program", ("GET",)),
            ("/api/assessment/attempts", ("POST",)),
            ("/api/assessment/attempts/unknown", ("GET",)),
            ("/api/assessment/attempts/unknown/submit", ("POST",)),
        ] for method in methods]
        with TestClient(app) as guest:
            self.assertEqual(guest.get("/api/health").status_code, 200)
            for cookie in (None, auth.ANONYMOUS_COOKIE, auth.AUTH_COOKIE):
                guest.cookies.clear()
                if cookie:
                    guest.cookies.set(cookie, "a" * 64, path="/api")
                for method, path in routes:
                    with self.subTest(cookie=cookie, method=method, path=path):
                        response = guest.request(method, path, **({"json": {}} if method in {"POST", "PUT"} else {}))
                        self.assertEqual(response.status_code, 401, response.text)
                        self.assertEqual(response.headers["cache-control"], "no-store")
                        self.assertEqual(set(response.json()), {"error"})

    def test_roles_and_registered_catalogue_exclude_seed_and_legacy_profiles(self):
        self.assertEqual(self.candidate.get("/api/platform/state").status_code, 200)
        self.assertEqual(self.employer.get("/api/platform/state").status_code, 200)
        self.assertEqual(self.candidate.get("/api/directory/options").status_code, 403)
        self.assertEqual(self.candidate.get("/api/directory/search").status_code, 403)
        self.assertEqual(self.employer.get("/api/assessment/program").status_code, 403)
        self.assertEqual(self.candidate.get("/api/assessment/program?specialization=Frontend&grade=Middle").status_code, 200)
        self.assertEqual(self.employer.get("/api/directory/search").json()["items"], [])
        # These stored categories are explicit test fixtures, not test completions.
        with SessionLocal() as session:
            accounts = session.scalars(select(Account)).all()
            for owner in ["legacy-anonymous", *(account.platform_owner for account in accounts)]:
                session.add(PlatformState(owner=owner, revision=1, state={"profile": {
                    "name": "Проверочный профиль", "email": "fixture@example.invalid",
                    "visible": True, "consent": True, "professionalRole": "Разработчик",
                    "stack": ["React"], "specialization": "Frontend", "synthetic": False,
                    "confirmed": {"specialization": "Frontend", "grade": "Middle", "score": 85},
                }}))
            session.commit()
            expected = {public_id(account.platform_owner) for account in accounts if account.role == "candidate"}
        response = self.employer.get("/api/directory/search")
        self.assertEqual(response.status_code, 200)
        self.assertEqual({item["person"]["id"] for item in response.json()["items"]}, expected)
        self.assertEqual(response.json()["items"][0]["person"]["email"], "")

    def test_legacy_senders_are_hidden_and_cannot_receive_answers(self):
        recipient = self.owner(self.candidate)
        registered_sender = self.owner(self.employer)
        legacy_senders = ["legacy-anonymous", self.owner(self.other_candidate)]
        self.insert_state(recipient, self.empty_state())
        invitations = []
        for index, sender in enumerate([*legacy_senders, registered_sender]):
            state = self.empty_state()
            invitation = self.invitation("legacy-offer-" + str(index), recipient, sender)
            invitations.append(invitation)
            state["invitations"] = [invitation]
            self.insert_state(sender, state)
        response = self.candidate.get("/api/platform/state")
        self.assertEqual(response.status_code, 200)
        snapshot = response.json()
        self.assertEqual([item["id"] for item in snapshot["state"]["invitations"]], [invitations[-1]["id"]])
        for invitation, sender in zip(invitations, legacy_senders):
            with self.subTest(sender=sender):
                edited = deepcopy(snapshot["state"])
                forged = {**invitation, "candidateId": "candidate-anna", "status": "accepted"}
                edited["invitations"] = [forged]
                response = self.candidate.put("/api/platform/state", json={"state": edited, "baseRevision": snapshot["revision"]})
                self.assertEqual(response.status_code, 403, response.text)
                with SessionLocal() as session:
                    self.assertEqual(session.get(PlatformState, sender).state["invitations"][0]["status"], "sent")
                    self.assertEqual(session.get(PlatformState, sender).revision, 1)

    def test_legacy_accepted_candidate_or_guest_offer_never_opens_contacts(self):
        target = self.publish_assessed_candidate(self.other_candidate)
        caller = self.owner(self.candidate)
        for sender in [caller, "legacy-anonymous"]:
            state = self.empty_state()
            state["invitations"] = [self.invitation("legacy-accepted-" + sender, target, sender, "accepted")]
            self.insert_state(sender, state)
        url = "/api/directory/" + public_id(target) + "/contacts"
        self.assertEqual(self.candidate.get(url).status_code, 403)
        self.assertEqual(self.candidate.get("/api/platform/state").json()["state"]["invitations"], [])
        own = self.other_candidate.get("/api/directory/candidate-anna/contacts")
        self.assertEqual(own.status_code, 200, own.text)
        self.assertEqual(own.json()["email"], "candidate_other@example.invalid")
        with TestClient(app) as guest:
            guest.cookies.set(auth.ANONYMOUS_COOKIE, "a" * 64, path="/api")
            self.assertEqual(guest.get(url).status_code, 401)

    def test_registered_employer_invitation_acceptance_and_contacts_work(self):
        recipient = self.publish_assessed_candidate(self.candidate)
        employer = self.owner(self.employer)
        state = self.empty_state()
        state["invitations"] = [self.invitation("registered-offer", recipient, employer)]
        response = self.employer.put("/api/platform/state", json={"state": state, "baseRevision": 0})
        self.assertEqual(response.status_code, 200, response.text)
        url = "/api/directory/" + public_id(recipient) + "/contacts"
        self.assertEqual(self.employer.get(url).status_code, 403)
        snapshot = self.candidate.get("/api/platform/state").json()
        self.assertEqual(len(snapshot["state"]["invitations"]), 1)
        snapshot["state"]["invitations"][0]["status"] = "accepted"
        response = self.candidate.put("/api/platform/state", json={"state": snapshot["state"], "baseRevision": snapshot["revision"]})
        self.assertEqual(response.status_code, 200, response.text)
        sender_state = self.employer.get("/api/platform/state").json()["state"]
        self.assertEqual(sender_state["invitations"][0]["status"], "accepted")
        contacts = self.employer.get(url)
        self.assertEqual(contacts.status_code, 200, contacts.text)
        self.assertEqual(contacts.json()["email"], "candidate@example.invalid")

    def test_logout_revokes_cookie_and_keeps_auth_endpoints_public(self):
        with TestClient(app) as client:
            response = client.post("/api/auth/login", json={"login": "access_candidate", "password": "IsolatedAccess927!"})
            self.assertEqual(response.status_code, 200, response.text)
            saved_token = client.cookies.get(auth.AUTH_COOKIE)
            self.assertEqual(client.get("/api/platform/state").status_code, 200)
            self.assertEqual(client.post("/api/auth/logout").status_code, 200)
            client.cookies.set(auth.AUTH_COOKIE, saved_token, path="/api")
            self.assertEqual(client.get("/api/platform/state").status_code, 401)
            self.assertEqual(client.get("/api/auth/me").status_code, 401)


if __name__ == "__main__":
    unittest.main()
