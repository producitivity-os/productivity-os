use std::collections::{BTreeMap, HashMap, HashSet};

use app_core::{
    CanvasType, ReviewRevisionCardInput, ReviewRevisionSessionCardInput, RevisionActivityDay,
    RevisionCard, RevisionCardKind, RevisionCardQuery, RevisionDashboard, RevisionDashboardBucket,
    RevisionDashboardPoint, RevisionDashboardQuery, RevisionDeckProgress, RevisionDeckSummary,
    RevisionForecastPoint, RevisionIntervalBucket, RevisionRating, RevisionScheduleResult,
    RevisionSessionOrigin, RevisionSessionReviewResult, RevisionSessionRun, RevisionSessionStatus,
    RevisionSourceReference, SaveCanvasInput, StartRevisionSessionInput,
};
use revision_scheduler::{RevisionScheduler, StoredMemoryState};
use serde_json::Value;
use sqlx::{QueryBuilder, Row, Sqlite, Transaction};

use crate::{Database, DatabaseError, now_millis};

const DAY_MILLIS: i64 = 86_400_000;

#[derive(Clone)]
struct QuestionCard {
    id: String,
    valid: bool,
}

impl Database {
    pub(crate) async fn sync_revision_schedules(
        &self,
        transaction: &mut Transaction<'_, Sqlite>,
        input: &SaveCanvasInput,
        now: i64,
    ) -> Result<(), DatabaseError> {
        let mut questions = HashMap::<String, QuestionCard>::new();
        let mut facts = HashMap::<String, RevisionSourceReference>::new();
        for object in &input.canvas.objects {
            if object.object_type != "card" {
                continue;
            }
            if is_revision_card(&object.payload) {
                questions.insert(
                    object.id.clone(),
                    QuestionCard {
                        id: object.id.clone(),
                        valid: valid_revision_card(&object.payload),
                    },
                );
            } else {
                facts.insert(
                    object.id.clone(),
                    RevisionSourceReference {
                        object_id: object.id.clone(),
                        label: fact_label(&object.payload),
                    },
                );
            }
        }

        let mut sources = HashMap::<String, Vec<RevisionSourceReference>>::new();
        for object in &input.canvas.objects {
            if object.object_type != "arrow" {
                continue;
            }
            let Some(start_id) = binding_id(&object.payload, "start") else {
                continue;
            };
            let Some(end_id) = binding_id(&object.payload, "end") else {
                continue;
            };
            if questions.contains_key(start_id) {
                if let Some(source) = facts.get(end_id) {
                    sources
                        .entry(start_id.into())
                        .or_default()
                        .push(source.clone());
                }
            }
            if questions.contains_key(end_id) {
                if let Some(source) = facts.get(start_id) {
                    sources
                        .entry(end_id.into())
                        .or_default()
                        .push(source.clone());
                }
            }
        }
        for references in sources.values_mut() {
            references.sort_by(|a, b| a.label.cmp(&b.label).then(a.object_id.cmp(&b.object_id)));
            references.dedup_by(|a, b| a.object_id == b.object_id);
        }

        sqlx::query("UPDATE revision_schedules SET active=0, updated_at=? WHERE document_id=?")
            .bind(now)
            .bind(&input.id)
            .execute(&mut **transaction)
            .await?;
        let notebook = input.canvas_type == CanvasType::Notebook;
        for question in questions.values() {
            let references = sources.get(&question.id).cloned().unwrap_or_default();
            let active = notebook && question.valid;
            sqlx::query(
                "INSERT INTO revision_schedules (document_id, card_id, active, source_refs_json, due_at, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(document_id, card_id) DO UPDATE SET \
                 active=excluded.active, source_refs_json=excluded.source_refs_json, updated_at=excluded.updated_at",
            )
            .bind(&input.id).bind(&question.id).bind(active as i64)
            .bind(serde_json::to_string(&references).expect("source references serialize"))
            .bind(now).bind(now).bind(now).execute(&mut **transaction).await?;
        }

        let retained: HashSet<&str> = questions.keys().map(String::as_str).collect();
        let existing = sqlx::query("SELECT card_id FROM revision_schedules WHERE document_id=?")
            .bind(&input.id)
            .fetch_all(&mut **transaction)
            .await?;
        for row in existing {
            let card_id: String = row.get("card_id");
            if !retained.contains(card_id.as_str()) {
                sqlx::query("DELETE FROM revision_schedules WHERE document_id=? AND card_id=?")
                    .bind(&input.id)
                    .bind(card_id)
                    .execute(&mut **transaction)
                    .await?;
            }
        }
        Ok(())
    }

