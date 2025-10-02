// src-tauri/src/media/manager.rs - Main media manager with audio device support

use super::{
    VoiceRoutingInfo, MediaTrackInfo, MediaSessionState, MediaSessionType, 
    MediaError, MediaResult, MeshSession, MediaStats, MediaConstraints,
    AudioDeviceManager, AudioLevel, WebRTCAudioConfig, AudioChunk, AudioBuffer,
    AudioProcessor, AudioProcessingSettings
};
use crate::api::client::CoordinatorClient as ApiClient;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};
use uuid::Uuid;
use tauri::AppHandle;
use serde_json::Value;
use tauri::Emitter;
use tokio::sync::RwLock;

// Voice channel join response from Go backend
#[derive(Debug, serde::Deserialize)]
struct JoinVoiceChannelResponse {
    voice_session: VoiceSession,
    participant: VoiceParticipant,
    routing_info: VoiceRoutingInfo,
    other_participants: Vec<VoiceParticipant>,
}

#[derive(Debug, serde::Deserialize)]
struct VoiceSession {
    id: String,
    channel_id: Uuid,
    session_type: String,
    current_participants: i32,
    max_participants: i32,
}

#[derive(Debug, serde::Deserialize)]
struct VoiceParticipant {
    user_id: Uuid,
    username: Option<String>,
    display_name: Option<String>,
    connection_type: String,
    is_speaking: bool,
    is_muted: bool,
}

// Media session wrapper
enum MediaSession {
    Mesh(Arc<MeshSession>),
    // SFU(Arc<SFUSession>), // Future implementation
}

#[derive(Clone)]
pub struct MediaManager {
    app_handle: AppHandle,
    api_client: Arc<ApiClient>,
    active_sessions: Arc<Mutex<HashMap<String, MediaSession>>>,
    channel_sessions: Arc<Mutex<HashMap<Uuid, String>>>,
    current_user_id: Arc<Mutex<Option<Uuid>>>,
    
    // Audio device management
    audio_device_manager: Arc<AudioDeviceManager>,
    
    // WebRTC audio configuration
    webrtc_config: Arc<RwLock<WebRTCAudioConfig>>,
    
    // Audio processing
    audio_processor: Arc<Mutex<AudioProcessor>>,
    processing_settings: Arc<RwLock<AudioProcessingSettings>>,
    
    // Audio streaming to WebRTC
    audio_buffers: Arc<Mutex<HashMap<String, Arc<AudioBuffer>>>>, // session_id -> buffer
    audio_data_receivers: Arc<Mutex<HashMap<String, mpsc::UnboundedReceiver<Vec<f32>>>>>,
}

