use app_core::{
    MediaDataInput, MediaEntry, MediaImportFailure, MediaImportResult, MediaKind,
    MediaPathDataInput, MediaStorage, ReminderImageAttachment, ReminderImageDataInput,
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use database::{Database, NewMediaEntry, NewReminderImage};
use image::GenericImageView;
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    path::{Component, Path, PathBuf},
    sync::Arc,
};
use thiserror::Error;
use tokio::{
    fs,
    io::{AsyncReadExt, AsyncWriteExt},
    process::Command,
};
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum MediaError {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Database(#[from] database::DatabaseError),
    #[error("canvas {0} does not exist")]
    CanvasNotFound(String),
    #[error("reminder {0} does not exist")]
    ReminderNotFound(String),
    #[error("media entry {0} does not exist")]
    NotFound(String),
    #[error("media storage key is invalid")]
    InvalidStorageKey,
    #[error("media data is not a valid base64 data URL")]
    InvalidDataUrl,
}

pub struct MediaService {
    root: PathBuf,
    database: Arc<Database>,
}

enum ImportedMedia {
    Imported(MediaEntry),
    Duplicate(MediaEntry),
}

impl MediaService {
    pub async fn open(root: PathBuf, database: Arc<Database>) -> Result<Self, MediaError> {
        fs::create_dir_all(root.join("blobs")).await?;
        fs::create_dir_all(root.join("thumbnails")).await?;
        fs::create_dir_all(root.join("proxies")).await?;
        fs::create_dir_all(root.join(".incoming")).await?;
        fs::create_dir_all(root.join(".trash")).await?;
        let service = Self { root, database };
        service.reconcile().await?;
        Ok(service)
    }

    pub async fn import_paths(
        &self,
        canvas_id: &str,
        source_paths: Vec<String>,
    ) -> Result<MediaImportResult, MediaError> {
        if !self.database.canvas_exists(canvas_id).await? {
            return Err(MediaError::CanvasNotFound(canvas_id.to_owned()));
        }
        let mut result = MediaImportResult {
            imported: Vec::new(),
            duplicates: Vec::new(),
            failures: Vec::new(),
        };
        for source in source_paths {
            let path = PathBuf::from(&source);
            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("attachment")
                .to_owned();
            match self.import_path(canvas_id, &path, None, None).await {
                Ok(ImportedMedia::Imported(entry)) => result.imported.push(entry),
                Ok(ImportedMedia::Duplicate(entry)) => result.duplicates.push(entry),
                Err(error) => result.failures.push(MediaImportFailure {
                    name,
                    message: error.to_string(),
                }),
            }
        }
        Ok(result)
    }

    pub async fn import_data(
        &self,
        input: MediaDataInput,
    ) -> Result<MediaImportResult, MediaError> {
        if !self.database.canvas_exists(&input.canvas_id).await? {
            return Err(MediaError::CanvasNotFound(input.canvas_id));
        }
        let bytes = decode_data_url(&input.data_url, &input.mime_type)?;
        let temporary_path = self
            .root
            .join(".incoming")
            .join(format!("data-{}", Uuid::now_v7()));
        fs::write(&temporary_path, bytes).await?;
        let original_name = if input.original_name.trim().is_empty() {
            "attachment".to_owned()
        } else {
            input.original_name
        };
        let imported = self
            .import_path(
                &input.canvas_id,
                &temporary_path,
                Some(original_name.clone()),
                Some(&input.mime_type),
            )
            .await;
        fs::remove_file(&temporary_path).await.ok();
        let mut result = MediaImportResult {
            imported: Vec::new(),
            duplicates: Vec::new(),
            failures: Vec::new(),
        };
        match imported {
            Ok(ImportedMedia::Imported(entry)) => result.imported.push(entry),
            Ok(ImportedMedia::Duplicate(entry)) => result.duplicates.push(entry),
            Err(error) => result.failures.push(MediaImportFailure {
                name: original_name,
                message: error.to_string(),
            }),
        }
        Ok(result)
    }

    pub async fn import_reminder_image(
        &self,
        input: ReminderImageDataInput,
    ) -> Result<ReminderImageAttachment, MediaError> {
        if !self.database.reminder_exists(&input.reminder_id).await? {
            return Err(MediaError::ReminderNotFound(input.reminder_id));
        }
        if !input.mime_type.starts_with("image/") || !valid_mime_override(&input.mime_type) {
            return Err(MediaError::InvalidDataUrl);
        }
        let bytes = decode_data_url(&input.data_url, &input.mime_type)?;
        let content_hash = hex::encode(Sha256::digest(&bytes));
        if let Some(existing) = self
            .database
            .find_reminder_image_by_hash(&input.reminder_id, &content_hash)
            .await?
        {
            return Ok(existing);
        }

        let prefix = &content_hash[..2];
        let storage_key = format!("blobs/{prefix}/{content_hash}");
        let final_path = self.root.join(&storage_key);
        fs::create_dir_all(final_path.parent().expect("blob has parent")).await?;
        let created_blob = if fs::try_exists(&final_path).await? {
            false
        } else {
            fs::write(&final_path, &bytes).await?;
            true
        };
        let (thumbnail_key, width, height) = self
            .create_thumbnail(&final_path, prefix, &content_hash)
            .await;
        let original_name = if input.original_name.trim().is_empty() {
            "pasted-image".to_owned()
        } else {
            input.original_name
        };
        let result = self
            .database
            .insert_reminder_image(NewReminderImage {
                id: Uuid::now_v7().to_string(),
                reminder_id: input.reminder_id,
                original_name,
                mime_type: input.mime_type,
                size_bytes: bytes.len() as i64,
                content_hash,
                storage_key: storage_key.clone(),
                thumbnail_key: thumbnail_key.clone(),
                width,
                height,
            })
            .await;
        match result {
            Ok(entry) => Ok(entry),
            Err(error) => {
                if created_blob
                    && self
                        .database
                        .media_storage_ref_count(&storage_key)
                        .await
                        .unwrap_or(0)
                        == 0
                {
                    fs::remove_file(final_path).await.ok();
                    if let Some(key) = thumbnail_key {
                        fs::remove_file(self.root.join(key)).await.ok();
                    }
                }
                Err(error.into())
            }
        }
    }

    pub async fn import_path_data(
        &self,
        input: MediaPathDataInput,
    ) -> Result<MediaImportResult, MediaError> {
        if !self.database.canvas_exists(&input.canvas_id).await? {
            return Err(MediaError::CanvasNotFound(input.canvas_id));
        }
        let path = PathBuf::from(&input.source_path);
        let name = if input.original_name.trim().is_empty() {
            path.file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("attachment")
                .to_owned()
        } else {
            input.original_name
        };
        let mut result = MediaImportResult {
            imported: Vec::new(),
            duplicates: Vec::new(),
            failures: Vec::new(),
        };
        if !valid_mime_override(&input.mime_type) {
            result.failures.push(MediaImportFailure {
                name,
                message: "media MIME type is invalid".into(),
            });
            return Ok(result);
        }
        match self
            .import_path(
                &input.canvas_id,
                &path,
                Some(name.clone()),
                Some(&input.mime_type),
            )
            .await
        {
            Ok(ImportedMedia::Imported(entry)) => result.imported.push(entry),
            Ok(ImportedMedia::Duplicate(entry)) => result.duplicates.push(entry),
            Err(error) => result.failures.push(MediaImportFailure {
                name,
                message: error.to_string(),
            }),
        }
        Ok(result)
    }

    async fn import_path(
        &self,
        canvas_id: &str,
        source: &Path,
        original_name: Option<String>,
        mime_override: Option<&str>,
    ) -> Result<ImportedMedia, MediaError> {
        let metadata = fs::metadata(source).await?;
        if !metadata.is_file() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "only regular files can be imported",
            )
            .into());
        }
        let original_name = original_name.unwrap_or_else(|| {
            source
                .file_name()
                .and_then(|value| value.to_str())
                .filter(|value| !value.trim().is_empty())
                .unwrap_or("attachment")
                .to_owned()
        });
        let temporary_path = self.root.join(".incoming").join(Uuid::now_v7().to_string());
        let mut reader = fs::File::open(source).await?;
        let mut writer = fs::File::create(&temporary_path).await?;
        let mut hasher = Sha256::new();
        let mut sniff = Vec::with_capacity(8_192);
        let mut size_bytes = 0_i64;
        let mut buffer = vec![0_u8; 256 * 1024];
        loop {
            let read = reader.read(&mut buffer).await?;
            if read == 0 {
                break;
            }
            if sniff.len() < 8_192 {
                let remaining = 8_192 - sniff.len();
                sniff.extend_from_slice(&buffer[..read.min(remaining)]);
            }
            hasher.update(&buffer[..read]);
            writer.write_all(&buffer[..read]).await?;
            size_bytes += read as i64;
        }
        writer.flush().await?;
        drop(writer);

        let content_hash = hex::encode(hasher.finalize());
        if let Some(existing) = self
            .database
            .find_media_by_hash(canvas_id, &content_hash)
            .await?
        {
            fs::remove_file(&temporary_path).await.ok();
            return Ok(ImportedMedia::Duplicate(existing));
        }

        let mime_type = mime_override
            .filter(|value| valid_mime_override(value))
            .map(str::to_owned)
            .unwrap_or_else(|| detect_mime(&sniff, source));
        let kind = classify_media(&mime_type, source);
        let prefix = &content_hash[..2];
        let storage_key = format!("blobs/{prefix}/{content_hash}");
        let final_path = self.root.join(&storage_key);
        fs::create_dir_all(final_path.parent().expect("blob has parent")).await?;
        let created_blob = if fs::try_exists(&final_path).await? {
            fs::remove_file(&temporary_path).await?;
            false
        } else {
            fs::rename(&temporary_path, &final_path).await?;
            true
        };

        let (thumbnail_key, width, height) = if kind == MediaKind::Image {
            self.create_thumbnail(&final_path, prefix, &content_hash)
                .await
        } else {
            (None, None, None)
        };
        let proxy_key = if kind == MediaKind::Video {
            self.create_video_proxy(&final_path, prefix, &content_hash)
                .await
        } else {
            None
        };
        let id = Uuid::now_v7().to_string();
        let inserted = self
            .database
            .insert_media(NewMediaEntry {
                id,
                canvas_id: canvas_id.to_owned(),
                original_name,
                mime_type,
                kind,
                size_bytes,
                content_hash,
                storage_key: storage_key.clone(),
                thumbnail_key: thumbnail_key.clone(),
                proxy_key: proxy_key.clone(),
                width,
                height,
            })
            .await;
        match inserted {
            Ok(entry) => Ok(ImportedMedia::Imported(entry)),
            Err(error) => {
                if created_blob
                    && self
                        .database
                        .media_storage_ref_count(&storage_key)
                        .await
                        .unwrap_or(0)
                        == 0
                {
                    fs::remove_file(final_path).await.ok();
                    if let Some(key) = thumbnail_key {
                        fs::remove_file(self.root.join(key)).await.ok();
                    }
                    if let Some(key) = proxy_key {
                        fs::remove_file(self.root.join(key)).await.ok();
                    }
                }
                Err(error.into())
            }
        }
    }

    async fn create_video_proxy(&self, source: &Path, prefix: &str, hash: &str) -> Option<String> {
        if !cfg!(target_os = "macos") {
            return None;
        }
        let proxy_key = format!("proxies/{prefix}/{hash}.m4v");
        let destination = self.root.join(&proxy_key);
        fs::create_dir_all(destination.parent().expect("proxy has parent"))
            .await
            .ok()?;
        let status = Command::new("/usr/bin/avconvert")
            .arg("--source")
            .arg(source)
            .arg("--preset")
            .arg("Preset640x480")
            .arg("--output")
            .arg(&destination)
            .arg("--replace")
            .arg("--disableMetadataFilter")
            .status()
            .await
            .ok()?;
        if status.success() {
            Some(proxy_key)
        } else {
            fs::remove_file(destination).await.ok();
            None
        }
    }

    async fn create_thumbnail(
        &self,
        source: &Path,
        prefix: &str,
        hash: &str,
    ) -> (Option<String>, Option<i64>, Option<i64>) {
        let thumbnail_key = format!("thumbnails/{prefix}/{hash}.webp");
        let destination = self.root.join(&thumbnail_key);
        if fs::create_dir_all(destination.parent().expect("thumbnail has parent"))
            .await
            .is_err()
        {
            return (None, None, None);
        }
        let source = source.to_owned();
        let result =
            tokio::task::spawn_blocking(move || -> Result<(u32, u32), image::ImageError> {
                let image = image::ImageReader::open(source)?
                    .with_guessed_format()?
                    .decode()?;
                let dimensions = image.dimensions();
                image
                    .thumbnail(640, 480)
                    .save_with_format(destination, image::ImageFormat::WebP)?;
                Ok(dimensions)
            })
            .await;
        match result {
            Ok(Ok((width, height))) => {
                (Some(thumbnail_key), Some(width as i64), Some(height as i64))
            }
            _ => (None, None, None),
        }
    }

    pub async fn resolve(
        &self,
        id: &str,
        thumbnail: bool,
    ) -> Result<(MediaStorage, PathBuf), MediaError> {
        let storage = self
            .database
            .get_media_storage(id)
            .await?
            .ok_or_else(|| MediaError::NotFound(id.to_owned()))?;
        let key = if thumbnail {
            storage
                .thumbnail_key
                .as_deref()
                .unwrap_or(&storage.storage_key)
        } else {
            &storage.storage_key
        };
        let path = self.safe_path(key)?;
        Ok((storage, path))
    }

    pub async fn delete(&self, id: &str) -> Result<bool, MediaError> {
        let Some(deleted) = self.database.delete_media(id).await? else {
            return Ok(false);
        };
        if !deleted.storage_still_referenced {
            self.remove_storage(&deleted.storage).await;
        }
        Ok(true)
    }

    pub async fn delete_reminder_image(&self, id: &str) -> Result<bool, MediaError> {
        if self.database.get_reminder_image(id).await?.is_none() {
            return Ok(false);
        }
        self.delete(id).await
    }

    pub async fn delete_canvas(&self, canvas_id: &str) -> Result<bool, MediaError> {
        let storage = self.database.media_storage_for_canvas(canvas_id).await?;
        let deleted = self.database.delete_canvas(canvas_id).await?;
        if !deleted {
            return Ok(false);
        }
        let mut seen = HashSet::new();
        for item in storage {
            if seen.insert(item.storage_key.clone())
                && self
                    .database
                    .media_storage_ref_count(&item.storage_key)
                    .await?
                    == 0
            {
                self.remove_storage(&item).await;
            }
        }
        Ok(true)
    }

    pub async fn delete_reminder(&self, reminder_id: &str) -> Result<bool, MediaError> {
        let storage = self
            .database
            .media_storage_for_reminder(reminder_id)
            .await?;
        let deleted = self
            .database
            .permanently_delete_reminder(reminder_id)
            .await?;
        if !deleted {
            return Ok(false);
        }
        let mut seen = HashSet::new();
        for item in storage {
            if seen.insert(item.storage_key.clone())
                && self
                    .database
                    .media_storage_ref_count(&item.storage_key)
                    .await?
                    == 0
            {
                self.remove_storage(&item).await;
            }
        }
        Ok(true)
    }

    async fn remove_storage(&self, storage: &MediaStorage) {
        fs::remove_file(self.root.join(&storage.storage_key))
            .await
            .ok();
        if let Some(key) = &storage.thumbnail_key {
            fs::remove_file(self.root.join(key)).await.ok();
        }
        if let Some(key) = &storage.proxy_key {
            fs::remove_file(self.root.join(key)).await.ok();
        }
    }

    fn safe_path(&self, key: &str) -> Result<PathBuf, MediaError> {
        let relative = Path::new(key);
        if relative.is_absolute()
            || relative
                .components()
                .any(|component| !matches!(component, Component::Normal(_)))
        {
            return Err(MediaError::InvalidStorageKey);
        }
        Ok(self.root.join(relative))
    }

    async fn reconcile(&self) -> Result<(), MediaError> {
        clear_directory(&self.root.join(".incoming")).await?;
        clear_directory(&self.root.join(".trash")).await?;
        let storage = self.database.all_media_storage().await?;
        let valid_blobs: HashSet<String> = storage
            .iter()
            .map(|item| item.storage_key.clone())
            .collect();
        let valid_thumbnails: HashSet<String> = storage
            .iter()
            .filter_map(|item| item.thumbnail_key.clone())
            .collect();
        let valid_proxies: HashSet<String> = storage
            .into_iter()
            .filter_map(|item| item.proxy_key)
            .collect();
        let root = self.root.clone();
        tokio::task::spawn_blocking(move || {
            remove_orphans(&root, "blobs", &valid_blobs);
            remove_orphans(&root, "thumbnails", &valid_thumbnails);
            remove_orphans(&root, "proxies", &valid_proxies);
        })
        .await
        .ok();
        Ok(())
    }
}

