-- PLAN.md § 2.8 — save_time_session RPC
-- Atomic write across 3 tables: time_sessions (insert), tasks (increment total),
-- subtasks (increment total if subtask_id provided).
-- Called from the client via supabase.rpc('save_time_session', { ... }).

CREATE OR REPLACE FUNCTION save_time_session(
  p_task_id    UUID,
  p_subtask_id UUID,
  p_started_at TIMESTAMPTZ,
  p_duration   INTEGER,
  p_label      TEXT
) RETURNS void AS $$
BEGIN
  INSERT INTO time_sessions (task_id, subtask_id, started_at, duration_seconds, label)
  VALUES (p_task_id, p_subtask_id, p_started_at, p_duration, p_label);

  UPDATE tasks SET total_time_seconds = total_time_seconds + p_duration
  WHERE id = p_task_id;

  IF p_subtask_id IS NOT NULL THEN
    UPDATE subtasks SET total_time_seconds = total_time_seconds + p_duration
    WHERE id = p_subtask_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