impl MediaManager {
    pub fn new(app_handle: AppHandle, api_client: Arc<ApiClient>) -> MediaResult<Self> {
        let audio_device_manager = Arc::new(
            AudioDeviceManager::new()
                .map_err(|e| MediaError::AudioDeviceError(e.to_string()))?
        );

        Ok(Self {
            app_handle,
            api_client,
            active_sessions: Arc::new(Mutex::new(HashMap::new())),
            channel_sessions: Arc::new(Mutex::new(HashMap::new())),
            current_user_id: Arc::new(Mutex::new(None)),
            audio_device_manager,
            webrtc_config: Arc::new(RwLock::new(WebRTCAudioConfig::default())),
            audio_processor: Arc::new(Mutex::new(AudioProcessor::new())),
            processing_settings: Arc::new(RwLock::new(AudioProcessingSettings::default())),
            audio_buffers: Arc::new(Mutex::new(HashMap::new())),
            audio_data_receivers: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    // Set current user (called during auth)
    pub async fn set_current_user(&self, user_id: Uuid) {
        let mut current_user = self.current_user_id.lock().await;
        *current_user = Some(user_id);
    }

    // ===== AUDIO DEVICE MANAGEMENT =====

    pub async fn get_available_devices(&self) -> MediaResult<Vec<crate::commands::media::MediaDevice>> {
        let devices = self.audio_device_manager.get_available_devices().await
            .map_err(|e| MediaError::AudioDeviceError(e.to_string()))?;

        // Convert to command format
        let command_devices = devices.into_iter().map(|device| {
            crate::commands::media::MediaDevice {
                device_id: device.device_id,
                label: device.label,
                kind: device.kind,
                group_id: device.group_id,
            }
        }).collect();

        Ok(command_devices)
    }

    pub async fn test_audio_device(&self, device_id: &str) -> MediaResult<bool> {
        self.audio_device_manager.test_audio_device(device_id).await
            .map_err(|e| MediaError::AudioDeviceError(e.to_string()))
    }

    pub async fn test_video_device(&self, device_id: &str) -> MediaResult<bool> {
        // Video device testing not implemented yet
        Ok(true)
    }

    pub async fn start_audio_capture(&self, device_id: Option<String>, settings: crate::commands::media::AudioSettings) -> MediaResult<()> {
        log::info!("Starting audio capture with device: {:?}", device_id);

        // Convert command settings to device manager settings
        let device_settings = super::DeviceAudioSettings {
            input_device_id: device_id.clone(),
            output_device_id: settings.output_device_id.clone(),
            sample_rate: 48000, // Use WebRTC standard
            channels: 2,
            buffer_size: 1024,
            input_volume: settings.input_volume,
            output_volume: settings.output_volume,
            noise_suppression: settings.noise_suppression,
            echo_cancellation: settings.echo_cancellation,
            auto_gain_control: settings.auto_gain_control,
        };

        // Start audio capture
        tokio::task::spawn_blocking({
            let device_manager = self.audio_device_manager.clone();
            let device_id = device_id.clone();
            let device_settings = device_settings.clone();
            move || {
                device_manager.start_audio_capture_sync(device_id, device_settings)
            }
        }).await
        .map_err(|e| MediaError::AudioCaptureError(format!("Task failed: {}", e)))?
        .map_err(|e| MediaError::AudioCaptureError(e.to_string()))?;

        // Set up audio processing pipeline
        self.setup_audio_processing_pipeline().await?;

        log::info!("Audio capture started successfully");
        Ok(())
    }

    pub async fn stop_audio_capture(&self) -> MediaResult<()> {
        log::info!("Stopping audio capture");

        self.audio_device_manager.stop_audio_capture().await
            .map_err(|e| MediaError::AudioCaptureError(e.to_string()))?;

        // Clear audio buffers
        {
            let mut buffers = self.audio_buffers.lock().await;
            for buffer in buffers.values() {
                let _ = buffer.clear().await;
            }
        }

        log::info!("Audio capture stopped");
        Ok(())
    }

    pub async fn set_audio_muted(&self, muted: bool) -> MediaResult<()> {
        log::debug!("Setting audio muted: {}", muted);

        // Update processing settings
        {
            let mut settings = self.processing_settings.write().await;
            settings.gain = if muted { 0.0 } else { 1.0 };
        }

        // Notify all active sessions about mute state change
        let sessions = self.active_sessions.lock().await;
        for (session_id, session) in sessions.iter() {
            match session {
                MediaSession::Mesh(mesh_session) => {
                    // Update local track enabled state for audio tracks
                    let session_state = mesh_session.get_session_state().await;
                    for (track_id, track_info) in session_state.local_tracks {
                        if track_info.kind == "audio" {
                            let _ = mesh_session.set_track_enabled(track_id, !muted).await;
                        }
                    }
                }
            }
        }

        log::debug!("Audio mute state updated to: {}", muted);
        Ok(())
    }

    pub async fn set_audio_volume(&self, volume: f32) -> MediaResult<()> {
        log::debug!("Setting audio volume: {}", volume);

        self.audio_device_manager.set_input_volume(volume).await;

        // Update processing settings
        {
            let mut settings = self.processing_settings.write().await;
            settings.gain = volume.clamp(0.0, 2.0);
        }

        Ok(())
    }

    pub async fn get_current_audio_level(&self) -> MediaResult<f32> {
        let level = self.audio_device_manager.get_current_audio_level().await;
        Ok(level.level)
    }

    // ===== WEBRTC INTEGRATION =====

    async fn setup_audio_processing_pipeline(&self) -> MediaResult<()> {
        log::info!("Setting up audio processing pipeline for WebRTC");

        // Create a task to process audio data and feed it to WebRTC sessions
        let audio_device_manager = self.audio_device_manager.clone();
        let audio_buffers = self.audio_buffers.clone();
        let audio_processor = self.audio_processor.clone();
        let processing_settings = self.processing_settings.clone();
        let webrtc_config = self.webrtc_config.clone();

        tokio::spawn(async move {
            // Get audio data receiver (this would be set up when starting capture)
            if let Some(mut audio_rx) = audio_device_manager.get_audio_data_receiver().await {
                log::info!("Audio processing pipeline started");

                while let Some(audio_data) = audio_rx.recv().await {
                    let config = webrtc_config.read().await.clone();
                    let settings = processing_settings.read().await.clone();
                    
                    // Process the audio data
                    let mut processed_data = audio_data;
                    {
                        let mut processor = audio_processor.lock().await;
                        processor.process(&mut processed_data, config.sample_rate as f32, &settings);
                    }

                    // Create audio chunk for WebRTC
                    let audio_chunk = AudioChunk::new(processed_data, config.sample_rate, config.channels);

                    // Send to all active sessions
                    let buffers = audio_buffers.lock().await;
                    for (session_id, buffer) in buffers.iter() {
                        let _ = buffer.push(audio_chunk.data.clone()).await;
                        log::trace!("Audio data sent to session: {}", session_id);
                    }
                }

                log::info!("Audio processing pipeline ended");
            }
        });

        Ok(())
    }

    // ===== MEDIA SESSION MANAGEMENT =====

    pub async fn initialize_media_session(&self, session_id: String) -> MediaResult<()> {
        log::info!("Initializing media session: {}", session_id);

        // Create audio buffer for this session
        let audio_buffer = Arc::new(AudioBuffer::new(48000 * 2)); // 1 second buffer
        {
            let mut buffers = self.audio_buffers.lock().await;
            buffers.insert(session_id.clone(), audio_buffer);
        }

        // Session ID in this context is typically channel_id for voice
        let channel_id = Uuid::parse_str(&session_id)
            .map_err(|_| MediaError::InvalidRoutingType("Invalid session/channel ID".to_string()))?;

        // Check if we already have a session for this channel
        {
            let channel_sessions = self.channel_sessions.lock().await;
            if channel_sessions.contains_key(&channel_id) {
                log::info!("Media session already exists for channel {}", channel_id);
                return Ok(());
            }
        }

        // Join the voice channel via API to get routing information
        let join_response = self.join_voice_channel_api(channel_id).await?;
        
        // Create appropriate session based on routing type
        let media_session = match join_response.routing_info.session_type.as_str() {
            "mesh" => {
                self.create_mesh_session(
                    join_response.voice_session.id.clone(),
                    channel_id,
                    join_response.routing_info,
                    join_response.other_participants,
                ).await?
            }
            "sfu" => {
                return Err(MediaError::InvalidRoutingType("SFU not yet implemented".to_string()));
            }
            _ => {
                return Err(MediaError::InvalidRoutingType(
                    format!("Unknown session type: {}", join_response.routing_info.session_type)
                ));
            }
        };

        // Store the session
        {
            let mut sessions = self.active_sessions.lock().await;
            sessions.insert(join_response.voice_session.id.clone(), media_session);
        }
        {
            let mut channel_sessions = self.channel_sessions.lock().await;
            channel_sessions.insert(channel_id, join_response.voice_session.id.clone());
        }

        log::info!("Media session {} initialized for channel {}", join_response.voice_session.id, channel_id);
        Ok(())
    }

    // Add media track to session (now with real audio data)
    pub async fn add_media_track(&self, session_id: String, track_info: MediaTrackInfo) -> MediaResult<()> {
        log::info!("Adding {} track {} to session {}", track_info.kind, track_info.track_id, session_id);

        let sessions = self.active_sessions.lock().await;
        if let Some(session) = sessions.get(&session_id) {
            match session {
                MediaSession::Mesh(mesh_session) => {
                    mesh_session.add_local_track(track_info.clone()).await?;

                    // If this is an audio track, start feeding audio data to it
                    if track_info.kind == "audio" {
                        self.start_audio_streaming_for_track(&session_id, &track_info.track_id).await?;
                    }
                }
            }
        } else {
            return Err(MediaError::SessionNotFound(session_id));
        }

        Ok(())
    }

    async fn start_audio_streaming_for_track(&self, session_id: &str, track_id: &str) -> MediaResult<()> {
        log::info!("Starting audio streaming for track {} in session {}", track_id, session_id);

        let audio_buffers = self.audio_buffers.clone();
        let session_id = session_id.to_string();
        let track_id = track_id.to_string();
        let webrtc_config = self.webrtc_config.clone();

        // Start a task to continuously feed audio data to WebRTC
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_millis(10)); // 10ms intervals

            loop {
                interval.tick().await;

                let config = webrtc_config.read().await;
                let chunk_size = config.frames_per_buffer as usize * config.channels as usize;

                // Get audio buffer for this session
                let buffers = audio_buffers.lock().await;
                if let Some(buffer) = buffers.get(&session_id) {
                    if let Some(audio_chunk) = buffer.get_webrtc_chunk(chunk_size).await {
                        // In a real implementation, this would be sent to the WebRTC peer connection
                        // For now, we just log that we have audio data ready
                        log::trace!("Audio chunk ready for track {}: {} samples", track_id, audio_chunk.len());
                        
                        // TODO: Send audio_chunk to WebRTC track/sender
                        // This would involve calling methods on the RTCRtpSender
                    }
                } else {
                    // Session buffer not found, exit task
                    log::warn!("Audio buffer not found for session {}, stopping audio streaming", session_id);
                    break;
                }
            }
        });

        Ok(())
    }

