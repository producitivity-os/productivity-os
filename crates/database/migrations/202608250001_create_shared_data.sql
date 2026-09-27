PRAGMA foreign_keys = ON;

CREATE TABLE wiki_documents (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    project TEXT NOT NULL,
    starred INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE wiki_canvas_state (
    document_id TEXT PRIMARY KEY NOT NULL REFERENCES wiki_documents(id) ON DELETE CASCADE,
    active_layer_id TEXT NOT NULL,
    focused_layer_id TEXT,
    unfocused_layer_opacity REAL NOT NULL DEFAULT 0.35,
    viewport_x REAL NOT NULL DEFAULT 0,
    viewport_y REAL NOT NULL DEFAULT 0,
    viewport_scale REAL NOT NULL DEFAULT 1,
    schema_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE wiki_layers (
    document_id TEXT NOT NULL REFERENCES wiki_documents(id) ON DELETE CASCADE,
    layer_id TEXT NOT NULL,
    name TEXT NOT NULL,
    z_index INTEGER NOT NULL,
    visible INTEGER NOT NULL DEFAULT 1,
    opacity REAL NOT NULL DEFAULT 1,
    interaction_color INTEGER NOT NULL DEFAULT 3896054,
    PRIMARY KEY (document_id, layer_id)
);

CREATE TABLE wiki_objects (
    document_id TEXT NOT NULL,
    object_id TEXT NOT NULL,
    layer_id TEXT NOT NULL,
    object_type TEXT NOT NULL,
    sort_index INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    PRIMARY KEY (document_id, object_id),
    FOREIGN KEY (document_id, layer_id) REFERENCES wiki_layers(document_id, layer_id) ON DELETE CASCADE
);

CREATE TABLE wiki_previews (
    document_id TEXT PRIMARY KEY NOT NULL REFERENCES wiki_documents(id) ON DELETE CASCADE,
    data_url TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE app_metadata (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);

CREATE INDEX wiki_documents_updated_at_idx ON wiki_documents(updated_at DESC);
CREATE INDEX wiki_objects_type_idx ON wiki_objects(object_type);
CREATE INDEX wiki_objects_layer_idx ON wiki_objects(document_id, layer_id, sort_index);