    pub async fn list_revision_decks(&self) -> Result<Vec<RevisionDeckSummary>, DatabaseError> {
        let now = now_millis();
        let rows = sqlx::query(
            "SELECT d.id, d.title, d.project, COUNT(s.card_id) total_count, \
             COALESCE(SUM(CASE WHEN s.due_at <= ? THEN 1 ELSE 0 END), 0) due_count, \
             COALESCE(SUM(CASE WHEN s.review_count = 0 THEN 1 ELSE 0 END), 0) new_count \
             FROM canvas_documents d LEFT JOIN revision_schedules s ON s.document_id=d.id AND s.active=1 \
             WHERE d.canvas_type='notebook' GROUP BY d.id ORDER BY d.title COLLATE NOCASE ASC",
        ).bind(now).fetch_all(&self.pool).await?;
        Ok(rows
            .iter()
            .map(|row| RevisionDeckSummary {
                notebook_id: row.get("id"),
                title: row.get("title"),
                project: row.get("project"),
                total_count: row.get("total_count"),
                due_count: row.get("due_count"),
                new_count: row.get("new_count"),
            })
            .collect())
    }

    pub async fn list_revision_cards(
        &self,
        query: &RevisionCardQuery,
    ) -> Result<Vec<RevisionCard>, DatabaseError> {
        let mut builder = QueryBuilder::<Sqlite>::new(
            "SELECT d.id document_id, d.title document_title, o.object_id, o.payload_json, \
             l.layer_id, l.name layer_name, s.source_refs_json, s.due_at, s.last_review_at, \
             s.review_count, s.lapses FROM revision_schedules s \
             JOIN canvas_documents d ON d.id=s.document_id \
             JOIN canvas_objects o ON o.document_id=s.document_id AND o.object_id=s.card_id \
             JOIN canvas_layers l ON l.document_id=o.document_id AND l.layer_id=o.layer_id \
             WHERE s.active=1 AND d.canvas_type='notebook'",
        );
        if let Some(notebook_id) = query.notebook_id.as_deref() {
            builder.push(" AND d.id=").push_bind(notebook_id);
        }
        if query.due_only {
            builder.push(" AND s.due_at<=").push_bind(now_millis());
        }
        builder.push(" ORDER BY s.due_at ASC, d.title COLLATE NOCASE ASC, o.sort_index ASC");
        let rows = builder.build().fetch_all(&self.pool).await?;
        let mut cards = Vec::with_capacity(rows.len());
        for row in rows {
            let card_id: String = row.get("object_id");
            let payload: Value = serde_json::from_str(&row.get::<String, _>("payload_json"))
                .map_err(|source| DatabaseError::InvalidObjectJson {
                    object_id: card_id.clone(),
                    source,
                })?;
            let values = question_values(&payload);
            let kind = match values.get("revisionKind").and_then(Value::as_str) {
                Some("cloze") => RevisionCardKind::Cloze,
                _ => RevisionCardKind::Basic,
            };
            let sources = serde_json::from_str(&row.get::<String, _>("source_refs_json")).map_err(
                |source| DatabaseError::InvalidObjectJson {
                    object_id: card_id.clone(),
                    source,
                },
            )?;
            cards.push(RevisionCard {
                notebook_id: row.get("document_id"),
                notebook_title: row.get("document_title"),
                layer_id: row.get("layer_id"),
                layer_name: row.get("layer_name"),
                card_id,
                kind,
                front: string_field(values, "front"),
                back: string_field(values, "back"),
                cloze: string_field(values, "cloze"),
                sources,
                due_at: row.get("due_at"),
                last_review_at: row.get("last_review_at"),
                review_count: row.get("review_count"),
                lapses: row.get("lapses"),
            });
        }
        Ok(cards)
    }

