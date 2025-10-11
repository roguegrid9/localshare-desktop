// Updated src/websocket/mod.rs for grid-based architecture

use crate::api::types::{
    WebSocketMessage, WebRTCSignalPayload
};
use crate::api::types::{CodeGeneratedEvent, CodeUsedEvent, CodeRevokedEvent};
use anyhow::{Result, Context};
use serde_json;
use std::sync::Arc;
use tauri::AppHandle;
use tauri::Emitter;
use tokio::sync::{mpsc, Mutex, RwLock};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use futures_util::{SinkExt, StreamExt};
use tokio::time::{interval, Duration};
use serde_json::json;
use tokio_tungstenite::{WebSocketStream, MaybeTlsStream};
use tokio::net::TcpStream;


// Grid-related message payloads (updated field names to match server)
#[derive(Debug, serde::Deserialize, serde::Serialize)]
pub struct SessionInvitePayload {
    pub to_user_id: String,   // This is actually FROM_user_id when we receive it
    pub grid_id: String,
}

#[derive(Debug, serde::Deserialize, serde::Serialize)]
pub struct SessionAcceptPayload {
    pub to_user_id: String,   // This is actually FROM_user_id when we receive it
    pub grid_id: String,
}

#[derive(Debug, serde::Deserialize, serde::Serialize)]
pub struct GridHostChangedPayload {
    pub grid_id: String,
    pub new_host_id: Option<String>,
    pub session_state: String,
}

#[derive(Debug, serde::Deserialize, serde::Serialize)]
pub struct GridInvitePayload {
    pub grid_id: String,
    pub to_user_id: String,   // This is actually FROM_user_id when we receive it
}

#[derive(Debug, serde::Deserialize, serde::Serialize)]
pub struct PresenceEventPayload {
    pub user_id: String,
    pub grid_id: String,
}

#[derive(Debug, serde::Deserialize, serde::Serialize)]
pub struct CodeGeneratedPayload {
    pub grid_id: String,
    pub code: crate::api::types::ResourceAccessCode,
    pub generated_by: String,
}

#[derive(Debug, serde::Deserialize, serde::Serialize)]
pub struct CodeUsedPayload {
    pub grid_id: String,
    pub code_id: String,
    pub used_by: String,
    pub resource_type: crate::api::types::ResourceType,
    pub resource_id: String,
    pub success: bool,
}

#[derive(Debug, serde::Deserialize, serde::Serialize)]
pub struct CodeRevokedPayload {
    pub grid_id: String,
    pub code_id: String,
    pub revoked_by: String,
}

// Share notification payloads
#[derive(Debug, serde::Deserialize, serde::Serialize)]
pub struct ShareHostNotification {
    pub share_id: String,
    pub visitor_id: String,
    #[serde(rename = "type")]
    pub notification_type: String,
}

#[derive(Debug, serde::Deserialize, serde::Serialize)]
pub struct ShareSignalPayload {
    pub share_id: String,
    pub visitor_id: String,
    pub signal_type: String,
    pub signal_data: serde_json::Value,
}

#[derive(Clone)]
pub struct WebSocketManager {
    app_handle: AppHandle,
    sender: Arc<RwLock<Option<mpsc::UnboundedSender<serde_json::Value>>>>, // Changed to Arc<RwLock>
    is_connected: Arc<Mutex<bool>>,
    p2p_handler: Option<Arc<Mutex<Option<crate::p2p::P2PManager>>>>,
}