    // Remove media track from session
    pub async fn remove_media_track(&self, session_id: String, track_id: String) -> MediaResult<()> {
        log::info!("Removing track {} from session {}", track_id, session_id);

        let sessions = self.active_sessions.lock().await;
        if let Some(session) = sessions.get(&session_id) {
            match session {
                MediaSession::Mesh(mesh_session) => {
                    mesh_session.remove_local_track(track_id).await?;
                }
            }
        } else {
            return Err(MediaError::SessionNotFound(session_id));
        }

        Ok(())
    }

    // ===== REMAINING METHODS (keeping existing implementations) =====

    pub async fn set_track_enabled(&self, session_id: String, track_id: String, enabled: bool) -> MediaResult<()> {
        log::debug!("Setting track {} enabled: {} in session {}", track_id, enabled, session_id);

        let sessions = self.active_sessions.lock().await;
        if let Some(session) = sessions.get(&session_id) {
            match session {
                MediaSession::Mesh(mesh_session) => {
                    mesh_session.set_track_enabled(track_id, enabled).await?;
                }
            }
        } else {
            return Err(MediaError::SessionNotFound(session_id));
        }

        Ok(())
    }

    pub async fn replace_video_track(&self, session_id: String, old_track_id: String, new_track_id: String, stream_id: String) -> MediaResult<()> {
        log::info!("Replacing video track {} with {} in session {}", old_track_id, new_track_id, session_id);

        let sessions = self.active_sessions.lock().await;
        if let Some(session) = sessions.get(&session_id) {
            match session {
                MediaSession::Mesh(mesh_session) => {
                    mesh_session.replace_video_track(old_track_id, new_track_id, stream_id).await?;
                }
            }
        } else {
            return Err(MediaError::SessionNotFound(session_id));
        }

        Ok(())
    }

