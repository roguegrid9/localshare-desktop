// src/commands/messaging.rs - Clean messaging commands with separated channel types

use crate::api::types::*;
use crate::state::app::AppState;
use anyhow::Result;
use tauri::State;

// ===== TEXT CHANNEL COMMANDS =====

#[tauri::command]
pub async fn create_text_channel(
    grid_id: String,
    name: String,
    description: Option<String>,
    is_private: Option<bool>,
    max_members: Option<i32>,
    state: State<'_, AppState>,
) -> Result<ChannelInfo, String> {
    log::info!("Creating text channel: {} in grid: {}", name, grid_id);
    
    let messaging_service = {
        let service_guard = state.messaging_service.lock().await;
        service_guard
            .clone()
            .ok_or("Messaging service not initialized")?
    };

    let request = CreateTextChannelRequest {
        name,
        description,
        is_private,
        max_members,
        channel_type: "text".to_string(),
        metadata: None,
    };

    messaging_service
        .create_text_channel(&grid_id, request)
        .await
        .map_err(|e| format!("Failed to create text channel: {}", e))
}

// ===== VOICE CHANNEL COMMANDS =====

#[tauri::command]
pub async fn create_voice_channel(
    grid_id: String,
    name: String,
    description: Option<String>,
    is_private: Option<bool>,
    max_members: Option<i32>,
    // Voice-specific settings
    auto_routing_threshold: Option<i32>,
    default_quality: Option<String>,
    push_to_talk_default: Option<bool>,
    noise_suppression: Option<bool>,
    echo_cancellation: Option<bool>,
    auto_gain_control: Option<bool>,
    voice_activation_threshold: Option<f64>,
    allow_guest_participants: Option<bool>,
    max_session_duration_minutes: Option<i32>,
    recording_enabled: Option<bool>,
    state: State<'_, AppState>,
) -> Result<ChannelInfo, String> {
    log::info!("Creating voice channel: {} in grid: {}", name, grid_id);
    log::info!("Voice settings - quality: {:?}, noise_suppression: {:?}", default_quality, noise_suppression);
    
    let messaging_service = {
        let service_guard = state.messaging_service.lock().await;
        let service = service_guard
            .clone()
            .ok_or("Messaging service not initialized")?;
        log::info!("Got messaging service from state");
        service
    };

    let request = CreateVoiceChannelRequest {
        name: name.clone(),
        description,
        is_private,
        max_members,
        // Voice-specific settings
        auto_routing_threshold,
        default_quality: default_quality.clone(),
        push_to_talk_default,
        noise_suppression,
        echo_cancellation,
        auto_gain_control,
        voice_activation_threshold,
        allow_guest_participants,
        max_session_duration_minutes,
        recording_enabled,
    };

    log::info!("Built voice channel request: {:?}", request);
    log::info!("About to call messaging_service.create_voice_channel()");

    let result = messaging_service
        .create_voice_channel(&grid_id, request)
        .await;
        
    match &result {
        Ok(channel) => log::info!("Voice channel created successfully: {:?}", channel),
        Err(e) => log::error!("Voice channel creation failed: {}", e),
    }
    
    result.map_err(|e| format!("Failed to create voice channel: {}", e))
}

#[tauri::command]
pub async fn start_voice_session(
    channel_id: String,
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let session_id = format!("voice_{}", channel_id);
    
    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    media_manager
        .initialize_media_session(session_id)
        .await
        .map_err(|e| format!("Failed to start voice session: {}", e))
}

