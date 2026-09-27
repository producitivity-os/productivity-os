ALTER TABLE quran_recordings RENAME TO quran_recordings_legacy;

DROP INDEX IF EXISTS quran_recordings_workflow_node_created_idx;

CREATE TABLE quran_recordings (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL UNIQUE,
    workflow_id TEXT NOT NULL REFERENCES canvas_documents(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    surah_number INTEGER NOT NULL CHECK (surah_number BETWEEN 1 AND 114),
    surah_name TEXT NOT NULL,
    ayah_start INTEGER NOT NULL CHECK (ayah_start > 0),
    ayah_end INTEGER NOT NULL CHECK (ayah_end >= ayah_start),
    duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

INSERT INTO quran_recordings (
    id, session_id, workflow_id, node_id, surah_number, surah_name,
    ayah_start, ayah_end, duration_ms, created_at, updated_at
)
SELECT
    id, session_id, workflow_id, node_id, surah_number, surah_name,
    ayah_start, ayah_end, duration_ms, created_at, created_at
FROM quran_recordings_legacy;

CREATE TABLE quran_recording_segments (
    id TEXT PRIMARY KEY NOT NULL,
    recording_id TEXT NOT NULL REFERENCES quran_recordings(id) ON DELETE CASCADE,
    media_id TEXT NOT NULL REFERENCES media_entries(id) ON DELETE RESTRICT,
    sequence INTEGER NOT NULL,
    start_ms INTEGER NOT NULL CHECK (start_ms >= 0),
    source_start_ms INTEGER NOT NULL CHECK (source_start_ms >= 0),
    duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
    waveform_peaks_json TEXT NOT NULL DEFAULT '[]',
    UNIQUE(recording_id, sequence)
);

INSERT INTO quran_recording_segments (
    id, recording_id, media_id, sequence, start_ms, source_start_ms,
    duration_ms, waveform_peaks_json
)
SELECT
    id || ':legacy', id, media_id, 0, 0, 0, duration_ms, '[]'
FROM quran_recordings_legacy;

DROP TABLE quran_recordings_legacy;

CREATE INDEX quran_recordings_workflow_node_updated_idx
ON quran_recordings(workflow_id, node_id, updated_at DESC);

CREATE INDEX quran_recording_segments_recording_idx
ON quran_recording_segments(recording_id, sequence ASC);
