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
    log::info!("Starting NAT type detection with multi-STUN port comparison");

    // Test against 3 different STUN servers to detect port allocation pattern
    let stun_servers = vec![
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun.cloudflare.com:3478",
    ];

    // Gather srflx candidates from multiple STUN servers in parallel
    let candidate_sets = gather_candidates_from_multiple_stun(stun_servers).await?;

    // Analyze port allocation pattern to determine NAT type
    let (nat_type, needs_relay) = analyze_port_allocation(candidate_sets)?;

    let quality = match nat_type.as_str() {
        "Open Internet" => "excellent",
        "Cone NAT" => "good",
        "Unknown NAT" => "fair",  // Conservative - might need relay
        "Symmetric NAT" => "needs_relay",
        "No Connectivity" => "none",
        _ => "unknown",
    };

    log::info!("NAT detection complete: type={}, needs_relay={}, quality={}",
               nat_type, needs_relay, quality);

    Ok(NatDetectionResult {
        nat_type,
        needs_relay,
        quality: quality.to_string(),
    })
}

/// Gather ICE candidates from multiple STUN servers in parallel
async fn gather_candidates_from_multiple_stun(
    stun_servers: Vec<&str>
) -> Result<Vec<Vec<String>>, Box<dyn std::error::Error>> {
    use futures_util::future::join_all;

    log::info!("Testing {} STUN servers for NAT detection", stun_servers.len());

    // Create tasks to gather candidates from each STUN server
    let mut tasks = Vec::new();

    for stun_url in stun_servers {
        let stun_url = stun_url.to_string();
        let task = tokio::spawn(async move {
            // 5 second timeout per STUN server
            match tokio::time::timeout(
                tokio::time::Duration::from_secs(5),
                gather_candidates_from_single_stun(&stun_url)
            ).await {
                Ok(Ok(candidates)) => {
                    log::info!("STUN server {} returned {} candidates", stun_url, candidates.len());
                    Some(candidates)
                }
                Ok(Err(e)) => {
                    log::warn!("Failed to gather from STUN {}: {}", stun_url, e);
                    None
                }
                Err(_) => {
                    log::warn!("Timeout gathering from STUN {}", stun_url);
                    None
                }
            }
        });
        tasks.push(task);
    }

    // Wait for all tasks to complete
    let results = join_all(tasks).await;

    // Collect successful results
    let candidate_sets: Vec<Vec<String>> = results
        .into_iter()
        .filter_map(|r| r.ok())
        .filter_map(|opt| opt)
        .collect();

    if candidate_sets.is_empty() {
        log::error!("No STUN servers responded successfully");
        return Err("Failed to contact any STUN servers".into());
    }

    log::info!("Successfully gathered candidates from {} STUN servers", candidate_sets.len());
    Ok(candidate_sets)
}

/// Gather ICE candidates from a single STUN server
async fn gather_candidates_from_single_stun(
    stun_url: &str
) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    use webrtc::peer_connection::configuration::RTCConfiguration;
    use webrtc::api::APIBuilder;
    use std::sync::{Arc, Mutex};

    // Create peer connection with this specific STUN server
    let config = RTCConfiguration {
        ice_servers: vec![
            webrtc::ice_transport::ice_server::RTCIceServer {
                urls: vec![stun_url.to_string()],
                ..Default::default()
            },
        ],
        ..Default::default()
    };

    let api = APIBuilder::new().build();
    let peer_connection = api.new_peer_connection(config).await?;
    let pc = std::sync::Arc::new(peer_connection);

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
    let _dc = pc.create_data_channel("nat_test", None).await?;

    // Create an offer to start ICE gathering
    let offer = pc.create_offer(None).await?;
    pc.set_local_description(offer).await?;

    // Wait for ICE gathering to complete (max 3 seconds)
    let mut attempts = 0;
    let max_attempts = 30; // 100ms intervals = 3 seconds

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

    // Get gathered candidates
    let gathered_candidates = {
        let cands = candidates.lock().unwrap();
        cands.clone()
    };

    // Clean up
    pc.close().await?;

    Ok(gathered_candidates)
}

