"""Configuration shared by the FastAPI application and persistence layer.

`DATABASE_URL` takes precedence over the local SQLite database.  PostgreSQL
URLs are normalised to the psycopg SQLAlchemy driver, so a usual
`postgresql://...` value is enough in deployment.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SQLITE_PATH = PROJECT_ROOT / "backend" / "data" / "hh_platform.sqlite3"

# This keeps direct `uvicorn backend.main:app` starts convenient while allowing
# process-level environment variables to override values from .env.
load_dotenv(PROJECT_ROOT / ".env", override=False)


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None or value.strip() == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _sqlite_url(path: Path) -> str:
    return f"sqlite:///{path.resolve().as_posix()}"


def normalize_database_url(raw_url: str | None) -> str:
    """Return a SQLAlchemy URL, defaulting to a project-local SQLite file."""

    value = (raw_url or "").strip()
    if not value:
        return _sqlite_url(DEFAULT_SQLITE_PATH)

    # `postgres://` is still common in platform-provided connection strings.
    if value.startswith("postgres://"):
        return "postgresql+psycopg://" + value.removeprefix("postgres://")
    if value.startswith("postgresql://"):
        return "postgresql+psycopg://" + value.removeprefix("postgresql://")

    # Make the documented relative SQLite URL independent of the command's
    # current directory.  Absolute URLs and in-memory databases stay intact.
    if value.startswith("sqlite:///./"):
        relative_path = value.removeprefix("sqlite:///./")
        return _sqlite_url(PROJECT_ROOT / relative_path)
    return value


@dataclass(frozen=True, slots=True)
class Settings:
    database_url: str
    sql_echo: bool
    environment: str

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @classmethod
    def from_environment(cls) -> "Settings":
        return cls(
            database_url=normalize_database_url(os.getenv("DATABASE_URL")),
            sql_echo=_as_bool(os.getenv("SQL_ECHO")),
            environment=os.getenv("APP_ENV", "development").strip().lower() or "development",
        )


settings = Settings.from_environment()
