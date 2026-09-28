CREATE TABLE card_tier_previews (
    document_id TEXT NOT NULL,
    card_id TEXT NOT NULL,
    tier_id TEXT NOT NULL,
    tier_revision INTEGER NOT NULL,
    data_url TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(document_id, card_id, tier_id),
    FOREIGN KEY(document_id) REFERENCES canvas_documents(id) ON DELETE CASCADE
);

CREATE INDEX card_tier_previews_card_idx
ON card_tier_previews(document_id, card_id);

DELETE FROM plugin_installations WHERE plugin_id = 'notes.question-card';
