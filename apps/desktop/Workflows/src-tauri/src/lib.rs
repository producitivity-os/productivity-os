use app_core::{
    AppActivity, BookEntity, CacheQuranRecordingSegmentPeaksInput, CanvasCardProjection,
    CanvasDocument, CanvasDocumentSummary, CanvasType, CreateQuranCaptureRequestInput,
    CreateReminderInput, HealthWaterDay, MediaEntry, MediaImportResult, MediaListQuery, MediaPage,
    NutritionFoodEntry, PluginInstallation, PluginPreference, QuranCaptureRequestStatus,
    QuranRecording, QuranRecordingQuery, Reminder, ReminderPriority, ReminderQuery,
    ReminderSubtask, ReminderView, RevisionSession, RevisionSessionGoal, RevisionSessionOrigin,
    RevisionSessionStatus, SaveCanvasInput, SaveHealthWaterInput, SaveNutritionFoodInput,
    ServiceSettings, SetRevisionSessionStatusInput, StartRevisionSessionInput, UpdateReminderInput,
    WorkflowDocumentKind,
};
use data_client::DataClient;
use serde::Serialize;
use std::{
    io::{Read, Seek, SeekFrom},
    path::{Component, Path, PathBuf},
    sync::Mutex,
};
use tauri::{
    http::{header, Method, Request as HttpRequest, Response as HttpResponse, StatusCode},
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    AppHandle, Emitter, State,
};
use tauri_plugin_opener::OpenerExt;

