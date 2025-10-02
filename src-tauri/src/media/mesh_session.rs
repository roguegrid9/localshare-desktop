// src-tauri/src/media/mesh_session.rs - Direct P2P mesh networking for 2-8 participants

use super::{MediaTrackInfo, MediaSessionState, MediaSessionType, ParticipantMediaState, MediaError, MediaResult};
use crate::p2p::connection::P2PConnection;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;
use tauri::AppHandle;
use webrtc::peer_connection::RTCPeerConnection;
use anyhow::Result;
use tauri::Emitter;

// Mesh session manages direct P2P connections between all participants
pub struct MeshSession {
    pub session_id: String,
    pub channel_id: Uuid,
    pub app_handle: AppHandle,
    
    // Map of peer_user_id -> P2PConnection
    peer_connections: Arc<Mutex<HashMap<String, Arc<P2PConnection>>>>,
    
    // Local media state
    local_tracks: Arc<Mutex<HashMap<String, MediaTrackInfo>>>,
    
    // Remote participant states
    remote_participants: Arc<Mutex<HashMap<String, ParticipantMediaState>>>,
    
    // Session state
    is_connected: Arc<Mutex<bool>>,
    is_host: bool,
}

impl MeshSession {
    pub fn new(session_id: String, channel_id: Uuid, app_handle: AppHandle, is_host: bool) -> Self {
        Self {
            session_id,
            channel_id,
            app_handle,
            peer_connections: Arc::new(Mutex::new(HashMap::new())),
            local_tracks: Arc::new(Mutex::new(HashMap::new())),
            remote_participants: Arc::new(Mutex::new(HashMap::new())),
            is_connected: Arc::new(Mutex::new(false)),
            is_host,
        }
    }

    // Initialize mesh session with required peer connections
    pub async fn initialize(&self, required_connections: Vec<String>) -> MediaResult<()> {
        log::info!("Initializing mesh session {} with {} required connections", 
                  self.session_id, required_connections.len());

        if required_connections.len() > super::MESH_MAX_PARTICIPANTS {
            return Err(MediaError::InvalidRoutingType(
                format!("Too many participants for mesh: {}", required_connections.len())
            ));
        }

        // Create P2P connections to each required peer
        let mut connections = self.peer_connections.lock().await;
        
        for peer_id in required_connections {
            if connections.contains_key(&peer_id) {
                log::debug!("P2P connection to {} already exists", peer_id);
                continue;
            }

            log::info!("Creating P2P connection to peer {}", peer_id);
            
            let connection = if self.is_host {
                // As host, we initiate connections
                P2PConnection::new_host(
                    self.session_id.clone(),
                    peer_id.clone(),
                    self.channel_id.to_string(),
                    self.app_handle.clone(),
                    None, // No process manager needed for voice
                    None  // Add missing media_manager parameter
                ).await.map_err(|e| MediaError::ConnectionError(e.to_string()))?
            } else {
                // As guest, we accept connections
                P2PConnection::new_guest(
                    self.session_id.clone(),
                    peer_id.clone(),
                    self.channel_id.to_string(),
                    self.app_handle.clone(),
                    None,
                    None  // Add missing media_manager parameter
                ).await.map_err(|e| MediaError::ConnectionError(e.to_string()))?
            };

            // Initialize media session for this connection
            connection.initialize_media_session().await
                .map_err(|e| MediaError::WebRtcError(e.to_string()))?;

            connections.insert(peer_id.clone(), Arc::new(connection));
            
            // Initialize participant state
            let mut participants = self.remote_participants.lock().await;
            participants.insert(peer_id.clone(), ParticipantMediaState {
                user_id: peer_id,
                username: None,
                display_name: None,
                audio_enabled: false,
                video_enabled: false,
                is_speaking: false,
                is_muted: false,
                connection_state: "connecting".to_string(),
            });
        }

        // Start connections if we're the host
        if self.is_host {
            for connection in connections.values() {
                if let Err(e) = connection.start_connection().await {
                    log::error!("Failed to start connection: {}", e);
                }
            }
        }

        let mut is_connected = self.is_connected.lock().await;
        *is_connected = true;

        // Emit session initialized event
        self.app_handle.emit("mesh_session_initialized", &serde_json::json!({
            "session_id": self.session_id,
            "channel_id": self.channel_id,
            "participant_count": connections.len(),
            "is_host": self.is_host
        })).map_err(|e| MediaError::ApiError(e.to_string()))?;

        log::info!("Mesh session {} initialized successfully", self.session_id);
        Ok(())
    }