    pub async fn get_media_stats(&self, session_id: String) -> MediaResult<MediaStats> {
        log::debug!("Getting media stats for session {}", session_id);

        let sessions = self.active_sessions.lock().await;
        if let Some(session) = sessions.get(&session_id) {
            match session {
                MediaSession::Mesh(mesh_session) => {
                    mesh_session.get_stats().await
                }
            }
        } else {
            Err(MediaError::SessionNotFound(session_id))
        }
    }

    pub async fn configure_media_quality(&self, session_id: String, quality_preset: String) -> MediaResult<()> {
        log::info!("Configuring media quality to {} for session {}", quality_preset, session_id);

        // Update WebRTC config based on quality preset
        {
            let mut config = self.webrtc_config.write().await;
            match quality_preset.as_str() {
                "low" => *config = WebRTCAudioConfig::low_latency(),
                "high" => *config = WebRTCAudioConfig::high_quality(),
                _ => *config = WebRTCAudioConfig::default(),
            }
        }

        let sessions = self.active_sessions.lock().await;
        if let Some(session) = sessions.get(&session_id) {
            match session {
                MediaSession::Mesh(mesh_session) => {
                    mesh_session.configure_quality(quality_preset).await?;
                }
            }
        } else {
            return Err(MediaError::SessionNotFound(session_id));
        }

        Ok(())
    }

