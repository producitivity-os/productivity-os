use super::{Database, DatabaseError, now_millis};
use app_core::{
    CreateQuranCaptureRequestInput, HealthWaterDay, InitializeRevisionSessionInput,
    NutritionFoodEntry, QuranBookmark, QuranCaptureRequest, QuranCaptureRequestStatus,
    QuranReadingPosition, RevisionRating, RevisionSession, RevisionSessionGoal,
    RevisionSessionOrigin, RevisionSessionResult, RevisionSessionStatus, SaveHealthWaterInput,
    SaveNutritionFoodInput, SaveQuranBookmarkInput, SaveQuranReadingPositionInput,
    SaveRevisionSessionInput, SetRevisionSessionStatusInput,
};
use sqlx::Row;

impl Database {
    pub async fn list_quran_bookmarks(&self) -> Result<Vec<QuranBookmark>, DatabaseError> {
        let rows = sqlx::query(
            "SELECT id, surah_number, ayah_number, label, created_at, updated_at FROM quran_bookmarks ORDER BY surah_number, ayah_number, created_at",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.iter().map(quran_bookmark_from_row).collect())
    }

    pub async fn save_quran_bookmark(
        &self,
        input: SaveQuranBookmarkInput,
    ) -> Result<QuranBookmark, DatabaseError> {
        validate_quran_reference(input.surah_number, input.ayah_number)?;
        if input.id.trim().is_empty() {
            return Err(DatabaseError::InvalidQuranState(
                "bookmark id is required".into(),
            ));
        }
        let now = now_millis();
        sqlx::query(
            "INSERT INTO quran_bookmarks (id, surah_number, ayah_number, label, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET surah_number=excluded.surah_number, ayah_number=excluded.ayah_number, label=excluded.label, updated_at=excluded.updated_at",
        )
        .bind(input.id.trim())
        .bind(input.surah_number as i64)
        .bind(input.ayah_number as i64)
        .bind(input.label.trim())
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await?;
        let row = sqlx::query(
            "SELECT id, surah_number, ayah_number, label, created_at, updated_at FROM quran_bookmarks WHERE id=?",
        )
        .bind(input.id.trim())
        .fetch_one(&self.pool)
        .await?;
        Ok(quran_bookmark_from_row(&row))
    }

    pub async fn delete_quran_bookmark(&self, id: &str) -> Result<bool, DatabaseError> {
        Ok(sqlx::query("DELETE FROM quran_bookmarks WHERE id=?")
            .bind(id)
            .execute(&self.pool)
            .await?
            .rows_affected()
            > 0)
    }