    pub async fn start_revision_session(
        &self,
        input: &StartRevisionSessionInput,
    ) -> Result<RevisionSessionRun, DatabaseError> {
        if input.id.trim().is_empty() {
            return Err(DatabaseError::InvalidRevisionSession(
                "session id is required".into(),
            ));
        }
        if input.origin == RevisionSessionOrigin::Workflow
            && (input
                .workflow_id
                .as_deref()
                .is_none_or(|value| value.trim().is_empty())
                || input
                    .node_id
                    .as_deref()
                    .is_none_or(|value| value.trim().is_empty()))
        {
            return Err(DatabaseError::InvalidRevisionSession(
                "workflow sessions require a workflow and node".into(),
            ));
        }
        if input.origin == RevisionSessionOrigin::Standalone
            && self.active_standalone_revision_session().await?.is_some()
        {
            return Err(DatabaseError::InvalidRevisionSession(
                "resume or cancel the active standalone session first".into(),
            ));
        }

        let now = now_millis();
        let mut transaction = self.pool.begin().await?;
        let mut builder = QueryBuilder::<Sqlite>::new(
            "SELECT document_id, card_id, last_review_at FROM revision_schedules WHERE active=1 AND due_at<=",
        );
        builder.push_bind(now);
        if let Some(notebook_id) = input.notebook_id.as_deref() {
            builder.push(" AND document_id=").push_bind(notebook_id);
        }
        builder.push(" ORDER BY due_at ASC, document_id ASC, card_id ASC LIMIT 10000");
        let rows = builder.build().fetch_all(&mut *transaction).await?;
        let total = rows.len() as i64;
        let status = if total == 0 { "completed" } else { "running" };
        sqlx::query(
            "INSERT INTO revision_sessions (id, origin, workflow_id, node_id, notebook_id, goal_type, goal_value, elapsed_ms, status, total_cards, remaining_cards, reviewed_count, right_count, wrong_count, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'cards', ?, 0, ?, ?, ?, 0, 0, 0, ?, ?, ?)",
        )
        .bind(input.id.trim())
        .bind(match input.origin {
            RevisionSessionOrigin::Workflow => "workflow",
            RevisionSessionOrigin::Standalone => "standalone",
        })
        .bind(&input.workflow_id)
        .bind(&input.node_id)
        .bind(&input.notebook_id)
        .bind(total)
        .bind(status)
        .bind(total)
        .bind(total)
        .bind((total > 0).then_some(now))
        .bind(now)
        .bind(now)
        .execute(&mut *transaction)
        .await?;
        for (sequence, row) in rows.iter().enumerate() {
            sqlx::query(
                "INSERT INTO revision_session_cards (session_id, sequence, notebook_id, card_id, initial_last_review_at) VALUES (?, ?, ?, ?, ?)",
            )
            .bind(input.id.trim())
            .bind(sequence as i64)
            .bind(row.get::<String, _>("document_id"))
            .bind(row.get::<String, _>("card_id"))
            .bind(row.get::<Option<i64>, _>("last_review_at"))
            .execute(&mut *transaction)
            .await?;
        }
        transaction.commit().await?;
        self.revision_session_run(input.id.trim()).await
    }

    pub async fn active_standalone_revision_session(
        &self,
    ) -> Result<Option<app_core::RevisionSession>, DatabaseError> {
        let id = sqlx::query_scalar::<_, String>(
            "SELECT id FROM revision_sessions WHERE origin='standalone' AND status IN ('running', 'paused') ORDER BY updated_at DESC LIMIT 1",
        )
        .fetch_optional(&self.pool)
        .await?;
        match id {
            Some(id) => self.revision_session(&id).await,
            None => Ok(None),
        }
    }