    pub async fn handle_media_signal(&self, session_id: String, signal_type: String, signal_data: Value, from_user_id: String) -> MediaResult<()> {
        log::debug!("Handling media signal {} from {} in session {}", signal_type, from_user_id, session_id);

        let sessions = self.active_sessions.lock().await;
        if let Some(session) = sessions.get(&session_id) {
            match session {
                MediaSession::Mesh(mesh_session) => {
                    mesh_session.handle_media_signal(signal_type, signal_data, from_user_id).await?;
                }
            }
        } else {
            return Err(MediaError::SessionNotFound(session_id));
        }

        Ok(())
    }

    pub async fn send_media_signal(&self, session_id: String, signal_type: String, signal_data: Value) -> MediaResult<()> {
        log::debug!("Sending media signal {} in session {}", signal_type, session_id);

        let sessions = self.active_sessions.lock().await;
        if let Some(session) = sessions.get(&session_id) {
            match session {
                MediaSession::Mesh(_mesh_session) => {
                    // For mesh, we need to send to all peers - this is handled internally
                    // Emit event that will be picked up by WebSocket handler
                    self.app_handle.emit("broadcast_voice_signal", &serde_json::json!({
                        "session_id": session_id,
                        "signal_type": signal_type,
                        "signal_data": signal_data
                    })).map_err(|e| MediaError::ApiError(e.to_string()))?;
                }
            }
        } else {
            return Err(MediaError::SessionNotFound(session_id));
        }

        Ok(())
    }

    pub async fn get_media_sessions(&self) -> Vec<String> {
        let sessions = self.active_sessions.lock().await;
        sessions.keys().cloned().collect()
    }

