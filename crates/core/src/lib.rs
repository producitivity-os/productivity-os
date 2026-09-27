use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const DATA_SERVICE_PROTOCOL_VERSION: u32 = 18;
pub const CARD_TEMPLATE_PROTOCOL_VERSION: u32 = 2;
pub const REVISION_PROTOCOL_VERSION: u32 = 6;
pub const NOTES_PROTOCOL_VERSION: u32 = 18;
pub const PLUGIN_PROTOCOL_VERSION: u32 = 11;

pub const QURAN_SURAH_AYAH_COUNTS: [u16; 114] = [
    7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
    112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89,
    59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30,
    52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15,
    21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

pub fn quran_ayah_count(surah_number: u16) -> Option<u16> {
    surah_number
        .checked_sub(1)
        .and_then(|index| QURAN_SURAH_AYAH_COUNTS.get(index as usize).copied())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ServiceSettings {
    #[serde(default)]
    pub protocol_version: u32,
    pub config_version: u32,
    pub socket_path: String,
    pub database_path: String,
    pub media_path: String,
    pub max_request_bytes: usize,
    pub max_connections: u32,
    pub busy_timeout_ms: u64,
    pub canvas_autosave_debounce_ms: u64,
    pub canvas_seed_demo_data: bool,
    #[serde(default)]
    pub quran_environment: String,
    #[serde(default = "default_quran_mushaf_id")]
    pub quran_mushaf_id: u16,
}

const fn default_quran_mushaf_id() -> u16 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MediaKind {
    Image,
    Video,
    Audio,
    Pdf,
    Document,
    File,
}

impl MediaKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Image => "image",
            Self::Video => "video",
            Self::Audio => "audio",
            Self::Pdf => "pdf",
            Self::Document => "document",
            Self::File => "file",
        }
    }
}

