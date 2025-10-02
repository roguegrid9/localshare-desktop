// src-tauri/src/media/codec.rs - Audio/video codec configuration

use webrtc::rtp_transceiver::rtp_codec::{RTCRtpCodecCapability, RTCRtpCodecParameters, RTPCodecType};
use webrtc::api::media_engine::MediaEngine;
use anyhow::Result;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum QualityPreset {
    Low,
    Standard,
    High,
}

// Make MediaQuality derive PartialEq
#[derive(Debug, Clone, PartialEq)]
pub enum MediaQuality {
    Auto,
    Low,
    Medium,
    High,
    Custom { bitrate: u32, frame_rate: u32 },
}

impl From<String> for MediaQuality {
    fn from(s: String) -> Self {
        match s.to_lowercase().as_str() {
            "low" => MediaQuality::Low,
            "high" => MediaQuality::High,
            "auto" => MediaQuality::Auto,
            _ => MediaQuality::Medium, // Default
        }
    }
}

impl ToString for MediaQuality {
    fn to_string(&self) -> String {
        match self {
            MediaQuality::Low => "low".to_string(),
            MediaQuality::Medium => "medium".to_string(),
            MediaQuality::High => "high".to_string(),
            MediaQuality::Auto => "auto".to_string(),
            MediaQuality::Custom { bitrate, frame_rate } => format!("custom_{}_{}", bitrate, frame_rate),
        }
    }
}

// Audio codec configuration
#[derive(Debug, Clone)]
pub struct AudioCodecConfig {
    pub codec: String,
    pub sample_rate: u32,
    pub bitrate: u32,
    pub channels: u16,
    pub echo_cancellation: bool,
    pub noise_suppression: bool,
    pub auto_gain_control: bool,
}

impl Default for AudioCodecConfig {
    fn default() -> Self {
        Self {
            codec: "opus".to_string(),
            sample_rate: 48000,
            bitrate: 64000,
            channels: 2,
            echo_cancellation: true,
            noise_suppression: true,
            auto_gain_control: true,
        }
    }
}

// Video codec configuration
#[derive(Debug, Clone)]
pub struct VideoCodecConfig {
    pub codec: String,
    pub width: u32,
    pub height: u32,
    pub frame_rate: u32,
    pub bitrate: u32,
}

impl Default for VideoCodecConfig {
    fn default() -> Self {
        Self {
            codec: "VP8".to_string(),
            width: 640,
            height: 480,
            frame_rate: 24,
            bitrate: 500000, // 500 kbps
        }
    }
}

// Get codec configuration based on quality preset
pub fn get_codec_config(quality: MediaQuality) -> (AudioCodecConfig, VideoCodecConfig) {
    match quality {
        MediaQuality::Low => (
            AudioCodecConfig {
                sample_rate: 16000,
                bitrate: 32000,
                channels: 1,
                ..Default::default()
            },
            VideoCodecConfig {
                width: 320,
                height: 240,
                frame_rate: 15,
                bitrate: 250000,
                ..Default::default()
            }
        ),
        MediaQuality::Medium => (
            AudioCodecConfig::default(),
            VideoCodecConfig::default()
        ),
        MediaQuality::High => (
            AudioCodecConfig {
                sample_rate: 48000,
                bitrate: 128000,
                channels: 2,
                ..Default::default()
            },
            VideoCodecConfig {
                width: 1280,
                height: 720,
                frame_rate: 30,
                bitrate: 1500000,
                ..Default::default()
            }
        ),
        MediaQuality::Auto => {
            // Auto mode starts with medium and adapts based on connection
            get_codec_config(MediaQuality::Medium)
        },
        MediaQuality::Custom { bitrate, frame_rate } => (
            AudioCodecConfig {
                sample_rate: 48000,
                bitrate: bitrate.min(128000), // Cap audio bitrate at reasonable level
                channels: 2,
                ..Default::default()
            },
            VideoCodecConfig {
                width: 1280,
                height: 720,
                frame_rate,
                bitrate,
                ..Default::default()
            }
        ),
    }
}

// Configure MediaEngine with audio/video codecs
pub fn configure_media_engine(audio_config: &AudioCodecConfig, _video_config: &VideoCodecConfig) -> Result<MediaEngine> {
    let mut media_engine = MediaEngine::default();

    // Register Opus audio codec
    let opus_codec = RTCRtpCodecParameters {
        capability: RTCRtpCodecCapability {
            mime_type: "audio/opus".to_owned(),
            clock_rate: audio_config.sample_rate,
            channels: audio_config.channels,
            sdp_fmtp_line: format!(
                "minptime=10;useinbandfec=1;maxaveragebitrate={}",
                audio_config.bitrate
            ),
            rtcp_feedback: vec![],
        },
        payload_type: 111,
        ..Default::default()
    };

    media_engine.register_codec(opus_codec, RTPCodecType::Audio)?;

    // Register VP8 video codec
    let vp8_codec = RTCRtpCodecParameters {
        capability: RTCRtpCodecCapability {
            mime_type: "video/VP8".to_owned(),
            clock_rate: 90000,
            channels: 0,
            sdp_fmtp_line: "".to_owned(),
            rtcp_feedback: vec![],
        },
        payload_type: 96,
        ..Default::default()
    };

    media_engine.register_codec(vp8_codec, RTPCodecType::Video)?;

    // Register H264 video codec as fallback
    let h264_codec = RTCRtpCodecParameters {
        capability: RTCRtpCodecCapability {
            mime_type: "video/H264".to_owned(),
            clock_rate: 90000,
            channels: 0,
            sdp_fmtp_line: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f".to_owned(),
            rtcp_feedback: vec![],
        },
        payload_type: 97,
        ..Default::default()
    };

    media_engine.register_codec(h264_codec, RTPCodecType::Video)?;

    Ok(media_engine)
}

