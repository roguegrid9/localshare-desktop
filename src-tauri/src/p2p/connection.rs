// src-tauri/src/p2p/connection.rs - UPDATED with TURN support, transport integration and MediaManager
use crate::api::types::{SessionState, SessionStateEvent};
use crate::media::MediaManager;
use crate::process::ProcessManager;
use crate::transport::{create_transport, TransportConfig, TransportInstance};
use anyhow::{Context, Result};
use chrono::Utc;
use interceptor::registry::Registry;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::AppHandle;
use tauri::Emitter;
use tokio::sync::{mpsc, Mutex};
use webrtc::api::interceptor_registry::register_default_interceptors;
use webrtc::api::media_engine::{MediaEngine, MIME_TYPE_H264, MIME_TYPE_OPUS, MIME_TYPE_VP8};
use webrtc::api::APIBuilder;
use webrtc::data_channel::data_channel_message::DataChannelMessage;
use webrtc::data_channel::RTCDataChannel;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;
use webrtc::peer_connection::RTCPeerConnection;
use webrtc::rtp_transceiver::rtp_codec::{
    RTCRtpCodecCapability, RTCRtpCodecParameters, RTPCodecType,
};
use webrtc::rtp_transceiver::rtp_sender::RTCRtpSender;
use webrtc::track::track_remote::TrackRemote;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TurnServerConfig {
    pub id: String,
    pub region: String,
    pub urls: Vec<String>,
    pub username: String,
    pub credential: String,
    #[serde(rename = "credentialType")]
    pub credential_type: String,
    #[serde(rename = "authType", default)]
    pub auth_type: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct StunServerConfig {
    pub urls: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RelayConfig {
    pub turn_servers: Vec<TurnServerConfig>,
    pub stun_servers: Vec<StunServerConfig>,
}

// API response structures
#[derive(Debug, Deserialize)]
struct TurnConfigApiResponse {
    turn_servers: Vec<ApiTurnServerConfig>,
    stun_servers: Vec<ApiStunServerConfig>,
    ttl: u32,
    version: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
struct ApiTurnServerConfig {
    id: String,
    region: String,
    urls: Vec<String>,
    username: String,
    credential: String,
    #[serde(rename = "credentialType")]
    credential_type: String,
    #[serde(rename = "authType", default)]
    auth_type: Option<String>,
    #[serde(default)]
    priority: i32,
}

#[derive(Debug, Deserialize)]
struct ApiStunServerConfig {
    urls: Vec<String>,
}

impl RelayConfig {
    pub async fn load_from_api() -> Self {
        // Try to fetch from your backend API
        match Self::fetch_from_backend().await {
            Ok(config) => {
                log::info!("Successfully loaded TURN config from API");
                config
            }
            Err(e) => {
                log::warn!(
                    "Failed to load TURN config from API: {}, using fallback",
                    e
                );
                Self::fallback_config()
            }
        }
    }

    pub async fn load_from_api_for_grid(grid_id: &str, auth_token: &str) -> Self {
        // Fetch grid-specific TURN config (for future bandwidth tracking)
        match Self::fetch_for_grid(grid_id, auth_token).await {
            Ok(config) => {
                log::info!("Successfully loaded TURN config for grid: {}", grid_id);
                config
            }
            Err(e) => {
                log::warn!(
                    "Failed to load TURN config for grid {}: {}, using fallback",
                    grid_id,
                    e
                );
                Self::fallback_config()
            }
        }
    }

    async fn fetch_from_backend() -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()?;

        let response = client
            .get("https://roguegrid9-coordinator.fly.dev/api/v1/turn-config")
            .header("User-Agent", "RogueGrid9-Client/1.0")
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(format!("API returned status: {}", response.status()).into());
        }

        let api_response: TurnConfigApiResponse = response.json().await?;

        // Convert API response to our internal format
        let config = Self {
            turn_servers: api_response
                .turn_servers
                .into_iter()
                .map(|server| TurnServerConfig {
                    id: server.id,
                    region: server.region,
                    urls: server.urls,
                    username: server.username,
                    credential: server.credential,
                    credential_type: server.credential_type,
                    auth_type: server.auth_type,
                })
                .collect(),
            stun_servers: api_response
                .stun_servers
                .into_iter()
                .map(|server| StunServerConfig { urls: server.urls })
                .collect(),
        };

        log::info!(
            "Loaded TURN config - {} TURN servers, {} STUN servers, TTL: {}s",
            config.turn_servers.len(),
            config.stun_servers.len(),
            api_response.ttl
        );

        Ok(config)
    }

    async fn fetch_for_grid(
        grid_id: &str,
        auth_token: &str,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()?;

        let response = client
            .get("https://roguegrid9-coordinator.fly.dev/api/v1/turn-config")
            .query(&[("grid_id", grid_id)])
            .header("Authorization", format!("Bearer {}", auth_token))
            .header("User-Agent", "RogueGrid9-Client/1.0")
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(format!("API returned status: {}", response.status()).into());
        }

        let api_response: TurnConfigApiResponse = response.json().await?;

        let config = Self {
            turn_servers: api_response
                .turn_servers
                .into_iter()
                .map(|server| TurnServerConfig {
                    id: server.id,
                    region: server.region,
                    urls: server.urls,
                    username: server.username,
                    credential: server.credential,
                    credential_type: server.credential_type,
                    auth_type: server.auth_type,
                })
                .collect(),
            stun_servers: api_response
                .stun_servers
                .into_iter()
                .map(|server| StunServerConfig { urls: server.urls })
                .collect(),
        };

        log::info!("Loaded grid-specific TURN config for {}", grid_id);

        Ok(config)
    }

    pub fn fallback_config() -> Self {
        log::warn!("Using fallback STUN configuration");
        Self {
            turn_servers: vec![],
            stun_servers: vec![
                StunServerConfig {
                    urls: vec!["stun:stun.l.google.com:19302".to_string()],
                },
                StunServerConfig {
                    urls: vec!["stun:stun1.l.google.com:19302".to_string()],
                },
                StunServerConfig {
                    urls: vec!["stun:stun.cloudflare.com:3478".to_string()],
                },
            ],
        }
    }

    pub fn to_webrtc_ice_servers(&self) -> Vec<webrtc::ice_transport::ice_server::RTCIceServer> {
        let mut ice_servers = Vec::new();

        // Add STUN servers first (lowest cost, try these first)
        for stun in &self.stun_servers {
            ice_servers.push(webrtc::ice_transport::ice_server::RTCIceServer {
                urls: stun.urls.clone(),
                ..Default::default()
            });
        }

        // Add TURN servers (higher cost, fallback option)
        for turn in &self.turn_servers {
            // For time-limited auth, we need to generate fresh credentials
            let (username, credential) =
                if turn.auth_type.as_ref().map(|s| s.as_str()) == Some("time-limited") {
                    self.generate_turn_credentials(&turn.credential)
                } else {
                    (turn.username.clone(), turn.credential.clone())
                };

            ice_servers.push(webrtc::ice_transport::ice_server::RTCIceServer {
                urls: turn.urls.clone(),
                username,
                credential,
                ..Default::default()
            });
        }

        log::info!(
            "Configured {} ICE servers ({} STUN, {} TURN)",
            ice_servers.len(),
            self.stun_servers.len(),
            self.turn_servers.len()
        );

        ice_servers
    }
    

    fn generate_turn_credentials(&self, secret: &str) -> (String, String) {
        use std::time::{SystemTime, UNIX_EPOCH};

        // Generate timestamp 24 hours in the future
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + 86400;

        let username = format!("{}:roguegrid9", timestamp);

        // Generate HMAC-SHA1 credential
        use hmac::{Hmac, Mac};
        use sha1::Sha1;

        let mut mac = Hmac::<Sha1>::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(username.as_bytes());
        let result = mac.finalize();
        let credential = base64::encode(result.into_bytes());

        (username, credential)
    }
}

// Media-specific imports and types
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MediaTrackInfo {
    pub track_id: String,
    pub kind: String, // "audio" or "video"
    pub stream_id: String,
    pub enabled: bool,
}

#[derive(Debug)]
pub struct MediaSession {
    pub session_id: String,
    pub local_tracks: HashMap<String, Arc<RTCRtpSender>>,
    pub remote_tracks: HashMap<String, Arc<TrackRemote>>,
    pub media_enabled: bool,
}