    pub async fn revision_session_run(
        &self,
        id: &str,
    ) -> Result<RevisionSessionRun, DatabaseError> {
        let mut session = self.revision_session(id).await?.ok_or_else(|| {
            DatabaseError::InvalidRevisionSession("session does not exist".into())
        })?;
        let queued_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM revision_session_cards WHERE session_id=?",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await?;
        if queued_count == 0
            && session.remaining_cards > 0
            && matches!(
                session.status,
                RevisionSessionStatus::Running | RevisionSessionStatus::Paused
            )
        {
            let legacy_cards = self
                .list_revision_cards(&RevisionCardQuery {
                    notebook_id: session.notebook_id.clone(),
                    due_only: true,
                })
                .await?;
            let mut transaction = self.pool.begin().await?;
            for (sequence, card) in legacy_cards
                .iter()
                .take(session.remaining_cards as usize)
                .enumerate()
            {
                sqlx::query(
                    "INSERT OR IGNORE INTO revision_session_cards (session_id, sequence, notebook_id, card_id, initial_last_review_at) VALUES (?, ?, ?, ?, ?)",
                )
                .bind(id)
                .bind(sequence as i64)
                .bind(&card.notebook_id)
                .bind(&card.card_id)
                .bind(card.last_review_at)
                .execute(&mut *transaction)
                .await?;
            }
            transaction.commit().await?;
        }
        let queue = sqlx::query(
            "SELECT q.notebook_id, q.card_id FROM revision_session_cards q WHERE q.session_id=? AND NOT EXISTS (SELECT 1 FROM revision_session_results r WHERE r.session_id=q.session_id AND r.notebook_id=q.notebook_id AND r.card_id=q.card_id) ORDER BY q.sequence ASC",
        )
        .bind(id)
        .fetch_all(&self.pool)
        .await?;
        let all_cards = self
            .list_revision_cards(&RevisionCardQuery {
                notebook_id: session.notebook_id.clone(),
                due_only: false,
            })
            .await?;
        let by_id: HashMap<(String, String), RevisionCard> = all_cards
            .into_iter()
            .map(|card| ((card.notebook_id.clone(), card.card_id.clone()), card))
            .collect();
        let cards: Vec<_> = queue
            .iter()
            .filter_map(|row| {
                by_id
                    .get(&(row.get("notebook_id"), row.get("card_id")))
                    .cloned()
            })
            .collect();
        let available = cards.len() as i64;
        if available < session.remaining_cards
            && matches!(
                session.status,
                RevisionSessionStatus::Running | RevisionSessionStatus::Paused
            )
        {
            let status = if available == 0 {
                "completed"
            } else {
                match session.status {
                    RevisionSessionStatus::Running => "running",
                    RevisionSessionStatus::Paused => "paused",
                    _ => unreachable!(),
                }
            };
            let completed_elapsed_ms = session.elapsed_ms
                + session
                    .started_at
                    .map(|started_at| (now_millis() - started_at).max(0))
                    .unwrap_or(0);
            sqlx::query(
                "UPDATE revision_sessions SET remaining_cards=?, status=?, elapsed_ms=CASE WHEN ?='completed' THEN ? ELSE elapsed_ms END, started_at=CASE WHEN ?='completed' THEN NULL ELSE started_at END, updated_at=MAX(updated_at + 1, ?) WHERE id=?",
            )
            .bind(available)
            .bind(status)
            .bind(status)
            .bind(completed_elapsed_ms)
            .bind(status)
            .bind(now_millis())
            .bind(id)
            .execute(&self.pool)
            .await?;
            session = self.revision_session(id).await?.ok_or_else(|| {
                DatabaseError::InvalidRevisionSession("session disappeared".into())
            })?;
        }
        Ok(RevisionSessionRun { session, cards })
    }

