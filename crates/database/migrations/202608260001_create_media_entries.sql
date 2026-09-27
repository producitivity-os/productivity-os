CREATE TABLE media_entries (
    id TEXT PRIMARY KEY NOT NULL,
    wiki_id TEXT NOT NULL REFERENCES wiki_documents(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    media_kind TEXT NOT NULL CHECK (media_kind IN ('image', 'video', 'pdf', 'document', 'file')),
    size_bytes INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    thumbnail_key TEXT,
    width INTEGER,
    height INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (wiki_id, content_hash)
);

CREATE INDEX media_entries_wiki_created_idx ON media_entries(wiki_id, created_at DESC, id DESC);
CREATE INDEX media_entries_kind_created_idx ON media_entries(media_kind, created_at DESC, id DESC);
CREATE INDEX media_entries_storage_key_idx ON media_entries(storage_key);