    pub async fn quran_reading_position(
        &self,
    ) -> Result<Option<QuranReadingPosition>, DatabaseError> {
        let row = sqlx::query(
            "SELECT surah_number, ayah_number, updated_at FROM quran_reading_position WHERE singleton_id=1",
        )
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|row| QuranReadingPosition {
            surah_number: row.get::<i64, _>("surah_number") as u16,
            ayah_number: row.get::<i64, _>("ayah_number") as u16,
            updated_at: row.get("updated_at"),
        }))
    }

    pub async fn save_quran_reading_position(
        &self,
        input: SaveQuranReadingPositionInput,
    ) -> Result<QuranReadingPosition, DatabaseError> {
        validate_quran_reference(input.surah_number, input.ayah_number)?;
        let now = now_millis();
        sqlx::query(
            "INSERT INTO quran_reading_position (singleton_id, surah_number, ayah_number, updated_at) VALUES (1, ?, ?, ?) ON CONFLICT(singleton_id) DO UPDATE SET surah_number=excluded.surah_number, ayah_number=excluded.ayah_number, updated_at=excluded.updated_at",
        )
        .bind(input.surah_number as i64)
        .bind(input.ayah_number as i64)
        .bind(now)
        .execute(&self.pool)
        .await?;
        Ok(QuranReadingPosition {
            surah_number: input.surah_number,
            ayah_number: input.ayah_number,
            updated_at: now,
        })
    }

    pub async fn revision_session(
        &self,
        id: &str,
    ) -> Result<Option<RevisionSession>, DatabaseError> {
        let Some(row) = sqlx::query(
            "SELECT id, origin, workflow_id, node_id, notebook_id, goal_type, goal_value, elapsed_ms, status, total_cards, remaining_cards, reviewed_count, right_count, wrong_count, started_at, created_at, updated_at FROM revision_sessions WHERE id=?",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await? else {
            return Ok(None);
        };
        let result_rows = sqlx::query(
            "SELECT sequence, notebook_id, card_id, question, expected_answer, answer, correct, answered_at FROM revision_session_results WHERE session_id=? ORDER BY sequence ASC",
        )
        .bind(id)
        .fetch_all(&self.pool)
        .await?;
        let results = result_rows
            .iter()
            .map(revision_session_result_from_row)
            .collect::<Result<Vec<_>, _>>()?;
        revision_session_from_row(row, results).map(Some)
    }

    pub async fn save_revision_session(
        &self,
        input: SaveRevisionSessionInput,
    ) -> Result<RevisionSession, DatabaseError> {
        let valid_goal = match &input.goal {
            RevisionSessionGoal::Time { duration_ms } => {
                (60_000..=10_800_000).contains(duration_ms) && input.elapsed_ms <= *duration_ms
            }
            RevisionSessionGoal::Cards { card_count } => {
                (0..=10_000).contains(card_count) && input.elapsed_ms <= 86_400_000
            }
        };
        let valid_context = match input.origin {
            RevisionSessionOrigin::Workflow => {
                input
                    .workflow_id
                    .as_deref()
                    .is_some_and(|value| !value.trim().is_empty())
                    && input
                        .node_id
                        .as_deref()
                        .is_some_and(|value| !value.trim().is_empty())
            }
            RevisionSessionOrigin::Standalone => true,
        };
        if input.id.trim().is_empty()
            || !valid_context
            || !valid_goal
            || input.elapsed_ms < 0
            || input.total_cards < 0
            || input.remaining_cards < 0
            || input.reviewed_count < 0
            || input.right_count < 0
            || input.wrong_count < 0
        {
            return Err(DatabaseError::InvalidRevisionSession(
                "revision session fields are invalid".into(),
            ));
        }
        let now = now_millis();
        let status = revision_session_status_str(input.status);
        let (goal_type, goal_value) = revision_session_goal_columns(&input.goal);
        sqlx::query(
            "INSERT INTO revision_sessions (id, origin, workflow_id, node_id, notebook_id, goal_type, goal_value, elapsed_ms, status, total_cards, remaining_cards, reviewed_count, right_count, wrong_count, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET notebook_id=excluded.notebook_id, elapsed_ms=CASE WHEN revision_sessions.status='paused' AND excluded.status='running' THEN revision_sessions.elapsed_ms ELSE MAX(revision_sessions.elapsed_ms, excluded.elapsed_ms) END, status=CASE WHEN revision_sessions.status IN ('completed', 'cancelled') THEN revision_sessions.status WHEN revision_sessions.status='paused' AND excluded.status='running' THEN revision_sessions.status ELSE excluded.status END, total_cards=CASE WHEN revision_sessions.total_cards=0 THEN excluded.total_cards ELSE revision_sessions.total_cards END, remaining_cards=CASE WHEN revision_sessions.total_cards=0 THEN excluded.remaining_cards ELSE revision_sessions.remaining_cards END, reviewed_count=revision_sessions.reviewed_count, right_count=revision_sessions.right_count, wrong_count=revision_sessions.wrong_count, started_at=CASE WHEN revision_sessions.status IN ('completed', 'cancelled') THEN NULL WHEN revision_sessions.status='paused' AND excluded.status='running' THEN revision_sessions.started_at ELSE excluded.started_at END, updated_at=MAX(revision_sessions.updated_at + 1, excluded.updated_at)",
        )
        .bind(&input.id)
        .bind(revision_session_origin_str(input.origin))
        .bind(&input.workflow_id)
        .bind(&input.node_id)
        .bind(&input.notebook_id)
        .bind(goal_type)
        .bind(goal_value)
        .bind(input.elapsed_ms)
        .bind(status)
        .bind(input.total_cards)
        .bind(input.remaining_cards)
        .bind(input.reviewed_count)
        .bind(input.right_count)
        .bind(input.wrong_count)
        .bind(input.started_at)
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await?;
        self.revision_session(&input.id)
            .await?
            .ok_or_else(|| DatabaseError::InvalidRevisionSession("session was not saved".into()))
    }

    pub async fn initialize_revision_session(
        &self,
        input: InitializeRevisionSessionInput,
    ) -> Result<RevisionSession, DatabaseError> {
        if input.id.trim().is_empty()
            || input.total_cards < 0
            || input.remaining_cards < 0
            || input.remaining_cards > input.total_cards
        {
            return Err(DatabaseError::InvalidRevisionSession(
                "revision session card totals are invalid".into(),
            ));
        }
        let now = now_millis();
        let result = sqlx::query(
            "UPDATE revision_sessions SET total_cards=?, remaining_cards=?, status=CASE WHEN ?=0 THEN 'completed' ELSE status END, started_at=CASE WHEN ?=0 THEN NULL ELSE started_at END, updated_at=MAX(updated_at + 1, ?) WHERE id=? AND total_cards=0 AND reviewed_count=0 AND status NOT IN ('completed', 'cancelled')",
        )
        .bind(input.total_cards)
        .bind(input.remaining_cards)
        .bind(input.remaining_cards)
        .bind(input.remaining_cards)
        .bind(now)
        .bind(input.id.trim())
        .execute(&self.pool)
        .await?;
        let session = self
            .revision_session(input.id.trim())
            .await?
            .ok_or_else(|| {
                DatabaseError::InvalidRevisionSession("session does not exist".into())
            })?;
        if result.rows_affected() == 0
            && session.total_cards == 0
            && session.status != RevisionSessionStatus::Completed
        {
            return Err(DatabaseError::InvalidRevisionSession(
                "revision session could not be initialized".into(),
            ));
        }
        Ok(session)
    }

    pub async fn set_revision_session_status(
        &self,
        input: SetRevisionSessionStatusInput,
    ) -> Result<RevisionSession, DatabaseError> {
        if input.id.trim().is_empty()
            || !matches!(
                input.status,
                RevisionSessionStatus::Running
                    | RevisionSessionStatus::Paused
                    | RevisionSessionStatus::Cancelled
            )
        {
            return Err(DatabaseError::InvalidRevisionSession(
                "revision session status transition is invalid".into(),
            ));
        }
        let now = now_millis();
        let status = revision_session_status_str(input.status);
        let result = sqlx::query(
            "UPDATE revision_sessions SET elapsed_ms=CASE WHEN status='running' THEN MIN(CASE WHEN goal_type='time' THEN goal_value ELSE 86400000 END, elapsed_ms + MAX(0, ? - COALESCE(started_at, ?))) ELSE elapsed_ms END, status=?, started_at=CASE WHEN ?='running' THEN ? ELSE NULL END, updated_at=MAX(updated_at + 1, ?) WHERE id=? AND ((status='running' AND ? IN ('paused', 'cancelled')) OR (status='paused' AND ? IN ('running', 'cancelled')))",
        )
        .bind(now)
        .bind(now)
        .bind(status)
        .bind(status)
        .bind(now)
        .bind(now)
        .bind(input.id.trim())
        .bind(status)
        .bind(status)
        .execute(&self.pool)
        .await?;
        if result.rows_affected() == 0 {
            return Err(DatabaseError::InvalidRevisionSession(
                "revision session status transition is invalid".into(),
            ));
        }
        self.revision_session(input.id.trim())
            .await?
            .ok_or_else(|| DatabaseError::InvalidRevisionSession("session does not exist".into()))
    }

    pub async fn create_quran_capture_request(
        &self,
        input: CreateQuranCaptureRequestInput,
    ) -> Result<QuranCaptureRequest, DatabaseError> {
        if input.id.trim().is_empty()
            || input.workflow_id.trim().is_empty()
            || input.node_id.trim().is_empty()
            || input.recording_id.trim().is_empty()
            || input.surah_name.trim().is_empty()
            || input.end_surah_name.trim().is_empty()
            || input.replace_start_ms.is_some_and(|value| value < 0)
            || input.ayah_start == 0
            || !(app_core::QuranVerseRange {
                start: app_core::QuranVerseRef {
                    surah_number: input.surah_number,
                    ayah_number: input.ayah_start,
                },
                end: app_core::QuranVerseRef {
                    surah_number: input.end_surah_number,
                    ayah_number: input.ayah_end,
                },
            })
            .is_valid()
        {
            return Err(DatabaseError::InvalidQuranState(
                "Quran capture request is invalid".into(),
            ));
        }
        let now = now_millis();
        sqlx::query(
            "INSERT INTO quran_capture_requests (id, workflow_id, node_id, recording_id, replace_start_ms, surah_number, surah_name, ayah_start, end_surah_number, end_surah_name, ayah_end, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
        )
        .bind(input.id.trim())
        .bind(input.workflow_id.trim())
        .bind(input.node_id.trim())
        .bind(input.recording_id.trim())
        .bind(input.replace_start_ms)
        .bind(i64::from(input.surah_number))
        .bind(input.surah_name.trim())
        .bind(i64::from(input.ayah_start))
        .bind(i64::from(input.end_surah_number))
        .bind(input.end_surah_name.trim())
        .bind(i64::from(input.ayah_end))
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await?;
        self.quran_capture_request(input.id.trim())
            .await?
            .ok_or_else(|| DatabaseError::InvalidQuranState("capture request disappeared".into()))
    }

    pub async fn quran_capture_request(
        &self,
        id: &str,
    ) -> Result<Option<QuranCaptureRequest>, DatabaseError> {
        let row = sqlx::query(
            "SELECT id, workflow_id, node_id, recording_id, replace_start_ms, surah_number, surah_name, ayah_start, end_surah_number, end_surah_name, ayah_end, status, created_at, updated_at FROM quran_capture_requests WHERE id=?",
        )
        .bind(id.trim())
        .fetch_optional(&self.pool)
        .await?;
        row.map(|row| quran_capture_request_from_row(&row))
            .transpose()
    }

    pub async fn set_quran_capture_request_status(
        &self,
        id: &str,
        status: QuranCaptureRequestStatus,
    ) -> Result<QuranCaptureRequest, DatabaseError> {
        let now = now_millis();
        let changed = sqlx::query(
            "UPDATE quran_capture_requests SET status=?, updated_at=? WHERE id=? AND (\
             (status='pending' AND ? IN ('recording', 'paused', 'cancelled', 'failed')) OR \
             (status='recording' AND ? IN ('paused', 'ready', 'cancelled', 'failed')) OR \
             (status='paused' AND ? IN ('recording', 'ready', 'checking', 'cancelled', 'failed')) OR \
             (status='ready' AND ? IN ('recording', 'checking', 'paused', 'cancelled', 'failed')) OR \
             (status='checking' AND ? IN ('recording', 'paused', 'completed', 'cancelled', 'failed')) OR \
             (status=?))",
        )
        .bind(quran_capture_request_status_str(status))
        .bind(now)
        .bind(id.trim())
        .bind(quran_capture_request_status_str(status))
        .bind(quran_capture_request_status_str(status))
        .bind(quran_capture_request_status_str(status))
        .bind(quran_capture_request_status_str(status))
        .bind(quran_capture_request_status_str(status))
        .bind(quran_capture_request_status_str(status))
        .execute(&self.pool)
        .await?
        .rows_affected();
        if changed == 0 {
            return Err(DatabaseError::InvalidQuranState(
                "capture request cannot change status".into(),
            ));
        }
        self.quran_capture_request(id)
            .await?
            .ok_or_else(|| DatabaseError::InvalidQuranState("capture request disappeared".into()))
    }

    pub async fn health_water_day(
        &self,
        local_date: &str,
    ) -> Result<HealthWaterDay, DatabaseError> {
        let date = local_date.trim();
        if date.is_empty() {
            return Err(DatabaseError::InvalidHealthWater(
                "local date is required".into(),
            ));
        }
        let now = now_millis();
        sqlx::query(
            "INSERT INTO health_water_daily (local_date, target_milliliters, intake_milliliters, updated_at) VALUES (?, 2000, 0, ?) ON CONFLICT(local_date) DO NOTHING",
        )
        .bind(date)
        .bind(now)
        .execute(&self.pool)
        .await?;
        self.load_health_water_day(date).await
    }

    pub async fn save_health_water(
        &self,
        input: SaveHealthWaterInput,
    ) -> Result<HealthWaterDay, DatabaseError> {
        let date = input.local_date.trim();
        if date.is_empty() {
            return Err(DatabaseError::InvalidHealthWater(
                "local date is required".into(),
            ));
        }
        if !(250..=10_000).contains(&input.target_milliliters)
            || input.target_milliliters % 250 != 0
        {
            return Err(DatabaseError::InvalidHealthWater(
                "target must be between 0.25 L and 10 L in 0.25 L increments".into(),
            ));
        }
        if input.intake_milliliters < 0 {
            return Err(DatabaseError::InvalidHealthWater(
                "intake must be zero or a positive milliliter amount".into(),
            ));
        }
        let now = now_millis();
        sqlx::query(
            "INSERT INTO health_water_daily (local_date, target_milliliters, intake_milliliters, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(local_date) DO UPDATE SET target_milliliters=excluded.target_milliliters, intake_milliliters=excluded.intake_milliliters, updated_at=excluded.updated_at",
        )
        .bind(date)
        .bind(input.target_milliliters)
        .bind(input.intake_milliliters)
        .bind(now)
        .execute(&self.pool)
        .await?;
        self.load_health_water_day(date).await
    }

    async fn load_health_water_day(
        &self,
        local_date: &str,
    ) -> Result<HealthWaterDay, DatabaseError> {
        let row = sqlx::query(
            "SELECT local_date, target_milliliters, intake_milliliters, updated_at FROM health_water_daily WHERE local_date=?",
        )
        .bind(local_date)
        .fetch_one(&self.pool)
        .await?;
        Ok(HealthWaterDay {
            local_date: row.get("local_date"),
            target_milliliters: row.get("target_milliliters"),
            intake_milliliters: row.get("intake_milliliters"),
            updated_at: row.get("updated_at"),
        })
    }

    pub async fn list_nutrition_food(
        &self,
        local_date: &str,
    ) -> Result<Vec<NutritionFoodEntry>, DatabaseError> {
        let date = local_date.trim();
        if date.is_empty() {
            return Err(DatabaseError::InvalidNutritionFood(
                "local date is required".into(),
            ));
        }
        let rows = sqlx::query(
            "SELECT id, local_date, meal_name, quantity, workflow_id, node_id, logged_at FROM nutrition_food_entries WHERE local_date=? ORDER BY logged_at DESC, id DESC",
        )
        .bind(date)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.iter().map(nutrition_food_from_row).collect())
    }

    pub async fn save_nutrition_food(
        &self,
        input: SaveNutritionFoodInput,
    ) -> Result<NutritionFoodEntry, DatabaseError> {
        if input.id.trim().is_empty()
            || input.local_date.trim().is_empty()
            || input.meal_name.trim().is_empty()
            || input.quantity <= 0
            || input.workflow_id.trim().is_empty()
            || input.node_id.trim().is_empty()
            || input.logged_at <= 0
        {
            return Err(DatabaseError::InvalidNutritionFood(
                "food log fields are invalid".into(),
            ));
        }
        sqlx::query(
            "INSERT INTO nutrition_food_entries (id, local_date, meal_name, quantity, workflow_id, node_id, logged_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET local_date=excluded.local_date, meal_name=excluded.meal_name, quantity=excluded.quantity, workflow_id=excluded.workflow_id, node_id=excluded.node_id, logged_at=excluded.logged_at",
        )
        .bind(input.id.trim())
        .bind(input.local_date.trim())
        .bind(input.meal_name.trim())
        .bind(input.quantity)
        .bind(input.workflow_id.trim())
        .bind(input.node_id.trim())
        .bind(input.logged_at)
        .execute(&self.pool)
        .await?;
        let row = sqlx::query(
            "SELECT id, local_date, meal_name, quantity, workflow_id, node_id, logged_at FROM nutrition_food_entries WHERE id=?",
        )
        .bind(input.id.trim())
        .fetch_one(&self.pool)
        .await?;
        Ok(nutrition_food_from_row(&row))
    }
}

