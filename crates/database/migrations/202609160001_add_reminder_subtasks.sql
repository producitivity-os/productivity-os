ALTER TABLE reminders
ADD COLUMN subtasks_json TEXT NOT NULL DEFAULT '[]';
