use tauri::State;
use std::sync::Mutex;
use crate::api::CoordinatorClient;
use crate::frp::{FRPClient, FRPStatus, TunnelConfig};
use crate::api::{RelaySubscription, Tunnel, SubdomainAvailability};

// App state for FRP client
pub struct FRPState {
    pub client: Mutex<Option<FRPClient>>,
}

/// Start FRP relay subscription
#[tauri::command]
pub async fn start_relay_trial(
    api_client: State<'_, CoordinatorClient>,
    token: String,
    location: Option<String>,
) -> Result<RelaySubscription, String> {
    api_client
        .start_relay_trial(&token, location)
        .await
        .map_err(|e| e.to_string())
}

/// Connect to FRP relay with credentials from server
#[tauri::command]
pub async fn connect_frp_relay(
    app_handle: tauri::AppHandle,
    frp_state: State<'_, FRPState>,
    api_client: State<'_, CoordinatorClient>,
    token: String,
) -> Result<(), String> {
    // Get credentials from API
    let response = api_client
        .get_relay_credentials(&token)
        .await
        .map_err(|e| e.to_string())?;

    // Get tunnels
    let tunnels = api_client
        .list_tunnels(&token)
        .await
        .map_err(|e| e.to_string())?;

    // Convert API tunnels to FRP tunnel configs
    let tunnel_configs: Vec<TunnelConfig> = tunnels
        .iter()
        .map(|t| TunnelConfig {
            id: t.id.clone(),
            subdomain: t.subdomain.clone(),
            local_port: t.local_port,
            protocol: t.protocol.clone(),
        })
        .collect();

    // Select best server by latency (do this BEFORE acquiring the lock)
    if response.servers.is_empty() {
        return Err("No relay servers available".to_string());
    }

    let best_server = if response.servers.len() == 1 {
        // Only one server, use it
        response.servers[0].clone()
    } else {
        // Test latency to all servers and pick the best
        log::info!("Testing latency to {} relay servers", response.servers.len());
        select_best_server(&response.servers).await?
    };

    log::info!("Selected relay server: {} (port {})", best_server.server_addr, best_server.server_port);

    // Convert API FRPCredentials to frp module FRPCredentials
    let frp_creds = crate::frp::FRPCredentials {
        server_addr: best_server.server_addr,
        server_port: best_server.server_port,
        auth_token: best_server.auth_token,
        user_id: best_server.user_id,
    };

    // Initialize FRP client if not exists (acquire lock AFTER async operations)
    let mut frp_guard = frp_state.client.lock().unwrap();
    if frp_guard.is_none() {
        *frp_guard = Some(FRPClient::new(&app_handle).map_err(|e| e.to_string())?);
    }

    // Connect
    if let Some(frp) = frp_guard.as_mut() {
        frp.connect(frp_creds, tunnel_configs)
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Disconnect from FRP relay
#[tauri::command]
pub async fn disconnect_frp_relay(
    frp_state: State<'_, FRPState>,
) -> Result<(), String> {
    let mut frp_guard = frp_state.client.lock().unwrap();

    if let Some(frp) = frp_guard.as_mut() {
        frp.disconnect().map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Get FRP connection status
#[tauri::command]
pub async fn get_frp_status(
    frp_state: State<'_, FRPState>,
) -> Result<FRPStatus, String> {
    let frp_guard = frp_state.client.lock().unwrap();

    if let Some(frp) = frp_guard.as_ref() {
        Ok(frp.get_status())
    } else {
        Ok(FRPStatus {
            connected: false,
            tunnels_active: 0,
            server_addr: None,
            uptime_seconds: 0,
        })
    }
}

/// Create a new public tunnel
#[tauri::command]
pub async fn create_tunnel_command(
    app_handle: tauri::AppHandle,
    frp_state: State<'_, FRPState>,
    api_client: State<'_, CoordinatorClient>,
    token: String,
    subdomain: String,
    local_port: u16,
    protocol: String,
) -> Result<Tunnel, String> {
    // Create tunnel via API
    let tunnel = api_client
        .create_tunnel(&token, subdomain, local_port, protocol)
        .await
        .map_err(|e| e.to_string())?;

    // Reconnect FRP client with new tunnel list
    disconnect_frp_relay(frp_state.clone()).await?;
    connect_frp_relay(app_handle, frp_state, api_client, token).await?;

    Ok(tunnel)
}

/// List all tunnels for authenticated user
#[tauri::command]
pub async fn list_tunnels_command(
    api_client: State<'_, CoordinatorClient>,
    token: String,
) -> Result<Vec<Tunnel>, String> {
    api_client
        .list_tunnels(&token)
        .await
        .map_err(|e| e.to_string())
}

/// Delete a tunnel
#[tauri::command]
pub async fn delete_tunnel_command(
    app_handle: tauri::AppHandle,
    frp_state: State<'_, FRPState>,
    api_client: State<'_, CoordinatorClient>,
    token: String,
    tunnel_id: String,
) -> Result<(), String> {
    // Delete tunnel via API
    api_client
        .delete_tunnel(&token, tunnel_id)
        .await
        .map_err(|e| e.to_string())?;

    // Reconnect FRP client to remove tunnel from config
    disconnect_frp_relay(frp_state.clone()).await?;
    connect_frp_relay(app_handle, frp_state, api_client, token).await?;

    Ok(())
}

/// Check subdomain availability (public endpoint)
#[tauri::command]
pub async fn check_subdomain_command(
    api_client: State<'_, CoordinatorClient>,
    subdomain: String,
) -> Result<SubdomainAvailability, String> {
    api_client
        .check_subdomain(subdomain)
        .await
        .map_err(|e| e.to_string())
}

use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct NATDetectionResult {
    pub nat_type: String, // "open", "moderate", "strict", "symmetric", "unknown"
    pub p2p_likely: bool,
    pub needs_relay: bool,
    pub confidence: String, // "high", "medium", "low"
    pub details: String,
}

/// Detect NAT type using STUN servers
#[tauri::command]
pub async fn detect_nat_type() -> Result<NATDetectionResult, String> {
    use webrtc::peer_connection::configuration::RTCConfiguration;
    use webrtc::peer_connection::RTCPeerConnection;
    use webrtc::ice_transport::ice_server::RTCIceServer;
    use webrtc::api::APIBuilder;
    use webrtc::api::media_engine::MediaEngine;
    use std::sync::Arc;
    use tokio::time::{timeout, Duration};

    // Create WebRTC API
    let api = APIBuilder::new()
        .with_media_engine(MediaEngine::default())
        .build();

    // STUN servers for detection
    let ice_servers = vec![
        RTCIceServer {
            urls: vec!["stun:stun.l.google.com:19302".to_string()],
            ..Default::default()
        },
        RTCIceServer {
            urls: vec!["stun:stun.cloudflare.com:3478".to_string()],
            ..Default::default()
        },
    ];

    let config = RTCConfiguration {
        ice_servers,
        ..Default::default()
    };

    // Create peer connection
    let peer_connection = Arc::new(
        api.new_peer_connection(config)
            .await
            .map_err(|e| format!("Failed to create peer connection: {}", e))?
    );

    // Create data channel to trigger ICE gathering
    let _data_channel = peer_connection
        .create_data_channel("test", None)
        .await
        .map_err(|e| format!("Failed to create data channel: {}", e))?;

    // Create offer to start ICE gathering
    let offer = peer_connection
        .create_offer(None)
        .await
        .map_err(|e| format!("Failed to create offer: {}", e))?;

    peer_connection
        .set_local_description(offer)
        .await
        .map_err(|e| format!("Failed to set local description: {}", e))?;

    // Collect ICE candidates
    let mut candidates: Vec<String> = Vec::new();
    let candidate_timeout = Duration::from_secs(5);

    let result = timeout(candidate_timeout, async {
        loop {
            tokio::time::sleep(Duration::from_millis(100)).await;
            if let Some(local_desc) = peer_connection.local_description().await {
                if local_desc.sdp.contains("a=candidate:") {
                    // Parse candidates from SDP
                    for line in local_desc.sdp.lines() {
                        if line.starts_with("a=candidate:") {
                            candidates.push(line.to_string());
                        }
                    }
                    if !candidates.is_empty() {
                        break;
                    }
                }
            }
        }
    }).await;

    // Close the connection
    let _ = peer_connection.close().await;

    // Analyze candidates
    if result.is_err() || candidates.is_empty() {
        return Ok(NATDetectionResult {
            nat_type: "unknown".to_string(),
            p2p_likely: false,
            needs_relay: true,
            confidence: "low".to_string(),
            details: "Could not detect NAT type. Network may be heavily restricted.".to_string(),
        });
    }

    let has_host = candidates.iter().any(|c| c.contains("typ host"));
    let has_srflx = candidates.iter().any(|c| c.contains("typ srflx"));
    let srflx_count = candidates.iter().filter(|c| c.contains("typ srflx")).count();

    // Classify NAT type
    let (nat_type, p2p_likely, needs_relay, confidence, details) = if has_host && !has_srflx {
        (
            "open".to_string(),
            true,
            false,
            "high".to_string(),
            "Your network has no NAT. P2P connections work perfectly (95%+ success rate).".to_string()
        )
    } else if has_host && has_srflx && srflx_count == 1 {
        (
            "moderate".to_string(),
            true,
            false,
            "high".to_string(),
            "Your network uses Full Cone or Restricted Cone NAT. P2P works well (85-90% success rate).".to_string()
        )
    } else if has_srflx && srflx_count == 1 {
        (
            "strict".to_string(),
            false,
            true,
            "medium".to_string(),
            "Your network uses Port Restricted NAT. P2P fails frequently (40-60% success rate). FRP relay recommended.".to_string()
        )
    } else if has_srflx && srflx_count > 1 {
        (
            "symmetric".to_string(),
            false,
            true,
            "high".to_string(),
            "Your network uses Symmetric NAT. P2P rarely works (10-20% success rate). FRP relay strongly recommended.".to_string()
        )
    } else {
        (
            "unknown".to_string(),
            false,
            true,
            "low".to_string(),
            "Could not determine NAT type. Connection quality unknown.".to_string()
        )
    };

    Ok(NATDetectionResult {
        nat_type,
        p2p_likely,
        needs_relay,
        confidence,
        details,
    })
}

/// Test latency to all servers and return the one with lowest latency
async fn select_best_server(servers: &[crate::api::FRPCredentials]) -> Result<crate::api::FRPCredentials, String> {
    use tokio::net::TcpStream;
    use tokio::time::{timeout, Duration, Instant};

    let mut best_server: Option<crate::api::FRPCredentials> = None;
    let mut best_latency = Duration::from_secs(999);

    // Test each server concurrently
    let mut tasks = Vec::new();

    for server in servers {
        let addr = server.server_addr.clone();
        let port = server.server_port;
        let server_clone = server.clone();

        let task = tokio::spawn(async move {
            let start = Instant::now();
            let connect_timeout = Duration::from_secs(3);

            let result = timeout(
                connect_timeout,
                TcpStream::connect(format!("{}:{}", addr, port))
            ).await;

            match result {
                Ok(Ok(_stream)) => {
                    let latency = start.elapsed();
                    log::info!("Server {} latency: {:?}", addr, latency);
                    Some((server_clone, latency))
                }
                Ok(Err(e)) => {
                    log::warn!("Failed to connect to server {}: {}", addr, e);
                    None
                }
                Err(_) => {
                    log::warn!("Timeout connecting to server {}", addr);
                    None
                }
            }
        });

        tasks.push(task);
    }

    // Wait for all tests to complete
    for task in tasks {
        if let Ok(Some((server, latency))) = task.await {
            if latency < best_latency {
                best_latency = latency;
                best_server = Some(server);
            }
        }
    }

    best_server.ok_or_else(|| "No relay servers are reachable".to_string())
}
