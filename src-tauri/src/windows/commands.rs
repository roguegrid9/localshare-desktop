use crate::state::app::AppState;
use super::types::*;
use tauri::{AppHandle, State};

/// Initialize the window management system
#[tauri::command]
pub async fn initialize_window_manager(
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Initializing window manager...");
    
    let window_manager = super::manager::WindowManager::new(app_handle);
    
    let mut window_guard = state.window_manager.lock().await;
    *window_guard = Some(window_manager);
    
    log::info!("Window manager initialized successfully");
    Ok(())
}

/// Get all window states
#[tauri::command]
pub async fn get_all_windows(
    state: State<'_, AppState>,
) -> Result<AllWindowsResponse, String> {
    let window_manager = state.window_manager.lock().await;
    
    if let Some(manager) = window_manager.as_ref() {
        let windows = manager.get_all_windows().await?;
        let main_window_id = "main".to_string(); // Could get this from manager
        
        Ok(AllWindowsResponse { windows, main_window_id })
    } else {
        Err("Window manager not initialized".to_string())
    }
}

/// Get a specific window state
#[tauri::command]
pub async fn get_window_state(
    window_id: String,
    state: State<'_, AppState>,
) -> Result<WindowStateResponse, String> {
    let window_manager = state.window_manager.lock().await;
    
    if let Some(manager) = window_manager.as_ref() {
        let window = manager.get_window(&window_id).await?;
        Ok(WindowStateResponse { window })
    } else {
        Err("Window manager not initialized".to_string())
    }
}

/// Create a new tab
#[tauri::command]
pub async fn create_tab(
    request: CreateTabRequest,
    state: State<'_, AppState>,
) -> Result<Tab, String> {
    let window_manager = state.window_manager.lock().await;
    
    if let Some(manager) = window_manager.as_ref() {
        manager.create_tab(
            request.content,
            request.title,
            request.window_id,
        ).await
    } else {
        Err("Window manager not initialized".to_string())
    }
}

/// Close a tab
#[tauri::command]
pub async fn close_tab(
    window_id: String,
    tab_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let window_manager = state.window_manager.lock().await;
    
    if let Some(manager) = window_manager.as_ref() {
        manager.close_tab(&window_id, &tab_id).await
    } else {
        Err("Window manager not initialized".to_string())
    }
}

/// Activate a tab
#[tauri::command]
pub async fn activate_tab(
    window_id: String,
    tab_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let window_manager = state.window_manager.lock().await;
    
    if let Some(manager) = window_manager.as_ref() {
        manager.activate_tab(&window_id, &tab_id).await
    } else {
        Err("Window manager not initialized".to_string())
    }
}

/// Detach a tab into a new window
#[tauri::command]
pub async fn detach_tab(
    request: DetachTabRequest,
    state: State<'_, AppState>,
) -> Result<WindowState, String> {
    let window_manager = state.window_manager.lock().await;
    
    if let Some(manager) = window_manager.as_ref() {
        // Create window config from request
        let mut config = WindowConfig::default();
        config.title = format!("RogueGrid9 - Detached");
        
        if let Some(size) = request.size {
            config.width = size.width;
            config.height = size.height;
        }
        
        if let Some(position) = request.position {
            config.position = Some(position);
        }
        
        manager.detach_tab(
            &request.source_window_id,
            &request.tab_id,
            Some(config),
        ).await
    } else {
        Err("Window manager not initialized".to_string())
    }
}

/// Reattach a tab to an existing window
#[tauri::command]
pub async fn reattach_tab(
    request: ReattachTabRequest,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let window_manager = state.window_manager.lock().await;
    
    if let Some(manager) = window_manager.as_ref() {
        manager.reattach_tab(
            &request.source_window_id,
            &request.target_window_id,
            &request.tab_id,
            request.position_index,
        ).await
    } else {
        Err("Window manager not initialized".to_string())
    }
}

/// Move a tab between windows or within the same window
#[tauri::command]
pub async fn move_tab(
    request: MoveTabRequest,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let window_manager = state.window_manager.lock().await;
    
    if let Some(manager) = window_manager.as_ref() {
        let position = request.position_index.unwrap_or(0);
        manager.move_tab(
            &request.source_window_id,
            &request.target_window_id,
            &request.tab_id,
            position,
        ).await
    } else {
        Err("Window manager not initialized".to_string())
    }
}

/// Close a window
#[tauri::command]
pub async fn close_window(
    window_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let window_manager = state.window_manager.lock().await;
    
    if let Some(manager) = window_manager.as_ref() {
        manager.close_window(&window_id).await
    } else {
        Err("Window manager not initialized".to_string())
    }
}

/// Focus a window
#[tauri::command]
pub async fn focus_window(
    window_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let window_manager = state.window_manager.lock().await;
    
    if let Some(manager) = window_manager.as_ref() {
        manager.focus_window(&window_id).await
    } else {
        Err("Window manager not initialized".to_string())
    }
}

/// Update tab title
#[tauri::command]
pub async fn update_tab_title(
    window_id: String,
    tab_id: String,
    title: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let window_manager = state.window_manager.lock().await;
    
    if let Some(manager) = window_manager.as_ref() {
        manager.update_tab_title(&window_id, &tab_id, title).await
    } else {
        Err("Window manager not initialized".to_string())
    }
}

/// Set tab notification status
#[tauri::command]
pub async fn set_tab_notification(
    window_id: String,
    tab_id: String,
    has_notification: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let window_manager = state.window_manager.lock().await;
    
    if let Some(manager) = window_manager.as_ref() {
        manager.set_tab_notification(&window_id, &tab_id, has_notification).await
    } else {
        Err("Window manager not initialized".to_string())
    }
}

