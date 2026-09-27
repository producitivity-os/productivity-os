ALTER TABLE wiki_documents RENAME TO canvas_documents;
ALTER TABLE wiki_canvas_state RENAME TO canvas_state;
ALTER TABLE wiki_layers RENAME TO canvas_layers;
ALTER TABLE wiki_objects RENAME TO canvas_objects;
ALTER TABLE wiki_previews RENAME TO canvas_previews;
ALTER TABLE media_entries RENAME COLUMN wiki_id TO canvas_id;

ALTER TABLE canvas_documents ADD COLUMN canvas_type TEXT NOT NULL DEFAULT 'base';

DROP INDEX IF EXISTS wiki_documents_updated_at_idx;
DROP INDEX IF EXISTS wiki_objects_type_idx;
DROP INDEX IF EXISTS wiki_objects_layer_idx;
DROP INDEX IF EXISTS media_entries_wiki_created_idx;

CREATE INDEX canvas_documents_updated_at_idx ON canvas_documents(updated_at DESC);
CREATE INDEX canvas_objects_type_idx ON canvas_objects(object_type);
CREATE INDEX canvas_objects_layer_idx ON canvas_objects(document_id, layer_id, sort_index);
CREATE INDEX media_entries_canvas_created_idx ON media_entries(canvas_id, created_at DESC, id DESC);