struct AppState {
    client: Option<DataClient>,
    configured_settings: Option<ServiceSettings>,
    config_error: Option<String>,
    initial_navigation: Mutex<Option<InitialNavigation>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct InitialNavigation {
    canvas_id: String,
    object_id: Option<String>,
}

impl AppState {
    fn client(&self) -> Result<DataClient, String> {
        self.client.clone().ok_or_else(|| {
            self.config_error
                .clone()
                .unwrap_or_else(|| "data service is not configured".into())
        })
    }
}

async fn dispatch_app_activity(
    _app: &AppHandle,
    _client: &DataClient,
    activity: AppActivity,
) -> Result<(), String> {
    if !activity.is_valid() {
        return Err("invalid app activity".into());
    }
    #[cfg(debug_assertions)]
    {
        if _client
            .publish_app_activity(activity)
            .await
            .map_err(|error| error.to_string())?
        {
            return Ok(());
        }
        return Err(
            "The target development app is not running. Start the desktop suite with `yarn desktop:dev`."
                .into(),
        );
    }
    #[cfg(not(debug_assertions))]
    {
        _app.opener()
            .open_url(activity.url(), None::<&str>)
            .map_err(|error| error.to_string())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DataServiceStatus {
    connected: bool,
    configured_settings: Option<ServiceSettings>,
    active_settings: Option<ServiceSettings>,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CanvasImportFile {
    name: String,
    content: String,
}

#[tauri::command]
async fn read_canvas_import(path: String) -> Result<CanvasImportFile, String> {
    const MAX_IMPORT_BYTES: u64 = 16 * 1024 * 1024;
    let path = PathBuf::from(path);
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !matches!(extension.as_str(), "canvas" | "json") {
        return Err("choose a .canvas or .json canvas export".into());
    }
    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_IMPORT_BYTES {
        return Err("canvas imports must be files smaller than 16 MB".into());
    }
    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|error| error.to_string())?;
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("Workflow import")
        .to_owned();
    Ok(CanvasImportFile { name, content })
}

#[tauri::command]
async fn data_service_status(state: State<'_, AppState>) -> Result<DataServiceStatus, String> {
    let Ok(client) = state.client() else {
        return Ok(DataServiceStatus {
            connected: false,
            configured_settings: state.configured_settings.clone(),
            active_settings: None,
            error: state.config_error.clone(),
        });
    };
    match client.settings().await {
        Ok(settings) => Ok(DataServiceStatus {
            connected: true,
            configured_settings: state.configured_settings.clone(),
            active_settings: Some(settings),
            error: None,
        }),
        Err(error) => Ok(DataServiceStatus {
            connected: false,
            configured_settings: state.configured_settings.clone(),
            active_settings: None,
            error: Some(error.to_string()),
        }),
    }
}

#[tauri::command]
fn initial_navigation(state: State<'_, AppState>) -> Option<InitialNavigation> {
    state.initial_navigation.lock().ok()?.take()
}

#[tauri::command]
async fn list_canvases(state: State<'_, AppState>) -> Result<Vec<CanvasDocumentSummary>, String> {
    state
        .client()?
        .list_canvases()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn list_project_reminders(
    project_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<Reminder>, String> {
    let client = state.client()?;
    project_reminders(&client, &project_id).await
}

async fn project_reminders(client: &DataClient, project_id: &str) -> Result<Vec<Reminder>, String> {
    let base = ReminderQuery {
        view: ReminderView::All,
        list_id: None,
        project_id: Some(project_id.to_owned()),
        day_start: None,
        day_end: None,
    };
    let mut reminders = client
        .list_reminders(base)
        .await
        .map_err(|error| error.to_string())?;
    reminders.extend(
        client
            .list_reminders(ReminderQuery {
                view: ReminderView::Completed,
                list_id: None,
                project_id: Some(project_id.to_owned()),
                day_start: None,
                day_end: None,
            })
            .await
            .map_err(|error| error.to_string())?,
    );
    reminders.sort_by_key(|reminder| (reminder.sort_index, reminder.created_at));
    Ok(reminders)
}

async fn ensure_project_workflow(client: &DataClient, project_id: &str) -> Result<(), String> {
    let is_project = client
        .list_canvases()
        .await
        .map_err(|error| error.to_string())?
        .into_iter()
        .any(|document| {
            document.id == project_id
                && document.canvas_type == CanvasType::Workflow
                && document.workflow_kind == WorkflowDocumentKind::Project
        });
    if is_project {
        Ok(())
    } else {
        Err("project workflow does not exist".into())
    }
}

async fn save_project_reminder(
    client: &DataClient,
    mut reminder: Reminder,
    title: &str,
    completed: bool,
    subtasks: Vec<ReminderSubtask>,
) -> Result<Reminder, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("reminder title cannot be empty".into());
    }
    if reminder.title != title || reminder.subtasks != subtasks {
        reminder = client
            .update_reminder(UpdateReminderInput {
                id: reminder.id.clone(),
                list_id: reminder.list_id.clone(),
                title: title.to_owned(),
                notes: reminder.notes.clone(),
                due_at: reminder.due_at,
                due_has_time: reminder.due_has_time,
                priority: reminder.priority,
                project_id: reminder.project_id.clone(),
                subtasks,
                sort_index: reminder.sort_index,
            })
            .await
            .map_err(|error| error.to_string())?;
    }
    if reminder.subtasks.is_empty() && reminder.completed_at.is_some() != completed {
        reminder = client
            .set_reminder_completed(reminder.id.clone(), completed)
            .await
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "reminder no longer exists".to_owned())?;
    }
    Ok(reminder)
}

#[tauri::command]
async fn create_project_reminder(
    project_id: String,
    title: String,
    completed: bool,
    subtasks: Vec<ReminderSubtask>,
    state: State<'_, AppState>,
) -> Result<Reminder, String> {
    let client = state.client()?;
    ensure_project_workflow(&client, &project_id).await?;
    let title = title.trim();
    if title.is_empty() {
        return Err("reminder title cannot be empty".into());
    }
    let reminder = client
        .create_reminder(CreateReminderInput {
            id: None,
            list_id: "reminders-inbox".into(),
            title: title.to_owned(),
            notes: String::new(),
            due_at: None,
            due_has_time: false,
            priority: ReminderPriority::None,
            project_id: Some(project_id),
            subtasks: subtasks.clone(),
            after_id: None,
        })
        .await
        .map_err(|error| error.to_string())?;
    save_project_reminder(&client, reminder, title, completed, subtasks).await
}

#[tauri::command]
async fn update_project_reminder(
    project_id: String,
    id: String,
    title: String,
    completed: bool,
    subtasks: Vec<ReminderSubtask>,
    state: State<'_, AppState>,
) -> Result<Option<Reminder>, String> {
    let client = state.client()?;
    let Some(mut reminder) = project_reminders(&client, &project_id)
        .await?
        .into_iter()
        .find(|reminder| reminder.id == id)
    else {
        return Ok(None);
    };
    reminder = save_project_reminder(&client, reminder, &title, completed, subtasks).await?;
    Ok(Some(reminder))
}

#[tauri::command]
async fn delete_project_reminder(
    project_id: String,
    id: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let client = state.client()?;
    let belongs_to_project = project_reminders(&client, &project_id)
        .await?
        .into_iter()
        .any(|reminder| reminder.id == id);
    if !belongs_to_project {
        return Ok(false);
    }
    client
        .delete_reminder(id)
        .await
        .map(|reminder| reminder.is_some())
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn restore_project_reminder(
    project_id: String,
    id: String,
    title: String,
    completed: bool,
    subtasks: Vec<ReminderSubtask>,
    state: State<'_, AppState>,
) -> Result<Option<Reminder>, String> {
    let client = state.client()?;
    ensure_project_workflow(&client, &project_id).await?;
    let belongs_to_project = client
        .list_reminders(ReminderQuery {
            view: ReminderView::Deleted,
            list_id: None,
            project_id: Some(project_id),
            day_start: None,
            day_end: None,
        })
        .await
        .map_err(|error| error.to_string())?
        .into_iter()
        .any(|reminder| reminder.id == id);
    if !belongs_to_project {
        return Ok(None);
    }
    let reminder = client
        .restore_reminder(id)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "reminder no longer exists".to_owned())?;
    Ok(Some(
        save_project_reminder(&client, reminder, &title, completed, subtasks).await?,
    ))
}

#[tauri::command]
async fn get_canvas(
    id: String,
    state: State<'_, AppState>,
) -> Result<Option<CanvasDocument>, String> {
    state
        .client()?
        .get_canvas(id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn save_canvas(
    input: SaveCanvasInput,
    state: State<'_, AppState>,
) -> Result<CanvasDocumentSummary, String> {
    state
        .client()?
        .save_canvas(input)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn delete_canvas(id: String, state: State<'_, AppState>) -> Result<bool, String> {
    state
        .client()?
        .delete_canvas(id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn set_canvas_starred(
    id: String,
    starred: bool,
    state: State<'_, AppState>,
) -> Result<Option<CanvasDocumentSummary>, String> {
    state
        .client()?
        .set_canvas_starred(id, starred)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn set_canvas_title(
    id: String,
    title: String,
    state: State<'_, AppState>,
) -> Result<Option<CanvasDocumentSummary>, String> {
    state
        .client()?
        .set_canvas_title(id, title)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn save_canvas_preview(
    id: String,
    data_url: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    state
        .client()?
        .save_canvas_preview(id, data_url)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn seed_canvases(
    inputs: Vec<SaveCanvasInput>,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    state
        .client()?
        .seed_canvases(inputs)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn list_canvas_cards(
    state: State<'_, AppState>,
) -> Result<Vec<CanvasCardProjection>, String> {
    state
        .client()?
        .list_canvas_cards()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn list_workflow_plugin_installations(
    state: State<'_, AppState>,
) -> Result<Vec<PluginInstallation>, String> {
    state
        .client()?
        .list_plugin_installations()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn set_workflow_plugin_installed(
    plugin_id: String,
    installed: bool,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<PluginInstallation, String> {
    if !plugin_id.starts_with("workflows.") {
        return Err("only Workflows plugins can be changed here".into());
    }
    let value = state
        .client()?
        .set_plugin_installed(plugin_id, installed)
        .await
        .map_err(|error| error.to_string())?;
    app.emit("workflows:plugins-changed", &value)
        .map_err(|error| error.to_string())?;
    Ok(value)
}

#[tauri::command]
async fn get_workflow_plugin_preference(
    plugin_id: String,
    key: String,
    state: State<'_, AppState>,
) -> Result<Option<PluginPreference>, String> {
    state
        .client()?
        .get_plugin_preference(plugin_id, key)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn set_workflow_plugin_preference(
    plugin_id: String,
    key: String,
    value: serde_json::Value,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<PluginPreference, String> {
    let preference = state
        .client()?
        .set_plugin_preference(plugin_id, key, value)
        .await
        .map_err(|error| error.to_string())?;
    app.emit("workflows:plugin-preference-changed", &preference)
        .map_err(|error| error.to_string())?;
    Ok(preference)
}

#[tauri::command]
async fn list_book_entities(state: State<'_, AppState>) -> Result<Vec<BookEntity>, String> {
    state
        .client()?
        .list_book_entities()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn list_revision_notebooks(
    state: State<'_, AppState>,
) -> Result<Vec<CanvasDocumentSummary>, String> {
    state
        .client()?
        .list_notebooks()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_revision_session(
    id: String,
    state: State<'_, AppState>,
) -> Result<Option<RevisionSession>, String> {
    state
        .client()?
        .revision_session(id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn launch_revision_session(
    workflow_id: String,
    node_id: String,
    session_id: String,
    notebook_id: Option<String>,
    goal: RevisionSessionGoal,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<RevisionSession, String> {
    let client = state.client()?;
    let workflow = client
        .get_canvas(workflow_id.clone())
        .await
        .map_err(|error| error.to_string())?;
    if !matches!(workflow, Some(ref document) if document.summary.canvas_type == CanvasType::Workflow)
    {
        return Err("workflow does not exist".into());
    }
    let _ = goal;
    let existing = client
        .revision_session(session_id.clone())
        .await
        .map_err(|error| error.to_string())?;
    let (session, created) = if let Some(existing) = existing {
        if existing.origin != RevisionSessionOrigin::Workflow
            || existing.workflow_id.as_deref() != Some(workflow_id.as_str())
            || existing.node_id.as_deref() != Some(node_id.as_str())
        {
            return Err("revision session does not belong to this workflow node".into());
        }
        if matches!(
            existing.status,
            RevisionSessionStatus::Completed | RevisionSessionStatus::Cancelled
        ) {
            return Err("revision session is already closed".into());
        }
        (
            client
                .set_revision_session_status(SetRevisionSessionStatusInput {
                    id: existing.id,
                    status: RevisionSessionStatus::Running,
                })
                .await
                .map_err(|error| error.to_string())?,
            false,
        )
    } else {
        (
            client
                .start_revision_session(StartRevisionSessionInput {
                    id: session_id.clone(),
                    origin: RevisionSessionOrigin::Workflow,
                    workflow_id: Some(workflow_id),
                    node_id: Some(node_id),
                    notebook_id,
                })
                .await
                .map_err(|error| error.to_string())?
                .session,
            true,
        )
    };
    if session.status == RevisionSessionStatus::Completed {
        return Ok(session);
    }
    if let Err(error) = dispatch_app_activity(
        &app,
        &client,
        AppActivity::ReviseReviewSession { session_id },
    )
    .await
    {
        if created {
            let _ = client
                .set_revision_session_status(SetRevisionSessionStatusInput {
                    id: session.id.clone(),
                    status: RevisionSessionStatus::Cancelled,
                })
                .await;
        }
        return Err(error);
    }
    Ok(session)
}

#[tauri::command]
async fn set_revision_session_status(
    id: String,
    status: RevisionSessionStatus,
    state: State<'_, AppState>,
) -> Result<RevisionSession, String> {
    state
        .client()?
        .set_revision_session_status(SetRevisionSessionStatusInput { id, status })
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_health_water_day(
    local_date: String,
    state: State<'_, AppState>,
) -> Result<HealthWaterDay, String> {
    state
        .client()?
        .health_water_day(local_date)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn save_health_water(
    input: SaveHealthWaterInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<HealthWaterDay, String> {
    let saved = state
        .client()?
        .save_health_water(input)
        .await
        .map_err(|error| error.to_string())?;
    let _ = app.emit("health:water-changed", &saved);
    let _ = app.emit("nutrition:water-changed", &saved);
    Ok(saved)
}

#[tauri::command]
async fn save_nutrition_water(
    input: SaveHealthWaterInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<HealthWaterDay, String> {
    save_health_water(input, app, state).await
}

#[tauri::command]
async fn list_nutrition_food(
    local_date: String,
    state: State<'_, AppState>,
) -> Result<Vec<NutritionFoodEntry>, String> {
    state
        .client()?
        .list_nutrition_food(local_date)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn save_nutrition_food(
    input: SaveNutritionFoodInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<NutritionFoodEntry, String> {
    let saved = state
        .client()?
        .save_nutrition_food(input)
        .await
        .map_err(|error| error.to_string())?;
    let _ = app.emit("nutrition:food-changed", &saved);
    Ok(saved)
}

#[tauri::command]
async fn list_quran_recordings(
    query: QuranRecordingQuery,
    state: State<'_, AppState>,
) -> Result<Vec<QuranRecording>, String> {
    state
        .client()?
        .list_quran_recordings(query)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn cache_quran_recording_segment_peaks(
    input: CacheQuranRecordingSegmentPeaksInput,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    state
        .client()?
        .cache_quran_recording_segment_peaks(input)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn launch_quran_revision(
    workflow_id: String,
    node_id: String,
    capture_session_id: String,
    recording_id: String,
    replace_start_ms: Option<i64>,
    surah_number: u16,
    surah_name: String,
    ayah_start: u16,
    end_surah_number: u16,
    end_surah_name: String,
    ayah_end: u16,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if capture_session_id.trim().is_empty()
        || recording_id.trim().is_empty()
        || replace_start_ms.is_some_and(|value| value < 0)
    {
        return Err("invalid Quran recording target".into());
    }
    let client = state.client()?;
    let workflow = client
        .get_canvas(workflow_id.clone())
        .await
        .map_err(|error| error.to_string())?;
    if !matches!(workflow, Some(ref document) if document.summary.canvas_type == CanvasType::Workflow)
    {
        return Err("workflow does not exist".into());
    }
    if !(app_core::QuranVerseRange {
        start: app_core::QuranVerseRef {
            surah_number,
            ayah_number: ayah_start,
        },
        end: app_core::QuranVerseRef {
            surah_number: end_surah_number,
            ayah_number: ayah_end,
        },
    })
    .is_valid()
    {
        return Err("invalid Surah or ayah range".into());
    }
    if let Some(existing) = client
        .quran_capture_request(capture_session_id.clone())
        .await
        .map_err(|error| error.to_string())?
    {
        if existing.workflow_id != workflow_id
            || existing.node_id != node_id
            || existing.recording_id != recording_id
        {
            return Err("Quran capture identifier belongs to another activity".into());
        }
        if matches!(
            existing.status,
            QuranCaptureRequestStatus::Completed
                | QuranCaptureRequestStatus::Cancelled
                | QuranCaptureRequestStatus::Failed
        ) {
            return Err("Quran capture is already closed".into());
        }
    } else {
        client
            .create_quran_capture_request(CreateQuranCaptureRequestInput {
                id: capture_session_id.clone(),
                workflow_id,
                node_id,
                recording_id,
                replace_start_ms,
                surah_number,
                surah_name,
                ayah_start,
                end_surah_number,
                end_surah_name,
                ayah_end,
            })
            .await
            .map_err(|error| error.to_string())?;
    }
    if let Err(error) = dispatch_app_activity(
        &app,
        &client,
        AppActivity::QuranCapture {
            capture_request_id: capture_session_id.clone(),
        },
    )
    .await
    {
        let _ = client
            .set_quran_capture_request_status(capture_session_id, QuranCaptureRequestStatus::Failed)
            .await;
        return Err(error);
    }
    Ok(())
}

#[tauri::command]
fn ring_timer_bell() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let child = std::process::Command::new("afplay")
        .arg("/System/Library/Sounds/Glass.aiff")
        .spawn();
    #[cfg(target_os = "windows")]
    let child = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", "[console]::beep(880,450)"])
        .spawn();
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let child = std::process::Command::new("canberra-gtk-play")
        .args(["-i", "complete"])
        .spawn();
    child.map(|_| ()).map_err(|error| error.to_string())
}

#[tauri::command]
async fn workflow_media_entry(
    id: String,
    state: &State<'_, AppState>,
) -> Result<Option<MediaEntry>, String> {
    let entry = state
        .client()?
        .get_media_entry(id)
        .await
        .map_err(|error| error.to_string())?;
    let Some(entry) = entry else {
        return Ok(None);
    };
    let workflow = state
        .client()?
        .get_canvas(entry.canvas_id.clone())
        .await
        .map_err(|error| error.to_string())?;
    if !matches!(workflow, Some(ref document) if document.summary.canvas_type == CanvasType::Workflow)
    {
        return Err("media does not belong to a workflow".into());
    }
    Ok(Some(entry))
}

#[tauri::command]
async fn list_media(
    mut query: MediaListQuery,
    state: State<'_, AppState>,
) -> Result<MediaPage, String> {
    query.canvas_type = Some(CanvasType::Workflow);
    state
        .client()?
        .list_media(query)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn import_media_paths(
    canvas_id: String,
    source_paths: Vec<String>,
    state: State<'_, AppState>,
) -> Result<MediaImportResult, String> {
    let workflow = state
        .client()?
        .get_canvas(canvas_id.clone())
        .await
        .map_err(|error| error.to_string())?;
    if !matches!(workflow, Some(ref document) if document.summary.canvas_type == CanvasType::Workflow)
    {
        return Err("workflow does not exist".into());
    }
    state
        .client()?
        .import_media_paths(canvas_id, source_paths)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn delete_media(id: String, state: State<'_, AppState>) -> Result<bool, String> {
    if workflow_media_entry(id.clone(), &state).await?.is_none() {
        return Ok(false);
    }
    state
        .client()?
        .delete_media(id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn open_media(id: String, app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    if workflow_media_entry(id.clone(), &state).await?.is_none() {
        return Err("media entry does not exist".into());
    }
    let storage = state
        .client()?
        .get_media_storage(id)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "media entry does not exist".to_owned())?;
    let path = media_storage_path(&state, &storage.storage_key)?;
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn reveal_media(
    id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if workflow_media_entry(id.clone(), &state).await?.is_none() {
        return Err("media entry does not exist".into());
    }
    let storage = state
        .client()?
        .get_media_storage(id)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "media entry does not exist".to_owned())?;
    let path = media_storage_path(&state, &storage.storage_key)?;
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|error| error.to_string())
}

fn media_storage_path(state: &State<'_, AppState>, key: &str) -> Result<PathBuf, String> {
    let root = state
        .configured_settings
        .as_ref()
        .map(|settings| PathBuf::from(&settings.media_path))
        .ok_or_else(|| "media storage is not configured".to_owned())?;
    safe_media_path(&root, key)
}

fn safe_media_path(root: &Path, key: &str) -> Result<PathBuf, String> {
    let relative = Path::new(key);
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("invalid media storage key".into());
    }
    let root = std::fs::canonicalize(root).map_err(|error| error.to_string())?;
    let path = std::fs::canonicalize(root.join(relative)).map_err(|error| error.to_string())?;
    if !path.starts_with(&root) {
        return Err("media path escapes storage root".into());
    }
    Ok(path)
}

fn protocol_response(
    client: DataClient,
    media_root: PathBuf,
    request: HttpRequest<Vec<u8>>,
) -> HttpResponse<Vec<u8>> {
    let segments: Vec<&str> = request
        .uri()
        .path()
        .trim_start_matches('/')
        .split('/')
        .collect();
    if segments.len() != 2 || !matches!(segments[1], "content" | "thumbnail" | "proxy") {
        return response(
            StatusCode::NOT_FOUND,
            "text/plain",
            b"media not found".to_vec(),
        );
    }
    if !matches!(*request.method(), Method::GET | Method::HEAD) {
        return response(StatusCode::METHOD_NOT_ALLOWED, "text/plain", Vec::new());
    }
    let id = segments[0].to_owned();
    let thumbnail = segments[1] == "thumbnail";
    let proxy = segments[1] == "proxy";
    let storage = match tauri::async_runtime::block_on(client.get_media_storage(id)) {
        Ok(Some(storage)) => storage,
        _ => {
            return response(
                StatusCode::NOT_FOUND,
                "text/plain",
                b"media not found".to_vec(),
            )
        }
    };
    let preferred = if thumbnail {
        storage
            .thumbnail_key
            .as_deref()
            .map(|key| (key, "image/webp"))
    } else if proxy {
        storage.proxy_key.as_deref().map(|key| (key, "video/mp4"))
    } else {
        None
    };
    let resolved = preferred
        .and_then(|(key, content_type)| {
            safe_media_path(&media_root, key)
                .ok()
                .map(|path| (path, content_type))
        })
        .or_else(|| {
            safe_media_path(&media_root, &storage.storage_key)
                .ok()
                .map(|path| (path, storage.mime_type.as_str()))
        });
    let Some((path, content_type)) = resolved else {
        return response(
            StatusCode::NOT_FOUND,
            "text/plain",
            b"media not found".to_vec(),
        );
    };
    let mut file = match std::fs::File::open(path) {
        Ok(file) => file,
        Err(_) => {
            return response(
                StatusCode::NOT_FOUND,
                "text/plain",
                b"media not found".to_vec(),
            )
        }
    };
    let size = match file.metadata() {
        Ok(metadata) => metadata.len(),
        Err(_) => 0,
    };
    let range = request
        .headers()
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| parse_range(value, size));
    let (status, start, end) = match (request.headers().contains_key(header::RANGE), range) {
        (true, Some((start, end))) => (StatusCode::PARTIAL_CONTENT, start, end),
        (true, None) => {
            return HttpResponse::builder()
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header(header::CONTENT_RANGE, format!("bytes */{size}"))
                .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                .header("Cross-Origin-Resource-Policy", "cross-origin")
                .body(Vec::new())
                .unwrap();
        }
        (false, _) => (StatusCode::OK, 0, size.saturating_sub(1)),
    };
    let length = if size == 0 { 0 } else { end - start + 1 };
    let mut body = Vec::new();
    if *request.method() != Method::HEAD && length > 0 {
        if file.seek(SeekFrom::Start(start)).is_err() {
            return response(StatusCode::INTERNAL_SERVER_ERROR, "text/plain", Vec::new());
        }
        let mut limited = file.take(length);
        if limited.read_to_end(&mut body).is_err() {
            return response(StatusCode::INTERNAL_SERVER_ERROR, "text/plain", Vec::new());
        }
    }
    let mut builder = HttpResponse::builder()
        .status(status)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_LENGTH, length.to_string())
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header("Cross-Origin-Resource-Policy", "cross-origin")
        .header(
            header::CACHE_CONTROL,
            "private, max-age=31536000, immutable",
        );
    if status == StatusCode::PARTIAL_CONTENT {
        builder = builder.header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{size}"));
    }
    builder.body(body).unwrap()
}

fn book_protocol_response(
    client: DataClient,
    media_root: PathBuf,
    request: HttpRequest<Vec<u8>>,
) -> HttpResponse<Vec<u8>> {
    let id = request
        .uri()
        .path()
        .trim_start_matches('/')
        .split('/')
        .next()
        .unwrap_or_default()
        .to_owned();
    let allowed = tauri::async_runtime::block_on(client.list_book_entities())
        .map(|books| {
            books
                .iter()
                .any(|book| book.cover_media_id.as_deref() == Some(id.as_str()))
        })
        .unwrap_or(false);
    if !allowed {
        return response(
            StatusCode::NOT_FOUND,
            "text/plain",
            b"book cover not found".to_vec(),
        );
    }
    protocol_response(client, media_root, request)
}

fn workflow_protocol_response(
    client: DataClient,
    media_root: PathBuf,
    request: HttpRequest<Vec<u8>>,
) -> HttpResponse<Vec<u8>> {
    let id = request
        .uri()
        .path()
        .trim_start_matches('/')
        .split('/')
        .next()
        .unwrap_or_default()
        .to_owned();
    let allowed = tauri::async_runtime::block_on(async {
        let Some(entry) = client.get_media_entry(id).await.ok().flatten() else {
            return false;
        };
        matches!(
            client.get_canvas(entry.canvas_id).await,
            Ok(Some(document)) if document.summary.canvas_type == CanvasType::Workflow
        )
    });
    if !allowed {
        return response(
            StatusCode::NOT_FOUND,
            "text/plain",
            b"workflow media not found".to_vec(),
        );
    }
    protocol_response(client, media_root, request)
}

fn parse_range(value: &str, size: u64) -> Option<(u64, u64)> {
    let value = value.strip_prefix("bytes=")?;
    if value.contains(',') || size == 0 {
        return None;
    }
    let (start, end) = value.split_once('-')?;
    if start.is_empty() {
        let suffix = end.parse::<u64>().ok()?.min(size);
        return Some((size - suffix, size - 1));
    }
    let start = start.parse::<u64>().ok()?;
    if start >= size {
        return None;
    }
    let end = if end.is_empty() {
        size - 1
    } else {
        end.parse::<u64>().ok()?.min(size - 1)
    };
    (start <= end).then_some((start, end))
}

fn response(status: StatusCode, content_type: &str, body: Vec<u8>) -> HttpResponse<Vec<u8>> {
    HttpResponse::builder()
        .status(status)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header("Cross-Origin-Resource-Policy", "cross-origin")
        .body(body)
        .unwrap()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let (client, configured_settings, config_error) = match app_config::ProductivityConfig::load() {
        Ok(config) => {
            let settings = config.service_settings();
            let client = DataClient::new(
                &config.data_service.socket_path,
                config.data_service.max_request_bytes,
            );
            (Some(client), Some(settings), None)
        }
        Err(error) => (None, None, Some(error.to_string())),
    };

    let arguments: Vec<String> = std::env::args().collect();
    let initial_canvas_id = arguments
        .iter()
        .position(|value| value == "--workflow-id" || value == "--canvas-id")
        .and_then(|index| arguments.get(index + 1))
        .cloned();
    let initial_object_id = arguments
        .iter()
        .position(|value| value == "--object-id")
        .and_then(|index| arguments.get(index + 1))
        .cloned();
    let initial_target = initial_canvas_id.map(|canvas_id| InitialNavigation {
        canvas_id,
        object_id: initial_object_id,
    });
    let protocol_client = client.clone();
    let book_protocol_client = client.clone();
    let protocol_media_root = configured_settings
        .as_ref()
        .map(|settings| PathBuf::from(&settings.media_path));
    let book_protocol_media_root = protocol_media_root.clone();
    tauri::Builder::default()
        .manage(AppState {
            client,
            configured_settings,
            config_error,
            initial_navigation: Mutex::new(initial_target),
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .menu(|app| {
            let save = MenuItemBuilder::with_id("save_workflow", "Save Workflow")
                .accelerator("CmdOrCtrl+S")
                .build(app)?;
            let import = MenuItemBuilder::with_id("import_workflow", "Import Workflow…")
                .accelerator("CmdOrCtrl+Shift+I")
                .build(app)?;
            let app_menu = SubmenuBuilder::new(app, "Workflows")
                .about(None)
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .separator()
                .quit()
                .build()?;
            let file_menu = SubmenuBuilder::new(app, "File")
                .items(&[&save, &import])
                .separator()
                .close_window()
                .build()?;
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;
            MenuBuilder::new(app)
                .items(&[&app_menu, &file_menu, &edit_menu])
                .build()
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "save_workflow" => {
                let _ = app.emit("workflows:native-save-workflow", ());
            }
            "import_workflow" => {
                let _ = app.emit("workflows:native-import-workflow", ());
            }
            _ => {}
        })
        .register_asynchronous_uri_scheme_protocol("media", move |_context, request, responder| {
            let client = protocol_client.clone();
            let media_root = book_protocol_media_root.clone();
            std::thread::spawn(move || {
                let response = match (client, media_root) {
                    (Some(client), Some(media_root)) => {
                        workflow_protocol_response(client, media_root, request)
                    }
                    _ => response(
                        StatusCode::SERVICE_UNAVAILABLE,
                        "text/plain",
                        b"media service unavailable".to_vec(),
                    ),
                };
                responder.respond(response);
            });
        })
        .register_asynchronous_uri_scheme_protocol(
            "book-media",
            move |_context, request, responder| {
                let client = book_protocol_client.clone();
                let media_root = protocol_media_root.clone();
                std::thread::spawn(move || {
                    let response = match (client, media_root) {
                        (Some(client), Some(media_root)) => {
                            book_protocol_response(client, media_root, request)
                        }
                        _ => response(
                            StatusCode::SERVICE_UNAVAILABLE,
                            "text/plain",
                            b"media service unavailable".to_vec(),
                        ),
                    };
                    responder.respond(response);
                });
            },
        )
        .invoke_handler(tauri::generate_handler![
            data_service_status,
            initial_navigation,
            read_canvas_import,
            list_canvases,
            list_project_reminders,
            create_project_reminder,
            update_project_reminder,
            delete_project_reminder,
            restore_project_reminder,
            get_canvas,
            save_canvas,
            delete_canvas,
            set_canvas_starred,
            set_canvas_title,
            save_canvas_preview,
            seed_canvases,
            list_canvas_cards,
            list_workflow_plugin_installations,
            set_workflow_plugin_installed,
            get_workflow_plugin_preference,
            set_workflow_plugin_preference,
            list_book_entities,
            list_revision_notebooks,
            get_revision_session,
            launch_revision_session,
            set_revision_session_status,
            get_health_water_day,
            save_health_water,
            save_nutrition_water,
            list_nutrition_food,
            save_nutrition_food,
            list_quran_recordings,
            cache_quran_recording_segment_peaks,
            launch_quran_revision,
            ring_timer_bell,
            list_media,
            import_media_paths,
            delete_media,
            open_media,
            reveal_media,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Workflows");
}