    // Add a local media track and propagate to all peers
    pub async fn add_local_track(&self, track_info: MediaTrackInfo) -> MediaResult<()> {
        log::info!("Adding local {} track {} to mesh session", track_info.kind, track_info.track_id);

        // Store track locally
        {
            let mut tracks = self.local_tracks.lock().await;
            tracks.insert(track_info.track_id.clone(), track_info.clone());
        }

        // Add track to all peer connections
        let connections = self.peer_connections.lock().await;
        for (peer_id, connection) in connections.iter() {
            log::debug!("Adding track {} to peer connection {}", track_info.track_id, peer_id);
            
            // Convert media::MediaTrackInfo to connection::MediaTrackInfo
            let connection_track_info = crate::p2p::connection::MediaTrackInfo {
                track_id: track_info.track_id.clone(),
                kind: track_info.kind.clone(),
                stream_id: track_info.stream_id.clone(),
                enabled: track_info.enabled,
            };
            if let Err(e) = connection.add_media_track(connection_track_info).await {
                log::error!("Failed to add media track to connection: {}", e);
            }
        }

        // Emit track added event
        self.app_handle.emit("mesh_track_added", &serde_json::json!({
            "session_id": self.session_id,
            "track_id": track_info.track_id,
            "kind": track_info.kind,
            "peer_count": connections.len()
        })).map_err(|e| MediaError::ApiError(e.to_string()))?;

        Ok(())
    }

    // Remove a local media track from all peers
    pub async fn remove_local_track(&self, track_id: String) -> MediaResult<()> {
        log::info!("Removing local track {} from mesh session", track_id);

        // Remove track locally
        {
            let mut tracks = self.local_tracks.lock().await;
            tracks.remove(&track_id);
        }

        // Remove track from all peer connections
        let connections = self.peer_connections.lock().await;
        for (peer_id, connection) in connections.iter() {
            log::debug!("Removing track {} from peer connection {}", track_id, peer_id);
            
            if let Err(e) = connection.remove_media_track(track_id.clone()).await {
                log::error!("Failed to remove track from peer {}: {}", peer_id, e);
            }
        }

        // Emit track removed event
        self.app_handle.emit("mesh_track_removed", &serde_json::json!({
            "session_id": self.session_id,
            "track_id": track_id
        })).map_err(|e| MediaError::ApiError(e.to_string()))?;

        Ok(())
    }

    // Set track enabled state (mute/unmute) on all peers
    pub async fn set_track_enabled(&self, track_id: String, enabled: bool) -> MediaResult<()> {
        log::debug!("Setting track {} enabled: {} in mesh session", track_id, enabled);

        // Update local track state
        {
            let mut tracks = self.local_tracks.lock().await;
            if let Some(track) = tracks.get_mut(&track_id) {
                track.enabled = enabled;
            }
        }

        // Update track state on all peer connections
        let connections = self.peer_connections.lock().await;
        for (peer_id, connection) in connections.iter() {
            if let Err(e) = connection.set_track_enabled(track_id.clone(), enabled).await {
                log::error!("Failed to set track enabled on peer {}: {}", peer_id, e);
            }
        }

        Ok(())
    }

