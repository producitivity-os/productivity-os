CREATE TABLE revision_schedules (
    document_id TEXT NOT NULL REFERENCES canvas_documents(id) ON DELETE CASCADE,
    card_id TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 0,
    source_refs_json TEXT NOT NULL DEFAULT '[]',
    due_at INTEGER NOT NULL,
    last_review_at INTEGER,
    stability REAL,
    difficulty REAL,
    review_count INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (document_id, card_id)
);

CREATE TABLE revision_review_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT NOT NULL REFERENCES canvas_documents(id) ON DELETE CASCADE,
    card_id TEXT NOT NULL,
    rating TEXT NOT NULL,
    reviewed_at INTEGER NOT NULL,
    elapsed_days INTEGER NOT NULL,
    scheduled_days INTEGER NOT NULL,
    stability REAL NOT NULL,
    difficulty REAL NOT NULL
);

CREATE INDEX revision_schedules_due_idx ON revision_schedules(active, due_at, document_id);
CREATE INDEX revision_review_log_card_idx ON revision_review_log(document_id, card_id, reviewed_at DESC);
