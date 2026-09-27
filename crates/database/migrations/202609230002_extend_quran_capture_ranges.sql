ALTER TABLE quran_capture_requests RENAME TO quran_capture_requests_single_surah;
DROP INDEX IF EXISTS quran_capture_requests_status_idx;

CREATE TABLE quran_capture_requests (
    id TEXT PRIMARY KEY NOT NULL,
    workflow_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    recording_id TEXT NOT NULL,
    replace_start_ms INTEGER,
    surah_number INTEGER NOT NULL,
    surah_name TEXT NOT NULL,
    ayah_start INTEGER NOT NULL,
    end_surah_number INTEGER NOT NULL,
    end_surah_name TEXT NOT NULL,
    ayah_end INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'recording', 'paused', 'ready', 'checking', 'completed', 'cancelled', 'failed')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    CHECK(
        surah_number < end_surah_number
        OR (surah_number = end_surah_number AND ayah_start <= ayah_end)
    )
);

INSERT INTO quran_capture_requests (
    id, workflow_id, node_id, recording_id, replace_start_ms, surah_number,
    surah_name, ayah_start, end_surah_number, end_surah_name, ayah_end,
    status, created_at, updated_at
)
SELECT id, workflow_id, node_id, recording_id, replace_start_ms, surah_number,
       surah_name, ayah_start, surah_number, surah_name, ayah_end,
       status, created_at, updated_at
FROM quran_capture_requests_single_surah;

DROP TABLE quran_capture_requests_single_surah;

CREATE INDEX quran_capture_requests_status_idx
ON quran_capture_requests(status, updated_at DESC);

-- Standalone recordings use the shared content-addressed media service. This
-- hidden canvas is only a durable media owner and is excluded from catalogues.
INSERT OR IGNORE INTO canvas_documents (
    id, title, project, starred, created_at, updated_at, revision, icon,
    canvas_type, workflow_kind
) VALUES (
    'quran-recordings-library', 'Quran recordings', '__system__', 0,
    CAST(strftime('%s','now') AS INTEGER) * 1000,
    CAST(strftime('%s','now') AS INTEGER) * 1000,
    1, 'audio-lines', 'base', 'workflow'
);

INSERT OR IGNORE INTO canvas_state (
    document_id, active_layer_id, focused_layer_id, unfocused_layer_opacity,
    viewport_x, viewport_y, viewport_scale, schema_version
) VALUES ('quran-recordings-library', 'content', NULL, 0.35, 0, 0, 1, 1);

INSERT OR IGNORE INTO canvas_layers (
    document_id, layer_id, name, z_index, visible, opacity, interaction_color
) VALUES ('quran-recordings-library', 'content', 'Recordings', 0, 1, 1, 8660470);
