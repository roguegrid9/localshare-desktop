// src-tauri/src/terminal/types.rs

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSessionInfo {
    pub session_id: String,
    pub grid_id: Option<String>,
    pub shell_type: String,
    pub working_directory: String,
    #[serde(with = "timestamp_serde")]
    pub created_at: DateTime<Utc>,
    #[serde(with = "timestamp_serde")]
    pub last_activity: DateTime<Utc>,
    pub is_active: bool,
    pub connected_users: Vec<String>,
    // Add these missing fields
    pub session_name: Option<String>,
    pub initial_command: Option<String>,
}

mod timestamp_serde {
    use chrono::{DateTime, Utc};
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S>(date: &DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_i64(date.timestamp())
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<DateTime<Utc>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let timestamp = i64::deserialize(deserializer)?;
        Ok(DateTime::from_timestamp(timestamp, 0).unwrap_or_else(|| Utc::now()))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalOutput {
    pub session_id: String,
    pub timestamp: DateTime<Utc>,
    pub data: Vec<u8>,
    pub output_type: OutputType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OutputType {
    Stdout,
    Stderr,
    UserInput,
    SystemMessage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalInput {
    pub session_id: String,
    pub user_id: Option<String>,
    pub data: Vec<u8>,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSessionRequest {
    pub grid_id: Option<String>,
    pub shell_type: Option<String>,
    pub working_directory: Option<String>,
    pub initial_command: Option<String>,
    pub session_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionHistoryEntry {
    pub timestamp: DateTime<Utc>,
    pub data: Vec<u8>,
    pub output_type: OutputType,
}

// Configuration for terminal behavior
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalConfig {
    pub max_history_lines: usize,
    pub max_history_size_bytes: usize,
    pub auto_cleanup_inactive_hours: u64,
    pub enable_colors: bool,
    pub custom_prompt: Option<String>,
    pub color_theme: ColorTheme,
    pub custom_ps1: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ColorTheme {
    Dark,
    Light, 
    Minimal,
    Custom(CustomColors),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomColors {
    pub user_color: String,      // e.g. "1;32" for bright green
    pub host_color: String,      // e.g. "1;33" for bright yellow  
    pub path_color: String,      // e.g. "1;34" for bright blue
    pub prompt_symbol: String,   // e.g. "$" or ">"
}

impl Default for TerminalConfig {
    fn default() -> Self {
        Self {
            max_history_lines: 10000,
            max_history_size_bytes: 50 * 1024 * 1024, // 50MB
            auto_cleanup_inactive_hours: 24,
            enable_colors: true,
            custom_prompt: None,
            color_theme: ColorTheme::Dark,
            custom_ps1: None,  
        }
    }
}

impl std::fmt::Display for TerminalError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TerminalError::SessionNotFound(id) => write!(f, "Session not found: {}", id),
            TerminalError::PtyCreationFailed(msg) => write!(f, "Failed to create PTY: {}", msg),
            TerminalError::ShellSpawnFailed(msg) => write!(f, "Failed to spawn shell: {}", msg),
            TerminalError::IoError(err) => write!(f, "I/O error: {}", err),
            TerminalError::SessionAlreadyExists(id) => write!(f, "Session already exists: {}", id),
            TerminalError::PermissionDenied(id) => write!(f, "Permission denied for session: {}", id),
            TerminalError::InvalidShellType(shell) => write!(f, "Invalid shell type: {}", shell),
        }
    }
}

impl std::error::Error for TerminalError {}

impl From<std::io::Error> for TerminalError {
    fn from(err: std::io::Error) -> Self {
        TerminalError::IoError(err)
    }
}

// Error types for terminal operations
#[derive(Debug)]
pub enum TerminalError {
    SessionNotFound(String),
    PtyCreationFailed(String),
    ShellSpawnFailed(String),
    IoError(std::io::Error),
    SessionAlreadyExists(String),
    PermissionDenied(String),
    InvalidShellType(String),
}