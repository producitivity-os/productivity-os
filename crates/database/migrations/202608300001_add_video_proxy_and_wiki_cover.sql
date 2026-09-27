ALTER TABLE media_entries ADD COLUMN proxy_key TEXT;
ALTER TABLE wiki_documents ADD COLUMN cover_media_id TEXT REFERENCES media_entries(id) ON DELETE SET NULL;
