"""HTTP access checks with a temporary database and an in-memory mailer.

Run separately: python -m unittest backend.tests.test_access_gate
No production database, mailbox or SMTP connection is used.
"""
from __future__ import annotations

import os
import tempfile
import unittest
from copy import deepcopy
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

_database_directory = tempfile.TemporaryDirectory(prefix="predel-access-")
os.environ["DATABASE_URL"] = "sqlite:///" + (Path(_database_directory.name) / "test.sqlite3").as_posix()
os.environ["PYTHON_DOTENV_DISABLED"] = "1"

from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from backend.app import app
from backend.database import SessionLocal, engine
from backend.models import (
    Account, AccountDeletionEvent, AssessmentAttempt, AuthSession, ConsentEvent,
    PendingRegistration, PendingRegistrationConsent, PlatformState,
)
from backend.services import auth
from backend.services.common import ApiError, company_id, iso, public_id, utcnow

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
                   "password": "IsolatedAccess927!", "consent": True, "privacyVersion": auth.PRIVACY_POLICY_VERSION}
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
            session.execute(delete(ConsentEvent).where(ConsentEvent.scope == "candidate_profile"))
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

    def test_registration_requires_consent_and_the_current_policy(self):
        payload = {"role": "candidate", "login": "consent_check", "email": "consent@example.invalid",
                   "name": "Consent check", "password": "IsolatedAccess927!",
                   "consent": True, "privacyVersion": auth.PRIVACY_POLICY_VERSION}
        self.assertEqual(auth.validate_registration(payload)["role"], "candidate")
        for change in ({"consent": False}, {"consent": "true"}, {"privacyVersion": "outdated"}, {"privacyVersion": None}):
            with self.subTest(change=change), self.assertRaises(ApiError) as rejected:
                auth.validate_registration({**payload, **change})
            self.assertEqual(rejected.exception.status, 400)

    def test_registration_consent_keeps_the_request_timestamp_after_verification(self):
        accepted_at = utcnow()
        email = "exact-consent@example.invalid"
        with TestClient(app) as client:
            with patch.object(auth, "utcnow", return_value=accepted_at):
                response = client.post("/api/auth/register/request-code", json={
                    "role": "candidate", "login": "exact_consent", "email": email,
                    "name": "Consent timestamp", "password": "IsolatedAccess927!",
                    "consent": True, "privacyVersion": auth.PRIVACY_POLICY_VERSION,
                })
            self.assertEqual(response.status_code, 202, response.text)
            self.assertEqual(response.json()["delivery"], "development")
            response = client.post("/api/auth/register/verify", json={"email": email, "code": self.mail[email]})
            self.assertEqual(response.status_code, 201, response.text)
            account_id = response.json()["account"]["id"]
            with SessionLocal() as session:
                event = session.scalar(select(ConsentEvent).where(ConsentEvent.account_id == account_id))
                self.assertEqual((event.scope, event.action, event.policy_version),
                                 ("registration", "accepted", auth.PRIVACY_POLICY_VERSION))
                self.assertEqual(auth._aware(event.occurred_at), accepted_at)
                self.assertIsNone(session.get(PendingRegistration, email))
                self.assertIsNone(session.get(PendingRegistrationConsent, email))

    def test_saved_questionnaire_cannot_be_edited_or_removed_and_new_versions_can_be_added(self):
        survey = {"id": "immutable-survey", "date": iso(), "industry": "ИТ",
                  "professionalRole": "Разработчик", "experience": "3 года", "stack": ["React"],
                  "softSkills": [], "specialization": "Frontend", "desiredGrade": "Middle",
                  "workHistory": "Saved experience"}
        state = self.empty_state()
        state["profile"].update({"name": "Questionnaire history", "consent": True})
        state["surveys"] = [survey]
        response = self.candidate.put("/api/platform/state", json={"state": state, "baseRevision": 0})
        self.assertEqual(response.status_code, 200, response.text)
        saved = response.json()
        for surveys in ([], [{**survey, "experience": "5 лет"}], [{**survey, "workHistory": "Rewritten experience"}]):
            edited = {**saved["state"], "surveys": surveys}
            response = self.candidate.put("/api/platform/state", json={"state": edited, "baseRevision": saved["revision"]})
            self.assertEqual(response.status_code, 403, response.text)
            self.assertEqual(self.candidate.get("/api/platform/state").json()["state"]["surveys"], [survey])
        appended = {**saved["state"], "surveys": [survey, {**survey, "id": "new-survey", "experience": "5 лет"}]}
        response = self.candidate.put("/api/platform/state", json={"state": appended, "baseRevision": saved["revision"]})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(response.json()["state"]["surveys"]), 2)

    def test_profile_consent_records_only_transitions_with_policy_and_time(self):
        owner = self.owner(self.candidate)
        account_id = self.candidate.get("/api/auth/me").json()["account"]["id"]
        state = self.empty_state()
        state["profile"].update({"name": "Consent history", "consent": True})
        revision = 0
        for consent in (True, True, False, False, True):
            state["profile"]["consent"] = consent
            response = self.candidate.put("/api/platform/state", json={"state": state, "baseRevision": revision})
            self.assertEqual(response.status_code, 200, response.text)
            revision = response.json()["revision"]
            state = response.json()["state"]
        with SessionLocal() as session:
            events = session.scalars(select(ConsentEvent).where(
                ConsentEvent.owner == owner, ConsentEvent.scope == "candidate_profile",
            ).order_by(ConsentEvent.occurred_at)).all()
            self.assertEqual([event.action for event in events], ["accepted", "withdrawn", "accepted"])
            self.assertTrue(all(event.account_id == account_id and event.policy_version == auth.PRIVACY_POLICY_VERSION
                                and auth._aware(event.occurred_at).utcoffset() == timedelta(0) for event in events))

    def test_account_deletion_removes_history_consent_sessions_and_other_owners_references(self):
        client = self.register("candidate", "deletion")
        self.addCleanup(client.close)
        owner = self.publish_assessed_candidate(client)
        account = client.get("/api/auth/me").json()["account"]
        token = client.cookies.get(auth.AUTH_COOKIE)
        employer_owner = self.owner(self.employer)
        employer_state = self.empty_state()
        employer_state["invitations"] = [self.invitation("deletion-offer", owner, employer_owner)]
        self.insert_state(employer_owner, employer_state)
        self.assertEqual(client.delete("/api/platform/state").status_code, 403)
        rejected = client.delete("/api/auth/account", headers={"X-Platform-Identity": "auth:another-account"})
        self.assertEqual(rejected.status_code, 403, rejected.text)
        self.assertEqual(client.get("/api/auth/me").status_code, 200)
        with SessionLocal() as session:
            before = len(session.scalars(select(AccountDeletionEvent)).all())
        response = client.delete("/api/auth/account", headers={"X-Platform-Identity": "auth:" + account["id"]})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["status"], "account_deleted")
        self.assertTrue(response.json()["deletedAt"].endswith("Z"))
        with SessionLocal() as session:
            self.assertIsNone(session.get(Account, account["id"]))
            self.assertIsNone(session.get(PlatformState, owner))
            self.assertEqual(session.scalars(select(AssessmentAttempt).where(AssessmentAttempt.owner == owner)).all(), [])
            self.assertEqual(session.scalars(select(ConsentEvent).where(ConsentEvent.owner == owner)).all(), [])
            self.assertEqual(session.scalars(select(AuthSession).where(AuthSession.account_id == account["id"])).all(), [])
            self.assertEqual(session.get(PlatformState, employer_owner).state["invitations"], [])
            self.assertEqual(len(session.scalars(select(AccountDeletionEvent)).all()), before + 1)
            self.assertEqual(set(AccountDeletionEvent.__table__.columns.keys()), {"id", "deleted_at"})
        with TestClient(app) as other_device:
            other_device.cookies.set(auth.AUTH_COOKIE, token, path="/api")
            self.assertEqual(other_device.get("/api/platform/state").status_code, 401)
            self.assertEqual(other_device.post("/api/auth/login", json={
                "login": account["login"], "password": "IsolatedAccess927!",
            }).status_code, 401)

    def test_expired_pending_registration_and_its_consent_are_cleaned_together(self):
        email = "expired-consent@example.invalid"
        expired_at = utcnow() - timedelta(minutes=20)
        with SessionLocal() as session, patch.object(auth, "utcnow", return_value=expired_at):
            auth.request_registration(session, {"role": "candidate", "login": "expired_consent", "email": email,
                "name": "Expired registration", "password": "IsolatedAccess927!", "consent": True,
                "privacyVersion": auth.PRIVACY_POLICY_VERSION}, "a" * 64)
        self.assertEqual(self.candidate.get("/api/auth/me").status_code, 200)
        with SessionLocal() as session:
            self.assertIsNone(session.get(PendingRegistration, email))
            self.assertIsNone(session.get(PendingRegistrationConsent, email))


if __name__ == "__main__":
    unittest.main()