    pub async fn close_media_session(&self, session_id: String) -> MediaResult<()> {
        log::info!("Closing media session: {}", session_id);

        // Clean up audio buffer for this session
        {
            let mut buffers = self.audio_buffers.lock().await;
            if let Some(buffer) = buffers.remove(&session_id) {
                let _ = buffer.clear().await;
            }
        }

        // Find and remove the session
        let session = {
            let mut sessions = self.active_sessions.lock().await;
            sessions.remove(&session_id)
        };

        if let Some(session) = session {
            // Close the session
            match session {
                MediaSession::Mesh(mesh_session) => {
                    mesh_session.close().await?;
                }
            }

            // Remove from channel mapping
            let mut channel_sessions = self.channel_sessions.lock().await;
            channel_sessions.retain(|_, s| s != &session_id);

            // Leave voice channel via API
            if let Ok(channel_id) = self.find_channel_for_session(&session_id).await {
                if let Err(e) = self.leave_voice_channel_api(channel_id).await {
                    log::error!("Failed to leave voice channel via API: {}", e);
                }
            }
        } else {
            return Err(MediaError::SessionNotFound(session_id));
        }

        log::info!("Media session {} closed successfully", session_id);
        Ok(())
    }

    pub async fn check_routing_transitions(&self) -> MediaResult<()> {
        let sessions = self.active_sessions.lock().await;
        
        for (session_id, session) in sessions.iter() {
            match session {
                MediaSession::Mesh(mesh_session) => {
                    // Check if mesh is near capacity
                    if mesh_session.is_near_capacity().await {
                        log::warn!("Mesh session {} is near capacity, should consider SFU transition", session_id);
                        
                        // Emit warning to frontend
                        self.app_handle.emit("voice_session_near_capacity", &serde_json::json!({
                            "session_id": session_id,
                            "current_participants": mesh_session.get_connection_count().await,
                            "max_participants": super::MESH_MAX_PARTICIPANTS
                        })).map_err(|e| MediaError::ApiError(e.to_string()))?;
                    }

                    // Health check
                    if let Ok(failed_peers) = mesh_session.health_check().await {
                        if !failed_peers.is_empty() {
                            log::info!("Attempting to reconnect {} failed peers in session {}", failed_peers.len(), session_id);
                            let _ = mesh_session.reconnect_failed_peers(failed_peers).await;
                        }
                    }
                }
            }
        }

        Ok(())
    }

    // ===== VIDEO METHODS (stubbed for now) =====

    pub async fn start_video_capture(&self, device_id: Option<String>, settings: crate::commands::media::VideoSettings) -> MediaResult<()> {
        log::info!("Video capture not yet implemented");
        Ok(())
    }

    pub async fn stop_video_capture(&self) -> MediaResult<()> {
        log::info!("Video capture not yet implemented");
        Ok(())
    }

    pub async fn set_video_enabled(&self, enabled: bool) -> MediaResult<()> {
        log::info!("Video enable/disable not yet implemented");
        Ok(())
    }

    pub async fn start_screen_share(&self, source_id: Option<String>, include_audio: bool) -> MediaResult<()> {
        log::info!("Screen sharing not yet implemented");
        Ok(())
    }

    pub async fn stop_screen_share(&self) -> MediaResult<()> {
        log::info!("Screen sharing not yet implemented");
        Ok(())
    }

    pub async fn get_available_screen_sources(&self) -> MediaResult<Vec<crate::commands::media::ScreenSource>> {
        Ok(vec![])
    }

    // ===== SETTINGS PERSISTENCE =====

    pub async fn save_audio_settings(&self, settings: crate::commands::media::AudioSettings) -> MediaResult<()> {
        // Convert and save to device manager
        let device_settings = super::DeviceAudioSettings {
            input_device_id: settings.input_device_id.clone(),
            output_device_id: settings.output_device_id,
            sample_rate: 48000,
            channels: if settings.input_device_id.is_some() { 2 } else { 1 },
            buffer_size: 1024,
            input_volume: settings.input_volume,
            output_volume: settings.output_volume,
            noise_suppression: settings.noise_suppression,
            echo_cancellation: settings.echo_cancellation,
            auto_gain_control: settings.auto_gain_control,
        };

        self.audio_device_manager.update_settings(device_settings).await
            .map_err(|e| MediaError::AudioDeviceError(e.to_string()))?;

        // Update processing settings
        {
            let mut proc_settings = self.processing_settings.write().await;
            proc_settings.noise_gate = settings.noise_suppression;
            proc_settings.high_pass_filter = settings.echo_cancellation;
        }

        // Set voice activation threshold if using push-to-talk
        if settings.push_to_talk {
            self.audio_device_manager.set_voice_activation_threshold(settings.voice_activation_threshold).await;
        }

        log::info!("Audio settings saved successfully");
        Ok(())
    }

