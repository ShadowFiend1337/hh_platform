"""Run the FastAPI service without depending on a shell-specific command."""

from __future__ import annotations

import argparse
import os

import uvicorn

from .config import PROJECT_ROOT


def _port(value: str | None) -> int:
    try:
        port = int(value or "8787")
    except ValueError as error:
        raise SystemExit("PORT должен быть целым числом.") from error
    if not 1 <= port <= 65535:
        raise SystemExit("PORT должен быть от 1 до 65535.")
    return port


def main() -> None:
    parser = argparse.ArgumentParser(description="Запуск FastAPI-сервера predel")
    parser.add_argument("--host", default=os.getenv("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=_port(os.getenv("PORT")))
    parser.add_argument("--reload", action="store_true", help="Перезапускать сервер при изменении Python-кода")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port должен быть от 1 до 65535")
    options: dict[str, object] = {"host": args.host, "port": args.port, "reload": args.reload}
    if args.reload:
        options["reload_dirs"] = [str(PROJECT_ROOT / "backend")]
    uvicorn.run("backend.app:app", **options)


if __name__ == "__main__":
    main()
