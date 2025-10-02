use crate::AppState;
use tauri::State;
#[tauri::command]
pub async fn connect_websocket(
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: connect_websocket called");
    
    let service_arc = {
        let service_state = state.grids_service.lock().await;
        if let Some(service) = service_state.as_ref() {
            service.get_websocket_manager().await
        } else {
            return Err("Grids service not initialized".to_string());
        }
    };
    
    {
        let mut ws_manager = service_arc.lock().await;
        ws_manager.set_p2p_manager(state.p2p_manager.clone());
    }
    
    // Connect the WebSocket
    let service_state = state.grids_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.connect_websocket().await.map_err(|e| {
            log::error!("Failed to connect WebSocket: {}", e);
            return e.to_string();
        })?;
    } else {
        return Err("Grids service not initialized".to_string());
    }
    
    {
        let mut websocket_state = state.websocket_manager.lock().await;
        let ws_manager = service_arc.lock().await;
        *websocket_state = Some(ws_manager.clone());
        log::info!("WebSocket manager stored in app state");
    }
    
    {
        let ws_manager = service_arc.lock().await;
        if let Some(sender) = ws_manager.get_sender().await {
            let mut p2p_state = state.p2p_manager.lock().await;
            if let Some(p2p_manager) = p2p_state.as_mut() {
                p2p_manager.set_websocket_sender(sender).await;
                log::info!("WebSocket sender connected to P2P manager");
            }
        } else {
            log::warn!("WebSocket connected but no sender available");
        }
    }
    
    Ok(())
}

#[tauri::command]
pub async fn disconnect_websocket(
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: disconnect_websocket called");
    
    let service_state = state.grids_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.disconnect_websocket().await.map_err(|e| {
            log::error!("Failed to disconnect WebSocket: {}", e);
            e.to_string()
        })
    } else {
        Err("Grids service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn is_websocket_connected(
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let service_state = state.grids_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        Ok(service.is_websocket_connected().await)
    } else {
        Ok(false)
    }
}
