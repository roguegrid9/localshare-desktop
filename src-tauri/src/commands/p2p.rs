// src-tauri/src/commands/p2p.rs - EXTENDED with media commands
use crate::p2p::{P2PManager};
use crate::p2p::GridSessionStatus;
use crate::api::P2PSessionInfo;
use crate::AppState;
use tauri::State;
use serde::{Deserialize, Serialize};
use tauri::command;
// Initialize P2P service with process integration
#[tauri::command]
pub async fn initialize_p2p_service(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: initialize_p2p_service called");
    
    let p2p_manager = P2PManager::new(app_handle);
    
    // Set up process integration if ProcessManager is available
    {
        let process_manager = state.process_manager.clone();
        if let Err(e) = p2p_manager.setup_process_integration(process_manager).await {
            log::error!("Failed to set up P2P-Process integration: {}", e);
            return Err(e.to_string());
        }
    }
    
    let mut p2p_state = state.p2p_manager.lock().await;
    *p2p_state = Some(p2p_manager);
    
    log::info!("P2P service initialized successfully with process integration");
    Ok(())
}

// Join grid session to include process manager
#[tauri::command]
pub async fn join_grid_session(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    log::info!("Tauri command: join_grid_session called for grid: {}", grid_id);
    
    let p2p_state = state.p2p_manager.lock().await;
    if let Some(p2p_manager) = p2p_state.as_ref() {
        p2p_manager.join_grid_session(grid_id).await.map_err(|e| {
            log::error!("Failed to join grid session: {}", e);
            e.to_string()
        })
    } else {
        Err("P2P service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn release_grid_host(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: release_grid_host called for grid: {}", grid_id);
    
    let p2p_state = state.p2p_manager.lock().await;
    if let Some(p2p_manager) = p2p_state.as_ref() {
        p2p_manager.release_grid_host(grid_id).await.map_err(|e| {
            log::error!("Failed to release grid host: {}", e);
            e.to_string()
        })
    } else {
        Err("P2P service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_grid_session_status(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<GridSessionStatus, String> {
    log::info!("Tauri command: get_grid_session_status called for grid: {}", grid_id);
    
    let p2p_state = state.p2p_manager.lock().await;
    if let Some(p2p_manager) = p2p_state.as_ref() {
        p2p_manager.get_grid_status(&grid_id).await.map_err(|e| {
            log::error!("Failed to get grid session status: {}", e);
            e.to_string()
        })
    } else {
        Err("P2P service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_active_p2p_sessions(
    state: State<'_, AppState>,
) -> Result<Vec<P2PSessionInfo>, String> {
    log::info!("Tauri command: get_active_p2p_sessions called");
    
    let p2p_state = state.p2p_manager.lock().await;
    if let Some(p2p_manager) = p2p_state.as_ref() {
        Ok(p2p_manager.get_active_sessions().await)
    } else {
        Err("P2P service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn close_p2p_session(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: close_p2p_session called for session: {}", session_id);
    
    let p2p_state = state.p2p_manager.lock().await;
    if let Some(p2p_manager) = p2p_state.as_ref() {
        p2p_manager.close_session(session_id).await.map_err(|e| {
            log::error!("Failed to close P2P session: {}", e);
            e.to_string()
        })
    } else {
        Err("P2P service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn send_p2p_data(
    session_id: String,
    data: Vec<u8>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::debug!("Tauri command: send_p2p_data called for session: {}", session_id);
    
    let p2p_state = state.p2p_manager.lock().await;
    if let Some(p2p_manager) = p2p_state.as_ref() {
        p2p_manager.send_data(session_id, data).await.map_err(|e| {
            log::error!("Failed to send P2P data: {}", e);
            e.to_string()
        })
    } else {
        Err("P2P service not initialized".to_string())
    }
}

// NEW: Media-specific types for Tauri commands
#[derive(Debug, Serialize, Deserialize)]
pub struct MediaTrackInfo {
    pub track_id: String,
    pub kind: String, // "audio" or "video"
    pub stream_id: String,
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MediaSessionConfig {
    pub session_id: String,
    pub enable_audio: bool,
    pub enable_video: bool,
    pub quality_preset: String, // "low", "medium", "high", "auto"
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MediaStats {
    pub audio: Option<AudioStats>,
    pub video: Option<VideoStats>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AudioStats {
    pub packets_lost: u32,
    pub packets_received: u32,
    pub bytes_received: u64,
    pub jitter: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VideoStats {
    pub packets_lost: u32,
    pub packets_received: u32,
    pub bytes_received: u64,
    pub frame_rate: f32,
    pub resolution: VideoResolution,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VideoResolution {
    pub width: u32,
    pub height: u32,
}

// NEW: Initialize media session for existing P2P connection
#[tauri::command]
pub async fn initialize_media_session(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: initialize_media_session called for session: {}", session_id);
    
    let p2p_state = state.p2p_manager.lock().await;
    if let Some(p2p_manager) = p2p_state.as_ref() {
        p2p_manager.initialize_media_session(session_id).await.map_err(|e| {
            log::error!("Failed to initialize media session: {}", e);
            e.to_string()
        })
    } else {
        Err("P2P service not initialized".to_string())
    }
}

// NEW: Add media track to peer connection
#[tauri::command]
pub async fn add_media_track(
    session_id: String,
    track_id: String,
    kind: String,
    stream_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: add_media_track called - session: {}, track: {}, kind: {}", 
             session_id, track_id, kind);
    
    let p2p_state = state.p2p_manager.lock().await;
    if let Some(p2p_manager) = p2p_state.as_ref() {
        let track_info = MediaTrackInfo {
            track_id,
            kind,
            stream_id,
            enabled: true,
        };
        
        p2p_manager.add_media_track(session_id, track_info).await.map_err(|e| {
            log::error!("Failed to add media track: {}", e);
            e.to_string()
        })
    } else {
        Err("P2P service not initialized".to_string())
    }
}

// NEW: Remove media track from peer connection
#[tauri::command]
pub async fn remove_media_track(
    session_id: String,
    track_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: remove_media_track called - session: {}, track: {}", 
             session_id, track_id);
    
    let p2p_state = state.p2p_manager.lock().await;
    if let Some(p2p_manager) = p2p_state.as_ref() {
        p2p_manager.remove_media_track(session_id, track_id).await.map_err(|e| {
            log::error!("Failed to remove media track: {}", e);
            e.to_string()
        })
    } else {
        Err("P2P service not initialized".to_string())
    }
}

// NEW: Set track enabled state (mute/unmute)
#[tauri::command]
pub async fn set_track_enabled(
    session_id: String,
    track_id: String,
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::debug!("Tauri command: set_track_enabled called - session: {}, track: {}, enabled: {}", 
              session_id, track_id, enabled);
    
    let p2p_state = state.p2p_manager.lock().await;
    if let Some(p2p_manager) = p2p_state.as_ref() {
        p2p_manager.set_track_enabled(session_id, track_id, enabled).await.map_err(|e| {
            log::error!("Failed to set track enabled: {}", e);
            e.to_string()
        })
    } else {
        Err("P2P service not initialized".to_string())
    }
}

// NEW: Replace video track (for camera switching or screen share)
#[tauri::command]
pub async fn replace_video_track(
    session_id: String,
    old_track_id: String,
    new_track_id: String,
    stream_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: replace_video_track called - session: {}, old: {}, new: {}", 
             session_id, old_track_id, new_track_id);
    
    let p2p_state = state.p2p_manager.lock().await;
    if let Some(p2p_manager) = p2p_state.as_ref() {
        p2p_manager.replace_video_track(session_id, old_track_id, new_track_id, stream_id).await.map_err(|e| {
            log::error!("Failed to replace video track: {}", e);
            e.to_string()
        })
    } else {
        Err("P2P service not initialized".to_string())
    }
}

// NEW: Get media statistics for debugging/monitoring
#[tauri::command]
pub async fn get_media_stats(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<MediaStats, String> {
    log::debug!("Tauri command: get_media_stats called for session: {}", session_id);
    
    let p2p_state = state.p2p_manager.lock().await;
    if let Some(p2p_manager) = p2p_state.as_ref() {
        p2p_manager.get_media_stats(session_id).await.map_err(|e| {
            log::error!("Failed to get media stats: {}", e);
            e.to_string()
        })
    } else {
        Err("P2P service not initialized".to_string())
    }
}

// NEW: Configure media quality settings
#[tauri::command]
pub async fn configure_media_quality(
    session_id: String,
    quality_preset: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: configure_media_quality called - session: {}, preset: {}", 
             session_id, quality_preset);
    
    let p2p_state = state.p2p_manager.lock().await;
    if let Some(p2p_manager) = p2p_state.as_ref() {
        p2p_manager.configure_media_quality(session_id, quality_preset).await.map_err(|e| {
            log::error!("Failed to configure media quality: {}", e);
            e.to_string()
        })
    } else {
        Err("P2P service not initialized".to_string())
    }
}

// NEW: Get list of media-enabled sessions
#[tauri::command]
pub async fn get_media_sessions(
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    log::debug!("Tauri command: get_media_sessions called");
    
    let p2p_state = state.p2p_manager.lock().await;
    if let Some(p2p_manager) = p2p_state.as_ref() {
        Ok(p2p_manager.get_media_sessions().await)
    } else {
        Err("P2P service not initialized".to_string())
    }
}

// NEW: Close media session (cleanup media tracks)
#[tauri::command]
pub async fn close_media_session(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: close_media_session called for session: {}", session_id);
    
    let p2p_state = state.p2p_manager.lock().await;
    if let Some(p2p_manager) = p2p_state.as_ref() {
        p2p_manager.close_media_session(session_id).await.map_err(|e| {
            log::error!("Failed to close media session: {}", e);
            e.to_string()
        })
    } else {
        Err("P2P service not initialized".to_string())
    }
}

// NEW: Send media signaling data (for SDP negotiation)
#[tauri::command]
pub async fn send_media_signal(
    session_id: String,
    signal_type: String,
    signal_data: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::debug!("Tauri command: send_media_signal called - session: {}, type: {}", 
              session_id, signal_type);
    
    let p2p_state = state.p2p_manager.lock().await;
    if let Some(p2p_manager) = p2p_state.as_ref() {
        p2p_manager.send_media_signal(session_id, signal_type, signal_data).await.map_err(|e| {
            log::error!("Failed to send media signal: {}", e);
            e.to_string()
        })
    } else {
        Err("P2P service not initialized".to_string())
    }
}

// NEW: Handle incoming media signal (from remote peer)
#[tauri::command]
pub async fn handle_media_signal(
    session_id: String,
    signal_type: String,
    signal_data: serde_json::Value,
    from_user_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::debug!("Tauri command: handle_media_signal called - session: {}, type: {}, from: {}", 
              session_id, signal_type, from_user_id);
    
    let p2p_state = state.p2p_manager.lock().await;
    if let Some(p2p_manager) = p2p_state.as_ref() {
        p2p_manager.handle_media_signal(session_id, signal_type, signal_data, from_user_id).await.map_err(|e| {
            log::error!("Failed to handle media signal: {}", e);
            e.to_string()
        })
    } else {
        Err("P2P service not initialized".to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkStatus {
    pub nat_type: String,
    pub needs_relay: bool,
    pub stun_available: bool,
    pub turn_available: bool,
    pub connection_quality: String,
    pub last_checked: String,
}

#[command]
pub async fn get_network_status() -> Result<NetworkStatus, String> {
    // Perform STUN test to detect NAT type
    let nat_result = detect_nat_type().await.map_err(|e| e.to_string())?;
    
    Ok(NetworkStatus {
        nat_type: nat_result.nat_type,
        needs_relay: nat_result.needs_relay,
        stun_available: test_stun_connectivity().await,
        turn_available: test_turn_connectivity().await,
        connection_quality: nat_result.quality,
        last_checked: chrono::Utc::now().to_rfc3339(),
    })
}

#[derive(Debug)]
struct NatDetectionResult {
    nat_type: String,
    needs_relay: bool,
    quality: String,
}

async fn detect_nat_type() -> Result<NatDetectionResult, Box<dyn std::error::Error>> {
    use webrtc::peer_connection::configuration::RTCConfiguration;
    use webrtc::api::APIBuilder;
    
    // Create a test peer connection with STUN servers
    let config = RTCConfiguration {
        ice_servers: vec![
            webrtc::ice_transport::ice_server::RTCIceServer {
                urls: vec!["stun:stun.l.google.com:19302".to_string()],
                ..Default::default()
            },
        ],
        ..Default::default()
    };
    
    let api = APIBuilder::new().build();
    let peer_connection = api.new_peer_connection(config).await?;
    
    // Gather ICE candidates to analyze NAT type
    let peer_connection_arc = std::sync::Arc::new(peer_connection);
    let (nat_type, needs_relay) = analyze_ice_candidates(&peer_connection_arc).await?;    
    
    let quality = match nat_type.as_str() {
        "Open Internet" => "excellent",
        "Full Cone NAT" => "good", 
        "Restricted NAT" => "fair",
        "Port Restricted NAT" => "poor",
        "Symmetric NAT" => "needs_relay",
        _ => "unknown",
    };
    
    Ok(NatDetectionResult {
        nat_type,
        needs_relay,
        quality: quality.to_string(),
    })
}

async fn analyze_ice_candidates(pc: &std::sync::Arc<webrtc::peer_connection::RTCPeerConnection>) -> Result<(String, bool), Box<dyn std::error::Error>> {
    use std::sync::{Arc, Mutex};
    
    // Store candidates as they're gathered
    let candidates = Arc::new(Mutex::new(Vec::<String>::new()));
    let candidates_clone = candidates.clone();
    
    // Set up ICE candidate callback
    pc.on_ice_candidate(Box::new(move |candidate| {
        let candidates = candidates_clone.clone();
        Box::pin(async move {
            if let Some(candidate) = candidate {
                if let Ok(candidate_json) = candidate.to_json() {
                    let mut cands = candidates.lock().unwrap();
                    cands.push(candidate_json.candidate);
                }
            }
        })
    }));
    
    // Create a data channel to trigger ICE gathering
    let _dc = pc.create_data_channel("test", None).await?;
    
    // Create an offer to start ICE gathering
    let offer = pc.create_offer(None).await?;
    pc.set_local_description(offer).await?;
    
    // Wait for ICE gathering to complete
    let mut attempts = 0;
    let max_attempts = 30; // 3 seconds total
    
    loop {
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        attempts += 1;
        
        let candidate_count = {
            let cands = candidates.lock().unwrap();
            cands.len()
        };
        
        // If we have candidates or timed out, proceed
        if candidate_count > 0 || attempts >= max_attempts {
            break;
        }
    }
    
    // Analyze the gathered candidates
    let gathered_candidates = {
        let cands = candidates.lock().unwrap();
        cands.clone()
    };
    
    let has_host = gathered_candidates.iter().any(|c| c.contains("host"));
    let has_srflx = gathered_candidates.iter().any(|c| c.contains("srflx"));
    let has_relay = gathered_candidates.iter().any(|c| c.contains("relay"));
    
    log::info!("ICE candidates gathered: {} total, host: {}, srflx: {}, relay: {}", 
               gathered_candidates.len(), has_host, has_srflx, has_relay);
    
    let (nat_type, needs_relay) = match (has_host, has_srflx, has_relay) {
        (true, false, _) => ("Open Internet".to_string(), false),
        (true, true, _) => ("Full Cone NAT".to_string(), false),
        (false, true, _) => ("Restricted NAT".to_string(), false),
        (false, false, true) => ("Symmetric NAT".to_string(), true),
        (false, false, false) => ("No Connectivity".to_string(), true),
        _ => ("Unknown NAT".to_string(), false),
    };
    
    pc.close().await?;
    
    Ok((nat_type, needs_relay))
}

async fn test_stun_connectivity() -> bool {
    // Test basic STUN connectivity
    match tokio::time::timeout(
        tokio::time::Duration::from_secs(5),
        test_stun_server("stun:stun.l.google.com:19302")
    ).await {
        Ok(Ok(_)) => true,
        _ => false,
    }
}

async fn test_turn_connectivity() -> bool {
    // Test if we can fetch TURN config from our API
    match tokio::time::timeout(
        tokio::time::Duration::from_secs(5),
        reqwest::get("https://roguegrid9-coordinator.fly.dev/api/v1/turn-config")
    ).await {
        Ok(Ok(response)) => response.status().is_success(),
        _ => false,
    }
}

async fn test_stun_server(stun_url: &str) -> Result<(), Box<dyn std::error::Error>> {
    // Basic STUN server connectivity test
    // This is a simplified version - you could use a proper STUN client library
    use std::net::UdpSocket;
    use std::net::ToSocketAddrs;
    
    // Parse STUN URL (stun:host:port)
    let host_port = stun_url.strip_prefix("stun:").unwrap_or(stun_url);
    let addr = host_port.to_socket_addrs()?.next()
        .ok_or("Failed to resolve STUN server address")?;
    
    // Try to connect via UDP
    let socket = UdpSocket::bind("0.0.0.0:0")?;
    socket.set_read_timeout(Some(std::time::Duration::from_secs(2)))?;
    
    // Send a basic STUN binding request (simplified)
    let stun_request = [0x00, 0x01, 0x00, 0x00, 0x21, 0x12, 0xa4, 0x42, 
                       0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
                       0x00, 0x00, 0x00, 0x00];
    
    socket.send_to(&stun_request, addr)?;

    let mut buffer = [0; 1024];
    socket.recv_from(&mut buffer)?;

    Ok(())
}

// ===== GRID RELAY COMMANDS =====

/// Get relay configuration and status for a grid
#[command]
pub async fn get_grid_relay_config(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<crate::api::types::GridRelayStatusResponse, String> {
    log::info!("Tauri command: get_grid_relay_config for grid: {}", grid_id);

    // Get auth token
    let session = crate::auth::storage::get_user_session()
        .await
        .map_err(|e| format!("Failed to get user session: {}", e))?;

    let token = session
        .ok_or_else(|| "No active session".to_string())?
        .token;

    // Get API client
    let api_client = crate::api::client::CoordinatorClient::new();

    // Fetch relay status
    api_client
        .get_grid_relay_status(&token, grid_id)
        .await
        .map_err(|e| format!("Failed to get grid relay status: {}", e))
}

/// Update relay mode for a grid
#[command]
pub async fn update_grid_relay_mode(
    grid_id: String,
    relay_mode: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: update_grid_relay_mode for grid {} to {}", grid_id, relay_mode);

    // Validate relay mode
    if relay_mode != "p2p_first" && relay_mode != "relay_only" && relay_mode != "p2p_only" {
        return Err(format!("Invalid relay mode: {}. Must be one of: p2p_first, relay_only, p2p_only", relay_mode));
    }

    // Get auth token
    let session = crate::auth::storage::get_user_session()
        .await
        .map_err(|e| format!("Failed to get user session: {}", e))?;

    let token = session
        .ok_or_else(|| "No active session".to_string())?
        .token;

    // Get API client
    let api_client = crate::api::client::CoordinatorClient::new();

    // Update relay mode
    api_client
        .update_grid_relay_mode(&token, grid_id, relay_mode)
        .await
        .map_err(|e| format!("Failed to update relay mode: {}", e))
}

/// Purchase bandwidth for a grid
#[command]
pub async fn purchase_grid_bandwidth(
    grid_id: String,
    bandwidth_gb: i32,
    duration_months: i32,
    state: State<'_, AppState>,
) -> Result<crate::api::types::PaymentIntentResponse, String> {
    log::info!("Tauri command: purchase_grid_bandwidth for grid {} ({} GB, {} months)",
               grid_id, bandwidth_gb, duration_months);

    // Get auth token
    let session = crate::auth::storage::get_user_session()
        .await
        .map_err(|e| format!("Failed to get user session: {}", e))?;

    let token = session
        .ok_or_else(|| "No active session".to_string())?
        .token;

    // Get API client
    let api_client = crate::api::client::CoordinatorClient::new();

    // Create payment intent
    api_client
        .purchase_grid_bandwidth(&token, grid_id, bandwidth_gb, duration_months)
        .await
        .map_err(|e| format!("Failed to create payment intent: {}", e))
}

/// Report bandwidth usage for a grid
#[command]
pub async fn report_grid_bandwidth_usage(
    grid_id: String,
    bytes_sent: i64,
    bytes_received: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: report_grid_bandwidth_usage for grid {}: sent={}, received={}",
               grid_id, bytes_sent, bytes_received);

    // Get auth token
    let session = crate::auth::storage::get_user_session()
        .await
        .map_err(|e| format!("Failed to get user session: {}", e))?;

    let token = session
        .ok_or_else(|| "No active session".to_string())?
        .token;

    // Get API client
    let api_client = crate::api::client::CoordinatorClient::new();

    // Report usage
    api_client
        .report_bandwidth_usage(&token, grid_id, bytes_sent, bytes_received)
        .await
        .map_err(|e| format!("Failed to report bandwidth usage: {}", e))
}

// Auto-host a grid to ensure it's always available for P2P connections
#[tauri::command]
pub async fn auto_host_grid(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Auto-hosting grid: {}", grid_id);

    let p2p_state = state.p2p_manager.lock().await;
    if let Some(p2p_manager) = p2p_state.as_ref() {
        match p2p_manager.claim_grid_host(grid_id.clone()).await {
            Ok(_) => {
                log::info!("Successfully auto-hosted grid: {}", grid_id);
                Ok(())
            }
            Err(e) => {
                log::warn!("Failed to auto-host grid {}: {}", grid_id, e);
                // Don't fail - grid might already be hosted
                Ok(())
            }
        }
    } else {
        Err("P2P service not initialized".to_string())
    }
}