CREATE TABLE media_cover_refs_v3 AS
SELECT id AS canvas_id, cover_media_id
FROM canvas_documents
WHERE cover_media_id IS NOT NULL;

UPDATE canvas_documents SET cover_media_id = NULL WHERE cover_media_id IS NOT NULL;

CREATE TABLE media_entries_v3 (
    id TEXT PRIMARY KEY NOT NULL,
    canvas_id TEXT REFERENCES canvas_documents(id) ON DELETE CASCADE,
    reminder_id TEXT REFERENCES reminders(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    media_kind TEXT NOT NULL CHECK (media_kind IN ('image', 'video', 'audio', 'pdf', 'document', 'file')),
    size_bytes INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    thumbnail_key TEXT,
    width INTEGER,
    height INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    proxy_key TEXT,
    CHECK ((canvas_id IS NOT NULL) <> (reminder_id IS NOT NULL)),
    UNIQUE (canvas_id, content_hash),
    UNIQUE (reminder_id, content_hash)
);

INSERT INTO media_entries_v3 (
    id, canvas_id, reminder_id, original_name, mime_type, media_kind, size_bytes,
    content_hash, storage_key, thumbnail_key, width, height, created_at,
    updated_at, proxy_key
)
SELECT
    id, canvas_id, NULL, original_name, mime_type, media_kind, size_bytes,
    content_hash, storage_key, thumbnail_key, width, height, created_at,
    updated_at, proxy_key
FROM media_entries;

DROP TABLE media_entries;
ALTER TABLE media_entries_v3 RENAME TO media_entries;

UPDATE canvas_documents
SET cover_media_id = (
    SELECT cover_media_id
    FROM media_cover_refs_v3
    WHERE media_cover_refs_v3.canvas_id = canvas_documents.id
)
WHERE id IN (SELECT canvas_id FROM media_cover_refs_v3);

DROP TABLE media_cover_refs_v3;

CREATE INDEX media_entries_canvas_created_idx ON media_entries(canvas_id, created_at DESC, id DESC);
CREATE INDEX media_entries_reminder_created_idx ON media_entries(reminder_id, created_at, id);
CREATE INDEX media_entries_kind_created_idx ON media_entries(media_kind, created_at DESC, id DESC);
CREATE INDEX media_entries_storage_key_idx ON media_entries(storage_key);