// Updated P2PConnection struct with transport layer and MediaManager:
pub struct P2PConnection {
    session_id: String,
    peer_user_id: String,
    grid_id: String,
    is_host: bool,
    state: Arc<Mutex<SessionState>>,
    peer_connection: Arc<Mutex<Option<Arc<RTCPeerConnection>>>>,
    data_channel: Arc<Mutex<Option<Arc<RTCDataChannel>>>>,
    app_handle: AppHandle,
    signal_sender: Arc<Mutex<Option<mpsc::UnboundedSender<serde_json::Value>>>>,
    created_at: u64,
    process_manager: Arc<Mutex<Option<ProcessManager>>>,
    active_transports: Arc<Mutex<HashMap<String, TransportInstance>>>,
    transport_configs: Arc<Mutex<Vec<TransportConfig>>>, // Pending transport configurations
    media_manager: Arc<Mutex<Option<MediaManager>>>,
    connection_type: Arc<Mutex<String>>, // "direct_p2p", "stun_assisted", "turn_relay"
    bytes_sent: Arc<Mutex<u64>>,
    bytes_received: Arc<Mutex<u64>>,
    session_start_time: u64,
    reporting_task: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
}

impl P2PConnection {
    pub async fn new_host(
        session_id: String,
        peer_user_id: String,
        grid_id: String,
        app_handle: AppHandle,
        process_manager: Option<Arc<Mutex<Option<ProcessManager>>>>,
        media_manager: Option<Arc<Mutex<Option<MediaManager>>>>,
    ) -> Result<Self> {
        let created_at = Utc::now().timestamp() as u64;

        let connection = Self {
            session_id: session_id.clone(),
            peer_user_id: peer_user_id.clone(),
            grid_id: grid_id.clone(),
            is_host: true,
            state: Arc::new(Mutex::new(SessionState::Inviting)),
            peer_connection: Arc::new(Mutex::new(None)),
            data_channel: Arc::new(Mutex::new(None)),
            app_handle: app_handle.clone(),
            signal_sender: Arc::new(Mutex::new(None)),
            created_at,
            process_manager: process_manager.unwrap_or_else(|| Arc::new(Mutex::new(None))),
            // Initialize transport layer
            active_transports: Arc::new(Mutex::new(HashMap::new())),
            transport_configs: Arc::new(Mutex::new(Vec::new())),
            // Initialize MediaManager
            media_manager: media_manager.unwrap_or_else(|| Arc::new(Mutex::new(None))),
            connection_type: Arc::new(Mutex::new("unknown".to_string())),
            bytes_sent: Arc::new(Mutex::new(0)),
            bytes_received: Arc::new(Mutex::new(0)),
            session_start_time: created_at,
            reporting_task: Arc::new(Mutex::new(None)),
        };

        connection.emit_state_change(None).await?;
        Ok(connection)
    }

    pub async fn new_guest(
        session_id: String,
        peer_user_id: String,
        grid_id: String,
        app_handle: AppHandle,
        process_manager: Option<Arc<Mutex<Option<ProcessManager>>>>,
        media_manager: Option<Arc<Mutex<Option<MediaManager>>>>,
    ) -> Result<Self> {
        let created_at = Utc::now().timestamp() as u64;

        let connection = Self {
            session_id: session_id.clone(),
            peer_user_id: peer_user_id.clone(),
            grid_id: grid_id.clone(),
            is_host: false,
            state: Arc::new(Mutex::new(SessionState::Connecting)),
            peer_connection: Arc::new(Mutex::new(None)),
            data_channel: Arc::new(Mutex::new(None)),
            app_handle: app_handle.clone(),
            signal_sender: Arc::new(Mutex::new(None)),
            created_at,
            process_manager: process_manager.unwrap_or_else(|| Arc::new(Mutex::new(None))),
            active_transports: Arc::new(Mutex::new(HashMap::new())),
            transport_configs: Arc::new(Mutex::new(Vec::new())),
            media_manager: media_manager.unwrap_or_else(|| Arc::new(Mutex::new(None))),
            connection_type: Arc::new(Mutex::new("unknown".to_string())),
            bytes_sent: Arc::new(Mutex::new(0)),
            bytes_received: Arc::new(Mutex::new(0)),
            session_start_time: created_at,
            reporting_task: Arc::new(Mutex::new(None)),
        };

        connection.init_webrtc().await?;
        connection.emit_state_change(None).await?;

        Ok(connection)
    }

    // Add transport configuration (called before connection is established)
    pub async fn add_transport_config(&self, config: TransportConfig) -> Result<()> {
        log::info!("Adding transport config: {:?}", config);

        let mut configs = self.transport_configs.lock().await;
        configs.push(config);

        // If connection is already established, start the transport immediately
        let state = {
            let state_guard = self.state.lock().await;
            state_guard.clone()
        };

        if state == SessionState::Connected {
            self.start_pending_transports().await?;
        }

        Ok(())
    }

    // Start all pending transports when connection is established
    async fn start_pending_transports(&self) -> Result<()> {
        let data_channel = {
            let dc_guard = self.data_channel.lock().await;
            dc_guard.clone()
        };

        if let Some(dc) = data_channel {
            let mut configs = self.transport_configs.lock().await;
            let pending_configs = configs.drain(..).collect::<Vec<_>>();
            drop(configs);

            for config in pending_configs {
                if let Err(e) = self.start_transport(config, dc.clone()).await {
                    log::error!("Failed to start transport: {}", e);
                }
            }
        }

        Ok(())
    }

    pub async fn send_data(&self, data: Vec<u8>) -> Result<()> {
        let dc_guard = self.data_channel.lock().await;
        if let Some(data_channel) = dc_guard.as_ref() {
            let bytes = bytes::Bytes::from(data);
            let data_len = bytes.len() as u64;

            data_channel.send(&bytes).await?;

            // Track sent bytes
            {
                let mut sent = self.bytes_sent.lock().await;
                *sent += data_len;
            }
        } else {
            return Err(anyhow::anyhow!("🔌 Connection lost. The P2P connection is not available. Auto-reconnection will attempt to restore the connection."));
        }
        Ok(())
    }

    pub async fn handle_signal(&mut self, signal_data: serde_json::Value) -> Result<()> {
        log::info!("Handling WebRTC signal for session {}", self.session_id);

        // Check if this is an ICE candidate (has "candidate" key but no "type" key)
        if signal_data.get("candidate").is_some() && signal_data.get("type").is_none() {
            let candidate_data = signal_data.get("candidate").unwrap();
            let candidate_str = candidate_data
                .get("candidate")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");

            log::info!("Received remote ICE candidate for session {}: {}", self.session_id,
                       candidate_str.split_whitespace().nth(7).unwrap_or("unknown-type"));

            let candidate = candidate_data
                .get("candidate")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow::anyhow!("Missing candidate string in ICE candidate"))?;

            let sdp_mid = candidate_data
                .get("sdpMid")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let sdp_mline_index = candidate_data
                .get("sdpMLineIndex")
                .and_then(|v| v.as_u64())
                .map(|i| i as u16);

            let pc_guard = self.peer_connection.lock().await;
            if let Some(peer_connection) = pc_guard.as_ref() {
                let ice_candidate = webrtc::ice_transport::ice_candidate::RTCIceCandidateInit {
                    candidate: candidate.to_string(),
                    sdp_mid,
                    sdp_mline_index,
                    username_fragment: None,
                };
                match peer_connection.add_ice_candidate(ice_candidate).await {
                    Ok(_) => {
                        log::info!("✓ Successfully added remote ICE candidate for session {}", self.session_id);
                    }
                    Err(e) => {
                        log::error!("❌ Failed to add ICE candidate for session {}: {}", self.session_id, e);
                        return Err(anyhow::anyhow!("Failed to add ICE candidate: {}", e));
                    }
                }
            } else {
                log::error!("❌ Peer connection is None when trying to add ICE candidate for session {}", self.session_id);
                return Err(anyhow::anyhow!("Peer connection not initialized"));
            }
            return Ok(());
        }

        // Get the signal type for offer/answer
        let signal_type = signal_data
            .get("type")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing signal type"))?;

