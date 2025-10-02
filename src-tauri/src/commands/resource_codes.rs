use crate::api::types::{
    ResourceAccessCode, GenerateCodeRequest, GenerateCodeResponse,
    UseCodeRequest, UseCodeResponse, ListCodesRequest, ListCodesResponse,
    CodeUsageHistoryRequest, CodeUsageHistoryResponse, ProcessCodeOptions,
    GridInviteCodeOptions, ChannelCodeOptions, ResourceType
};
use crate::codes::ResourceCodesService;
use crate::AppState;
use crate::state::codes::CodeStats;
use tauri::State;

// ===== SERVICE INITIALIZATION =====

#[tauri::command]
pub async fn initialize_codes_service(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: initialize_codes_service called");
    
    let code_state = state.code_state.clone();
    let codes_service = ResourceCodesService::new(app_handle, code_state);
    let mut service_state = state.codes_service.lock().await;
    *service_state = Some(codes_service);
    
    log::info!("Resource codes service initialized successfully");
    Ok(())
}

// ===== CORE RESOURCE CODE COMMANDS =====

#[tauri::command]
pub async fn generate_resource_code(
    grid_id: String,
    request: GenerateCodeRequest,
    state: State<'_, AppState>,
) -> Result<GenerateCodeResponse, String> {
    log::info!("Tauri command: generate_resource_code called for grid: {}, resource_type: {:?}", 
               grid_id, request.resource_type);
    
    // Remove the app_handle.state line and use the state parameter directly
    let service_state = state.codes_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.generate_code(&grid_id, request).await.map_err(|e| {
            log::error!("Failed to generate resource code: {}", e);
            e.to_string()
        })
    } else {
        Err("Resource codes service not initialized".to_string())
    }
}
#[tauri::command]
pub async fn use_access_code(
    grid_id: String,
    request: UseCodeRequest,
    state: State<'_, AppState>,
) -> Result<UseCodeResponse, String> {
    log::info!("Tauri command: use_access_code called for grid: {}, code: {}", 
               grid_id, request.access_code);
    
    let service_state = state.codes_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.use_code(&grid_id, request).await.map_err(|e| {
            log::error!("Failed to use access code: {}", e);
            e.to_string()
        })
    } else {
        Err("Resource codes service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn list_grid_codes(
    grid_id: String,
    resource_type: Option<ResourceType>,
    resource_id: Option<String>,
    active_only: Option<bool>,
    state: State<'_, AppState>,
) -> Result<ListCodesResponse, String> {
    log::info!("Tauri command: list_grid_codes called for grid: {}", grid_id);
    
    let service_state = state.codes_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        let request = ListCodesRequest {
            resource_type,
            resource_id,
            active_only,
            limit: None,
            offset: None,
        };
        
        service.list_codes(&grid_id, request).await.map_err(|e| {
            log::error!("Failed to list grid codes: {}", e);
            e.to_string()
        })
    } else {
        Err("Resource codes service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_code_details(
    grid_id: String,
    code_id: String,
    state: State<'_, AppState>,
) -> Result<ResourceAccessCode, String> {
    log::info!("Tauri command: get_code_details called for code: {}", code_id);
    
    let service_state = state.codes_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.get_code_details(&grid_id, &code_id).await.map_err(|e| {
            log::error!("Failed to get code details: {}", e);
            e.to_string()
        })
    } else {
        Err("Resource codes service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn revoke_code(
    grid_id: String,
    code_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: revoke_code called for code: {}", code_id);
    
    let service_state = state.codes_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.revoke_code(&grid_id, &code_id).await.map_err(|e| {
            log::error!("Failed to revoke code: {}", e);
            e.to_string()
        })
    } else {
        Err("Resource codes service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_code_usage_history(
    grid_id: String,
    code_id: String,
    state: State<'_, AppState>,
) -> Result<CodeUsageHistoryResponse, String> {
    log::info!("Tauri command: get_code_usage_history called for code: {}", code_id);
    
    let service_state = state.codes_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        let request = CodeUsageHistoryRequest {
            limit: None,
            offset: None,
        };
        
        service.get_usage_history(&grid_id, &code_id, request).await.map_err(|e| {
            log::error!("Failed to get code usage history: {}", e);
            e.to_string()
        })
    } else {
        Err("Resource codes service not initialized".to_string())
    }
}

// ===== CONVENIENCE COMMANDS FOR SPECIFIC RESOURCE TYPES =====

#[tauri::command]
pub async fn share_process(
    grid_id: String,
    process_id: String,
    options: ProcessCodeOptions,
    state: State<'_, AppState>,
) -> Result<GenerateCodeResponse, String> {
    log::info!("Tauri command: share_process called for process: {}", process_id);
    
    let service_state = state.codes_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.share_process(&grid_id, &process_id, options).await.map_err(|e| {
            log::error!("Failed to share process: {}", e);
            e.to_string()
        })
    } else {
        Err("Resource codes service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn create_grid_invite_code(
    grid_id: String,
    options: GridInviteCodeOptions,
    state: State<'_, AppState>,
) -> Result<GenerateCodeResponse, String> {
    log::info!("Tauri command: create_grid_invite_code called for grid: {}", grid_id);
    
    let service_state = state.codes_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.create_invite_code(&grid_id, options).await.map_err(|e| {
            log::error!("Failed to create grid invite code: {}", e);
            e.to_string()
        })
    } else {
        Err("Resource codes service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn share_channel(
    grid_id: String,
    channel_id: String,
    channel_type: String,
    options: ChannelCodeOptions,
    state: State<'_, AppState>,
) -> Result<GenerateCodeResponse, String> {
    log::info!("Tauri command: share_channel called for channel: {} type: {}", channel_id, channel_type);
    
    let service_state = state.codes_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.share_channel(&grid_id, &channel_id, &channel_type, options).await.map_err(|e| {
            log::error!("Failed to share channel: {}", e);
            e.to_string()
        })
    } else {
        Err("Resource codes service not initialized".to_string())
    }
}

// ===== UTILITY COMMANDS =====

#[tauri::command]
pub async fn copy_code_to_clipboard(
    code: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: copy_code_to_clipboard called");
    
    let service_state = state.codes_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.copy_to_clipboard(&code).await.map_err(|e| {
            log::error!("Failed to copy to clipboard: {}", e);
            e.to_string()
        })
    } else {
        Err("Resource codes service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn create_shareable_link(
    grid_id: String,
    access_code: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    log::info!("Tauri command: create_shareable_link called for code: {}", access_code);
    
    let service_state = state.codes_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        let link = service.create_shareable_link(&grid_id, &access_code);
        Ok(link)
    } else {
        Err("Resource codes service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn validate_access_code_format(
    code: String,
) -> Result<bool, String> {
    log::info!("Tauri command: validate_access_code_format called");
    
    let is_valid = ResourceCodesService::validate_access_code(&code);
    Ok(is_valid)
}

#[tauri::command]
pub async fn format_access_code_input(
    code: String,
) -> Result<String, String> {
    log::info!("Tauri command: format_access_code_input called");
    
    let formatted = ResourceCodesService::format_access_code(&code);
    Ok(formatted)
}

// ===== STATE MANAGEMENT COMMANDS =====

#[tauri::command]
pub async fn get_grid_codes_from_cache(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<ResourceAccessCode>, String> {
    log::info!("Tauri command: get_grid_codes_from_cache called for grid: {}", grid_id);
    
    let service_state = state.codes_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        let codes = service.get_grid_codes_from_cache(&grid_id).await;
        Ok(codes)
    } else {
        Err("Resource codes service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_active_codes_from_cache(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<ResourceAccessCode>, String> {
    log::info!("Tauri command: get_active_codes_from_cache called for grid: {}", grid_id);
    
    let service_state = state.codes_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        let codes = service.get_active_codes_from_cache(&grid_id).await;
        Ok(codes)
    } else {
        Err("Resource codes service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_my_codes_from_cache(
    state: State<'_, AppState>,
) -> Result<Vec<ResourceAccessCode>, String> {
    log::info!("Tauri command: get_my_codes_from_cache called");
    
    let service_state = state.codes_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        let codes = service.get_my_codes_from_cache().await;
        Ok(codes)
    } else {
        Err("Resource codes service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_codes_by_resource(
    grid_id: String,
    resource_type: ResourceType,
    resource_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<ResourceAccessCode>, String> {
    log::info!("Tauri command: get_codes_by_resource called for resource: {} in grid: {}", resource_id, grid_id);
    
    let service_state = state.codes_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        let codes = service.get_codes_by_resource(&grid_id, resource_type, &resource_id).await;
        Ok(codes)
    } else {
        Err("Resource codes service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_code_stats(
    grid_id: String,
    state: State<'_, AppState>,  // Use State parameter instead of app_handle
) -> Result<CodeStats, String> {
    let service_state = state.codes_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        let stats = service.get_code_stats(&grid_id).await;
        Ok(stats)
    } else {
        Err("Resource codes service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn clear_grid_codes_cache(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: clear_grid_codes_cache called for grid: {}", grid_id);
    
    let service_state = state.codes_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        service.clear_grid_cache(&grid_id).await;
        Ok(())
    } else {
        Err("Resource codes service not initialized".to_string())
    }
}

// ===== BATCH OPERATIONS =====

#[tauri::command]
pub async fn revoke_multiple_codes(
    grid_id: String,
    code_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    log::info!("Tauri command: revoke_multiple_codes called for {} codes in grid: {}", code_ids.len(), grid_id);
    
    let service_state = state.codes_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        let mut failed_codes = Vec::new();
        
        for code_id in code_ids {
            if let Err(e) = service.revoke_code(&grid_id, &code_id).await {
                log::error!("Failed to revoke code {}: {}", code_id, e);
                failed_codes.push(code_id);
            }
        }
        
        Ok(failed_codes)
    } else {
        Err("Resource codes service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn refresh_grid_codes(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<ListCodesResponse, String> {
    log::info!("Tauri command: refresh_grid_codes called for grid: {}", grid_id);
    
    let service_state = state.codes_service.lock().await;
    if let Some(service) = service_state.as_ref() {
        let request = ListCodesRequest {
            resource_type: None,
            resource_id: None,
            active_only: None,
            limit: None,
            offset: None,
        };
        
        service.list_codes(&grid_id, request).await.map_err(|e| {
            log::error!("Failed to refresh grid codes: {}", e);
            e.to_string()
        })
    } else {
        Err("Resource codes service not initialized".to_string())
    }
}