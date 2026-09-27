mod media;
mod quran_content;

use app_config::ProductivityConfig;
use app_core::{
    AppActivity, AppActivityEnvelope, AppActivityTarget, Request, Response, ServiceError,
};
use database::Database;
use media::{MediaError, MediaService};
use quran_content::QuranContentService;
use std::{
    collections::HashMap,
    path::Path,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use thiserror::Error;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{UnixListener, UnixStream},
};

#[derive(Debug, Error)]
pub enum ServiceRunError {
    #[error("data service is already running at {0}")]
    AlreadyRunning(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Database(#[from] database::DatabaseError),
    #[error(transparent)]
    Media(#[from] MediaError),
}

#[derive(Default)]
struct ActivityBrokerState {
    hosts: HashMap<AppActivityTarget, (String, i64)>,
    pending: Vec<PendingActivity>,
}

struct PendingActivity {
    envelope: AppActivityEnvelope,
    claimed_by: Option<String>,
    claimed_at: Option<i64>,
}

#[derive(Default)]
struct ActivityBroker(Mutex<ActivityBrokerState>);

impl ActivityBroker {
    fn register(&self, target: AppActivityTarget, instance_id: String) -> bool {
        let Ok(mut state) = self.0.lock() else {
            return false;
        };
        state
            .hosts
            .insert(target, (instance_id, service_now_millis()));
        true
    }

    fn publish(&self, activity: AppActivity) -> bool {
        if !activity.is_valid() {
            return false;
        }
        let Ok(mut state) = self.0.lock() else {
            return false;
        };
        let now = service_now_millis();
        state.pending.retain(|item| item.envelope.expires_at > now);
        let available = state
            .hosts
            .get(&activity.target())
            .is_some_and(|(_, seen_at)| now - *seen_at <= 3_000);
        if !available {
            return false;
        }
        state.pending.push(PendingActivity {
            envelope: AppActivityEnvelope {
                id: uuid::Uuid::now_v7().to_string(),
                activity,
                created_at: now,
                expires_at: now + 60_000,
            },
            claimed_by: None,
            claimed_at: None,
        });
        true
    }

    fn claim(&self, target: AppActivityTarget, instance_id: &str) -> Vec<AppActivityEnvelope> {
        let Ok(mut state) = self.0.lock() else {
            return Vec::new();
        };
        let now = service_now_millis();
        state.hosts.insert(target, (instance_id.to_owned(), now));
        state.pending.retain(|item| item.envelope.expires_at > now);
        let mut claimed = Vec::new();
        for item in &mut state.pending {
            if item.envelope.activity.target() != target {
                continue;
            }
            if item
                .claimed_at
                .is_some_and(|claimed_at| now - claimed_at <= 5_000)
            {
                continue;
            }
            item.claimed_by = Some(instance_id.to_owned());
            item.claimed_at = Some(now);
            claimed.push(item.envelope.clone());
        }
        claimed
    }

    fn acknowledge(&self, id: &str, instance_id: &str, succeeded: bool) -> bool {
        let Ok(mut state) = self.0.lock() else {
            return false;
        };
        let Some(index) = state.pending.iter().position(|item| {
            item.envelope.id == id && item.claimed_by.as_deref() == Some(instance_id)
        }) else {
            return false;
        };
        if succeeded {
            state.pending.remove(index);
        } else {
            state.pending[index].claimed_by = None;
            state.pending[index].claimed_at = None;
        }
        true
    }
}

fn service_now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[cfg(test)]
mod activity_tests {
    use super::*;

    fn activity() -> AppActivity {
        AppActivity::ReviseReviewSession {
            session_id: "session-1".into(),
        }
    }

    #[test]
    fn development_activities_require_a_live_host_and_acknowledge_once() {
        let broker = ActivityBroker::default();
        assert!(!broker.publish(activity()));
        assert!(broker.register(AppActivityTarget::Revise, "host-1".into()));
        assert!(broker.publish(activity()));

        let claimed = broker.claim(AppActivityTarget::Revise, "host-1");
        assert_eq!(claimed.len(), 1);
        assert!(broker.claim(AppActivityTarget::Revise, "host-1").is_empty());
        assert!(broker.acknowledge(&claimed[0].id, "host-1", true));
        assert!(broker.claim(AppActivityTarget::Revise, "host-1").is_empty());
    }

    #[test]
    fn failed_claims_retry_and_expired_requests_are_removed() {
        let broker = ActivityBroker::default();
        broker.register(AppActivityTarget::Revise, "host-1".into());
        assert!(broker.publish(activity()));
        let first = broker.claim(AppActivityTarget::Revise, "host-1");
        assert!(broker.acknowledge(&first[0].id, "host-1", false));
        assert_eq!(broker.claim(AppActivityTarget::Revise, "host-1").len(), 1);

        if let Ok(mut state) = broker.0.lock() {
            state.pending[0].envelope.expires_at = service_now_millis() - 1;
        }
        assert!(broker.claim(AppActivityTarget::Revise, "host-1").is_empty());
    }

    #[test]
    fn claims_are_leased_and_target_scoped() {
        let broker = ActivityBroker::default();
        broker.register(AppActivityTarget::Revise, "host-1".into());
        assert!(broker.publish(activity()));
        assert!(broker.claim(AppActivityTarget::Notes, "notes-1").is_empty());
        assert_eq!(broker.claim(AppActivityTarget::Revise, "host-1").len(), 1);
        if let Ok(mut state) = broker.0.lock() {
            state.pending[0].claimed_at = Some(service_now_millis() - 5_001);
        }
        assert_eq!(broker.claim(AppActivityTarget::Revise, "host-2").len(), 1);
    }
}

pub async fn run(config: ProductivityConfig) -> Result<(), ServiceRunError> {
    let socket_path = config.data_service.socket_path.clone();
    prepare_socket(&socket_path).await?;
    let database = Arc::new(
        Database::open(
            &config.data_service.database_path,
            config.data_service.max_connections,
            config.data_service.busy_timeout_ms,
        )
        .await?,
    );
    let media = Arc::new(
        MediaService::open(
            config.data_service.media_path.clone(),
            Arc::clone(&database),
        )
        .await?,
    );
    let listener = UnixListener::bind(&socket_path)?;
    let settings = Arc::new(config.service_settings());
    let quran_content = Arc::new(QuranContentService::new(Arc::clone(&database), &settings));
    let activities = Arc::new(ActivityBroker::default());
    let max_request_bytes = config.data_service.max_request_bytes;

    loop {
        tokio::select! {
            accepted = listener.accept() => {
                let (stream, _) = accepted?;
                let database = Arc::clone(&database);
                let media = Arc::clone(&media);
                let settings = Arc::clone(&settings);
                let activities = Arc::clone(&activities);
                let quran_content = Arc::clone(&quran_content);
                tokio::spawn(async move {
                    if let Err(error) = handle_connection(stream, database, media, settings, activities, quran_content, max_request_bytes).await {
                        eprintln!("data-service IPC error: {error}");
                    }
                });
            }
            signal = tokio::signal::ctrl_c() => {
                signal?;
                break;
            }
        }
    }
    drop(listener);
    std::fs::remove_file(socket_path)?;
    Ok(())
}

async fn prepare_socket(socket_path: &Path) -> Result<(), ServiceRunError> {
    if !socket_path.exists() {
        return Ok(());
    }
    if UnixStream::connect(socket_path).await.is_ok() {
        return Err(ServiceRunError::AlreadyRunning(
            socket_path.display().to_string(),
        ));
    }
    std::fs::remove_file(socket_path)?;
    Ok(())
}

async fn handle_connection(
    mut stream: UnixStream,
    database: Arc<Database>,
    media: Arc<MediaService>,
    settings: Arc<app_core::ServiceSettings>,
    activities: Arc<ActivityBroker>,
    quran_content: Arc<QuranContentService>,
    max_request_bytes: usize,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let length = stream.read_u32().await? as usize;
    if length > max_request_bytes {
        write_response(
            &mut stream,
            &Response::Error(ServiceError {
                code: "request_too_large".into(),
                message: format!("request is {length} bytes; limit is {max_request_bytes} bytes"),
            }),
        )
        .await?;
        return Ok(());
    }
    let mut buffer = vec![0; length];
    stream.read_exact(&mut buffer).await?;
    let request: Request = serde_json::from_slice(&buffer)?;
    let response = handle_request(
        request,
        &database,
        &media,
        &settings,
        &activities,
        &quran_content,
    )
    .await;
    write_response(&mut stream, &response).await?;
    Ok(())
}

async fn write_response(
    stream: &mut UnixStream,
    response: &Response,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let payload = serde_json::to_vec(response)?;
    stream.write_u32(payload.len() as u32).await?;
    stream.write_all(&payload).await?;
    Ok(())
}

async fn handle_request(
    request: Request,
    database: &Database,
    media: &MediaService,
    settings: &app_core::ServiceSettings,
    activities: &ActivityBroker,
    quran_content: &QuranContentService,
) -> Response {
    let result: Result<Response, MediaError> = match request {
        Request::Ping => return Response::Pong,
        Request::GetSettings => return Response::Settings(settings.clone()),
        Request::ListCanvases => database
            .list_canvases()
            .await
            .map(Response::Canvases)
            .map_err(Into::into),
        Request::ListNotebooks => database
            .list_notebooks()
            .await
            .map(Response::Notebooks)
            .map_err(Into::into),
        Request::GetCanvas { id } => database
            .get_canvas(&id)
            .await
            .map(|value| value.map(Response::Canvas).unwrap_or(Response::NotFound))
            .map_err(Into::into),
        Request::SaveCanvas { input } => database
            .save_canvas(input)
            .await
            .map(Response::CanvasSaved)
            .map_err(Into::into),
        Request::DeleteCanvas { id } => media.delete_canvas(&id).await.map(|deleted| {
            if deleted {
                Response::Deleted
            } else {
                Response::NotFound
            }
        }),
        Request::SetCanvasStarred { id, starred } => database
            .set_canvas_starred(&id, starred)
            .await
            .map(|value| {
                value
                    .map(Response::CanvasSaved)
                    .unwrap_or(Response::NotFound)
            })
            .map_err(Into::into),
        Request::SetCanvasTitle { id, title } => database
            .set_canvas_title(&id, &title)
            .await
            .map(|value| {
                value
                    .map(Response::CanvasSaved)
                    .unwrap_or(Response::NotFound)
            })
            .map_err(Into::into),
        Request::SaveCanvasPreview { id, data_url } => {
            match database.save_canvas_preview(&id, &data_url).await {
                Ok(true) => database
                    .get_canvas(&id)
                    .await
                    .map(|item| {
                        item.map(|document| Response::CanvasSaved(document.summary))
                            .unwrap_or(Response::NotFound)
                    })
                    .map_err(Into::into),
                Ok(false) => Ok(Response::NotFound),
                Err(error) => Err(error.into()),
            }
        }
        Request::SeedCanvases { inputs } => database
            .seed_canvases_once(inputs)
            .await
            .map(Response::Seeded)
            .map_err(Into::into),
        Request::ListCanvasCards => database
            .list_canvas_cards()
            .await
            .map(Response::CanvasCards)
            .map_err(Into::into),
        Request::ListCardTemplates => database
            .list_card_templates()
            .await
            .map(Response::CardTemplates)
            .map_err(Into::into),
        Request::SaveCardTemplate { input } => database
            .save_card_template(input)
            .await
            .map(Response::CardTemplateSaved)
            .map_err(Into::into),
        Request::DeleteCardTemplate { id } => database
            .delete_card_template(&id)
            .await
            .map(|deleted| {
                if deleted {
                    Response::Deleted
                } else {
                    Response::NotFound
                }
            })
            .map_err(Into::into),
        Request::ResetCardTemplate { id } => database
            .reset_card_template(&id)
            .await
            .map(Response::CardTemplateSaved)
            .map_err(Into::into),
        Request::ListPluginInstallations => database
            .list_plugin_installations()
            .await
            .map(Response::PluginInstallations)
            .map_err(Into::into),
        Request::SetPluginInstalled {
            plugin_id,
            installed,
        } => database
            .set_plugin_installed(&plugin_id, installed)
            .await
            .map(Response::PluginInstallationSaved)
            .map_err(Into::into),
        Request::GetPluginPreference { plugin_id, key } => database
            .get_plugin_preference(&plugin_id, &key)
            .await
            .map(|value| {
                value
                    .map(Response::PluginPreference)
                    .unwrap_or(Response::NotFound)
            })
            .map_err(Into::into),
        Request::SetPluginPreference {
            plugin_id,
            key,
            value,
        } => database
            .set_plugin_preference(&plugin_id, &key, value)
            .await
            .map(Response::PluginPreference)
            .map_err(Into::into),
        Request::ListBookEntities => database
            .list_book_entities()
            .await
            .map(Response::BookEntities)
            .map_err(Into::into),
        Request::ListQuranRecordings { query } => database
            .list_quran_recordings(&query)
            .await
            .map(Response::QuranRecordings)
            .map_err(Into::into),
        Request::GetQuranPage {
            page_number,
            refresh,
        } => match quran_content.page(page_number, refresh).await {
            Ok(page) => return Response::QuranPage(page),
            Err(error) => {
                return Response::Error(ServiceError {
                    code: "quran_content_unavailable".into(),
                    message: error.to_string(),
                });
            }
        },
        Request::GetQuranVersePage { reference } => match quran_content.verse_page(reference).await
        {
            Ok(page) => return Response::QuranVersePage(page),
            Err(error) => {
                return Response::Error(ServiceError {
                    code: "quran_content_unavailable".into(),
                    message: error.to_string(),
                });
            }
        },
        Request::StartStandaloneQuranRecording { input } => database
            .start_standalone_quran_recording(input)
            .await
            .map(Response::QuranRecordingSaved)
            .map_err(Into::into),
        Request::SaveQuranRecordingReview { input } => database
            .save_quran_recording_review(input)
            .await
            .map(Response::QuranRecordingSaved)
            .map_err(Into::into),
        Request::GetQuranProgress => database
            .quran_progress()
            .await
            .map(Response::QuranProgress)
            .map_err(Into::into),
        Request::SaveQuranRecording { input } => database
            .save_quran_recording(input)
            .await
            .map(Response::QuranRecordingSaved)
            .map_err(Into::into),
        Request::ReplaceQuranRecordingRange { input } => database
            .replace_quran_recording_range(input)
            .await
            .map(Response::QuranRecordingMutated)
            .map_err(Into::into),
        Request::CacheQuranRecordingSegmentPeaks { input } => database
            .cache_quran_recording_segment_peaks(input)
            .await
            .map(Response::QuranRecordingSegmentPeaksCached)
            .map_err(Into::into),
        Request::DeleteQuranRecording { id } => database
            .delete_quran_recording(&id)
            .await
            .map(Response::QuranRecordingDeleted)
            .map_err(Into::into),
        Request::ListQuranBookmarks => database
            .list_quran_bookmarks()
            .await
            .map(Response::QuranBookmarks)
            .map_err(Into::into),
        Request::SaveQuranBookmark { input } => database
            .save_quran_bookmark(input)
            .await
            .map(Response::QuranBookmarkSaved)
            .map_err(Into::into),
        Request::DeleteQuranBookmark { id } => database
            .delete_quran_bookmark(&id)
            .await
            .map(|deleted| {
                if deleted {
                    Response::Deleted
                } else {
                    Response::NotFound
                }
            })
            .map_err(Into::into),
        Request::GetQuranReadingPosition => database
            .quran_reading_position()
            .await
            .map(|value| {
                value
                    .map(Response::QuranReadingPosition)
                    .unwrap_or(Response::NotFound)
            })
            .map_err(Into::into),
        Request::SaveQuranReadingPosition { input } => database
            .save_quran_reading_position(input)
            .await
            .map(Response::QuranReadingPosition)
            .map_err(Into::into),
        Request::ListPersons { query } => database
            .list_persons(query.as_deref())
            .await
            .map(Response::Persons)
            .map_err(Into::into),
        Request::SavePerson { input } => database
            .save_person(input)
            .await
            .map(Response::PersonSaved)
            .map_err(Into::into),
        Request::ListRevisionDecks => database
            .list_revision_decks()
            .await
            .map(Response::RevisionDecks)
            .map_err(Into::into),
        Request::ListRevisionCards { query } => database
            .list_revision_cards(&query)
            .await
            .map(Response::RevisionCards)
            .map_err(Into::into),
        Request::ReviewRevisionCard { input } => database
            .review_revision_card(&input)
            .await
            .map(Response::RevisionScheduled)
            .map_err(Into::into),
        Request::ReviewRevisionSessionCard { input } => database
            .review_revision_session_card(&input)
            .await
            .map(Response::RevisionSessionReviewed)
            .map_err(Into::into),
        Request::GetRevisionDashboard { query } => database
            .revision_dashboard(&query)
            .await
            .map(Response::RevisionDashboard)
            .map_err(Into::into),
        Request::StartRevisionSession { input } => database
            .start_revision_session(&input)
            .await
            .map(Response::RevisionSessionRun)
            .map_err(Into::into),
        Request::GetRevisionSessionRun { id } => database
            .revision_session_run(&id)
            .await
            .map(Response::RevisionSessionRun)
            .map_err(Into::into),
        Request::GetActiveStandaloneRevisionSession => database
            .active_standalone_revision_session()
            .await
            .map(|value| {
                value
                    .map(Response::RevisionSession)
                    .unwrap_or(Response::NotFound)
            })
            .map_err(Into::into),
        Request::CreateQuranCaptureRequest { input } => database
            .create_quran_capture_request(input)
            .await
            .map(Response::QuranCaptureRequest)
            .map_err(Into::into),
        Request::GetQuranCaptureRequest { id } => database
            .quran_capture_request(&id)
            .await
            .map(|value| {
                value
                    .map(Response::QuranCaptureRequest)
                    .unwrap_or(Response::NotFound)
            })
            .map_err(Into::into),
        Request::SetQuranCaptureRequestStatus { id, status } => database
            .set_quran_capture_request_status(&id, status)
            .await
            .map(Response::QuranCaptureRequest)
            .map_err(Into::into),
        Request::RegisterAppActivityHost {
            target,
            instance_id,
        } => {
            return Response::AppActivityPublished(activities.register(target, instance_id));
        }
        Request::PublishAppActivity { activity } => {
            return Response::AppActivityPublished(activities.publish(activity));
        }
        Request::ClaimAppActivities {
            target,
            instance_id,
        } => {
            return Response::AppActivities(activities.claim(target, &instance_id));
        }
        Request::AckAppActivity {
            id,
            instance_id,
            succeeded,
        } => {
            return Response::AppActivityAcknowledged(activities.acknowledge(
                &id,
                &instance_id,
                succeeded,
            ));
        }
        Request::ListMedia { query } => database
            .list_media(&query)
            .await
            .map(Response::MediaPage)
            .map_err(Into::into),
        Request::ImportMediaPaths {
            canvas_id,
            source_paths,
        } => media
            .import_paths(&canvas_id, source_paths)
            .await
            .map(Response::MediaImportResult),
        Request::ImportMediaData { input } => media
            .import_data(input)
            .await
            .map(Response::MediaImportResult),
        Request::ImportMediaPathData { input } => media
            .import_path_data(input)
            .await
            .map(Response::MediaImportResult),
        Request::GetMediaStorage { id } => match media.resolve(&id, false).await {
            Ok((storage, _)) => Ok(Response::MediaStorage(storage)),
            Err(MediaError::NotFound(_)) => Ok(Response::NotFound),
            Err(error) => Err(error),
        },
        Request::GetMediaEntry { id } => match database.get_media_entry(&id).await {
            Ok(Some(entry)) => Ok(Response::MediaEntry(entry)),
            Ok(None) => Ok(Response::NotFound),
            Err(error) => Err(error.into()),
        },
        Request::DeleteMedia { id } => media.delete(&id).await.map(|deleted| {
            if deleted {
                Response::Deleted
            } else {
                Response::NotFound
            }
        }),
        Request::ListReminderImages { reminder_ids } => database
            .list_reminder_images(&reminder_ids)
            .await
            .map(Response::ReminderImages)
            .map_err(Into::into),
        Request::ImportReminderImage { input } => media
            .import_reminder_image(input)
            .await
            .map(Response::ReminderImageSaved),
        Request::DeleteReminderImage { id } => {
            media.delete_reminder_image(&id).await.map(|deleted| {
                if deleted {
                    Response::Deleted
                } else {
                    Response::NotFound
                }
            })
        }
        Request::ListReminderLists => database
            .list_reminder_lists()
            .await
            .map(Response::ReminderLists)
            .map_err(Into::into),
        Request::SaveReminderList { input } => database
            .save_reminder_list(input)
            .await
            .map(Response::ReminderListSaved)
            .map_err(Into::into),
        Request::DeleteReminderList { id } => database
            .delete_reminder_list(&id)
            .await
            .map(|deleted| {
                if deleted {
                    Response::Deleted
                } else {
                    Response::NotFound
                }
            })
            .map_err(Into::into),
        Request::ListReminders { query } => database
            .list_reminders(&query)
            .await
            .map(Response::Reminders)
            .map_err(Into::into),
        Request::SaveReminder { input } => database
            .save_reminder(input)
            .await
            .map(Response::ReminderSaved)
            .map_err(Into::into),
        Request::CreateReminder { input } => database
            .create_reminder(input)
            .await
            .map(Response::ReminderSaved)
            .map_err(Into::into),
        Request::UpdateReminder { input } => database
            .update_reminder(input)
            .await
            .map(Response::ReminderSaved)
            .map_err(Into::into),
        Request::ReorderReminders {
            list_id,
            ordered_ids,
        } => database
            .reorder_reminders(&list_id, &ordered_ids)
            .await
            .map(Response::Reminders)
            .map_err(Into::into),
        Request::SetReminderCompleted { id, completed } => database
            .set_reminder_completed(&id, completed)
            .await
            .map(|value| {
                value
                    .map(Response::ReminderSaved)
                    .unwrap_or(Response::NotFound)
            })
            .map_err(Into::into),
        Request::DeleteReminder { id } => database
            .delete_reminder(&id)
            .await
            .map(|value| {
                value
                    .map(Response::ReminderSaved)
                    .unwrap_or(Response::NotFound)
            })
            .map_err(Into::into),
        Request::RestoreReminder { id } => database
            .restore_reminder(&id)
            .await
            .map(|value| {
                value
                    .map(Response::ReminderSaved)
                    .unwrap_or(Response::NotFound)
            })
            .map_err(Into::into),
        Request::PermanentlyDeleteReminder { id } => media
            .delete_reminder(&id)
            .await
            .map(|deleted| {
                if deleted {
                    Response::Deleted
                } else {
                    Response::NotFound
                }
            })
            .map_err(Into::into),
        Request::GetHealthWaterDay { local_date } => database
            .health_water_day(&local_date)
            .await
            .map(Response::HealthWaterDay)
            .map_err(Into::into),
        Request::SaveHealthWater { input } => database
            .save_health_water(input)
            .await
            .map(Response::HealthWaterDay)
            .map_err(Into::into),
        Request::ListNutritionFood { local_date } => database
            .list_nutrition_food(&local_date)
            .await
            .map(Response::NutritionFoodEntries)
            .map_err(Into::into),
        Request::SaveNutritionFood { input } => database
            .save_nutrition_food(input)
            .await
            .map(Response::NutritionFoodSaved)
            .map_err(Into::into),
        Request::GetRevisionSession { id } => database
            .revision_session(&id)
            .await
            .map(|value| {
                value
                    .map(Response::RevisionSession)
                    .unwrap_or(Response::NotFound)
            })
            .map_err(Into::into),
        Request::InitializeRevisionSession { input } => database
            .initialize_revision_session(input)
            .await
            .map(Response::RevisionSession)
            .map_err(Into::into),
        Request::SetRevisionSessionStatus { input } => database
            .set_revision_session_status(input)
            .await
            .map(Response::RevisionSession)
            .map_err(Into::into),
        Request::SaveRevisionSession { input } => database
            .save_revision_session(input)
            .await
            .map(Response::RevisionSession)
            .map_err(Into::into),
    };
    result.unwrap_or_else(|error| {
        Response::Error(ServiceError {
            code: if matches!(
                error,
                MediaError::Database(
                    database::DatabaseError::RevisionConflict { .. }
                        | database::DatabaseError::CardTemplateRevisionConflict { .. }
                        | database::DatabaseError::RevisionReviewConflict { .. }
                )
            ) {
                "revision_conflict"
            } else if matches!(
                error,
                MediaError::Database(database::DatabaseError::CardTemplateInUse { .. })
            ) {
                "template_in_use"
            } else if matches!(
                error,
                MediaError::Database(database::DatabaseError::BuiltInCardTemplate(_))
            ) {
                "built_in_template"
            } else if matches!(
                error,
                MediaError::CanvasNotFound(_) | MediaError::NotFound(_)
            ) {
                "not_found"
            } else {
                "media_or_database_error"
            }
            .into(),
            message: error.to_string(),
        })
    })
}
