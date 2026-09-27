use app_core::{DATA_SERVICE_PROTOCOL_VERSION, ServiceSettings};
use serde::{Deserialize, Serialize};
use std::{
    env, fs,
    path::{Path, PathBuf},
};
use thiserror::Error;

pub const CONFIG_ENV: &str = "PRODUCTIVITY_OS_CONFIG";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductivityConfig {
    #[serde(default = "default_version")]
    pub version: u32,
    pub data_service: DataServiceConfig,
    #[serde(default, alias = "wiki")]
    pub canvas: CanvasConfig,
    #[serde(default)]
    pub quran: QuranConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuranConfig {
    #[serde(default = "default_quran_environment")]
    pub environment: String,
    #[serde(default = "default_quran_mushaf_id")]
    pub mushaf_id: u16,
}

impl Default for QuranConfig {
    fn default() -> Self {
        Self {
            environment: default_quran_environment(),
            mushaf_id: default_quran_mushaf_id(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataServiceConfig {
    pub socket_path: PathBuf,
    pub database_path: PathBuf,
    #[serde(default = "default_media_path")]
    pub media_path: PathBuf,
    #[serde(default = "default_max_request_bytes")]
    pub max_request_bytes: usize,
    #[serde(default = "default_max_connections")]
    pub max_connections: u32,
    #[serde(default = "default_busy_timeout_ms")]
    pub busy_timeout_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasConfig {
    #[serde(default = "default_autosave_debounce_ms")]
    pub autosave_debounce_ms: u64,
    #[serde(default = "default_seed_demo_data")]
    pub seed_demo_data: bool,
}

impl Default for CanvasConfig {
    fn default() -> Self {
        Self {
            autosave_debounce_ms: default_autosave_debounce_ms(),
            seed_demo_data: default_seed_demo_data(),
        }
    }
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("no productivity-os.yaml or productivity-os.json configuration file was found")]
    NotFound,
    #[error("failed to read configuration at {path}: {source}")]
    Read {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("invalid configuration at {path}: {message}")]
    Parse { path: PathBuf, message: String },
}

impl ProductivityConfig {
    pub fn load() -> Result<Self, ConfigError> {
        let path = discover_path().ok_or(ConfigError::NotFound)?;
        Self::load_from(path)
    }

    pub fn load_from(path: impl AsRef<Path>) -> Result<Self, ConfigError> {
        let path = path.as_ref().to_path_buf();
        let source = fs::read_to_string(&path).map_err(|source| ConfigError::Read {
            path: path.clone(),
            source,
        })?;
        let mut config: Self = match path.extension().and_then(|extension| extension.to_str()) {
            Some("json") => serde_json::from_str(&source).map_err(|error| ConfigError::Parse {
                path: path.clone(),
                message: error.to_string(),
            })?,
            _ => serde_yaml::from_str(&source).map_err(|error| ConfigError::Parse {
                path: path.clone(),
                message: error.to_string(),
            })?,
        };
        let root = path.parent().unwrap_or_else(|| Path::new("."));
        config.data_service.socket_path = resolve(root, &config.data_service.socket_path);
        config.data_service.database_path = resolve(root, &config.data_service.database_path);
        config.data_service.media_path = resolve(root, &config.data_service.media_path);
        Ok(config)
    }

    pub fn service_settings(&self) -> ServiceSettings {
        ServiceSettings {
            protocol_version: DATA_SERVICE_PROTOCOL_VERSION,
            config_version: self.version,
            socket_path: self.data_service.socket_path.to_string_lossy().into_owned(),
            database_path: self
                .data_service
                .database_path
                .to_string_lossy()
                .into_owned(),
            media_path: self.data_service.media_path.to_string_lossy().into_owned(),
            max_request_bytes: self.data_service.max_request_bytes,
            max_connections: self.data_service.max_connections,
            busy_timeout_ms: self.data_service.busy_timeout_ms,
            canvas_autosave_debounce_ms: self.canvas.autosave_debounce_ms,
            canvas_seed_demo_data: self.canvas.seed_demo_data,
            quran_environment: self.quran.environment.clone(),
            quran_mushaf_id: self.quran.mushaf_id,
        }
    }
}

fn discover_path() -> Option<PathBuf> {
    if let Some(path) = env::var_os(CONFIG_ENV) {
        return Some(PathBuf::from(path));
    }

    let names = [
        "productivity-os.yaml",
        "productivity-os.yml",
        "productivity-os.json",
    ];
    if let Ok(current) = env::current_dir() {
        for ancestor in current.ancestors() {
            for name in names {
                let candidate = ancestor.join(name);
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }

    let workspace = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    names
        .into_iter()
        .map(|name| workspace.join(name))
        .find(|path| path.is_file())
}

fn resolve(root: &Path, path: &Path) -> PathBuf {
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        root.join(path)
    }
}

const fn default_version() -> u32 {
    1
}
const fn default_max_request_bytes() -> usize {
    32 * 1024 * 1024
}
const fn default_max_connections() -> u32 {
    4
}
const fn default_busy_timeout_ms() -> u64 {
    5_000
}
fn default_media_path() -> PathBuf {
    PathBuf::from(".data/media")
}
const fn default_autosave_debounce_ms() -> u64 {
    750
}
const fn default_seed_demo_data() -> bool {
    true
}
fn default_quran_environment() -> String {
    "prelive".into()
}
const fn default_quran_mushaf_id() -> u16 {
    1
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_relative_database_paths_from_the_config_directory() {
        let root = std::env::temp_dir().join(format!("productivity-config-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("productivity-os.json");
        std::fs::write(
            &path,
            r#"{
          "version": 1,
          "data_service": {
            "socket_path": "/tmp/productivity-test.sock",
            "database_path": ".data/test.sqlite3"
          }
        }"#,
        )
        .unwrap();
        let config = ProductivityConfig::load_from(&path).unwrap();
        assert_eq!(
            config.service_settings().protocol_version,
            DATA_SERVICE_PROTOCOL_VERSION
        );
        assert_eq!(
            config.data_service.database_path,
            root.join(".data/test.sqlite3")
        );
        assert_eq!(config.data_service.media_path, root.join(".data/media"));
        std::fs::remove_file(path).ok();
        std::fs::remove_dir(root).ok();
    }
}