fn valid_mime_override(value: &str) -> bool {
    let value = value.trim();
    !value.is_empty()
        && value.len() <= 127
        && value.contains('/')
        && value.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'/' | b'-' | b'+' | b'.' | b';' | b'=')
        })
}

async fn clear_directory(path: &Path) -> Result<(), std::io::Error> {
    if fs::try_exists(path).await? {
        fs::remove_dir_all(path).await?;
    }
    fs::create_dir_all(path).await
}

fn remove_orphans(root: &Path, directory: &str, valid: &HashSet<String>) {
    let base = root.join(directory);
    let Ok(prefixes) = std::fs::read_dir(&base) else {
        return;
    };
    for prefix in prefixes.flatten() {
        if !prefix.path().is_dir() {
            continue;
        }
        if let Ok(files) = std::fs::read_dir(prefix.path()) {
            for file in files.flatten() {
                let Ok(relative) = file
                    .path()
                    .strip_prefix(root)
                    .map(|value| value.to_string_lossy().replace('\\', "/"))
                else {
                    continue;
                };
                if !valid.contains(&relative) {
                    std::fs::remove_file(file.path()).ok();
                }
            }
        }
    }
}

fn detect_mime(bytes: &[u8], path: &Path) -> String {
    if let Some(kind) = infer::get(bytes) {
        return kind.mime_type().to_owned();
    }
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "pdf" => "application/pdf",
        "svg" => "image/svg+xml",
        "md" | "txt" => "text/plain",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt" => "application/vnd.ms-powerpoint",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "mov" => "video/quicktime",
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        _ => "application/octet-stream",
    }
    .to_owned()
}