#[tauri::command]
pub async fn join_voice_channel(
    channel_id: String,
    grid_id: String,
    audio_quality: Option<String>,
    start_muted: Option<bool>,
    start_deafened: Option<bool>,
    state: State<'_, AppState>,
) -> Result<VoiceJoinResponse, String> {
    log::info!("Joining voice channel: {} in grid: {}", channel_id, grid_id);

    let session_id = channel_id.clone(); // Use channel ID as session ID

    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    // Initialize media session if it doesn't exist
    if let Err(_) = media_manager.initialize_media_session(session_id.clone()).await {
        log::debug!("Media session already exists for {}", session_id);
    }

    // Get user session for API call
    let user_session = crate::auth::get_user_session().await
        .map_err(|e| format!("Failed to get user session: {}", e))?
        .ok_or("No active user session")?;

    // Call backend API to join voice channel
    let coordinator = crate::api::CoordinatorClient::new();
    let response = coordinator.join_voice_channel(&user_session.token, &grid_id, &channel_id).await
        .map_err(|e| format!("Failed to join voice channel: {}", e))?;

    log::info!("Successfully joined voice channel: {:?}", response);

    // Parse the response to extract participants and routing info
    let other_participants: Vec<crate::api::types::VoiceParticipant> = response
        .get("other_participants")
        .and_then(|p| serde_json::from_value(p.clone()).ok())
        .unwrap_or_else(Vec::new);

    let routing_info = response
        .get("routing_info")
        .and_then(|r| serde_json::from_value(r.clone()).ok())
        .unwrap_or_else(|| VoiceRoutingInfo {
            session_type: "mesh".to_string(),
            required_connections: Some(vec![]),
            max_participants: 8,
        });

    log::info!("Found {} other participants in voice channel", other_participants.len());

    Ok(VoiceJoinResponse {
        session_id: session_id.clone(),
        participants: other_participants,
        routing_info,
    })
}

#[tauri::command]
pub async fn leave_voice_channel(
    channel_id: String,
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Leaving voice channel: {} in grid: {}", channel_id, grid_id);

    // Get user session for API call
    let user_session = crate::auth::get_user_session().await
        .map_err(|e| format!("Failed to get user session: {}", e))?
        .ok_or("No active user session")?;

    // Call backend API to leave voice channel
    let coordinator = crate::api::CoordinatorClient::new();
    coordinator.leave_voice_channel(&user_session.token, &grid_id, &channel_id).await
        .map_err(|e| format!("Failed to leave voice channel: {}", e))?;

    // Close media session
    let session_id = channel_id.clone();
    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    media_manager
        .close_media_session(session_id)
        .await
        .map_err(|e| format!("Failed to close media session: {}", e))?;

    log::info!("Successfully left voice channel");
    Ok(())
}

