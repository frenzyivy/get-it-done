-- PLAN.md § 2.6 — time_sessions
-- `label` is a snapshot of the subtask title at log time so it survives renames/deletes.

CREATE TABLE time_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  subtask_id UUID REFERENCES subtasks(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL,
  duration_seconds INTEGER NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE time_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own sessions" ON time_sessions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM tasks WHERE tasks.id = time_sessions.task_id AND tasks.user_id = auth.uid())
  );

CREATE INDEX idx_sessions_task    ON time_sessions(task_id);
CREATE INDEX idx_sessions_subtask ON time_sessions(subtask_id);
