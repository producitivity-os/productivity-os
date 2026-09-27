use app_core::{
    AppActivity, AppActivityEnvelope, AppActivityTarget, BookEntity,
    CARD_TEMPLATE_PROTOCOL_VERSION, CacheQuranRecordingSegmentPeaksInput, CanvasCardProjection,
    CanvasDocument, CanvasDocumentSummary, CardTemplate, CreateQuranCaptureRequestInput,
    CreateReminderInput, DATA_SERVICE_PROTOCOL_VERSION, HealthWaterDay,
    InitializeRevisionSessionInput, MediaDataInput, MediaEntry, MediaImportResult, MediaListQuery,
    MediaPage, MediaPathDataInput, MediaStorage, NOTES_PROTOCOL_VERSION, NutritionFoodEntry,
    PLUGIN_PROTOCOL_VERSION, PersonRecord, PluginInstallation, PluginPreference, QuranBookmark,
    QuranCaptureRequest, QuranCaptureRequestStatus, QuranPage, QuranProgress, QuranReadingPosition,
    QuranRecording, QuranRecordingMutation, QuranRecordingQuery, QuranVerseRef,
    REVISION_PROTOCOL_VERSION, Reminder, ReminderImageAttachment, ReminderImageDataInput,
    ReminderList, ReminderQuery, ReplaceQuranRecordingRangeInput, Request, Response,
    ReviewRevisionCardInput, ReviewRevisionSessionCardInput, RevisionCard, RevisionCardQuery,
    RevisionDashboard, RevisionDashboardQuery, RevisionDeckSummary, RevisionScheduleResult,
    RevisionSession, RevisionSessionReviewResult, RevisionSessionRun, SaveCanvasInput,
    SaveCardTemplateInput, SaveHealthWaterInput, SaveNutritionFoodInput, SavePersonInput,
    SaveQuranBookmarkInput, SaveQuranReadingPositionInput, SaveQuranRecordingInput,
    SaveQuranRecordingReviewInput, SaveReminderInput, SaveReminderListInput,
    SaveRevisionSessionInput, ServiceSettings, SetRevisionSessionStatusInput,
    StartRevisionSessionInput, StartStandaloneQuranRecordingInput, UpdateReminderInput,
};
use std::path::PathBuf;
use thiserror::Error;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::UnixStream,
};

#[derive(Debug, Error)]
pub enum ClientError {
    #[error("IPC error: {0}")]
    Io(#[from] std::io::Error),
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("data service error ({code}): {message}")]
    Server { code: String, message: String },
    #[error("IPC response is {actual} bytes; limit is {limit} bytes")]
    ResponseTooLarge { actual: usize, limit: usize },
    #[error("unexpected data service response")]
    UnexpectedResponse,
    #[error(
        "data service protocol {actual} is older than required protocol {required}; restart data-service to load the updated binary"
    )]
    ProtocolTooOld { actual: u32, required: u32 },
}

#[derive(Clone)]
pub struct DataClient {
    socket_path: PathBuf,
    max_response_bytes: usize,
}

impl DataClient {
    pub fn new(socket_path: impl Into<PathBuf>, max_response_bytes: usize) -> Self {
        Self {
            socket_path: socket_path.into(),
            max_response_bytes,
        }
    }

    async fn request(&self, request: Request) -> Result<Response, ClientError> {
        let mut stream = UnixStream::connect(&self.socket_path).await?;
        let payload = serde_json::to_vec(&request)?;
        if payload.len() > self.max_response_bytes {
            return Err(ClientError::ResponseTooLarge {
                actual: payload.len(),
                limit: self.max_response_bytes,
            });
        }
        stream.write_u32(payload.len() as u32).await?;
        stream.write_all(&payload).await?;
        let response_len = stream.read_u32().await? as usize;
        if response_len > self.max_response_bytes {
            return Err(ClientError::ResponseTooLarge {
                actual: response_len,
                limit: self.max_response_bytes,
            });
        }
        let mut response = vec![0; response_len];
        stream.read_exact(&mut response).await?;
        match serde_json::from_slice(&response)? {
            Response::Error(error) => Err(ClientError::Server {
                code: error.code,
                message: error.message,
            }),
            response => Ok(response),
        }
    }

