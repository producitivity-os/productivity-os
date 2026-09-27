CREATE TABLE quran_recording_segments_backup AS
SELECT id, recording_id, media_id, sequence, start_ms, source_start_ms,
       duration_ms, waveform_peaks_json
FROM quran_recording_segments;

DROP TABLE quran_recording_segments;
ALTER TABLE quran_recordings RENAME TO quran_recordings_legacy;
DROP INDEX IF EXISTS quran_recordings_workflow_node_updated_idx;

CREATE TABLE quran_recordings (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL UNIQUE,
    origin TEXT NOT NULL DEFAULT 'workflow'
        CHECK(origin IN ('workflow', 'standalone')),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK(status IN ('draft', 'recording', 'paused', 'ready', 'checking', 'completed', 'cancelled', 'failed')),
    workflow_id TEXT REFERENCES canvas_documents(id) ON DELETE SET NULL,
    node_id TEXT,
    surah_number INTEGER NOT NULL CHECK (surah_number BETWEEN 1 AND 114),
    surah_name TEXT NOT NULL,
    ayah_start INTEGER NOT NULL CHECK (ayah_start > 0),
    end_surah_number INTEGER NOT NULL CHECK (end_surah_number BETWEEN 1 AND 114),
    end_surah_name TEXT NOT NULL,
    ayah_end INTEGER NOT NULL CHECK (ayah_end > 0),
    duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    CHECK(
        (origin = 'workflow' AND workflow_id IS NOT NULL AND node_id IS NOT NULL)
        OR origin = 'standalone'
    ),
    CHECK(
        surah_number < end_surah_number
        OR (surah_number = end_surah_number AND ayah_start <= ayah_end)
    )
);

INSERT INTO quran_recordings (
    id, session_id, origin, status, workflow_id, node_id, surah_number,
    surah_name, ayah_start, end_surah_number, end_surah_name, ayah_end,
    duration_ms, created_at, updated_at
)
SELECT id, session_id, 'workflow', 'completed', workflow_id, node_id,
       surah_number, surah_name, ayah_start, surah_number, surah_name,
       ayah_end, duration_ms, created_at, updated_at
FROM quran_recordings_legacy;

DROP TABLE quran_recordings_legacy;

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

INSERT INTO quran_recording_segments
SELECT id, recording_id, media_id, sequence, start_ms, source_start_ms,
       duration_ms, waveform_peaks_json
FROM quran_recording_segments_backup;

DROP TABLE quran_recording_segments_backup;

CREATE INDEX quran_recordings_workflow_node_updated_idx
ON quran_recordings(workflow_id, node_id, updated_at DESC);
CREATE INDEX quran_recordings_origin_status_updated_idx
ON quran_recordings(origin, status, updated_at DESC);
CREATE INDEX quran_recording_segments_recording_idx
ON quran_recording_segments(recording_id, sequence ASC);

CREATE TABLE quran_recording_boundaries (
    recording_id TEXT NOT NULL REFERENCES quran_recordings(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL,
    verse_key TEXT NOT NULL,
    start_ms INTEGER NOT NULL CHECK(start_ms >= 0),
    PRIMARY KEY(recording_id, sequence),
    UNIQUE(recording_id, verse_key)
);

CREATE TABLE quran_recording_mistakes (
    id TEXT PRIMARY KEY NOT NULL,
    recording_id TEXT NOT NULL REFERENCES quran_recordings(id) ON DELETE CASCADE,
    start_verse_key TEXT NOT NULL,
    start_word_position INTEGER NOT NULL CHECK(start_word_position > 0),
    end_verse_key TEXT NOT NULL,
    end_word_position INTEGER NOT NULL CHECK(end_word_position > 0),
    text_snapshot TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX quran_recording_mistakes_recording_idx
ON quran_recording_mistakes(recording_id, created_at ASC, id ASC);

CREATE TABLE quran_recitation_position (
    singleton_id INTEGER PRIMARY KEY NOT NULL CHECK(singleton_id = 1),
    surah_number INTEGER NOT NULL CHECK(surah_number BETWEEN 1 AND 114),
    ayah_number INTEGER NOT NULL CHECK(ayah_number > 0),
    recording_id TEXT NOT NULL REFERENCES quran_recordings(id) ON DELETE CASCADE,
    updated_at INTEGER NOT NULL
);

CREATE TABLE quran_content_pages (
    environment TEXT NOT NULL,
    mushaf_id INTEGER NOT NULL,
    page_number INTEGER NOT NULL CHECK(page_number BETWEEN 1 AND 604),
    response_json TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    PRIMARY KEY(environment, mushaf_id, page_number)
);

ALTER TABLE quran_capture_requests RENAME TO quran_capture_requests_legacy;
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
    ayah_end INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'recording', 'paused', 'ready', 'checking', 'completed', 'cancelled', 'failed')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

INSERT INTO quran_capture_requests (
    id, workflow_id, node_id, recording_id, replace_start_ms, surah_number,
    surah_name, ayah_start, ayah_end, status, created_at, updated_at
)
SELECT id, workflow_id, node_id, recording_id, replace_start_ms, surah_number,
       surah_name, ayah_start, ayah_end,
       CASE WHEN status = 'saved' THEN 'completed' ELSE status END,
       created_at, updated_at
FROM quran_capture_requests_legacy;

DROP TABLE quran_capture_requests_legacy;

CREATE INDEX quran_capture_requests_status_idx
ON quran_capture_requests(status, updated_at DESC);