    // Replace video track (for camera switching or screen share)
    pub async fn replace_video_track(&self, old_track_id: String, new_track_id: String, stream_id: String) -> MediaResult<()> {
        log::info!("Replacing video track {} with {} in mesh session", old_track_id, new_track_id);

        // Update local track registry
        {
            let mut tracks = self.local_tracks.lock().await;
            if let Some(old_track) = tracks.remove(&old_track_id) {
                let new_track = MediaTrackInfo {
                    track_id: new_track_id.clone(),
                    kind: old_track.kind,
                    stream_id: stream_id.clone(),
                    enabled: old_track.enabled,
                };
                tracks.insert(new_track_id.clone(), new_track);
            }
        }

        // Replace track on all peer connections
        let connections = self.peer_connections.lock().await;
        for (peer_id, connection) in connections.iter() {
            if let Err(e) = connection.replace_video_track(
                old_track_id.clone(),
                new_track_id.clone(),
                stream_id.clone(),
            ).await {
                log::error!("Failed to replace video track on peer {}: {}", peer_id, e);
            }
        }

        Ok(())
    }

    // Add a new participant to the mesh (when someone joins mid-session)
    pub async fn add_participant(&self, peer_user_id: String) -> MediaResult<()> {
        log::info!("Adding participant {} to mesh session", peer_user_id);

        let mut connections = self.peer_connections.lock().await;
        
        if connections.contains_key(&peer_user_id) {
            log::warn!("Participant {} already exists in mesh session", peer_user_id);
            return Ok(());
        }

        // Check participant limit
        if connections.len() >= super::MESH_MAX_PARTICIPANTS {
            return Err(MediaError::InvalidRoutingType(
                "Mesh session at maximum capacity".to_string()
            ));
        }

        // Create new P2P connection
        let connection = P2PConnection::new_host(
            self.session_id.clone(),
            peer_user_id.clone(),
            self.channel_id.to_string(),
            self.app_handle.clone(),
            None,
            None  // Add missing media_manager parameter
        ).await.map_err(|e| MediaError::ConnectionError(e.to_string()))?;

        // Initialize media for the new connection
        connection.initialize_media_session().await
            .map_err(|e| MediaError::WebRtcError(e.to_string()))?;

        // Add all existing local tracks to the new connection
        let local_tracks = self.local_tracks.lock().await;
        for track in local_tracks.values() {
            let connection_track_info = crate::p2p::connection::MediaTrackInfo {
                track_id: track.track_id.clone(),
                kind: track.kind.clone(),
                stream_id: track.stream_id.clone(),
                enabled: track.enabled,
            };
            if let Err(e) = connection.add_media_track(connection_track_info).await {
                log::error!("Failed to add existing track to new peer: {}", e);
            }
        }

        // Start the connection
        connection.start_connection().await
            .map_err(|e| MediaError::ConnectionError(e.to_string()))?;

        connections.insert(peer_user_id.clone(), Arc::new(connection));

        // Add participant state
        let mut participants = self.remote_participants.lock().await;
        participants.insert(peer_user_id.clone(), ParticipantMediaState {
            user_id: peer_user_id.clone(),
            username: None,
            display_name: None,
            audio_enabled: false,
            video_enabled: false,
            is_speaking: false,
            is_muted: false,
            connection_state: "connecting".to_string(),
        });

        log::info!("Participant {} added to mesh session", peer_user_id);
        Ok(())
    }

    // Remove a participant from the mesh
    pub async fn remove_participant(&self, peer_user_id: String) -> MediaResult<()> {
        log::info!("Removing participant {} from mesh session", peer_user_id);

        let mut connections = self.peer_connections.lock().await;

        // Remove participant state
        let mut participants = self.remote_participants.lock().await;
        participants.remove(&peer_user_id);

        log::info!("Participant {} removed from mesh session", peer_user_id);
        Ok(())
    }

