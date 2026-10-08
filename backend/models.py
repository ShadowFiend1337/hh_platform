"""Portable SQLAlchemy models for accounts, platform state and assessments."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Account(Base):
    """A confirmed account, bound to the stable owner key used by platform data."""

    __tablename__ = "auth_accounts"
    __table_args__ = (
        CheckConstraint("role IN ('candidate', 'employer')", name="ck_auth_accounts_role"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True, nullable=False)
    login: Mapped[str] = mapped_column(String(32), nullable=False)
    login_normalized: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    company_name: Mapped[str] = mapped_column(String(160), default="", nullable=False)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    platform_owner: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    sessions: Mapped[list["AuthSession"]] = relationship(
        back_populates="account", cascade="all, delete-orphan", passive_deletes=True
    )


class PendingRegistration(Base):
    """A registration held until its verification code is confirmed."""

    __tablename__ = "auth_pending_registrations"
    __table_args__ = (
        CheckConstraint("role IN ('candidate', 'employer')", name="ck_pending_registrations_role"),
    )

    email: Mapped[str] = mapped_column(String(254), primary_key=True)
    login: Mapped[str] = mapped_column(String(32), nullable=False)
    login_normalized: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    company_name: Mapped[str] = mapped_column(String(160), default="", nullable=False)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    platform_owner: Mapped[str] = mapped_column(String(128), nullable=False)
    code_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    code_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class PendingRegistrationConsent(Base):
    """Consent attached to a pending registration until email verification."""

    __tablename__ = "auth_pending_registration_consents"

    email: Mapped[str] = mapped_column(
        String(254), ForeignKey("auth_pending_registrations.email", ondelete="CASCADE"), primary_key=True
    )
    policy_version: Mapped[str] = mapped_column(String(32), nullable=False)
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ConsentEvent(Base):
    """A versioned account consent decision with its exact UTC timestamp."""

    __tablename__ = "auth_consent_events"
    __table_args__ = (
        Index("ix_auth_consent_events_account_time", "account_id", "occurred_at"),
        Index("ix_auth_consent_events_owner_time", "owner", "occurred_at"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    owner: Mapped[str] = mapped_column(String(128), nullable=False)
    account_id: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("auth_accounts.id", ondelete="CASCADE"), nullable=True
    )
    policy_version: Mapped[str] = mapped_column(String(32), nullable=False)
    scope: Mapped[str] = mapped_column(String(32), nullable=False)
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AccountDeletionEvent(Base):
    """Anonymous deletion-operation timestamp, intentionally not linked to an account."""

    __tablename__ = "auth_account_deletion_events"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AuthSession(Base):
    """A server-side session represented by a hash of its browser token."""

    __tablename__ = "auth_sessions"
    __table_args__ = (
        Index("ix_auth_sessions_account_expires", "account_id", "expires_at"),
        Index("ix_auth_sessions_expires", "expires_at"),
    )

    token_hash: Mapped[str] = mapped_column(String(128), primary_key=True)
    account_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("auth_accounts.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    account: Mapped[Account] = relationship(back_populates="sessions")


class PlatformState(Base):
    """The revisioned platform payload belonging to one account owner."""

    __tablename__ = "platform_states"

    owner: Mapped[str] = mapped_column(String(128), primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    state: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class AssessmentAttempt(Base):
    """One server-generated assessment and, after submission, its result."""

    __tablename__ = "assessment_attempts"
    __table_args__ = (
        Index("ix_assessment_attempts_owner_created", "owner", "created_at"),
        Index("ix_assessment_attempts_owner_expires", "owner", "expires_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner: Mapped[str] = mapped_column(String(128), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    specialization: Mapped[str] = mapped_column(String(100), nullable=False)
    grade: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    answer_digest: Mapped[str | None] = mapped_column(String(128), nullable=True)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
