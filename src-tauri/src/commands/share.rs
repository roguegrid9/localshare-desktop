// Share management commands
use crate::share::{ShareInfo, ShareManager, ShareStatus};
use crate::AppState;
use anyhow::Result;
use tauri::State;
use log::{info, error};

/// Register a new process share
#[tauri::command]
pub async fn register_process_share(
    share_id: String,
    process_id: String,
    port: u16,
    subdomain: String,
    custom_name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    info!("Registering process share: {} for process {} on port {}", share_id, process_id, port);

    let share_manager = state.share_manager.lock().await;

    if let Some(manager) = share_manager.as_ref() {
        let share_info = ShareInfo {
            share_id: share_id.clone(),
            process_id,
            port,
            subdomain,
            custom_name,
        };

        manager.register_share(share_info).await
            .map_err(|e| format!("Failed to register share: {}", e))?;

        info!("Successfully registered share: {}", share_id);
        Ok(())
    } else {
        Err("Share manager not initialized".to_string())
    }
}

/// Unregister a process share
#[tauri::command]
pub async fn unregister_process_share(
    share_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    info!("Unregistering process share: {}", share_id);

    let share_manager = state.share_manager.lock().await;

    if let Some(manager) = share_manager.as_ref() {
        manager.unregister_share(&share_id).await
            .map_err(|e| format!("Failed to unregister share: {}", e))?;

        info!("Successfully unregistered share: {}", share_id);
        Ok(())
    } else {
        Err("Share manager not initialized".to_string())
    }
}

/// Get list of all active shares
#[tauri::command]
pub async fn list_active_shares(
    state: State<'_, AppState>,
) -> Result<Vec<ShareInfo>, String> {
    let share_manager = state.share_manager.lock().await;

    if let Some(manager) = share_manager.as_ref() {
        let shares = manager.list_shares().await;
        Ok(shares)
    } else {
        Err("Share manager not initialized".to_string())
    }
}

/// Get share status including visitor count
#[tauri::command]
pub async fn get_share_status(
    state: State<'_, AppState>,
) -> Result<Vec<ShareStatus>, String> {
    let share_manager = state.share_manager.lock().await;

    if let Some(manager) = share_manager.as_ref() {
        let status = manager.get_all_status().await;
        Ok(status)
    } else {
        Err("Share manager not initialized".to_string())
    }
}

/// Handle incoming share visitor request
#[tauri::command]
pub async fn handle_share_visitor(
    share_id: String,
    visitor_id: String,
    state: State<'_, AppState>,
) -> Result<ShareInfo, String> {
    info!("Handling visitor {} for share {}", visitor_id, share_id);

    let share_manager = state.share_manager.lock().await;

    if let Some(manager) = share_manager.as_ref() {
        manager.handle_visitor_request(&share_id, &visitor_id).await
            .map_err(|e| format!("Failed to handle visitor: {}", e))
    } else {
        Err("Share manager not initialized".to_string())
    }
}

/// Handle visitor disconnection
#[tauri::command]
pub async fn handle_visitor_disconnect(
    share_id: String,
    visitor_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    info!("Handling disconnect for visitor {} from share {}", visitor_id, share_id);

    let share_manager = state.share_manager.lock().await;

    if let Some(manager) = share_manager.as_ref() {
        manager.handle_visitor_disconnect(&share_id, &visitor_id).await
            .map_err(|e| format!("Failed to handle disconnect: {}", e))
    } else {
        Err("Share manager not initialized".to_string())
    }
}
