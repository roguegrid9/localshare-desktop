// Tunnel management commands

use crate::state::app::AppState;
use crate::tunnel::{HttpProxy, TunnelClient};
use anyhow::Result;
use log::{error, info};
use std::sync::Arc;
use tauri::State;

/// Start a tunnel for a process
#[tauri::command]
pub async fn start_tunnel(
    grid_share_id: String,
    process_id: String,
    local_port: u16,
    state: State<'_, AppState>,
) -> Result<String, String> {
    info!(
        "Starting tunnel for process {} (port {}) in grid share {}",
        process_id, local_port, grid_share_id
    );

    // Get auth token
    let token = state
        .auth_token
        .lock()
        .await
        .clone()
        .ok_or_else(|| "Not authenticated".to_string())?;

    // Get server URL from config
    let server_url = "https://roguegrid9-coordinator.fly.dev".to_string();

    // Create HTTP proxy for local process (wrapped in Arc for shared ownership)
    let proxy = Arc::new(
        HttpProxy::new(local_port).map_err(|e| format!("Failed to create proxy: {}", e))?
    );

    // Create tunnel client
    let tunnel_client = Arc::new(TunnelClient::new(
        server_url,
        token,
        grid_share_id.clone(),
        process_id.clone(),
        local_port,
        move |request| {
            // Forward request to local process via proxy
            let proxy_clone = Arc::clone(&proxy);
            tokio::runtime::Handle::current().block_on(async move {
                proxy_clone.forward_request(request).await
            })
        },
    ));

    // Store tunnel client in state
    let mut tunnels = state.active_tunnels.lock().await;
    let tunnel_key = format!("{}:{}", grid_share_id, process_id);
    tunnels.insert(tunnel_key.clone(), Arc::clone(&tunnel_client));

    // Start tunnel in background
    let tunnel_client_bg = Arc::clone(&tunnel_client);
    tokio::spawn(async move {
        if let Err(e) = tunnel_client_bg.start().await {
            error!("Tunnel error: {}", e);
        }
    });

    // Wait a bit for connection to establish
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    // Check if connected
    if !tunnel_client.is_connected().await {
        return Err("Failed to establish tunnel connection".to_string());
    }

    let tunnel_id = tunnel_client
        .tunnel_id()
        .await
        .ok_or_else(|| "Tunnel ID not received".to_string())?;

    info!("Tunnel started successfully: {}", tunnel_id);

    Ok(tunnel_id)
}

/// Stop a tunnel
#[tauri::command]
pub async fn stop_tunnel(
    grid_share_id: String,
    process_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    info!(
        "Stopping tunnel for process {} in grid share {}",
        process_id, grid_share_id
    );

    let mut tunnels = state.active_tunnels.lock().await;
    let tunnel_key = format!("{}:{}", grid_share_id, process_id);

    if tunnels.remove(&tunnel_key).is_some() {
        info!("Tunnel stopped successfully");
        Ok(())
    } else {
        Err("Tunnel not found".to_string())
    }
}

/// Get active tunnel status
#[tauri::command]
pub async fn get_tunnel_status(
    grid_share_id: String,
    process_id: String,
    state: State<'_, AppState>,
) -> Result<TunnelStatus, String> {
    let tunnels = state.active_tunnels.lock().await;
    let tunnel_key = format!("{}:{}", grid_share_id, process_id);

    if let Some(tunnel) = tunnels.get(&tunnel_key) {
        let is_connected = tunnel.is_connected().await;
        let tunnel_id = tunnel.tunnel_id().await;

        Ok(TunnelStatus {
            is_active: true,
            is_connected,
            tunnel_id,
        })
    } else {
        Ok(TunnelStatus {
            is_active: false,
            is_connected: false,
            tunnel_id: None,
        })
    }
}

/// List all active tunnels
#[tauri::command]
pub async fn list_active_tunnels(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let tunnels = state.active_tunnels.lock().await;
    let keys: Vec<String> = tunnels.keys().cloned().collect();
    Ok(keys)
}

#[derive(serde::Serialize)]
pub struct TunnelStatus {
    pub is_active: bool,
    pub is_connected: bool,
    pub tunnel_id: Option<String>,
}
