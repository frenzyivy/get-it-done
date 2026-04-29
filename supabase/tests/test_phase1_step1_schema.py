"""Phase 1, step 1 — schema migration tests.

What this validates *without* a running Postgres:
  1. Every migration file parses as syntactically valid Postgres SQL via
     pglast (which wraps libpg_query — the parser Postgres itself uses).
  2. Migrations 0021–0026 each contain the exact DDL elements the SPEC
     requires (columns, constraints, indexes, RLS policies, etc.).

What this does NOT validate:
  - Runtime behavior (FK cascades, RLS enforcement, trigger firing).
  - Migration ordering/idempotency on a real database.
  - Data back-fills against real rows.
A second test runner (`run_migrations_against_local_db.sh`) covers those once
Docker + supabase start are available.

Run:    python supabase/tests/test_phase1_step1_schema.py
Exits 0 on success, 1 on first failure.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import pglast


MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"

NEW_MIGRATIONS = [
    "0021_project_lifecycle.sql",
    "0022_task_completed_at.sql",
    "0023_v_task_status.sql",
    "0024_daily_targets.sql",
    "0025_saved_views.sql",
    "0026_streak_history.sql",
]


# ---------- helpers ----------

class TestFailed(Exception):
    pass


def read(name: str) -> str:
    path = MIGRATIONS_DIR / name
    if not path.exists():
        raise TestFailed(f"Missing migration file: {path}")
    return path.read_text(encoding="utf-8")


def must_parse(sql: str, label: str) -> None:
    """Round-trip the SQL through pglast. A ParseError here means Postgres
    would reject the file at psql runtime."""
    try:
        pglast.parse_sql(sql)
    except pglast.parser.ParseError as exc:
        raise TestFailed(f"{label} fails to parse: {exc}") from exc


def must_contain(sql: str, pattern: str, label: str, *, flags: int = re.IGNORECASE | re.DOTALL) -> None:
    if not re.search(pattern, sql, flags):
        raise TestFailed(f"{label}: expected pattern not found: {pattern!r}")


def must_not_contain(sql: str, pattern: str, label: str, *, flags: int = re.IGNORECASE | re.DOTALL) -> None:
    if re.search(pattern, sql, flags):
        raise TestFailed(f"{label}: unwanted pattern present: {pattern!r}")


# ---------- per-migration assertions ----------

def test_0021_project_lifecycle() -> None:
    sql = read("0021_project_lifecycle.sql")
    must_parse(sql, "0021_project_lifecycle")

    # New columns
    must_contain(sql, r"ADD COLUMN IF NOT EXISTS\s+completed_at", "0021 completed_at")
    must_contain(sql, r"ADD COLUMN IF NOT EXISTS\s+archived_at", "0021 archived_at")
    must_contain(sql, r"ADD COLUMN IF NOT EXISTS\s+description", "0021 description")

    # Status check is widened to include all four states. The SPEC keeps
    # 'paused' to avoid breaking 0019 rows.
    must_contain(
        sql,
        r"CHECK\s*\(\s*status\s+IN\s*\(\s*'active'\s*,\s*'paused'\s*,\s*'completed'\s*,\s*'archived'\s*\)\s*\)",
        "0021 widened status check",
    )

    # Old constraint must be dropped first (otherwise the ADD CONSTRAINT fails
    # because the name collides).
    must_contain(sql, r"DROP CONSTRAINT IF EXISTS\s+projects_status_check", "0021 drop old check")

    # Index for fast status filtering.
    must_contain(
        sql,
        r"CREATE INDEX IF NOT EXISTS\s+idx_projects_status\s+ON\s+projects\s*\(\s*user_id\s*,\s*status\s*\)",
        "0021 idx_projects_status",
    )


def test_0022_task_completed_at() -> None:
    sql = read("0022_task_completed_at.sql")
    must_parse(sql, "0022_task_completed_at")

    must_contain(sql, r"ALTER TABLE tasks", "0022 ALTER TABLE tasks")
    must_contain(sql, r"ADD COLUMN IF NOT EXISTS\s+completed_at\s+TIMESTAMPTZ", "0022 completed_at column")

    # Partial index keyed on (user_id, completed_at) for the Done tab. Order
    # matters: we filter by user first, then time-range scan.
    must_contain(
        sql,
        r"CREATE INDEX IF NOT EXISTS\s+idx_tasks_completed_at\s+ON\s+tasks\s*\(\s*user_id\s*,\s*completed_at\s*\)\s+WHERE\s+completed_at\s+IS\s+NOT\s+NULL",
        "0022 partial index",
    )


def test_0023_v_task_status() -> None:
    sql = read("0023_v_task_status.sql")
    must_parse(sql, "0023_v_task_status")

    must_contain(sql, r"CREATE OR REPLACE VIEW\s+v_task_status", "0023 view definition")

    # Reads from tracked_sessions, not the legacy time_sessions or a
    # never-created time_logs.
    must_contain(sql, r"FROM\s+tracked_sessions", "0023 reads tracked_sessions")
    must_not_contain(sql, r"FROM\s+time_logs\b", "0023 must not read time_logs")
    must_not_contain(sql, r"FROM\s+time_sessions\b", "0023 must not read time_sessions")

    # Three branches of the CASE, in priority order.
    must_contain(sql, r"WHEN\s+t\.completed_at\s+IS\s+NOT\s+NULL\s+THEN\s+'done'", "0023 done branch")
    must_contain(sql, r"THEN\s+'in_progress'", "0023 in_progress branch")
    must_contain(sql, r"ELSE\s+'todo'", "0023 todo branch")

    # An open session (ended_at IS NULL) also counts as in_progress — this is
    # what makes the Now Tracking banner immediately reflect status.
    must_contain(sql, r"ts\.ended_at\s+IS\s+NULL", "0023 considers open sessions")


def test_0024_daily_targets() -> None:
    sql = read("0024_daily_targets.sql")
    must_parse(sql, "0024_daily_targets")

    must_contain(sql, r"CREATE TABLE IF NOT EXISTS\s+daily_targets", "0024 table create")

    # FK to profiles(id) — the actual user table. Not auth.users (that's
    # what user_profiles uses) and not a generic users(id) table.
    must_contain(
        sql,
        r"user_id\s+UUID\s+PRIMARY KEY\s+REFERENCES\s+profiles\s*\(\s*id\s*\)\s+ON DELETE CASCADE",
        "0024 FK to profiles",
    )

    # All 7 weekday columns with 0..24 range checks.
    for col, default in [("mon", 16), ("tue", 16), ("wed", 18), ("thu", 16), ("fri", 14), ("sat", 12), ("sun", 8)]:
        must_contain(
            sql,
            rf"{col}\s+NUMERIC\s*\(\s*4\s*,\s*1\s*\)\s+NOT NULL\s+DEFAULT\s+{default}\s+CHECK\s*\(\s*{col}\s+BETWEEN\s+0\s+AND\s+24\s*\)",
            f"0024 column {col}",
        )

    # Preset name enum
    must_contain(
        sql,
        r"preset_name\s+IN\s*\(\s*'balanced'\s*,\s*'weekend-off'\s*,\s*'hustle'\s*,\s*'custom'\s*\)",
        "0024 preset_name enum",
    )

    # RLS + policy
    must_contain(sql, r"ENABLE ROW LEVEL SECURITY", "0024 RLS enabled")
    must_contain(sql, r'CREATE POLICY\s+"Users manage own daily_targets"', "0024 RLS policy")
    must_contain(sql, r"auth\.uid\(\)\s*=\s*user_id", "0024 owner-scoped USING")

    # updated_at trigger
    must_contain(sql, r"set_daily_targets_updated_at", "0024 updated_at trigger")


def test_0025_saved_views() -> None:
    sql = read("0025_saved_views.sql")
    must_parse(sql, "0025_saved_views")

    must_contain(sql, r"CREATE TABLE IF NOT EXISTS\s+saved_views", "0025 table create")

    # 4-state view_type enum
    must_contain(
        sql,
        r"view_type\s+IN\s*\(\s*'board'\s*,\s*'list'\s*,\s*'priority'\s*,\s*'calendar'\s*\)",
        "0025 view_type enum",
    )

    # filters is jsonb with object default
    must_contain(sql, r"filters\s+JSONB\s+NOT NULL\s+DEFAULT\s+'\{\}'::jsonb", "0025 filters jsonb")

    # Unique per (user, name, view_type)
    must_contain(
        sql,
        r"UNIQUE\s*\(\s*user_id\s*,\s*name\s*,\s*view_type\s*\)",
        "0025 unique constraint",
    )

    # RLS + policy + trigger
    must_contain(sql, r"ENABLE ROW LEVEL SECURITY", "0025 RLS enabled")
    must_contain(sql, r'CREATE POLICY\s+"Users manage own saved_views"', "0025 RLS policy")
    must_contain(sql, r"set_saved_views_updated_at", "0025 updated_at trigger")
    must_contain(sql, r"idx_saved_views_user", "0025 lookup index")


def test_0026_streak_history() -> None:
    sql = read("0026_streak_history.sql")
    must_parse(sql, "0026_streak_history")

    # Adds the new column to user_profiles, NOT to profiles. user_profiles is
    # the streak/goal table from 0012; profiles is the display-name table.
    must_contain(sql, r"ALTER TABLE user_profiles", "0026 target table")
    must_contain(
        sql,
        r"ADD COLUMN IF NOT EXISTS\s+longest_streak_ended_at\s+DATE",
        "0026 column added",
    )
    must_not_contain(sql, r"ALTER TABLE profiles\b", "0026 must not touch profiles")

    # We chose to extend user_profiles instead of creating user_streaks; that
    # decision needs to remain explicit so future readers don't add a parallel
    # table by mistake.
    must_not_contain(sql, r"CREATE TABLE\s+user_streaks", "0026 must not create user_streaks")


# ---------- cross-cutting assertions ----------

def test_no_migration_creates_time_logs() -> None:
    """SPEC reconciliation: time_logs must never be created. tracked_sessions
    is the canonical table. If a future hand re-introduces time_logs, this
    test catches it."""
    for name in NEW_MIGRATIONS:
        sql = read(name)
        must_not_contain(sql, r"CREATE TABLE\s+(IF NOT EXISTS\s+)?time_logs\b", f"{name} time_logs check")


def test_all_files_parse() -> None:
    """Belt-and-braces: parse every migration file in the directory, not just
    the new ones. Catches the case where adding 0021 accidentally breaks an
    earlier file (e.g., name collision in indexes)."""
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        # Skip the apply-helper file: it's a manual one-off, not a migration.
        if path.name == "APPLY_MISSING_IDEMPOTENT.sql":
            continue
        must_parse(path.read_text(encoding="utf-8"), path.name)


# ---------- runner ----------

TESTS = [
    test_0021_project_lifecycle,
    test_0022_task_completed_at,
    test_0023_v_task_status,
    test_0024_daily_targets,
    test_0025_saved_views,
    test_0026_streak_history,
    test_no_migration_creates_time_logs,
    test_all_files_parse,
]


def main() -> int:
    failures: list[tuple[str, str]] = []
    for t in TESTS:
        try:
            t()
            print(f"  PASS  {t.__name__}")
        except TestFailed as exc:
            print(f"  FAIL  {t.__name__}: {exc}")
            failures.append((t.__name__, str(exc)))
        except Exception as exc:  # noqa: BLE001
            print(f"  ERROR {t.__name__}: {type(exc).__name__}: {exc}")
            failures.append((t.__name__, repr(exc)))

    print()
    if failures:
        print(f"{len(failures)} of {len(TESTS)} tests FAILED")
        return 1
    print(f"All {len(TESTS)} tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