impl From<&str> for MediaKind {
    fn from(value: &str) -> Self {
        match value {
            "image" => Self::Image,
            "video" => Self::Video,
            "audio" => Self::Audio,
            "pdf" => Self::Pdf,
            "document" => Self::Document,
            _ => Self::File,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MediaEntry {
    pub id: String,
    pub canvas_id: String,
    pub canvas_title: String,
    pub original_name: String,
    pub mime_type: String,
    pub kind: MediaKind,
    pub size_bytes: i64,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub has_thumbnail: bool,
    #[serde(default)]
    pub has_proxy: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MediaCursor {
    pub created_at: i64,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MediaListQuery {
    pub canvas_id: Option<String>,
    #[serde(default)]
    pub canvas_type: Option<CanvasType>,
    pub query: Option<String>,
    pub kind: Option<MediaKind>,
    pub cursor: Option<MediaCursor>,
    pub limit: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MediaPage {
    pub items: Vec<MediaEntry>,
    pub next_cursor: Option<MediaCursor>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MediaStorage {
    pub id: String,
    pub original_name: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub content_hash: String,
    pub storage_key: String,
    pub thumbnail_key: Option<String>,
    #[serde(default)]
    pub proxy_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MediaImportFailure {
    pub name: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MediaImportResult {
    pub imported: Vec<MediaEntry>,
    pub duplicates: Vec<MediaEntry>,
    pub failures: Vec<MediaImportFailure>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MediaDataInput {
    pub canvas_id: String,
    pub original_name: String,
    pub mime_type: String,
    pub data_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MediaPathDataInput {
    pub canvas_id: String,
    pub source_path: String,
    pub original_name: String,
    pub mime_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReminderImageAttachment {
    pub id: String,
    pub reminder_id: String,
    pub original_name: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub has_thumbnail: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReminderImageDataInput {
    pub reminder_id: String,
    pub original_name: String,
    pub mime_type: String,
    pub data_url: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum CanvasType {
    #[default]
    Base,
    Log,
    Workflow,
    Notebook,
}

impl CanvasType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Base => "base",
            Self::Log => "log",
            Self::Workflow => "workflow",
            Self::Notebook => "notebook",
        }
    }
}

impl From<&str> for CanvasType {
    fn from(value: &str) -> Self {
        match value {
            "log" => Self::Log,
            "workflow" => Self::Workflow,
            "notebook" | "wiki" => Self::Notebook,
            _ => Self::Base,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum WorkflowDocumentKind {
    #[default]
    Workflow,
    Project,
}

impl WorkflowDocumentKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Workflow => "workflow",
            Self::Project => "project",
        }
    }
}

impl From<&str> for WorkflowDocumentKind {
    fn from(value: &str) -> Self {
        match value {
            "project" => Self::Project,
            _ => Self::Workflow,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasDocumentSummary {
    pub id: String,
    pub title: String,
    pub project: String,
    #[serde(default)]
    pub canvas_type: CanvasType,
    #[serde(default)]
    pub workflow_kind: WorkflowDocumentKind,
    #[serde(default = "default_canvas_icon")]
    pub icon: String,
    pub starred: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub revision: i64,
    pub preview_data_url: Option<String>,
    #[serde(default)]
    pub cover_media_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasViewport {
    pub x: f64,
    pub y: f64,
    pub scale: f64,
}

impl Default for CanvasViewport {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            scale: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasLayer {
    pub id: String,
    pub name: String,
    pub z_index: i64,
    pub visible: bool,
    pub opacity: f64,
    pub interaction_color: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasObject {
    pub id: String,
    pub layer_id: String,
    pub object_type: String,
    pub sort_index: i64,
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasSnapshot {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    pub active_layer_id: String,
    pub focused_layer_id: Option<String>,
    #[serde(default = "default_unfocused_opacity")]
    pub unfocused_layer_opacity: f64,
    #[serde(default)]
    pub viewport: CanvasViewport,
    pub layers: Vec<CanvasLayer>,
    pub objects: Vec<CanvasObject>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasDocument {
    #[serde(flatten)]
    pub summary: CanvasDocumentSummary,
    pub canvas: CanvasSnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SaveCanvasInput {
    pub id: String,
    pub title: String,
    pub project: String,
    #[serde(default)]
    pub canvas_type: CanvasType,
    #[serde(default)]
    pub workflow_kind: WorkflowDocumentKind,
    #[serde(default = "default_canvas_icon")]
    pub icon: String,
    pub starred: bool,
    #[serde(default)]
    pub cover_media_id: Option<String>,
    pub expected_revision: Option<i64>,
    pub canvas: CanvasSnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReminderList {
    pub id: String,
    pub name: String,
    pub color: String,
    pub sort_index: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SaveReminderListInput {
    pub id: String,
    pub name: String,
    pub color: String,
    pub sort_index: i64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum ReminderView {
    Today,
    Scheduled,
    #[default]
    All,
    Completed,
    Deleted,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReminderQuery {
    #[serde(default)]
    pub view: ReminderView,
    pub list_id: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    pub day_start: Option<i64>,
    pub day_end: Option<i64>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum ReminderPriority {
    #[default]
    None,
    Low,
    Medium,
    High,
}

impl ReminderPriority {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReminderSubtask {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Reminder {
    pub id: String,
    pub list_id: String,
    pub title: String,
    pub notes: String,
    pub due_at: Option<i64>,
    #[serde(default)]
    pub due_has_time: bool,
    pub priority: ReminderPriority,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub subtasks: Vec<ReminderSubtask>,
    pub completed_at: Option<i64>,
    pub deleted_at: Option<i64>,
    pub sort_index: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SaveReminderInput {
    pub id: String,
    pub list_id: String,
    pub title: String,
    #[serde(default)]
    pub notes: String,
    pub due_at: Option<i64>,
    #[serde(default)]
    pub due_has_time: bool,
    #[serde(default)]
    pub priority: ReminderPriority,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub subtasks: Vec<ReminderSubtask>,
    pub sort_index: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CreateReminderInput {
    #[serde(default)]
    pub id: Option<String>,
    pub list_id: String,
    pub title: String,
    #[serde(default)]
    pub notes: String,
    pub due_at: Option<i64>,
    #[serde(default)]
    pub due_has_time: bool,
    #[serde(default)]
    pub priority: ReminderPriority,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub subtasks: Vec<ReminderSubtask>,
    #[serde(default)]
    pub after_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateReminderInput {
    pub id: String,
    pub list_id: String,
    pub title: String,
    #[serde(default)]
    pub notes: String,
    pub due_at: Option<i64>,
    #[serde(default)]
    pub due_has_time: bool,
    #[serde(default)]
    pub priority: ReminderPriority,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub subtasks: Vec<ReminderSubtask>,
    pub sort_index: i64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RevisionSessionStatus {
    Idle,
    Running,
    Paused,
    Completed,
    Cancelled,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RevisionSessionOrigin {
    Workflow,
    Standalone,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RevisionSessionGoal {
    Time {
        #[serde(rename = "durationMs", alias = "duration_ms")]
        duration_ms: i64,
    },
    Cards {
        #[serde(rename = "cardCount", alias = "card_count")]
        card_count: i64,
    },
}

impl RevisionSessionGoal {
    pub const fn value(&self) -> i64 {
        match self {
            Self::Time { duration_ms } => *duration_ms,
            Self::Cards { card_count } => *card_count,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RevisionSessionResult {
    pub sequence: i64,
    pub notebook_id: String,
    pub card_id: String,
    pub question: String,
    pub expected_answer: String,
    pub answer: RevisionRating,
    pub correct: bool,
    pub answered_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RevisionSession {
    pub id: String,
    pub origin: RevisionSessionOrigin,
    pub workflow_id: Option<String>,
    pub node_id: Option<String>,
    pub notebook_id: Option<String>,
    pub goal: RevisionSessionGoal,
    pub elapsed_ms: i64,
    pub status: RevisionSessionStatus,
    pub total_cards: i64,
    pub remaining_cards: i64,
    pub reviewed_count: i64,
    pub right_count: i64,
    pub wrong_count: i64,
    pub started_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub results: Vec<RevisionSessionResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SaveRevisionSessionInput {
    pub id: String,
    pub origin: RevisionSessionOrigin,
    pub workflow_id: Option<String>,
    pub node_id: Option<String>,
    pub notebook_id: Option<String>,
    pub goal: RevisionSessionGoal,
    pub elapsed_ms: i64,
    pub status: RevisionSessionStatus,
    pub total_cards: i64,
    pub remaining_cards: i64,
    pub reviewed_count: i64,
    pub right_count: i64,
    pub wrong_count: i64,
    pub started_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StartRevisionSessionInput {
    pub id: String,
    pub origin: RevisionSessionOrigin,
    pub workflow_id: Option<String>,
    pub node_id: Option<String>,
    pub notebook_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RevisionSessionRun {
    pub session: RevisionSession,
    pub cards: Vec<RevisionCard>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InitializeRevisionSessionInput {
    pub id: String,
    pub total_cards: i64,
    pub remaining_cards: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SetRevisionSessionStatusInput {
    pub id: String,
    pub status: RevisionSessionStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewRevisionSessionCardInput {
    pub session_id: String,
    pub notebook_id: String,
    pub card_id: String,
    pub rating: RevisionRating,
    pub expected_last_review_at: Option<i64>,
    pub question: String,
    pub expected_answer: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RevisionSessionReviewResult {
    pub schedule: RevisionScheduleResult,
    pub session: RevisionSession,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RevisionDashboardBucket {
    Day,
    Week,
    Month,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RevisionDashboardQuery {
    pub notebook_id: Option<String>,
    pub start_at: i64,
    pub end_at: i64,
    pub bucket: RevisionDashboardBucket,
    #[serde(default)]
    pub utc_offset_minutes: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RevisionDashboardPoint {
    pub bucket_start: i64,
    pub reviews: i64,
    pub learned: i64,
    pub correct: i64,
    pub review_time_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RevisionActivityDay {
    pub local_date: String,
    pub reviews: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RevisionForecastPoint {
    pub bucket_start: i64,
    pub due_cards: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RevisionIntervalBucket {
    pub label: String,
    pub cards: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RevisionDeckProgress {
    pub notebook_id: String,
    pub title: String,
    pub total_cards: i64,
    pub learned_cards: i64,
    pub due_cards: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RevisionDashboard {
    pub total_reviews: i64,
    pub active_days: i64,
    pub learned_cards: i64,
    pub cumulative_learned_cards: i64,
    pub correct_reviews: i64,
    pub review_time_ms: i64,
    pub points: Vec<RevisionDashboardPoint>,
    pub activity: Vec<RevisionActivityDay>,
    pub forecast: Vec<RevisionForecastPoint>,
    pub intervals: Vec<RevisionIntervalBucket>,
    pub decks: Vec<RevisionDeckProgress>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum AppActivityTarget {
    Revise,
    Quran,
    Notes,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AppActivity {
    ReviseReviewSession {
        session_id: String,
    },
    ReviseNotebookReview {
        notebook_id: String,
    },
    QuranCapture {
        capture_request_id: String,
    },
    NotesCard {
        notebook_id: String,
        object_id: Option<String>,
    },
}

impl AppActivity {
    pub const fn target(&self) -> AppActivityTarget {
        match self {
            Self::ReviseReviewSession { .. } | Self::ReviseNotebookReview { .. } => {
                AppActivityTarget::Revise
            }
            Self::QuranCapture { .. } => AppActivityTarget::Quran,
            Self::NotesCard { .. } => AppActivityTarget::Notes,
        }
    }

    pub fn url(&self) -> String {
        match self {
            Self::ReviseReviewSession { session_id } => {
                format!("productivity-revise://session/{session_id}")
            }
            Self::ReviseNotebookReview { notebook_id } => {
                format!("productivity-revise://notebook/{notebook_id}")
            }
            Self::QuranCapture { capture_request_id } => {
                format!("productivity-quran://capture/{capture_request_id}")
            }
            Self::NotesCard {
                notebook_id,
                object_id,
            } => object_id.as_ref().map_or_else(
                || format!("productivity-notes://notebook/{notebook_id}"),
                |object_id| {
                    format!("productivity-notes://notebook/{notebook_id}?object={object_id}")
                },
            ),
        }
    }

    pub fn is_valid(&self) -> bool {
        Self::parse_url(&self.url()).as_ref() == Some(self)
    }

    pub fn parse_url(value: &str) -> Option<Self> {
        let (base, query) = value.split_once('?').map_or((value, ""), |parts| parts);
        let (scheme, route) = base.split_once("://")?;
        let (kind, id) = route.split_once('/')?;
        if !valid_activity_id(id) {
            return None;
        }
        match (scheme, kind) {
            ("productivity-revise", "session") if query.is_empty() => {
                Some(Self::ReviseReviewSession {
                    session_id: id.into(),
                })
            }
            ("productivity-revise", "notebook") if query.is_empty() => {
                Some(Self::ReviseNotebookReview {
                    notebook_id: id.into(),
                })
            }
            ("productivity-quran", "capture") if query.is_empty() => Some(Self::QuranCapture {
                capture_request_id: id.into(),
            }),
            ("productivity-notes", "notebook") => {
                let object_id = if query.is_empty() {
                    None
                } else {
                    let value = query.strip_prefix("object=")?;
                    if value.contains('&') || !valid_activity_id(value) {
                        return None;
                    }
                    Some(value.to_owned())
                };
                Some(Self::NotesCard {
                    notebook_id: id.into(),
                    object_id,
                })
            }
            _ => None,
        }
    }
}

pub fn valid_activity_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppActivityEnvelope {
    pub id: String,
    pub activity: AppActivity,
    pub created_at: i64,
    pub expires_at: i64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum QuranCaptureRequestStatus {
    Pending,
    Recording,
    Paused,
    Ready,
    Checking,
    Completed,
    Saved,
    Cancelled,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuranCaptureRequest {
    pub id: String,
    pub workflow_id: String,
    pub node_id: String,
    pub recording_id: String,
    pub replace_start_ms: Option<i64>,
    pub surah_number: u16,
    pub surah_name: String,
    pub ayah_start: u16,
    pub end_surah_number: u16,
    pub end_surah_name: String,
    pub ayah_end: u16,
    pub status: QuranCaptureRequestStatus,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CreateQuranCaptureRequestInput {
    pub id: String,
    pub workflow_id: String,
    pub node_id: String,
    pub recording_id: String,
    pub replace_start_ms: Option<i64>,
    pub surah_number: u16,
    pub surah_name: String,
    pub ayah_start: u16,
    pub end_surah_number: u16,
    pub end_surah_name: String,
    pub ayah_end: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HealthWaterDay {
    pub local_date: String,
    pub target_milliliters: i64,
    pub intake_milliliters: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SaveHealthWaterInput {
    pub local_date: String,
    pub target_milliliters: i64,
    pub intake_milliliters: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NutritionFoodEntry {
    pub id: String,
    pub local_date: String,
    pub meal_name: String,
    pub quantity: i64,
    pub workflow_id: String,
    pub node_id: String,
    pub logged_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SaveNutritionFoodInput {
    pub id: String,
    pub local_date: String,
    pub meal_name: String,
    pub quantity: i64,
    pub workflow_id: String,
    pub node_id: String,
    pub logged_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasCardProjection {
    pub document_id: String,
    pub document_title: String,
    pub layer_id: String,
    pub layer_name: String,
    pub interaction_color: u32,
    pub card: Value,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RevisionCardKind {
    Basic,
    Cloze,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RevisionRating {
    Again,
    Hard,
    Good,
    Easy,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RevisionSourceReference {
    pub object_id: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RevisionCard {
    pub notebook_id: String,
    pub notebook_title: String,
    pub layer_id: String,
    pub layer_name: String,
    pub card_id: String,
    pub kind: RevisionCardKind,
    pub front: String,
    pub back: String,
    pub cloze: String,
    pub sources: Vec<RevisionSourceReference>,
    pub due_at: i64,
    pub last_review_at: Option<i64>,
    pub review_count: i64,
    pub lapses: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RevisionDeckSummary {
    pub notebook_id: String,
    pub title: String,
    pub project: String,
    pub total_count: i64,
    pub due_count: i64,
    pub new_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct RevisionCardQuery {
    pub notebook_id: Option<String>,
    #[serde(default)]
    pub due_only: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewRevisionCardInput {
    pub notebook_id: String,
    pub card_id: String,
    pub rating: RevisionRating,
    pub expected_last_review_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RevisionScheduleResult {
    pub notebook_id: String,
    pub card_id: String,
    pub due_at: i64,
    pub last_review_at: i64,
    pub interval_days: u32,
    pub stability: f32,
    pub difficulty: f32,
    pub review_count: i64,
    pub lapses: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CardTemplate {
    pub id: String,
    pub name: String,
    pub width: f64,
    pub height: f64,
    pub fields: Value,
    pub elements: Value,
    pub bindings: Value,
    pub built_in: bool,
    pub revision: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub usage_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SaveCardTemplateInput {
    pub id: String,
    pub name: String,
    pub width: f64,
    pub height: f64,
    pub fields: Value,
    pub elements: Value,
    pub bindings: Value,
    pub expected_revision: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PluginInstallation {
    pub plugin_id: String,
    pub installed: bool,
    pub installed_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PluginPreference {
    pub plugin_id: String,
    pub key: String,
    pub value: Value,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BookEntity {
    pub card_id: String,
    pub notebook_id: String,
    pub notebook_title: String,
    pub title: String,
    pub author_name: String,
    pub cover_media_id: Option<String>,
    pub cover_width: Option<f64>,
    pub cover_height: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct QuranRecordingQuery {
    pub workflow_id: Option<String>,
    pub node_id: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum QuranRecordingOrigin {
    #[default]
    Workflow,
    Standalone,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum QuranRecordingStatus {
    #[default]
    Draft,
    Recording,
    Paused,
    Ready,
    Checking,
    Completed,
    Cancelled,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuranVerseRef {
    pub surah_number: u16,
    pub ayah_number: u16,
}

impl QuranVerseRef {
    pub fn is_valid(&self) -> bool {
        self.ayah_number > 0
            && quran_ayah_count(self.surah_number).is_some_and(|count| self.ayah_number <= count)
    }

    pub fn key(&self) -> String {
        format!("{}:{}", self.surah_number, self.ayah_number)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuranVerseRange {
    pub start: QuranVerseRef,
    pub end: QuranVerseRef,
}

impl QuranVerseRange {
    pub fn is_valid(&self) -> bool {
        self.start.is_valid()
            && self.end.is_valid()
            && (self.start.surah_number, self.start.ayah_number)
                <= (self.end.surah_number, self.end.ayah_number)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuranAyahBoundary {
    pub verse_key: String,
    pub sequence: u32,
    pub start_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuranMistakeRange {
    pub id: String,
    pub start_verse_key: String,
    pub start_word_position: u16,
    pub end_verse_key: String,
    pub end_word_position: u16,
    pub text_snapshot: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QuranRecording {
    pub id: String,
    pub session_id: String,
    #[serde(default)]
    pub origin: QuranRecordingOrigin,
    #[serde(default)]
    pub status: QuranRecordingStatus,
    pub workflow_id: Option<String>,
    pub node_id: Option<String>,
    pub surah_number: u16,
    pub surah_name: String,
    pub ayah_start: u16,
    pub end_surah_number: u16,
    pub end_surah_name: String,
    pub ayah_end: u16,
    pub duration_ms: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub segments: Vec<QuranRecordingSegment>,
    #[serde(default)]
    pub boundaries: Vec<QuranAyahBoundary>,
    #[serde(default)]
    pub mistakes: Vec<QuranMistakeRange>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QuranRecordingSegment {
    pub id: String,
    pub media_id: String,
    pub sequence: i64,
    pub start_ms: i64,
    pub source_start_ms: i64,
    pub duration_ms: i64,
    pub waveform_peaks: Vec<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SaveQuranRecordingInput {
    pub id: String,
    pub session_id: String,
    pub workflow_id: String,
    pub node_id: String,
    pub media_id: String,
    pub surah_number: u16,
    pub surah_name: String,
    pub ayah_start: u16,
    pub ayah_end: u16,
    pub duration_ms: i64,
    #[serde(default)]
    pub waveform_peaks: Vec<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StartStandaloneQuranRecordingInput {
    pub id: String,
    pub session_id: String,
    pub range: QuranVerseRange,
    pub start_surah_name: String,
    pub end_surah_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SaveQuranRecordingReviewInput {
    pub recording_id: String,
    pub status: QuranRecordingStatus,
    #[serde(default)]
    pub boundaries: Vec<QuranAyahBoundary>,
    #[serde(default)]
    pub mistakes: Vec<QuranMistakeRange>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuranRecitationPosition {
    pub surah_number: u16,
    pub ayah_number: u16,
    pub recording_id: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuranProgress {
    pub reading: Option<QuranReadingPosition>,
    pub recitation: Option<QuranRecitationPosition>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuranPageWord {
    pub id: i64,
    pub verse_key: String,
    pub position: u16,
    pub line_number: u16,
    pub page_number: u16,
    pub char_type: String,
    pub code_v2: String,
    pub text_qpc_hafs: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuranPageVerse {
    pub id: i64,
    pub verse_key: String,
    pub surah_number: u16,
    pub ayah_number: u16,
    pub words: Vec<QuranPageWord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuranPage {
    pub mushaf_id: u16,
    pub page_number: u16,
    pub verses: Vec<QuranPageVerse>,
    pub cached_at: i64,
    pub stale: bool,
    pub environment: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceQuranRecordingRangeInput {
    pub recording_id: String,
    pub media_id: String,
    pub start_ms: i64,
    pub duration_ms: i64,
    #[serde(default)]
    pub waveform_peaks: Vec<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CacheQuranRecordingSegmentPeaksInput {
    pub segment_id: String,
    pub waveform_peaks: Vec<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QuranRecordingMutation {
    pub recording: QuranRecording,
    pub orphaned_media_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuranBookmark {
    pub id: String,
    pub surah_number: u16,
    pub ayah_number: u16,
    pub label: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SaveQuranBookmarkInput {
    pub id: String,
    pub surah_number: u16,
    pub ayah_number: u16,
    #[serde(default)]
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuranReadingPosition {
    pub surah_number: u16,
    pub ayah_number: u16,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SaveQuranReadingPositionInput {
    pub surah_number: u16,
    pub ayah_number: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PersonRecord {
    pub id: String,
    pub name: String,
    pub role: String,
    pub organization: String,
    pub notes: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SavePersonInput {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub organization: String,
    #[serde(default)]
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ServiceError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Request {
    Ping,
    GetSettings,
    ListCanvases,
    ListNotebooks,
    GetCanvas {
        id: String,
    },
    SaveCanvas {
        input: SaveCanvasInput,
    },
    DeleteCanvas {
        id: String,
    },
    SetCanvasStarred {
        id: String,
        starred: bool,
    },
    SetCanvasTitle {
        id: String,
        title: String,
    },
    SaveCanvasPreview {
        id: String,
        data_url: String,
    },
    SeedCanvases {
        inputs: Vec<SaveCanvasInput>,
    },
    ListCanvasCards,
    ListCardTemplates,
    SaveCardTemplate {
        input: SaveCardTemplateInput,
    },
    DeleteCardTemplate {
        id: String,
    },
    ResetCardTemplate {
        id: String,
    },
    ListPluginInstallations,
    SetPluginInstalled {
        plugin_id: String,
        installed: bool,
    },
    GetPluginPreference {
        plugin_id: String,
        key: String,
    },
    SetPluginPreference {
        plugin_id: String,
        key: String,
        value: Value,
    },
    ListBookEntities,
    ListQuranRecordings {
        query: QuranRecordingQuery,
    },
    GetQuranPage {
        page_number: u16,
        refresh: bool,
    },
    GetQuranVersePage {
        reference: QuranVerseRef,
    },
    StartStandaloneQuranRecording {
        input: StartStandaloneQuranRecordingInput,
    },
    SaveQuranRecordingReview {
        input: SaveQuranRecordingReviewInput,
    },
    GetQuranProgress,
    SaveQuranRecording {
        input: SaveQuranRecordingInput,
    },
    ReplaceQuranRecordingRange {
        input: ReplaceQuranRecordingRangeInput,
    },
    CacheQuranRecordingSegmentPeaks {
        input: CacheQuranRecordingSegmentPeaksInput,
    },
    DeleteQuranRecording {
        id: String,
    },
    ListQuranBookmarks,
    SaveQuranBookmark {
        input: SaveQuranBookmarkInput,
    },
    DeleteQuranBookmark {
        id: String,
    },
    GetQuranReadingPosition,
    SaveQuranReadingPosition {
        input: SaveQuranReadingPositionInput,
    },
    ListPersons {
        query: Option<String>,
    },
    SavePerson {
        input: SavePersonInput,
    },
    ListRevisionDecks,
    ListRevisionCards {
        query: RevisionCardQuery,
    },
    ReviewRevisionCard {
        input: ReviewRevisionCardInput,
    },
    ReviewRevisionSessionCard {
        input: ReviewRevisionSessionCardInput,
    },
    GetRevisionDashboard {
        query: RevisionDashboardQuery,
    },
    StartRevisionSession {
        input: StartRevisionSessionInput,
    },
    GetRevisionSessionRun {
        id: String,
    },
    GetActiveStandaloneRevisionSession,
    CreateQuranCaptureRequest {
        input: CreateQuranCaptureRequestInput,
    },
    GetQuranCaptureRequest {
        id: String,
    },
    SetQuranCaptureRequestStatus {
        id: String,
        status: QuranCaptureRequestStatus,
    },
    RegisterAppActivityHost {
        target: AppActivityTarget,
        instance_id: String,
    },
    PublishAppActivity {
        activity: AppActivity,
    },
    ClaimAppActivities {
        target: AppActivityTarget,
        instance_id: String,
    },
    AckAppActivity {
        id: String,
        instance_id: String,
        succeeded: bool,
    },
    ListMedia {
        query: MediaListQuery,
    },
    ImportMediaPaths {
        canvas_id: String,
        source_paths: Vec<String>,
    },
    ImportMediaData {
        input: MediaDataInput,
    },
    ImportMediaPathData {
        input: MediaPathDataInput,
    },
    GetMediaStorage {
        id: String,
    },
    GetMediaEntry {
        id: String,
    },
    DeleteMedia {
        id: String,
    },
    ListReminderImages {
        reminder_ids: Vec<String>,
    },
    ImportReminderImage {
        input: ReminderImageDataInput,
    },
    DeleteReminderImage {
        id: String,
    },
    ListReminderLists,
    SaveReminderList {
        input: SaveReminderListInput,
    },
    DeleteReminderList {
        id: String,
    },
    ListReminders {
        query: ReminderQuery,
    },
    SaveReminder {
        input: SaveReminderInput,
    },
    CreateReminder {
        input: CreateReminderInput,
    },
    UpdateReminder {
        input: UpdateReminderInput,
    },
    ReorderReminders {
        list_id: String,
        ordered_ids: Vec<String>,
    },
    SetReminderCompleted {
        id: String,
        completed: bool,
    },
    DeleteReminder {
        id: String,
    },
    RestoreReminder {
        id: String,
    },
    PermanentlyDeleteReminder {
        id: String,
    },
    GetHealthWaterDay {
        local_date: String,
    },
    SaveHealthWater {
        input: SaveHealthWaterInput,
    },
    ListNutritionFood {
        local_date: String,
    },
    SaveNutritionFood {
        input: SaveNutritionFoodInput,
    },
    GetRevisionSession {
        id: String,
    },
    InitializeRevisionSession {
        input: InitializeRevisionSessionInput,
    },
    SetRevisionSessionStatus {
        input: SetRevisionSessionStatusInput,
    },
    SaveRevisionSession {
        input: SaveRevisionSessionInput,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Response {
    Pong,
    Settings(ServiceSettings),
    Canvases(Vec<CanvasDocumentSummary>),
    Notebooks(Vec<CanvasDocumentSummary>),
    Canvas(CanvasDocument),
    CanvasSaved(CanvasDocumentSummary),
    CanvasCards(Vec<CanvasCardProjection>),
    CardTemplates(Vec<CardTemplate>),
    CardTemplateSaved(CardTemplate),
    PluginInstallations(Vec<PluginInstallation>),
    PluginInstallationSaved(PluginInstallation),
    PluginPreference(PluginPreference),
    BookEntities(Vec<BookEntity>),
    QuranRecordings(Vec<QuranRecording>),
    QuranPage(QuranPage),
    QuranVersePage(u16),
    QuranRecordingSaved(QuranRecording),
    QuranRecordingMutated(QuranRecordingMutation),
    QuranRecordingSegmentPeaksCached(bool),
    QuranRecordingDeleted(Vec<String>),
    QuranBookmarks(Vec<QuranBookmark>),
    QuranBookmarkSaved(QuranBookmark),
    QuranReadingPosition(QuranReadingPosition),
    QuranProgress(QuranProgress),
    Persons(Vec<PersonRecord>),
    PersonSaved(PersonRecord),
    RevisionDecks(Vec<RevisionDeckSummary>),
    RevisionCards(Vec<RevisionCard>),
    RevisionScheduled(RevisionScheduleResult),
    RevisionSessionReviewed(RevisionSessionReviewResult),
    RevisionDashboard(RevisionDashboard),
    RevisionSessionRun(RevisionSessionRun),
    QuranCaptureRequest(QuranCaptureRequest),
    AppActivityPublished(bool),
    AppActivities(Vec<AppActivityEnvelope>),
    AppActivityAcknowledged(bool),
    MediaPage(MediaPage),
    MediaImportResult(MediaImportResult),
    MediaEntry(MediaEntry),
    MediaStorage(MediaStorage),
    ReminderImages(Vec<ReminderImageAttachment>),
    ReminderImageSaved(ReminderImageAttachment),
    ReminderLists(Vec<ReminderList>),
    ReminderListSaved(ReminderList),
    Reminders(Vec<Reminder>),
    ReminderSaved(Reminder),
    HealthWaterDay(HealthWaterDay),
    NutritionFoodEntries(Vec<NutritionFoodEntry>),
    NutritionFoodSaved(NutritionFoodEntry),
    RevisionSession(RevisionSession),
    Seeded(bool),
    Deleted,
    NotFound,
    Error(ServiceError),
}

const fn default_schema_version() -> u32 {
    1
}
const fn default_unfocused_opacity() -> f64 {
    0.35
}
fn default_canvas_icon() -> String {
    "file-text".into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_service_settings_decode_as_protocol_zero() {
        let settings: ServiceSettings = serde_json::from_value(serde_json::json!({
            "configVersion": 1,
            "socketPath": "/tmp/productivity.sock",
            "databasePath": "/tmp/productivity.sqlite3",
            "mediaPath": "/tmp/media",
            "maxRequestBytes": 1024,
            "maxConnections": 4,
            "busyTimeoutMs": 5000,
            "canvasAutosaveDebounceMs": 750,
            "canvasSeedDemoData": true
        }))
        .unwrap();
        assert_eq!(settings.protocol_version, 0);
    }

    #[test]
    fn legacy_wiki_discriminator_decodes_as_notebook() {
        assert_eq!(CanvasType::from("wiki"), CanvasType::Notebook);
        assert_eq!(CanvasType::Notebook.as_str(), "notebook");
        assert_eq!(DATA_SERVICE_PROTOCOL_VERSION, NOTES_PROTOCOL_VERSION);
        assert!(DATA_SERVICE_PROTOCOL_VERSION >= PLUGIN_PROTOCOL_VERSION);
    }

    #[test]
    fn media_queries_remain_compatible_and_support_product_scoping() {
        let legacy: MediaListQuery = serde_json::from_value(serde_json::json!({
            "canvasId": null,
            "query": null,
            "kind": null,
            "cursor": null,
            "limit": 60
        }))
        .unwrap();
        assert_eq!(legacy.canvas_type, None);

        let scoped: MediaListQuery = serde_json::from_value(serde_json::json!({
            "canvasId": null,
            "canvasType": "notebook",
            "query": null,
            "kind": "audio",
            "cursor": null,
            "limit": 60
        }))
        .unwrap();
        assert_eq!(scoped.canvas_type, Some(CanvasType::Notebook));
        assert_eq!(scoped.kind, Some(MediaKind::Audio));
    }

    #[test]
    fn revision_session_goals_use_the_frontend_field_names() {
        let time: RevisionSessionGoal = serde_json::from_value(serde_json::json!({
            "type": "time",
            "durationMs": 1_500_000
        }))
        .unwrap();
        assert_eq!(
            time,
            RevisionSessionGoal::Time {
                duration_ms: 1_500_000
            }
        );
        assert_eq!(
            serde_json::to_value(&time).unwrap(),
            serde_json::json!({ "type": "time", "durationMs": 1_500_000 })
        );

        let cards: RevisionSessionGoal = serde_json::from_value(serde_json::json!({
            "type": "cards",
            "cardCount": 20
        }))
        .unwrap();
        assert_eq!(cards, RevisionSessionGoal::Cards { card_count: 20 });
        assert_eq!(
            serde_json::to_value(&cards).unwrap(),
            serde_json::json!({ "type": "cards", "cardCount": 20 })
        );
    }

    #[test]
    fn quran_metadata_covers_every_surah() {
        assert_eq!(QURAN_SURAH_AYAH_COUNTS.len(), 114);
        assert_eq!(quran_ayah_count(1), Some(7));
        assert_eq!(quran_ayah_count(2), Some(286));
        assert_eq!(quran_ayah_count(114), Some(6));
        assert_eq!(quran_ayah_count(0), None);
        assert_eq!(quran_ayah_count(115), None);
    }

    #[test]
    fn app_activities_round_trip_through_strict_links() {
        let activities = [
            AppActivity::ReviseReviewSession {
                session_id: "session-1".into(),
            },
            AppActivity::ReviseNotebookReview {
                notebook_id: "notebook_2".into(),
            },
            AppActivity::QuranCapture {
                capture_request_id: "capture-3".into(),
            },
            AppActivity::NotesCard {
                notebook_id: "notebook-4".into(),
                object_id: Some("card_5".into()),
            },
        ];
        for activity in activities {
            assert_eq!(AppActivity::parse_url(&activity.url()), Some(activity));
        }
    }

    #[test]
    fn app_activity_links_reject_forged_routes_and_identifiers() {
        for value in [
            "https://session/session-1",
            "productivity-revise://session/../secret",
            "productivity-revise://session/session-1?extra=true",
            "productivity-notes://notebook/notebook-1?object=../../secret",
            "productivity-notes://notebook/notebook-1?object=card-1&extra=true",
            "productivity-quran://capture/",
        ] {
            assert_eq!(AppActivity::parse_url(value), None, "{value}");
        }
    }
}
