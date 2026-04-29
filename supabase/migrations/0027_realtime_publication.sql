-- SPEC § Phase 1 step 2 — realtime channel for tracked_sessions.
--
-- The Now Tracking banner (Phase 4) subscribes to changes on tracked_sessions
-- so a session started in one tab immediately appears/updates in others.
-- Supabase Realtime gates this per-table via the `supabase_realtime`
-- publication. Tables created by migrations 0001–0026 were not added; this
-- migration adds tracked_sessions so the existing client subscription
-- (`supabase.channel('tracked_sessions')…`) starts receiving events.
--
-- Idempotent. ALTER PUBLICATION ... ADD TABLE raises 42710 ("relation is
-- already member of publication") on re-run, so we guard with a lookup
-- against pg_publication_tables.
--
-- Why a DO block instead of `ALTER PUBLICATION supabase_realtime ADD TABLE
-- IF NOT EXISTS`: Postgres' ADD TABLE has no IF NOT EXISTS form. The DO
-- block + pg_publication_tables check is the documented idiom.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname    = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename  = 'tracked_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tracked_sessions;
  END IF;
END $$;

-- Verification (informational; safe to re-run):
--   SELECT schemaname, tablename
--     FROM pg_publication_tables
--    WHERE pubname = 'supabase_realtime'
--      AND tablename = 'tracked_sessions';
-- Expect 1 row after this migration runs.