    pub async fn revision_dashboard(
        &self,
        query: &RevisionDashboardQuery,
    ) -> Result<RevisionDashboard, DatabaseError> {
        if query.end_at <= query.start_at {
            return Err(DatabaseError::InvalidRevisionSession(
                "dashboard date range is invalid".into(),
            ));
        }
        let mut reviews_builder = QueryBuilder::<Sqlite>::new(
            "SELECT l.document_id, l.card_id, l.rating, l.reviewed_at, l.scheduled_days, NOT EXISTS (SELECT 1 FROM revision_review_log previous WHERE previous.document_id=l.document_id AND previous.card_id=l.card_id AND previous.reviewed_at<l.reviewed_at) learned FROM revision_review_log l WHERE l.reviewed_at>=",
        );
        reviews_builder
            .push_bind(query.start_at)
            .push(" AND l.reviewed_at<")
            .push_bind(query.end_at);
        if let Some(notebook_id) = query.notebook_id.as_deref() {
            reviews_builder
                .push(" AND l.document_id=")
                .push_bind(notebook_id);
        }
        reviews_builder.push(" ORDER BY l.reviewed_at ASC");
        let review_rows = reviews_builder.build().fetch_all(&self.pool).await?;

        let mut point_map = BTreeMap::<i64, RevisionDashboardPoint>::new();
        let mut activity_map = BTreeMap::<String, i64>::new();
        let mut learned_cards = 0;
        let mut correct_reviews = 0;
        for row in &review_rows {
            let reviewed_at: i64 = row.get("reviewed_at");
            let learned = row.get::<i64, _>("learned") != 0;
            let correct = row.get::<String, _>("rating") != "again";
            learned_cards += i64::from(learned);
            correct_reviews += i64::from(correct);
            let bucket_start =
                revision_bucket_start(reviewed_at, query.bucket, query.utc_offset_minutes);
            let point = point_map
                .entry(bucket_start)
                .or_insert(RevisionDashboardPoint {
                    bucket_start,
                    reviews: 0,
                    learned: 0,
                    correct: 0,
                    review_time_ms: 0,
                });
            point.reviews += 1;
            point.learned += i64::from(learned);
            point.correct += i64::from(correct);
            *activity_map
                .entry(revision_local_date(reviewed_at, query.utc_offset_minutes))
                .or_default() += 1;
        }

        let mut sessions_builder = QueryBuilder::<Sqlite>::new(
            "SELECT created_at, elapsed_ms FROM revision_sessions WHERE created_at>=",
        );
        sessions_builder
            .push_bind(query.start_at)
            .push(" AND created_at<")
            .push_bind(query.end_at);
        if let Some(notebook_id) = query.notebook_id.as_deref() {
            sessions_builder
                .push(" AND notebook_id=")
                .push_bind(notebook_id);
        }
        let session_rows = sessions_builder.build().fetch_all(&self.pool).await?;
        let mut review_time_ms = 0;
        for row in session_rows {
            let created_at = row.get::<i64, _>("created_at");
            let elapsed = row.get::<i64, _>("elapsed_ms").max(0);
            review_time_ms += elapsed;
            let bucket_start =
                revision_bucket_start(created_at, query.bucket, query.utc_offset_minutes);
            point_map
                .entry(bucket_start)
                .or_insert(RevisionDashboardPoint {
                    bucket_start,
                    reviews: 0,
                    learned: 0,
                    correct: 0,
                    review_time_ms: 0,
                })
                .review_time_ms += elapsed;
        }

        let mut cumulative_builder = QueryBuilder::<Sqlite>::new(
            "SELECT COUNT(*) count FROM (SELECT document_id, card_id FROM revision_review_log WHERE reviewed_at<",
        );
        cumulative_builder.push_bind(query.end_at);
        if let Some(notebook_id) = query.notebook_id.as_deref() {
            cumulative_builder
                .push(" AND document_id=")
                .push_bind(notebook_id);
        }
        cumulative_builder.push(" GROUP BY document_id, card_id)");
        let cumulative_learned_cards = cumulative_builder
            .build()
            .fetch_one(&self.pool)
            .await?
            .get("count");

        let now = now_millis();
        let forecast_end =
            now + (query.end_at - query.start_at).clamp(DAY_MILLIS, 366 * DAY_MILLIS);
        let mut forecast_builder = QueryBuilder::<Sqlite>::new(
            "SELECT due_at FROM revision_schedules WHERE active=1 AND due_at>=",
        );
        forecast_builder
            .push_bind(now)
            .push(" AND due_at<")
            .push_bind(forecast_end);
        if let Some(notebook_id) = query.notebook_id.as_deref() {
            forecast_builder
                .push(" AND document_id=")
                .push_bind(notebook_id);
        }
        let forecast_rows = forecast_builder.build().fetch_all(&self.pool).await?;
        let mut forecast_map = BTreeMap::<i64, i64>::new();
        for row in forecast_rows {
            let due_at = row.get::<i64, _>("due_at");
            *forecast_map
                .entry(revision_bucket_start(
                    due_at,
                    query.bucket,
                    query.utc_offset_minutes,
                ))
                .or_default() += 1;
        }

        let mut interval_builder = QueryBuilder::<Sqlite>::new(
            "SELECT l.scheduled_days FROM revision_review_log l WHERE l.id=(SELECT MAX(last.id) FROM revision_review_log last WHERE last.document_id=l.document_id AND last.card_id=l.card_id)",
        );
        if let Some(notebook_id) = query.notebook_id.as_deref() {
            interval_builder
                .push(" AND l.document_id=")
                .push_bind(notebook_id);
        }
        let interval_rows = interval_builder.build().fetch_all(&self.pool).await?;
        let mut interval_counts = [0_i64; 5];
        for row in interval_rows {
            let days = row.get::<i64, _>("scheduled_days");
            let index = match days {
                ..=1 => 0,
                2..=7 => 1,
                8..=30 => 2,
                31..=90 => 3,
                _ => 4,
            };
            interval_counts[index] += 1;
        }

        let decks = self
            .list_revision_decks()
            .await?
            .into_iter()
            .filter(|deck| {
                query
                    .notebook_id
                    .as_ref()
                    .is_none_or(|id| id == &deck.notebook_id)
            })
            .map(|deck| RevisionDeckProgress {
                notebook_id: deck.notebook_id,
                title: deck.title,
                total_cards: deck.total_count,
                learned_cards: deck.total_count - deck.new_count,
                due_cards: deck.due_count,
            })
            .collect();

        Ok(RevisionDashboard {
            total_reviews: review_rows.len() as i64,
            active_days: activity_map.len() as i64,
            learned_cards,
            cumulative_learned_cards,
            correct_reviews,
            review_time_ms,
            points: point_map.into_values().collect(),
            activity: activity_map
                .into_iter()
                .map(|(local_date, reviews)| RevisionActivityDay {
                    local_date,
                    reviews,
                })
                .collect(),
            forecast: forecast_map
                .into_iter()
                .map(|(bucket_start, due_cards)| RevisionForecastPoint {
                    bucket_start,
                    due_cards,
                })
                .collect(),
            intervals: ["1 day", "2–7 days", "8–30 days", "31–90 days", "90+ days"]
                .into_iter()
                .zip(interval_counts)
                .map(|(label, cards)| RevisionIntervalBucket {
                    label: label.into(),
                    cards,
                })
                .collect(),
            decks,
        })
    }

