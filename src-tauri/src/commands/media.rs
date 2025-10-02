// src/commands/media.rs - Updated Audio/Video media commands with real device support

use crate::state::app::AppState;
use anyhow::Result;
use tauri::State;
use serde::{Deserialize, Serialize};

// ===== MEDIA TYPES =====

#[derive(Debug, Serialize, Deserialize)]
pub struct MediaDevice {
    pub device_id: String,
    pub label: String,
    pub kind: String, // "audioinput", "audiooutput", "videoinput"
    pub group_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AudioSettings {
    pub input_device_id: Option<String>,
    pub output_device_id: Option<String>,
    pub input_volume: f32,
    pub output_volume: f32,
    pub noise_suppression: bool,
    pub echo_cancellation: bool,
    pub auto_gain_control: bool,
    pub push_to_talk: bool,
    pub push_to_talk_key: Option<String>,
    pub voice_activation_threshold: f32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VideoSettings {
    pub camera_device_id: Option<String>,
    pub resolution: String, // "720p", "1080p", etc.
    pub frame_rate: u32,
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MediaSessionInfo {
    pub session_id: String,
    pub session_type: String, // "voice", "video", "screen_share"
    pub participants: Vec<String>,
    pub is_active: bool,
    pub started_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AudioLevel {
    pub level: f32,      // 0.0 to 1.0 RMS level
    pub peak: f32,       // Peak level for visualization
    pub speaking: bool,  // Voice activation detection
}

// ===== DEVICE MANAGEMENT COMMANDS =====

#[tauri::command]
pub async fn get_media_devices(
    state: State<'_, AppState>,
) -> Result<Vec<MediaDevice>, String> {
    log::info!("Getting available media devices");

    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    match media_manager.get_available_devices().await {
        Ok(devices) => {
            log::info!("Found {} media devices", devices.len());
            Ok(devices)
        }
        Err(e) => {
            log::error!("Failed to get media devices: {}", e);
            Err(format!("Failed to get media devices: {}", e))
        }
    }
}

#[tauri::command]
pub async fn test_audio_device(
    device_id: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    log::info!("Testing audio device: {}", device_id);

    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    match media_manager.test_audio_device(&device_id).await {
        Ok(result) => {
            log::info!("Audio device {} test result: {}", device_id, result);
            Ok(result)
        }
        Err(e) => {
            log::error!("Failed to test audio device {}: {}", device_id, e);
            Err(format!("Failed to test audio device: {}", e))
        }
    }
}

#[tauri::command]
pub async fn test_video_device(
    device_id: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    log::info!("Testing video device: {}", device_id);

    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    match media_manager.test_video_device(&device_id).await {
        Ok(result) => {
            log::info!("Video device {} test result: {}", device_id, result);
            Ok(result)
        }
        Err(e) => {
            log::error!("Failed to test video device {}: {}", device_id, e);
            Err(format!("Failed to test video device: {}", e))
        }
    }
}

// ===== AUDIO COMMANDS =====

#[tauri::command]
pub async fn start_audio_capture(
    device_id: Option<String>,
    settings: AudioSettings,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Starting audio capture with device: {:?}", device_id);

    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    // Convert command AudioSettings to device manager AudioSettings
    let device_settings = crate::media::audio_device_manager::AudioSettings {
        input_device_id: device_id.clone(),
        output_device_id: settings.output_device_id,
        sample_rate: 48000,
        channels: 2,
        buffer_size: 1024,
        input_volume: settings.input_volume,
        output_volume: settings.output_volume,
        noise_suppression: settings.noise_suppression,
        echo_cancellation: settings.echo_cancellation,
        auto_gain_control: settings.auto_gain_control,
    };

    // Call the synchronous version to avoid Send issues
    match tokio::task::spawn_blocking(move || {
        let device_manager = media_manager.get_audio_device_manager();
        device_manager.start_audio_capture_sync(device_id, device_settings)
    }).await {
        Ok(Ok(())) => {
            log::info!("Audio capture started successfully");
            Ok(())
        }
        Ok(Err(e)) => {
            log::error!("Failed to start audio capture: {}", e);
            Err(format!("Failed to start audio capture: {}", e))
        }
        Err(e) => {
            log::error!("Task panicked: {}", e);
            Err("Audio capture task failed".to_string())
        }
    }
}

#[tauri::command]
pub async fn stop_audio_capture(
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Stopping audio capture");

    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    match media_manager.stop_audio_capture().await {
        Ok(()) => {
            log::info!("Audio capture stopped successfully");
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to stop audio capture: {}", e);
            Err(format!("Failed to stop audio capture: {}", e))
        }
    }
}

#[tauri::command]
pub async fn mute_audio(
    muted: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Setting audio muted: {}", muted);

    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    match media_manager.set_audio_muted(muted).await {
        Ok(()) => {
            log::info!("Audio mute state set to: {}", muted);
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to set audio mute state: {}", e);
            Err(format!("Failed to mute/unmute audio: {}", e))
        }
    }
}

#[tauri::command]
pub async fn set_audio_volume(
    volume: f32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Setting audio volume: {}", volume);

    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    match media_manager.set_audio_volume(volume).await {
        Ok(()) => {
            log::info!("Audio volume set to: {}", volume);
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to set audio volume: {}", e);
            Err(format!("Failed to set audio volume: {}", e))
        }
    }
}

#[tauri::command]
pub async fn get_audio_level(
    state: State<'_, AppState>,
) -> Result<f32, String> {
    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    match media_manager.get_current_audio_level().await {
        Ok(level) => Ok(level),
        Err(e) => {
            log::error!("Failed to get audio level: {}", e);
            Err(format!("Failed to get audio level: {}", e))
        }
    }
}

// ===== VIDEO COMMANDS =====

#[tauri::command]
pub async fn start_video_capture(
    device_id: Option<String>,
    settings: VideoSettings,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Starting video capture with device: {:?}", device_id);

    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    match media_manager.start_video_capture(device_id, settings).await {
        Ok(()) => {
            log::info!("Video capture started successfully");
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to start video capture: {}", e);
            Err(format!("Failed to start video capture: {}", e))
        }
    }
}

#[tauri::command]
pub async fn stop_video_capture(
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Stopping video capture");

    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    match media_manager.stop_video_capture().await {
        Ok(()) => {
            log::info!("Video capture stopped successfully");
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to stop video capture: {}", e);
            Err(format!("Failed to stop video capture: {}", e))
        }
    }
}

#[tauri::command]
pub async fn toggle_video(
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Setting video enabled: {}", enabled);

    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    match media_manager.set_video_enabled(enabled).await {
        Ok(()) => {
            log::info!("Video enabled state set to: {}", enabled);
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to toggle video: {}", e);
            Err(format!("Failed to toggle video: {}", e))
        }
    }
}

// ===== SCREEN SHARING COMMANDS =====

#[tauri::command]
pub async fn start_screen_share(
    source_id: Option<String>,
    include_audio: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Starting screen share with source: {:?}, audio: {}", source_id, include_audio);

    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    match media_manager.start_screen_share(source_id, include_audio).await {
        Ok(()) => {
            log::info!("Screen sharing started successfully");
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to start screen share: {}", e);
            Err(format!("Failed to start screen share: {}", e))
        }
    }
}

#[tauri::command]
pub async fn stop_screen_share(
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Stopping screen share");

    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    match media_manager.stop_screen_share().await {
        Ok(()) => {
            log::info!("Screen sharing stopped successfully");
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to stop screen share: {}", e);
            Err(format!("Failed to stop screen share: {}", e))
        }
    }
}

#[tauri::command]
pub async fn get_screen_sources(
    state: State<'_, AppState>,
) -> Result<Vec<ScreenSource>, String> {
    log::info!("Getting available screen sources");

    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    match media_manager.get_available_screen_sources().await {
        Ok(sources) => {
            log::info!("Found {} screen sources", sources.len());
            Ok(sources)
        }
        Err(e) => {
            log::error!("Failed to get screen sources: {}", e);
            Err(format!("Failed to get screen sources: {}", e))
        }
    }
}

// ===== MEDIA SESSION MANAGEMENT =====

#[tauri::command]
pub async fn create_media_session(
    session_id: String,
    session_type: String,
    channel_id: Option<String>,
    grid_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Creating media session: {} (type: {}, channel: {:?}, grid: {:?})", 
               session_id, session_type, channel_id, grid_id);

    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    // For voice channels, we need to store the grid_id context
    if session_type == "voice_channel" {
        if let (Some(channel_id), Some(grid_id)) = (channel_id, grid_id) {
            // Create a voice channel session with grid context
            match media_manager.create_voice_channel_session(session_id.clone(), channel_id, grid_id).await {
                Ok(()) => {
                    log::info!("Voice channel media session {} created successfully", session_id);
                    Ok(())
                }
                Err(e) => {
                    log::error!("Failed to create voice channel media session {}: {}", session_id, e);
                    Err(format!("Failed to create media session: {}", e))
                }
            }
        } else {
            Err("Voice channel sessions require both channel_id and grid_id".to_string())
        }
    } else {
        // Regular P2P media session
        match media_manager.initialize_media_session(session_id.clone()).await {
            Ok(()) => {
                log::info!("Media session {} created successfully", session_id);
                Ok(())
            }
            Err(e) => {
                log::error!("Failed to create media session {}: {}", session_id, e);
                Err(format!("Failed to create media session: {}", e))
            }
        }
    }
}

#[tauri::command]
pub async fn get_active_media_sessions(
    state: State<'_, AppState>,
) -> Result<Vec<MediaSessionInfo>, String> {
    log::debug!("Getting active media sessions");

    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    let session_ids = media_manager.get_media_sessions().await;
    
    // Convert session IDs to MediaSessionInfo structs
    let sessions = session_ids
        .into_iter()
        .map(|id| MediaSessionInfo {
            session_id: id.clone(),
            session_type: if id.starts_with("voice_") { "voice" } else { "unknown" }.to_string(),
            participants: vec![], // Would be populated from actual session data
            is_active: true,
            started_at: chrono::Utc::now().to_rfc3339(),
        })
        .collect();

    Ok(sessions)
}

// ===== SETTINGS MANAGEMENT =====

#[tauri::command]
pub async fn save_audio_settings(
    settings: AudioSettings,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Saving audio settings");

    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    match media_manager.save_audio_settings(settings).await {
        Ok(()) => {
            log::info!("Audio settings saved successfully");
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to save audio settings: {}", e);
            Err(format!("Failed to save audio settings: {}", e))
        }
    }
}

#[tauri::command]
pub async fn load_audio_settings(
    state: State<'_, AppState>,
) -> Result<AudioSettings, String> {
    log::debug!("Loading audio settings");

    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    match media_manager.load_audio_settings().await {
        Ok(settings) => {
            log::debug!("Audio settings loaded successfully");
            Ok(settings)
        }
        Err(e) => {
            log::error!("Failed to load audio settings: {}", e);
            Err(format!("Failed to load audio settings: {}", e))
        }
    }
}

#[tauri::command]
pub async fn save_video_settings(
    settings: VideoSettings,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Saving video settings");

    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    match media_manager.save_video_settings(settings).await {
        Ok(()) => {
            log::info!("Video settings saved successfully");
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to save video settings: {}", e);
            Err(format!("Failed to save video settings: {}", e))
        }
    }
}

#[tauri::command]
pub async fn load_video_settings(
    state: State<'_, AppState>,
) -> Result<VideoSettings, String> {
    log::debug!("Loading video settings");

    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    match media_manager.load_video_settings().await {
        Ok(settings) => {
            log::debug!("Video settings loaded successfully");
            Ok(settings)
        }
        Err(e) => {
            log::error!("Failed to load video settings: {}", e);
            Err(format!("Failed to load video settings: {}", e))
        }
    }
}

// ===== ADVANCED AUDIO FEATURES =====

#[tauri::command]
pub async fn get_detailed_audio_level(
    state: State<'_, AppState>,
) -> Result<AudioLevel, String> {
    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    // Get the detailed audio level from device manager
    let device_manager = media_manager.get_audio_device_manager();
    let level = device_manager.get_current_audio_level().await;
    Ok(AudioLevel {
        level: level.level,
        peak: level.peak,
        speaking: level.speaking,
    })
}

#[tauri::command]
pub async fn set_voice_activation_threshold(
    threshold: f32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Setting voice activation threshold: {}", threshold);

    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    let device_manager = media_manager.get_audio_device_manager();
    device_manager.set_voice_activation_threshold(threshold).await;
    log::info!("Voice activation threshold set to: {}", threshold);
    Ok(())
}

// ===== ADDITIONAL TYPES FOR SCREEN SHARING =====

#[derive(Debug, Serialize, Deserialize)]
pub struct ScreenSource {
    pub source_id: String,
    pub name: String,
    pub source_type: String, // "screen", "window", "application"
    pub thumbnail: Option<String>, // base64 encoded thumbnail
}

// ===== MEDIA MANAGER STATUS =====

#[tauri::command]
pub async fn get_media_manager_status(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let is_initialized = {
        let media_guard = state.media_manager.lock().await;
        media_guard.is_some()
    };
        
    let status = serde_json::json!({
        "initialized": is_initialized,
        "audio_available": is_initialized,
        "video_available": false, // Video not implemented yet
        "screen_share_available": false, // Screen share not implemented yet
    });

    Ok(status)
}