    pub async fn load_audio_settings(&self) -> MediaResult<crate::commands::media::AudioSettings> {
        let device_settings = self.audio_device_manager.get_settings().await;
        
        Ok(crate::commands::media::AudioSettings {
            input_device_id: device_settings.input_device_id,
            output_device_id: device_settings.output_device_id,
            input_volume: device_settings.input_volume,
            output_volume: device_settings.output_volume,
            noise_suppression: device_settings.noise_suppression,
            echo_cancellation: device_settings.echo_cancellation,
            auto_gain_control: device_settings.auto_gain_control,
            push_to_talk: false, // Default value
            push_to_talk_key: None,
            voice_activation_threshold: 0.5,
        })
    }

    pub async fn save_video_settings(&self, settings: crate::commands::media::VideoSettings) -> MediaResult<()> {
        log::info!("Video settings persistence not yet implemented");
        Ok(())
    }

    pub async fn load_video_settings(&self) -> MediaResult<crate::commands::media::VideoSettings> {
        Ok(crate::commands::media::VideoSettings {
            camera_device_id: None,
            resolution: "720p".to_string(),
            frame_rate: 30,
            enabled: false,
        })
    }

    // ===== PRIVATE HELPER METHODS =====

    async fn join_voice_channel_api(&self, channel_id: Uuid) -> MediaResult<JoinVoiceChannelResponse> {
        log::info!("Joining voice channel {} via API", channel_id);

        // Get grid ID from channel (you'll need to implement this)
        let grid_id = self.get_grid_id_for_channel(channel_id).await?;

        let join_request = serde_json::json!({
            "audio_quality": "medium",
            "start_muted": false,
            "start_deafened": false
        });

        let _response = self.api_client
            .post(&format!("/api/v1/grids/{}/channels/{}/voice/join", grid_id, channel_id), Some(&join_request))
            .await
            .map_err(|e| MediaError::ApiError(e.to_string()))?;

        // TODO: Parse the actual response from the API client
        // For now, return a placeholder to get the code compiling
        Ok(JoinVoiceChannelResponse {
            voice_session: VoiceSession {
                id: "placeholder".to_string(),
                channel_id,
                session_type: "mesh".to_string(),
                current_participants: 1,
                max_participants: 8,
            },
            participant: VoiceParticipant {
                user_id: channel_id, // placeholder
                username: None,
                display_name: None,
                connection_type: "mesh".to_string(),
                is_speaking: false,
                is_muted: false,
            },
            routing_info: VoiceRoutingInfo {
                session_type: "mesh".to_string(),
                required_connections: Some(vec![]),
                media_constraints: MediaConstraints {
                    audio_enabled: true,
                    video_enabled: false,
                    max_bitrate: None,
                    preferred_codec: None,
                },
                sfu_connection_info: None,
            },
            other_participants: vec![],
        })
    }

    async fn leave_voice_channel_api(&self, channel_id: Uuid) -> MediaResult<()> {
        log::info!("Leaving voice channel {} via API", channel_id);

        let grid_id = self.get_grid_id_for_channel(channel_id).await?;

        let _response = self.api_client
            .delete_with_body(&format!("/api/v1/grids/{}/channels/{}/voice/leave", grid_id, channel_id), None::<&()>)
            .await
            .map_err(|e| MediaError::ApiError(e.to_string()))?;

        log::info!("Successfully left voice channel {}", channel_id);
        Ok(())
    }