    pub async fn review_revision_card(
        &self,
        input: &ReviewRevisionCardInput,
    ) -> Result<RevisionScheduleResult, DatabaseError> {
        let mut transaction = self.pool.begin().await?;
        let result = review_revision_card_in_transaction(&mut transaction, input).await?;
        transaction.commit().await?;
        Ok(result)
    }

    pub async fn review_revision_session_card(
        &self,
        input: &ReviewRevisionSessionCardInput,
    ) -> Result<RevisionSessionReviewResult, DatabaseError> {
        if input.session_id.trim().is_empty() {
            return Err(DatabaseError::InvalidRevisionSession(
                "session id is required".into(),
            ));
        }
        let mut transaction = self.pool.begin().await?;
        let queued = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM revision_session_cards q WHERE q.session_id=? AND q.notebook_id=? AND q.card_id=? AND NOT EXISTS (SELECT 1 FROM revision_session_results r WHERE r.session_id=q.session_id AND r.notebook_id=q.notebook_id AND r.card_id=q.card_id)",
        )
        .bind(input.session_id.trim())
        .bind(input.notebook_id.trim())
        .bind(input.card_id.trim())
        .fetch_one(&mut *transaction)
        .await?;
        if queued == 0 {
            return Err(DatabaseError::InvalidRevisionSession(
                "card is not pending in this session".into(),
            ));
        }
        let schedule = review_revision_card_in_transaction(
            &mut transaction,
            &ReviewRevisionCardInput {
                notebook_id: input.notebook_id.clone(),
                card_id: input.card_id.clone(),
                rating: input.rating,
                expected_last_review_at: input.expected_last_review_at,
            },
        )
        .await?;
        let row = sqlx::query(
            "SELECT status, goal_type, goal_value, total_cards, remaining_cards, reviewed_count, right_count, wrong_count, elapsed_ms, started_at FROM revision_sessions WHERE id=?",
        )
        .bind(input.session_id.trim())
        .fetch_optional(&mut *transaction)
        .await?
        .ok_or_else(|| DatabaseError::InvalidRevisionSession("session does not exist".into()))?;
        if row.get::<String, _>("status") != "running" {
            return Err(DatabaseError::InvalidRevisionSession(
                "only a running session can accept answers".into(),
            ));
        }
        let reviewed_count = row.get::<i64, _>("reviewed_count") + 1;
        let correct = revision_rating_is_correct(input.rating);
        let right_count = row.get::<i64, _>("right_count") + i64::from(correct);
        let wrong_count = row.get::<i64, _>("wrong_count") + i64::from(!correct);
        let remaining_cards = (row.get::<i64, _>("remaining_cards") - 1).max(0);
        let now = schedule.last_review_at;
        sqlx::query(
            "INSERT INTO revision_session_results (session_id, sequence, notebook_id, card_id, question, expected_answer, answer, correct, answered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(input.session_id.trim())
        .bind(reviewed_count - 1)
        .bind(input.notebook_id.trim())
        .bind(input.card_id.trim())
        .bind(input.question.trim())
        .bind(input.expected_answer.trim())
        .bind(rating_name(input.rating))
        .bind(i64::from(correct))
        .bind(now)
        .execute(&mut *transaction)
        .await?;
        let total_cards = row.get::<i64, _>("total_cards");
        let card_goal_reached = row.get::<String, _>("goal_type") == "cards"
            && reviewed_count >= row.get::<i64, _>("goal_value").min(total_cards.max(1));
        let status = if remaining_cards == 0 || card_goal_reached {
            "completed"
        } else {
            "running"
        };
        let completed_elapsed_ms = row.get::<i64, _>("elapsed_ms")
            + row
                .get::<Option<i64>, _>("started_at")
                .map(|started_at| (now - started_at).max(0))
                .unwrap_or(0);
        sqlx::query(
            "UPDATE revision_sessions SET status=?, remaining_cards=?, reviewed_count=?, right_count=?, wrong_count=?, elapsed_ms=CASE WHEN ?='completed' THEN ? ELSE elapsed_ms END, started_at=CASE WHEN ?='completed' THEN NULL ELSE started_at END, updated_at=MAX(updated_at + 1, ?) WHERE id=?",
        )
        .bind(status)
        .bind(remaining_cards)
        .bind(reviewed_count)
        .bind(right_count)
        .bind(wrong_count)
        .bind(status)
        .bind(completed_elapsed_ms)
        .bind(status)
        .bind(now)
        .bind(input.session_id.trim())
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        let session = self
            .revision_session(input.session_id.trim())
            .await?
            .ok_or_else(|| DatabaseError::InvalidRevisionSession("session disappeared".into()))?;
        Ok(RevisionSessionReviewResult { schedule, session })
    }
}

