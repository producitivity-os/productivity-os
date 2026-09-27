UPDATE canvas_documents SET canvas_type = 'notebook' WHERE canvas_type = 'wiki';

CREATE TABLE plugin_installations (
    plugin_id TEXT PRIMARY KEY NOT NULL,
    installed INTEGER NOT NULL DEFAULT 1,
    installed_at INTEGER
);

INSERT OR IGNORE INTO plugin_installations (plugin_id, installed, installed_at)
VALUES ('notes.question-card', 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000);

CREATE INDEX plugin_installations_enabled_idx
ON plugin_installations(installed, plugin_id);
