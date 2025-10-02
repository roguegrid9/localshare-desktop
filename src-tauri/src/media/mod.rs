// src-tauri/src/media/mod.rs - Media module exports with audio device support

pub mod manager;
pub mod mesh_session;
pub mod codec;
pub mod audio_device_manager;
pub mod audio_utils;

pub use manager::MediaManager;
pub use mesh_session::MeshSession;
pub use codec::{AudioCodecConfig, MediaQuality, get_codec_config};
pub use audio_device_manager::{AudioDeviceManager, AudioDevice, AudioSettings as DeviceAudioSettings, AudioLevel};
pub use audio_utils::{AudioConverter, AudioProcessor, AudioBuffer, AudioChunk, AudioFormat, AudioProcessingSettings};

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// Media session types
#[derive(Debug, Clone, PartialEq)]
pub enum MediaSessionType {
    Mesh,
    SFU,
    Hybrid,
}

// Media track information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaTrackInfo {
    pub track_id: String,
    pub kind: String, // "audio" or "video"
    pub stream_id: String,
    pub enabled: bool,
}

// Voice channel routing information from Go backend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceRoutingInfo {
    pub session_type: String,
    pub required_connections: Option<Vec<String>>,
    pub sfu_connection_info: Option<SFUConnectionInfo>,
    pub media_constraints: MediaConstraints,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SFUConnectionInfo {
    pub sfu_node_id: String,
    pub connection_url: String,
    pub auth_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaConstraints {
    pub audio_enabled: bool,
    pub video_enabled: bool,
    pub max_bitrate: Option<u32>,
    pub preferred_codec: Option<String>,
}

// Media session state
#[derive(Debug, Clone)]
pub struct MediaSessionState {
    pub session_id: String,
    pub channel_id: Uuid,
    pub session_type: MediaSessionType,
    pub local_tracks: HashMap<String, MediaTrackInfo>,
    pub remote_participants: HashMap<String, ParticipantMediaState>,
    pub is_connected: bool,
    pub audio_enabled: bool,
    pub video_enabled: bool,
}

#[derive(Debug, Clone)]
pub struct ParticipantMediaState {
    pub user_id: String,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub audio_enabled: bool,
    pub video_enabled: bool,
    pub is_speaking: bool,
    pub is_muted: bool,
    pub connection_state: String,
}

// Media statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaStats {
    pub audio: Option<AudioStats>,
    pub video: Option<VideoStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioStats {
    pub packets_lost: u32,
    pub packets_received: u32,
    pub bytes_received: u64,
    pub jitter: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoStats {
    pub packets_lost: u32,
    pub packets_received: u32,
    pub bytes_received: u64,
    pub frame_rate: f32,
    pub resolution: VideoResolution,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoResolution {
    pub width: u32,
    pub height: u32,
}

// Error types for media operations
#[derive(Debug, thiserror::Error)]
pub enum MediaError {
    #[error("API error: {0}")]
    ApiError(String),
    
    #[error("WebRTC error: {0}")]
    WebRtcError(String),
    
    #[error("Session not found: {0}")]
    SessionNotFound(String),
    
    #[error("Invalid routing type: {0}")]
    InvalidRoutingType(String),
    
    #[error("Media track error: {0}")]
    MediaTrackError(String),
    
    #[error("Connection error: {0}")]
    ConnectionError(String),
    
    #[error("Permission denied: {0}")]
    PermissionDenied(String),
    
    #[error("Audio device error: {0}")]
    AudioDeviceError(String),
    
    #[error("Audio capture error: {0}")]
    AudioCaptureError(String),
}

// Result type for media operations
pub type MediaResult<T> = Result<T, MediaError>;

// Constants
pub const DEFAULT_AUDIO_CODEC: &str = "opus";
pub const DEFAULT_SAMPLE_RATE: u32 = 48000;
pub const DEFAULT_BITRATE: u32 = 64000;
pub const MESH_MAX_PARTICIPANTS: usize = 8;
pub const SFU_MIN_PARTICIPANTS: usize = 9;

// Audio capture configuration for WebRTC
#[derive(Debug, Clone)]
pub struct WebRTCAudioConfig {
    pub sample_rate: u32,
    pub channels: u16,
    pub frames_per_buffer: u32,
    pub codec: String,
}

impl Default for WebRTCAudioConfig {
    fn default() -> Self {
        Self {
            sample_rate: DEFAULT_SAMPLE_RATE,
            channels: 2,
            frames_per_buffer: 480, // 10ms at 48kHz
            codec: DEFAULT_AUDIO_CODEC.to_string(),
        }
    }
}

impl WebRTCAudioConfig {
    pub fn low_latency() -> Self {
        Self {
            sample_rate: 48000,
            channels: 1,
            frames_per_buffer: 240, // 5ms at 48kHz
            codec: "opus".to_string(),
        }
    }

    pub fn high_quality() -> Self {
        Self {
            sample_rate: 48000,
            channels: 2,
            frames_per_buffer: 960, // 20ms at 48kHz
            codec: "opus".to_string(),
        }
    }
}