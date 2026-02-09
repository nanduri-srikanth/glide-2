#!/usr/bin/env python3
"""
Wipe application data from the Supabase Postgres database used by the backend.

This is intentionally conservative:
- By default it deletes notes/actions/folders only (keeps public.users rows).
- It never touches Supabase Auth tables (auth.*) or Storage metadata (storage.*).

Usage examples (run from repo root):
  backend/.venv311/bin/python backend/scripts/wipe_supabase_app_data.py --all --yes
  backend/.venv311/bin/python backend/scripts/wipe_supabase_app_data.py --email you@example.com --yes
  backend/.venv311/bin/python backend/scripts/wipe_supabase_app_data.py --supabase-user-id <uuid> --wipe-user-row --yes
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import create_engine, text


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


@dataclass(frozen=True)
class Target:
    supabase_url: str
    project_ref: Optional[str]
    db_host: str
    db_name: str


def _extract_project_ref(supabase_url: str) -> Optional[str]:
    # https://<ref>.supabase.co
    m = re.match(r"^https?://([a-z0-9]+)\.supabase\.co/?$", supabase_url.strip(), re.I)
    return m.group(1) if m else None


def _parse_db_host_and_name(db_url_sync: str) -> tuple[str, str]:
    # postgresql://user:pass@host:port/dbname
    # We only surface host + db name for safety.
    try:
        after_scheme = db_url_sync.split("://", 1)[1]
    except Exception:
        return ("<unknown>", "<unknown>")
    host_and_path = after_scheme.split("@", 1)[-1]
    host_port, _, path = host_and_path.partition("/")
    host = host_port.split(":", 1)[0]
    db_name = path.split("?", 1)[0] if path else "<unknown>"
    return (host, db_name)


def _get_target() -> Target:
    from app.config import get_settings  # imported lazily after sys.path tweak

    settings = get_settings()
    project_ref = _extract_project_ref(settings.supabase_url) if settings.supabase_url else None
    db_url_sync = settings.database_url_sync
    db_host, db_name = _parse_db_host_and_name(db_url_sync)
    return Target(
        supabase_url=settings.supabase_url,
        project_ref=project_ref,
        db_host=db_host,
        db_name=db_name,
    )


def _confirm_or_exit(target: Target, yes: bool) -> None:
    if yes:
        return

    expected = target.project_ref or target.db_host
    print("DANGER: This will DELETE data in the backend database.")
    print(f"Target Supabase URL: {target.supabase_url or '<not set>'}")
    print(f"Target DB: host={target.db_host} db={target.db_name}")
    print()
    print(f"Type '{expected}' to confirm:")
    typed = input("> ").strip()
    if typed != expected:
        print("Aborted (confirmation did not match).", file=sys.stderr)
        raise SystemExit(2)


def _truncate_all(conn, include_users: bool) -> None:
    # NOTE:
    # TRUNCATE takes AccessExclusive locks and is prone to deadlocks if the project has any
    # concurrent traffic (apps running, background jobs, etc). For a dev wipe, plain DELETEs
    # are more reliable while still clearing all data.
    #
    # Order matters to satisfy FKs without relying on CASCADE.
    conn.execute(text("DELETE FROM public.actions"))
    conn.execute(text("DELETE FROM public.notes"))
    conn.execute(text("DELETE FROM public.folders"))
    if include_users:
        conn.execute(text("DELETE FROM public.users"))


def _lookup_user_id(conn, email: Optional[str], supabase_user_id: Optional[str]) -> Optional[str]:
    if email:
        row = conn.execute(text("SELECT id::text FROM public.users WHERE email = :email"), {"email": email}).fetchone()
        return row[0] if row else None

    if supabase_user_id:
        row = conn.execute(
            text("SELECT id::text FROM public.users WHERE supabase_user_id = :sid::uuid"),
            {"sid": supabase_user_id},
        ).fetchone()
        return row[0] if row else None

    return None


def _wipe_user_data(conn, user_id: str, wipe_user_row: bool) -> None:
    if wipe_user_row:
        # This should cascade to notes/folders/actions via FK ondelete=CASCADE where configured.
        conn.execute(text("DELETE FROM public.users WHERE id = :uid::uuid"), {"uid": user_id})
        return

    # Keep the user row; delete content only.
    conn.execute(text("DELETE FROM public.notes WHERE user_id = :uid::uuid"), {"uid": user_id})
    conn.execute(text("DELETE FROM public.folders WHERE user_id = :uid::uuid"), {"uid": user_id})


def main() -> int:
    parser = argparse.ArgumentParser()
    scope = parser.add_mutually_exclusive_group(required=True)
    scope.add_argument("--all", action="store_true", help="Wipe notes/folders/actions for all users.")
    scope.add_argument("--email", help="Wipe notes/folders/actions for the user with this email.")
    scope.add_argument("--supabase-user-id", help="Wipe notes/folders/actions for the user with this Supabase auth UUID.")

    parser.add_argument(
        "--include-users",
        action="store_true",
        help="With --all: also truncate public.users (wipes all user rows).",
    )
    parser.add_argument(
        "--wipe-user-row",
        action="store_true",
        help="With --email/--supabase-user-id: also delete the matching public.users row.",
    )
    parser.add_argument("--yes", action="store_true", help="Skip interactive confirmation prompt.")

    args = parser.parse_args()

    target = _get_target()
    _confirm_or_exit(target, yes=args.yes)

    from app.config import get_settings

    settings = get_settings()
    engine = create_engine(settings.database_url_sync, future=True)

    with engine.begin() as conn:
        if args.all:
            _truncate_all(conn, include_users=bool(args.include_users))
            return 0

        user_id = _lookup_user_id(conn, email=args.email, supabase_user_id=args.supabase_user_id)
        if not user_id:
            print("No matching user found in public.users; nothing to wipe.", file=sys.stderr)
            return 1

        _wipe_user_data(conn, user_id=user_id, wipe_user_row=bool(args.wipe_user_row))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