    async fn create_mesh_session(
        &self,
        session_id: String,
        channel_id: Uuid,
        routing_info: VoiceRoutingInfo,
        other_participants: Vec<VoiceParticipant>,
    ) -> MediaResult<MediaSession> {
        log::info!("Creating mesh session {} for channel {}", session_id, channel_id);

        // Determine if we're the host (simplified logic)
        let is_host = other_participants.is_empty(); // If no other participants, we're likely the host

        let mesh_session = Arc::new(MeshSession::new(
            session_id.clone(),
            channel_id,
            self.app_handle.clone(),
            is_host,
        ));

        // Get required peer connections from routing info
        let required_connections = routing_info.required_connections.unwrap_or_default();
        
        // Initialize the mesh session
        mesh_session.initialize(required_connections).await?;

        log::info!("Mesh session {} created successfully", session_id);
        Ok(MediaSession::Mesh(mesh_session))
    }

    async fn get_grid_id_for_channel(&self, _channel_id: Uuid) -> MediaResult<Uuid> {
        // This would typically be cached or retrieved from your local state
        // For now, you might need to make an API call to get the grid ID
        // Or store it when you first join/create the channel
        
        // Placeholder: In a real implementation, you'd have this information
        // from when the user joined the grid/channel
        Err(MediaError::ApiError("Grid ID lookup not implemented".to_string()))
    }

    async fn find_channel_for_session(&self, session_id: &str) -> MediaResult<Uuid> {
        let channel_sessions = self.channel_sessions.lock().await;
        for (channel_id, stored_session_id) in channel_sessions.iter() {
            if stored_session_id == session_id {
                return Ok(*channel_id);
            }
        }
        Err(MediaError::SessionNotFound(session_id.to_string()))
    }

    pub fn get_audio_device_manager(&self) -> &AudioDeviceManager {
        &self.audio_device_manager
    }

    pub async fn create_voice_channel_session(&self, session_id: String, channel_id: String, grid_id: String) -> MediaResult<()> {
        log::info!("Creating voice channel session {} for channel {} in grid {}", session_id, channel_id, grid_id);

        // Store the grid_id -> channel_id mapping to avoid the lookup error
        let channel_uuid = Uuid::parse_str(&channel_id)
            .map_err(|e| MediaError::InvalidRoutingType(format!("Invalid channel ID: {}", e)))?;
        let grid_uuid = Uuid::parse_str(&grid_id)
            .map_err(|e| MediaError::InvalidRoutingType(format!("Invalid grid ID: {}", e)))?;

        // Create audio buffer for this session
        let audio_buffer = Arc::new(AudioBuffer::new(48000 * 2)); // 1 second buffer
        {
            let mut buffers = self.audio_buffers.lock().await;
            buffers.insert(session_id.clone(), audio_buffer);
        }

        // Store the session without requiring API lookup
        {
            let mut channel_sessions = self.channel_sessions.lock().await;
            channel_sessions.insert(channel_uuid, session_id.clone());
        }

        // Create a simplified voice session (bypassing the API call for now)
        let voice_session = VoiceSession {
            id: session_id.clone(),
            channel_id: channel_uuid,
            session_type: "mesh".to_string(),
            current_participants: 1,
            max_participants: 8,
        };

        let routing_info = VoiceRoutingInfo {
            session_type: "mesh".to_string(),
            required_connections: Some(vec![]),
            media_constraints: MediaConstraints {
                audio_enabled: true,
                video_enabled: false,
                max_bitrate: None,
                preferred_codec: None,
            },
            sfu_connection_info: None,
        };

        // Create mesh session
        let media_session = self.create_mesh_session(
            voice_session.id.clone(),
            channel_uuid,
            routing_info,
            vec![], // No other participants initially
        ).await?;

        // Store the session
        {
            let mut sessions = self.active_sessions.lock().await;
            sessions.insert(voice_session.id.clone(), media_session);
        }

        log::info!("Voice channel media session {} created for channel {} in grid {}", session_id, channel_id, grid_id);
        Ok(())
    }

}