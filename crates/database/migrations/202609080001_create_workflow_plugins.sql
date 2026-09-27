CREATE TABLE plugin_preferences (
    plugin_id TEXT NOT NULL,
    preference_key TEXT NOT NULL,
    value_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (plugin_id, preference_key)
);

CREATE TABLE quran_recordings (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL UNIQUE,
    workflow_id TEXT NOT NULL REFERENCES canvas_documents(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    media_id TEXT NOT NULL REFERENCES media_entries(id) ON DELETE CASCADE,
    surah_number INTEGER NOT NULL CHECK (surah_number BETWEEN 1 AND 114),
    surah_name TEXT NOT NULL,
    ayah_start INTEGER NOT NULL CHECK (ayah_start > 0),
    ayah_end INTEGER NOT NULL CHECK (ayah_end >= ayah_start),
    duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
    created_at INTEGER NOT NULL
);

CREATE INDEX quran_recordings_workflow_node_created_idx
ON quran_recordings(workflow_id, node_id, created_at DESC);

INSERT OR IGNORE INTO plugin_installations (plugin_id, installed, installed_at)
VALUES
  ('workflows.quran-nodes', 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('workflows.book-nodes', 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000);