        match signal_type {
            "offer" => {
                log::info!("Received WebRTC offer for session {}", self.session_id);

                // Initialize WebRTC if not already done
                if self.peer_connection.lock().await.is_none() {
                    log::info!("Initializing WebRTC for incoming offer (session {})", self.session_id);
                    self.init_webrtc().await?;
                }

                let sdp = signal_data
                    .get("sdp")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing SDP in offer"))?;

                log::debug!("Offer SDP length: {} bytes for session {}", sdp.len(), self.session_id);

                let pc_guard = self.peer_connection.lock().await;
                if let Some(peer_connection) = pc_guard.as_ref() {
                    // Set remote description (the offer)
                    let offer = webrtc::peer_connection::sdp::session_description::RTCSessionDescription::offer(
                        sdp.to_string()
                    )?;
                    log::debug!("Setting remote description (offer) for session {}", self.session_id);
                    peer_connection.set_remote_description(offer).await
                        .map_err(|e| {
                            log::error!("Failed to set remote description for session {}: {}", self.session_id, e);
                            e
                        })?;
                    log::info!("✓ Remote description set for session {}", self.session_id);

                    // Create answer
                    log::debug!("Creating answer for session {}", self.session_id);
                    let answer = peer_connection.create_answer(None).await
                        .map_err(|e| {
                            log::error!("Failed to create answer for session {}: {}", self.session_id, e);
                            e
                        })?;

                    log::debug!("Setting local description (answer) for session {}", self.session_id);
                    peer_connection.set_local_description(answer.clone()).await
                        .map_err(|e| {
                            log::error!("Failed to set local description for session {}: {}", self.session_id, e);
                            e
                        })?;

                    log::info!("✓ Created and set WebRTC answer for session {}", self.session_id);

                    // Send answer back via signal sender
                    let answer_signal = serde_json::json!({
                        "type": "webrtc_signal",
                        "payload": {
                            "to_user_id": self.peer_user_id,
                            "grid_id": self.grid_id,
                            "signal_data": {
                                "type": "answer",
                                "sdp": answer.sdp
                            }
                        }
                    });

                    let sender_guard = self.signal_sender.lock().await;
                    if let Some(sender) = sender_guard.as_ref() {
                        sender.send(answer_signal).context("Failed to send answer")?;
                    }
                }
            }
            "answer" => {
                log::info!("Received WebRTC answer for session {}", self.session_id);

                let sdp = signal_data
                    .get("sdp")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing SDP in answer"))?;

                log::debug!("Answer SDP length: {} bytes for session {}", sdp.len(), self.session_id);

                let pc_guard = self.peer_connection.lock().await;

                if let Some(peer_connection) = pc_guard.as_ref() {
                    log::debug!("Creating answer description for session {}", self.session_id);
                    let answer = webrtc::peer_connection::sdp::session_description::RTCSessionDescription::answer(
                        sdp.to_string()
                    )?;
                    log::debug!("Setting remote description (answer) for session {}", self.session_id);

                    match peer_connection.set_remote_description(answer).await {
                        Ok(_) => {
                            log::info!("✅ Set remote description (answer) successfully for session {}", self.session_id);
                        }
                        Err(e) => {
                            log::error!("❌ Failed to set remote description for session {}: {}", self.session_id, e);
                            return Err(anyhow::anyhow!("Failed to set remote description: {}", e));
                        }
                    }
                } else {
                    log::error!("❌ Peer connection is None when trying to set answer for session {}", self.session_id);
                    return Err(anyhow::anyhow!("Peer connection not initialized"));
                }
            }
            _ => {
                log::warn!("Unknown signal type: {}", signal_type);
            }
        }

