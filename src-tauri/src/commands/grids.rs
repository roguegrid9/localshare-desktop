use crate::api::types::{Grid, GridsState, SearchUsersResponse, CreateGridRequest, CreateGridResponse, GetMyGridsResponse, GridDetailsResponse, GridMember, GridInvitation};
use crate::grids::GridsService;
use crate::api::types::{GridPermissions, ProcessPermissions, UpdateGridSettingsRequest, UpdateMemberPermissionsRequest, GetAuditLogRequest, GetAuditLogResponse};
use crate::AppState;
use tauri::State;


// Grid service initialization
#[tauri::command]
pub async fn initialize_grids_service(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: initialize_grids_service called");
    
    let grids_service = GridsService::new(app_handle);
    let mut service_state = state.grids_service.lock().await;
    *service_state = Some(grids_service);
    
    log::info!("Grids service initialized successfully");
    Ok(())
}

// Grid management commands
#[tauri::command]
pub async fn create_grid(
    request: CreateGridRequest,
    state: State<'_, AppState>,
) -> Result<CreateGridResponse, String> {
    log::info!("Tauri command: create_grid called for: {}", request.name);
    
    let service_state = state.grids_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.create_grid(request).await.map_err(|e| {
            log::error!("Failed to create grid: {}", e);
            e.to_string()
        })
    } else {
        Err("Grids service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_my_grids(
    state: State<'_, AppState>,
) -> Result<GetMyGridsResponse, String> {
    log::info!("Tauri command: get_my_grids called");
    
    let service_state = state.grids_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        match service.fetch_grids().await {
            Ok(response) => {
                log::info!("🔍 Rust: Successfully fetched grids");
                log::info!("🔍 Rust: Response has {} grids, total: {}", response.grids.len(), response.total);
                log::info!("🔍 Rust: About to serialize and return response");
                Ok(response)
            }
            Err(e) => {
                log::error!("❌ Rust: Failed to get grids: {}", e);
                Err(e.to_string())
            }
        }
    } else {
        Err("Grids service not initialized".to_string())
    }
}


#[tauri::command]
pub async fn get_grid_processes(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    log::info!("Tauri command: get_grid_processes called for: {}", grid_id);

    // Try terminal sessions as processes first
    let terminal_state = state.terminal_manager.lock().await;
    if let Some(terminal_manager) = terminal_state.as_ref() {
        // get_grid_sessions returns Vec<TerminalSessionInfo> directly, not Result
        let sessions = terminal_manager.get_grid_sessions(&grid_id);
        
        if !sessions.is_empty() {
            let process_infos: Vec<serde_json::Value> = sessions.into_iter().map(|session| {
                serde_json::json!({
                    "process_id": session.session_id,
                    "grid_id": grid_id,
                    "status": {
                        "state": if session.is_active { "Running" } else { "Stopped" },
                        "pid": null, // TerminalSessionInfo doesn't have pid field
                        "exit_code": null
                    },
                    "config": {
                        "executable_path": if session.shell_type.is_empty() { "bash".to_string() } else { session.shell_type },
                        "args": [],
                        "env_vars": {}
                    },
                    "created_at": session.created_at
                })
            }).collect();
            
            log::info!("Retrieved {} terminal sessions as processes", process_infos.len());
            return Ok(process_infos);
        }
    }

    // Try to get processes from process manager
    let process_state = state.process_manager.lock().await;
    if let Some(process_manager) = process_state.as_ref() {
        let all_processes = process_manager.get_active_processes().await;
        let grid_processes: Vec<serde_json::Value> = all_processes.into_iter()
            .filter_map(|p| {
                // Convert your ProcessInfo to the expected JSON format
                if let Ok(json_val) = serde_json::to_value(&p) {
                    // Check if this process belongs to the grid
                    if json_val.get("grid_id").and_then(|v| v.as_str()) == Some(&grid_id) {
                        Some(json_val)
                    } else {
                        None
                    }
                } else {
                    None
                }
            })
            .collect();
        
        if !grid_processes.is_empty() {
            log::info!("Retrieved {} processes from process manager", grid_processes.len());
            return Ok(grid_processes);
        }
    }

    // Return empty array if no process sources are available
    log::info!("No active processes found for grid, returning empty array");
    Ok(Vec::new())
}

