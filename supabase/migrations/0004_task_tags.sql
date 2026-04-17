-- PLAN.md § 2.4 — task_tags (junction: tasks ↔ tags)

CREATE TABLE task_tags (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id  UUID NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

ALTER TABLE task_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own task_tags" ON task_tags
  FOR ALL USING (
    EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_tags.task_id AND tasks.user_id = auth.uid())
  );
