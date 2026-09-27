CREATE TABLE persons (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT '',
    organization TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX persons_name_idx ON persons(normalized_name, name);
CREATE INDEX persons_updated_at_idx ON persons(updated_at DESC);

INSERT OR IGNORE INTO persons (
    id, name, normalized_name, role, organization, notes, created_at, updated_at
)
SELECT
    'person-' || o.object_id,
    trim(json_extract(o.payload_json, '$.pluginData.name')),
    lower(trim(json_extract(o.payload_json, '$.pluginData.name'))),
    coalesce(json_extract(o.payload_json, '$.pluginData.role'), ''),
    coalesce(json_extract(o.payload_json, '$.pluginData.organization'), ''),
    coalesce(json_extract(o.payload_json, '$.pluginData.notes'), ''),
    d.created_at,
    d.updated_at
FROM canvas_objects o
JOIN canvas_documents d ON d.id = o.document_id
WHERE d.canvas_type = 'notebook'
  AND json_extract(o.payload_json, '$.pluginId') = 'notes.person-card'
  AND length(trim(coalesce(json_extract(o.payload_json, '$.pluginData.name'), ''))) > 0;

INSERT OR IGNORE INTO persons (
    id, name, normalized_name, role, organization, notes, created_at, updated_at
)
SELECT
    'person-book-' || lower(hex(randomblob(16))),
    trim(json_extract(o.payload_json, '$.pluginData.author')),
    lower(trim(json_extract(o.payload_json, '$.pluginData.author'))),
    '',
    '',
    '',
    d.created_at,
    d.updated_at
FROM canvas_objects o
JOIN canvas_documents d ON d.id = o.document_id
WHERE d.canvas_type = 'notebook'
  AND json_extract(o.payload_json, '$.pluginId') = 'notes.book-card'
  AND length(trim(coalesce(json_extract(o.payload_json, '$.pluginData.author'), ''))) > 0;
