ALTER TABLE canvas_documents ADD COLUMN workflow_kind TEXT NOT NULL DEFAULT 'workflow';

CREATE TABLE reminder_lists (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3B82F6',
    sort_index INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE reminders (
    id TEXT PRIMARY KEY NOT NULL,
    list_id TEXT NOT NULL REFERENCES reminder_lists(id),
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    due_at INTEGER,
    completed_at INTEGER,
    deleted_at INTEGER,
    sort_index INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX reminders_list_sort_idx ON reminders(list_id, sort_index, created_at);
CREATE INDEX reminders_due_idx ON reminders(due_at) WHERE deleted_at IS NULL;
CREATE INDEX reminders_completed_idx ON reminders(completed_at) WHERE deleted_at IS NULL;
CREATE INDEX reminders_deleted_idx ON reminders(deleted_at) WHERE deleted_at IS NOT NULL;

INSERT INTO reminder_lists (id, name, color, sort_index, created_at, updated_at)
VALUES ('reminders-inbox', 'Reminders', '#3B82F6', 0, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);