// Audio processing configuration for WebRTC
#[derive(Debug, Clone)]
pub struct AudioProcessingConfig {
    pub echo_cancellation: bool,
    pub noise_suppression: bool,
    pub auto_gain_control: bool,
    pub high_pass_filter: bool,
    pub typing_detection: bool,
    pub voice_activation_threshold: f64,
}

impl Default for AudioProcessingConfig {
    fn default() -> Self {
        Self {
            echo_cancellation: true,
            noise_suppression: true,
            auto_gain_control: true,
            high_pass_filter: true,
            typing_detection: true,
            voice_activation_threshold: 0.01,
        }
    }
}

impl AudioProcessingConfig {
    pub fn from_constraints(constraints: &crate::media::MediaConstraints) -> Self {
        Self {
            echo_cancellation: constraints.audio_enabled, // Use audio_enabled as a proxy
            noise_suppression: constraints.audio_enabled,
            auto_gain_control: constraints.audio_enabled,
            voice_activation_threshold: 0.01, // Default value
            ..Default::default()
        }
    }
}

// Adaptive bitrate configuration
#[derive(Debug, Clone)]
pub struct AdaptiveBitrateConfig {
    pub min_bitrate: u32,
    pub max_bitrate: u32,
    pub start_bitrate: u32,
    pub adaptation_enabled: bool,
}

impl AdaptiveBitrateConfig {
    pub fn for_quality(quality: MediaQuality) -> Self {
        match quality {
            MediaQuality::Low => Self {
                min_bitrate: 16000,
                max_bitrate: 64000,
                start_bitrate: 32000,
                adaptation_enabled: true,
            },
            MediaQuality::Medium => Self {
                min_bitrate: 32000,
                max_bitrate: 128000,
                start_bitrate: 64000,
                adaptation_enabled: true,
            },
            MediaQuality::High => Self {
                min_bitrate: 64000,
                max_bitrate: 256000,
                start_bitrate: 128000,
                adaptation_enabled: false, // High quality maintains bitrate
            },
            MediaQuality::Auto => Self {
                min_bitrate: 16000,
                max_bitrate: 128000,
                start_bitrate: 64000,
                adaptation_enabled: true,
            },
            MediaQuality::Custom { bitrate, frame_rate: _ } => Self {
                min_bitrate: (bitrate / 4).max(16000), // Quarter of target as minimum
                max_bitrate: (bitrate * 2).min(512000), // Double target as maximum, capped
                start_bitrate: bitrate,
                adaptation_enabled: true,
            },
        }
    }
}

// Codec capability detection
pub fn detect_codec_support() -> Vec<String> {
    // In a real implementation, this would probe browser capabilities
    // For now, return the codecs we support
    vec![
        "audio/opus".to_string(),
        "video/VP8".to_string(),
        "video/H264".to_string(),
    ]
}

// Get optimal configuration based on network conditions
pub fn get_adaptive_config(
    quality: MediaQuality,
    network_condition: NetworkCondition,
) -> (AudioCodecConfig, VideoCodecConfig) {
    let (mut audio_config, mut video_config) = get_codec_config(quality.clone());

    match network_condition {
        NetworkCondition::Poor => {
            // Reduce quality for poor connections
            audio_config.bitrate = audio_config.bitrate / 2;
            audio_config.sample_rate = 16000;
            video_config.bitrate = video_config.bitrate / 3;
            video_config.frame_rate = 15;
        }
        NetworkCondition::Good => {
            // Keep default settings
        }
        NetworkCondition::Excellent => {
            // Increase quality for excellent connections
            if quality == MediaQuality::Auto {
                audio_config.bitrate = audio_config.bitrate * 2;
                video_config.bitrate = video_config.bitrate * 2;
            }
        }
    }

    (audio_config, video_config)
}

#[derive(Debug, Clone, PartialEq)]
pub enum NetworkCondition {
    Poor,
    Good,
    Excellent,
}

impl NetworkCondition {
    pub fn from_rtt_and_loss(rtt_ms: u32, packet_loss_percent: f32) -> Self {
        if rtt_ms > 200 || packet_loss_percent > 3.0 {
            NetworkCondition::Poor
        } else if rtt_ms < 50 && packet_loss_percent < 0.5 {
            NetworkCondition::Excellent
        } else {
            NetworkCondition::Good
        }
    }
}

// Utility function to create SDP constraints
pub fn create_audio_constraints(config: &AudioCodecConfig) -> serde_json::Value {
    serde_json::json!({
        "audio": {
            "echoCancellation": config.echo_cancellation,
            "noiseSuppression": config.noise_suppression,
            "autoGainControl": config.auto_gain_control,
            "sampleRate": config.sample_rate,
            "channelCount": config.channels
        }
    })
}

pub fn create_video_constraints(config: &VideoCodecConfig) -> serde_json::Value {
    serde_json::json!({
        "video": {
            "width": { "ideal": config.width },
            "height": { "ideal": config.height },
            "frameRate": { "ideal": config.frame_rate }
        }
    })
}
