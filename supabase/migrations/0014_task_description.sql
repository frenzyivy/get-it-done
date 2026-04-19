-- Feature 3 (edit drawer) — adds an optional long-form description to tasks.
-- Nullable; existing rows are unaffected.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS description TEXT;