impl WebSocketManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            sender: Arc::new(RwLock::new(None)),
            is_connected: Arc::new(Mutex::new(false)),
            p2p_handler: None,
        }
    }

    pub async fn connect(&self, websocket_url: String) -> Result<()> {
        log::info!("Connecting to WebSocket: {}", websocket_url);
        
        // Create the connection here
        let (ws_stream, _) = connect_async(&websocket_url).await
            .context("Failed to connect to WebSocket")?;
            
        self.connect_with_stream(ws_stream).await
    }

    pub fn set_p2p_manager(&mut self, p2p_manager: Arc<Mutex<Option<crate::p2p::P2PManager>>>) {
        self.p2p_handler = Some(p2p_manager);
    }

    pub async fn connect_with_stream(&self, ws_stream: WebSocketStream<MaybeTlsStream<TcpStream>>) -> Result<()> {
        // Split the WebSocket stream into a sender and receiver
        let (mut ws_sender, mut ws_receiver) = ws_stream.split();

        // Create a channel for outgoing messages
        let (tx, mut rx) = mpsc::unbounded_channel::<serde_json::Value>();
        
        // CRITICAL: Store the sender for later use
        {
            let mut sender_guard = self.sender.write().await;
            *sender_guard = Some(tx.clone());
        }
        
        // CRITICAL: Update connection state
        {
            let mut connected = self.is_connected.lock().await;
            *connected = true;
        }

        log::info!("WebSocket connection established");

        // Clone references for the spawned tasks
        let app_handle = self.app_handle.clone();
        let p2p_handler = self.p2p_handler.clone();
        let is_connected = self.is_connected.clone();
        let sender_arc = self.sender.clone();

        // Task 1: Handle incoming WebSocket messages
        tokio::spawn(async move {
            while let Some(msg) = ws_receiver.next().await {
                match msg {
                    Ok(Message::Text(text)) => {
                        if let Ok(json_msg) = serde_json::from_str::<serde_json::Value>(&text) {
                            // Check if it's a pong response
                            if json_msg.get("type").and_then(|t| t.as_str()) == Some("pong") {
                                log::debug!("Received pong from server");
                                continue;
                            }
                            
                            // Parse as WebSocketMessage and handle
                            if let Ok(ws_msg) = serde_json::from_value::<WebSocketMessage>(json_msg.clone()) {
                                if let Err(e) = Self::handle_websocket_message(&app_handle, ws_msg, &p2p_handler).await {
                                    log::error!("Failed to handle WebSocket message: {}", e);
                                }
                            } else {
                                log::debug!("Received non-standard message: {:?}", json_msg);
                            }
                        }
                    }
                    Ok(Message::Close(_)) => {
                        log::info!("WebSocket closed by server");
                        break;
                    }
                    Err(e) => {
                        log::error!("WebSocket error: {}", e);
                        break;
                    }
                    _ => {}
                }
            }
            
            // Update connection state when loop exits
            let mut connected = is_connected.lock().await;
            *connected = false;
            
            // Clear the sender
            let mut sender_guard = sender_arc.write().await;
            *sender_guard = None;
        });

        // Task 2: Handle outgoing messages, including heartbeats
        tokio::spawn(async move {
            let mut heartbeat = interval(Duration::from_secs(15));
            heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

            loop {
                tokio::select! {
                    // Send outgoing messages from the channel
                    Some(msg) = rx.recv() => {
                        let msg_str = msg.to_string();
                        if let Err(e) = ws_sender.send(Message::Text(msg_str)).await {
                            log::error!("Failed to send message: {}", e);
                            break;
                        }
                        log::debug!("Sent WebSocket message");
                    }
                    // Send ping every 15 seconds
                    _ = heartbeat.tick() => {
                        let ping_msg = json!({
                            "type": "ping",
                            "timestamp": chrono::Utc::now().timestamp()
                        });
                        if let Err(e) = ws_sender.send(Message::Text(ping_msg.to_string())).await {
                            log::error!("Failed to send ping: {}", e);
                            break;
                        }
                        log::debug!("Sent WebSocket ping");
                    }
                }
            }
        });

        Ok(())
    }

    async fn handle_websocket_message(
        app_handle: &AppHandle, 
        message: WebSocketMessage,
        p2p_handler: &Option<Arc<Mutex<Option<crate::p2p::P2PManager>>>>
    ) -> Result<()> {
        match message.r#type.as_str() {
            // Grid host management events
            "grid_host_changed" => {
                if let Ok(payload) = serde_json::from_value::<GridHostChangedPayload>(message.payload.clone()) {
                    log::info!("Grid {} host changed. New host: {:?}, State: {}", 
                              payload.grid_id, payload.new_host_id, payload.session_state);
                    
                    // Emit to frontend
                    if let Err(e) = app_handle.emit("grid_host_changed", &message.payload) {
                        log::error!("Failed to emit grid host changed event: {}", e);
                    }
                }
            }
            
            // Member presence events  
            "member_online" | "member_offline" => {
                if let Ok(payload) = serde_json::from_value::<PresenceEventPayload>(message.payload.clone()) {
                    let is_online = message.r#type == "member_online";
                    log::info!("Member {} in grid {} is now {}", payload.user_id, payload.grid_id, 
                              if is_online { "online" } else { "offline" });
                    
                    // Emit to frontend
                    let event_name = if is_online { "grid_member_online" } else { "grid_member_offline" };
                    if let Err(e) = app_handle.emit(event_name, &message.payload) {
                        log::error!("Failed to emit grid member presence event: {}", e);
                    }
                }
            }
            
            // P2P session events (now with grid context)
            "session_invite" => {
                if let Ok(payload) = serde_json::from_value::<SessionInvitePayload>(message.payload) {
                    log::info!("Received session invite from {} for grid {}", payload.to_user_id, payload.grid_id);
                    
                    if let Some(p2p_handler) = p2p_handler {
                        let p2p_state = p2p_handler.lock().await;
                        if let Some(p2p_manager) = p2p_state.as_ref() {
                            // Updated method call - handle_session_invite now takes grid_id
                            if let Err(e) = p2p_manager.handle_session_invite(payload.to_user_id, payload.grid_id).await {
                                log::error!("Failed to handle session invite: {}", e);
                            }
                        }
                    }
                }
            }
            "session_accept" => {
                if let Ok(payload) = serde_json::from_value::<SessionAcceptPayload>(message.payload) {
                    log::info!("Received session accept from {} for grid {}", payload.to_user_id, payload.grid_id);
                    
                    if let Some(p2p_handler) = p2p_handler {
                        let p2p_state = p2p_handler.lock().await;
                        if let Some(_p2p_manager) = p2p_state.as_ref() { 
                            // For session accept, we need to handle starting the WebRTC connection
                            // This happens when we were the one who sent the invite (we're connecting as guest)
                            // The payload.to_user_id is actually the user who accepted (the host)
                            log::info!("Session accepted by host {}, initiating WebRTC connection", payload.to_user_id);
                            
                            // The WebRTC handshake will start automatically via the existing connection
                            // we created when we called connect_to_grid_host
                        }
                    }
                }
            }
            "webrtc_signal" => {
                if let Ok(payload) = serde_json::from_value::<WebRTCSignalPayload>(message.payload) {
                    log::info!("Received WebRTC signal from {} for grid {}", payload.to_user_id, payload.grid_id);
                    
                    if let Some(p2p_handler) = p2p_handler {
                        let p2p_state = p2p_handler.lock().await;
                        if let Some(p2p_manager) = p2p_state.as_ref() {
                            if let Err(e) = p2p_manager.handle_webrtc_signal(payload).await {
                                log::error!("Failed to handle WebRTC signal: {}", e);
                            }
                        }
                    }
                }
            }
            
            // Grid invitation events (if you implement grid invitations later)
            "grid_invite_received" => {
                if let Ok(payload) = serde_json::from_value::<GridInvitePayload>(message.payload.clone()) {
                    log::info!("Received grid invitation for grid: {}", payload.grid_id);
                    
                    // Emit to frontend
                    if let Err(e) = app_handle.emit("grid_invitation_received", &message.payload) {
                        log::error!("Failed to emit grid invitation event: {}", e);
                    }
                }
            }
            "code_generated" => {
                if let Ok(payload) = serde_json::from_value::<CodeGeneratedEvent>(message.payload.clone()) {
                    if let Err(e) = app_handle.emit("code_generated", &payload) {
                        log::error!("Failed to emit code generated event: {}", e);
                    }
                }
            }

            "code_used" => {
                if let Ok(payload) = serde_json::from_value::<CodeUsedEvent>(message.payload.clone()) {
                    if let Err(e) = app_handle.emit("code_used", &payload) {
                        log::error!("Failed to emit code used event: {}", e);
                    }
                }
            }

            "code_revoked" => {
                if let Ok(payload) = serde_json::from_value::<CodeRevokedEvent>(message.payload.clone()) {
                    if let Err(e) = app_handle.emit("code_revoked", &payload) {
                        log::error!("Failed to emit code revoked event: {}", e);
                    }
                }
            }
            // Error handling
            "error" => {
                log::error!("Received error message from server: {:?}", message.payload);
                
                // Emit to frontend
                if let Err(e) = app_handle.emit("websocket_error", &message.payload) {
                    log::error!("Failed to emit WebSocket error event: {}", e);
                }
            }
            
            "text_message_received" | "system_message_received" => {
                if let Ok(payload) = serde_json::from_value::<crate::api::types::TextMessagePayload>(message.payload.clone()) {
                    log::info!("Received text message in channel: {}", payload.channel_id);
                    
                    // Emit to frontend
                    if let Err(e) = app_handle.emit("text_message_received", &payload) {
                        log::error!("Failed to emit text message event: {}", e);
                    }
                }
            }

            "text_message_edited" => {
                if let Ok(payload) = serde_json::from_value::<crate::api::types::MessageEditedPayload>(message.payload.clone()) {
                    log::info!("Message edited in channel: {}", payload.channel_id);
                    
                    // Emit to frontend
                    if let Err(e) = app_handle.emit("text_message_edited", &payload) {
                        log::error!("Failed to emit message edited event: {}", e);
                    }
                }
            }

            "text_message_deleted" => {
                if let Ok(payload) = serde_json::from_value::<crate::api::types::MessageDeletedPayload>(message.payload.clone()) {
                    log::info!("Message deleted in channel: {}", payload.channel_id);
                    
                    // Emit to frontend
                    if let Err(e) = app_handle.emit("text_message_deleted", &payload) {
                        log::error!("Failed to emit message deleted event: {}", e);
                    }
                }
            }

            "message_reaction_changed" => {
                if let Ok(payload) = serde_json::from_value::<crate::api::types::MessageReactionPayload>(message.payload.clone()) {
                    log::info!("Message reaction {} in channel: {}", payload.action, payload.channel_id);
                    
                    // Emit to frontend
                    if let Err(e) = app_handle.emit("message_reaction_changed", &payload) {
                        log::error!("Failed to emit reaction changed event: {}", e);
                    }
                }
            }

            "typing_indicator" => {
                if let Ok(payload) = serde_json::from_value::<crate::api::types::TypingIndicatorPayload>(message.payload.clone()) {
                    log::debug!("Typing indicator for channel: {} user: {} typing: {}",
                            payload.channel_id, payload.user_id, payload.is_typing);

                    // Emit to frontend
                    if let Err(e) = app_handle.emit("typing_indicator", &payload) {
                        log::error!("Failed to emit typing indicator event: {}", e);
                    }
                }
            }

            // Process deletion events
            "process_deleted" | "shared_process_deleted" => {
                log::info!("Process deleted event received: {:?}", message.payload);

                // Emit to frontend so ContentPanel and GridManagement can refresh
                if let Err(e) = app_handle.emit("process_deleted_ws", &message.payload) {
                    log::error!("Failed to emit process deleted event: {}", e);
                }
            }

            // Shared process status change events
            "shared_process_status_changed" => {
                log::info!("Shared process status changed: {:?}", message.payload);

                // Emit to frontend so ContentPanel can update the status dots
                if let Err(e) = app_handle.emit("shared_process_status_changed", &message.payload) {
                    log::error!("Failed to emit shared process status changed event: {}", e);
                }
            }

            // Share notification handlers
            "share_notification" => {
                if let Ok(payload) = serde_json::from_value::<ShareHostNotification>(message.payload) {
                    log::info!("Received share notification: type={}, visitor={}, share={}",
                              payload.notification_type, payload.visitor_id, payload.share_id);

                    if payload.notification_type == "visitor_requesting_access" {
                        // Handle visitor request - create WebRTC offer
                        if let Err(e) = Self::handle_share_visitor_request(app_handle, payload).await {
                            log::error!("Failed to handle visitor request: {}", e);
                        }
                    } else if payload.notification_type == "visitor_disconnected" {
                        // Handle visitor disconnection
                        if let Err(e) = Self::handle_share_visitor_disconnect(app_handle, payload).await {
                            log::error!("Failed to handle visitor disconnect: {}", e);
                        }
                    }
                }
            }

            "share_webrtc_signal" => {
                if let Ok(payload) = serde_json::from_value::<ShareSignalPayload>(message.payload) {
                    log::info!("Received share WebRTC signal: type={}, visitor={}",
                              payload.signal_type, payload.visitor_id);

                    if let Err(e) = Self::handle_share_webrtc_signal(app_handle, payload).await {
                        log::error!("Failed to handle share WebRTC signal: {}", e);
                    }
                }
            }

            // Process connection created - guest is connecting to hosted process
            "process_connection_created" => {
                #[derive(Debug, serde::Deserialize)]
                struct ProcessConnectionPayload {
                    grid_id: String,
                    process_id: String,
                    guest_user_id: String,
                    connection_id: String,
                }

                if let Ok(payload) = serde_json::from_value::<ProcessConnectionPayload>(message.payload) {
                    log::info!("Guest {} connecting to process {} in grid {} - awaiting session invite",
                              payload.guest_user_id, payload.process_id, payload.grid_id);
                    // Note: This is just a notification. The actual WebRTC session will be initiated
                    // when we receive the session_invite message from the guest.
                }
            }

            _ => {
                log::warn!("Unknown WebSocket message type: {}", message.r#type);
            }
        }
        Ok(())
    }

    pub async fn disconnect(&mut self) -> Result<()> {
        // Clear the sender channel
        {
            let mut sender_guard = self.sender.write().await;
            *sender_guard = None;
        }
        
        // Update connection state
        {
            let mut connected = self.is_connected.lock().await;
            *connected = false;
        }
        
        log::info!("WebSocket disconnected");
        Ok(())
    }

    pub async fn is_connected(&self) -> bool {
        *self.is_connected.lock().await
    }

    pub async fn get_sender(&self) -> Option<mpsc::UnboundedSender<serde_json::Value>> {
        let sender_guard = self.sender.read().await;
        sender_guard.clone()
    }

    pub async fn send_message(&self, message: serde_json::Value) -> Result<()> {
        let sender_guard = self.sender.read().await;
        if let Some(sender) = sender_guard.as_ref() {
            sender.send(message)
                .context("Failed to send message to WebSocket")?;
            Ok(())
        } else {
            anyhow::bail!("WebSocket not connected")
        }
    }

    // Helper method to send JSON messages more easily
    pub async fn send_json_message(&self, msg_type: &str, payload: serde_json::Value) -> Result<()> {
        let message = serde_json::json!({
            "type": msg_type,
            "payload": payload
        });

        self.send_message(message).await
    }

    // Share-specific handlers
    async fn handle_share_visitor_request(
        app_handle: &AppHandle,
        notification: ShareHostNotification,
    ) -> Result<()> {
        use tauri::Manager;

        log::info!("Processing visitor request for share {}", notification.share_id);

        // Get share info from ShareManager
        let state: tauri::State<crate::AppState> = app_handle.state();
        let share_manager = state.share_manager.lock().await;

        let share_info = if let Some(manager) = share_manager.as_ref() {
            manager.get_share(&notification.share_id).await
                .ok_or_else(|| anyhow::anyhow!("Share not found: {}", notification.share_id))?
        } else {
            return Err(anyhow::anyhow!("Share manager not initialized"));
        };
        drop(share_manager);

        // Create WebRTC connection
        let connection_manager = state.share_connection_manager.lock().await;

        if let Some(manager) = connection_manager.as_ref() {
            // Create offer and start tunnel
            let offer = manager.handle_visitor_request(
                notification.share_id.clone(),
                notification.visitor_id.clone(),
                share_info.process_id,
                share_info.port,
                "".to_string(), // Grid ID not needed for share tunnels
            ).await?;

            drop(connection_manager);

            // Send offer back to visitor via server
            let ws_manager = state.websocket_manager.lock().await;
            if let Some(ws) = ws_manager.as_ref() {
                ws.send_json_message("share_webrtc_signal", serde_json::json!({
                    "share_id": notification.share_id,
                    "visitor_id": notification.visitor_id,
                    "signal_type": "offer",
                    "signal_data": {
                        "type": offer.sdp_type.to_string(),
                        "sdp": offer.sdp
                    }
                })).await?;

                log::info!("Sent WebRTC offer to visitor {}", notification.visitor_id);
            }
        }

        Ok(())
    }

    async fn handle_share_visitor_disconnect(
        app_handle: &AppHandle,
        notification: ShareHostNotification,
    ) -> Result<()> {
        use tauri::Manager;

        log::info!("Processing visitor disconnect for share {}", notification.share_id);

        let state: tauri::State<crate::AppState> = app_handle.state();
        let connection_manager = state.share_connection_manager.lock().await;

        if let Some(manager) = connection_manager.as_ref() {
            manager.handle_disconnect(&notification.share_id, &notification.visitor_id).await?;
            log::info!("Cleaned up connection for visitor {}", notification.visitor_id);
        }

        Ok(())
    }

    async fn handle_share_webrtc_signal(
        app_handle: &AppHandle,
        signal: ShareSignalPayload,
    ) -> Result<()> {
        use tauri::Manager;
        use webrtc::ice_transport::ice_candidate::RTCIceCandidateInit;
        use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;

        log::info!("Processing WebRTC signal: type={}", signal.signal_type);

        let state: tauri::State<crate::AppState> = app_handle.state();
        let connection_manager = state.share_connection_manager.lock().await;

        if let Some(manager) = connection_manager.as_ref() {
            match signal.signal_type.as_str() {
                "answer" => {
                    // Parse answer
                    let sdp_type = signal.signal_data["type"].as_str()
                        .ok_or_else(|| anyhow::anyhow!("Missing SDP type"))?;
                    let sdp = signal.signal_data["sdp"].as_str()
                        .ok_or_else(|| anyhow::anyhow!("Missing SDP"))?;

                    let answer = RTCSessionDescription::answer(sdp.to_string())?;
                    manager.handle_answer(&signal.share_id, &signal.visitor_id, answer).await?;

                    log::info!("Set remote description (answer) for visitor {}", signal.visitor_id);
                }

                "ice_candidate" => {
                    // Parse ICE candidate
                    let candidate_str = signal.signal_data["candidate"].as_str()
                        .ok_or_else(|| anyhow::anyhow!("Missing candidate"))?;
                    let sdp_mid = signal.signal_data["sdpMid"].as_str()
                        .map(|s| s.to_string());
                    let sdp_mline_index = signal.signal_data["sdpMLineIndex"].as_u64()
                        .map(|n| n as u16);

                    let candidate_init = RTCIceCandidateInit {
                        candidate: candidate_str.to_string(),
                        sdp_mid,
                        sdp_mline_index,
                        username_fragment: None,
                    };

                    manager.handle_ice_candidate(&signal.share_id, &signal.visitor_id, candidate_init).await?;

                    log::info!("Added ICE candidate for visitor {}", signal.visitor_id);
                }

                _ => {
                    log::warn!("Unknown signal type: {}", signal.signal_type);
                }
            }
        }

        Ok(())
    }


}