/// Analyze port allocation pattern to determine NAT type
fn analyze_port_allocation(
    candidate_sets: Vec<Vec<String>>
) -> Result<(String, bool), Box<dyn std::error::Error>> {
    log::info!("Analyzing port allocation from {} STUN servers", candidate_sets.len());

    // Extract srflx (server reflexive) ports from each candidate set
    let external_ports: Vec<u16> = extract_srflx_ports(candidate_sets.clone());

    log::info!("Extracted {} external ports: {:?}", external_ports.len(), external_ports);

    // Check for any connectivity
    if external_ports.is_empty() {
        // No srflx candidates means we couldn't reach any STUN server
        // Check if we at least have host candidates
        let has_any_host = candidate_sets.iter().any(|set| {
            set.iter().any(|c| c.contains("typ host"))
        });

        if has_any_host {
            log::warn!("No external connectivity - only host candidates available");
            return Ok(("No External Connectivity".to_string(), true));
        } else {
            log::error!("No connectivity at all - no candidates gathered");
            return Ok(("No Connectivity".to_string(), true));
        }
    }

    // If we only got one response, be conservative
    if external_ports.len() == 1 {
        log::warn!("Only one STUN server responded - cannot reliably determine NAT type");
        return Ok(("Unknown NAT".to_string(), true)); // Conservative - assume needs relay
    }

    // Compare ports to detect NAT behavior
    let first_port = external_ports[0];
    let all_same_port = external_ports.iter().all(|&p| p == first_port);

    if all_same_port {
        // Same external port for all STUN servers = Cone NAT (any variant)
        // This means P2P should work with STUN assistance
        log::info!("All external ports are the same ({}): Cone NAT detected", first_port);
        Ok(("Cone NAT".to_string(), false))
    } else {
        // Different external ports = Symmetric NAT
        // This requires TURN relay for reliable connectivity
        log::warn!(
            "Different external ports detected ({}): Symmetric NAT - TURN required",
            external_ports.iter().map(|p| p.to_string()).collect::<Vec<_>>().join(", ")
        );
        Ok(("Symmetric NAT".to_string(), true))
    }
}

/// Extract server-reflexive (srflx) ports from candidate sets
fn extract_srflx_ports(candidate_sets: Vec<Vec<String>>) -> Vec<u16> {
    let mut ports = Vec::new();

    for (idx, candidates) in candidate_sets.iter().enumerate() {
        // Find first srflx candidate in this set
        for candidate in candidates {
            if candidate.contains("typ srflx") {
                if let Some(port) = parse_candidate_port(candidate) {
                    log::debug!("STUN server {} returned external port: {}", idx, port);
                    ports.push(port);
                    break; // Only take one port per STUN server
                }
            }
        }
    }

    ports
}

/// Parse port from ICE candidate string
/// Format: "candidate:foundation component protocol priority ip port typ type ..."
/// Example: "candidate:1 1 UDP 2130706431 74.105.113.48 54321 typ srflx raddr 192.168.1.1 rport 54321"
fn parse_candidate_port(candidate: &str) -> Option<u16> {
    let parts: Vec<&str> = candidate.split_whitespace().collect();

    // ICE candidate format has port at index 5 (0-indexed)
    if parts.len() >= 7 {
        // Find "typ" keyword to verify structure
        if let Some(typ_idx) = parts.iter().position(|&p| p == "typ") {
            if typ_idx >= 2 {
                // Port should be 2 positions before "typ"
                let port_idx = typ_idx - 1;
                if let Ok(port) = parts[port_idx].parse::<u16>() {
                    return Some(port);
                }
            }
        }
    }

    log::warn!("Failed to parse port from candidate: {}", candidate);
    None
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