#[tauri::command]
pub async fn get_grid_channels(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    log::info!("Tauri command: get_grid_channels called for: {}", grid_id);
    
    // Try to get channels from messaging service if available
    let messaging_state = state.messaging_service.lock().await;
    if let Some(messaging_service) = messaging_state.as_ref() {
        // CHANGE: Use get_grid_channels (HTTP call) instead of get_cached_channels
        match messaging_service.get_grid_channels(&grid_id).await {
            Ok(channels) => {
                // Convert ChannelInfo to JSON to avoid type issues
                let channels_json: Vec<serde_json::Value> = channels.into_iter()
                    .filter_map(|channel| serde_json::to_value(&channel).ok())
                    .collect();
                    
                log::info!("Retrieved {} channels from HTTP request", channels_json.len());
                return Ok(channels_json);
            }
            Err(e) => {
                log::error!("Failed to get channels via HTTP: {}", e);
                // Fallback to cached channels
                let channels = messaging_service.get_cached_channels(&grid_id).await;
                let channels_json: Vec<serde_json::Value> = channels.into_iter()
                    .filter_map(|channel| serde_json::to_value(&channel).ok())
                    .collect();
                    
                log::info!("Retrieved {} channels from cache (fallback)", channels_json.len());
                return Ok(channels_json);
            }
        }
    }

    // Return empty array if no messaging service
    log::info!("No messaging service available, returning empty channels array");
    Ok(Vec::new())
}

#[tauri::command]
pub async fn get_grids_from_cache(
    state: State<'_, AppState>,
) -> Result<GetMyGridsResponse, String> {
    log::info!("Tauri command: get_grids_from_cache called");
    
    let service_state = state.grids_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        Ok(service.get_grids_from_cache().await)
    } else {
        Err("Grids service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_grid_details(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<GridDetailsResponse, String> {
    log::info!("Tauri command: get_grid_details called for: {}", grid_id);
    
    let service_state = state.grids_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.get_grid_details(grid_id).await.map_err(|e| {
            log::error!("Failed to get grid details: {}", e);
            e.to_string()
        })
    } else {
        Err("Grids service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_grid_members(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<GridMember>, String> {
    log::info!("Tauri command: get_grid_members called for: {}", grid_id);
    
    let service_state = state.grids_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.get_grid_members(grid_id).await.map_err(|e| {
            log::error!("Failed to get grid members: {}", e);
            e.to_string()
        })
    } else {
        Err("Grids service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn invite_user_to_grid(
    grid_id: String,
    user_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: invite_user_to_grid called for grid {} user {}", grid_id, user_id);
    
    let service_state = state.grids_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.invite_user_to_grid(grid_id, user_id).await.map_err(|e| {
            log::error!("Failed to invite user to grid: {}", e);
            e.to_string()
        })
    } else {
        Err("Grids service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn join_grid_by_code(
    invite_code: String,
    state: State<'_, AppState>,
) -> Result<Grid, String> {
    log::info!("Tauri command: join_grid_by_code called");
    
    let service_state = state.grids_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.join_grid_by_code(invite_code).await.map_err(|e| {
            log::error!("Failed to join grid by code: {}", e);
            e.to_string()
        })
    } else {
        Err("Grids service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_grid_invitations(
    state: State<'_, AppState>,
) -> Result<Vec<GridInvitation>, String> {
    log::info!("Tauri command: get_grid_invitations called");
    
    let service_state = state.grids_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.get_grid_invitations().await.map_err(|e| {
            log::error!("Failed to get grid invitations: {}", e);
            e.to_string()
        })
    } else {
        Err("Grids service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn accept_grid_invitation(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: accept_grid_invitation called for: {}", grid_id);
    
    let service_state = state.grids_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.accept_grid_invitation(grid_id).await.map_err(|e| {
            log::error!("Failed to accept grid invitation: {}", e);
            e.to_string()
        })
    } else {
        Err("Grids service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn decline_grid_invitation(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: decline_grid_invitation called for: {}", grid_id);
    
    let service_state = state.grids_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.decline_grid_invitation(grid_id).await.map_err(|e| {
            log::error!("Failed to decline grid invitation: {}", e);
            e.to_string()
        })
    } else {
        Err("Grids service not initialized".to_string())
    }
}

// User search (for inviting to grids)
#[tauri::command]
pub async fn search_users(
    query: String,
    limit: Option<u32>,
    state: State<'_, AppState>,
) -> Result<SearchUsersResponse, String> {
    log::info!("Tauri command: search_users called with query: {}", query);
    
    let service_state = state.grids_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.search_users(query, limit).await.map_err(|e| {
            log::error!("Failed to search users: {}", e);
            e.to_string()
        })
    } else {
        Err("Grids service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_grids_state(
    state: State<'_, AppState>,
) -> Result<GridsState, String> {
    log::info!("Tauri command: get_grids_state called");
    
    let service_state = state.grids_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        Ok(service.get_grids_state().await)
    } else {
        Err("Grids service not initialized".to_string())
    }
}

// Get grid permissions for current user
#[tauri::command]
pub async fn get_grid_permissions(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<GridPermissions, String> {
    log::info!("Tauri command: get_grid_permissions called for: {}", grid_id);
    
    let service_state = state.grids_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.get_grid_permissions(grid_id).await.map_err(|e| {
            log::error!("Failed to get grid permissions: {}", e);
            e.to_string()
        })
    } else {
        Err("Grids service not initialized".to_string())
    }
}

// Update grid settings (admin/owner only)
#[tauri::command]
pub async fn update_grid_settings(
    grid_id: String,
    settings: UpdateGridSettingsRequest,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: update_grid_settings called for: {}", grid_id);
    
    let service_state = state.grids_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.update_grid_settings(grid_id, settings).await.map_err(|e| {
            log::error!("Failed to update grid settings: {}", e);
            e.to_string()
        })
    } else {
        Err("Grids service not initialized".to_string())
    }
}

// Update member permissions (admin/owner only)
#[tauri::command]
pub async fn update_member_permissions(
    grid_id: String,
    member_id: String,
    permissions: UpdateMemberPermissionsRequest,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: update_member_permissions called for grid {} member {}", grid_id, member_id);
    
    let service_state = state.grids_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.update_member_permissions(grid_id, member_id, permissions).await.map_err(|e| {
            log::error!("Failed to update member permissions: {}", e);
            e.to_string()
        })
    } else {
        Err("Grids service not initialized".to_string())
    }
}

// Get process permissions
#[tauri::command]
pub async fn get_process_permissions(
    process_id: String,
    state: State<'_, AppState>,
) -> Result<ProcessPermissions, String> {
    log::info!("Tauri command: get_process_permissions called for: {}", process_id);
    
    let service_state = state.grids_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.get_process_permissions(process_id).await.map_err(|e| {
            log::error!("Failed to get process permissions: {}", e);
            e.to_string()
        })
    } else {
        Err("Grids service not initialized".to_string())
    }
}

// Get grid audit log (admin/owner only)
#[tauri::command]
pub async fn get_grid_audit_log(
    grid_id: String,
    request: GetAuditLogRequest,
    state: State<'_, AppState>,
) -> Result<GetAuditLogResponse, String> {
    log::info!("Tauri command: get_grid_audit_log called for: {}", grid_id);
    
    let service_state = state.grids_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.get_grid_audit_log(grid_id, request).await.map_err(|e| {
            log::error!("Failed to get audit log: {}", e);
            e.to_string()
        })
    } else {
        Err("Grids service not initialized".to_string())
    }
}

