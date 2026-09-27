ALTER TABLE revision_sessions RENAME TO revision_sessions_legacy;

DROP INDEX IF EXISTS revision_sessions_workflow_node_idx;

CREATE TABLE revision_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    workflow_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    notebook_id TEXT,
    goal_type TEXT NOT NULL DEFAULT 'time' CHECK(goal_type IN ('time', 'cards')),
    goal_value INTEGER NOT NULL,
    elapsed_ms INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle', 'running', 'paused', 'completed', 'cancelled')),
    total_cards INTEGER NOT NULL DEFAULT 0,
    remaining_cards INTEGER NOT NULL DEFAULT 0,
    reviewed_count INTEGER NOT NULL DEFAULT 0,
    right_count INTEGER NOT NULL DEFAULT 0,
    wrong_count INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

INSERT INTO revision_sessions (
    id, workflow_id, node_id, notebook_id, goal_type, goal_value,
    elapsed_ms, status, total_cards, remaining_cards, reviewed_count,
    right_count, wrong_count, started_at, created_at, updated_at
)
SELECT
    id, workflow_id, node_id, notebook_id, 'time', duration_ms,
    elapsed_ms, status, queue_size + reviewed_count, queue_size, reviewed_count,
    0, 0, started_at, created_at, updated_at
FROM revision_sessions_legacy;

DROP TABLE revision_sessions_legacy;

CREATE INDEX revision_sessions_workflow_node_idx
ON revision_sessions(workflow_id, node_id, updated_at DESC);

CREATE TABLE revision_session_results (
    session_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    notebook_id TEXT NOT NULL,
    card_id TEXT NOT NULL,
    question TEXT NOT NULL,
    expected_answer TEXT NOT NULL,
    answer TEXT NOT NULL CHECK(answer IN ('again', 'hard', 'good', 'easy')),
    correct INTEGER NOT NULL CHECK(correct IN (0, 1)),
    answered_at INTEGER NOT NULL,
    PRIMARY KEY(session_id, sequence),
    FOREIGN KEY(session_id) REFERENCES revision_sessions(id) ON DELETE CASCADE
);

CREATE INDEX revision_session_results_session_idx
ON revision_session_results(session_id, sequence ASC);