fn nutrition_food_from_row(row: &sqlx::sqlite::SqliteRow) -> NutritionFoodEntry {
    NutritionFoodEntry {
        id: row.get("id"),
        local_date: row.get("local_date"),
        meal_name: row.get("meal_name"),
        quantity: row.get("quantity"),
        workflow_id: row.get("workflow_id"),
        node_id: row.get("node_id"),
        logged_at: row.get("logged_at"),
    }
}

fn validate_quran_reference(surah_number: u16, ayah_number: u16) -> Result<(), DatabaseError> {
    if ayah_number == 0
        || app_core::quran_ayah_count(surah_number).is_none_or(|count| ayah_number > count)
    {
        return Err(DatabaseError::InvalidQuranState(
            "invalid Surah or ayah".into(),
        ));
    }
    Ok(())
}

fn quran_bookmark_from_row(row: &sqlx::sqlite::SqliteRow) -> QuranBookmark {
    QuranBookmark {
        id: row.get("id"),
        surah_number: row.get::<i64, _>("surah_number") as u16,
        ayah_number: row.get::<i64, _>("ayah_number") as u16,
        label: row.get("label"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn quran_capture_request_status_str(status: QuranCaptureRequestStatus) -> &'static str {
    match status {
        QuranCaptureRequestStatus::Pending => "pending",
        QuranCaptureRequestStatus::Recording => "recording",
        QuranCaptureRequestStatus::Paused => "paused",
        QuranCaptureRequestStatus::Ready | QuranCaptureRequestStatus::Saved => "ready",
        QuranCaptureRequestStatus::Checking => "checking",
        QuranCaptureRequestStatus::Completed => "completed",
        QuranCaptureRequestStatus::Cancelled => "cancelled",
        QuranCaptureRequestStatus::Failed => "failed",
    }
}

fn quran_capture_request_from_row(
    row: &sqlx::sqlite::SqliteRow,
) -> Result<QuranCaptureRequest, DatabaseError> {
    let status = match row.get::<String, _>("status").as_str() {
        "pending" => QuranCaptureRequestStatus::Pending,
        "recording" => QuranCaptureRequestStatus::Recording,
        "paused" => QuranCaptureRequestStatus::Paused,
        "ready" | "saved" => QuranCaptureRequestStatus::Ready,
        "checking" => QuranCaptureRequestStatus::Checking,
        "completed" => QuranCaptureRequestStatus::Completed,
        "cancelled" => QuranCaptureRequestStatus::Cancelled,
        "failed" => QuranCaptureRequestStatus::Failed,
        value => {
            return Err(DatabaseError::InvalidQuranState(format!(
                "unknown capture request status {value}"
            )));
        }
    };
    Ok(QuranCaptureRequest {
        id: row.get("id"),
        workflow_id: row.get("workflow_id"),
        node_id: row.get("node_id"),
        recording_id: row.get("recording_id"),
        replace_start_ms: row.get("replace_start_ms"),
        surah_number: row.get::<i64, _>("surah_number") as u16,
        surah_name: row.get("surah_name"),
        ayah_start: row.get::<i64, _>("ayah_start") as u16,
        end_surah_number: row.get::<i64, _>("end_surah_number") as u16,
        end_surah_name: row.get("end_surah_name"),
        ayah_end: row.get::<i64, _>("ayah_end") as u16,
        status,
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}

fn revision_session_status_str(status: RevisionSessionStatus) -> &'static str {
    match status {
        RevisionSessionStatus::Idle => "idle",
        RevisionSessionStatus::Running => "running",
        RevisionSessionStatus::Paused => "paused",
        RevisionSessionStatus::Completed => "completed",
        RevisionSessionStatus::Cancelled => "cancelled",
    }
}

fn revision_session_origin_str(origin: RevisionSessionOrigin) -> &'static str {
    match origin {
        RevisionSessionOrigin::Workflow => "workflow",
        RevisionSessionOrigin::Standalone => "standalone",
    }
}

fn revision_session_goal_columns(goal: &RevisionSessionGoal) -> (&'static str, i64) {
    match goal {
        RevisionSessionGoal::Time { duration_ms } => ("time", *duration_ms),
        RevisionSessionGoal::Cards { card_count } => ("cards", *card_count),
    }
}

fn revision_session_from_row(
    row: sqlx::sqlite::SqliteRow,
    results: Vec<RevisionSessionResult>,
) -> Result<RevisionSession, DatabaseError> {
    let status = match row.get::<String, _>("status").as_str() {
        "idle" => RevisionSessionStatus::Idle,
        "running" => RevisionSessionStatus::Running,
        "paused" => RevisionSessionStatus::Paused,
        "completed" => RevisionSessionStatus::Completed,
        "cancelled" => RevisionSessionStatus::Cancelled,
        value => {
            return Err(DatabaseError::InvalidRevisionSession(format!(
                "unknown revision session status {value}"
            )));
        }
    };
    let goal = match row.get::<String, _>("goal_type").as_str() {
        "time" => RevisionSessionGoal::Time {
            duration_ms: row.get("goal_value"),
        },
        "cards" => RevisionSessionGoal::Cards {
            card_count: row.get("goal_value"),
        },
        value => {
            return Err(DatabaseError::InvalidRevisionSession(format!(
                "unknown revision session goal {value}"
            )));
        }
    };
    let origin = match row.get::<String, _>("origin").as_str() {
        "workflow" => RevisionSessionOrigin::Workflow,
        "standalone" => RevisionSessionOrigin::Standalone,
        value => {
            return Err(DatabaseError::InvalidRevisionSession(format!(
                "unknown revision session origin {value}"
            )));
        }
    };
    Ok(RevisionSession {
        id: row.get("id"),
        origin,
        workflow_id: row.get("workflow_id"),
        node_id: row.get("node_id"),
        notebook_id: row.get("notebook_id"),
        goal,
        elapsed_ms: row.get("elapsed_ms"),
        status,
        total_cards: row.get("total_cards"),
        remaining_cards: row.get("remaining_cards"),
        reviewed_count: row.get("reviewed_count"),
        right_count: row.get("right_count"),
        wrong_count: row.get("wrong_count"),
        started_at: row.get("started_at"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        results,
    })
}

fn revision_session_result_from_row(
    row: &sqlx::sqlite::SqliteRow,
) -> Result<RevisionSessionResult, DatabaseError> {
    let answer = match row.get::<String, _>("answer").as_str() {
        "again" => RevisionRating::Again,
        "hard" => RevisionRating::Hard,
        "good" => RevisionRating::Good,
        "easy" => RevisionRating::Easy,
        value => {
            return Err(DatabaseError::InvalidRevisionSession(format!(
                "unknown revision session answer {value}"
            )));
        }
    };
    Ok(RevisionSessionResult {
        sequence: row.get("sequence"),
        notebook_id: row.get("notebook_id"),
        card_id: row.get("card_id"),
        question: row.get("question"),
        expected_answer: row.get("expected_answer"),
        answer,
        correct: row.get::<i64, _>("correct") != 0,
        answered_at: row.get("answered_at"),
    })
}
