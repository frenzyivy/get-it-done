-- Categories + Projects — two new user-scoped label dimensions alongside tags.
-- Mirrors the shape of tags/task_tags (0002 + 0004). RLS identical to tags:
-- owner-scoped for the label tables, join rows gated by task ownership.
--
-- Visual & analytics weight: category > project > tag.

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own categories" ON categories
  FOR ALL USING (auth.uid() = user_id);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#7c3aed',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'archived')),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own projects" ON projects
  FOR ALL USING (auth.uid() = user_id);

CREATE TABLE task_categories (
  task_id     UUID NOT NULL REFERENCES tasks(id)      ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, category_id)
);

ALTER TABLE task_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own task_categories" ON task_categories
  FOR ALL USING (
    EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_categories.task_id AND tasks.user_id = auth.uid())
  );

CREATE TABLE task_projects (
  task_id    UUID NOT NULL REFERENCES tasks(id)    ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, project_id)
);

ALTER TABLE task_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own task_projects" ON task_projects
  FOR ALL USING (
    EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_projects.task_id AND tasks.user_id = auth.uid())
  );

CREATE INDEX idx_task_categories_task     ON task_categories(task_id);
CREATE INDEX idx_task_categories_category ON task_categories(category_id);
CREATE INDEX idx_task_projects_task       ON task_projects(task_id);
CREATE INDEX idx_task_projects_project    ON task_projects(project_id);
