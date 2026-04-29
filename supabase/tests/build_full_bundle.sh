#!/usr/bin/env bash
# Concatenate every migration except 0011_pg_cron_schedules.sql into a single
# SQL file that can be pasted into a fresh Supabase project's SQL Editor.
#
# 0011 needs a project-ref placeholder + deployed Edge Functions, which is out
# of scope for a schema-only verification.
#
# Usage:  bash supabase/tests/build_full_bundle.sh
# Output: supabase/tests/full_bundle.sql

set -euo pipefail

cd "$(dirname "$0")/../migrations"
OUT=../tests/full_bundle.sql

cat <<'HEADER' > "$OUT"
-- ============================================================================
-- Get-it-done — full schema bundle for a throwaway Supabase project
-- ============================================================================
-- Generated for verifying Phase 1, step 1 of the redesign SPEC. Concatenates
-- migrations 0001–0010 and 0012–0026 in order. Migration 0011 (pg_cron
-- schedules) is intentionally skipped: it requires project-ref placeholders
-- and Edge Function deploys, which aren't relevant to a schema-only check.
--
-- USAGE
-- -----
-- 1. Create a fresh Supabase project (Dashboard → New Project, free tier).
-- 2. SQL Editor → New query → paste this entire file → Run.
-- 3. Then paste-and-run supabase/tests/verify_phase1_step1.sql to confirm
--    the new shape from migrations 0021–0026 landed correctly.
-- 4. Delete the throwaway project when done.
--
-- This file is GENERATED. Do not edit; regenerate via:
--   bash supabase/tests/build_full_bundle.sh
-- ============================================================================
HEADER

for f in $(ls -1 [0-9][0-9][0-9][0-9]_*.sql | grep -v '^0011_'); do
  printf '\n-- ============================================================================\n-- %s\n-- ============================================================================\n' "$f" >> "$OUT"
  cat "$f" >> "$OUT"
done

echo "wrote $OUT ($(wc -l < "$OUT") lines)"
