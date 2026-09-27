CREATE TABLE card_templates (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    width REAL NOT NULL,
    height REAL NOT NULL,
    fields_json TEXT NOT NULL,
    elements_json TEXT NOT NULL,
    bindings_json TEXT NOT NULL,
    built_in INTEGER NOT NULL DEFAULT 0,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE card_template_instances (
    document_id TEXT NOT NULL REFERENCES canvas_documents(id) ON DELETE CASCADE,
    instance_id TEXT NOT NULL,
    template_id TEXT NOT NULL,
    PRIMARY KEY (document_id, instance_id)
);

CREATE INDEX card_templates_updated_at_idx ON card_templates(updated_at DESC, id ASC);
CREATE INDEX card_template_instances_template_idx ON card_template_instances(template_id);
