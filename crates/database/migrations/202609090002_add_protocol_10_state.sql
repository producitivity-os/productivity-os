CREATE TABLE revision_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    workflow_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    notebook_id TEXT,
    duration_ms INTEGER NOT NULL,
    elapsed_ms INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle', 'running', 'paused', 'completed')),
    queue_size INTEGER NOT NULL DEFAULT 0,
    reviewed_count INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX revision_sessions_workflow_node_idx
ON revision_sessions(workflow_id, node_id, updated_at DESC);

CREATE TABLE quran_bookmarks (
    id TEXT PRIMARY KEY NOT NULL,
    surah_number INTEGER NOT NULL,
    ayah_number INTEGER NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE quran_reading_position (
    singleton_id INTEGER PRIMARY KEY NOT NULL CHECK(singleton_id = 1),
    surah_number INTEGER NOT NULL,
    ayah_number INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE health_water_daily (
    local_date TEXT PRIMARY KEY NOT NULL,
    target_milliliters INTEGER NOT NULL DEFAULT 2000,
    intake_milliliters INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
);

CREATE TABLE workflow_notifications (
    id TEXT PRIMARY KEY NOT NULL,
    workflow_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    read_at INTEGER,
    created_at INTEGER NOT NULL
);

CREATE INDEX workflow_notifications_created_idx
ON workflow_notifications(created_at DESC);

INSERT OR IGNORE INTO plugin_installations (plugin_id, installed, installed_at)
VALUES
  ('workflows.health-nodes', 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('workflows.revise-nodes', 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000);
