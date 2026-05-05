-- Feature 15 — single round-trip aggregation for the Schedule Day header.
-- Returns total planned + tracked seconds for the user's local-tz day.
-- Tracked is closed sessions only; duration_seconds is already net of
-- break_seconds per Feature 05 (see migration 0031). The currently-running
-- session is added client-side from useLiveTimers() to drive the 1s tick
-- without burning a round trip per second.
--
-- Midnight-crossing sessions bin entirely on their started_at day to match
-- tracked_sessions.duration_seconds semantics used everywhere else (streaks,
-- project totals, insights). Same convention is applied to planned_blocks.

CREATE OR REPLACE FUNCTION public.get_day_stats(
  p_user_id  uuid,
  p_date     date,
  p_timezone text DEFAULT 'UTC'
)
RETURNS TABLE (
  planned_seconds bigint,
  tracked_seconds bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH day_window AS (
    SELECT
      (p_date::timestamp                    AT TIME ZONE p_timezone) AS day_start,
      ((p_date + INTERVAL '1 day')::timestamp AT TIME ZONE p_timezone) AS day_end
  ),
  planned AS (
    SELECT COALESCE(SUM(pb.duration_seconds), 0)::bigint AS s
    FROM planned_blocks pb, day_window dw
    WHERE pb.user_id = p_user_id
      AND pb.start_at >= dw.day_start
      AND pb.start_at <  dw.day_end
  ),
  tracked AS (
    SELECT COALESCE(SUM(ts.duration_seconds), 0)::bigint AS s
    FROM tracked_sessions ts, day_window dw
    WHERE ts.user_id = p_user_id
      AND ts.started_at >= dw.day_start
      AND ts.started_at <  dw.day_end
      AND ts.ended_at IS NOT NULL
  )
  SELECT planned.s, tracked.s FROM planned, tracked;
$$;

GRANT EXECUTE ON FUNCTION public.get_day_stats(uuid, date, text) TO authenticated;