fn revision_rating_is_correct(rating: RevisionRating) -> bool {
    !matches!(rating, RevisionRating::Again)
}

#[cfg(test)]
mod tests {
    use super::revision_rating_is_correct;
    use app_core::RevisionRating;

    #[test]
    fn revision_ratings_map_to_session_correctness() {
        assert!(!revision_rating_is_correct(RevisionRating::Again));
        assert!(revision_rating_is_correct(RevisionRating::Hard));
        assert!(revision_rating_is_correct(RevisionRating::Good));
        assert!(revision_rating_is_correct(RevisionRating::Easy));
    }
}

async fn review_revision_card_in_transaction(
    transaction: &mut Transaction<'_, Sqlite>,
    input: &ReviewRevisionCardInput,
) -> Result<RevisionScheduleResult, DatabaseError> {
    let row = sqlx::query(
        "SELECT active, last_review_at, stability, difficulty, review_count, lapses \
             FROM revision_schedules WHERE document_id=? AND card_id=?",
    )
    .bind(&input.notebook_id)
    .bind(&input.card_id)
    .fetch_optional(&mut **transaction)
    .await?
    .ok_or_else(|| DatabaseError::RevisionCardNotFound {
        document_id: input.notebook_id.clone(),
        card_id: input.card_id.clone(),
    })?;
    if row.get::<i64, _>("active") == 0 {
        return Err(DatabaseError::RevisionCardNotFound {
            document_id: input.notebook_id.clone(),
            card_id: input.card_id.clone(),
        });
    }
    let last_review_at: Option<i64> = row.get("last_review_at");
    if last_review_at != input.expected_last_review_at {
        return Err(DatabaseError::RevisionReviewConflict {
            document_id: input.notebook_id.clone(),
            card_id: input.card_id.clone(),
        });
    }
    let now = now_millis();
    let elapsed_days = last_review_at
        .map(|last| ((now - last).max(0) / DAY_MILLIS) as u32)
        .unwrap_or(0);
    let stability: Option<f64> = row.get("stability");
    let difficulty: Option<f64> = row.get("difficulty");
    let previous = stability
        .zip(difficulty)
        .map(|(stability, difficulty)| StoredMemoryState {
            stability: stability as f32,
            difficulty: difficulty as f32,
        });
    let outcome = RevisionScheduler::default().schedule(previous, elapsed_days, input.rating)?;
    let due_at = now + i64::from(outcome.interval_days) * DAY_MILLIS;
    let review_count = row.get::<i64, _>("review_count") + 1;
    let lapses = row.get::<i64, _>("lapses") + i64::from(input.rating == RevisionRating::Again);
    sqlx::query(
            "UPDATE revision_schedules SET due_at=?, last_review_at=?, stability=?, difficulty=?, \
             review_count=?, lapses=?, updated_at=? WHERE document_id=? AND card_id=? AND last_review_at IS ?",
        ).bind(due_at).bind(now).bind(f64::from(outcome.memory.stability)).bind(f64::from(outcome.memory.difficulty))
            .bind(review_count).bind(lapses).bind(now).bind(&input.notebook_id).bind(&input.card_id)
            .bind(last_review_at).execute(&mut **transaction).await?;
    sqlx::query(
            "INSERT INTO revision_review_log (document_id, card_id, rating, reviewed_at, elapsed_days, scheduled_days, stability, difficulty) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(&input.notebook_id).bind(&input.card_id).bind(rating_name(input.rating)).bind(now)
            .bind(i64::from(elapsed_days)).bind(i64::from(outcome.interval_days))
            .bind(f64::from(outcome.memory.stability)).bind(f64::from(outcome.memory.difficulty))
            .execute(&mut **transaction).await?;
    Ok(RevisionScheduleResult {
        notebook_id: input.notebook_id.clone(),
        card_id: input.card_id.clone(),
        due_at,
        last_review_at: now,
        interval_days: outcome.interval_days,
        stability: outcome.memory.stability,
        difficulty: outcome.memory.difficulty,
        review_count,
        lapses,
    })
}

fn is_revision_card(payload: &Value) -> bool {
    payload.get("type").and_then(Value::as_str) == Some("card")
        && (payload.get("kind").and_then(Value::as_str) == Some("revision")
            || payload.get("kind").and_then(Value::as_str) == Some("plugin")
                && payload.get("pluginId").and_then(Value::as_str) == Some("notes.question-card"))
}

fn valid_revision_card(payload: &Value) -> bool {
    let values = question_values(payload);
    if values.get("revisionKind").and_then(Value::as_str) != Some("cloze") {
        return !string_field(values, "front").trim().is_empty()
            && !string_field(values, "back").trim().is_empty();
    }
    let source = values
        .get("cloze")
        .and_then(Value::as_str)
        .unwrap_or_default();
    source.contains("{{c") && source.contains("::") && source.contains("}}")
}

fn question_values(payload: &Value) -> &Value {
    if payload.get("kind").and_then(Value::as_str) == Some("plugin") {
        payload.get("pluginData").unwrap_or(payload)
    } else {
        payload
    }
}

fn binding_id<'a>(payload: &'a Value, endpoint: &str) -> Option<&'a str> {
    payload
        .get(endpoint)?
        .get("binding")?
        .get("objectId")?
        .as_str()
}

