use app_core::{
    BookEntity, CacheQuranRecordingSegmentPeaksInput, CanvasCardProjection, CanvasDocument,
    CanvasDocumentSummary, CanvasLayer, CanvasObject, CanvasSnapshot, CanvasType, CanvasViewport,
    CardTemplate, CreateReminderInput, MediaCursor, MediaEntry, MediaKind, MediaListQuery,
    MediaPage, MediaStorage, PersonRecord, PluginInstallation, PluginPreference, QuranAyahBoundary,
    QuranMistakeRange, QuranPage, QuranProgress, QuranRecitationPosition, QuranRecording,
    QuranRecordingMutation, QuranRecordingOrigin, QuranRecordingQuery, QuranRecordingSegment,
    QuranRecordingStatus, Reminder, ReminderImageAttachment, ReminderList, ReminderPriority,
    ReminderQuery, ReminderSubtask, ReminderView, ReplaceQuranRecordingRangeInput, SaveCanvasInput,
    SaveCardTemplateInput, SaveCardTierPreviewInput, SavePersonInput, SaveQuranRecordingInput,
    SaveQuranRecordingReviewInput, SaveReminderInput, SaveReminderListInput,
    StartStandaloneQuranRecordingInput, UpdateReminderInput, WorkflowDocumentKind,
};
use sqlx::{
    QueryBuilder, Row, Sqlite, SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
};
use std::{
    collections::{HashMap, HashSet},
    path::Path,
    str::FromStr,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use thiserror::Error;

mod productivity_state;
mod revision;

#[derive(Debug, Error)]
pub enum DatabaseError {
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
    #[error(transparent)]
    Migration(#[from] sqlx::migrate::MigrateError),
    #[error("invalid JSON stored for canvas object {object_id}: {source}")]
    InvalidObjectJson {
        object_id: String,
        source: serde_json::Error,
    },
    #[error("document {id} has revision {actual}, expected {expected}")]
    RevisionConflict {
        id: String,
        expected: i64,
        actual: i64,
    },
    #[error("card template {id} has revision {actual}, expected {expected}")]
    CardTemplateRevisionConflict {
        id: String,
        expected: i64,
        actual: i64,
    },
    #[error("card template {0} is built in and cannot be deleted")]
    BuiltInCardTemplate(String),
    #[error("card template {id} is used by {usage_count} card instances")]
    CardTemplateInUse { id: String, usage_count: i64 },
    #[error("card template {0} does not exist")]
    CardTemplateNotFound(String),
    #[error("invalid card template: {0}")]
    InvalidCardTemplate(String),
    #[error("invalid person: {0}")]
    InvalidPerson(String),
    #[error("invalid workflow plugin data: {0}")]
    InvalidWorkflowPlugin(String),
    #[error("invalid reminder: {0}")]
    InvalidReminder(String),
    #[error("invalid health water entry: {0}")]
    InvalidHealthWater(String),
    #[error("invalid nutrition food entry: {0}")]
    InvalidNutritionFood(String),
    #[error("invalid revision session: {0}")]
    InvalidRevisionSession(String),
    #[error("invalid Quran state: {0}")]
    InvalidQuranState(String),
    #[error(transparent)]
    Scheduler(#[from] revision_scheduler::SchedulerError),
    #[error("revision card {card_id} in notebook {document_id} does not exist or is not active")]
    RevisionCardNotFound {
        document_id: String,
        card_id: String,
    },
    #[error("revision card {card_id} in document {document_id} was already reviewed")]
    RevisionReviewConflict {
        document_id: String,
        card_id: String,
    },
}

pub struct Database {
    pool: SqlitePool,
}

pub struct NewMediaEntry {
    pub id: String,
    pub canvas_id: String,
    pub original_name: String,
    pub mime_type: String,
    pub kind: MediaKind,
    pub size_bytes: i64,
    pub content_hash: String,
    pub storage_key: String,
    pub thumbnail_key: Option<String>,
    pub proxy_key: Option<String>,
    pub width: Option<i64>,
    pub height: Option<i64>,
}

pub struct NewReminderImage {
    pub id: String,
    pub reminder_id: String,
    pub original_name: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub content_hash: String,
    pub storage_key: String,
    pub thumbnail_key: Option<String>,
    pub width: Option<i64>,
    pub height: Option<i64>,
}

pub struct DeletedMedia {
    pub storage: MediaStorage,
    pub storage_still_referenced: bool,
}

impl Database {
    pub async fn open(
        path: &Path,
        max_connections: u32,
        busy_timeout_ms: u64,
    ) -> Result<Self, DatabaseError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(sqlx::Error::Io)?;
        }
        let options = SqliteConnectOptions::from_str(&format!("sqlite://{}", path.display()))?
            .create_if_missing(true)
            .foreign_keys(true)
            .journal_mode(SqliteJournalMode::Wal)
            .busy_timeout(Duration::from_millis(busy_timeout_ms));
        let pool = SqlitePoolOptions::new()
            .max_connections(max_connections)
            .connect_with(options)
            .await?;
        sqlx::migrate!("./migrations").run(&pool).await?;
        let database = Self { pool };
        database.seed_builtin_card_templates().await?;
        database.materialize_legacy_cards().await?;
        Ok(database)
    }

    async fn materialize_legacy_cards(&self) -> Result<(), DatabaseError> {
        let template_rows =
            sqlx::query("SELECT id, fields_json, elements_json, bindings_json FROM card_templates")
                .fetch_all(&self.pool)
                .await?;
        let mut templates = HashMap::new();
        for row in template_rows {
            let id: String = row.get("id");
            let parse = |column: &str| -> Result<serde_json::Value, DatabaseError> {
                let source: String = row.get(column);
                serde_json::from_str(&source).map_err(|source| DatabaseError::InvalidObjectJson {
                    object_id: id.clone(),
                    source,
                })
            };
            let fields = parse("fields_json")?;
            let elements = parse("elements_json")?;
            let bindings = parse("bindings_json")?;
            templates.insert(
                id,
                LegacyTemplate {
                    fields,
                    elements,
                    bindings,
                },
            );
        }

        let rows = sqlx::query("SELECT document_id, object_id, payload_json FROM canvas_objects")
            .fetch_all(&self.pool)
            .await?;
        let mut changes = Vec::new();
        for row in rows {
            let document_id: String = row.get("document_id");
            let object_id: String = row.get("object_id");
            let source: String = row.get("payload_json");
            let mut payload: serde_json::Value =
                serde_json::from_str(&source).map_err(|source| {
                    DatabaseError::InvalidObjectJson {
                        object_id: object_id.clone(),
                        source,
                    }
                })?;
            if migrate_legacy_card_value(&mut payload, &templates) {
                changes.push((document_id, object_id, payload));
            }
        }
        if changes.is_empty() {
            return Ok(());
        }

        let now = now_millis();
        let mut transaction = self.pool.begin().await?;
        let mut changed_documents = std::collections::HashSet::new();
        for (document_id, object_id, payload) in changes {
            sqlx::query(
                "UPDATE canvas_objects SET payload_json=? WHERE document_id=? AND object_id=?",
            )
            .bind(serde_json::to_string(&payload).expect("canvas object serializes"))
            .bind(&document_id)
            .bind(object_id)
            .execute(&mut *transaction)
            .await?;
            changed_documents.insert(document_id);
        }
        for document_id in changed_documents {
            sqlx::query("DELETE FROM card_template_instances WHERE document_id=?")
                .bind(&document_id)
                .execute(&mut *transaction)
                .await?;
            sqlx::query("UPDATE canvas_documents SET revision=revision+1, updated_at=? WHERE id=?")
                .bind(now)
                .bind(document_id)
                .execute(&mut *transaction)
                .await?;
        }
        transaction.commit().await?;
        Ok(())
    }

    pub async fn list_canvases(&self) -> Result<Vec<CanvasDocumentSummary>, DatabaseError> {
        let rows = sqlx::query(
            "SELECT d.id, d.title, d.project, d.canvas_type, d.workflow_kind, d.icon, d.starred, d.created_at, d.updated_at, d.revision, d.cover_media_id, p.data_url \
             FROM canvas_documents d LEFT JOIN canvas_previews p ON p.document_id = d.id \
             WHERE d.canvas_type != 'notebook' AND d.id != 'quran-recordings-library' ORDER BY d.updated_at DESC, d.id ASC",
        ).fetch_all(&self.pool).await?;
        Ok(rows.iter().map(summary_from_row).collect())
    }

    pub async fn list_notebooks(&self) -> Result<Vec<CanvasDocumentSummary>, DatabaseError> {
        let rows = sqlx::query(
            "SELECT d.id, d.title, d.project, d.canvas_type, d.workflow_kind, d.icon, d.starred, d.created_at, d.updated_at, d.revision, d.cover_media_id, p.data_url \
             FROM canvas_documents d LEFT JOIN canvas_previews p ON p.document_id = d.id \
             WHERE d.canvas_type = 'notebook' ORDER BY d.updated_at DESC, d.id ASC",
        ).fetch_all(&self.pool).await?;
        Ok(rows.iter().map(summary_from_row).collect())
    }

    pub async fn get_canvas(&self, id: &str) -> Result<Option<CanvasDocument>, DatabaseError> {
        let Some(row) = sqlx::query(
            "SELECT d.id, d.title, d.project, d.canvas_type, d.workflow_kind, d.icon, d.starred, d.created_at, d.updated_at, d.revision, d.cover_media_id, p.data_url, \
             s.active_layer_id, s.focused_layer_id, s.unfocused_layer_opacity, s.viewport_x, s.viewport_y, \
             s.viewport_scale, s.schema_version FROM canvas_documents d \
             JOIN canvas_state s ON s.document_id = d.id \
             LEFT JOIN canvas_previews p ON p.document_id = d.id WHERE d.id = ?",
        ).bind(id).fetch_optional(&self.pool).await? else { return Ok(None); };

        let layer_rows = sqlx::query(
            "SELECT layer_id, name, z_index, visible, opacity, interaction_color FROM canvas_layers \
             WHERE document_id = ? ORDER BY z_index ASC, layer_id ASC",
        ).bind(id).fetch_all(&self.pool).await?;
        let layers = layer_rows
            .iter()
            .map(|row| CanvasLayer {
                id: row.get("layer_id"),
                name: row.get("name"),
                z_index: row.get("z_index"),
                visible: row.get::<i64, _>("visible") != 0,
                opacity: row.get("opacity"),
                interaction_color: row.get::<i64, _>("interaction_color") as u32,
            })
            .collect();

        let object_rows = sqlx::query(
            "SELECT object_id, layer_id, object_type, sort_index, payload_json FROM canvas_objects \
             WHERE document_id = ? ORDER BY sort_index ASC, object_id ASC",
        )
        .bind(id)
        .fetch_all(&self.pool)
        .await?;
        let mut objects = Vec::with_capacity(object_rows.len());
        for object_row in object_rows {
            let object_id: String = object_row.get("object_id");
            let source: String = object_row.get("payload_json");
            let payload = serde_json::from_str(&source).map_err(|source| {
                DatabaseError::InvalidObjectJson {
                    object_id: object_id.clone(),
                    source,
                }
            })?;
            objects.push(CanvasObject {
                id: object_id,
                layer_id: object_row.get("layer_id"),
                object_type: object_row.get("object_type"),
                sort_index: object_row.get("sort_index"),
                payload,
            });
        }

        Ok(Some(CanvasDocument {
            summary: summary_from_row(&row),
            canvas: CanvasSnapshot {
                schema_version: row.get::<i64, _>("schema_version") as u32,
                active_layer_id: row.get("active_layer_id"),
                focused_layer_id: row.get("focused_layer_id"),
                unfocused_layer_opacity: row.get("unfocused_layer_opacity"),
                viewport: CanvasViewport {
                    x: row.get("viewport_x"),
                    y: row.get("viewport_y"),
                    scale: row.get("viewport_scale"),
                },
                layers,
                objects,
            },
        }))
    }

    pub async fn save_canvas(
        &self,
        input: SaveCanvasInput,
    ) -> Result<CanvasDocumentSummary, DatabaseError> {
        let mut transaction = self.pool.begin().await?;
        let existing =
            sqlx::query("SELECT created_at, revision FROM canvas_documents WHERE id = ?")
                .bind(&input.id)
                .fetch_optional(&mut *transaction)
                .await?;
        let now = now_millis();
        let (created_at, revision) = if let Some(row) = existing {
            let actual: i64 = row.get("revision");
            if let Some(expected) = input.expected_revision {
                if expected != actual {
                    return Err(DatabaseError::RevisionConflict {
                        id: input.id,
                        expected,
                        actual,
                    });
                }
            }
            (row.get("created_at"), actual + 1)
        } else {
            (now, 1)
        };

        sqlx::query(
            "INSERT INTO canvas_documents (id, title, project, canvas_type, workflow_kind, icon, starred, cover_media_id, created_at, updated_at, revision) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, \
             project=excluded.project, canvas_type=excluded.canvas_type, workflow_kind=excluded.workflow_kind, icon=excluded.icon, starred=excluded.starred, cover_media_id=excluded.cover_media_id, updated_at=excluded.updated_at, revision=excluded.revision",
        ).bind(&input.id).bind(&input.title).bind(&input.project).bind(input.canvas_type.as_str()).bind(input.workflow_kind.as_str()).bind(&input.icon).bind(input.starred as i64)
            .bind(&input.cover_media_id).bind(created_at).bind(now).bind(revision).execute(&mut *transaction).await?;

        let canvas = &input.canvas;
        sqlx::query(
            "INSERT INTO canvas_state (document_id, active_layer_id, focused_layer_id, unfocused_layer_opacity, \
             viewport_x, viewport_y, viewport_scale, schema_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?) \
             ON CONFLICT(document_id) DO UPDATE SET active_layer_id=excluded.active_layer_id, focused_layer_id=excluded.focused_layer_id, \
             unfocused_layer_opacity=excluded.unfocused_layer_opacity, viewport_x=excluded.viewport_x, viewport_y=excluded.viewport_y, \
             viewport_scale=excluded.viewport_scale, schema_version=excluded.schema_version",
        ).bind(&input.id).bind(&canvas.active_layer_id).bind(&canvas.focused_layer_id)
            .bind(canvas.unfocused_layer_opacity).bind(canvas.viewport.x).bind(canvas.viewport.y)
            .bind(canvas.viewport.scale).bind(canvas.schema_version as i64).execute(&mut *transaction).await?;

        sqlx::query("DELETE FROM canvas_objects WHERE document_id = ?")
            .bind(&input.id)
            .execute(&mut *transaction)
            .await?;
        sqlx::query("DELETE FROM canvas_layers WHERE document_id = ?")
            .bind(&input.id)
            .execute(&mut *transaction)
            .await?;
        sqlx::query("DELETE FROM card_template_instances WHERE document_id = ?")
            .bind(&input.id)
            .execute(&mut *transaction)
            .await?;
        for layer in &canvas.layers {
            sqlx::query(
                "INSERT INTO canvas_layers (document_id, layer_id, name, z_index, visible, opacity, interaction_color) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ).bind(&input.id).bind(&layer.id).bind(&layer.name).bind(layer.z_index)
                .bind(layer.visible as i64).bind(layer.opacity).bind(layer.interaction_color as i64)
                .execute(&mut *transaction).await?;
        }
        for object in &canvas.objects {
            sqlx::query(
                "INSERT INTO canvas_objects (document_id, object_id, layer_id, object_type, sort_index, payload_json) VALUES (?, ?, ?, ?, ?, ?)",
            ).bind(&input.id).bind(&object.id).bind(&object.layer_id).bind(&object.object_type)
                .bind(object.sort_index).bind(serde_json::to_string(&object.payload).expect("JSON values serialize"))
                .execute(&mut *transaction).await?;
        }
        sqlx::query(
            "DELETE FROM card_tier_previews WHERE document_id=? AND card_id NOT IN (SELECT object_id FROM canvas_objects WHERE document_id=?)",
        )
        .bind(&input.id)
        .bind(&input.id)
        .execute(&mut *transaction)
        .await?;
        let mut template_instances = Vec::new();
        for object in &canvas.objects {
            collect_template_instances(&object.payload, &mut template_instances);
        }
        for (instance_id, template_id) in template_instances {
            sqlx::query(
                "INSERT OR REPLACE INTO card_template_instances (document_id, instance_id, template_id) VALUES (?, ?, ?)",
            ).bind(&input.id).bind(instance_id).bind(template_id).execute(&mut *transaction).await?;
        }
        self.sync_revision_schedules(&mut transaction, &input, now)
            .await?;
        transaction.commit().await?;
        Ok(self
            .summary(&input.id)
            .await?
            .expect("saved canvas must exist"))
    }

    pub async fn delete_canvas(&self, id: &str) -> Result<bool, DatabaseError> {
        Ok(sqlx::query("DELETE FROM canvas_documents WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?
            .rows_affected()
            > 0)
    }

    pub async fn canvas_exists(&self, id: &str) -> Result<bool, DatabaseError> {
        Ok(
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM canvas_documents WHERE id = ?")
                .bind(id)
                .fetch_one(&self.pool)
                .await?
                > 0,
        )
    }

    pub async fn set_canvas_starred(
        &self,
        id: &str,
        starred: bool,
    ) -> Result<Option<CanvasDocumentSummary>, DatabaseError> {
        let result = sqlx::query("UPDATE canvas_documents SET starred = ?, updated_at = ?, revision = revision + 1 WHERE id = ?")
            .bind(starred as i64).bind(now_millis()).bind(id).execute(&self.pool).await?;
        if result.rows_affected() == 0 {
            Ok(None)
        } else {
            self.summary(id).await
        }
    }

    pub async fn set_canvas_title(
        &self,
        id: &str,
        title: &str,
    ) -> Result<Option<CanvasDocumentSummary>, DatabaseError> {
        let result = sqlx::query("UPDATE canvas_documents SET title = ?, updated_at = ?, revision = revision + 1 WHERE id = ?")
            .bind(title).bind(now_millis()).bind(id).execute(&self.pool).await?;
        if result.rows_affected() == 0 {
            Ok(None)
        } else {
            self.summary(id).await
        }
    }

    pub async fn save_canvas_preview(
        &self,
        id: &str,
        data_url: &str,
    ) -> Result<bool, DatabaseError> {
        if self.summary(id).await?.is_none() {
            return Ok(false);
        }
        sqlx::query(
            "INSERT INTO canvas_previews (document_id, data_url, updated_at) VALUES (?, ?, ?) \
             ON CONFLICT(document_id) DO UPDATE SET data_url=excluded.data_url, updated_at=excluded.updated_at",
        ).bind(id).bind(data_url).bind(now_millis()).execute(&self.pool).await?;
        Ok(true)
    }

    pub async fn save_card_tier_previews(
        &self,
        previews: &[SaveCardTierPreviewInput],
    ) -> Result<bool, DatabaseError> {
        let Some(first) = previews.first() else {
            return Ok(true);
        };
        if self.summary(&first.document_id).await?.is_none() {
            return Ok(false);
        }
        let mut transaction = self.pool.begin().await?;
        for preview in previews {
            if preview.document_id != first.document_id || preview.card_id != first.card_id {
                continue;
            }
            sqlx::query(
                "INSERT INTO card_tier_previews (document_id, card_id, tier_id, tier_revision, data_url, updated_at) VALUES (?, ?, ?, ?, ?, ?) \
                 ON CONFLICT(document_id, card_id, tier_id) DO UPDATE SET tier_revision=excluded.tier_revision, data_url=excluded.data_url, updated_at=excluded.updated_at \
                 WHERE excluded.tier_revision >= card_tier_previews.tier_revision",
            )
            .bind(&preview.document_id)
            .bind(&preview.card_id)
            .bind(&preview.tier_id)
            .bind(preview.tier_revision)
            .bind(&preview.data_url)
            .bind(now_millis())
            .execute(&mut *transaction)
            .await?;
        }
        transaction.commit().await?;
        Ok(true)
    }

    pub async fn list_plugin_installations(
        &self,
    ) -> Result<Vec<PluginInstallation>, DatabaseError> {
        let rows = sqlx::query(
            "SELECT plugin_id, installed, installed_at FROM plugin_installations ORDER BY plugin_id ASC",
        ).fetch_all(&self.pool).await?;
        Ok(rows
            .iter()
            .map(|row| PluginInstallation {
                plugin_id: row.get("plugin_id"),
                installed: row.get::<i64, _>("installed") != 0,
                installed_at: row.get("installed_at"),
            })
            .collect())
    }

    pub async fn set_plugin_installed(
        &self,
        plugin_id: &str,
        installed: bool,
    ) -> Result<PluginInstallation, DatabaseError> {
        let installed_at = installed.then(now_millis);
        sqlx::query(
            "INSERT INTO plugin_installations (plugin_id, installed, installed_at) VALUES (?, ?, ?) \
             ON CONFLICT(plugin_id) DO UPDATE SET installed=excluded.installed, installed_at=excluded.installed_at",
        ).bind(plugin_id).bind(installed as i64).bind(installed_at).execute(&self.pool).await?;
        Ok(PluginInstallation {
            plugin_id: plugin_id.to_owned(),
            installed,
            installed_at,
        })
    }

    pub async fn get_plugin_preference(
        &self,
        plugin_id: &str,
        key: &str,
    ) -> Result<Option<PluginPreference>, DatabaseError> {
        let row = sqlx::query(
            "SELECT plugin_id, preference_key, value_json, updated_at FROM plugin_preferences WHERE plugin_id=? AND preference_key=?",
        )
        .bind(plugin_id)
        .bind(key)
        .fetch_optional(&self.pool)
        .await?;
        row.map(|row| {
            let source: String = row.get("value_json");
            let value = serde_json::from_str(&source).map_err(|source| {
                DatabaseError::InvalidObjectJson {
                    object_id: format!("{plugin_id}:{key}"),
                    source,
                }
            })?;
            Ok(PluginPreference {
                plugin_id: row.get("plugin_id"),
                key: row.get("preference_key"),
                value,
                updated_at: row.get("updated_at"),
            })
        })
        .transpose()
    }

    pub async fn set_plugin_preference(
        &self,
        plugin_id: &str,
        key: &str,
        value: serde_json::Value,
    ) -> Result<PluginPreference, DatabaseError> {
        if plugin_id.trim().is_empty() || key.trim().is_empty() {
            return Err(DatabaseError::InvalidWorkflowPlugin(
                "plugin ID and preference key are required".into(),
            ));
        }
        let updated_at = now_millis();
        sqlx::query(
            "INSERT INTO plugin_preferences (plugin_id, preference_key, value_json, updated_at) VALUES (?, ?, ?, ?) \
             ON CONFLICT(plugin_id, preference_key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at",
        )
        .bind(plugin_id)
        .bind(key)
        .bind(serde_json::to_string(&value).expect("preference value serializes"))
        .bind(updated_at)
        .execute(&self.pool)
        .await?;
        Ok(PluginPreference {
            plugin_id: plugin_id.to_owned(),
            key: key.to_owned(),
            value,
            updated_at,
        })
    }

    pub async fn list_book_entities(&self) -> Result<Vec<BookEntity>, DatabaseError> {
        let rows = sqlx::query(
            "SELECT o.object_id, o.payload_json, d.id notebook_id, d.title notebook_title \
             FROM canvas_objects o JOIN canvas_documents d ON d.id=o.document_id \
             WHERE d.canvas_type='notebook' AND o.object_type='card' ORDER BY d.updated_at DESC, o.sort_index ASC",
        )
        .fetch_all(&self.pool)
        .await?;
        let mut books = Vec::new();
        for row in rows {
            let object_id: String = row.get("object_id");
            let payload: serde_json::Value =
                serde_json::from_str(&row.get::<String, _>("payload_json")).map_err(|source| {
                    DatabaseError::InvalidObjectJson {
                        object_id: object_id.clone(),
                        source,
                    }
                })?;
            if payload.get("pluginId").and_then(serde_json::Value::as_str)
                != Some("notes.book-card")
            {
                continue;
            }
            let data = payload
                .get("pluginData")
                .unwrap_or(&serde_json::Value::Null);
            let title = data
                .get("title")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .trim();
            if title.is_empty() {
                continue;
            }
            books.push(BookEntity {
                card_id: payload
                    .get("id")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or(&object_id)
                    .to_owned(),
                notebook_id: row.get("notebook_id"),
                notebook_title: row.get("notebook_title"),
                title: title.to_owned(),
                author_name: data
                    .get("authorName")
                    .or_else(|| data.get("author"))
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default()
                    .to_owned(),
                cover_media_id: data
                    .get("coverMediaId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_owned),
                cover_width: data.get("coverWidth").and_then(serde_json::Value::as_f64),
                cover_height: data.get("coverHeight").and_then(serde_json::Value::as_f64),
            });
        }
        Ok(books)
    }

    pub async fn list_quran_recordings(
        &self,
        query: &QuranRecordingQuery,
    ) -> Result<Vec<QuranRecording>, DatabaseError> {
        let mut builder = QueryBuilder::<Sqlite>::new(
            "SELECT id, session_id, origin, status, workflow_id, node_id, surah_number, surah_name, ayah_start, end_surah_number, end_surah_name, ayah_end, duration_ms, created_at, updated_at FROM quran_recordings WHERE 1=1",
        );
        if let Some(workflow_id) = &query.workflow_id {
            builder.push(" AND workflow_id=").push_bind(workflow_id);
        }
        if let Some(node_id) = &query.node_id {
            builder.push(" AND node_id=").push_bind(node_id);
        }
        builder.push(" ORDER BY updated_at DESC, id DESC");
        let rows = builder.build().fetch_all(&self.pool).await?;
        let mut recordings = Vec::with_capacity(rows.len());
        for row in rows {
            let id: String = row.get("id");
            let segment_rows = sqlx::query(
                "SELECT id, media_id, sequence, start_ms, source_start_ms, duration_ms, waveform_peaks_json FROM quran_recording_segments WHERE recording_id=? ORDER BY sequence ASC",
            )
            .bind(&id)
            .fetch_all(&self.pool)
            .await?;
            let segments = segment_rows
                .iter()
                .map(quran_segment_from_row)
                .collect::<Result<Vec<_>, _>>()?;
            let boundaries = sqlx::query(
                "SELECT verse_key, sequence, start_ms FROM quran_recording_boundaries WHERE recording_id=? ORDER BY sequence ASC",
            )
            .bind(&id)
            .fetch_all(&self.pool)
            .await?
            .iter()
            .map(|row| QuranAyahBoundary {
                verse_key: row.get("verse_key"),
                sequence: row.get::<i64, _>("sequence") as u32,
                start_ms: row.get("start_ms"),
            })
            .collect();
            let mistakes = sqlx::query(
                "SELECT id, start_verse_key, start_word_position, end_verse_key, end_word_position, text_snapshot, created_at FROM quran_recording_mistakes WHERE recording_id=? ORDER BY created_at ASC, id ASC",
            )
            .bind(&id)
            .fetch_all(&self.pool)
            .await?
            .iter()
            .map(|row| QuranMistakeRange {
                id: row.get("id"),
                start_verse_key: row.get("start_verse_key"),
                start_word_position: row.get::<i64, _>("start_word_position") as u16,
                end_verse_key: row.get("end_verse_key"),
                end_word_position: row.get::<i64, _>("end_word_position") as u16,
                text_snapshot: row.get("text_snapshot"),
                created_at: row.get("created_at"),
            })
            .collect();
            recordings.push(quran_recording_from_row(
                &row, segments, boundaries, mistakes,
            ));
        }
        Ok(recordings)
    }

    pub async fn save_quran_recording(
        &self,
        input: SaveQuranRecordingInput,
    ) -> Result<QuranRecording, DatabaseError> {
        if app_core::quran_ayah_count(input.surah_number)
            .is_none_or(|ayah_count| input.ayah_end > ayah_count)
            || input.ayah_start == 0
            || input.ayah_end < input.ayah_start
            || input.duration_ms < 0
            || !valid_waveform_peaks(&input.waveform_peaks)
        {
            return Err(DatabaseError::InvalidWorkflowPlugin(
                "invalid Quran recording reference".into(),
            ));
        }
        let mut transaction = self.pool.begin().await?;
        let valid: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM media_entries m JOIN canvas_documents d ON d.id=m.canvas_id \
             WHERE m.id=? AND m.canvas_id=? AND d.canvas_type='workflow'",
        )
        .bind(&input.media_id)
        .bind(&input.workflow_id)
        .fetch_one(&mut *transaction)
        .await?;
        if valid == 0 {
            return Err(DatabaseError::InvalidWorkflowPlugin(
                "recording media must belong to the workflow".into(),
            ));
        }
        let now = now_millis();
        let existing_id: Option<String> =
            sqlx::query_scalar("SELECT id FROM quran_recordings WHERE session_id=?")
                .bind(&input.session_id)
                .fetch_optional(&mut *transaction)
                .await?;
        let recording_id = existing_id.unwrap_or_else(|| input.id.clone());
        sqlx::query(
            "INSERT INTO quran_recordings (id, session_id, origin, status, workflow_id, node_id, surah_number, surah_name, ayah_start, end_surah_number, end_surah_name, ayah_end, duration_ms, created_at, updated_at) \
             VALUES (?, ?, 'workflow', 'ready', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) \
             ON CONFLICT(session_id) DO UPDATE SET status='ready', workflow_id=excluded.workflow_id, node_id=excluded.node_id, surah_number=excluded.surah_number, surah_name=excluded.surah_name, ayah_start=excluded.ayah_start, end_surah_number=excluded.end_surah_number, end_surah_name=excluded.end_surah_name, ayah_end=excluded.ayah_end, duration_ms=excluded.duration_ms, updated_at=excluded.updated_at",
        )
        .bind(&recording_id)
        .bind(&input.session_id)
        .bind(&input.workflow_id)
        .bind(&input.node_id)
        .bind(input.surah_number as i64)
        .bind(&input.surah_name)
        .bind(input.ayah_start as i64)
        .bind(input.surah_number as i64)
        .bind(&input.surah_name)
        .bind(input.ayah_end as i64)
        .bind(input.duration_ms)
        .bind(now)
        .bind(now)
        .execute(&mut *transaction)
        .await?;
        sqlx::query("DELETE FROM quran_recording_segments WHERE recording_id=?")
            .bind(&recording_id)
            .execute(&mut *transaction)
            .await?;
        sqlx::query(
            "INSERT INTO quran_recording_segments (id, recording_id, media_id, sequence, start_ms, source_start_ms, duration_ms, waveform_peaks_json) VALUES (?, ?, ?, 0, 0, 0, ?, ?)",
        )
        .bind(format!("{}:segment:0", recording_id))
        .bind(&recording_id)
        .bind(&input.media_id)
        .bind(input.duration_ms)
        .bind(serde_json::to_string(&input.waveform_peaks).expect("waveform peaks serialize"))
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        self.list_quran_recordings(&QuranRecordingQuery {
            workflow_id: Some(input.workflow_id),
            node_id: Some(input.node_id),
        })
        .await?
        .into_iter()
        .find(|recording| recording.id == recording_id)
        .ok_or_else(|| DatabaseError::InvalidWorkflowPlugin("recording was not saved".into()))
    }

    pub async fn start_standalone_quran_recording(
        &self,
        input: StartStandaloneQuranRecordingInput,
    ) -> Result<QuranRecording, DatabaseError> {
        if input.id.trim().is_empty()
            || input.session_id.trim().is_empty()
            || input.start_surah_name.trim().is_empty()
            || input.end_surah_name.trim().is_empty()
            || !input.range.is_valid()
        {
            return Err(DatabaseError::InvalidQuranState(
                "standalone recitation range is invalid".into(),
            ));
        }
        let now = now_millis();
        sqlx::query(
            "INSERT INTO quran_recordings (id, session_id, origin, status, workflow_id, node_id, surah_number, surah_name, ayah_start, end_surah_number, end_surah_name, ayah_end, duration_ms, created_at, updated_at) \
             VALUES (?, ?, 'standalone', 'draft', NULL, NULL, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
        )
        .bind(input.id.trim())
        .bind(input.session_id.trim())
        .bind(i64::from(input.range.start.surah_number))
        .bind(input.start_surah_name.trim())
        .bind(i64::from(input.range.start.ayah_number))
        .bind(i64::from(input.range.end.surah_number))
        .bind(input.end_surah_name.trim())
        .bind(i64::from(input.range.end.ayah_number))
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await?;
        self.list_quran_recordings(&QuranRecordingQuery::default())
            .await?
            .into_iter()
            .find(|recording| recording.id == input.id)
            .ok_or_else(|| DatabaseError::InvalidQuranState("recitation was not created".into()))
    }

    pub async fn save_quran_recording_review(
        &self,
        input: SaveQuranRecordingReviewInput,
    ) -> Result<QuranRecording, DatabaseError> {
        if input.recording_id.trim().is_empty()
            || !matches!(
                input.status,
                QuranRecordingStatus::Paused
                    | QuranRecordingStatus::Ready
                    | QuranRecordingStatus::Checking
                    | QuranRecordingStatus::Completed
                    | QuranRecordingStatus::Cancelled
                    | QuranRecordingStatus::Failed
            )
        {
            return Err(DatabaseError::InvalidQuranState(
                "recitation review state is invalid".into(),
            ));
        }
        let mut boundaries = input.boundaries;
        boundaries.sort_by_key(|boundary| boundary.sequence);
        if boundaries.iter().enumerate().any(|(index, boundary)| {
            boundary.sequence != index as u32
                || boundary.verse_key.trim().is_empty()
                || boundary.start_ms < 0
                || index > 0 && boundary.start_ms < boundaries[index - 1].start_ms
        }) {
            return Err(DatabaseError::InvalidQuranState(
                "ayah boundaries must be ordered".into(),
            ));
        }
        let now = now_millis();
        let mut transaction = self.pool.begin().await?;
        let recording = sqlx::query(
            "SELECT surah_number, ayah_start, end_surah_number, ayah_end FROM quran_recordings WHERE id=?",
        )
        .bind(input.recording_id.trim())
        .fetch_optional(&mut *transaction)
        .await?
        .ok_or_else(|| DatabaseError::InvalidQuranState("recitation does not exist".into()))?;
        if input.status == QuranRecordingStatus::Completed {
            let expected = quran_range_keys(
                recording.get::<i64, _>("surah_number") as u16,
                recording.get::<i64, _>("ayah_start") as u16,
                recording.get::<i64, _>("end_surah_number") as u16,
                recording.get::<i64, _>("ayah_end") as u16,
            );
            if boundaries.len() != expected.len()
                || boundaries
                    .iter()
                    .zip(expected.iter())
                    .any(|(boundary, expected)| boundary.verse_key != *expected)
            {
                return Err(DatabaseError::InvalidQuranState(
                    "every ayah needs one ordered boundary before completion".into(),
                ));
            }
        }
        sqlx::query("DELETE FROM quran_recording_boundaries WHERE recording_id=?")
            .bind(input.recording_id.trim())
            .execute(&mut *transaction)
            .await?;
        for boundary in &boundaries {
            sqlx::query(
                "INSERT INTO quran_recording_boundaries (recording_id, sequence, verse_key, start_ms) VALUES (?, ?, ?, ?)",
            )
            .bind(input.recording_id.trim())
            .bind(i64::from(boundary.sequence))
            .bind(boundary.verse_key.trim())
            .bind(boundary.start_ms)
            .execute(&mut *transaction)
            .await?;
        }
        sqlx::query("DELETE FROM quran_recording_mistakes WHERE recording_id=?")
            .bind(input.recording_id.trim())
            .execute(&mut *transaction)
            .await?;
        for mistake in &input.mistakes {
            if mistake.id.trim().is_empty()
                || mistake.start_verse_key.trim().is_empty()
                || mistake.end_verse_key.trim().is_empty()
                || mistake.start_word_position == 0
                || mistake.end_word_position == 0
            {
                return Err(DatabaseError::InvalidQuranState(
                    "mistake selection is invalid".into(),
                ));
            }
            sqlx::query(
                "INSERT INTO quran_recording_mistakes (id, recording_id, start_verse_key, start_word_position, end_verse_key, end_word_position, text_snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(mistake.id.trim())
            .bind(input.recording_id.trim())
            .bind(mistake.start_verse_key.trim())
            .bind(i64::from(mistake.start_word_position))
            .bind(mistake.end_verse_key.trim())
            .bind(i64::from(mistake.end_word_position))
            .bind(&mistake.text_snapshot)
            .bind(mistake.created_at)
            .execute(&mut *transaction)
            .await?;
        }
        let status = quran_recording_status_str(input.status);
        sqlx::query("UPDATE quran_recordings SET status=?, updated_at=? WHERE id=?")
            .bind(status)
            .bind(now)
            .bind(input.recording_id.trim())
            .execute(&mut *transaction)
            .await?;
        if input.status == QuranRecordingStatus::Completed {
            sqlx::query(
                "INSERT INTO quran_recitation_position (singleton_id, surah_number, ayah_number, recording_id, updated_at) VALUES (1, ?, ?, ?, ?) \
                 ON CONFLICT(singleton_id) DO UPDATE SET surah_number=excluded.surah_number, ayah_number=excluded.ayah_number, recording_id=excluded.recording_id, updated_at=excluded.updated_at",
            )
            .bind(recording.get::<i64, _>("end_surah_number"))
            .bind(recording.get::<i64, _>("ayah_end"))
            .bind(input.recording_id.trim())
            .bind(now)
            .execute(&mut *transaction)
            .await?;
            sqlx::query("UPDATE quran_capture_requests SET status='completed', updated_at=? WHERE recording_id=? AND status NOT IN ('cancelled', 'failed')")
                .bind(now)
                .bind(input.recording_id.trim())
                .execute(&mut *transaction)
                .await?;
        } else {
            let capture_status = match input.status {
                QuranRecordingStatus::Paused => Some("paused"),
                QuranRecordingStatus::Ready => Some("ready"),
                QuranRecordingStatus::Checking => Some("checking"),
                QuranRecordingStatus::Cancelled => Some("cancelled"),
                QuranRecordingStatus::Failed => Some("failed"),
                _ => None,
            };
            if let Some(capture_status) = capture_status {
                sqlx::query("UPDATE quran_capture_requests SET status=?, updated_at=? WHERE recording_id=? AND status!='completed'")
                    .bind(capture_status)
                    .bind(now)
                    .bind(input.recording_id.trim())
                    .execute(&mut *transaction)
                    .await?;
            }
        }
        transaction.commit().await?;
        self.list_quran_recordings(&QuranRecordingQuery::default())
            .await?
            .into_iter()
            .find(|recording| recording.id == input.recording_id)
            .ok_or_else(|| DatabaseError::InvalidQuranState("recitation disappeared".into()))
    }

    pub async fn quran_progress(&self) -> Result<QuranProgress, DatabaseError> {
        let reading = self.quran_reading_position().await?;
        let recitation = sqlx::query(
            "SELECT surah_number, ayah_number, recording_id, updated_at FROM quran_recitation_position WHERE singleton_id=1",
        )
        .fetch_optional(&self.pool)
        .await?
        .map(|row| QuranRecitationPosition {
            surah_number: row.get::<i64, _>("surah_number") as u16,
            ayah_number: row.get::<i64, _>("ayah_number") as u16,
            recording_id: row.get("recording_id"),
            updated_at: row.get("updated_at"),
        });
        Ok(QuranProgress {
            reading,
            recitation,
        })
    }

    pub async fn cached_quran_page(
        &self,
        environment: &str,
        mushaf_id: u16,
        page_number: u16,
    ) -> Result<Option<QuranPage>, DatabaseError> {
        let row = sqlx::query(
            "SELECT response_json FROM quran_content_pages WHERE environment=? AND mushaf_id=? AND page_number=?",
        )
        .bind(environment)
        .bind(i64::from(mushaf_id))
        .bind(i64::from(page_number))
        .fetch_optional(&self.pool)
        .await?;
        row.map(|row| {
            serde_json::from_str::<QuranPage>(&row.get::<String, _>("response_json")).map_err(
                |source| DatabaseError::InvalidObjectJson {
                    object_id: format!("quran-page-{page_number}"),
                    source,
                },
            )
        })
        .transpose()
    }

    pub async fn cache_quran_page(&self, page: &QuranPage) -> Result<(), DatabaseError> {
        sqlx::query(
            "INSERT INTO quran_content_pages (environment, mushaf_id, page_number, response_json, cached_at) VALUES (?, ?, ?, ?, ?) \
             ON CONFLICT(environment, mushaf_id, page_number) DO UPDATE SET response_json=excluded.response_json, cached_at=excluded.cached_at",
        )
        .bind(&page.environment)
        .bind(i64::from(page.mushaf_id))
        .bind(i64::from(page.page_number))
        .bind(serde_json::to_string(page).expect("Quran page serializes"))
        .bind(page.cached_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn cached_quran_verse_page(
        &self,
        environment: &str,
        mushaf_id: u16,
        verse_key: &str,
    ) -> Result<Option<u16>, DatabaseError> {
        let rows = sqlx::query(
            "SELECT page_number, response_json FROM quran_content_pages WHERE environment=? AND mushaf_id=? ORDER BY page_number",
        )
        .bind(environment)
        .bind(i64::from(mushaf_id))
        .fetch_all(&self.pool)
        .await?;
        for row in rows {
            let page: QuranPage = serde_json::from_str(&row.get::<String, _>("response_json"))
                .map_err(|source| DatabaseError::InvalidObjectJson {
                    object_id: format!("quran-page-{}", row.get::<i64, _>("page_number")),
                    source,
                })?;
            if page.verses.iter().any(|verse| verse.verse_key == verse_key) {
                return Ok(Some(page.page_number));
            }
        }
        Ok(None)
    }

    pub async fn replace_quran_recording_range(
        &self,
        input: ReplaceQuranRecordingRangeInput,
    ) -> Result<QuranRecordingMutation, DatabaseError> {
        if input.recording_id.trim().is_empty()
            || input.media_id.trim().is_empty()
            || input.start_ms < 0
            || input.duration_ms <= 0
            || !valid_waveform_peaks(&input.waveform_peaks)
        {
            return Err(DatabaseError::InvalidWorkflowPlugin(
                "invalid Quran recording edit".into(),
            ));
        }
        let mut transaction = self.pool.begin().await?;
        let recording = sqlx::query(
            "SELECT workflow_id, node_id, duration_ms, updated_at FROM quran_recordings WHERE id=?",
        )
        .bind(input.recording_id.trim())
        .fetch_optional(&mut *transaction)
        .await?
        .ok_or_else(|| {
            DatabaseError::InvalidWorkflowPlugin("Quran recording does not exist".into())
        })?;
        let workflow_id: Option<String> = recording.get("workflow_id");
        let node_id: Option<String> = recording.get("node_id");
        let old_duration: i64 = recording.get("duration_ms");
        if input.start_ms > old_duration {
            return Err(DatabaseError::InvalidWorkflowPlugin(
                "recording edit starts after the audio ends".into(),
            ));
        }
        let valid: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM media_entries WHERE id=? AND media_kind='audio'",
        )
        .bind(&input.media_id)
        .fetch_one(&mut *transaction)
        .await?;
        if valid == 0 {
            return Err(DatabaseError::InvalidWorkflowPlugin(
                "recording media must belong to the workflow".into(),
            ));
        }
        let rows = sqlx::query(
            "SELECT id, media_id, sequence, start_ms, source_start_ms, duration_ms, waveform_peaks_json FROM quran_recording_segments WHERE recording_id=? ORDER BY sequence ASC",
        )
        .bind(input.recording_id.trim())
        .fetch_all(&mut *transaction)
        .await?;
        let old_segments: Vec<QuranRecordingSegment> = rows
            .iter()
            .map(quran_segment_from_row)
            .collect::<Result<_, _>>()?;
        let replacement_end = input.start_ms.saturating_add(input.duration_ms);
        let revision = now_millis().max(recording.get::<i64, _>("updated_at") + 1);
        let mut next_segments = Vec::new();
        for segment in &old_segments {
            let end = segment.start_ms.saturating_add(segment.duration_ms);
            if end <= input.start_ms || segment.start_ms >= replacement_end {
                next_segments.push(segment.clone());
                continue;
            }
            if segment.start_ms < input.start_ms {
                let duration = input.start_ms - segment.start_ms;
                next_segments.push(QuranRecordingSegment {
                    id: format!(
                        "{}:edit:{}:left:{}",
                        input.recording_id, revision, segment.sequence
                    ),
                    media_id: segment.media_id.clone(),
                    sequence: 0,
                    start_ms: segment.start_ms,
                    source_start_ms: segment.source_start_ms,
                    duration_ms: duration,
                    waveform_peaks: slice_waveform_peaks(
                        &segment.waveform_peaks,
                        segment.duration_ms,
                        0,
                        duration,
                    ),
                });
            }
            if end > replacement_end {
                let offset = replacement_end - segment.start_ms;
                let duration = end - replacement_end;
                next_segments.push(QuranRecordingSegment {
                    id: format!(
                        "{}:edit:{}:right:{}",
                        input.recording_id, revision, segment.sequence
                    ),
                    media_id: segment.media_id.clone(),
                    sequence: 0,
                    start_ms: replacement_end,
                    source_start_ms: segment.source_start_ms + offset,
                    duration_ms: duration,
                    waveform_peaks: slice_waveform_peaks(
                        &segment.waveform_peaks,
                        segment.duration_ms,
                        offset,
                        duration,
                    ),
                });
            }
        }
        next_segments.push(QuranRecordingSegment {
            id: format!("{}:edit:{}:replacement", input.recording_id, revision),
            media_id: input.media_id.clone(),
            sequence: 0,
            start_ms: input.start_ms,
            source_start_ms: 0,
            duration_ms: input.duration_ms,
            waveform_peaks: input.waveform_peaks,
        });
        next_segments.sort_by_key(|segment| (segment.start_ms, segment.id.clone()));
        for (index, segment) in next_segments.iter_mut().enumerate() {
            segment.sequence = index as i64;
        }
        let retained_media: HashSet<&str> = next_segments
            .iter()
            .map(|segment| segment.media_id.as_str())
            .collect();
        let mut orphaned_media_ids: Vec<String> = old_segments
            .iter()
            .filter(|segment| !retained_media.contains(segment.media_id.as_str()))
            .map(|segment| segment.media_id.clone())
            .collect();
        orphaned_media_ids.sort();
        orphaned_media_ids.dedup();
        sqlx::query("DELETE FROM quran_recording_segments WHERE recording_id=?")
            .bind(input.recording_id.trim())
            .execute(&mut *transaction)
            .await?;
        for segment in &next_segments {
            sqlx::query(
                "INSERT INTO quran_recording_segments (id, recording_id, media_id, sequence, start_ms, source_start_ms, duration_ms, waveform_peaks_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&segment.id)
            .bind(input.recording_id.trim())
            .bind(&segment.media_id)
            .bind(segment.sequence)
            .bind(segment.start_ms)
            .bind(segment.source_start_ms)
            .bind(segment.duration_ms)
            .bind(serde_json::to_string(&segment.waveform_peaks).expect("waveform peaks serialize"))
            .execute(&mut *transaction)
            .await?;
        }
        sqlx::query(
            "UPDATE quran_recordings SET status='ready', duration_ms=?, updated_at=? WHERE id=?",
        )
        .bind(old_duration.max(replacement_end))
        .bind(revision)
        .bind(input.recording_id.trim())
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        let updated = self
            .list_quran_recordings(&QuranRecordingQuery {
                workflow_id,
                node_id,
            })
            .await?
            .into_iter()
            .find(|value| value.id == input.recording_id)
            .ok_or_else(|| {
                DatabaseError::InvalidWorkflowPlugin("recording edit disappeared".into())
            })?;
        Ok(QuranRecordingMutation {
            recording: updated,
            orphaned_media_ids,
        })
    }

    pub async fn cache_quran_recording_segment_peaks(
        &self,
        input: CacheQuranRecordingSegmentPeaksInput,
    ) -> Result<bool, DatabaseError> {
        if input.segment_id.trim().is_empty()
            || input.waveform_peaks.is_empty()
            || !valid_waveform_peaks(&input.waveform_peaks)
        {
            return Err(DatabaseError::InvalidWorkflowPlugin(
                "invalid Quran waveform cache".into(),
            ));
        }
        let result = sqlx::query(
            "UPDATE quran_recording_segments SET waveform_peaks_json=? WHERE id=? AND waveform_peaks_json='[]'",
        )
        .bind(serde_json::to_string(&input.waveform_peaks).expect("waveform peaks serialize"))
        .bind(input.segment_id.trim())
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn delete_quran_recording(&self, id: &str) -> Result<Vec<String>, DatabaseError> {
        let mut transaction = self.pool.begin().await?;
        let mut media_ids: Vec<String> = sqlx::query_scalar(
            "SELECT DISTINCT media_id FROM quran_recording_segments WHERE recording_id=? ORDER BY media_id",
        )
        .bind(id.trim())
        .fetch_all(&mut *transaction)
        .await?;
        let result = sqlx::query("DELETE FROM quran_recordings WHERE id=?")
            .bind(id.trim())
            .execute(&mut *transaction)
            .await?;
        if result.rows_affected() == 0 {
            media_ids.clear();
        }
        transaction.commit().await?;
        Ok(media_ids)
    }

    pub async fn list_persons(
        &self,
        query: Option<&str>,
    ) -> Result<Vec<PersonRecord>, DatabaseError> {
        let rows = if let Some(query) = query.map(str::trim).filter(|query| !query.is_empty()) {
            sqlx::query(
                "SELECT id, name, role, organization, notes, created_at, updated_at FROM persons \
                 WHERE normalized_name LIKE ? ORDER BY name COLLATE NOCASE ASC, id ASC",
            )
            .bind(format!("%{}%", normalize_person_name(query)))
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query(
                "SELECT id, name, role, organization, notes, created_at, updated_at FROM persons \
                 ORDER BY name COLLATE NOCASE ASC, id ASC",
            )
            .fetch_all(&self.pool)
            .await?
        };
        Ok(rows.iter().map(person_from_row).collect())
    }

    pub async fn save_person(&self, input: SavePersonInput) -> Result<PersonRecord, DatabaseError> {
        let id = input.id.trim();
        let name = input.name.trim();
        if id.is_empty() {
            return Err(DatabaseError::InvalidPerson("id is required".into()));
        }
        if name.is_empty() {
            return Err(DatabaseError::InvalidPerson("name is required".into()));
        }
        let normalized_name = normalize_person_name(name);
        let now = now_millis();

        if let Some(row) = sqlx::query(
            "SELECT id, name, role, organization, notes, created_at, updated_at FROM persons WHERE normalized_name=? AND id!=?",
        )
        .bind(&normalized_name)
        .bind(id)
        .fetch_optional(&self.pool)
        .await?
        {
            return Ok(person_from_row(&row));
        }

        if sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM persons WHERE id=?")
            .bind(id)
            .fetch_one(&self.pool)
            .await?
            > 0
        {
            sqlx::query(
                "UPDATE persons SET name=?, normalized_name=?, role=?, organization=?, notes=?, updated_at=? WHERE id=?",
            )
            .bind(name)
            .bind(&normalized_name)
            .bind(input.role.trim())
            .bind(input.organization.trim())
            .bind(input.notes.trim())
            .bind(now)
            .bind(id)
            .execute(&self.pool)
            .await?;
        } else {
            sqlx::query(
                "INSERT INTO persons (id, name, normalized_name, role, organization, notes, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(normalized_name) DO NOTHING",
            )
            .bind(id)
            .bind(name)
            .bind(&normalized_name)
            .bind(input.role.trim())
            .bind(input.organization.trim())
            .bind(input.notes.trim())
            .bind(now)
            .bind(now)
            .execute(&self.pool)
            .await?;
        }

        let row = sqlx::query(
            "SELECT id, name, role, organization, notes, created_at, updated_at FROM persons WHERE id=? OR normalized_name=? ORDER BY id=? DESC LIMIT 1",
        )
        .bind(id)
        .bind(&normalized_name)
        .bind(id)
        .fetch_one(&self.pool)
        .await?;
        Ok(person_from_row(&row))
    }

    pub async fn list_reminder_lists(&self) -> Result<Vec<ReminderList>, DatabaseError> {
        let rows = sqlx::query(
            "SELECT id, name, color, sort_index, created_at, updated_at FROM reminder_lists ORDER BY sort_index ASC, name COLLATE NOCASE ASC",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.iter().map(reminder_list_from_row).collect())
    }

    pub async fn save_reminder_list(
        &self,
        input: SaveReminderListInput,
    ) -> Result<ReminderList, DatabaseError> {
        let name = input.name.trim();
        if input.id.trim().is_empty() || name.is_empty() {
            return Err(DatabaseError::InvalidReminder(
                "list name is required".into(),
            ));
        }
        let now = now_millis();
        sqlx::query(
            "INSERT INTO reminder_lists (id, name, color, sort_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) \
             ON CONFLICT(id) DO UPDATE SET name=excluded.name, color=excluded.color, sort_index=excluded.sort_index, updated_at=excluded.updated_at",
        )
        .bind(&input.id)
        .bind(name)
        .bind(if input.color.trim().is_empty() { "#3B82F6" } else { input.color.as_str() })
        .bind(input.sort_index)
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await?;
        self.reminder_list(&input.id)
            .await?
            .ok_or_else(|| DatabaseError::InvalidReminder("list was not saved".into()))
    }

    pub async fn delete_reminder_list(&self, id: &str) -> Result<bool, DatabaseError> {
        if id == "reminders-inbox" {
            return Err(DatabaseError::InvalidReminder(
                "the default list cannot be deleted".into(),
            ));
        }
        let mut transaction = self.pool.begin().await?;
        sqlx::query("UPDATE reminders SET list_id='reminders-inbox', updated_at=? WHERE list_id=?")
            .bind(now_millis())
            .bind(id)
            .execute(&mut *transaction)
            .await?;
        let deleted = sqlx::query("DELETE FROM reminder_lists WHERE id=?")
            .bind(id)
            .execute(&mut *transaction)
            .await?
            .rows_affected()
            > 0;
        transaction.commit().await?;
        Ok(deleted)
    }

    pub async fn list_reminders(
        &self,
        query: &ReminderQuery,
    ) -> Result<Vec<Reminder>, DatabaseError> {
        let mut builder = QueryBuilder::<Sqlite>::new(
            "SELECT id, list_id, title, notes, due_at, due_has_time, priority, project_id, subtasks_json, completed_at, deleted_at, sort_index, created_at, updated_at FROM reminders WHERE 1=1",
        );
        match query.view {
            ReminderView::Deleted => {
                builder.push(" AND deleted_at IS NOT NULL");
            }
            ReminderView::Completed => {
                builder.push(" AND deleted_at IS NULL AND completed_at IS NOT NULL");
            }
            ReminderView::Today => {
                builder
                    .push(" AND deleted_at IS NULL AND completed_at IS NULL AND due_at>=")
                    .push_bind(query.day_start.unwrap_or(i64::MIN))
                    .push(" AND due_at<")
                    .push_bind(query.day_end.unwrap_or(i64::MAX));
            }
            ReminderView::Scheduled => {
                builder.push(
                    " AND deleted_at IS NULL AND completed_at IS NULL AND due_at IS NOT NULL",
                );
            }
            ReminderView::All => {
                builder.push(" AND deleted_at IS NULL AND completed_at IS NULL");
            }
        }
        if let Some(list_id) = query.list_id.as_deref() {
            builder.push(" AND list_id=").push_bind(list_id);
        }
        if let Some(project_id) = query.project_id.as_deref() {
            builder.push(" AND project_id=").push_bind(project_id);
        }
        builder.push(" ORDER BY sort_index ASC, CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at ASC, created_at ASC");
        let rows = builder.build().fetch_all(&self.pool).await?;
        Ok(rows.iter().map(reminder_from_row).collect())
    }

    pub async fn save_reminder(&self, input: SaveReminderInput) -> Result<Reminder, DatabaseError> {
        let title = input.title.trim();
        if input.id.trim().is_empty() || input.list_id.trim().is_empty() || title.is_empty() {
            return Err(DatabaseError::InvalidReminder(
                "title and list are required".into(),
            ));
        }
        let list_exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM reminder_lists WHERE id=?")
            .bind(&input.list_id)
            .fetch_one(&self.pool)
            .await?;
        if list_exists == 0 {
            return Err(DatabaseError::InvalidReminder("list does not exist".into()));
        }
        let subtasks = normalize_reminder_subtasks(input.subtasks)?;
        let subtasks_json = reminder_subtasks_json(&subtasks);
        let previous_completed_at = self
            .reminder(&input.id)
            .await?
            .and_then(|reminder| reminder.completed_at);
        let now = now_millis();
        let completed_at = reminder_completion_for_subtasks(previous_completed_at, &subtasks, now);
        sqlx::query(
            "INSERT INTO reminders (id, list_id, title, notes, due_at, due_has_time, priority, project_id, subtasks_json, completed_at, deleted_at, sort_index, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET list_id=excluded.list_id, title=excluded.title, \
             notes=excluded.notes, due_at=excluded.due_at, due_has_time=excluded.due_has_time, priority=excluded.priority, project_id=excluded.project_id, subtasks_json=excluded.subtasks_json, completed_at=excluded.completed_at, sort_index=excluded.sort_index, updated_at=excluded.updated_at",
        )
        .bind(&input.id)
        .bind(&input.list_id)
        .bind(title)
        .bind(&input.notes)
        .bind(input.due_at)
        .bind(input.due_has_time as i64)
        .bind(input.priority.as_str())
        .bind(&input.project_id)
        .bind(subtasks_json)
        .bind(completed_at)
        .bind(input.sort_index)
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await?;
        self.reminder(&input.id)
            .await?
            .ok_or_else(|| DatabaseError::InvalidReminder("reminder was not saved".into()))
    }

    pub async fn create_reminder(
        &self,
        input: CreateReminderInput,
    ) -> Result<Reminder, DatabaseError> {
        let title = input.title.trim();
        if input.list_id.trim().is_empty() || title.is_empty() {
            return Err(DatabaseError::InvalidReminder(
                "title and list are required".into(),
            ));
        }
        let id = input
            .id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
            .unwrap_or_else(|| uuid::Uuid::now_v7().to_string());
        if let Some(existing) = self.reminder(&id).await? {
            return Ok(existing);
        }
        let subtasks = normalize_reminder_subtasks(input.subtasks)?;
        let subtasks_json = reminder_subtasks_json(&subtasks);
        let mut transaction = self.pool.begin().await?;
        let list_exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM reminder_lists WHERE id=?")
            .bind(&input.list_id)
            .fetch_one(&mut *transaction)
            .await?;
        if list_exists == 0 {
            return Err(DatabaseError::InvalidReminder("list does not exist".into()));
        }
        let after_index = if let Some(after_id) = input.after_id.as_deref() {
            sqlx::query_scalar::<_, i64>(
                "SELECT sort_index FROM reminders WHERE id=? AND list_id=? AND deleted_at IS NULL",
            )
            .bind(after_id)
            .bind(&input.list_id)
            .fetch_optional(&mut *transaction)
            .await?
        } else {
            None
        };
        let sort_index = if let Some(index) = after_index {
            index + 1
        } else {
            sqlx::query_scalar::<_, i64>(
                "SELECT COALESCE(MAX(sort_index), -1) + 1 FROM reminders WHERE list_id=? AND deleted_at IS NULL",
            )
            .bind(&input.list_id)
            .fetch_one(&mut *transaction)
            .await?
        };
        let now = now_millis();
        let completed_at = reminder_completion_for_subtasks(None, &subtasks, now);
        let inserted = sqlx::query(
            "INSERT OR IGNORE INTO reminders (id, list_id, title, notes, due_at, due_has_time, priority, project_id, subtasks_json, completed_at, deleted_at, sort_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)",
        )
        .bind(&id)
        .bind(&input.list_id)
        .bind(title)
        .bind(&input.notes)
        .bind(input.due_at)
        .bind(input.due_has_time as i64)
        .bind(input.priority.as_str())
        .bind(&input.project_id)
        .bind(subtasks_json)
        .bind(completed_at)
        .bind(sort_index)
        .bind(now)
        .bind(now)
        .execute(&mut *transaction)
        .await?;
        if inserted.rows_affected() == 0 {
            transaction.commit().await?;
            return self
                .reminder(&id)
                .await?
                .ok_or_else(|| DatabaseError::InvalidReminder("reminder was not created".into()));
        }
        if after_index.is_some() {
            sqlx::query(
                "UPDATE reminders SET sort_index=sort_index+1 WHERE id<>? AND list_id=? AND deleted_at IS NULL AND sort_index>=?",
            )
            .bind(&id)
            .bind(&input.list_id)
            .bind(sort_index)
            .execute(&mut *transaction)
            .await?;
        }
        transaction.commit().await?;
        self.reminder(&id)
            .await?
            .ok_or_else(|| DatabaseError::InvalidReminder("reminder was not created".into()))
    }

    pub async fn update_reminder(
        &self,
        input: UpdateReminderInput,
    ) -> Result<Reminder, DatabaseError> {
        let title = input.title.trim();
        if input.id.trim().is_empty() || input.list_id.trim().is_empty() || title.is_empty() {
            return Err(DatabaseError::InvalidReminder(
                "title, id, and list are required".into(),
            ));
        }
        let list_exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM reminder_lists WHERE id=?")
            .bind(&input.list_id)
            .fetch_one(&self.pool)
            .await?;
        if list_exists == 0 {
            return Err(DatabaseError::InvalidReminder("list does not exist".into()));
        }
        let subtasks = normalize_reminder_subtasks(input.subtasks)?;
        let subtasks_json = reminder_subtasks_json(&subtasks);
        let previous_completed_at = self
            .reminder(&input.id)
            .await?
            .ok_or_else(|| DatabaseError::InvalidReminder("reminder does not exist".into()))?
            .completed_at;
        let now = now_millis();
        let completed_at = reminder_completion_for_subtasks(previous_completed_at, &subtasks, now);
        let result = sqlx::query(
            "UPDATE reminders SET list_id=?, title=?, notes=?, due_at=?, due_has_time=?, priority=?, project_id=?, subtasks_json=?, completed_at=?, sort_index=?, updated_at=? WHERE id=? AND deleted_at IS NULL",
        )
        .bind(&input.list_id)
        .bind(title)
        .bind(&input.notes)
        .bind(input.due_at)
        .bind(input.due_has_time as i64)
        .bind(input.priority.as_str())
        .bind(&input.project_id)
        .bind(subtasks_json)
        .bind(completed_at)
        .bind(input.sort_index)
        .bind(now)
        .bind(&input.id)
        .execute(&self.pool)
        .await?;
        if result.rows_affected() == 0 {
            return Err(DatabaseError::InvalidReminder(
                "reminder does not exist".into(),
            ));
        }
        self.reminder(&input.id)
            .await?
            .ok_or_else(|| DatabaseError::InvalidReminder("reminder was not updated".into()))
    }

    pub async fn reorder_reminders(
        &self,
        list_id: &str,
        ordered_ids: &[String],
    ) -> Result<Vec<Reminder>, DatabaseError> {
        if list_id.trim().is_empty() {
            return Err(DatabaseError::InvalidReminder("list is required".into()));
        }
        let now = now_millis();
        let mut transaction = self.pool.begin().await?;
        for (sort_index, id) in ordered_ids.iter().enumerate() {
            let result = sqlx::query(
                "UPDATE reminders SET sort_index=?, updated_at=? WHERE id=? AND list_id=? AND deleted_at IS NULL",
            )
            .bind(sort_index as i64)
            .bind(now)
            .bind(id)
            .bind(list_id)
            .execute(&mut *transaction)
            .await?;
            if result.rows_affected() == 0 {
                return Err(DatabaseError::InvalidReminder(format!(
                    "reminder {id} does not belong to this list"
                )));
            }
        }
        transaction.commit().await?;
        self.list_reminders(&ReminderQuery {
            view: ReminderView::All,
            list_id: Some(list_id.to_owned()),
            project_id: None,
            day_start: None,
            day_end: None,
        })
        .await
    }

    pub async fn set_reminder_completed(
        &self,
        id: &str,
        completed: bool,
    ) -> Result<Option<Reminder>, DatabaseError> {
        let Some(reminder) = self.reminder(id).await? else {
            return Ok(None);
        };
        if !reminder.subtasks.is_empty() {
            return Err(DatabaseError::InvalidReminder(
                "reminders with subtasks are completed through their subtasks".into(),
            ));
        }
        let now = now_millis();
        let result = sqlx::query(
            "UPDATE reminders SET completed_at=?, updated_at=? WHERE id=? AND deleted_at IS NULL",
        )
        .bind(completed.then_some(now))
        .bind(now)
        .bind(id)
        .execute(&self.pool)
        .await?;
        if result.rows_affected() == 0 {
            Ok(None)
        } else {
            self.reminder(id).await
        }
    }

    pub async fn delete_reminder(&self, id: &str) -> Result<Option<Reminder>, DatabaseError> {
        let now = now_millis();
        let result = sqlx::query("UPDATE reminders SET deleted_at=?, updated_at=? WHERE id=?")
            .bind(now)
            .bind(now)
            .bind(id)
            .execute(&self.pool)
            .await?;
        if result.rows_affected() == 0 {
            Ok(None)
        } else {
            self.reminder(id).await
        }
    }

    pub async fn restore_reminder(&self, id: &str) -> Result<Option<Reminder>, DatabaseError> {
        let result = sqlx::query("UPDATE reminders SET deleted_at=NULL, updated_at=? WHERE id=?")
            .bind(now_millis())
            .bind(id)
            .execute(&self.pool)
            .await?;
        if result.rows_affected() == 0 {
            Ok(None)
        } else {
            self.reminder(id).await
        }
    }

    pub async fn permanently_delete_reminder(&self, id: &str) -> Result<bool, DatabaseError> {
        Ok(
            sqlx::query("DELETE FROM reminders WHERE id=? AND deleted_at IS NOT NULL")
                .bind(id)
                .execute(&self.pool)
                .await?
                .rows_affected()
                > 0,
        )
    }

    async fn reminder_list(&self, id: &str) -> Result<Option<ReminderList>, DatabaseError> {
        let row = sqlx::query("SELECT id, name, color, sort_index, created_at, updated_at FROM reminder_lists WHERE id=?")
            .bind(id).fetch_optional(&self.pool).await?;
        Ok(row.as_ref().map(reminder_list_from_row))
    }

    async fn reminder(&self, id: &str) -> Result<Option<Reminder>, DatabaseError> {
        let row = sqlx::query("SELECT id, list_id, title, notes, due_at, due_has_time, priority, project_id, subtasks_json, completed_at, deleted_at, sort_index, created_at, updated_at FROM reminders WHERE id=?")
            .bind(id).fetch_optional(&self.pool).await?;
        Ok(row.as_ref().map(reminder_from_row))
    }

    pub async fn list_card_templates(&self) -> Result<Vec<CardTemplate>, DatabaseError> {
        let rows = sqlx::query(
            "SELECT t.id, t.name, t.width, t.height, t.fields_json, t.elements_json, t.bindings_json, \
             t.built_in, t.revision, t.created_at, t.updated_at, COUNT(i.instance_id) usage_count \
             FROM card_templates t LEFT JOIN card_template_instances i ON i.template_id=t.id \
             GROUP BY t.id ORDER BY t.built_in DESC, t.created_at ASC, t.name COLLATE NOCASE ASC",
        ).fetch_all(&self.pool).await?;
        rows.iter().map(card_template_from_row).collect()
    }

    pub async fn get_card_template(&self, id: &str) -> Result<Option<CardTemplate>, DatabaseError> {
        let row = sqlx::query(
            "SELECT t.id, t.name, t.width, t.height, t.fields_json, t.elements_json, t.bindings_json, \
             t.built_in, t.revision, t.created_at, t.updated_at, COUNT(i.instance_id) usage_count \
             FROM card_templates t LEFT JOIN card_template_instances i ON i.template_id=t.id \
             WHERE t.id=? GROUP BY t.id",
        ).bind(id).fetch_optional(&self.pool).await?;
        row.as_ref().map(card_template_from_row).transpose()
    }

    pub async fn save_card_template(
        &self,
        input: SaveCardTemplateInput,
    ) -> Result<CardTemplate, DatabaseError> {
        validate_card_template(&input)?;
        let fields_json = serde_json::to_string(&input.fields).map_err(|source| {
            DatabaseError::InvalidObjectJson {
                object_id: input.id.clone(),
                source,
            }
        })?;
        let elements_json = serde_json::to_string(&input.elements).map_err(|source| {
            DatabaseError::InvalidObjectJson {
                object_id: input.id.clone(),
                source,
            }
        })?;
        let bindings_json = serde_json::to_string(&input.bindings).map_err(|source| {
            DatabaseError::InvalidObjectJson {
                object_id: input.id.clone(),
                source,
            }
        })?;
        let existing =
            sqlx::query("SELECT built_in, revision, created_at FROM card_templates WHERE id=?")
                .bind(&input.id)
                .fetch_optional(&self.pool)
                .await?;
        let now = now_millis();
        let (built_in, revision, created_at) = if let Some(row) = existing {
            let actual: i64 = row.get("revision");
            if let Some(expected) = input.expected_revision {
                if expected != actual {
                    return Err(DatabaseError::CardTemplateRevisionConflict {
                        id: input.id,
                        expected,
                        actual,
                    });
                }
            }
            (
                row.get::<i64, _>("built_in"),
                actual + 1,
                row.get::<i64, _>("created_at"),
            )
        } else {
            (0, 1, now)
        };
        sqlx::query(
            "INSERT INTO card_templates (id, name, width, height, fields_json, elements_json, bindings_json, built_in, revision, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, width=excluded.width, \
             height=excluded.height, fields_json=excluded.fields_json, elements_json=excluded.elements_json, \
             bindings_json=excluded.bindings_json, revision=excluded.revision, updated_at=excluded.updated_at",
        ).bind(&input.id).bind(input.name.trim()).bind(input.width).bind(input.height)
            .bind(fields_json).bind(elements_json).bind(bindings_json).bind(built_in)
            .bind(revision).bind(created_at).bind(now).execute(&self.pool).await?;
        self.get_card_template(&input.id)
            .await?
            .ok_or(DatabaseError::CardTemplateNotFound(input.id))
    }

    pub async fn delete_card_template(&self, id: &str) -> Result<bool, DatabaseError> {
        let row = sqlx::query(
            "SELECT t.built_in, COUNT(i.instance_id) usage_count FROM card_templates t \
             LEFT JOIN card_template_instances i ON i.template_id=t.id WHERE t.id=? GROUP BY t.id",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        let Some(row) = row else {
            return Ok(false);
        };
        if row.get::<i64, _>("built_in") != 0 {
            return Err(DatabaseError::BuiltInCardTemplate(id.to_owned()));
        }
        let usage_count: i64 = row.get("usage_count");
        if usage_count > 0 {
            return Err(DatabaseError::CardTemplateInUse {
                id: id.to_owned(),
                usage_count,
            });
        }
        Ok(sqlx::query("DELETE FROM card_templates WHERE id=?")
            .bind(id)
            .execute(&self.pool)
            .await?
            .rows_affected()
            > 0)
    }

    pub async fn reset_card_template(&self, id: &str) -> Result<CardTemplate, DatabaseError> {
        let Some(mut input) = builtin_card_template(id) else {
            return Err(DatabaseError::BuiltInCardTemplate(id.to_owned()));
        };
        let existing = self
            .get_card_template(id)
            .await?
            .ok_or_else(|| DatabaseError::CardTemplateNotFound(id.to_owned()))?;
        if !existing.built_in {
            return Err(DatabaseError::BuiltInCardTemplate(id.to_owned()));
        }
        input.expected_revision = Some(existing.revision);
        self.save_card_template(input).await
    }

    async fn seed_builtin_card_templates(&self) -> Result<(), DatabaseError> {
        let now = now_millis();
        for input in [
            builtin_card_template("builtin.book"),
            builtin_card_template("builtin.person"),
        ]
        .into_iter()
        .flatten()
        {
            sqlx::query(
                "INSERT OR IGNORE INTO card_templates (id, name, width, height, fields_json, elements_json, bindings_json, built_in, revision, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)",
            ).bind(&input.id).bind(&input.name).bind(input.width).bind(input.height)
                .bind(serde_json::to_string(&input.fields).unwrap())
                .bind(serde_json::to_string(&input.elements).unwrap())
                .bind(serde_json::to_string(&input.bindings).unwrap())
                .bind(now).bind(now).execute(&self.pool).await?;
        }
        Ok(())
    }

    pub async fn list_canvas_cards(&self) -> Result<Vec<CanvasCardProjection>, DatabaseError> {
        let rows = sqlx::query(
            "SELECT o.object_id, o.payload_json, d.id document_id, d.title document_title, \
             l.layer_id, l.name layer_name, l.interaction_color FROM canvas_objects o \
             JOIN canvas_documents d ON d.id=o.document_id JOIN canvas_layers l ON l.document_id=o.document_id \
             AND l.layer_id=o.layer_id WHERE o.object_type='card' ORDER BY d.updated_at DESC, o.sort_index ASC",
        ).fetch_all(&self.pool).await?;
        let mut cards = Vec::with_capacity(rows.len());
        for row in rows {
            let object_id: String = row.get("object_id");
            cards.push(CanvasCardProjection {
                document_id: row.get("document_id"),
                document_title: row.get("document_title"),
                layer_id: row.get("layer_id"),
                layer_name: row.get("layer_name"),
                interaction_color: row.get::<i64, _>("interaction_color") as u32,
                card: serde_json::from_str(&row.get::<String, _>("payload_json"))
                    .map_err(|source| DatabaseError::InvalidObjectJson { object_id, source })?,
            });
        }
        Ok(cards)
    }

    pub async fn list_media(&self, query: &MediaListQuery) -> Result<MediaPage, DatabaseError> {
        let limit = query.limit.clamp(1, 200) as i64;
        let mut builder = QueryBuilder::<Sqlite>::new(
            "SELECT m.id, m.canvas_id, d.title canvas_title, m.original_name, m.mime_type, m.media_kind, \
             m.size_bytes, m.width, m.height, m.thumbnail_key, m.proxy_key, m.created_at FROM media_entries m \
             JOIN canvas_documents d ON d.id=m.canvas_id WHERE 1=1",
        );
        if let Some(canvas_id) = query.canvas_id.as_deref() {
            builder.push(" AND m.canvas_id=").push_bind(canvas_id);
        }
        if let Some(canvas_type) = query.canvas_type {
            builder
                .push(" AND d.canvas_type=")
                .push_bind(canvas_type.as_str());
        }
        if let Some(search) = query
            .query
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            builder
                .push(" AND LOWER(m.original_name) LIKE ")
                .push_bind(format!("%{}%", search.to_lowercase()));
        }
        if let Some(kind) = &query.kind {
            builder.push(" AND m.media_kind=").push_bind(kind.as_str());
        }
        if let Some(cursor) = &query.cursor {
            builder
                .push(" AND (m.created_at < ")
                .push_bind(cursor.created_at)
                .push(" OR (m.created_at = ")
                .push_bind(cursor.created_at)
                .push(" AND m.id < ")
                .push_bind(&cursor.id)
                .push("))");
        }
        builder
            .push(" ORDER BY m.created_at DESC, m.id DESC LIMIT ")
            .push_bind(limit + 1);
        let rows = builder.build().fetch_all(&self.pool).await?;
        let has_more = rows.len() as i64 > limit;
        let mut items: Vec<MediaEntry> = rows
            .iter()
            .take(limit as usize)
            .map(media_from_row)
            .collect();
        let next_cursor = if has_more {
            items.last().map(|item| MediaCursor {
                created_at: item.created_at,
                id: item.id.clone(),
            })
        } else {
            None
        };
        items.shrink_to_fit();
        Ok(MediaPage { items, next_cursor })
    }

    pub async fn get_media_entry(&self, id: &str) -> Result<Option<MediaEntry>, DatabaseError> {
        let row = sqlx::query(
            "SELECT m.id, m.canvas_id, d.title canvas_title, m.original_name, m.mime_type, m.media_kind, \
             m.size_bytes, m.width, m.height, m.thumbnail_key, m.proxy_key, m.created_at FROM media_entries m \
             JOIN canvas_documents d ON d.id=m.canvas_id WHERE m.id=?",
        ).bind(id).fetch_optional(&self.pool).await?;
        Ok(row.as_ref().map(media_from_row))
    }

    pub async fn reminder_exists(&self, id: &str) -> Result<bool, DatabaseError> {
        Ok(
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM reminders WHERE id=?")
                .bind(id)
                .fetch_one(&self.pool)
                .await?
                > 0,
        )
    }

    pub async fn list_reminder_images(
        &self,
        reminder_ids: &[String],
    ) -> Result<Vec<ReminderImageAttachment>, DatabaseError> {
        if reminder_ids.is_empty() {
            return Ok(Vec::new());
        }
        let mut builder = QueryBuilder::<Sqlite>::new(
            "SELECT id, reminder_id, original_name, mime_type, size_bytes, width, height, thumbnail_key, created_at FROM media_entries WHERE reminder_id IN (",
        );
        let mut separated = builder.separated(", ");
        for id in reminder_ids {
            separated.push_bind(id);
        }
        separated.push_unseparated(") ORDER BY created_at, id");
        let rows = builder.build().fetch_all(&self.pool).await?;
        Ok(rows.iter().map(reminder_image_from_row).collect())
    }

    pub async fn find_reminder_image_by_hash(
        &self,
        reminder_id: &str,
        content_hash: &str,
    ) -> Result<Option<ReminderImageAttachment>, DatabaseError> {
        let row = sqlx::query(
            "SELECT id, reminder_id, original_name, mime_type, size_bytes, width, height, thumbnail_key, created_at FROM media_entries WHERE reminder_id=? AND content_hash=?",
        )
        .bind(reminder_id)
        .bind(content_hash)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.as_ref().map(reminder_image_from_row))
    }

    pub async fn get_reminder_image(
        &self,
        id: &str,
    ) -> Result<Option<ReminderImageAttachment>, DatabaseError> {
        let row = sqlx::query(
            "SELECT id, reminder_id, original_name, mime_type, size_bytes, width, height, thumbnail_key, created_at FROM media_entries WHERE id=? AND reminder_id IS NOT NULL",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.as_ref().map(reminder_image_from_row))
    }

    pub async fn insert_reminder_image(
        &self,
        entry: NewReminderImage,
    ) -> Result<ReminderImageAttachment, DatabaseError> {
        let now = now_millis();
        sqlx::query(
            "INSERT INTO media_entries (id, canvas_id, reminder_id, original_name, mime_type, media_kind, size_bytes, content_hash, storage_key, thumbnail_key, proxy_key, width, height, created_at, updated_at) VALUES (?, NULL, ?, ?, ?, 'image', ?, ?, ?, ?, NULL, ?, ?, ?, ?)",
        )
        .bind(&entry.id)
        .bind(&entry.reminder_id)
        .bind(&entry.original_name)
        .bind(&entry.mime_type)
        .bind(entry.size_bytes)
        .bind(&entry.content_hash)
        .bind(&entry.storage_key)
        .bind(&entry.thumbnail_key)
        .bind(entry.width)
        .bind(entry.height)
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await?;
        self.find_reminder_image_by_hash(&entry.reminder_id, &entry.content_hash)
            .await?
            .ok_or_else(|| DatabaseError::InvalidReminder("reminder image was not saved".into()))
    }

    pub async fn find_media_by_hash(
        &self,
        canvas_id: &str,
        content_hash: &str,
    ) -> Result<Option<MediaEntry>, DatabaseError> {
        let row = sqlx::query(
            "SELECT m.id, m.canvas_id, d.title canvas_title, m.original_name, m.mime_type, m.media_kind, \
             m.size_bytes, m.width, m.height, m.thumbnail_key, m.proxy_key, m.created_at FROM media_entries m \
             JOIN canvas_documents d ON d.id=m.canvas_id WHERE m.canvas_id=? AND m.content_hash=?",
        ).bind(canvas_id).bind(content_hash).fetch_optional(&self.pool).await?;
        Ok(row.as_ref().map(media_from_row))
    }

    pub async fn insert_media(&self, entry: NewMediaEntry) -> Result<MediaEntry, DatabaseError> {
        let now = now_millis();
        sqlx::query(
            "INSERT INTO media_entries (id, canvas_id, original_name, mime_type, media_kind, size_bytes, \
             content_hash, storage_key, thumbnail_key, proxy_key, width, height, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(&entry.id).bind(&entry.canvas_id).bind(&entry.original_name).bind(&entry.mime_type)
            .bind(entry.kind.as_str()).bind(entry.size_bytes).bind(&entry.content_hash)
            .bind(&entry.storage_key).bind(&entry.thumbnail_key).bind(&entry.proxy_key).bind(entry.width).bind(entry.height)
            .bind(now).bind(now).execute(&self.pool).await?;
        Ok(self
            .get_media_entry(&entry.id)
            .await?
            .expect("inserted media must exist"))
    }

    pub async fn get_media_storage(&self, id: &str) -> Result<Option<MediaStorage>, DatabaseError> {
        let row = sqlx::query(
            "SELECT id, original_name, mime_type, size_bytes, content_hash, storage_key, thumbnail_key, proxy_key \
             FROM media_entries WHERE id=?",
        ).bind(id).fetch_optional(&self.pool).await?;
        Ok(row.as_ref().map(media_storage_from_row))
    }

    pub async fn media_storage_for_canvas(
        &self,
        canvas_id: &str,
    ) -> Result<Vec<MediaStorage>, DatabaseError> {
        let rows = sqlx::query(
            "SELECT id, original_name, mime_type, size_bytes, content_hash, storage_key, thumbnail_key, proxy_key \
             FROM media_entries WHERE canvas_id=?",
        ).bind(canvas_id).fetch_all(&self.pool).await?;
        Ok(rows.iter().map(media_storage_from_row).collect())
    }

    pub async fn media_storage_for_reminder(
        &self,
        reminder_id: &str,
    ) -> Result<Vec<MediaStorage>, DatabaseError> {
        let rows = sqlx::query(
            "SELECT id, original_name, mime_type, size_bytes, content_hash, storage_key, thumbnail_key, proxy_key FROM media_entries WHERE reminder_id=?",
        )
        .bind(reminder_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.iter().map(media_storage_from_row).collect())
    }

    pub async fn delete_media(&self, id: &str) -> Result<Option<DeletedMedia>, DatabaseError> {
        let mut transaction = self.pool.begin().await?;
        let row = sqlx::query(
            "SELECT id, original_name, mime_type, size_bytes, content_hash, storage_key, thumbnail_key, proxy_key \
             FROM media_entries WHERE id=?",
        ).bind(id).fetch_optional(&mut *transaction).await?;
        let Some(row) = row else {
            return Ok(None);
        };
        let storage = media_storage_from_row(&row);
        sqlx::query("DELETE FROM media_entries WHERE id=?")
            .bind(id)
            .execute(&mut *transaction)
            .await?;
        let remaining =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM media_entries WHERE storage_key=?")
                .bind(&storage.storage_key)
                .fetch_one(&mut *transaction)
                .await?;
        transaction.commit().await?;
        Ok(Some(DeletedMedia {
            storage,
            storage_still_referenced: remaining > 0,
        }))
    }

    pub async fn media_storage_ref_count(&self, storage_key: &str) -> Result<i64, DatabaseError> {
        Ok(
            sqlx::query_scalar("SELECT COUNT(*) FROM media_entries WHERE storage_key=?")
                .bind(storage_key)
                .fetch_one(&self.pool)
                .await?,
        )
    }

    pub async fn all_media_storage(&self) -> Result<Vec<MediaStorage>, DatabaseError> {
        let rows = sqlx::query(
            "SELECT id, original_name, mime_type, size_bytes, content_hash, storage_key, thumbnail_key, proxy_key FROM media_entries",
        ).fetch_all(&self.pool).await?;
        Ok(rows.iter().map(media_storage_from_row).collect())
    }

    pub async fn seed_canvases_once(
        &self,
        inputs: Vec<SaveCanvasInput>,
    ) -> Result<bool, DatabaseError> {
        let seeded =
            sqlx::query("SELECT value FROM app_metadata WHERE key='canvas_demo_seeded_v1'")
                .fetch_optional(&self.pool)
                .await?
                .is_some();
        if seeded {
            return Ok(false);
        }
        for input in inputs {
            self.save_canvas(input).await?;
        }
        sqlx::query(
            "INSERT INTO app_metadata (key, value) VALUES ('canvas_demo_seeded_v1', 'true')",
        )
        .execute(&self.pool)
        .await?;
        Ok(true)
    }

    async fn summary(&self, id: &str) -> Result<Option<CanvasDocumentSummary>, DatabaseError> {
        let row = sqlx::query(
            "SELECT d.id, d.title, d.project, d.canvas_type, d.workflow_kind, d.icon, d.starred, d.created_at, d.updated_at, d.revision, d.cover_media_id, p.data_url \
             FROM canvas_documents d LEFT JOIN canvas_previews p ON p.document_id=d.id WHERE d.id=?",
        ).bind(id).fetch_optional(&self.pool).await?;
        Ok(row.as_ref().map(summary_from_row))
    }
}

struct LegacyTemplate {
    fields: serde_json::Value,
    elements: serde_json::Value,
    bindings: serde_json::Value,
}

fn migrate_legacy_card_value(
    value: &mut serde_json::Value,
    templates: &HashMap<String, LegacyTemplate>,
) -> bool {
    let mut changed = false;
    match value {
        serde_json::Value::Array(values) => {
            for child in values {
                changed |= migrate_legacy_card_value(child, templates);
            }
        }
        serde_json::Value::Object(object) => {
            if let Some(tiers) = object.get_mut("tiers") {
                changed |= migrate_legacy_card_value(tiers, templates);
            }
            if let Some(elements) = object.get_mut("elements") {
                changed |= migrate_legacy_card_value(elements, templates);
            }
            if object.get("type").and_then(serde_json::Value::as_str) != Some("card") {
                return changed;
            }
            let kind = object
                .get("kind")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned);
            let question_data = if kind.as_deref() == Some("revision") {
                Some(serde_json::json!({
                    "revisionKind": object.get("revisionKind").cloned().unwrap_or_else(|| serde_json::json!("basic")),
                    "front": object.get("front").cloned().unwrap_or_else(|| serde_json::json!("Question")),
                    "back": object.get("back").cloned().unwrap_or_else(|| serde_json::json!("Answer")),
                    "cloze": object.get("cloze").cloned().unwrap_or_else(|| serde_json::json!("A {{c1::cloze}} hides part of a fact.")),
                    "frontHeight": object.get("frontHeight").cloned(),
                    "backHeight": object.get("backHeight").cloned(),
                }))
            } else if kind.as_deref() == Some("plugin")
                && object.get("pluginId").and_then(serde_json::Value::as_str)
                    == Some("notes.question-card")
            {
                object.get("pluginData").cloned()
            } else {
                None
            };
            if let Some(data) = question_data {
                let width = object
                    .get("width")
                    .and_then(serde_json::Value::as_f64)
                    .unwrap_or(280.0);
                let base_height = object
                    .get("height")
                    .and_then(serde_json::Value::as_f64)
                    .unwrap_or(160.0);
                let front_height = data
                    .get("frontHeight")
                    .and_then(serde_json::Value::as_f64)
                    .unwrap_or(base_height)
                    .max(60.0);
                let back_height = data
                    .get("backHeight")
                    .and_then(serde_json::Value::as_f64)
                    .unwrap_or(base_height)
                    .max(60.0);
                let is_cloze =
                    data.get("revisionKind").and_then(serde_json::Value::as_str) == Some("cloze");
                let (front, back) = if is_cloze {
                    legacy_cloze_tiers(
                        data.get("cloze")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or_default(),
                    )
                } else {
                    (
                        data.get("front")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or_default()
                            .to_owned(),
                        data.get("back")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or_default()
                            .to_owned(),
                    )
                };
                let card_id = object
                    .get("id")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("card")
                    .to_owned();
                object.insert("kind".into(), serde_json::json!("canvas"));
                object.insert("height".into(), serde_json::json!(front_height));
                object.insert(
                    "tiers".into(),
                    serde_json::json!([
                        legacy_text_tier(
                            "front",
                            "Front",
                            &format!("{card_id}::front"),
                            &front,
                            width,
                            front_height
                        ),
                        legacy_text_tier(
                            "back",
                            "Back",
                            &format!("{card_id}::back"),
                            &back,
                            width,
                            back_height
                        ),
                    ]),
                );
                for key in [
                    "elements",
                    "revisionKind",
                    "front",
                    "back",
                    "cloze",
                    "frontHeight",
                    "backHeight",
                    "clozeHeight",
                    "pluginId",
                    "pluginVersion",
                    "pluginData",
                ] {
                    object.remove(key);
                }
                changed = true;
            }
            match kind.as_deref() {
                Some("template") => {
                    let template_id = object
                        .get("templateId")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or_default();
                    let values = object
                        .get("templateValues")
                        .cloned()
                        .unwrap_or_else(|| serde_json::json!({}));
                    if let Some(template) = templates.get(template_id) {
                        let mut elements = template.elements.clone();
                        apply_legacy_template_values(
                            &mut elements,
                            &template.fields,
                            &template.bindings,
                            &values,
                        );
                        let card_id = object
                            .get("id")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or("card")
                            .to_owned();
                        prefix_legacy_element_ids(&mut elements, &card_id);
                        object.insert("kind".into(), serde_json::json!("canvas"));
                        object.insert("elements".into(), elements);
                        object.remove("templateId");
                        object.remove("templateValues");
                        changed = true;
                    }
                }
                _ => {}
            }
            if object.get("tiers").is_none() {
                let elements = object
                    .remove("elements")
                    .unwrap_or_else(|| serde_json::json!([]));
                let tier_kind = object
                    .get("kind")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("canvas");
                let width = object
                    .get("width")
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!(220));
                let height = object
                    .get("height")
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!(140));
                object.insert(
                    "tiers".into(),
                    serde_json::json!([{
                        "id": "front",
                        "name": "Front",
                        "kind": tier_kind,
                        "width": width,
                        "height": height,
                        "revision": 0,
                        "elements": elements,
                    }]),
                );
                changed = true;
            }
        }
        _ => {}
    }
    changed
}

fn legacy_text_tier(
    id: &str,
    name: &str,
    element_id: &str,
    text: &str,
    width: f64,
    height: f64,
) -> serde_json::Value {
    serde_json::json!({
        "id": id,
        "name": name,
        "kind": "canvas",
        "width": width,
        "height": height,
        "revision": 1,
        "elements": [{
            "id": element_id,
            "type": "text",
            "x": 12,
            "y": 12,
            "width": (width - 24.0).max(80.0),
            "height": (height - 24.0).max(36.0),
            "text": text,
            "format": "markdown",
            "sizing": "fixed",
            "fontSize": 18,
            "lineHeight": 24,
            "padding": 0,
        }],
    })
}

fn legacy_cloze_tiers(source: &str) -> (String, String) {
    let mut prompt = String::new();
    let mut answer = String::new();
    let mut remaining = source;
    while let Some(start) = remaining.find("{{c") {
        prompt.push_str(&remaining[..start]);
        answer.push_str(&remaining[..start]);
        let after = &remaining[start + 3..];
        let Some(separator) = after.find("::") else {
            prompt.push_str(&remaining[start..]);
            answer.push_str(&remaining[start..]);
            return (prompt, answer);
        };
        let body = &after[separator + 2..];
        let Some(close) = body.find("}}") else {
            prompt.push_str(&remaining[start..]);
            answer.push_str(&remaining[start..]);
            return (prompt, answer);
        };
        let value = &body[..close];
        let (revealed, hint) = value.split_once("::").unwrap_or((value, ""));
        if hint.is_empty() {
            prompt.push_str("[…]");
        } else {
            prompt.push('[');
            prompt.push_str(hint);
            prompt.push(']');
        }
        answer.push_str(revealed);
        remaining = &body[close + 2..];
    }
    prompt.push_str(remaining);
    answer.push_str(remaining);
    (prompt, answer)
}

fn apply_legacy_template_values(
    elements: &mut serde_json::Value,
    fields: &serde_json::Value,
    bindings: &serde_json::Value,
    values: &serde_json::Value,
) {
    let defaults: HashMap<&str, &serde_json::Value> = fields
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|field| Some((field.get("id")?.as_str()?, field.get("defaultValue")?)))
        .collect();
    let supplied = values.as_object();
    let Some(elements) = elements.as_array_mut() else {
        return;
    };
    for binding in bindings.as_array().into_iter().flatten() {
        let Some(element_id) = binding.get("elementId").and_then(serde_json::Value::as_str) else {
            continue;
        };
        let Some(field_id) = binding.get("fieldId").and_then(serde_json::Value::as_str) else {
            continue;
        };
        let Some(property) = binding.get("property").and_then(serde_json::Value::as_str) else {
            continue;
        };
        let value = supplied
            .and_then(|items| items.get(field_id))
            .or_else(|| defaults.get(field_id).copied());
        let Some(element) = elements
            .iter_mut()
            .find(|item| item.get("id").and_then(serde_json::Value::as_str) == Some(element_id))
        else {
            continue;
        };
        if property == "text" {
            element["text"] = value
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .into();
        } else if property == "image" {
            if let Some(image) = value.and_then(serde_json::Value::as_object) {
                element["src"] = image
                    .get("src")
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!(""));
                if let Some(name) = image.get("name") {
                    element["name"] = name.clone();
                }
                if let Some(media_id) = image.get("mediaId") {
                    element["mediaId"] = media_id.clone();
                }
            }
        }
    }
}

fn prefix_legacy_element_ids(value: &mut serde_json::Value, card_id: &str) {
    match value {
        serde_json::Value::Array(values) => {
            for child in values {
                prefix_legacy_element_ids(child, card_id);
            }
        }
        serde_json::Value::Object(object) => {
            if let Some(id) = object.get_mut("id") {
                if let Some(raw) = id.as_str() {
                    *id = format!("{card_id}::{raw}").into();
                }
            }
            for child in object.values_mut() {
                prefix_legacy_element_ids(child, card_id);
            }
        }
        _ => {}
    }
}

fn summary_from_row(row: &sqlx::sqlite::SqliteRow) -> CanvasDocumentSummary {
    CanvasDocumentSummary {
        id: row.get("id"),
        title: row.get("title"),
        project: row.get("project"),
        canvas_type: CanvasType::from(row.get::<String, _>("canvas_type").as_str()),
        workflow_kind: WorkflowDocumentKind::from(row.get::<String, _>("workflow_kind").as_str()),
        icon: row.get("icon"),
        starred: row.get::<i64, _>("starred") != 0,
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        revision: row.get("revision"),
        preview_data_url: row.get("data_url"),
        cover_media_id: row.get("cover_media_id"),
    }
}

fn normalize_person_name(name: &str) -> String {
    name.trim().to_lowercase()
}

fn person_from_row(row: &sqlx::sqlite::SqliteRow) -> PersonRecord {
    PersonRecord {
        id: row.get("id"),
        name: row.get("name"),
        role: row.get("role"),
        organization: row.get("organization"),
        notes: row.get("notes"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn reminder_list_from_row(row: &sqlx::sqlite::SqliteRow) -> ReminderList {
    ReminderList {
        id: row.get("id"),
        name: row.get("name"),
        color: row.get("color"),
        sort_index: row.get("sort_index"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn reminder_from_row(row: &sqlx::sqlite::SqliteRow) -> Reminder {
    let priority = match row.get::<String, _>("priority").as_str() {
        "low" => ReminderPriority::Low,
        "medium" => ReminderPriority::Medium,
        "high" => ReminderPriority::High,
        _ => ReminderPriority::None,
    };
    let subtasks =
        serde_json::from_str::<Vec<ReminderSubtask>>(&row.get::<String, _>("subtasks_json"))
            .unwrap_or_default();
    Reminder {
        id: row.get("id"),
        list_id: row.get("list_id"),
        title: row.get("title"),
        notes: row.get("notes"),
        due_at: row.get("due_at"),
        due_has_time: row.get::<i64, _>("due_has_time") != 0,
        priority,
        project_id: row.get("project_id"),
        subtasks,
        completed_at: row.get("completed_at"),
        deleted_at: row.get("deleted_at"),
        sort_index: row.get("sort_index"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn card_template_from_row(row: &sqlx::sqlite::SqliteRow) -> Result<CardTemplate, DatabaseError> {
    let id: String = row.get("id");
    let parse = |column: &str| -> Result<serde_json::Value, DatabaseError> {
        let source: String = row.get(column);
        serde_json::from_str(&source).map_err(|source| DatabaseError::InvalidObjectJson {
            object_id: id.clone(),
            source,
        })
    };
    Ok(CardTemplate {
        id: id.clone(),
        name: row.get("name"),
        width: row.get("width"),
        height: row.get("height"),
        fields: parse("fields_json")?,
        elements: parse("elements_json")?,
        bindings: parse("bindings_json")?,
        built_in: row.get::<i64, _>("built_in") != 0,
        revision: row.get("revision"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        usage_count: row.get("usage_count"),
    })
}

fn validate_card_template(input: &SaveCardTemplateInput) -> Result<(), DatabaseError> {
    if input.id.trim().is_empty() {
        return Err(DatabaseError::InvalidCardTemplate("id is required".into()));
    }
    if input.name.trim().is_empty() {
        return Err(DatabaseError::InvalidCardTemplate(
            "name is required".into(),
        ));
    }
    if !input.width.is_finite()
        || !input.height.is_finite()
        || input.width < 80.0
        || input.height < 60.0
    {
        return Err(DatabaseError::InvalidCardTemplate(
            "dimensions must be finite and at least 80 × 60".into(),
        ));
    }
    if !input.fields.is_array() || !input.elements.is_array() || !input.bindings.is_array() {
        return Err(DatabaseError::InvalidCardTemplate(
            "fields, elements, and bindings must be arrays".into(),
        ));
    }
    Ok(())
}

fn collect_template_instances(value: &serde_json::Value, result: &mut Vec<(String, String)>) {
    match value {
        serde_json::Value::Object(object) => {
            if object.get("type").and_then(|value| value.as_str()) == Some("card")
                && object.get("kind").and_then(|value| value.as_str()) == Some("template")
            {
                if let (Some(id), Some(template_id)) = (
                    object.get("id").and_then(|value| value.as_str()),
                    object.get("templateId").and_then(|value| value.as_str()),
                ) {
                    result.push((id.to_owned(), template_id.to_owned()));
                }
            }
            for child in object.values() {
                collect_template_instances(child, result);
            }
        }
        serde_json::Value::Array(values) => {
            for child in values {
                collect_template_instances(child, result);
            }
        }
        _ => {}
    }
}

fn builtin_card_template(id: &str) -> Option<SaveCardTemplateInput> {
    match id {
        "builtin.book" => Some(SaveCardTemplateInput {
            id: id.into(),
            name: "Book".into(),
            width: 360.0,
            height: 200.0,
            fields: serde_json::json!([
                { "id": "builtin.book.cover", "label": "Cover", "type": "image", "required": false, "defaultValue": { "src": "" } },
                { "id": "builtin.book.name", "label": "Name", "type": "text", "required": true, "defaultValue": "Untitled book" },
                { "id": "builtin.book.description", "label": "Description", "type": "description", "required": false, "defaultValue": "" }
            ]),
            elements: serde_json::json!([
                { "id": "builtin.book.cover.element", "type": "image", "layerId": "main", "x": 16, "y": 16, "width": 112, "height": 168, "rotation": 0, "opacity": 1, "src": "", "name": "Book cover", "lockAspectRatio": false, "cornerRadius": 6 },
                { "id": "builtin.book.name.element", "type": "text", "layerId": "main", "x": 148, "y": 18, "width": 196, "height": 34, "rotation": 0, "opacity": 1, "text": "Untitled book", "fontSize": 22, "lineHeight": 28, "weight": "bold", "color": 2032944, "padding": 0, "singleLine": true, "overflow": "ellipsis", "format": "plain", "sizing": "fixed", "minHeight": 34 },
                { "id": "builtin.book.description.element", "type": "text", "layerId": "main", "x": 148, "y": 62, "width": 196, "height": 120, "rotation": 0, "opacity": 1, "text": "", "fontSize": 15, "lineHeight": 21, "weight": "regular", "color": 6579307, "padding": 0, "format": "plain", "sizing": "fixed", "minHeight": 32 }
            ]),
            bindings: serde_json::json!([
                { "elementId": "builtin.book.cover.element", "fieldId": "builtin.book.cover", "property": "image" },
                { "elementId": "builtin.book.name.element", "fieldId": "builtin.book.name", "property": "text" },
                { "elementId": "builtin.book.description.element", "fieldId": "builtin.book.description", "property": "text" }
            ]),
            expected_revision: None,
        }),
        "builtin.person" => Some(SaveCardTemplateInput {
            id: id.into(),
            name: "Person".into(),
            width: 340.0,
            height: 180.0,
            fields: serde_json::json!([
                { "id": "builtin.person.photo", "label": "Photo", "type": "image", "required": false, "defaultValue": { "src": "" } },
                { "id": "builtin.person.name", "label": "Name", "type": "text", "required": true, "defaultValue": "Unnamed person" },
                { "id": "builtin.person.bio", "label": "Bio", "type": "description", "required": false, "defaultValue": "" }
            ]),
            elements: serde_json::json!([
                { "id": "builtin.person.photo.element", "type": "image", "layerId": "main", "x": 16, "y": 26, "width": 96, "height": 128, "rotation": 0, "opacity": 1, "src": "", "name": "Portrait", "lockAspectRatio": false, "cornerRadius": 48 },
                { "id": "builtin.person.name.element", "type": "text", "layerId": "main", "x": 132, "y": 24, "width": 192, "height": 34, "rotation": 0, "opacity": 1, "text": "Unnamed person", "fontSize": 22, "lineHeight": 28, "weight": "bold", "color": 2032944, "padding": 0, "singleLine": true, "overflow": "ellipsis", "format": "plain", "sizing": "fixed", "minHeight": 34 },
                { "id": "builtin.person.bio.element", "type": "text", "layerId": "main", "x": 132, "y": 70, "width": 192, "height": 84, "rotation": 0, "opacity": 1, "text": "", "fontSize": 15, "lineHeight": 21, "weight": "regular", "color": 6579307, "padding": 0, "format": "plain", "sizing": "fixed", "minHeight": 32 }
            ]),
            bindings: serde_json::json!([
                { "elementId": "builtin.person.photo.element", "fieldId": "builtin.person.photo", "property": "image" },
                { "elementId": "builtin.person.name.element", "fieldId": "builtin.person.name", "property": "text" },
                { "elementId": "builtin.person.bio.element", "fieldId": "builtin.person.bio", "property": "text" }
            ]),
            expected_revision: None,
        }),
        _ => None,
    }
}

fn media_from_row(row: &sqlx::sqlite::SqliteRow) -> MediaEntry {
    MediaEntry {
        id: row.get("id"),
        canvas_id: row.get("canvas_id"),
        canvas_title: row.get("canvas_title"),
        original_name: row.get("original_name"),
        mime_type: row.get("mime_type"),
        kind: MediaKind::from(row.get::<String, _>("media_kind").as_str()),
        size_bytes: row.get("size_bytes"),
        width: row.get("width"),
        height: row.get("height"),
        has_thumbnail: row.get::<Option<String>, _>("thumbnail_key").is_some(),
        has_proxy: row.get::<Option<String>, _>("proxy_key").is_some(),
        created_at: row.get("created_at"),
    }
}

fn reminder_image_from_row(row: &sqlx::sqlite::SqliteRow) -> ReminderImageAttachment {
    ReminderImageAttachment {
        id: row.get("id"),
        reminder_id: row.get("reminder_id"),
        original_name: row.get("original_name"),
        mime_type: row.get("mime_type"),
        size_bytes: row.get("size_bytes"),
        width: row.get("width"),
        height: row.get("height"),
        has_thumbnail: row.get::<Option<String>, _>("thumbnail_key").is_some(),
        created_at: row.get("created_at"),
    }
}

fn quran_recording_from_row(
    row: &sqlx::sqlite::SqliteRow,
    segments: Vec<QuranRecordingSegment>,
    boundaries: Vec<QuranAyahBoundary>,
    mistakes: Vec<QuranMistakeRange>,
) -> QuranRecording {
    QuranRecording {
        id: row.get("id"),
        session_id: row.get("session_id"),
        origin: match row.get::<String, _>("origin").as_str() {
            "standalone" => QuranRecordingOrigin::Standalone,
            _ => QuranRecordingOrigin::Workflow,
        },
        status: match row.get::<String, _>("status").as_str() {
            "recording" => QuranRecordingStatus::Recording,
            "paused" => QuranRecordingStatus::Paused,
            "ready" => QuranRecordingStatus::Ready,
            "checking" => QuranRecordingStatus::Checking,
            "completed" => QuranRecordingStatus::Completed,
            "cancelled" => QuranRecordingStatus::Cancelled,
            "failed" => QuranRecordingStatus::Failed,
            _ => QuranRecordingStatus::Draft,
        },
        workflow_id: row.get("workflow_id"),
        node_id: row.get("node_id"),
        surah_number: row.get::<i64, _>("surah_number") as u16,
        surah_name: row.get("surah_name"),
        ayah_start: row.get::<i64, _>("ayah_start") as u16,
        end_surah_number: row.get::<i64, _>("end_surah_number") as u16,
        end_surah_name: row.get("end_surah_name"),
        ayah_end: row.get::<i64, _>("ayah_end") as u16,
        duration_ms: row.get("duration_ms"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        segments,
        boundaries,
        mistakes,
    }
}

fn quran_segment_from_row(
    row: &sqlx::sqlite::SqliteRow,
) -> Result<QuranRecordingSegment, DatabaseError> {
    let id: String = row.get("id");
    let waveform_peaks = serde_json::from_str(&row.get::<String, _>("waveform_peaks_json"))
        .map_err(|source| DatabaseError::InvalidObjectJson {
            object_id: id.clone(),
            source,
        })?;
    Ok(QuranRecordingSegment {
        id,
        media_id: row.get("media_id"),
        sequence: row.get("sequence"),
        start_ms: row.get("start_ms"),
        source_start_ms: row.get("source_start_ms"),
        duration_ms: row.get("duration_ms"),
        waveform_peaks,
    })
}

fn quran_recording_status_str(status: QuranRecordingStatus) -> &'static str {
    match status {
        QuranRecordingStatus::Draft => "draft",
        QuranRecordingStatus::Recording => "recording",
        QuranRecordingStatus::Paused => "paused",
        QuranRecordingStatus::Ready => "ready",
        QuranRecordingStatus::Checking => "checking",
        QuranRecordingStatus::Completed => "completed",
        QuranRecordingStatus::Cancelled => "cancelled",
        QuranRecordingStatus::Failed => "failed",
    }
}

fn quran_range_keys(
    start_surah: u16,
    start_ayah: u16,
    end_surah: u16,
    end_ayah: u16,
) -> Vec<String> {
    let mut result = Vec::new();
    for surah in start_surah..=end_surah {
        let first = if surah == start_surah { start_ayah } else { 1 };
        let last = if surah == end_surah {
            end_ayah
        } else {
            app_core::quran_ayah_count(surah).unwrap_or_default()
        };
        for ayah in first..=last {
            result.push(format!("{surah}:{ayah}"));
        }
    }
    result
}

fn valid_waveform_peaks(peaks: &[f32]) -> bool {
    peaks.len() <= 4_096
        && peaks
            .iter()
            .all(|peak| peak.is_finite() && (0.0..=1.0).contains(peak))
}

fn slice_waveform_peaks(
    peaks: &[f32],
    source_duration: i64,
    offset: i64,
    duration: i64,
) -> Vec<f32> {
    if peaks.is_empty() || source_duration <= 0 || duration <= 0 {
        return Vec::new();
    }
    let start =
        ((offset.max(0) as f64 / source_duration as f64) * peaks.len() as f64).floor() as usize;
    let end = ((((offset + duration).max(0) as f64 / source_duration as f64) * peaks.len() as f64)
        .ceil() as usize)
        .min(peaks.len());
    peaks[start.min(end)..end].to_vec()
}

fn media_storage_from_row(row: &sqlx::sqlite::SqliteRow) -> MediaStorage {
    MediaStorage {
        id: row.get("id"),
        original_name: row.get("original_name"),
        mime_type: row.get("mime_type"),
        size_bytes: row.get("size_bytes"),
        content_hash: row.get("content_hash"),
        storage_key: row.get("storage_key"),
        thumbnail_key: row.get("thumbnail_key"),
        proxy_key: row.get("proxy_key"),
    }
}

fn normalize_reminder_subtasks(
    subtasks: Vec<ReminderSubtask>,
) -> Result<Vec<ReminderSubtask>, DatabaseError> {
    let mut ids = HashSet::with_capacity(subtasks.len());
    subtasks
        .into_iter()
        .map(|mut subtask| {
            subtask.id = subtask.id.trim().to_owned();
            subtask.title = subtask.title.trim().to_owned();
            if subtask.id.is_empty() || subtask.title.is_empty() {
                return Err(DatabaseError::InvalidReminder(
                    "subtask id and title are required".into(),
                ));
            }
            if !ids.insert(subtask.id.clone()) {
                return Err(DatabaseError::InvalidReminder(
                    "subtask ids must be unique".into(),
                ));
            }
            Ok(subtask)
        })
        .collect()
}

fn reminder_subtasks_json(subtasks: &[ReminderSubtask]) -> String {
    serde_json::to_string(subtasks).expect("reminder subtasks serialize")
}

fn reminder_completion_for_subtasks(
    previous: Option<i64>,
    subtasks: &[ReminderSubtask],
    now: i64,
) -> Option<i64> {
    if subtasks.is_empty() {
        previous
    } else if subtasks.iter().all(|subtask| subtask.completed) {
        previous.or(Some(now))
    } else {
        None
    }
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn applied_media_migration_checksum_is_frozen() {
        const HISTORICAL_CHECKSUM: &str = "10770f76de58dcd49704ed0a8dea2ead4273bff42a7d2a7da29e8856e48a3d3e4feed38cceb402e51284a87396f8dd0e";
        let migrator = sqlx::migrate!("./migrations");
        let migration = migrator
            .iter()
            .find(|migration| migration.version == 202608260001)
            .expect("historical media migration exists");
        let checksum = migration
            .checksum
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        assert_eq!(checksum, HISTORICAL_CHECKSUM);
    }

    #[tokio::test]
    async fn migrates_legacy_revision_sessions_to_time_goals() {
        let path = std::env::temp_dir().join(format!(
            "productivity-revision-migration-{}-{}.sqlite3",
            std::process::id(),
            now_millis()
        ));
        let options = SqliteConnectOptions::from_str(&format!("sqlite://{}", path.display()))
            .unwrap()
            .create_if_missing(true)
            .foreign_keys(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .unwrap();
        sqlx::query("CREATE TABLE plugin_installations (plugin_id TEXT PRIMARY KEY NOT NULL, installed INTEGER NOT NULL, installed_at INTEGER NOT NULL)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!(
            "../migrations/202609090002_add_protocol_10_state.sql"
        ))
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("INSERT INTO revision_sessions (id, workflow_id, node_id, notebook_id, duration_ms, elapsed_ms, status, queue_size, reviewed_count, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind("legacy-session")
            .bind("workflow-one")
            .bind("review-node")
            .bind("notebook-one")
            .bind(25 * 60_000_i64)
            .bind(12_000_i64)
            .bind("paused")
            .bind(8_i64)
            .bind(2_i64)
            .bind(Option::<i64>::None)
            .bind(1_i64)
            .bind(2_i64)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!(
            "../migrations/202609210001_extend_revision_sessions.sql"
        ))
        .execute(&pool)
        .await
        .unwrap();

        let row = sqlx::query("SELECT goal_type, goal_value, status, total_cards, remaining_cards, reviewed_count, right_count, wrong_count FROM revision_sessions WHERE id='legacy-session'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(row.get::<String, _>("goal_type"), "time");
        assert_eq!(row.get::<i64, _>("goal_value"), 25 * 60_000);
        assert_eq!(row.get::<String, _>("status"), "paused");
        assert_eq!(row.get::<i64, _>("total_cards"), 10);
        assert_eq!(row.get::<i64, _>("remaining_cards"), 8);
        assert_eq!(row.get::<i64, _>("reviewed_count"), 2);
        assert_eq!(row.get::<i64, _>("right_count"), 0);
        assert_eq!(row.get::<i64, _>("wrong_count"), 0);
        sqlx::query("UPDATE revision_sessions SET status='cancelled' WHERE id='legacy-session'")
            .execute(&pool)
            .await
            .unwrap();
        let results_table: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM revision_session_results")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(results_table, 0);
        sqlx::raw_sql(include_str!(
            "../migrations/202609220002_revision_workspace_and_activities.sql"
        ))
        .execute(&pool)
        .await
        .unwrap();
        let workspace_row = sqlx::query(
            "SELECT origin, workflow_id, node_id, status FROM revision_sessions WHERE id='legacy-session'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(workspace_row.get::<String, _>("origin"), "workflow");
        assert_eq!(
            workspace_row
                .get::<Option<String>, _>("workflow_id")
                .as_deref(),
            Some("workflow-one")
        );
        assert_eq!(
            workspace_row.get::<Option<String>, _>("node_id").as_deref(),
            Some("review-node")
        );
        assert_eq!(workspace_row.get::<String, _>("status"), "cancelled");
        let queue_table: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM revision_session_cards")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(queue_table, 0);

        pool.close().await;
        std::fs::remove_file(&path).ok();
    }

    #[tokio::test]
    async fn migrates_legacy_quran_recordings_into_timeline_segments() {
        let path = std::env::temp_dir().join(format!(
            "productivity-quran-migration-{}-{}.sqlite3",
            std::process::id(),
            now_millis()
        ));
        let options = SqliteConnectOptions::from_str(&format!("sqlite://{}", path.display()))
            .unwrap()
            .create_if_missing(true)
            .foreign_keys(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .unwrap();
        sqlx::raw_sql(
            "CREATE TABLE canvas_documents (id TEXT PRIMARY KEY NOT NULL);\
             CREATE TABLE media_entries (id TEXT PRIMARY KEY NOT NULL);\
             CREATE TABLE quran_recordings (\
               id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL UNIQUE,\
               workflow_id TEXT NOT NULL REFERENCES canvas_documents(id) ON DELETE CASCADE,\
               node_id TEXT NOT NULL, media_id TEXT NOT NULL REFERENCES media_entries(id) ON DELETE CASCADE,\
               surah_number INTEGER NOT NULL, surah_name TEXT NOT NULL, ayah_start INTEGER NOT NULL,\
               ayah_end INTEGER NOT NULL, duration_ms INTEGER NOT NULL, created_at INTEGER NOT NULL\
             );\
             CREATE INDEX quran_recordings_workflow_node_created_idx ON quran_recordings(workflow_id, node_id, created_at DESC);\
             INSERT INTO canvas_documents (id) VALUES ('workflow');\
             INSERT INTO media_entries (id) VALUES ('legacy-media');\
             INSERT INTO quran_recordings VALUES ('recording', 'session', 'workflow', 'node', 'legacy-media', 1, 'Al-Fatihah', 1, 7, 31000, 42);",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::raw_sql(include_str!(
            "../migrations/202609220001_segment_quran_recordings.sql"
        ))
        .execute(&pool)
        .await
        .unwrap();

        let recording = sqlx::query(
            "SELECT duration_ms, created_at, updated_at FROM quran_recordings WHERE id='recording'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(recording.get::<i64, _>("duration_ms"), 31_000);
        assert_eq!(recording.get::<i64, _>("created_at"), 42);
        assert_eq!(recording.get::<i64, _>("updated_at"), 42);
        let segment = sqlx::query("SELECT media_id, sequence, start_ms, source_start_ms, duration_ms, waveform_peaks_json FROM quran_recording_segments WHERE recording_id='recording'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(segment.get::<String, _>("media_id"), "legacy-media");
        assert_eq!(segment.get::<i64, _>("sequence"), 0);
        assert_eq!(segment.get::<i64, _>("start_ms"), 0);
        assert_eq!(segment.get::<i64, _>("source_start_ms"), 0);
        assert_eq!(segment.get::<i64, _>("duration_ms"), 31_000);
        assert_eq!(segment.get::<String, _>("waveform_peaks_json"), "[]");
        let database = Database { pool: pool.clone() };
        assert!(
            database
                .cache_quran_recording_segment_peaks(CacheQuranRecordingSegmentPeaksInput {
                    segment_id: "recording:legacy".into(),
                    waveform_peaks: vec![0.1, 0.7, 0.3],
                })
                .await
                .unwrap()
        );
        assert!(
            !database
                .cache_quran_recording_segment_peaks(CacheQuranRecordingSegmentPeaksInput {
                    segment_id: "recording:legacy".into(),
                    waveform_peaks: vec![0.9],
                })
                .await
                .unwrap()
        );
        pool.close().await;
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn round_trips_a_structured_canvas_with_its_viewport_and_card_projection() {
        let path = std::env::temp_dir().join(format!(
            "productivity-database-{}-{}.sqlite3",
            std::process::id(),
            now_millis()
        ));
        let database = Database::open(&path, 1, 1_000).await.unwrap();
        database.save_canvas(SaveCanvasInput {
            id: "viewport-test".into(), title: "Viewport test".into(), project: "Tests".into(), icon: "flask-conical".into(),
            canvas_type: CanvasType::Base,
            workflow_kind: WorkflowDocumentKind::Workflow,
            starred: true, cover_media_id: None, expected_revision: None,
            canvas: CanvasSnapshot {
                schema_version: 1, active_layer_id: "base".into(), focused_layer_id: None,
                unfocused_layer_opacity: 0.35,
                viewport: CanvasViewport { x: -312.5, y: 84.25, scale: 1.75 },
                layers: vec![CanvasLayer { id: "base".into(), name: "Base".into(), z_index: 0, visible: true, opacity: 1.0, interaction_color: 0x3b82f6 }],
                objects: vec![CanvasObject { id: "card-1".into(), layer_id: "base".into(), object_type: "card".into(), sort_index: 0, payload: json!({ "id": "card-1", "type": "card", "layerId": "base", "title": "Shared card" }) }],
            },
        }).await.unwrap();

        let document = database.get_canvas("viewport-test").await.unwrap().unwrap();
        assert_eq!(
            document.canvas.viewport,
            CanvasViewport {
                x: -312.5,
                y: 84.25,
                scale: 1.75
            }
        );
        assert_eq!(document.canvas.layers[0].interaction_color, 0x3b82f6);
        let cards = database.list_canvas_cards().await.unwrap();
        assert_eq!(cards.len(), 1);
        assert_eq!(cards[0].card["title"], "Shared card");

        database.pool.close().await;
        std::fs::remove_file(&path).ok();
        std::fs::remove_file(path.with_extension("sqlite3-shm")).ok();
        std::fs::remove_file(path.with_extension("sqlite3-wal")).ok();
    }

    #[tokio::test]
    async fn manages_card_templates_and_tracks_linked_instances() {
        let path = std::env::temp_dir().join(format!(
            "productivity-templates-{}-{}.sqlite3",
            std::process::id(),
            now_millis()
        ));
        let database = Database::open(&path, 1, 1_000).await.unwrap();

        let seeded = database.list_card_templates().await.unwrap();
        assert_eq!(seeded.len(), 2);
        assert!(
            seeded
                .iter()
                .any(|template| template.id == "builtin.book" && template.built_in)
        );
        assert!(
            seeded
                .iter()
                .any(|template| template.id == "builtin.person" && template.built_in)
        );

        let saved = database.save_card_template(SaveCardTemplateInput {
            id: "custom.profile".into(),
            name: "Profile".into(),
            width: 320.0,
            height: 180.0,
            fields: json!([{ "id": "name", "label": "Name", "type": "text", "required": true }]),
            elements: json!([{ "id": "label", "type": "text", "x": 12, "y": 12, "width": 200, "height": 32, "text": "Name" }]),
            bindings: json!([{ "elementId": "label", "fieldId": "name", "property": "text" }]),
            expected_revision: None,
        }).await.unwrap();
        assert_eq!(saved.revision, 1);
        assert!(!saved.built_in);

        database.save_canvas(SaveCanvasInput {
            id: "template-canvas".into(), title: "Templates".into(), project: "Tests".into(), icon: "layout-template".into(),
            canvas_type: CanvasType::Base, workflow_kind: WorkflowDocumentKind::Workflow, starred: false, cover_media_id: None, expected_revision: None,
            canvas: CanvasSnapshot {
                schema_version: 2, active_layer_id: "main".into(), focused_layer_id: None,
                unfocused_layer_opacity: 0.35, viewport: CanvasViewport::default(),
                layers: vec![CanvasLayer { id: "main".into(), name: "Main".into(), z_index: 0, visible: true, opacity: 1.0, interaction_color: 0x3b82f6 }],
                objects: vec![CanvasObject {
                    id: "profile-one".into(), layer_id: "main".into(), object_type: "card".into(), sort_index: 0,
                    payload: json!({
                        "id": "profile-one", "type": "card", "kind": "template", "templateId": "custom.profile",
                        "templateValues": { "name": "Ada" }, "elements": [], "x": 0, "y": 0, "width": 320, "height": 180
                    }),
                }],
            },
        }).await.unwrap();

        let in_use = database
            .get_card_template("custom.profile")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(in_use.usage_count, 1);
        assert!(matches!(
            database.delete_card_template("custom.profile").await,
            Err(DatabaseError::CardTemplateInUse { usage_count: 1, .. })
        ));

        let mut document = database
            .get_canvas("template-canvas")
            .await
            .unwrap()
            .unwrap();
        document.canvas.objects.clear();
        database
            .save_canvas(SaveCanvasInput {
                id: document.summary.id,
                title: document.summary.title,
                project: document.summary.project,
                icon: document.summary.icon,
                canvas_type: document.summary.canvas_type,
                workflow_kind: document.summary.workflow_kind,
                starred: document.summary.starred,
                cover_media_id: document.summary.cover_media_id,
                expected_revision: Some(document.summary.revision),
                canvas: document.canvas,
            })
            .await
            .unwrap();
        assert!(
            database
                .delete_card_template("custom.profile")
                .await
                .unwrap()
        );

        let book = database
            .get_card_template("builtin.book")
            .await
            .unwrap()
            .unwrap();
        let mut modified = builtin_card_template("builtin.book").unwrap();
        modified.name = "Changed book".into();
        modified.expected_revision = Some(book.revision);
        database.save_card_template(modified).await.unwrap();
        let reset = database.reset_card_template("builtin.book").await.unwrap();
        assert_eq!(reset.name, "Book");
        assert!(matches!(
            database.delete_card_template("builtin.book").await,
            Err(DatabaseError::BuiltInCardTemplate(_))
        ));

        database.pool.close().await;
        std::fs::remove_file(&path).ok();
        std::fs::remove_file(path.with_extension("sqlite3-shm")).ok();
        std::fs::remove_file(path.with_extension("sqlite3-wal")).ok();
    }

    #[tokio::test]
    async fn schedules_notebook_questions_without_requiring_source_links() {
        let path = std::env::temp_dir().join(format!(
            "productivity-revision-{}-{}.sqlite3",
            std::process::id(),
            now_millis()
        ));
        let database = Database::open(&path, 1, 1_000).await.unwrap();
        let snapshot = |linked: bool| {
            let mut objects = vec![
                CanvasObject {
                    id: "fact-1".into(),
                    layer_id: "facts".into(),
                    object_type: "card".into(),
                    sort_index: 0,
                    payload: json!({
                        "id": "fact-1", "type": "card", "kind": "markdown", "markdown": "# Water\nA useful fact", "elements": []
                    }),
                },
                CanvasObject {
                    id: "question-1".into(),
                    layer_id: "questions".into(),
                    object_type: "card".into(),
                    sort_index: 1,
                    payload: json!({
                        "id": "question-1", "type": "card", "kind": "revision", "revisionKind": "basic",
                        "front": "When does water freeze?", "back": "At 0°C", "cloze": "", "elements": []
                    }),
                },
            ];
            if linked {
                objects.push(CanvasObject { id: "arrow-1".into(), layer_id: "questions".into(), object_type: "arrow".into(), sort_index: 2, payload: json!({
                    "id": "arrow-1", "type": "arrow",
                    "start": { "binding": { "objectId": "question-1", "anchor": { "x": 1, "y": 0.5 } }, "point": { "x": 0, "y": 0 } },
                    "end": { "binding": { "objectId": "fact-1", "anchor": { "x": 0, "y": 0.5 } }, "point": { "x": 1, "y": 0 } }
                }) });
            }
            CanvasSnapshot {
                schema_version: 2,
                active_layer_id: "questions".into(),
                focused_layer_id: None,
                unfocused_layer_opacity: 0.35,
                viewport: CanvasViewport::default(),
                layers: vec![
                    CanvasLayer {
                        id: "facts".into(),
                        name: "Facts".into(),
                        z_index: 0,
                        visible: true,
                        opacity: 1.0,
                        interaction_color: 0x3b82f6,
                    },
                    CanvasLayer {
                        id: "questions".into(),
                        name: "Questions".into(),
                        z_index: 1,
                        visible: true,
                        opacity: 1.0,
                        interaction_color: 0x8b5cf6,
                    },
                ],
                objects,
            }
        };
        let saved = database
            .save_canvas(SaveCanvasInput {
                id: "wiki-revision".into(),
                title: "Science".into(),
                project: "Study".into(),
                icon: "book-open".into(),
                canvas_type: CanvasType::Notebook,
                workflow_kind: WorkflowDocumentKind::Workflow,
                starred: false,
                cover_media_id: None,
                expected_revision: None,
                canvas: snapshot(true),
            })
            .await
            .unwrap();

        database
            .save_card_tier_previews(&[SaveCardTierPreviewInput {
                document_id: "wiki-revision".into(),
                card_id: "question-1".into(),
                tier_id: "front".into(),
                tier_revision: 2,
                data_url: "data:image/jpeg;base64,new".into(),
            }])
            .await
            .unwrap();
        database
            .save_card_tier_previews(&[SaveCardTierPreviewInput {
                document_id: "wiki-revision".into(),
                card_id: "question-1".into(),
                tier_id: "front".into(),
                tier_revision: 1,
                data_url: "data:image/jpeg;base64,stale".into(),
            }])
            .await
            .unwrap();
        let stored_preview = sqlx::query(
            "SELECT tier_revision, data_url FROM card_tier_previews WHERE document_id=? AND card_id=? AND tier_id=?",
        )
        .bind("wiki-revision")
        .bind("question-1")
        .bind("front")
        .fetch_one(&database.pool)
        .await
        .unwrap();
        assert_eq!(stored_preview.get::<i64, _>("tier_revision"), 2);
        assert_eq!(
            stored_preview.get::<String, _>("data_url"),
            "data:image/jpeg;base64,new"
        );

        let decks = database.list_revision_decks().await.unwrap();
        assert_eq!(
            (decks[0].total_count, decks[0].due_count, decks[0].new_count),
            (2, 2, 2)
        );
        let cards = database
            .list_revision_cards(&app_core::RevisionCardQuery {
                notebook_id: Some("wiki-revision".into()),
                due_only: true,
            })
            .await
            .unwrap();
        assert_eq!(cards.len(), 2);
        let question = cards
            .iter()
            .find(|card| card.card_id == "question-1")
            .unwrap();
        assert_eq!(question.sources[0].label, "Water");
        let initialized = database
            .start_revision_session(&app_core::StartRevisionSessionInput {
                id: "revision-session-atomic".into(),
                origin: app_core::RevisionSessionOrigin::Workflow,
                workflow_id: Some("workflow-one".into()),
                node_id: Some("review-node".into()),
                notebook_id: Some("wiki-revision".into()),
            })
            .await
            .unwrap();
        assert_eq!(
            (
                initialized.session.total_cards,
                initialized.session.remaining_cards,
            ),
            (2, 2)
        );
        let reviewed = database
            .review_revision_session_card(&app_core::ReviewRevisionSessionCardInput {
                session_id: "revision-session-atomic".into(),
                notebook_id: "wiki-revision".into(),
                card_id: "question-1".into(),
                rating: app_core::RevisionRating::Good,
                expected_last_review_at: None,
                question: "When does water freeze?".into(),
                expected_answer: "At 0°C".into(),
            })
            .await
            .unwrap();
        let scheduled = reviewed.schedule;
        assert_eq!(scheduled.review_count, 1);
        assert!(scheduled.due_at > scheduled.last_review_at);
        assert_eq!(
            reviewed.session.status,
            app_core::RevisionSessionStatus::Running
        );
        assert_eq!(reviewed.session.right_count, 1);
        assert_eq!(reviewed.session.results.len(), 1);
        assert_eq!(
            reviewed.session.results[0].answer,
            app_core::RevisionRating::Good
        );
        assert!(matches!(
            database
                .review_revision_card(&app_core::ReviewRevisionCardInput {
                    notebook_id: "wiki-revision".into(),
                    card_id: "question-1".into(),
                    rating: app_core::RevisionRating::Good,
                    expected_last_review_at: None,
                })
                .await,
            Err(DatabaseError::RevisionReviewConflict { .. })
        ));

        let saved = database
            .save_canvas(SaveCanvasInput {
                id: "wiki-revision".into(),
                title: "Science".into(),
                project: "Study".into(),
                icon: "book-open".into(),
                canvas_type: CanvasType::Notebook,
                workflow_kind: WorkflowDocumentKind::Workflow,
                starred: false,
                cover_media_id: None,
                expected_revision: Some(saved.revision),
                canvas: snapshot(false),
            })
            .await
            .unwrap();
        let unlinked = database
            .list_revision_cards(&app_core::RevisionCardQuery::default())
            .await
            .unwrap();
        assert_eq!(unlinked.len(), 2);
        assert!(unlinked.iter().all(|card| card.sources.is_empty()));
        assert_eq!(
            unlinked
                .iter()
                .find(|card| card.card_id == "question-1")
                .unwrap()
                .review_count,
            1
        );
        database
            .save_canvas(SaveCanvasInput {
                id: "wiki-revision".into(),
                title: "Science".into(),
                project: "Study".into(),
                icon: "book-open".into(),
                canvas_type: CanvasType::Notebook,
                workflow_kind: WorkflowDocumentKind::Workflow,
                starred: false,
                cover_media_id: None,
                expected_revision: Some(saved.revision),
                canvas: snapshot(true),
            })
            .await
            .unwrap();
        let cards = database
            .list_revision_cards(&app_core::RevisionCardQuery::default())
            .await
            .unwrap();
        assert_eq!(
            cards
                .iter()
                .find(|card| card.card_id == "question-1")
                .unwrap()
                .review_count,
            1
        );

        database.pool.close().await;
        std::fs::remove_file(&path).ok();
        std::fs::remove_file(path.with_extension("sqlite3-shm")).ok();
        std::fs::remove_file(path.with_extension("sqlite3-wal")).ok();
    }

    #[tokio::test]
    async fn partitions_notebooks_and_persists_global_plugin_installations() {
        let path = std::env::temp_dir().join(format!(
            "productivity-notebooks-{}-{}.sqlite3",
            std::process::id(),
            now_millis()
        ));
        let database = Database::open(&path, 1, 1_000).await.unwrap();
        let snapshot = || CanvasSnapshot {
            schema_version: 3,
            active_layer_id: "main".into(),
            focused_layer_id: None,
            unfocused_layer_opacity: 0.25,
            viewport: CanvasViewport::default(),
            layers: vec![CanvasLayer {
                id: "main".into(),
                name: "Main".into(),
                z_index: 0,
                visible: true,
                opacity: 1.0,
                interaction_color: 0x3b82f6,
            }],
            objects: vec![],
        };
        database
            .save_canvas(SaveCanvasInput {
                id: "ordinary-canvas".into(),
                title: "Canvas".into(),
                project: "Tests".into(),
                canvas_type: CanvasType::Base,
                workflow_kind: WorkflowDocumentKind::Workflow,
                icon: "layout-grid".into(),
                starred: false,
                cover_media_id: None,
                expected_revision: None,
                canvas: snapshot(),
            })
            .await
            .unwrap();
        database
            .save_canvas(SaveCanvasInput {
                id: "notes-notebook".into(),
                title: "Notebook".into(),
                project: "Tests".into(),
                canvas_type: CanvasType::Notebook,
                workflow_kind: WorkflowDocumentKind::Workflow,
                icon: "book".into(),
                starred: false,
                cover_media_id: None,
                expected_revision: None,
                canvas: snapshot(),
            })
            .await
            .unwrap();

        assert_eq!(
            database
                .list_canvases()
                .await
                .unwrap()
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            ["ordinary-canvas"]
        );
        assert_eq!(
            database
                .list_notebooks()
                .await
                .unwrap()
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            ["notes-notebook"]
        );
        let default_plugins = database.list_plugin_installations().await.unwrap();
        assert!(
            default_plugins
                .iter()
                .all(|item| item.plugin_id != "notes.question-card")
        );
        database.pool.close().await;

        let reopened = Database::open(&path, 1, 1_000).await.unwrap();
        assert!(
            reopened
                .list_plugin_installations()
                .await
                .unwrap()
                .iter()
                .all(|item| item.plugin_id != "notes.question-card")
        );
        reopened.pool.close().await;
        std::fs::remove_file(&path).ok();
        std::fs::remove_file(path.with_extension("sqlite3-shm")).ok();
        std::fs::remove_file(path.with_extension("sqlite3-wal")).ok();
    }

    #[tokio::test]
    async fn saves_searches_and_deduplicates_global_people() {
        let path = std::env::temp_dir().join(format!(
            "productivity-persons-{}-{}.sqlite3",
            std::process::id(),
            now_millis()
        ));
        let database = Database::open(&path, 1, 1_000).await.unwrap();
        let robert = database
            .save_person(SavePersonInput {
                id: "person-robert".into(),
                name: " Robert Fisk ".into(),
                role: "Author".into(),
                organization: "".into(),
                notes: "".into(),
            })
            .await
            .unwrap();
        assert_eq!(robert.name, "Robert Fisk");
        assert_eq!(
            database.list_persons(Some("fIsK")).await.unwrap(),
            vec![robert.clone()]
        );

        let duplicate = database
            .save_person(SavePersonInput {
                id: "another-id".into(),
                name: "robert fisk".into(),
                role: "".into(),
                organization: "".into(),
                notes: "".into(),
            })
            .await
            .unwrap();
        assert_eq!(duplicate.id, robert.id);
        assert_eq!(database.list_persons(None).await.unwrap().len(), 1);

        database.pool.close().await;
        std::fs::remove_file(&path).ok();
        std::fs::remove_file(path.with_extension("sqlite3-shm")).ok();
        std::fs::remove_file(path.with_extension("sqlite3-wal")).ok();
    }

    #[tokio::test]
    async fn scopes_media_queries_to_the_requested_product() {
        let path = std::env::temp_dir().join(format!(
            "productivity-media-scope-{}-{}.sqlite3",
            std::process::id(),
            now_millis()
        ));
        let database = Database::open(&path, 1, 1_000).await.unwrap();
        let snapshot = || CanvasSnapshot {
            schema_version: 3,
            active_layer_id: "main".into(),
            focused_layer_id: None,
            unfocused_layer_opacity: 0.25,
            viewport: CanvasViewport::default(),
            layers: vec![CanvasLayer {
                id: "main".into(),
                name: "Main".into(),
                z_index: 0,
                visible: true,
                opacity: 1.0,
                interaction_color: 0x3b82f6,
            }],
            objects: vec![],
        };
        for (id, title, canvas_type) in [
            ("media-notebook", "Notebook", CanvasType::Notebook),
            ("media-workflow", "Workflow", CanvasType::Workflow),
        ] {
            database
                .save_canvas(SaveCanvasInput {
                    id: id.into(),
                    title: title.into(),
                    project: "Tests".into(),
                    canvas_type,
                    workflow_kind: WorkflowDocumentKind::Workflow,
                    icon: "image".into(),
                    starred: false,
                    cover_media_id: None,
                    expected_revision: None,
                    canvas: snapshot(),
                })
                .await
                .unwrap();
            database
                .insert_media(NewMediaEntry {
                    id: format!("{id}-asset"),
                    canvas_id: id.into(),
                    original_name: format!("{title}.png"),
                    mime_type: "image/png".into(),
                    kind: MediaKind::Image,
                    size_bytes: 10,
                    content_hash: format!("{id}-hash"),
                    storage_key: format!("{id}.png"),
                    thumbnail_key: None,
                    proxy_key: None,
                    width: Some(1),
                    height: Some(1),
                })
                .await
                .unwrap();
        }

        let query = |canvas_type| MediaListQuery {
            canvas_id: None,
            canvas_type: Some(canvas_type),
            query: None,
            kind: None,
            cursor: None,
            limit: 60,
        };
        let notes = database
            .list_media(&query(CanvasType::Notebook))
            .await
            .unwrap();
        let workflows = database
            .list_media(&query(CanvasType::Workflow))
            .await
            .unwrap();
        assert_eq!(notes.items[0].canvas_id, "media-notebook");
        assert_eq!(workflows.items[0].canvas_id, "media-workflow");

        database.pool.close().await;
        std::fs::remove_file(&path).ok();
        std::fs::remove_file(path.with_extension("sqlite3-shm")).ok();
        std::fs::remove_file(path.with_extension("sqlite3-wal")).ok();
    }

    #[tokio::test]
    async fn persists_workflow_plugin_preferences_books_and_quran_attempts() {
        let path = std::env::temp_dir().join(format!(
            "productivity-workflow-plugins-{}-{}.sqlite3",
            std::process::id(),
            now_millis()
        ));
        let database = Database::open(&path, 1, 1_000).await.unwrap();
        let snapshot = |objects| CanvasSnapshot {
            schema_version: 3,
            active_layer_id: "main".into(),
            focused_layer_id: None,
            unfocused_layer_opacity: 0.25,
            viewport: CanvasViewport::default(),
            layers: vec![CanvasLayer {
                id: "main".into(),
                name: "Main".into(),
                z_index: 0,
                visible: true,
                opacity: 1.0,
                interaction_color: 0x3b82f6,
            }],
            objects,
        };
        database
            .save_canvas(SaveCanvasInput {
                id: "book-notebook".into(),
                title: "Reading".into(),
                project: "Tests".into(),
                canvas_type: CanvasType::Notebook,
                workflow_kind: WorkflowDocumentKind::Workflow,
                icon: "book".into(),
                starred: false,
                cover_media_id: None,
                expected_revision: None,
                canvas: snapshot(vec![CanvasObject {
                    id: "book-card".into(),
                    layer_id: "main".into(),
                    object_type: "card".into(),
                    sort_index: 0,
                    payload: json!({
                        "id": "book-card",
                        "type": "card",
                        "pluginId": "notes.book-card",
                        "pluginData": {
                            "title": "The Book",
                            "authorName": "The Author",
                            "coverMediaId": "book-cover",
                            "coverWidth": 148,
                            "coverHeight": 222
                        }
                    }),
                }]),
            })
            .await
            .unwrap();
        database
            .save_canvas(SaveCanvasInput {
                id: "quran-workflow".into(),
                title: "Revision".into(),
                project: "Tests".into(),
                canvas_type: CanvasType::Workflow,
                workflow_kind: WorkflowDocumentKind::Workflow,
                icon: "workflow".into(),
                starred: false,
                cover_media_id: None,
                expected_revision: None,
                canvas: snapshot(vec![]),
            })
            .await
            .unwrap();

        let books = database.list_book_entities().await.unwrap();
        assert_eq!(books.len(), 1);
        assert_eq!(books[0].card_id, "book-card");
        assert_eq!(books[0].title, "The Book");
        assert_eq!(books[0].author_name, "The Author");

        let capture = database
            .create_quran_capture_request(app_core::CreateQuranCaptureRequestInput {
                id: "capture-one".into(),
                workflow_id: "quran-workflow".into(),
                node_id: "quran-node".into(),
                recording_id: "attempt-one".into(),
                replace_start_ms: None,
                surah_number: 1,
                surah_name: "Al-Fatihah".into(),
                ayah_start: 1,
                end_surah_number: 1,
                end_surah_name: "Al-Fatihah".into(),
                ayah_end: 7,
            })
            .await
            .unwrap();
        assert_eq!(capture.status, app_core::QuranCaptureRequestStatus::Pending);
        let recording_capture = database
            .set_quran_capture_request_status(
                "capture-one",
                app_core::QuranCaptureRequestStatus::Recording,
            )
            .await
            .unwrap();
        assert_eq!(
            recording_capture.status,
            app_core::QuranCaptureRequestStatus::Recording
        );
        let ready_capture = database
            .set_quran_capture_request_status(
                "capture-one",
                app_core::QuranCaptureRequestStatus::Ready,
            )
            .await
            .unwrap();
        assert_eq!(
            ready_capture.status,
            app_core::QuranCaptureRequestStatus::Ready
        );
        let cancelled_capture = database
            .set_quran_capture_request_status(
                "capture-one",
                app_core::QuranCaptureRequestStatus::Cancelled,
            )
            .await
            .unwrap();
        assert_eq!(
            cancelled_capture.status,
            app_core::QuranCaptureRequestStatus::Cancelled
        );

        let preference = database
            .set_plugin_preference("workflows.book-nodes", "currentBookId", json!("book-card"))
            .await
            .unwrap();
        assert_eq!(preference.value, json!("book-card"));
        assert_eq!(
            database
                .get_plugin_preference("workflows.book-nodes", "currentBookId")
                .await
                .unwrap()
                .unwrap()
                .value,
            json!("book-card")
        );

        database
            .insert_media(NewMediaEntry {
                id: "quran-audio".into(),
                canvas_id: "quran-workflow".into(),
                original_name: "Al-Fatihah.webm".into(),
                mime_type: "audio/webm".into(),
                kind: MediaKind::Audio,
                size_bytes: 128,
                content_hash: "quran-audio-hash".into(),
                storage_key: "quran-audio.webm".into(),
                thumbnail_key: None,
                proxy_key: None,
                width: None,
                height: None,
            })
            .await
            .unwrap();
        let recording = database
            .save_quran_recording(SaveQuranRecordingInput {
                id: "attempt-one".into(),
                session_id: "session-one".into(),
                workflow_id: "quran-workflow".into(),
                node_id: "quran-node".into(),
                media_id: "quran-audio".into(),
                surah_number: 1,
                surah_name: "Al-Fatihah".into(),
                ayah_start: 1,
                ayah_end: 7,
                duration_ms: 31_000,
                waveform_peaks: vec![0.2, 0.8, 0.4],
            })
            .await
            .unwrap();
        assert_eq!(recording.duration_ms, 31_000);
        assert_eq!(recording.segments.len(), 1);
        assert_eq!(recording.segments[0].waveform_peaks, vec![0.2, 0.8, 0.4]);
        assert_eq!(
            database
                .list_quran_recordings(&QuranRecordingQuery {
                    workflow_id: Some("quran-workflow".into()),
                    node_id: Some("quran-node".into()),
                })
                .await
                .unwrap(),
            vec![recording]
        );

        database
            .insert_media(NewMediaEntry {
                id: "quran-replacement".into(),
                canvas_id: "quran-workflow".into(),
                original_name: "Replacement.webm".into(),
                mime_type: "audio/webm".into(),
                kind: MediaKind::Audio,
                size_bytes: 64,
                content_hash: "quran-replacement-hash".into(),
                storage_key: "quran-replacement.webm".into(),
                thumbnail_key: None,
                proxy_key: None,
                width: None,
                height: None,
            })
            .await
            .unwrap();
        let edited = database
            .replace_quran_recording_range(ReplaceQuranRecordingRangeInput {
                recording_id: "attempt-one".into(),
                media_id: "quran-replacement".into(),
                start_ms: 10_000,
                duration_ms: 5_000,
                waveform_peaks: vec![0.9, 0.3],
            })
            .await
            .unwrap();
        assert!(edited.orphaned_media_ids.is_empty());
        assert_eq!(edited.recording.duration_ms, 31_000);
        assert_eq!(edited.recording.segments.len(), 3);
        assert_eq!(edited.recording.segments[0].duration_ms, 10_000);
        assert_eq!(edited.recording.segments[1].media_id, "quran-replacement");
        assert_eq!(edited.recording.segments[1].start_ms, 10_000);
        assert_eq!(edited.recording.segments[2].start_ms, 15_000);
        assert_eq!(edited.recording.segments[2].source_start_ms, 15_000);
        assert_eq!(edited.recording.segments[2].duration_ms, 16_000);

        database
            .insert_media(NewMediaEntry {
                id: "quran-tail".into(),
                canvas_id: "quran-workflow".into(),
                original_name: "Tail.webm".into(),
                mime_type: "audio/webm".into(),
                kind: MediaKind::Audio,
                size_bytes: 32,
                content_hash: "quran-tail-hash".into(),
                storage_key: "quran-tail.webm".into(),
                thumbnail_key: None,
                proxy_key: None,
                width: None,
                height: None,
            })
            .await
            .unwrap();
        let appended = database
            .replace_quran_recording_range(ReplaceQuranRecordingRangeInput {
                recording_id: "attempt-one".into(),
                media_id: "quran-tail".into(),
                start_ms: 31_000,
                duration_ms: 2_000,
                waveform_peaks: vec![0.4],
            })
            .await
            .unwrap();
        assert_eq!(appended.recording.duration_ms, 33_000);
        assert_eq!(appended.recording.segments.last().unwrap().start_ms, 31_000);

        database
            .insert_media(NewMediaEntry {
                id: "quran-full-replacement".into(),
                canvas_id: "quran-workflow".into(),
                original_name: "Full replacement.webm".into(),
                mime_type: "audio/webm".into(),
                kind: MediaKind::Audio,
                size_bytes: 192,
                content_hash: "quran-full-replacement-hash".into(),
                storage_key: "quran-full-replacement.webm".into(),
                thumbnail_key: None,
                proxy_key: None,
                width: None,
                height: None,
            })
            .await
            .unwrap();
        let extended = database
            .replace_quran_recording_range(ReplaceQuranRecordingRangeInput {
                recording_id: "attempt-one".into(),
                media_id: "quran-full-replacement".into(),
                start_ms: 0,
                duration_ms: 40_000,
                waveform_peaks: vec![0.5],
            })
            .await
            .unwrap();
        assert_eq!(extended.recording.duration_ms, 40_000);
        assert_eq!(extended.recording.segments.len(), 1);
        assert_eq!(
            extended.orphaned_media_ids,
            vec!["quran-audio", "quran-replacement", "quran-tail"]
        );
        assert_eq!(
            database
                .delete_quran_recording("attempt-one")
                .await
                .unwrap(),
            vec!["quran-full-replacement"]
        );

        let bookmark = database
            .save_quran_bookmark(app_core::SaveQuranBookmarkInput {
                id: "bookmark-one".into(),
                surah_number: 1,
                ayah_number: 7,
                label: "Al-Fatihah 7".into(),
            })
            .await
            .unwrap();
        assert_eq!(
            database.list_quran_bookmarks().await.unwrap(),
            vec![bookmark]
        );
        let position = database
            .save_quran_reading_position(app_core::SaveQuranReadingPositionInput {
                surah_number: 2,
                ayah_number: 255,
            })
            .await
            .unwrap();
        assert_eq!(
            database.quran_reading_position().await.unwrap(),
            Some(position)
        );
        assert!(
            database
                .delete_quran_bookmark("bookmark-one")
                .await
                .unwrap()
        );

        let revision_session = database
            .save_revision_session(app_core::SaveRevisionSessionInput {
                id: "revision-session-one".into(),
                origin: app_core::RevisionSessionOrigin::Workflow,
                workflow_id: Some("quran-workflow".into()),
                node_id: Some("revise-node".into()),
                notebook_id: Some("book-notebook".into()),
                goal: app_core::RevisionSessionGoal::Time {
                    duration_ms: 25 * 60_000,
                },
                elapsed_ms: 12_000,
                status: app_core::RevisionSessionStatus::Paused,
                total_cards: 10,
                remaining_cards: 8,
                reviewed_count: 2,
                right_count: 0,
                wrong_count: 0,
                started_at: None,
            })
            .await
            .unwrap();
        assert_eq!(
            revision_session.status,
            app_core::RevisionSessionStatus::Paused
        );
        let stale_timer = database
            .save_revision_session(app_core::SaveRevisionSessionInput {
                id: revision_session.id.clone(),
                origin: revision_session.origin,
                workflow_id: revision_session.workflow_id.clone(),
                node_id: revision_session.node_id.clone(),
                notebook_id: revision_session.notebook_id.clone(),
                goal: revision_session.goal.clone(),
                elapsed_ms: revision_session.elapsed_ms + 1_000,
                status: app_core::RevisionSessionStatus::Running,
                total_cards: revision_session.total_cards,
                remaining_cards: revision_session.remaining_cards,
                reviewed_count: revision_session.reviewed_count,
                right_count: revision_session.right_count,
                wrong_count: revision_session.wrong_count,
                started_at: Some(10),
            })
            .await
            .unwrap();
        assert_eq!(stale_timer.status, app_core::RevisionSessionStatus::Paused);
        assert_eq!(stale_timer.elapsed_ms, revision_session.elapsed_ms);
        let resumed = database
            .set_revision_session_status(app_core::SetRevisionSessionStatusInput {
                id: revision_session.id.clone(),
                status: app_core::RevisionSessionStatus::Running,
            })
            .await
            .unwrap();
        assert_eq!(resumed.status, app_core::RevisionSessionStatus::Running);
        assert!(resumed.started_at.is_some());
        let cancelled = database
            .set_revision_session_status(app_core::SetRevisionSessionStatusInput {
                id: revision_session.id.clone(),
                status: app_core::RevisionSessionStatus::Cancelled,
            })
            .await
            .unwrap();
        assert_eq!(cancelled.status, app_core::RevisionSessionStatus::Cancelled);
        assert_eq!(cancelled.started_at, None);
        assert_eq!(
            database
                .revision_session("revision-session-one")
                .await
                .unwrap(),
            Some(cancelled)
        );

        let food = database
            .save_nutrition_food(app_core::SaveNutritionFoodInput {
                id: "nutrition-food-one".into(),
                local_date: "2026-09-15".into(),
                meal_name: "Sandwich".into(),
                quantity: 1,
                workflow_id: "quran-workflow".into(),
                node_id: "food-node".into(),
                logged_at: 1_789_416_000_000,
            })
            .await
            .unwrap();
        assert_eq!(food.meal_name, "Sandwich");
        assert_eq!(
            database.list_nutrition_food("2026-09-15").await.unwrap(),
            vec![food]
        );

        database.pool.close().await;
        std::fs::remove_file(&path).ok();
        std::fs::remove_file(path.with_extension("sqlite3-shm")).ok();
        std::fs::remove_file(path.with_extension("sqlite3-wal")).ok();
    }

    #[tokio::test]
    async fn manages_reminder_lists_smart_views_ordering_and_recovery() {
        let path = std::env::temp_dir().join(format!(
            "productivity-reminders-{}-{}.sqlite3",
            std::process::id(),
            now_millis()
        ));
        let database = Database::open(&path, 1, 1_000).await.unwrap();

        let personal = database
            .save_reminder_list(SaveReminderListInput {
                id: "personal".into(),
                name: "Personal".into(),
                color: "#8B5CF6".into(),
                sort_index: 1,
            })
            .await
            .unwrap();
        assert_eq!(personal.name, "Personal");

        let first_request = CreateReminderInput {
            id: Some("client-generated-reminder".into()),
            list_id: personal.id.clone(),
            title: "First generated reminder".into(),
            notes: String::new(),
            due_at: None,
            due_has_time: false,
            priority: ReminderPriority::None,
            project_id: None,
            subtasks: vec![],
            after_id: None,
        };
        let first_created = database
            .create_reminder(first_request.clone())
            .await
            .unwrap();
        let repeated = database.create_reminder(first_request).await.unwrap();
        assert_eq!(repeated, first_created);
        assert_eq!(first_created.id, "client-generated-reminder");
        let second_created = database
            .create_reminder(CreateReminderInput {
                id: None,
                list_id: personal.id.clone(),
                title: "Second generated reminder".into(),
                notes: String::new(),
                due_at: None,
                due_has_time: false,
                priority: ReminderPriority::High,
                project_id: None,
                subtasks: vec![],
                after_id: Some(first_created.id.clone()),
            })
            .await
            .unwrap();
        assert_ne!(first_created.id, second_created.id);
        let updated = database
            .update_reminder(UpdateReminderInput {
                id: first_created.id.clone(),
                list_id: personal.id.clone(),
                title: "Edited first reminder".into(),
                notes: String::new(),
                due_at: None,
                due_has_time: false,
                priority: ReminderPriority::Low,
                project_id: None,
                subtasks: vec![],
                sort_index: first_created.sort_index,
            })
            .await
            .unwrap();
        assert_eq!(updated.title, "Edited first reminder");
        assert_eq!(updated.priority, ReminderPriority::Low);
        assert_eq!(second_created.priority, ReminderPriority::High);
        assert_eq!(
            database
                .reminder(&second_created.id)
                .await
                .unwrap()
                .unwrap()
                .title,
            "Second generated reminder"
        );
        let reminder_image = database
            .insert_reminder_image(NewReminderImage {
                id: "reminder-image".into(),
                reminder_id: first_created.id.clone(),
                original_name: "paste.png".into(),
                mime_type: "image/png".into(),
                size_bytes: 4,
                content_hash: "reminder-image-hash".into(),
                storage_key: "reminder-image.png".into(),
                thumbnail_key: None,
                width: Some(1),
                height: Some(1),
            })
            .await
            .unwrap();
        assert_eq!(
            database
                .list_reminder_images(&[first_created.id.clone()])
                .await
                .unwrap(),
            vec![reminder_image]
        );
        database.delete_reminder(&first_created.id).await.unwrap();
        assert_eq!(
            database
                .list_reminder_images(&[first_created.id.clone()])
                .await
                .unwrap()
                .len(),
            1
        );
        database.delete_reminder(&second_created.id).await.unwrap();
        assert!(
            database
                .permanently_delete_reminder(&first_created.id)
                .await
                .unwrap()
        );
        assert!(
            database
                .get_media_storage("reminder-image")
                .await
                .unwrap()
                .is_none()
        );
        assert!(
            database
                .permanently_delete_reminder(&second_created.id)
                .await
                .unwrap()
        );

        let day_start = 1_800_000_000_000_i64;
        for (id, title, due_at, sort_index) in [
            ("later", "Later", None, 0),
            ("today", "Today", Some(day_start + 60_000), 1),
            ("scheduled", "Scheduled", Some(day_start + 172_800_000), 2),
        ] {
            database
                .save_reminder(SaveReminderInput {
                    id: id.into(),
                    list_id: personal.id.clone(),
                    title: title.into(),
                    notes: format!("{title} notes"),
                    due_at,
                    due_has_time: due_at.is_some(),
                    priority: ReminderPriority::None,
                    project_id: None,
                    subtasks: vec![],
                    sort_index,
                })
                .await
                .unwrap();
        }

        let today = database
            .list_reminders(&ReminderQuery {
                view: ReminderView::Today,
                list_id: None,
                project_id: None,
                day_start: Some(day_start),
                day_end: Some(day_start + 86_400_000),
            })
            .await
            .unwrap();
        assert_eq!(
            today
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            vec!["today"]
        );

        let scheduled = database
            .list_reminders(&ReminderQuery {
                view: ReminderView::Scheduled,
                list_id: Some(personal.id.clone()),
                project_id: None,
                day_start: None,
                day_end: None,
            })
            .await
            .unwrap();
        assert_eq!(scheduled.len(), 2);

        let ordered = database
            .reorder_reminders(
                &personal.id,
                &["scheduled".into(), "today".into(), "later".into()],
            )
            .await
            .unwrap();
        assert_eq!(
            ordered
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            vec!["scheduled", "today", "later"]
        );

        database
            .set_reminder_completed("today", true)
            .await
            .unwrap();
        let completed = database
            .list_reminders(&ReminderQuery {
                view: ReminderView::Completed,
                list_id: None,
                project_id: None,
                day_start: None,
                day_end: None,
            })
            .await
            .unwrap();
        assert_eq!(
            completed
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            vec!["today"]
        );

        database.delete_reminder("scheduled").await.unwrap();
        assert_eq!(
            database
                .list_reminders(&ReminderQuery {
                    view: ReminderView::Deleted,
                    list_id: None,
                    project_id: None,
                    day_start: None,
                    day_end: None,
                })
                .await
                .unwrap()[0]
                .id,
            "scheduled"
        );
        database.restore_reminder("scheduled").await.unwrap();
        database.delete_reminder("scheduled").await.unwrap();
        assert!(
            database
                .permanently_delete_reminder("scheduled")
                .await
                .unwrap()
        );

        assert!(database.delete_reminder_list(&personal.id).await.unwrap());
        assert_eq!(
            database.reminder("later").await.unwrap().unwrap().list_id,
            "reminders-inbox"
        );

        database.pool.close().await;
        std::fs::remove_file(&path).ok();
        std::fs::remove_file(path.with_extension("sqlite3-shm")).ok();
        std::fs::remove_file(path.with_extension("sqlite3-wal")).ok();
    }

    #[test]
    fn materializes_legacy_template_and_revision_cards_without_changing_ids() {
        let templates = HashMap::from([(
            "custom.person".into(),
            LegacyTemplate {
                fields: json!([{ "id": "name", "defaultValue": "Unknown" }]),
                elements: json!([{ "id": "label", "type": "text", "text": "Unknown" }]),
                bindings: json!([{ "elementId": "label", "fieldId": "name", "property": "text" }]),
            },
        )]);
        let mut template = json!({
            "id": "card-unchanged", "type": "card", "kind": "template", "templateId": "custom.person",
            "templateValues": { "name": "Ada" }, "elements": []
        });
        assert!(migrate_legacy_card_value(&mut template, &templates));
        assert_eq!(template["id"], "card-unchanged");
        assert_eq!(template["kind"], "canvas");
        assert_eq!(
            template["tiers"][0]["elements"][0]["id"],
            "card-unchanged::label"
        );
        assert_eq!(template["tiers"][0]["elements"][0]["text"], "Ada");
        assert!(template.get("templateId").is_none());

        let mut revision = json!({
            "id": "question-unchanged", "type": "card", "kind": "revision", "revisionKind": "basic",
            "front": "Front", "back": "Back", "cloze": "", "elements": []
        });
        assert!(migrate_legacy_card_value(&mut revision, &HashMap::new()));
        assert_eq!(revision["id"], "question-unchanged");
        assert_eq!(revision["kind"], "canvas");
        assert_eq!(revision["tiers"][0]["name"], "Front");
        assert_eq!(revision["tiers"][0]["elements"][0]["text"], "Front");
        assert_eq!(revision["tiers"][1]["elements"][0]["text"], "Back");
        assert!(!migrate_legacy_card_value(&mut revision, &HashMap::new()));

        let mut cloze = json!({
            "id": "cloze-unchanged", "type": "card", "kind": "revision", "revisionKind": "cloze",
            "front": "", "back": "", "cloze": "Water {{c1::freezes::temperature}} at {{c2::zero}}.", "elements": []
        });
        assert!(migrate_legacy_card_value(&mut cloze, &HashMap::new()));
        assert_eq!(cloze["id"], "cloze-unchanged");
        assert_eq!(
            cloze["tiers"][0]["elements"][0]["text"],
            "Water [temperature] at […]."
        );
        assert_eq!(
            cloze["tiers"][1]["elements"][0]["text"],
            "Water freezes at zero."
        );
        assert!(!migrate_legacy_card_value(&mut cloze, &HashMap::new()));
    }

    #[tokio::test]
    async fn persists_standalone_recitation_review_and_last_recited_position() {
        let path = std::env::temp_dir().join(format!(
            "productivity-quran-review-{}-{}.sqlite3",
            std::process::id(),
            now_millis()
        ));
        let database = Database::open(&path, 1, 5_000).await.unwrap();
        let draft = database
            .start_standalone_quran_recording(StartStandaloneQuranRecordingInput {
                id: "standalone-recording".into(),
                session_id: "standalone-session".into(),
                range: app_core::QuranVerseRange {
                    start: app_core::QuranVerseRef {
                        surah_number: 1,
                        ayah_number: 6,
                    },
                    end: app_core::QuranVerseRef {
                        surah_number: 2,
                        ayah_number: 2,
                    },
                },
                start_surah_name: "Al-Fatihah".into(),
                end_surah_name: "Al-Baqarah".into(),
            })
            .await
            .unwrap();
        assert_eq!(draft.origin, QuranRecordingOrigin::Standalone);
        assert_eq!(draft.status, QuranRecordingStatus::Draft);
        let completed = database
            .save_quran_recording_review(SaveQuranRecordingReviewInput {
                recording_id: draft.id.clone(),
                status: QuranRecordingStatus::Completed,
                boundaries: vec![
                    QuranAyahBoundary {
                        verse_key: "1:6".into(),
                        sequence: 0,
                        start_ms: 0,
                    },
                    QuranAyahBoundary {
                        verse_key: "1:7".into(),
                        sequence: 1,
                        start_ms: 1_000,
                    },
                    QuranAyahBoundary {
                        verse_key: "2:1".into(),
                        sequence: 2,
                        start_ms: 2_000,
                    },
                    QuranAyahBoundary {
                        verse_key: "2:2".into(),
                        sequence: 3,
                        start_ms: 3_000,
                    },
                ],
                mistakes: vec![QuranMistakeRange {
                    id: "mistake-one".into(),
                    start_verse_key: "1:7".into(),
                    start_word_position: 2,
                    end_verse_key: "2:1".into(),
                    end_word_position: 1,
                    text_snapshot: "snapshot".into(),
                    created_at: 5,
                }],
            })
            .await
            .unwrap();
        assert_eq!(completed.status, QuranRecordingStatus::Completed);
        assert_eq!(completed.boundaries.len(), 4);
        assert_eq!(completed.mistakes.len(), 1);
        let position = database.quran_progress().await.unwrap().recitation.unwrap();
        assert_eq!((position.surah_number, position.ayah_number), (2, 2));

        database.pool.close().await;
        std::fs::remove_file(&path).ok();
        std::fs::remove_file(path.with_extension("sqlite3-shm")).ok();
        std::fs::remove_file(path.with_extension("sqlite3-wal")).ok();
    }
}
