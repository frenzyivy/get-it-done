-- Feature 02 — List View v2.
--
-- Read-only RPC returning one row per project with aggregate counts and
-- total tracked time. Joins v_task_status (migration 0023) so the server
-- computes the same `effective_status` the client uses (legacy tasks.status
-- is being retired and must not be referenced).
--
-- Not consumed by the UI in this PR — the List view continues to derive
-- these stats client-side from the in-memory Zustand store. Shipped now to
-- unblock future server-side aggregations.

CREATE OR REPLACE FUNCTION public.get_project_summary(p_user_id uuid)
RETURNS TABLE (
  project_id            uuid,
  tracked_total_seconds bigint,
  open_count            integer,
  done_count            integer,
  total_count           integer,
  progress_pct          integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id AS project_id,
    COALESCE(SUM(t.total_time_seconds), 0)::bigint AS tracked_total_seconds,
    COUNT(*) FILTER (WHERE vs.effective_status <> 'done')::int AS open_count,
    COUNT(*) FILTER (WHERE vs.effective_status =  'done')::int AS done_count,
    COUNT(t.id)::int AS total_count,
    CASE
      WHEN COUNT(t.id) = 0 THEN 0
      ELSE ROUND(
             100.0
             * COUNT(*) FILTER (WHERE vs.effective_status = 'done')
             / COUNT(t.id)
           )::int
    END AS progress_pct
  FROM projects p
  LEFT JOIN task_projects tp ON tp.project_id = p.id
  LEFT JOIN tasks         t  ON t.id = tp.task_id AND t.user_id = p_user_id
  LEFT JOIN v_task_status vs ON vs.id = t.id
  WHERE p.user_id = p_user_id
  GROUP BY p.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_project_summary(uuid) TO authenticated;
