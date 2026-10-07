"""SQLAlchemy engine, sessions and schema initialisation for the API."""

from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    """Base class for all persistent API models."""


def _engine_options() -> dict[str, object]:
    options: dict[str, object] = {
        "echo": settings.sql_echo,
        "pool_pre_ping": not settings.is_sqlite,
    }
    if settings.is_sqlite:
        # FastAPI can serve requests in worker threads; SQLite needs this opt-in.
        options["connect_args"] = {"check_same_thread": False, "timeout": 30}
    return options


engine: Engine = create_engine(settings.database_url, **_engine_options())
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


if settings.is_sqlite:

    @event.listens_for(engine, "connect")
    def _configure_sqlite(dbapi_connection: object, _: object) -> None:
        cursor = dbapi_connection.cursor()  # type: ignore[union-attr]
        try:
            cursor.execute("PRAGMA foreign_keys=ON")
        finally:
            cursor.close()


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency that always closes the request database session."""

    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _create_sqlite_parent_directory() -> None:
    if not settings.is_sqlite:
        return
    database = make_url(settings.database_url).database
    if not database or database == ":memory:":
        return
    Path(database).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)


def init_database() -> None:
    """Create the current schema when the service starts.

    The import registers every declarative model before ``create_all``.  This
    is deliberately idempotent, which gives a fresh local clone a usable
    SQLite database without requiring PostgreSQL or a migration command.
    """

    from . import models as _models  # noqa: F401

    _create_sqlite_parent_directory()
    Base.metadata.create_all(bind=engine)


def dispose_database() -> None:
    """Release pooled connections during application shutdown."""

    engine.dispose()