fn string_field(payload: &Value, key: &str) -> String {
    payload
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned()
}

fn revision_bucket_start(
    timestamp: i64,
    bucket: RevisionDashboardBucket,
    utc_offset_minutes: i32,
) -> i64 {
    let offset = i64::from(utc_offset_minutes) * 60_000;
    let local = timestamp + offset;
    let day = local.div_euclid(DAY_MILLIS);
    let start_day = match bucket {
        RevisionDashboardBucket::Day => day,
        RevisionDashboardBucket::Week => (day + 3).div_euclid(7) * 7 - 3,
        RevisionDashboardBucket::Month => day.div_euclid(30) * 30,
    };
    start_day * DAY_MILLIS - offset
}

fn revision_local_date(timestamp: i64, utc_offset_minutes: i32) -> String {
    let offset = i64::from(utc_offset_minutes) * 60_000;
    let days = (timestamp + offset).div_euclid(DAY_MILLIS);
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 }.div_euclid(146_097);
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    year += i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}")
}

fn fact_label(payload: &Value) -> String {
    if let Some(markdown) = payload.get("markdown").and_then(Value::as_str) {
        if let Some(line) = markdown
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty())
        {
            return line
                .trim_start_matches(['#', '-', '*', ' '])
                .chars()
                .take(80)
                .collect();
        }
    }
    if let Some(values) = payload.get("templateValues").and_then(Value::as_object) {
        if let Some(label) = values
            .values()
            .find_map(Value::as_str)
            .filter(|label| !label.trim().is_empty())
        {
            return label.chars().take(80).collect();
        }
    }
    if let Some(elements) = payload.get("elements").and_then(Value::as_array) {
        if let Some(label) = elements
            .iter()
            .find_map(|element| element.get("text").and_then(Value::as_str))
            .filter(|label| !label.trim().is_empty())
        {
            return label
                .lines()
                .next()
                .unwrap_or(label)
                .chars()
                .take(80)
                .collect();
        }
    }
    "Fact card".into()
}

fn rating_name(rating: RevisionRating) -> &'static str {
    match rating {
        RevisionRating::Again => "again",
        RevisionRating::Hard => "hard",
        RevisionRating::Good => "good",
        RevisionRating::Easy => "easy",
    }
}