#[tauri::command]
pub async fn get_voice_channel_status(
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<VoiceChannelStatus, String> {
    let session_id = format!("voice_{}", channel_id);
    
    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    let active_sessions = media_manager.get_media_sessions().await;
    let is_connected = active_sessions.contains(&session_id);

    Ok(VoiceChannelStatus {
        channel_id: channel_id.clone(),
        is_connected,
        participant_count: if is_connected { 1 } else { 0 },
        participants: vec![],
        session_id: if is_connected { Some(session_id) } else { None },
    })
}

#[tauri::command]
pub async fn open_voice_channel(
    channel_id: String,
    grid_id: String,
    channel_name: String,
    window_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<crate::windows::Tab, String> {
    let window_manager = {
        let wm_guard = state.window_manager.lock().await;
        wm_guard
            .clone()
            .ok_or("Window manager not initialized")?
    };

    let tab_content = crate::windows::TabContentType::VoiceChannel { 
        data: crate::windows::VoiceChannelData {
            channel_id: channel_id.clone(),
            grid_id: grid_id.clone(),
            channel_name: channel_name.clone(),
        }
    };

    let tab_title = format!("{}", channel_name);

    window_manager
        .create_tab(tab_content, Some(tab_title), window_id)
        .await
        .map_err(|e| format!("Failed to open voice channel: {}", e))
}

// ===== GENERIC CHANNEL COMMANDS =====

#[tauri::command]
pub async fn get_channel_details(
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<ChannelDetailsResponse, String> {
    let messaging_service = {
        let service_guard = state.messaging_service.lock().await;
        service_guard
            .clone()
            .ok_or("Messaging service not initialized")?
    };

    messaging_service
        .get_channel_details(&channel_id)
        .await
        .map_err(|e| format!("Failed to get channel details: {}", e))
}

#[tauri::command]
pub async fn join_channel(
    grid_id: String,
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let messaging_service = {
        let service_guard = state.messaging_service.lock().await;
        service_guard
            .clone()
            .ok_or("Messaging service not initialized")?
    };

    messaging_service
        .join_channel(&grid_id, &channel_id)
        .await
        .map_err(|e| format!("Failed to join channel: {}", e))
}

#[tauri::command]
pub async fn leave_channel(
    grid_id: String,
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let messaging_service = {
        let service_guard = state.messaging_service.lock().await;
        service_guard
            .clone()
            .ok_or("Messaging service not initialized")?
    };

    messaging_service
        .leave_channel(&grid_id, &channel_id)
        .await
        .map_err(|e| format!("Failed to leave channel: {}", e))
}

// ===== MESSAGE OPERATIONS COMMANDS =====

#[tauri::command]
pub async fn send_message(
    channel_id: String,
    content: String,
    message_type: Option<String>,
    reply_to_id: Option<String>,
    metadata: Option<String>,
    state: State<'_, AppState>,
) -> Result<TextMessage, String> {
    let messaging_service = {
        let service_guard = state.messaging_service.lock().await;
        service_guard
            .clone()
            .ok_or("Messaging service not initialized")?
    };

    let request = SendMessageRequest {
        content,
        message_type,
        reply_to_id,
        metadata,
    };

    messaging_service
        .send_message(&channel_id, request)
        .await
        .map_err(|e| format!("Failed to send message: {}", e))
}

#[tauri::command]
pub async fn get_channel_messages(
    channel_id: String,
    limit: Option<i32>,
    before: Option<String>,
    after: Option<String>,
    message_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<GetMessagesResponse, String> {
    let messaging_service = {
        let service_guard = state.messaging_service.lock().await;
        service_guard
            .clone()
            .ok_or("Messaging service not initialized")?
    };

    let request = GetMessagesRequest {
        limit,
        before,
        after,
        message_id,
    };

    messaging_service
        .get_channel_messages(&channel_id, request)
        .await
        .map_err(|e| format!("Failed to get channel messages: {}", e))
}

#[tauri::command]
pub async fn edit_message(
    message_id: String,
    content: String,
    metadata: Option<String>,
    state: State<'_, AppState>,
) -> Result<TextMessage, String> {
    let messaging_service = {
        let service_guard = state.messaging_service.lock().await;
        service_guard
            .clone()
            .ok_or("Messaging service not initialized")?
    };

    let request = EditMessageRequest {
        content,
        metadata,
    };

    messaging_service
        .edit_message(&message_id, request)
        .await
        .map_err(|e| format!("Failed to edit message: {}", e))
}

#[tauri::command]
pub async fn delete_message(
    message_id: String,
    reason: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let messaging_service = {
        let service_guard = state.messaging_service.lock().await;
        service_guard
            .clone()
            .ok_or("Messaging service not initialized")?
    };

    let request = reason.map(|r| DeleteMessageRequest { reason: Some(r) });

    messaging_service
        .delete_message(&message_id, request)
        .await
        .map_err(|e| format!("Failed to delete message: {}", e))
}

// ===== REACTION COMMANDS =====

#[tauri::command]
pub async fn add_message_reaction(
    message_id: String,
    emoji: String,
    state: State<'_, AppState>,
) -> Result<MessageReaction, String> {
    let messaging_service = {
        let service_guard = state.messaging_service.lock().await;
        service_guard
            .clone()
            .ok_or("Messaging service not initialized")?
    };

    let request = AddReactionRequest { emoji };

    messaging_service
        .add_reaction(&message_id, request)
        .await
        .map_err(|e| format!("Failed to add reaction: {}", e))
}

#[tauri::command]
pub async fn remove_message_reaction(
    message_id: String,
    emoji: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let messaging_service = {
        let service_guard = state.messaging_service.lock().await;
        service_guard
            .clone()
            .ok_or("Messaging service not initialized")?
    };

    let request = RemoveReactionRequest { emoji };

    messaging_service
        .remove_reaction(&message_id, request)
        .await
        .map_err(|e| format!("Failed to remove reaction: {}", e))
}

// ===== TYPING INDICATOR COMMANDS =====

#[tauri::command]
pub async fn set_typing_indicator(
    channel_id: String,
    is_typing: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let messaging_service = {
        let service_guard = state.messaging_service.lock().await;
        service_guard
            .clone()
            .ok_or("Messaging service not initialized")?
    };

    messaging_service
        .set_typing_indicator(&channel_id, is_typing)
        .await
        .map_err(|e| format!("Failed to set typing indicator: {}", e))
}

// ===== WEBSOCKET MESSAGE SENDING COMMANDS =====

#[tauri::command]
pub async fn send_websocket_text_message(
    channel_id: String,
    content: String,
    message_type: Option<String>,
    reply_to_id: Option<String>,
    metadata: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let websocket_manager = {
        let ws_guard = state.websocket_manager.lock().await;
        ws_guard
            .clone()
            .ok_or("WebSocket manager not initialized")?
    };

    let payload = serde_json::json!({
        "channel_id": channel_id,
        "content": content,
        "message_type": message_type,
        "reply_to_id": reply_to_id,
        "metadata": metadata
    });

    websocket_manager
        .send_json_message("send_text_message", payload)
        .await
        .map_err(|e| format!("Failed to send WebSocket message: {}", e))
}

#[tauri::command]
pub async fn send_websocket_edit_message(
    message_id: String,
    content: String,
    metadata: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let websocket_manager = {
        let ws_guard = state.websocket_manager.lock().await;
        ws_guard
            .clone()
            .ok_or("WebSocket manager not initialized")?
    };

    let payload = serde_json::json!({
        "message_id": message_id,
        "content": content,
        "metadata": metadata
    });

    websocket_manager
        .send_json_message("edit_text_message", payload)
        .await
        .map_err(|e| format!("Failed to send WebSocket edit message: {}", e))
}

#[tauri::command]
pub async fn send_websocket_delete_message(
    message_id: String,
    reason: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let websocket_manager = {
        let ws_guard = state.websocket_manager.lock().await;
        ws_guard
            .clone()
            .ok_or("WebSocket manager not initialized")?
    };

    let payload = serde_json::json!({
        "message_id": message_id,
        "reason": reason
    });

    websocket_manager
        .send_json_message("delete_text_message", payload)
        .await
        .map_err(|e| format!("Failed to send WebSocket delete message: {}", e))
}

#[tauri::command]
pub async fn send_websocket_typing_indicator(
    channel_id: String,
    is_typing: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let websocket_manager = {
        let ws_guard = state.websocket_manager.lock().await;
        ws_guard
            .clone()
            .ok_or("WebSocket manager not initialized")?
    };

    let payload = serde_json::json!({
        "channel_id": channel_id,
        "is_typing": is_typing
    });

    websocket_manager
        .send_json_message("typing_indicator", payload)
        .await
        .map_err(|e| format!("Failed to send WebSocket typing indicator: {}", e))
}

// ===== STATE ACCESS COMMANDS =====

#[tauri::command]
pub async fn get_messaging_state(
    state: State<'_, AppState>,
) -> Result<MessagingState, String> {
    let messaging_service = {
        let service_guard = state.messaging_service.lock().await;
        service_guard
            .clone()
            .ok_or("Messaging service not initialized")?
    };

    Ok(messaging_service.get_state().await)
}

#[tauri::command]
pub async fn get_cached_messages(
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<TextMessage>, String> {
    let messaging_service = {
        let service_guard = state.messaging_service.lock().await;
        service_guard
            .clone()
            .ok_or("Messaging service not initialized")?
    };

    Ok(messaging_service.get_cached_messages(&channel_id).await)
}

#[tauri::command]
pub async fn get_cached_channels(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<ChannelInfo>, String> {
    let messaging_service = {
        let service_guard = state.messaging_service.lock().await;
        service_guard
            .clone()
            .ok_or("Messaging service not initialized")?
    };

    Ok(messaging_service.get_cached_channels(&grid_id).await)
}

#[tauri::command]
pub async fn clear_grid_messaging_state(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let messaging_service = {
        let service_guard = state.messaging_service.lock().await;
        service_guard
            .clone()
            .ok_or("Messaging service not initialized")?
    };

    messaging_service.clear_grid_state(&grid_id).await;
    Ok(())
}

#[tauri::command]
pub async fn search_grid_members(
    grid_id: String,
    query: String,
    limit: Option<u32>,
    state: State<'_, AppState>,
) -> Result<Vec<UserSearchResult>, String> {
    let api_client = match crate::auth::get_authenticated_client().await {
        Ok(client) => client,
        Err(e) => return Err(format!("No authenticated API client available: {}", e)),
    };

    let token = match crate::auth::get_stored_token().await {
        Ok(token) => token,
        Err(_) => return Err("No authentication token available".to_string()),
    };

    let search_limit = Some(limit.unwrap_or(20).min(50));

    let results = api_client
        .search_users(&token, query.trim().to_string(), search_limit)
        .await
        .map(|response| response.users)
        .map_err(|e| format!("Failed to search users: {}", e))?;

    Ok(results)
}

#[tauri::command]
pub async fn reinitialize_messaging_service(
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Re-initializing messaging service after authentication...");
    
    let api_client = match crate::auth::get_authenticated_client().await {
        Ok(client) => std::sync::Arc::new(client),
        Err(e) => return Err(format!("No authenticated client available: {}", e)),
    };
    
    let messaging_service = crate::messaging::MessagingService::new(api_client);
    
    let mut messaging_guard = state.messaging_service.lock().await;
    *messaging_guard = Some(messaging_service);
    
    log::info!("Messaging service re-initialized successfully");
    Ok(())
}

// ===== HELPER FUNCTIONS =====

async fn initialize_voice_channel_media(
    channel_id: &str, 
    grid_id: &str, 
    state: &State<'_, AppState>
) -> Result<(), String> {
    let media_manager = {
        let media_guard = state.media_manager.lock().await;
        media_guard
            .clone()
            .ok_or("Media manager not initialized")?
    };

    log::info!("Initializing voice capabilities for channel {} in grid {}", channel_id, grid_id);
    
    // Pre-initialize voice channel capabilities
    // This could set up routing, participant limits, etc.
    Ok(())
}

#[tauri::command]
pub async fn create_channel(
    grid_id: String,
    name: String,
    channel_type: String,
    description: Option<String>,
    is_private: Option<bool>,
    max_members: Option<i32>,
    state: State<'_, AppState>,
) -> Result<ChannelInfo, String> {
    // Delegate to specific channel creation functions
    match channel_type.as_str() {
        "text" => create_text_channel(grid_id, name, description, is_private, max_members, state).await,
        "voice" => create_voice_channel(grid_id, name, description, is_private, max_members, None, None, None, None, None, None, None, None, None, None, state).await,
        _ => Err(format!("Unsupported channel type: {}", channel_type))
    }
}

#[tauri::command]
pub async fn create_voice_channel_tab(
    channel_id: String,
    grid_id: String,
    channel_name: String,
    window_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<crate::windows::Tab, String> {
    // This is the same as open_voice_channel, just with a different name
    open_voice_channel(channel_id, grid_id, channel_name, window_id, state).await
}

#[tauri::command]
pub async fn initialize_voice_session(
    channel_id: String,
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // This is the same as start_voice_session
    start_voice_session(channel_id, grid_id, state).await
}