    pub async fn ping(&self) -> Result<(), ClientError> {
        match self.request(Request::Ping).await? {
            Response::Pong => Ok(()),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn settings(&self) -> Result<ServiceSettings, ClientError> {
        match self.request(Request::GetSettings).await? {
            Response::Settings(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn list_canvases(&self) -> Result<Vec<CanvasDocumentSummary>, ClientError> {
        match self.request(Request::ListCanvases).await? {
            Response::Canvases(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn list_notebooks(&self) -> Result<Vec<CanvasDocumentSummary>, ClientError> {
        self.require_protocol(NOTES_PROTOCOL_VERSION).await?;
        match self.request(Request::ListNotebooks).await? {
            Response::Notebooks(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn get_canvas(&self, id: String) -> Result<Option<CanvasDocument>, ClientError> {
        match self.request(Request::GetCanvas { id }).await? {
            Response::Canvas(value) => Ok(Some(value)),
            Response::NotFound => Ok(None),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn save_canvas(
        &self,
        input: SaveCanvasInput,
    ) -> Result<CanvasDocumentSummary, ClientError> {
        match self.request(Request::SaveCanvas { input }).await? {
            Response::CanvasSaved(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn delete_canvas(&self, id: String) -> Result<bool, ClientError> {
        match self.request(Request::DeleteCanvas { id }).await? {
            Response::Deleted => Ok(true),
            Response::NotFound => Ok(false),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn set_canvas_starred(
        &self,
        id: String,
        starred: bool,
    ) -> Result<Option<CanvasDocumentSummary>, ClientError> {
        match self
            .request(Request::SetCanvasStarred { id, starred })
            .await?
        {
            Response::CanvasSaved(value) => Ok(Some(value)),
            Response::NotFound => Ok(None),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn set_canvas_title(
        &self,
        id: String,
        title: String,
    ) -> Result<Option<CanvasDocumentSummary>, ClientError> {
        match self.request(Request::SetCanvasTitle { id, title }).await? {
            Response::CanvasSaved(value) => Ok(Some(value)),
            Response::NotFound => Ok(None),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn save_canvas_preview(
        &self,
        id: String,
        data_url: String,
    ) -> Result<bool, ClientError> {
        match self
            .request(Request::SaveCanvasPreview { id, data_url })
            .await?
        {
            Response::CanvasSaved(_) => Ok(true),
            Response::NotFound => Ok(false),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn seed_canvases(&self, inputs: Vec<SaveCanvasInput>) -> Result<bool, ClientError> {
        match self.request(Request::SeedCanvases { inputs }).await? {
            Response::Seeded(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn list_canvas_cards(&self) -> Result<Vec<CanvasCardProjection>, ClientError> {
        match self.request(Request::ListCanvasCards).await? {
            Response::CanvasCards(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn list_card_templates(&self) -> Result<Vec<CardTemplate>, ClientError> {
        self.require_protocol(CARD_TEMPLATE_PROTOCOL_VERSION)
            .await?;
        match self.request(Request::ListCardTemplates).await? {
            Response::CardTemplates(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn save_card_template(
        &self,
        input: SaveCardTemplateInput,
    ) -> Result<CardTemplate, ClientError> {
        self.require_protocol(CARD_TEMPLATE_PROTOCOL_VERSION)
            .await?;
        match self.request(Request::SaveCardTemplate { input }).await? {
            Response::CardTemplateSaved(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn delete_card_template(&self, id: String) -> Result<bool, ClientError> {
        self.require_protocol(CARD_TEMPLATE_PROTOCOL_VERSION)
            .await?;
        match self.request(Request::DeleteCardTemplate { id }).await? {
            Response::Deleted => Ok(true),
            Response::NotFound => Ok(false),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn reset_card_template(&self, id: String) -> Result<CardTemplate, ClientError> {
        self.require_protocol(CARD_TEMPLATE_PROTOCOL_VERSION)
            .await?;
        match self.request(Request::ResetCardTemplate { id }).await? {
            Response::CardTemplateSaved(value) => Ok(value),
            Response::NotFound => Err(ClientError::UnexpectedResponse),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn list_plugin_installations(&self) -> Result<Vec<PluginInstallation>, ClientError> {
        self.require_protocol(PLUGIN_PROTOCOL_VERSION).await?;
        match self.request(Request::ListPluginInstallations).await? {
            Response::PluginInstallations(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn set_plugin_installed(
        &self,
        plugin_id: String,
        installed: bool,
    ) -> Result<PluginInstallation, ClientError> {
        self.require_protocol(PLUGIN_PROTOCOL_VERSION).await?;
        match self
            .request(Request::SetPluginInstalled {
                plugin_id,
                installed,
            })
            .await?
        {
            Response::PluginInstallationSaved(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn get_plugin_preference(
        &self,
        plugin_id: String,
        key: String,
    ) -> Result<Option<PluginPreference>, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self
            .request(Request::GetPluginPreference { plugin_id, key })
            .await?
        {
            Response::PluginPreference(value) => Ok(Some(value)),
            Response::NotFound => Ok(None),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn set_plugin_preference(
        &self,
        plugin_id: String,
        key: String,
        value: serde_json::Value,
    ) -> Result<PluginPreference, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self
            .request(Request::SetPluginPreference {
                plugin_id,
                key,
                value,
            })
            .await?
        {
            Response::PluginPreference(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn list_book_entities(&self) -> Result<Vec<BookEntity>, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::ListBookEntities).await? {
            Response::BookEntities(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn list_quran_recordings(
        &self,
        query: QuranRecordingQuery,
    ) -> Result<Vec<QuranRecording>, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::ListQuranRecordings { query }).await? {
            Response::QuranRecordings(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn quran_page(
        &self,
        page_number: u16,
        refresh: bool,
    ) -> Result<QuranPage, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self
            .request(Request::GetQuranPage {
                page_number,
                refresh,
            })
            .await?
        {
            Response::QuranPage(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn quran_verse_page(&self, reference: QuranVerseRef) -> Result<u16, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self
            .request(Request::GetQuranVersePage { reference })
            .await?
        {
            Response::QuranVersePage(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn start_standalone_quran_recording(
        &self,
        input: StartStandaloneQuranRecordingInput,
    ) -> Result<QuranRecording, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self
            .request(Request::StartStandaloneQuranRecording { input })
            .await?
        {
            Response::QuranRecordingSaved(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn save_quran_recording_review(
        &self,
        input: SaveQuranRecordingReviewInput,
    ) -> Result<QuranRecording, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self
            .request(Request::SaveQuranRecordingReview { input })
            .await?
        {
            Response::QuranRecordingSaved(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn quran_progress(&self) -> Result<QuranProgress, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::GetQuranProgress).await? {
            Response::QuranProgress(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn save_quran_recording(
        &self,
        input: SaveQuranRecordingInput,
    ) -> Result<QuranRecording, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::SaveQuranRecording { input }).await? {
            Response::QuranRecordingSaved(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn replace_quran_recording_range(
        &self,
        input: ReplaceQuranRecordingRangeInput,
    ) -> Result<QuranRecordingMutation, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self
            .request(Request::ReplaceQuranRecordingRange { input })
            .await?
        {
            Response::QuranRecordingMutated(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn cache_quran_recording_segment_peaks(
        &self,
        input: CacheQuranRecordingSegmentPeaksInput,
    ) -> Result<bool, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self
            .request(Request::CacheQuranRecordingSegmentPeaks { input })
            .await?
        {
            Response::QuranRecordingSegmentPeaksCached(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn delete_quran_recording(&self, id: String) -> Result<Vec<String>, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::DeleteQuranRecording { id }).await? {
            Response::QuranRecordingDeleted(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn list_quran_bookmarks(&self) -> Result<Vec<QuranBookmark>, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::ListQuranBookmarks).await? {
            Response::QuranBookmarks(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn save_quran_bookmark(
        &self,
        input: SaveQuranBookmarkInput,
    ) -> Result<QuranBookmark, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::SaveQuranBookmark { input }).await? {
            Response::QuranBookmarkSaved(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn delete_quran_bookmark(&self, id: String) -> Result<bool, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::DeleteQuranBookmark { id }).await? {
            Response::Deleted => Ok(true),
            Response::NotFound => Ok(false),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn quran_reading_position(
        &self,
    ) -> Result<Option<QuranReadingPosition>, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::GetQuranReadingPosition).await? {
            Response::QuranReadingPosition(value) => Ok(Some(value)),
            Response::NotFound => Ok(None),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn save_quran_reading_position(
        &self,
        input: SaveQuranReadingPositionInput,
    ) -> Result<QuranReadingPosition, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self
            .request(Request::SaveQuranReadingPosition { input })
            .await?
        {
            Response::QuranReadingPosition(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn list_persons(
        &self,
        query: Option<String>,
    ) -> Result<Vec<PersonRecord>, ClientError> {
        self.require_protocol(NOTES_PROTOCOL_VERSION).await?;
        match self.request(Request::ListPersons { query }).await? {
            Response::Persons(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn save_person(&self, input: SavePersonInput) -> Result<PersonRecord, ClientError> {
        self.require_protocol(NOTES_PROTOCOL_VERSION).await?;
        match self.request(Request::SavePerson { input }).await? {
            Response::PersonSaved(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn list_media(&self, query: MediaListQuery) -> Result<MediaPage, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::ListMedia { query }).await? {
            Response::MediaPage(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn import_media_paths(
        &self,
        canvas_id: String,
        source_paths: Vec<String>,
    ) -> Result<MediaImportResult, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self
            .request(Request::ImportMediaPaths {
                canvas_id,
                source_paths,
            })
            .await?
        {
            Response::MediaImportResult(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn import_media_data(
        &self,
        input: MediaDataInput,
    ) -> Result<MediaImportResult, ClientError> {
        self.require_protocol(NOTES_PROTOCOL_VERSION).await?;
        match self.request(Request::ImportMediaData { input }).await? {
            Response::MediaImportResult(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn import_media_path_data(
        &self,
        input: MediaPathDataInput,
    ) -> Result<MediaImportResult, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::ImportMediaPathData { input }).await? {
            Response::MediaImportResult(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn list_reminder_lists(&self) -> Result<Vec<ReminderList>, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::ListReminderLists).await? {
            Response::ReminderLists(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn save_reminder_list(
        &self,
        input: SaveReminderListInput,
    ) -> Result<ReminderList, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::SaveReminderList { input }).await? {
            Response::ReminderListSaved(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn delete_reminder_list(&self, id: String) -> Result<bool, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::DeleteReminderList { id }).await? {
            Response::Deleted => Ok(true),
            Response::NotFound => Ok(false),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn list_reminders(&self, query: ReminderQuery) -> Result<Vec<Reminder>, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::ListReminders { query }).await? {
            Response::Reminders(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn save_reminder(&self, input: SaveReminderInput) -> Result<Reminder, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::SaveReminder { input }).await? {
            Response::ReminderSaved(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn create_reminder(
        &self,
        input: CreateReminderInput,
    ) -> Result<Reminder, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::CreateReminder { input }).await? {
            Response::ReminderSaved(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn update_reminder(
        &self,
        input: UpdateReminderInput,
    ) -> Result<Reminder, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::UpdateReminder { input }).await? {
            Response::ReminderSaved(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn reorder_reminders(
        &self,
        list_id: String,
        ordered_ids: Vec<String>,
    ) -> Result<Vec<Reminder>, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self
            .request(Request::ReorderReminders {
                list_id,
                ordered_ids,
            })
            .await?
        {
            Response::Reminders(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn set_reminder_completed(
        &self,
        id: String,
        completed: bool,
    ) -> Result<Option<Reminder>, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self
            .request(Request::SetReminderCompleted { id, completed })
            .await?
        {
            Response::ReminderSaved(value) => Ok(Some(value)),
            Response::NotFound => Ok(None),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn delete_reminder(&self, id: String) -> Result<Option<Reminder>, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::DeleteReminder { id }).await? {
            Response::ReminderSaved(value) => Ok(Some(value)),
            Response::NotFound => Ok(None),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn restore_reminder(&self, id: String) -> Result<Option<Reminder>, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::RestoreReminder { id }).await? {
            Response::ReminderSaved(value) => Ok(Some(value)),
            Response::NotFound => Ok(None),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn permanently_delete_reminder(&self, id: String) -> Result<bool, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self
            .request(Request::PermanentlyDeleteReminder { id })
            .await?
        {
            Response::Deleted => Ok(true),
            Response::NotFound => Ok(false),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn get_media_storage(&self, id: String) -> Result<Option<MediaStorage>, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::GetMediaStorage { id }).await? {
            Response::MediaStorage(value) => Ok(Some(value)),
            Response::NotFound => Ok(None),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn list_reminder_images(
        &self,
        reminder_ids: Vec<String>,
    ) -> Result<Vec<ReminderImageAttachment>, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self
            .request(Request::ListReminderImages { reminder_ids })
            .await?
        {
            Response::ReminderImages(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn import_reminder_image(
        &self,
        input: ReminderImageDataInput,
    ) -> Result<ReminderImageAttachment, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::ImportReminderImage { input }).await? {
            Response::ReminderImageSaved(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn delete_reminder_image(&self, id: String) -> Result<bool, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::DeleteReminderImage { id }).await? {
            Response::Deleted => Ok(true),
            Response::NotFound => Ok(false),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn get_media_entry(&self, id: String) -> Result<Option<MediaEntry>, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::GetMediaEntry { id }).await? {
            Response::MediaEntry(value) => Ok(Some(value)),
            Response::NotFound => Ok(None),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn delete_media(&self, id: String) -> Result<bool, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::DeleteMedia { id }).await? {
            Response::Deleted => Ok(true),
            Response::NotFound => Ok(false),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn list_revision_decks(&self) -> Result<Vec<RevisionDeckSummary>, ClientError> {
        self.require_protocol(REVISION_PROTOCOL_VERSION).await?;
        match self.request(Request::ListRevisionDecks).await? {
            Response::RevisionDecks(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn list_revision_cards(
        &self,
        query: RevisionCardQuery,
    ) -> Result<Vec<RevisionCard>, ClientError> {
        self.require_protocol(REVISION_PROTOCOL_VERSION).await?;
        match self.request(Request::ListRevisionCards { query }).await? {
            Response::RevisionCards(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn review_revision_card(
        &self,
        input: ReviewRevisionCardInput,
    ) -> Result<RevisionScheduleResult, ClientError> {
        self.require_protocol(REVISION_PROTOCOL_VERSION).await?;
        match self.request(Request::ReviewRevisionCard { input }).await? {
            Response::RevisionScheduled(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn review_revision_session_card(
        &self,
        input: ReviewRevisionSessionCardInput,
    ) -> Result<RevisionSessionReviewResult, ClientError> {
        self.require_protocol(REVISION_PROTOCOL_VERSION).await?;
        match self
            .request(Request::ReviewRevisionSessionCard { input })
            .await?
        {
            Response::RevisionSessionReviewed(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn revision_dashboard(
        &self,
        query: RevisionDashboardQuery,
    ) -> Result<RevisionDashboard, ClientError> {
        self.require_protocol(REVISION_PROTOCOL_VERSION).await?;
        match self
            .request(Request::GetRevisionDashboard { query })
            .await?
        {
            Response::RevisionDashboard(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn start_revision_session(
        &self,
        input: StartRevisionSessionInput,
    ) -> Result<RevisionSessionRun, ClientError> {
        self.require_protocol(REVISION_PROTOCOL_VERSION).await?;
        match self
            .request(Request::StartRevisionSession { input })
            .await?
        {
            Response::RevisionSessionRun(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn revision_session_run(
        &self,
        id: String,
    ) -> Result<RevisionSessionRun, ClientError> {
        self.require_protocol(REVISION_PROTOCOL_VERSION).await?;
        match self.request(Request::GetRevisionSessionRun { id }).await? {
            Response::RevisionSessionRun(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn active_standalone_revision_session(
        &self,
    ) -> Result<Option<RevisionSession>, ClientError> {
        self.require_protocol(REVISION_PROTOCOL_VERSION).await?;
        match self
            .request(Request::GetActiveStandaloneRevisionSession)
            .await?
        {
            Response::RevisionSession(value) => Ok(Some(value)),
            Response::NotFound => Ok(None),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn create_quran_capture_request(
        &self,
        input: CreateQuranCaptureRequestInput,
    ) -> Result<QuranCaptureRequest, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self
            .request(Request::CreateQuranCaptureRequest { input })
            .await?
        {
            Response::QuranCaptureRequest(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn quran_capture_request(
        &self,
        id: String,
    ) -> Result<Option<QuranCaptureRequest>, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::GetQuranCaptureRequest { id }).await? {
            Response::QuranCaptureRequest(value) => Ok(Some(value)),
            Response::NotFound => Ok(None),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn set_quran_capture_request_status(
        &self,
        id: String,
        status: QuranCaptureRequestStatus,
    ) -> Result<QuranCaptureRequest, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self
            .request(Request::SetQuranCaptureRequestStatus { id, status })
            .await?
        {
            Response::QuranCaptureRequest(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn register_app_activity_host(
        &self,
        target: AppActivityTarget,
        instance_id: String,
    ) -> Result<bool, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self
            .request(Request::RegisterAppActivityHost {
                target,
                instance_id,
            })
            .await?
        {
            Response::AppActivityPublished(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn publish_app_activity(&self, activity: AppActivity) -> Result<bool, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self
            .request(Request::PublishAppActivity { activity })
            .await?
        {
            Response::AppActivityPublished(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn claim_app_activities(
        &self,
        target: AppActivityTarget,
        instance_id: String,
    ) -> Result<Vec<AppActivityEnvelope>, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self
            .request(Request::ClaimAppActivities {
                target,
                instance_id,
            })
            .await?
        {
            Response::AppActivities(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn ack_app_activity(
        &self,
        id: String,
        instance_id: String,
        succeeded: bool,
    ) -> Result<bool, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self
            .request(Request::AckAppActivity {
                id,
                instance_id,
                succeeded,
            })
            .await?
        {
            Response::AppActivityAcknowledged(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    async fn require_protocol(&self, required: u32) -> Result<(), ClientError> {
        let actual = self.settings().await?.protocol_version;
        if actual < required {
            return Err(ClientError::ProtocolTooOld { actual, required });
        }
        Ok(())
    }

    pub async fn health_water_day(
        &self,
        local_date: String,
    ) -> Result<HealthWaterDay, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self
            .request(Request::GetHealthWaterDay { local_date })
            .await?
        {
            Response::HealthWaterDay(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn save_health_water(
        &self,
        input: SaveHealthWaterInput,
    ) -> Result<HealthWaterDay, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::SaveHealthWater { input }).await? {
            Response::HealthWaterDay(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn list_nutrition_food(
        &self,
        local_date: String,
    ) -> Result<Vec<NutritionFoodEntry>, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self
            .request(Request::ListNutritionFood { local_date })
            .await?
        {
            Response::NutritionFoodEntries(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn save_nutrition_food(
        &self,
        input: SaveNutritionFoodInput,
    ) -> Result<NutritionFoodEntry, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::SaveNutritionFood { input }).await? {
            Response::NutritionFoodSaved(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn revision_session(
        &self,
        id: String,
    ) -> Result<Option<RevisionSession>, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::GetRevisionSession { id }).await? {
            Response::RevisionSession(value) => Ok(Some(value)),
            Response::NotFound => Ok(None),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn save_revision_session(
        &self,
        input: SaveRevisionSessionInput,
    ) -> Result<RevisionSession, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self.request(Request::SaveRevisionSession { input }).await? {
            Response::RevisionSession(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn initialize_revision_session(
        &self,
        input: InitializeRevisionSessionInput,
    ) -> Result<RevisionSession, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self
            .request(Request::InitializeRevisionSession { input })
            .await?
        {
            Response::RevisionSession(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    pub async fn set_revision_session_status(
        &self,
        input: SetRevisionSessionStatusInput,
    ) -> Result<RevisionSession, ClientError> {
        self.require_protocol(DATA_SERVICE_PROTOCOL_VERSION).await?;
        match self
            .request(Request::SetRevisionSessionStatus { input })
            .await?
        {
            Response::RevisionSession(value) => Ok(value),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }
}