fn classify_media(mime: &str, path: &Path) -> MediaKind {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if mime.starts_with("image/")
        || matches!(
            extension.as_str(),
            "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp" | "tif" | "tiff" | "avif"
        )
    {
        return MediaKind::Image;
    }
    if mime.starts_with("video/") || matches!(extension.as_str(), "mov" | "mp4" | "m4v" | "webm") {
        return MediaKind::Video;
    }
    if mime.starts_with("audio/")
        || matches!(extension.as_str(), "mp3" | "m4a" | "wav" | "ogg" | "flac")
    {
        return MediaKind::Audio;
    }
    if mime == "application/pdf" || extension == "pdf" {
        return MediaKind::Pdf;
    }
    if mime.starts_with("text/")
        || matches!(
            extension.as_str(),
            "doc" | "docx" | "odt" | "rtf" | "txt" | "md" | "xls" | "xlsx" | "ppt" | "pptx"
        )
    {
        MediaKind::Document
    } else {
        MediaKind::File
    }
}

fn decode_data_url(data_url: &str, expected_mime: &str) -> Result<Vec<u8>, MediaError> {
    let (header, encoded) = data_url.split_once(',').ok_or(MediaError::InvalidDataUrl)?;
    let declared_mime = header
        .strip_prefix("data:")
        .and_then(|value| value.strip_suffix(";base64"))
        .ok_or(MediaError::InvalidDataUrl)?;
    if declared_mime != expected_mime || !declared_mime.starts_with("image/") {
        return Err(MediaError::InvalidDataUrl);
    }
    BASE64
        .decode(encoded.as_bytes())
        .map_err(|_| MediaError::InvalidDataUrl)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_video_extensions_when_content_sniffing_is_inconclusive() {
        assert_eq!(
            classify_media("application/octet-stream", Path::new("clip.mov")),
            MediaKind::Video
        );
        assert_eq!(detect_mime(&[], Path::new("clip.m4v")), "video/mp4");
    }

    #[test]
    fn recognizes_audio_media_for_the_shared_library() {
        assert_eq!(
            classify_media("audio/mpeg", Path::new("interview.mp3")),
            MediaKind::Audio
        );
        assert_eq!(
            classify_media("application/octet-stream", Path::new("notes.m4a")),
            MediaKind::Audio
        );
    }

    #[test]
    fn accepts_codec_qualified_recording_mime_types() {
        assert!(valid_mime_override("audio/webm;codecs=opus"));
        assert!(valid_mime_override("audio/mp4;codecs=mp4a.40.2"));
        assert!(!valid_mime_override("audio/webm\r\nx-forged-header=value"));
    }

    #[test]
    fn validates_mime_typed_image_data_urls() {
        assert_eq!(
            decode_data_url("data:image/png;base64,aGVsbG8=", "image/png").unwrap(),
            b"hello",
        );
        assert!(matches!(
            decode_data_url("data:text/plain;base64,aGVsbG8=", "text/plain"),
            Err(MediaError::InvalidDataUrl),
        ));
        assert!(matches!(
            decode_data_url("data:image/png;base64,aGVsbG8=", "image/jpeg"),
            Err(MediaError::InvalidDataUrl),
        ));
    }
}
