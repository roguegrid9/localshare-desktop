use serde::{Deserialize, Serialize};
use tauri::State;

use crate::api::CoordinatorClient;
use crate::commands::relay::{FRPState, connect_frp_relay, disconnect_frp_relay};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProcessTunnel {
    pub id: String,
    pub process_id: String,
    pub grid_id: String,
    pub subdomain: String,
    pub public_url: String,
    pub local_port: u16,
    pub protocol: String,
    pub status: String,
    pub bandwidth_used: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateProcessTunnelRequest {
    pub subdomain: String,
    pub grid_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateProcessTunnelRequest {
    pub subdomain: String,
}

/// Create a public tunnel for a process
#[tauri::command]
pub async fn create_process_tunnel(
    app_handle: tauri::AppHandle,
    frp_state: State<'_, FRPState>,
    client: State<'_, CoordinatorClient>,
    token: String,
    process_id: String,
    grid_id: String,
    subdomain: String,
) -> Result<ProcessTunnel, String> {
    let request = CreateProcessTunnelRequest {
        subdomain,
        grid_id,
    };

    // Create tunnel via API
    let tunnel = client
        .create_process_tunnel(&token, &process_id, request)
        .await
        .map_err(|e| format!("Failed to create process tunnel: {}", e))?;

    // Reconnect FRP client with new tunnel list
    disconnect_frp_relay(frp_state.clone()).await?;
    connect_frp_relay(app_handle, frp_state, client, token).await?;

    Ok(tunnel)
}

/// Get the tunnel for a process (returns null if no tunnel exists)
#[tauri::command]
pub async fn get_process_tunnel(
    client: State<'_, CoordinatorClient>,
    token: String,
    process_id: String,
) -> Result<Option<ProcessTunnel>, String> {
    client
        .get_process_tunnel(&token, &process_id)
        .await
        .map_err(|e| format!("Failed to get process tunnel: {}", e))
}

/// Update the subdomain of a process tunnel
#[tauri::command]
pub async fn update_process_tunnel_subdomain(
    client: State<'_, CoordinatorClient>,
    token: String,
    process_id: String,
    new_subdomain: String,
) -> Result<(), String> {
    let request = UpdateProcessTunnelRequest {
        subdomain: new_subdomain,
    };

    client
        .update_process_tunnel_subdomain(&token, &process_id, request)
        .await
        .map_err(|e| format!("Failed to update tunnel subdomain: {}", e))
}

/// Delete the tunnel for a process
#[tauri::command]
pub async fn delete_process_tunnel(
    app_handle: tauri::AppHandle,
    frp_state: State<'_, FRPState>,
    client: State<'_, CoordinatorClient>,
    token: String,
    process_id: String,
) -> Result<(), String> {
    // Delete tunnel via API
    client
        .delete_process_tunnel(&token, &process_id)
        .await
        .map_err(|e| format!("Failed to delete process tunnel: {}", e))?;

    // Reconnect FRP client to remove tunnel from config
    disconnect_frp_relay(frp_state.clone()).await?;
    connect_frp_relay(app_handle, frp_state, client, token).await?;

    Ok(())
}

/// Check if a tunnel subdomain is available
#[tauri::command]
pub async fn check_tunnel_subdomain_availability(
    client: State<'_, CoordinatorClient>,
    token: String,
    subdomain: String,
) -> Result<bool, String> {
    client
        .check_tunnel_subdomain_availability(&token, &subdomain)
        .await
        .map_err(|e| format!("Failed to check subdomain availability: {}", e))
}
