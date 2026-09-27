use app_core::{QuranPage, QuranPageVerse, QuranPageWord, ServiceSettings};
use database::Database;
use serde_json::Value;
use std::{
    sync::Arc,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use thiserror::Error;
use tokio::sync::Mutex;

#[derive(Debug, Error)]
pub enum QuranContentError {
    #[error("Quran Foundation credentials are unavailable; set QF_CLIENT_ID and QF_CLIENT_SECRET")]
    MissingCredentials,
    #[error("Quran Foundation request failed: {0}")]
    Request(String),
    #[error("Quran Foundation returned an invalid page")]
    InvalidPage,
    #[error(transparent)]
    Database(#[from] database::DatabaseError),
}

struct AccessToken {
    value: String,
    expires_at: Instant,
}

pub struct QuranContentService {
    database: Arc<Database>,
    client: reqwest::Client,
    environment: String,
    mushaf_id: u16,
    client_id: Option<String>,
    client_secret: Option<String>,
    token: Mutex<Option<AccessToken>>,
}

impl QuranContentService {
    pub fn new(database: Arc<Database>, settings: &ServiceSettings) -> Self {
        let environment = std::env::var("QF_ENV")
            .ok()
            .filter(|value| matches!(value.as_str(), "prelive" | "production"))
            .unwrap_or_else(|| {
                if settings.quran_environment == "production" {
                    "production".into()
                } else {
                    "prelive".into()
                }
            });
        Self {
            database,
            client: reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(5))
                .timeout(Duration::from_secs(15))
                .build()
                .expect("Quran HTTP client builds"),
            environment,
            mushaf_id: settings.quran_mushaf_id.max(1),
            client_id: std::env::var("QF_CLIENT_ID")
                .ok()
                .filter(|value| !value.is_empty()),
            client_secret: std::env::var("QF_CLIENT_SECRET")
                .ok()
                .filter(|value| !value.is_empty()),
            token: Mutex::new(None),
        }
    }

    pub async fn page(
        &self,
        page_number: u16,
        refresh: bool,
    ) -> Result<QuranPage, QuranContentError> {
        if !(1..=604).contains(&page_number) {
            return Err(QuranContentError::InvalidPage);
        }
        let cached = self
            .database
            .cached_quran_page(&self.environment, self.mushaf_id, page_number)
            .await?;
        if !refresh {
            if let Some(page) = cached
                .clone()
                .filter(|page| now_millis() - page.cached_at < 7 * 24 * 60 * 60 * 1_000)
            {
                return Ok(page);
            }
        }
        match self.fetch_page(page_number).await {
            Ok(page) => {
                self.database.cache_quran_page(&page).await?;
                Ok(page)
            }
            Err(error) => cached
                .map(|mut page| {
                    page.stale = true;
                    page
                })
                .ok_or(error),
        }
    }

    pub async fn verse_page(
        &self,
        reference: app_core::QuranVerseRef,
    ) -> Result<u16, QuranContentError> {
        if !reference.is_valid() {
            return Err(QuranContentError::InvalidPage);
        }
        if let Some(page) = self
            .database
            .cached_quran_verse_page(&self.environment, self.mushaf_id, &reference.key())
            .await?
        {
            return Ok(page);
        }
        let mut token = self.access_token(false).await?;
        let mut response = self.verse_request(&reference, &token).await?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            token = self.access_token(true).await?;
            response = self.verse_request(&reference, &token).await?;
        }
        let mut attempt = 0u8;
        while (response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS
            || response.status().is_server_error())
            && attempt < 2
        {
            attempt += 1;
            tokio::time::sleep(Duration::from_millis(200 * u64::from(attempt))).await;
            response = self.verse_request(&reference, &token).await?;
        }
        if !response.status().is_success() {
            return Err(QuranContentError::Request(format!(
                "HTTP {}",
                response.status().as_u16()
            )));
        }
        let value: Value = response
            .json()
            .await
            .map_err(|error| QuranContentError::Request(error.to_string()))?;
        value
            .get("verse")
            .and_then(|verse| verse.get("page_number"))
            .and_then(Value::as_u64)
            .and_then(|page| u16::try_from(page).ok())
            .filter(|page| (1..=604).contains(page))
            .ok_or(QuranContentError::InvalidPage)
    }

    async fn fetch_page(&self, page_number: u16) -> Result<QuranPage, QuranContentError> {
        let mut token = self.access_token(false).await?;
        let mut response = self.page_request(page_number, &token).await?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            token = self.access_token(true).await?;
            response = self.page_request(page_number, &token).await?;
        }
        let mut attempt = 0u8;
        while (response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS
            || response.status().is_server_error())
            && attempt < 2
        {
            attempt += 1;
            tokio::time::sleep(Duration::from_millis(200 * u64::from(attempt))).await;
            response = self.page_request(page_number, &token).await?;
        }
        if !response.status().is_success() {
            return Err(QuranContentError::Request(format!(
                "HTTP {}",
                response.status().as_u16()
            )));
        }
        let value: Value = response
            .json()
            .await
            .map_err(|error| QuranContentError::Request(error.to_string()))?;
        normalize_page(value, self.mushaf_id, page_number, &self.environment)
    }

    async fn page_request(
        &self,
        page_number: u16,
        token: &str,
    ) -> Result<reqwest::Response, QuranContentError> {
        let client_id = self
            .client_id
            .as_deref()
            .ok_or(QuranContentError::MissingCredentials)?;
        self.client
            .get(format!(
                "{}/content/api/v4/verses/by_page/{page_number}",
                self.api_base()
            ))
            .query(&[
                ("mushaf", self.mushaf_id.to_string()),
                ("words", "true".into()),
                (
                    "word_fields",
                    "code_v2,text_qpc_hafs,line_number,page_number".into(),
                ),
                ("per_page", "50".into()),
            ])
            .header("x-auth-token", token)
            .header("x-client-id", client_id)
            .send()
            .await
            .map_err(|error| QuranContentError::Request(error.to_string()))
    }

    async fn verse_request(
        &self,
        reference: &app_core::QuranVerseRef,
        token: &str,
    ) -> Result<reqwest::Response, QuranContentError> {
        let client_id = self
            .client_id
            .as_deref()
            .ok_or(QuranContentError::MissingCredentials)?;
        self.client
            .get(format!(
                "{}/content/api/v4/verses/by_key/{}",
                self.api_base(),
                reference.key()
            ))
            .query(&[
                ("mushaf", self.mushaf_id.to_string()),
                ("fields", "page_number".into()),
            ])
            .header("x-auth-token", token)
            .header("x-client-id", client_id)
            .send()
            .await
            .map_err(|error| QuranContentError::Request(error.to_string()))
    }

    async fn access_token(&self, force_refresh: bool) -> Result<String, QuranContentError> {
        let mut guard = self.token.lock().await;
        if !force_refresh {
            if let Some(token) = guard
                .as_ref()
                .filter(|token| token.expires_at > Instant::now())
            {
                return Ok(token.value.clone());
            }
        }
        let client_id = self
            .client_id
            .as_deref()
            .ok_or(QuranContentError::MissingCredentials)?;
        let secret = self
            .client_secret
            .as_deref()
            .ok_or(QuranContentError::MissingCredentials)?;
        let response = self
            .client
            .post(format!("{}/oauth2/token", self.auth_base()))
            .basic_auth(client_id, Some(secret))
            .form(&[("grant_type", "client_credentials"), ("scope", "content")])
            .send()
            .await
            .map_err(|error| QuranContentError::Request(error.to_string()))?;
        if !response.status().is_success() {
            return Err(QuranContentError::Request(format!(
                "authentication HTTP {}",
                response.status().as_u16()
            )));
        }
        let value: Value = response
            .json()
            .await
            .map_err(|error| QuranContentError::Request(error.to_string()))?;
        let access_token = value
            .get("access_token")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                QuranContentError::Request("authentication response omitted access_token".into())
            })?;
        let expires_in = value
            .get("expires_in")
            .and_then(Value::as_u64)
            .unwrap_or(3600);
        *guard = Some(AccessToken {
            value: access_token.to_owned(),
            expires_at: Instant::now() + Duration::from_secs(expires_in.saturating_sub(30).max(1)),
        });
        Ok(access_token.to_owned())
    }

    fn api_base(&self) -> &'static str {
        if self.environment == "production" {
            "https://apis.quran.foundation"
        } else {
            "https://apis-prelive.quran.foundation"
        }
    }

    fn auth_base(&self) -> &'static str {
        if self.environment == "production" {
            "https://oauth2.quran.foundation"
        } else {
            "https://prelive-oauth2.quran.foundation"
        }
    }
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn normalize_page(
    value: Value,
    mushaf_id: u16,
    page_number: u16,
    environment: &str,
) -> Result<QuranPage, QuranContentError> {
    let values = value
        .get("verses")
        .and_then(Value::as_array)
        .ok_or(QuranContentError::InvalidPage)?;
    let mut verses = Vec::with_capacity(values.len());
    for verse in values {
        let verse_key = verse
            .get("verse_key")
            .and_then(Value::as_str)
            .ok_or(QuranContentError::InvalidPage)?
            .to_owned();
        let (surah_number, ayah_number) = parse_verse_key(&verse_key)?;
        let mut words = Vec::new();
        for word in verse
            .get("words")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            words.push(QuranPageWord {
                id: word.get("id").and_then(Value::as_i64).unwrap_or_default(),
                verse_key: word
                    .get("verse_key")
                    .and_then(Value::as_str)
                    .unwrap_or(&verse_key)
                    .to_owned(),
                position: word
                    .get("position")
                    .and_then(Value::as_u64)
                    .unwrap_or_default() as u16,
                line_number: word
                    .get("line_number")
                    .and_then(Value::as_u64)
                    .unwrap_or_default() as u16,
                page_number: word
                    .get("page_number")
                    .and_then(Value::as_u64)
                    .unwrap_or(u64::from(page_number)) as u16,
                char_type: word
                    .get("char_type_name")
                    .or_else(|| word.get("char_type"))
                    .and_then(Value::as_str)
                    .unwrap_or("word")
                    .to_owned(),
                code_v2: word
                    .get("code_v2")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned(),
                text_qpc_hafs: word
                    .get("text_qpc_hafs")
                    .or_else(|| word.get("text"))
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned(),
            });
        }
        verses.push(QuranPageVerse {
            id: verse.get("id").and_then(Value::as_i64).unwrap_or_default(),
            verse_key,
            surah_number,
            ayah_number,
            words,
        });
    }
    Ok(QuranPage {
        mushaf_id,
        page_number,
        verses,
        cached_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64,
        stale: false,
        environment: environment.to_owned(),
    })
}

