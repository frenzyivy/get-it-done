-- SPEC § Data model changes — saved_views.
--
-- A user-named filter combination per view type. Lets Komal jump back to
-- "Get-it-done · Dev" or "Allianza · Outreach" without rebuilding chips
-- every time. The Quick-add bar reads the active view's filters for sticky
-- inheritance.

CREATE TABLE IF NOT EXISTS saved_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  view_type   TEXT NOT NULL
    CHECK (view_type IN ('board','list','priority','calendar')),
  -- example: {"projects": ["uuid1","uuid2"], "categories": ["uuid3"], "tags": ["#deep-work"]}
  filters     JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_pinned   BOOLEAN NOT NULL DEFAULT false,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name, view_type)
);

ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own saved_views" ON saved_views;
CREATE POLICY "Users manage own saved_views" ON saved_views
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_saved_views_user
  ON saved_views (user_id, view_type);

DROP TRIGGER IF EXISTS set_saved_views_updated_at ON saved_views;
CREATE TRIGGER set_saved_views_updated_at
  BEFORE UPDATE ON saved_views
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();