// Check if user can perform a specific action (helper function)
#[tauri::command]
pub async fn check_grid_permission(
    grid_id: String,
    permission: String, // "invite", "kick", "create_process", etc.
    state: State<'_, AppState>,
) -> Result<bool, String> {
    log::info!("Tauri command: check_grid_permission called for: {} permission: {}", grid_id, permission);
    
    let service_state = state.grids_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        match service.get_grid_permissions(grid_id).await {
            Ok(permissions) => {
                let allowed = match permission.as_str() {
                    "invite" => permissions.can_invite,
                    "kick" => permissions.can_kick,
                    "create_process" => permissions.can_create_process,
                    "view_all_processes" => permissions.can_view_all_processes,
                    "connect_to_processes" => permissions.can_connect_to_processes,
                    "manage_settings" => permissions.can_modify_settings,
                    "view_audit_log" => permissions.can_view_audit_log,
                    "manage_roles" => permissions.can_manage_roles,
                    _ => false,
                };
                Ok(allowed)
            }
            Err(e) => {
                log::error!("Failed to check permission: {}", e);
                Err(e.to_string())
            }
        }
    } else {
        Err("Grids service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn delete_grid_process(
    grid_id: String,
    process_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: delete_grid_process called for: {}", process_id);
    
    // First try to delete from server
    let service_state = state.grids_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        if let Err(e) = service.delete_grid_process(grid_id.clone(), process_id.clone()).await {
            log::warn!("Failed to delete process from server (may not exist there): {}", e);
            // Continue to local cleanup even if server deletion fails
        }
    }
    
    // Also remove from local process manager
    let manager_state = state.process_manager.lock().await;
    if let Some(manager) = manager_state.as_ref() {
        // Stop the process locally
        let processes = manager.get_all_processes_including_terminals().await;
        for process in processes {
            if process.process_id == process_id {
                // Use the regular stop process method
                if let Err(e) = manager.stop_process(process.grid_id.clone()).await {
                    log::warn!("Failed to stop process locally: {}", e);
                }
                break;
            }
        }
    }
    
    Ok(())
}

#[tauri::command]
pub async fn delete_grid_channel(
    grid_id: String,
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: delete_grid_channel called for: {}", channel_id);
    
    let service_state = state.grids_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.delete_grid_channel(grid_id, channel_id).await.map_err(|e| {
            log::error!("Failed to delete channel: {}", e);
            e.to_string()
        })
    } else {
        Err("Grids service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn update_member_role(
    grid_id: String,
    user_id: String,
    new_role: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: update_member_role called for: {} to {}", user_id, new_role);
    
    let service_state = state.grids_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.update_member_role(grid_id, user_id, new_role).await.map_err(|e| {
            log::error!("Failed to update member role: {}", e);
            e.to_string()
        })
    } else {
        Err("Grids service not initialized".to_string())
    }
}