/// Get window statistics for debugging
#[tauri::command]
pub async fn get_window_stats(
    state: State<'_, AppState>,
) -> Result<std::collections::HashMap<String, serde_json::Value>, String> {
    let window_manager = state.window_manager.lock().await;
    
    if let Some(manager) = window_manager.as_ref() {
        Ok(manager.get_window_stats().await)
    } else {
        Err("Window manager not initialized".to_string())
    }
}

/// Create a terminal tab
#[tauri::command]
pub async fn create_terminal_tab(
    session_id: String,
    grid_id: Option<String>,
    title: Option<String>,
    window_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Tab, String> {
    let content = TabContentType::Terminal {
        session_id,
        grid_id,
        title: title.clone().unwrap_or("Terminal".to_string()),
    };

    let request = CreateTabRequest {
        content,
        title,
        window_id,
    };

    create_tab(request, state).await
}

/// Create a text channel tab
#[tauri::command]
pub async fn create_text_channel_tab(
    channel_id: String,
    grid_id: String,
    channel_name: String,
    window_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Tab, String> {
    let content = TabContentType::TextChannel {
        channel_id,
        grid_id,
        channel_name: channel_name.clone(),
    };

    let request = CreateTabRequest {
        content,
        title: Some(format!("#{}", channel_name)),
        window_id,
    };

    create_tab(request, state).await
}

/// Create a media channel tab
#[tauri::command]
pub async fn create_media_channel_tab(
    channel_id: String,
    grid_id: String,
    channel_name: String,
    media_type: String,
    window_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Tab, String> {
    let media_type = match media_type.as_str() {
        "voice" => MediaType::Voice,
        "video" => MediaType::Video,
        "both" => MediaType::Both,
        _ => return Err("Invalid media type".to_string()),
    };

    let content = TabContentType::MediaChannel {
        channel_id,
        grid_id,
        channel_name: channel_name.clone(),
        media_type,
    };

    let request = CreateTabRequest {
        content,
        title: Some(format!("{}", channel_name)),
        window_id,
    };

    create_tab(request, state).await
}

/// Create a process tab
#[tauri::command]
pub async fn create_process_tab(
    process_id: String,
    grid_id: String,
    process_name: String,
    window_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Tab, String> {
    let content = TabContentType::Process {
        process_id,
        grid_id,
        process_name: process_name.clone(),
    };

    let request = CreateTabRequest {
        content,
        title: Some(process_name),
        window_id,
    };

    create_tab(request, state).await
}

/// Create a grid dashboard tab
#[tauri::command]
pub async fn create_grid_dashboard_tab(
    grid_id: String,
    grid_name: String,
    window_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Tab, String> {
    let content = TabContentType::GridDashboard {
        grid_id,
        grid_name: grid_name.clone(),
    };

    let request = CreateTabRequest {
        content,
        title: Some(format!("{} Dashboard", grid_name)),
        window_id,
    };

    create_tab(request, state).await
}

/// Create a network dashboard tab
#[tauri::command]
pub async fn create_network_dashboard_tab(
    window_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Tab, String> {
    let content = TabContentType::NetworkDashboard;

    let request = CreateTabRequest {
        content,
        title: Some("Network Dashboard".to_string()),
        window_id,
    };

    create_tab(request, state).await
}

/// Create a welcome tab
#[tauri::command]
pub async fn create_welcome_tab(
    window_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Tab, String> {
    let content = TabContentType::Welcome;

    let request = CreateTabRequest {
        content,
        title: Some("Welcome".to_string()),
        window_id,
    };

    create_tab(request, state).await
}

/// Get the active tab for a window
#[tauri::command]
pub async fn get_active_tab(
    window_id: String,
    state: State<'_, AppState>,
) -> Result<Option<Tab>, String> {
    let window_manager = state.window_manager.lock().await;
    
    if let Some(manager) = window_manager.as_ref() {
        let window = manager.get_window(&window_id).await?;
        Ok(window.get_active_tab().cloned())
    } else {
        Err("Window manager not initialized".to_string())
    }
}

/// Check if a window exists
#[tauri::command]
pub async fn window_exists(
    window_id: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let window_manager = state.window_manager.lock().await;
    
    if let Some(manager) = window_manager.as_ref() {
        match manager.get_window(&window_id).await {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    } else {
        Ok(false)
    }
}

/// Get tab count for a window
#[tauri::command]
pub async fn get_tab_count(
    window_id: String,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let window_manager = state.window_manager.lock().await;
    
    if let Some(manager) = window_manager.as_ref() {
        let window = manager.get_window(&window_id).await?;
        Ok(window.tab_count())
    } else {
        Err("Window manager not initialized".to_string())
    }
}

/// Serialize current window state for persistence
#[tauri::command]
pub async fn serialize_window_state(
    state: State<'_, AppState>,
) -> Result<String, String> {
    let window_manager = state.window_manager.lock().await;
    
    if let Some(manager) = window_manager.as_ref() {
        manager.serialize_state().await
    } else {
        Err("Window manager not initialized".to_string())
    }
}

/// Restore window state from serialized data
#[tauri::command]
pub async fn restore_window_state(
    serialized_state: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let window_manager = state.window_manager.lock().await;
    
    if let Some(manager) = window_manager.as_ref() {
        manager.restore_state(&serialized_state).await
    } else {
        Err("Window manager not initialized".to_string())
    }
}