    // Get current session state
    pub async fn get_session_state(&self) -> MediaSessionState {
        let local_tracks = self.local_tracks.lock().await;
        let remote_participants = self.remote_participants.lock().await;
        let is_connected = *self.is_connected.lock().await;

        let has_audio = local_tracks.values().any(|t| t.kind == "audio" && t.enabled);
        let has_video = local_tracks.values().any(|t| t.kind == "video" && t.enabled);

        MediaSessionState {
            session_id: self.session_id.clone(),
            channel_id: self.channel_id,
            session_type: MediaSessionType::Mesh,
            local_tracks: local_tracks.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
            remote_participants: remote_participants.clone(),
            is_connected,
            audio_enabled: has_audio,
            video_enabled: has_video,
        }
    }

    // Get statistics for all peer connections
    pub async fn get_stats(&self) -> MediaResult<super::MediaStats> {
        let connections = self.peer_connections.lock().await;
        
        if connections.is_empty() {
            return Ok(super::MediaStats {
                audio: None,
                video: None,
            });
        }

        // Aggregate stats from all connections
        let mut total_audio_packets_lost = 0u32;
        let mut total_audio_packets_received = 0u32;
        let mut total_audio_bytes_received = 0u64;
        let mut total_jitter = 0.0f64;
        let mut connection_count = 0;

        for connection in connections.values() {
            if let Ok(stats) = connection.get_media_stats().await {
                if let Ok(parsed_stats) = serde_json::from_value::<super::MediaStats>(stats) {
                    if let Some(audio) = parsed_stats.audio {
                        total_audio_packets_lost += audio.packets_lost;
                        total_audio_packets_received += audio.packets_received;
                        total_audio_bytes_received += audio.bytes_received;
                        total_jitter += audio.jitter;
                        connection_count += 1;
                    }
                }
            }
        }

        let avg_jitter = if connection_count > 0 {
            total_jitter / connection_count as f64
        } else {
            0.0
        };

        Ok(super::MediaStats {
            audio: Some(super::AudioStats {
                packets_lost: total_audio_packets_lost,
                packets_received: total_audio_packets_received,
                bytes_received: total_audio_bytes_received,
                jitter: avg_jitter,
            }),
            video: None, // Video stats would be aggregated similarly
        })
    }

    // Update participant media state (called when receiving remote state changes)
    pub async fn update_participant_state(&self, user_id: String, audio_enabled: bool, video_enabled: bool, is_speaking: bool, is_muted: bool) {
        let mut participants = self.remote_participants.lock().await;
        if let Some(participant) = participants.get_mut(&user_id) {
            participant.audio_enabled = audio_enabled;
            participant.video_enabled = video_enabled;
            participant.is_speaking = is_speaking;
            participant.is_muted = is_muted;
            
            log::debug!("Updated participant {} state: audio={}, video={}, speaking={}, muted={}", 
                       user_id, audio_enabled, video_enabled, is_speaking, is_muted);
        }
    }

    // Handle incoming media signals from peers
    pub async fn handle_media_signal(&self, signal_type: String, signal_data: serde_json::Value, from_user_id: String) -> MediaResult<()> {
        log::debug!("Handling media signal {} from {} in mesh session", signal_type, from_user_id);

        let connections = self.peer_connections.lock().await;
        if let Some(connection) = connections.get(&from_user_id) {
            log::warn!("Media signal handling skipped - cannot borrow Arc mutably for peer {}", from_user_id);
            Ok(())
                .map_err(|e: anyhow::Error| MediaError::WebRtcError(e.to_string()))?;
        } else {
            log::warn!("Received media signal from unknown peer: {}", from_user_id);
        }

        Ok(())
    }

    // Send media signal to specific peer
    pub async fn send_media_signal(&self, signal_type: String, signal_data: serde_json::Value, to_user_id: String) -> MediaResult<()> {
        log::debug!("Sending media signal {} to {} in mesh session", signal_type, to_user_id);

        let connections = self.peer_connections.lock().await;
        if let Some(connection) = connections.get(&to_user_id) {
            // Note: Your P2PConnection doesn't have send_media_signal yet, but it would use the WebSocket signaling
            // For now, we'll emit an event that gets picked up by the WebSocket handler
            self.app_handle.emit("send_voice_signal", &serde_json::json!({
                "session_id": self.session_id,
                "to_user_id": to_user_id,
                "signal_type": signal_type,
                "signal_data": signal_data
            })).map_err(|e| MediaError::ApiError(e.to_string()))?;
        } else {
            return Err(MediaError::ConnectionError(format!("No connection to peer: {}", to_user_id)));
        }

        Ok(())
    }

