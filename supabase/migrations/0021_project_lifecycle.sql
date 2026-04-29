-- SPEC § Data model changes — project lifecycle.
--
-- Migration 0019 created `projects` with status check ('active','paused','archived').
-- The redesign needs a 'completed' state (kept-but-hidden, distinct from 'archived'
-- which is hidden everywhere). Plus three columns the List-view squares and
-- audit-trail rely on: completed_at, archived_at, description.
--
-- Idempotent: safe to re-run after partial application.

-- 1. Add the new columns first so the back-fill below can populate them.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS description  TEXT;

-- 2. Widen the status check. Drop the old constraint, add the new one.
--    'paused' stays valid so existing rows from 0019 don't fail the check.
--    The UI treats 'paused' as a legacy synonym for 'active'.
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects
  ADD CONSTRAINT projects_status_check
  CHECK (status IN ('active', 'paused', 'completed', 'archived'));

-- 3. Index for the manage-projects-by-status filter and dropdown queries.
CREATE INDEX IF NOT EXISTS idx_projects_status
  ON projects (user_id, status);

-- 4. Back-fill timestamps for any rows that were already in a terminal state
--    when this migration runs. Uses created_at as a "best guess" stamp; this
--    only matters for analytics, not behavior.
UPDATE projects
   SET archived_at = COALESCE(archived_at, created_at)
 WHERE status = 'archived' AND archived_at IS NULL;
