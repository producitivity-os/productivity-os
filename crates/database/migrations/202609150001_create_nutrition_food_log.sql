CREATE TABLE nutrition_food_entries (
    id TEXT PRIMARY KEY NOT NULL,
    local_date TEXT NOT NULL,
    meal_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    workflow_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    logged_at INTEGER NOT NULL
);

CREATE INDEX nutrition_food_entries_day_idx
ON nutrition_food_entries(local_date, logged_at DESC);