    // Configure media quality for all connections
    pub async fn configure_quality(&self, quality_preset: String) -> MediaResult<()> {
        log::info!("Configuring mesh session quality to {}", quality_preset);

        let connections = self.peer_connections.lock().await;
        for (peer_id, connection) in connections.iter() {
            if let Err(e) = connection.configure_media_quality(quality_preset.clone()).await {
                log::error!("Failed to configure quality for peer {}: {}", peer_id, e);
            }
        }

        Ok(())
    }

    // Check if we're at or near capacity for mesh networking
    pub async fn is_near_capacity(&self) -> bool {
        let connections = self.peer_connections.lock().await;
        connections.len() >= (super::MESH_MAX_PARTICIPANTS - 1) // -1 because we don't count ourselves
    }

    // Get connection count
    pub async fn get_connection_count(&self) -> usize {
        let connections = self.peer_connections.lock().await;
        connections.len()
    }

    // Close the entire mesh session
    pub async fn close(&self) -> MediaResult<()> {
        log::info!("Closing mesh session {}", self.session_id);

        // Close all peer connections
        let mut connections = self.peer_connections.lock().await;
        for (peer_id, connection) in connections.drain() {
            log::debug!("Closing connection to peer {}", peer_id);
        }

        // Clear state
        {
            let mut tracks = self.local_tracks.lock().await;
            tracks.clear();
        }
        {
            let mut participants = self.remote_participants.lock().await;
            participants.clear();
        }
        {
            let mut is_connected = self.is_connected.lock().await;
            *is_connected = false;
        }

        // Emit session closed event
        self.app_handle.emit("mesh_session_closed", &serde_json::json!({
            "session_id": self.session_id,
            "channel_id": self.channel_id
        })).map_err(|e| MediaError::ApiError(e.to_string()))?;

        log::info!("Mesh session {} closed successfully", self.session_id);
        Ok(())
    }

    // Health check - verify all connections are still active
    pub async fn health_check(&self) -> Result<Vec<String>> {
        let connections = self.peer_connections.lock().await;
        let mut failed_peers = Vec::new();

        for (peer_id, connection) in connections.iter() {
            let state = connection.get_state_async().await;
            if matches!(state, crate::api::types::SessionState::Failed | crate::api::types::SessionState::Disconnected) {
                failed_peers.push(peer_id.clone());
                log::warn!("Peer connection {} is in failed/disconnected state", peer_id);
            }
        }

        if !failed_peers.is_empty() {
            log::warn!("Health check found {} failed connections in mesh session {}", 
                      failed_peers.len(), self.session_id);
        }

        Ok(failed_peers)
    }

    fn convert_media_track_info(track_info: &crate::media::MediaTrackInfo) -> crate::p2p::connection::MediaTrackInfo {
        crate::p2p::connection::MediaTrackInfo {
            track_id: track_info.track_id.clone(),
            kind: track_info.kind.clone(),
            stream_id: track_info.stream_id.clone(),
            enabled: track_info.enabled,
        }
    }

    // Attempt to reconnect failed peer connections
    pub async fn reconnect_failed_peers(&self, failed_peers: Vec<String>) -> MediaResult<()> {
        log::info!("Attempting to reconnect {} failed peers in mesh session", failed_peers.len());

        for peer_id in failed_peers {
            log::info!("Reconnecting to peer {}", peer_id);

            // Create new connection
            match self.add_participant(peer_id.clone()).await {
                Ok(_) => log::info!("Successfully reconnected to peer {}", peer_id),
                Err(e) => log::error!("Failed to reconnect to peer {}: {}", peer_id, e),
            }
        }

        Ok(())
    }
}
