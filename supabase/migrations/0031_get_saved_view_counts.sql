-- Feature 06 — Saved view status counts.
--
-- One round-trip: returns todo / in_progress / done counts for every saved
-- view belonging to the user, applying each view's stored filter JSON to the
-- same effective_status the client uses (v_task_status, migration 0023).
-- Legacy tasks.status must not be referenced.
--
-- Filter semantics mirror lib/filters.ts matchesFilters():
--   - Empty array on a dimension means "no constraint".
--   - Across dimensions: AND.
--   - Within a dimension: OR (array overlap with `&&`).

CREATE OR REPLACE FUNCTION public.get_saved_view_counts(p_user_id uuid)
RETURNS TABLE (
  view_id     uuid,
  todo        integer,
  in_progress integer,
  done        integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  task_facts AS (
    SELECT
      t.id,
      t.priority,
      vs.effective_status,
      COALESCE(ARRAY(SELECT tp.project_id  FROM task_projects   tp WHERE tp.task_id = t.id), ARRAY[]::uuid[]) AS project_ids,
      COALESCE(ARRAY(SELECT tc.category_id FROM task_categories tc WHERE tc.task_id = t.id), ARRAY[]::uuid[]) AS category_ids,
      COALESCE(ARRAY(SELECT tt.tag_id      FROM task_tags       tt WHERE tt.task_id = t.id), ARRAY[]::uuid[]) AS tag_ids
    FROM tasks t
    JOIN v_task_status vs ON vs.id = t.id
    WHERE t.user_id = p_user_id
  ),
  view_filters AS (
    SELECT
      sv.id AS view_id,
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(sv.filters->'project_ids')),  ARRAY[]::text[])::uuid[] AS f_projects,
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(sv.filters->'category_ids')), ARRAY[]::text[])::uuid[] AS f_categories,
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(sv.filters->'tag_ids')),      ARRAY[]::text[])::uuid[] AS f_tags,
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(sv.filters->'priorities')),   ARRAY[]::text[])         AS f_priorities
    FROM saved_views sv
    WHERE sv.user_id = p_user_id
  )
  SELECT
    vf.view_id,
    COUNT(*) FILTER (WHERE tf.effective_status = 'todo')::int        AS todo,
    COUNT(*) FILTER (WHERE tf.effective_status = 'in_progress')::int AS in_progress,
    COUNT(*) FILTER (WHERE tf.effective_status = 'done')::int        AS done
  FROM view_filters vf
  LEFT JOIN task_facts tf
    ON  (cardinality(vf.f_projects)   = 0 OR tf.project_ids  && vf.f_projects)
    AND (cardinality(vf.f_categories) = 0 OR tf.category_ids && vf.f_categories)
    AND (cardinality(vf.f_tags)       = 0 OR tf.tag_ids      && vf.f_tags)
    AND (cardinality(vf.f_priorities) = 0 OR tf.priority = ANY(vf.f_priorities))
  GROUP BY vf.view_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_saved_view_counts(uuid) TO authenticated;