fn parse_verse_key(value: &str) -> Result<(u16, u16), QuranContentError> {
    let (surah, ayah) = value
        .split_once(':')
        .ok_or(QuranContentError::InvalidPage)?;
    let surah = surah.parse().map_err(|_| QuranContentError::InvalidPage)?;
    let ayah = ayah.parse().map_err(|_| QuranContentError::InvalidPage)?;
    Ok((surah, ayah))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_verse_keys() {
        assert_eq!(parse_verse_key("2:255").unwrap(), (2, 255));
        assert!(parse_verse_key("forged").is_err());
    }

    #[test]
    fn normalizes_qcf_page_words_and_lines() {
        let page = normalize_page(
            serde_json::json!({
                "verses": [{
                    "id": 1,
                    "verse_key": "1:1",
                    "words": [{
                        "id": 7,
                        "verse_key": "1:1",
                        "position": 1,
                        "line_number": 2,
                        "page_number": 1,
                        "char_type_name": "word",
                        "code_v2": "glyph",
                        "text_qpc_hafs": "text"
                    }]
                }]
            }),
            1,
            1,
            "prelive",
        )
        .unwrap();
        assert_eq!(page.verses[0].verse_key, "1:1");
        assert_eq!(page.verses[0].words[0].line_number, 2);
        assert_eq!(page.verses[0].words[0].code_v2, "glyph");
    }
}
