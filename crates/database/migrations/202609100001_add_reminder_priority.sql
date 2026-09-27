ALTER TABLE reminders
ADD COLUMN priority TEXT NOT NULL DEFAULT 'none'
CHECK(priority IN ('none', 'low', 'medium', 'high'));

ALTER TABLE reminders
ADD COLUMN due_has_time INTEGER NOT NULL DEFAULT 0;

UPDATE reminders
SET due_has_time = 1
WHERE due_at IS NOT NULL;

ALTER TABLE reminders
ADD COLUMN project_id TEXT REFERENCES canvas_documents(id) ON DELETE SET NULL;

CREATE INDEX idx_reminders_project
ON reminders(project_id, deleted_at, completed_at, sort_index);