        Ok(())
    }

    pub fn get_peer_user_id(&self) -> String {
        self.peer_user_id.clone()
    }

    pub async fn get_state_async(&self) -> SessionState {
        let state_guard = self.state.lock().await;
        state_guard.clone()
    }

    pub fn is_host(&self) -> bool {
        self.is_host
    }

    pub fn get_created_at(&self) -> u64 {
        self.created_at
    }

    async fn emit_state_change(&self, error_message: Option<String>) -> Result<()> {
        let state = {
            let state_guard = self.state.lock().await;
            state_guard.clone()
        };

        let state_event = SessionStateEvent {
            session_id: self.session_id.clone(),
            peer_user_id: self.peer_user_id.clone(),
            grid_id: self.grid_id.clone(),
            state,
            error_message,
        };

        self.app_handle
            .emit("session_state_changed", &state_event)?;
        Ok(())
    }

    // Start a specific transport
    async fn start_transport(
        &self,
        config: TransportConfig,
        data_channel: Arc<RTCDataChannel>,
    ) -> Result<()> {
        log::info!("Starting transport: {:?}", config);

        // Create transport instance
        let mut transport = create_transport(config.clone())?;

        // Start the transport
        let local_port = transport.start(data_channel).await?;

        // Get connection info
        let connection_info = transport.get_connection_info();

        // Store the transport
        let transport_id = format!("{}_{}", config.grid_id, config.process_id);
        {
            let mut transports = self.active_transports.lock().await;
            transports.insert(transport_id.clone(), transport);
        }

        // Emit transport started event to frontend
        self.app_handle.emit(
            "transport_started",
            &serde_json::json!({
                "transport_id": transport_id,
                "grid_id": config.grid_id,
                "process_id": config.process_id,
                "connection_info": connection_info,
                "local_port": local_port
            }),
        )?;

        log::info!(
            "Transport {} started successfully on port {}",
            transport_id,
            local_port
        );
        Ok(())
    }

    pub async fn on_connection_established(&self) -> Result<()> {
        log::info!("P2P connection established, starting pending transports");
        self.start_pending_transports().await?;
        
        // Start periodic bandwidth reporting for TURN relay connections
        let connection_type = {
            let ct = self.connection_type.lock().await;
            ct.clone()
        };
        
        if connection_type == "turn_relay" {
            log::info!("Starting periodic bandwidth reporting for TURN relay session");
            // We'll fix the periodic reporting in the next error
        }
        
        Ok(())
    }

    // Stop a specific transport
    pub async fn stop_transport(&self, transport_id: String) -> Result<()> {
        log::info!("Stopping transport: {}", transport_id);

        let mut transports = self.active_transports.lock().await;
        if let Some(mut transport) = transports.remove(&transport_id) {
            transport.stop().await?;

            // Emit transport stopped event
            self.app_handle.emit(
                "transport_stopped",
                &serde_json::json!({ "transport_id": transport_id }),
            )?;
        }

        Ok(())
    }

    /// Stop all active transports (e.g., when process crashes or disconnects)
    pub async fn stop_all_transports(&self) -> Result<()> {
        log::info!("Stopping all transports for session {}", self.session_id);

        let mut transports = self.active_transports.lock().await;
        let transport_ids: Vec<String> = transports.keys().cloned().collect();

        for transport_id in transport_ids {
            if let Some(mut transport) = transports.remove(&transport_id) {
                if let Err(e) = transport.stop().await {
                    log::error!("Failed to stop transport {}: {}", transport_id, e);
                } else {
                    log::info!("Stopped transport: {}", transport_id);
                }

                // Emit transport stopped event
                self.app_handle.emit(
                    "transport_stopped",
                    &serde_json::json!({ "transport_id": transport_id }),
                ).ok();
            }
        }

        Ok(())
    }

    // Get active transport information
    pub async fn get_active_transports(&self) -> Vec<serde_json::Value> {
        let transports = self.active_transports.lock().await;
        let mut transport_list = Vec::new();

        for (transport_id, transport) in transports.iter() {
            let connection_info = transport.get_connection_info();
            transport_list.push(serde_json::json!({
                "transport_id": transport_id,
                "connection_info": connection_info
            }));
        }

        transport_list
    }

    pub async fn set_signal_sender(&self, sender: mpsc::UnboundedSender<serde_json::Value>) {
        let mut guard = self.signal_sender.lock().await;
        *guard = Some(sender);
    }

    // Media session management with MediaManager integration
    pub async fn initialize_media_session(&self) -> Result<()> {
        log::info!(
            "Initializing media session for P2P connection {}",
            self.session_id
        );

        let media_guard = self.media_manager.lock().await;
        if let Some(media_manager) = media_guard.as_ref() {
            // Use the grid_id and a derived channel_id for P2P sessions
            let channel_id = format!("p2p_{}_{}", self.grid_id, self.peer_user_id);

            match Box::pin(media_manager.initialize_media_session(channel_id)).await {
                Ok(media_session_id) => {
                    log::info!("Media session initialized for P2P connection");

                    // Emit media session initialized event
                    self.app_handle.emit(
                        "media_session_initialized",
                        &serde_json::json!({
                            "p2p_session_id": self.session_id,
                            "media_session_id": media_session_id,
                            "grid_id": self.grid_id,
                            "peer_user_id": self.peer_user_id
                        }),
                    )?;

                    Ok(())
                }
                Err(e) => {
                    log::error!("Failed to initialize media session for P2P: {}", e);
                    Err(e.into())
                }
            }
        } else {
            Err(anyhow::anyhow!("Media manager not available"))
        }
    }

    // Add media track to peer connection using MediaManager
    pub async fn add_media_track(&self, track_info: MediaTrackInfo) -> Result<()> {
        log::info!(
            "Adding {} track {} to P2P session {}",
            track_info.kind,
            track_info.track_id,
            self.session_id
        );

        let media_guard = self.media_manager.lock().await;
        if let Some(media_manager) = media_guard.as_ref() {
            // Derive media session ID
            let media_session_id =
                format!("media_{}_{}", self.grid_id, format!("p2p_{}_{}", self.grid_id, self.peer_user_id));

            // Create the proper MediaTrackInfo struct for the media manager
            let media_track_info = crate::media::MediaTrackInfo {
                track_id: track_info.track_id.clone(),
                kind: track_info.kind.clone(),
                stream_id: track_info.stream_id.clone(),
                enabled: track_info.enabled,
            };
            Box::pin(media_manager.add_media_track(media_session_id, media_track_info)).await?;

            log::info!(
                "Media track {} added to P2P session",
                track_info.track_id
            );
        }

        Ok(())
    }

    // Remove media track from peer connection using MediaManager
    pub async fn remove_media_track(&self, track_id: String) -> Result<()> {
        log::info!(
            "Removing track {} from P2P session {}",
            track_id,
            self.session_id
        );

        let media_guard = self.media_manager.lock().await;
        if let Some(media_manager) = media_guard.as_ref() {
            let media_session_id =
                format!("media_{}_{}", self.grid_id, format!("p2p_{}_{}", self.grid_id, self.peer_user_id));
            Box::pin(media_manager.remove_media_track(media_session_id, track_id.clone())).await?;
            log::info!("Media track {} removed from P2P session", track_id);
        }

        Ok(())
    }

    // Set track enabled state (mute/unmute) using MediaManager
    pub async fn set_track_enabled(&self, track_id: String, enabled: bool) -> Result<()> {
        log::debug!(
            "Setting track {} enabled: {} in P2P session {}",
            track_id,
            enabled,
            self.session_id
        );

        let media_guard = self.media_manager.lock().await;
        if let Some(media_manager) = media_guard.as_ref() {
            let media_session_id =
                format!("media_{}_{}", self.grid_id, format!("p2p_{}_{}", self.grid_id, self.peer_user_id));
            Box::pin(media_manager.set_track_enabled(media_session_id, track_id, enabled)).await?;
        }

        Ok(())
    }

    // Replace video track (for camera switching or screen share) using MediaManager
    pub async fn replace_video_track(
        &self,
        old_track_id: String,
        new_track_id: String,
        stream_id: String,
    ) -> Result<()> {
        log::info!(
            "Replacing video track {} with {} in P2P session {}",
            old_track_id,
            new_track_id,
            self.session_id
        );

        let media_guard = self.media_manager.lock().await;
        if let Some(media_manager) = media_guard.as_ref() {
            let media_session_id =
                format!("media_{}_{}", self.grid_id, format!("p2p_{}_{}", self.grid_id, self.peer_user_id));

            Box::pin(
                media_manager.replace_video_track(
                    media_session_id,
                    old_track_id,
                    new_track_id,
                    "default_stream".to_string(),
                ),
            )
            .await?;
        }

        Ok(())
    }

    // Get media statistics using MediaManager
    pub async fn get_media_stats(&self) -> Result<serde_json::Value> {
        log::debug!("Getting media stats for P2P session {}", self.session_id);

        let media_guard = self.media_manager.lock().await;
        if let Some(media_manager) = media_guard.as_ref() {
            let media_session_id =
                format!("media_{}_{}", self.grid_id, format!("p2p_{}_{}", self.grid_id, self.peer_user_id));

            let stats = Box::pin(media_manager.get_media_stats(media_session_id)).await?;

            // Add P2P-specific stats
            let enhanced_stats = serde_json::json!({
                "media_stats": stats,
                "p2p_stats": {
                    "session_id": self.session_id,
                    "peer_user_id": self.peer_user_id,
                    "grid_id": self.grid_id,
                    "connection_state": self.get_state_async().await,
                    "is_host": self.is_host
                }
            });

            return Ok(enhanced_stats);
        }

        Err(anyhow::anyhow!("Media manager not available"))
    }

    // Configure media quality using MediaManager
    pub async fn configure_media_quality(&self, quality_preset: String) -> Result<()> {
        log::info!(
            "Configuring media quality to {} for P2P session {}",
            quality_preset,
            self.session_id
        );

        let media_guard = self.media_manager.lock().await;
        if let Some(media_manager) = media_guard.as_ref() {
            let media_session_id =
                format!("media_{}_{}", self.grid_id, format!("p2p_{}_{}", self.grid_id, self.peer_user_id));

            // Parse quality preset
            let quality = match quality_preset.as_str() {
                "low" => crate::media::codec::QualityPreset::Low,
                "standard" => crate::media::codec::QualityPreset::Standard,
                "high" => crate::media::codec::QualityPreset::High,
                _ => return Err(anyhow::anyhow!("Invalid quality preset: {}", quality_preset)),
            };

            let quality_string = match quality {
                crate::media::codec::QualityPreset::Low => "low".to_string(),
                crate::media::codec::QualityPreset::Standard => "standard".to_string(),
                crate::media::codec::QualityPreset::High => "high".to_string(),
            };
            Box::pin(media_manager.configure_media_quality(media_session_id, quality_string))
                .await?;
        }

        Ok(())
    }

    // Handle incoming media signals using MediaManager
    pub async fn handle_media_signal(
        &mut self,
        signal_type: String,
        signal_data: serde_json::Value,
        from_user_id: String,
    ) -> Result<()> {
        log::debug!(
            "Handling media signal type {} from {} in P2P session {}",
            signal_type,
            from_user_id,
            self.session_id
        );

        let media_guard = self.media_manager.lock().await;
        if let Some(media_manager) = media_guard.as_ref() {
            let media_session_id =
                format!("media_{}_{}", self.grid_id, format!("p2p_{}_{}", self.grid_id, self.peer_user_id));

            // Forward to media manager
            media_manager
                .handle_media_signal(media_session_id, signal_type, signal_data, from_user_id)
                .await?;
        }

        Ok(())
    }

    async fn init_webrtc(&self) -> Result<()> {
        log::info!(
            "🔄 Attempting P2P connection for session {} (will try: Direct P2P → STUN → TURN relay)",
            self.session_id
        );

        // Create MediaEngine (your existing codec setup)
        let mut m = MediaEngine::default();
        // ... your existing codec registration code ...
        m.register_codec(
            RTCRtpCodecParameters {
                capability: RTCRtpCodecCapability {
                    mime_type: MIME_TYPE_OPUS.to_owned(),
                    clock_rate: 48000,
                    channels: 2,
                    sdp_fmtp_line: "".to_owned(),
                    rtcp_feedback: vec![],
                },
                payload_type: 111,
                ..Default::default()
            },
            RTPCodecType::Audio,
        )?;
        m.register_codec(
            RTCRtpCodecParameters {
                capability: RTCRtpCodecCapability {
                    mime_type: MIME_TYPE_VP8.to_owned(),
                    clock_rate: 90000,
                    channels: 0,
                    sdp_fmtp_line: "".to_owned(),
                    rtcp_feedback: vec![],
                },
                payload_type: 96,
                ..Default::default()
            },
            RTPCodecType::Video,
        )?;
        m.register_codec(
            RTCRtpCodecParameters {
                capability: RTCRtpCodecCapability {
                    mime_type: MIME_TYPE_H264.to_owned(),
                    clock_rate: 90000,
                    channels: 0,
                    sdp_fmtp_line: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f".to_owned(),
                    rtcp_feedback: vec![],
                },
                payload_type: 97,
                ..Default::default()
            },
            RTPCodecType::Video,
        )?;

        let registry = register_default_interceptors(Registry::new(), &mut m)?;
        let api = APIBuilder::new()
            .with_media_engine(m)
            .with_interceptor_registry(registry)
            .build();

        // Load TURN/STUN configuration from API
        let relay_config = if !self.grid_id.is_empty() {
            // Try to get grid-specific config if we have auth token
            if let Ok(token) = self.get_auth_token().await {
                RelayConfig::load_from_api_for_grid(&self.grid_id, &token).await
            } else {
                RelayConfig::load_from_api().await
            }
        } else {
            RelayConfig::load_from_api().await
        };

        // Configure ICE servers
        let ice_servers = relay_config.to_webrtc_ice_servers();

        log::info!(
            "Configured {} STUN servers, {} TURN servers for P2P connection attempt",
            relay_config.stun_servers.len(),
            relay_config.turn_servers.len()
        );

        let config = webrtc::peer_connection::configuration::RTCConfiguration {
            ice_servers,
            ice_transport_policy:
                webrtc::peer_connection::policy::ice_transport_policy::RTCIceTransportPolicy::All,
            bundle_policy:
                webrtc::peer_connection::policy::bundle_policy::RTCBundlePolicy::Balanced,
            rtcp_mux_policy:
                webrtc::peer_connection::policy::rtcp_mux_policy::RTCRtcpMuxPolicy::Require,
            ..Default::default()
        };

        // Create peer connection
        let peer_connection = Arc::new(api.new_peer_connection(config).await?);

        // Store peer connection BEFORE setting up handlers
        // This prevents race condition where answer arrives before peer_connection is stored
        {
            let mut pc_guard = self.peer_connection.lock().await;
            *pc_guard = Some(peer_connection.clone());
        } // Release lock before async operations

        // Setup handlers (must be after storing peer_connection)
        self.setup_enhanced_peer_connection_handlers(&peer_connection)
            .await?;

        log::info!(
            "WebRTC initialized with API-provided TURN config for session {}",
            self.session_id
        );
        Ok(())
    }

    async fn get_auth_token(&self) -> Result<String> {
        // Get auth token from your existing auth system
        use crate::auth::storage::get_user_session;

        let session = get_user_session()
            .await
            .map_err(|e| anyhow::anyhow!("Failed to get user session: {}", e))?;

        let token = session
            .ok_or_else(|| anyhow::anyhow!("No active session"))?
            .token;

        Ok(token)
    }

    // Setup data channel event handlers (for host-created data channels)
    async fn setup_data_channel_handlers(&self, data_channel: Arc<RTCDataChannel>) -> Result<()> {
        let session_id = self.session_id.clone();
        let grid_id = self.grid_id.clone();
        let process_manager = self.process_manager.clone();
        let is_host = self.is_host;
        let app_handle = self.app_handle.clone();
        let bytes_received = self.bytes_received.clone();
        let transport_configs = self.transport_configs.clone();
        let active_transports = self.active_transports.clone();

        // TCP connection pool for forwarding data to actual process ports
        // Using OwnedWriteHalf to avoid mutex contention between read and write operations
        let tcp_connections: Arc<Mutex<HashMap<String, Arc<Mutex<tokio::net::tcp::OwnedWriteHalf>>>>> = Arc::new(Mutex::new(HashMap::new()));

        // on_open handler
        let session_id_open = session_id.clone();
        let transport_configs_open = transport_configs.clone();
        let active_transports_open = active_transports.clone();
        let app_handle_open = app_handle.clone();
        let grid_id_open = grid_id.clone();
        let data_channel_open = data_channel.clone();

        data_channel.on_open(Box::new(move || {
            let session_id = session_id_open.clone();
            let transport_configs = transport_configs_open.clone();
            let active_transports = active_transports_open.clone();
            let app_handle = app_handle_open.clone();
            let grid_id = grid_id_open.clone();
            let d = data_channel_open.clone();

            Box::pin(async move {
                log::info!("Data channel opened for session {}", session_id);

                // Start any pending transports now that the data channel is open
                let pending_configs = {
                    let mut configs = transport_configs.lock().await;
                    configs.drain(..).collect::<Vec<_>>()
                };

                for config in pending_configs {
                    log::info!("Starting pending transport: {:?}", config);

                    // Create transport instance
                    match create_transport(config.clone()) {
                        Ok(mut transport) => {
                            // Start the transport
                            match transport.start(d.clone()).await {
                                Ok(local_port) => {
                                    // Get connection info
                                    let connection_info = transport.get_connection_info();

                                    // Store the transport
                                    let transport_id = format!("{}_{}", config.grid_id, config.process_id);
                                    {
                                        let mut transports = active_transports.lock().await;
                                        transports.insert(transport_id.clone(), transport);
                                    }

                                    // Emit transport started event to frontend
                                    if let Err(e) = app_handle.emit(
                                        "transport_started",
                                        &serde_json::json!({
                                            "transport_id": transport_id,
                                            "grid_id": config.grid_id,
                                            "process_id": config.process_id,
                                            "connection_info": connection_info,
                                            "local_port": local_port
                                        }),
                                    ) {
                                        log::error!("Failed to emit transport_started event: {}", e);
                                    }

                                    log::info!(
                                        "Transport {} started successfully on port {}",
                                        transport_id,
                                        local_port
                                    );
                                }
                                Err(e) => {
                                    log::error!("Failed to start transport: {}", e);
                                }
                            }
                        }
                        Err(e) => {
                            log::error!("Failed to create transport: {}", e);
                        }
                    }
                }
            })
        }));

        // on_message handler
        let tcp_connections_msg = tcp_connections.clone();
        let data_channel_for_msg = data_channel.clone();
        data_channel.on_message(Box::new(move |msg: DataChannelMessage| {
            let grid_id = grid_id.clone();
            let process_manager = process_manager.clone();
            let app_handle = app_handle.clone();
            let bytes_received = bytes_received.clone();
            let tcp_connections = tcp_connections_msg.clone();
            let dc = data_channel_for_msg.clone();

            Box::pin(async move {
                // Track received bytes
                {
                    let mut received = bytes_received.lock().await;
                    *received += msg.data.len() as u64;
                }

                // Try to parse as JSON message
                if let Ok(message_str) = String::from_utf8(msg.data.to_vec()) {
                    if let Ok(json_msg) = serde_json::from_str::<serde_json::Value>(&message_str) {
                        // Handle different message types
                        if let Some(msg_type) = json_msg.get("type").and_then(|t| t.as_str()) {
                            match msg_type {
                                "tcp_data" => {
                                    // Forward to actual process port if we're the host
                                    if is_host {
                                        if let (Some(connection_id), Some(target_port), Some(data_b64)) = (
                                            json_msg.get("connection_id").and_then(|c| c.as_str()),
                                            json_msg.get("target_port").and_then(|p| p.as_u64()),
                                            json_msg.get("data").and_then(|d| d.as_str())
                                        ) {
                                            use base64::{Engine as _, engine::general_purpose};
                                            if let Ok(tcp_data) = general_purpose::STANDARD.decode(data_b64) {
                                                // Get or create TCP connection to target port
                                                let connection_key = format!("{}_{}", connection_id, target_port);

                                                let mut connections = tcp_connections.lock().await;
                                                if !connections.contains_key(&connection_key) {
                                                    // Create new TCP connection to target process
                                                    match tokio::net::TcpStream::connect(format!("localhost:{}", target_port)).await {
                                                        Ok(stream) => {
                                                            log::info!("Opened TCP connection to localhost:{} for {}", target_port, connection_id);

                                                            // Split stream into read and write halves to avoid mutex contention
                                                            let (read_half, write_half) = stream.into_split();
                                                            let write_arc = Arc::new(Mutex::new(write_half));
                                                            connections.insert(connection_key.clone(), write_arc.clone());

                                                            // Spawn task to read responses from TCP and forward back over WebRTC
                                                            let dc_for_reading = dc.clone();
                                                            let conn_id_for_reading = connection_id.to_string();
                                                            let protocol = json_msg.get("protocol").and_then(|p| p.as_str()).unwrap_or("tcp").to_string();

                                                            tokio::spawn(async move {
                                                                use tokio::io::AsyncReadExt;
                                                                let mut buffer = vec![0u8; 4096];
                                                                let mut read_half = read_half;

                                                                loop {
                                                                    match read_half.read(&mut buffer).await {
                                                                        Ok(0) => {
                                                                            log::info!("TCP connection closed by server for {}", conn_id_for_reading);
                                                                            break;
                                                                        }
                                                                        Ok(n) => {
                                                                            // Send response back over WebRTC
                                                                            let response = &buffer[..n];
                                                                            let response_msg = serde_json::json!({
                                                                                "type": "tcp_data",
                                                                                "connection_id": conn_id_for_reading,
                                                                                "target_port": target_port,
                                                                                "protocol": protocol,
                                                                                "data": general_purpose::STANDARD.encode(response)
                                                                            });

                                                                            let msg_bytes = response_msg.to_string().into_bytes();
                                                                            use bytes::Bytes;
                                                                            if let Err(e) = dc_for_reading.send(&Bytes::from(msg_bytes)).await {
                                                                                log::error!("Failed to send TCP response over WebRTC: {}", e);
                                                                                break;
                                                                            }
                                                                        }
                                                                        Err(e) => {
                                                                            log::error!("Failed to read from TCP connection: {}", e);
                                                                            break;
                                                                        }
                                                                    }
                                                                }
                                                            });
                                                        }
                                                        Err(e) => {
                                                            log::error!("Failed to connect to localhost:{}: {}", target_port, e);
                                                            return;
                                                        }
                                                    }
                                                }

                                                // Forward data to TCP connection
                                                if let Some(write_half) = connections.get(&connection_key) {
                                                    use tokio::io::AsyncWriteExt;
                                                    let mut writer = write_half.lock().await;
                                                    if let Err(e) = writer.write_all(&tcp_data).await {
                                                        log::error!("Failed to write to TCP connection: {}", e);
                                                        // Remove failed connection
                                                        drop(writer);
                                                        connections.remove(&connection_key);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                "tcp_close" => {
                                    if is_host {
                                        if let (Some(connection_id), Some(target_port)) = (
                                            json_msg.get("connection_id").and_then(|c| c.as_str()),
                                            json_msg.get("target_port").and_then(|p| p.as_u64())
                                        ) {
                                            let connection_key = format!("{}_{}", connection_id, target_port);
                                            let mut connections = tcp_connections.lock().await;
                                            connections.remove(&connection_key);
                                            log::info!("Closed TCP connection for {}", connection_id);
                                        }
                                    }
                                }
                                "terminal_input" => {
                                    // Forward to process stdin if we're the host
                                    if is_host {
                                        if let Some(data_b64) = json_msg.get("data").and_then(|d| d.as_str()) {
                                            if let Ok(input_data) = base64::decode(data_b64) {
                                                let pm_guard = process_manager.lock().await;
                                                if let Some(pm) = pm_guard.as_ref() {
                                                    if let Err(e) = pm.handle_p2p_data(grid_id.clone(), input_data).await {
                                                        log::error!("Failed to route terminal input to process: {}", e);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                "terminal_output" => {
                                    // Emit to frontend for terminal UI
                                    if let Err(e) = app_handle.emit(
                                        "p2p_terminal_output",
                                        &serde_json::json!({
                                            "grid_id": grid_id,
                                            "data": json_msg.get("data")
                                        }),
                                    ) {
                                        log::error!("Failed to emit terminal output: {}", e);
                                    }
                                }
                                _ => {
                                    log::debug!("Received message type: {}", msg_type);
                                }
                            }
                        }
                    }
                }
            })
        }));

        log::info!("Data channel handlers setup complete for session {}", session_id);
        Ok(())
    }

    // UPDATED handlers that detect connection type and preserve original functionality
    async fn setup_enhanced_peer_connection_handlers(
        &self,
        peer_connection: &Arc<RTCPeerConnection>,
    ) -> Result<()> {
        // ICE candidate handler with connection type detection
        let app_handle = self.app_handle.clone();
        let session_id = self.session_id.clone();
        let grid_id = self.grid_id.clone();
        let signal_sender = self.signal_sender.clone();
        let peer_user_id = self.peer_user_id.clone();
        let connection_type = self.connection_type.clone();

        peer_connection.on_ice_candidate(Box::new(move |candidate| {
            let app_handle = app_handle.clone();
            let session_id = session_id.clone();
            let grid_id = grid_id.clone();
            let signal_sender = signal_sender.clone();
            let peer_user_id = peer_user_id.clone();
            let connection_type = connection_type.clone();

            Box::pin(async move {
                if let Some(candidate) = candidate {
                    let candidate_json = candidate.to_json().unwrap_or_default();

                    // Detect connection type from candidate for future bandwidth tracking
                    let detected_connection_type = if candidate_json.candidate.contains("relay") {
                        "turn_relay" // This will use TURN server bandwidth
                    } else if candidate_json.candidate.contains("srflx") {
                        "stun_assisted" // STUN-assisted P2P (minimal server usage)
                    } else if candidate_json.candidate.contains("host") {
                        "direct_p2p" // Direct P2P (no server bandwidth)
                    } else {
                        "unknown"
                    };

                    // Enhanced logging based on connection type
                    match detected_connection_type {
                        "direct_p2p" => {
                            log::info!("✅ P2P: Direct connection candidate generated for session {} (host candidate)", session_id);
                        }
                        "stun_assisted" => {
                            log::info!("✅ P2P: STUN-assisted connection candidate generated for session {} (srflx candidate)", session_id);
                        }
                        "turn_relay" => {
                            log::warn!("⚠️ P2P: TURN relay candidate generated for session {} (relay candidate) - direct P2P may have failed", session_id);
                        }
                        _ => {
                            log::info!("Generated ICE candidate for session {}: type={}",
                                session_id,
                                candidate_json.candidate.split_whitespace().nth(7).unwrap_or("unknown")
                            );
                        }
                    }

                    // Update the connection type
                    {
                        let mut conn_type = connection_type.lock().await;
                        *conn_type = detected_connection_type.to_string();
                    }

                    // Emit candidate with connection type info (useful for bandwidth tracking)
                    if let Err(e) =
                        app_handle.emit("ice_candidate_generated", &serde_json::json!({
                            "session_id": session_id,
                            "grid_id": grid_id,
                            "connection_type": detected_connection_type,
                            "candidate_type": candidate_json.candidate.split_whitespace().nth(7).unwrap_or("unknown"),
                            "timestamp": chrono::Utc::now().to_rfc3339()
                        })) {
                        log::error!("Failed to emit ICE candidate event: {}", e);
                    }

                    // Send WebRTC signal as before
                    let signal = serde_json::json!({
                        "type": "webrtc_signal",
                        "payload": {
                            "to_user_id": peer_user_id,
                            "grid_id": grid_id,
                            "signal_data": {
                                "candidate": candidate_json
                            }
                        }
                    });
                    let guard = signal_sender.lock().await;
                    if let Some(sender) = guard.as_ref() {
                        if let Err(e) = sender.send(signal) {
                            log::error!("Failed to send ICE candidate: {}", e);
                        } else {
                            log::debug!("Sent ICE candidate to peer via WebSocket");
                        }
                    } else {
                        log::error!("Signal sender not available - cannot send ICE candidate!");
                    }
                } else {
                    log::info!("ICE gathering completed for session {} (null candidate received)", session_id);
                }
            })
        }));

        // ICE connection state handler for detailed connectivity debugging
        let session_id_ice = self.session_id.clone();
        let grid_id_ice = self.grid_id.clone();
        peer_connection.on_ice_connection_state_change(Box::new(move |s| {
            let session_id = session_id_ice.clone();
            let grid_id = grid_id_ice.clone();
            Box::pin(async move {
                log::info!("ICE connection state changed to: {:?} for session {} grid {}", s, session_id, grid_id);
            })
        }));

        // ICE gathering state handler
        let session_id_gathering = self.session_id.clone();
        let grid_id_gathering = self.grid_id.clone();
        peer_connection.on_ice_gathering_state_change(Box::new(move |s| {
            let session_id = session_id_gathering.clone();
            let grid_id = grid_id_gathering.clone();
            Box::pin(async move {
                log::info!("ICE gathering state changed to: {:?} for session {} grid {}", s, session_id, grid_id);
            })
        }));

        // Connection state change handler with connection type logging
        let app_handle_state = self.app_handle.clone();
        let session_id_state = self.session_id.clone();
        let grid_id_state = self.grid_id.clone();
        let peer_user_id_state = self.peer_user_id.clone();
        let state = self.state.clone();
        let connection_type_state = self.connection_type.clone();
        peer_connection.on_peer_connection_state_change(Box::new(
            move |s: RTCPeerConnectionState| {
                let app_handle = app_handle_state.clone();
                let session_id = session_id_state.clone();
                let grid_id = grid_id_state.clone();
                let peer_user_id = peer_user_id_state.clone();
                let state = state.clone();
                let peer_user_id_for_event = peer_user_id.clone();
                let connection_type = connection_type_state.clone();

                Box::pin(async move {
                    log::info!(
                        "Peer connection state changed to: {:?} for session {}",
                        s,
                        session_id
                    );
                    let new_state = match s {
                        RTCPeerConnectionState::Connected => {
                            // Get the final connection type
                            let final_connection_type = {
                                let conn_type = connection_type.lock().await;
                                conn_type.clone()
                            };

                            // Enhanced logging showing which connection type succeeded
                            match final_connection_type.as_str() {
                                "direct_p2p" => {
                                    log::info!("✅ P2P Connection Type: Direct P2P (no relay servers used)");
                                }
                                "stun_assisted" => {
                                    log::info!("✅ P2P Connection Type: STUN-assisted P2P (minimal relay usage)");
                                }
                                "turn_relay" => {
                                    log::warn!("✅ P2P Connection Type: TURN Relay (using relay server bandwidth)");
                                }
                                _ => {
                                    log::info!("✅ P2P Connection Type: {}", final_connection_type);
                                }
                            }

                            // Emit connection established event with metadata for bandwidth tracking
                            if let Err(e) =
                                app_handle.emit("p2p_connection_established", &serde_json::json!({
                                    "session_id": session_id,
                                    "grid_id": grid_id,
                                    "connection_type": final_connection_type,
                                    "timestamp": chrono::Utc::now().to_rfc3339(),
                                    "ready_for_bandwidth_tracking": true
                                }))
                            {
                                log::error!("Failed to emit connection established event: {}", e);
                            }
                            SessionState::Connected
                        }
                        RTCPeerConnectionState::Disconnected => {
                            log::warn!("P2P connection disconnected for grid: {}", grid_id);
                            // Emit host disconnected event for UI and auto-reconnection
                            app_handle.emit("host_disconnected", &serde_json::json!({
                                "grid_id": grid_id,
                                "session_id": session_id,
                                "host_user_id": peer_user_id,
                                "reason": "peer_disconnected"
                            })).ok();
                            SessionState::Disconnected
                        }
                        RTCPeerConnectionState::Failed => {
                            log::error!("P2P connection failed for grid: {}", grid_id);
                            // Emit host disconnected event with failure reason for UI and auto-reconnection
                            app_handle.emit("host_disconnected", &serde_json::json!({
                                "grid_id": grid_id,
                                "session_id": session_id,
                                "host_user_id": peer_user_id,
                                "reason": "connection_failed"
                            })).ok();
                            SessionState::Failed
                        }
                        RTCPeerConnectionState::Closed => {
                            log::error!("P2P connection closed unexpectedly for grid: {} session: {}. This may indicate a network issue, firewall blocking WebRTC traffic, or ICE connection failure.", grid_id, session_id);
                            // Emit host disconnected event with closed reason
                            app_handle.emit("host_disconnected", &serde_json::json!({
                                "grid_id": grid_id,
                                "session_id": session_id,
                                "host_user_id": peer_user_id,
                                "reason": "connection_closed"
                            })).ok();
                            SessionState::Failed
                        }
                        RTCPeerConnectionState::Connecting => SessionState::Connecting,
                        RTCPeerConnectionState::New => {
                            log::debug!("P2P connection in new state for grid: {}", grid_id);
                            return;
                        }
                        _ => {
                            log::warn!("Unknown P2P connection state {:?} for grid: {}", s, grid_id);
                            return;
                        }
                    };

                    // Update state
                    {
                        let mut state_guard = state.lock().await;
                        *state_guard = new_state.clone();
                    }

                    // Emit state change event
                    let state_event = SessionStateEvent {
                        session_id,
                        peer_user_id: peer_user_id_for_event,
                        grid_id,
                        state: new_state,
                        error_message: None,
                    };
                    if let Err(e) = app_handle.emit("session_state_changed", &state_event) {
                        log::error!("Failed to emit session state change: {}", e);
                    }
                })
            },
        ));

        // Data channel handler with transport message routing (from original file)
        let data_channel_arc = self.data_channel.clone();
        let session_id_dc = self.session_id.clone();
        let grid_id_dc = self.grid_id.clone();
        let process_manager = self.process_manager.clone();
        let is_host = self.is_host;
        let app_handle_dc = self.app_handle.clone();
        let bytes_received_arc = self.bytes_received.clone();
        let transport_configs_arc = self.transport_configs.clone();
        let active_transports_arc = self.active_transports.clone();

        peer_connection.on_data_channel(Box::new(move |d: Arc<RTCDataChannel>| {
            let data_channel_arc = data_channel_arc.clone();
            let session_id = session_id_dc.clone();
            let grid_id = grid_id_dc.clone();
            let process_manager = process_manager.clone();
            let app_handle = app_handle_dc.clone();
            let bytes_received = bytes_received_arc.clone();
            let transport_configs = transport_configs_arc.clone();
            let active_transports = active_transports_arc.clone();

            Box::pin(async move {
                log::info!(
                    "Data channel opened: {} for session {}",
                    d.label(),
                    session_id
                );

                // Store data channel
                {
                    let mut dc_guard = data_channel_arc.lock().await;
                    *dc_guard = Some(d.clone());
                }

                // Start any pending transports now that the data channel is open
                let pending_configs = {
                    let mut configs = transport_configs.lock().await;
                    configs.drain(..).collect::<Vec<_>>()
                };

                for config in pending_configs {
                    log::info!("Starting pending transport: {:?}", config);

                    // Create transport instance
                    match create_transport(config.clone()) {
                        Ok(mut transport) => {
                            // Start the transport
                            match transport.start(d.clone()).await {
                                Ok(local_port) => {
                                    // Get connection info
                                    let connection_info = transport.get_connection_info();

                                    // Store the transport
                                    let transport_id = format!("{}_{}", config.grid_id, config.process_id);
                                    {
                                        let mut transports = active_transports.lock().await;
                                        transports.insert(transport_id.clone(), transport);
                                    }

                                    // Emit transport started event to frontend
                                    if let Err(e) = app_handle.emit(
                                        "transport_started",
                                        &serde_json::json!({
                                            "transport_id": transport_id,
                                            "grid_id": config.grid_id,
                                            "process_id": config.process_id,
                                            "connection_info": connection_info,
                                            "local_port": local_port
                                        }),
                                    ) {
                                        log::error!("Failed to emit transport_started event: {}", e);
                                    }

                                    log::info!(
                                        "Transport {} started successfully on port {}",
                                        transport_id,
                                        local_port
                                    );
                                }
                                Err(e) => {
                                    log::error!("Failed to start transport: {}", e);
                                }
                            }
                        }
                        Err(e) => {
                            log::error!("Failed to create transport: {}", e);
                        }
                    }
                }

                // Enhanced message handler with transport routing
                d.on_message(Box::new(move |msg: DataChannelMessage| {
                    let grid_id = grid_id.clone();
                    let process_manager = process_manager.clone();
                    let app_handle = app_handle.clone();
                    let bytes_received = bytes_received.clone(); // Fixed: use the cloned Arc
                    let active_transports = active_transports.clone(); // Clone for the async closure

                    Box::pin(async move {
                        // Track received bytes
                        {
                            let mut received = bytes_received.lock().await;
                            *received += msg.data.len() as u64;
                        }
                        // Try to parse as JSON message
                        if let Ok(message_str) = String::from_utf8(msg.data.to_vec()) {
                            if let Ok(json_msg) =
                                serde_json::from_str::<serde_json::Value>(&message_str)
                            {
                                // Handle different message types
                                if let Some(msg_type) = json_msg.get("type").and_then(|t| t.as_str())
                                {
                                    match msg_type {
                                        "http_request" => {
                                            // TODO: Forward to local HTTP server
                                        }
                                        "tcp_data" => {
                                            if let Some(connection_id) = json_msg.get("connection_id").and_then(|c| c.as_str()) {
                                                if let Some(data_b64) = json_msg.get("data").and_then(|d| d.as_str()) {
                                                    use base64::{Engine as _, engine::general_purpose};
                                                    if let Ok(tcp_data) = general_purpose::STANDARD.decode(data_b64) {
                                                        // Forward to local TCP socket
                                                        let transports = active_transports.lock().await;
                                                        let mut wrote_data = false;

                                                        for (transport_id, transport) in transports.iter() {
                                                            if let crate::transport::TransportInstance::Tcp(tcp_tunnel) = transport {
                                                                match tcp_tunnel.write_to_connection(connection_id, &tcp_data).await {
                                                                    Ok(_) => {
                                                                        wrote_data = true;
                                                                        break;
                                                                    }
                                                                    Err(e) => {
                                                                        log::error!("Failed to write to TCP connection: {}", e);
                                                                    }
                                                                }
                                                            }
                                                        }

                                                        if !wrote_data {
                                                            log::warn!("Could not find TCP connection {} to write {} bytes (checked {} transports)", connection_id, tcp_data.len(), transports.len());
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        "terminal_input" => {
                                            // Forward to process stdin if we're the host
                                            if is_host {
                                                if let Some(data_b64) =
                                                    json_msg.get("data").and_then(|d| d.as_str())
                                                {
                                                    if let Ok(input_data) = base64::decode(data_b64)
                                                    {
                                                        let pm_guard = process_manager.lock().await;
                                                        if let Some(pm) = pm_guard.as_ref() {
                                                            if let Err(e) = pm
                                                                .handle_p2p_data(
                                                                    grid_id.clone(),
                                                                    input_data,
                                                                )
                                                                .await
                                                            {
                                                                log::error!("Failed to route terminal input to process: {}",e);
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        "terminal_output" => {
                                            // Emit to frontend for terminal UI
                                            if let Err(e) =
                                                app_handle.emit("terminal_output", &json_msg)
                                            {
                                                log::error!("Failed to emit terminal output: {}", e);
                                            }
                                        }
                                        _ => {
                                            // Unknown message type - silently ignore in production
                                        }
                                    }
                                    return;
                                }
                            }
                        }

                        // Fallback: treat as raw binary data for process communication
                        if is_host {
                            let pm_guard = process_manager.lock().await;
                            if let Some(pm) = pm_guard.as_ref() {
                                if let Err(e) = pm
                                    .handle_p2p_data(grid_id.clone(), msg.data.to_vec())
                                    .await
                                {
                                    log::error!("Failed to route P2P data to process: {}", e);
                                }
                            }
                        }
                    })
                }));
            })
        }));

        // Remote track handler for receiving media (from original file)
        let app_handle_track = self.app_handle.clone();
        let session_id_track = self.session_id.clone();

        peer_connection.on_track(Box::new(move |track, _receiver, _transceiver| {
            let app_handle = app_handle_track.clone();
            let session_id = session_id_track.clone();

            Box::pin(async move {
                log::info!(
                    "Received remote {} track: {} in session {}",
                    track.kind(),
                    track.id(),
                    session_id
                );

                // Emit remote track event to frontend
                if let Err(e) = app_handle.emit(
                    "remote_media_track",
                    &serde_json::json!({
                        "session_id": session_id,
                        "track_id": track.id(),
                        "kind": track.kind().to_string(),
                        "enabled": true
                    }),
                ) {
                    log::error!("Failed to emit remote track event: {}", e);
                }

                // Handle track data (audio/video packets)
                // In a full implementation, you'd forward this to the frontend
                // or handle it based on your app's needs
            })
        }));

        Ok(())
    }

    // Updated close method to clean up media session and transports
    pub async fn close(&mut self) -> Result<()> {
        log::info!("Closing P2P connection {}", self.session_id);

        {
            let mut task_guard = self.reporting_task.lock().await;
            if let Some(task) = task_guard.take() {
                task.abort();
            }
        }

        // Close media session first
        let media_guard = self.media_manager.lock().await;
        if let Some(media_manager) = media_guard.as_ref() {
            let media_session_id =
                format!("media_{}_{}", self.grid_id, format!("p2p_{}_{}", self.grid_id, self.peer_user_id));

            if let Err(e) = media_manager.close_media_session(media_session_id).await {
                log::error!(
                    "Failed to close media session during P2P cleanup: {}",
                    e
                );
            }
        }

        // Stop all active transports
        {
            let mut transports = self.active_transports.lock().await;
            for (transport_id, mut transport) in transports.drain() {
                if let Err(e) = transport.stop().await {
                    log::error!("Failed to stop transport {}: {}", transport_id, e);
                }
            }
        }

        // Close data channel
        {
            let mut dc_guard = self.data_channel.lock().await;
            if let Some(data_channel) = dc_guard.take() {
                data_channel.close().await?;
            }
        }

        // Close peer connection
        {
            let mut pc_guard = self.peer_connection.lock().await;
            if let Some(peer_connection) = pc_guard.take() {
                peer_connection.close().await?;
            }
        }

        // Update state
        {
            let mut state_guard = self.state.lock().await;
            *state_guard = SessionState::Disconnected;
        }

        self.emit_state_change(None).await?;
        log::info!("Closed P2P connection for session {}", self.session_id);
        Ok(())
    }

    pub async fn start_connection(&self) -> Result<()> {
        if !self.is_host {
            return Err(anyhow::anyhow!("Only host can start connection"));
        }

        if self.peer_connection.lock().await.is_none() {
            self.init_webrtc().await?;
        }

        // Get peer_connection and create data channel, then release lock
        let (peer_connection, data_channel) = {
            let pc_guard = self.peer_connection.lock().await;
            if let Some(peer_connection) = pc_guard.as_ref() {
                let data_channel = peer_connection.create_data_channel("data", None).await?;
                (peer_connection.clone(), data_channel)
            } else {
                return Err(anyhow::anyhow!("Peer connection not initialized"));
            }
        }; // Release lock here

        log::info!(
            "Created data channel 'data' for session {} (host side)",
            self.session_id
        );

        // Store data channel
        {
            let mut dc_guard = self.data_channel.lock().await;
            *dc_guard = Some(data_channel.clone());
        }

        // Setup data channel handlers (host side) - lock is now released
        self.setup_data_channel_handlers(data_channel).await?;

        // Create offer
        let offer = peer_connection.create_offer(None).await?;
        peer_connection.set_local_description(offer.clone()).await?;

        log::info!("Created WebRTC offer for session {}", self.session_id);

        let signal = serde_json::json!({
            "type": "webrtc_signal",
            "payload": {
                "to_user_id": self.peer_user_id,
                "grid_id": self.grid_id,
                "signal_data": {
                    "type": "offer",
                    "sdp": offer.sdp
                }
            }
        });

        let guard = self.signal_sender.lock().await;
        if let Some(sender) = guard.as_ref() {
            sender.send(signal).context("Failed to send offer")?;
        }

        {
            let mut state_guard = self.state.lock().await;
            *state_guard = SessionState::Connecting;
        }
        self.emit_state_change(None).await?;

        Ok(())
    }

    pub async fn report_bandwidth_usage(&self) -> Result<()> {
        let connection_type = {
            let conn_type = self.connection_type.lock().await;
            conn_type.clone()
        };

        // Only report if using TURN relay (the expensive bandwidth)
        if connection_type == "turn_relay" {
            let bytes_sent = {
                let sent = self.bytes_sent.lock().await;
                *sent
            };
            let bytes_received = {
                let received = self.bytes_received.lock().await;
                *received
            };

            let total_bytes = bytes_sent + bytes_received;
            
            // Only report if significant usage (avoid spam for tiny amounts)
            if total_bytes > 1024 { // More than 1KB
                let duration = (Utc::now().timestamp() as u64) - self.session_start_time;
                
                let usage_data = serde_json::json!({
                    "grid_id": self.grid_id,
                    "session_id": self.session_id,
                    "bytes_used": total_bytes,
                    "duration_seconds": duration,
                    "connection_type": "turn_relay",
                    "turn_server": "us-east-1"
                });

                // Get auth token
                let token = match self.get_auth_token().await {
                    Ok(token) => token,
                    Err(e) => {
                        log::warn!("Failed to get auth token for usage reporting: {}", e);
                        return Ok(()); // Don't fail the connection over this
                    }
                };

                // POST to usage endpoint
                let client = reqwest::Client::builder()
                    .timeout(std::time::Duration::from_secs(5))
                    .build()?;
                
                match client
                    .post("https://roguegrid9-coordinator.fly.dev/api/v1/turn/usage")
                    .header("Authorization", format!("Bearer {}", token))
                    .header("Content-Type", "application/json")
                    .json(&usage_data)
                    .send()
                    .await
                {
                    Ok(_) => {
                        log::info!("Reported TURN usage: {} bytes for session {}", total_bytes, self.session_id);
                    }
                    Err(e) => {
                        log::warn!("Failed to report TURN usage: {}", e);
                        // Don't fail - usage reporting is best effort
                    }
                }
            }
        }
        Ok(())
    }

    // Helper method to get session duration
    fn get_session_duration_seconds(&self) -> u64 {
        (Utc::now().timestamp() as u64) - self.session_start_time
    }

    pub async fn start_bandwidth_reporting_if_needed(&self) {
        let connection_type = {
            let ct = self.connection_type.lock().await;
            ct.clone()
        };
        
        if connection_type == "turn_relay" {
            log::info!("Will report bandwidth usage for TURN relay session on close");
            // We'll just report on close for the MVP - much simpler
            // Periodic reporting can be added in Phase 2
        }
    }
}
