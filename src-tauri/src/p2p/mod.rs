pub mod connection;

use crate::api::types::{P2PSessionInfo, WebRTCSignalPayload};
use crate::api::client::CoordinatorClient;
use crate::auth::storage::{get_user_session, get_user_state};
use crate::websocket::WebSocketManager; // Add this import
use crate::process::ProcessManager; // Add to imports at the top
use anyhow::{Result, Context};
use connection::P2PConnection;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::AppHandle;
use tauri::Emitter;
use tokio::sync::{mpsc, Mutex};
use uuid::Uuid;
use serde_json::Value;
use tauri::Listener;
// Grid session status from the server
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct GridSessionStatus {
    pub grid_id: String,
    pub session_state: String, // "inactive", "hosted", "orphaned", "restoring"
    pub current_host_id: Option<String>,
    pub host_last_seen: Option<String>,
    pub session_metadata: HashMap<String, Value>,
    pub host_display_name: Option<String>,
    pub host_username: Option<String>,
}

// Reconnection state tracking
#[derive(Debug, Clone)]
struct ReconnectionState {
    grid_id: String,
    host_user_id: String,
    retry_count: u32,
    max_retries: u32,
    is_reconnecting: bool,
}

#[derive(Clone)]
pub struct P2PManager {
    app_handle: AppHandle,
    connections: Arc<Mutex<HashMap<String, P2PConnection>>>, // Key: grid_id or grid_id:user_id
    signal_sender: Arc<Mutex<Option<mpsc::UnboundedSender<serde_json::Value>>>>, // WebSocket sender
    api_client: Arc<CoordinatorClient>, // Wrap in Arc
    websocket_manager: Arc<Mutex<WebSocketManager>>, // Add this field here
    // Add this new field:
    process_data_receiver: Arc<Mutex<Option<mpsc::UnboundedReceiver<(String, Vec<u8>)>>>>,
    reconnection_states: Arc<Mutex<HashMap<String, ReconnectionState>>>, // Track reconnection per grid
}

// Update the P2PManager::new() method:
impl P2PManager {
    pub fn new(app_handle: AppHandle) -> Self {
        let manager = Self {
            app_handle: app_handle.clone(),
            connections: Arc::new(Mutex::new(HashMap::new())),
            signal_sender: Arc::new(Mutex::new(None)),
            api_client: Arc::new(CoordinatorClient::new()),
            websocket_manager: Arc::new(Mutex::new(WebSocketManager::new(app_handle.clone()))),
            process_data_receiver: Arc::new(Mutex::new(None)),
            reconnection_states: Arc::new(Mutex::new(HashMap::new())),
        };

        // Set up auto-reconnection listener
        manager.setup_reconnection_listener();

        // Set up process event listeners for cleanup
        manager.setup_process_cleanup_listeners();

        manager
    }

    /// Set up event listener for auto-reconnection on disconnect
    fn setup_reconnection_listener(&self) {
        let manager_clone = self.clone();

        self.app_handle.listen("host_disconnected", move |event| {
            let manager = manager_clone.clone();

            // Parse event payload
            if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
                let grid_id = payload.get("grid_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                let host_user_id = payload.get("host_user_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                if !grid_id.is_empty() && !host_user_id.is_empty() {
                    log::info!("Detected disconnect for grid {}, initiating auto-reconnection to host {}",
                              grid_id, host_user_id);

                    // Spawn async task to handle reconnection
                    tokio::spawn(async move {
                        if let Err(e) = manager.attempt_reconnection(grid_id.clone(), host_user_id).await {
                            log::error!("Failed to start reconnection for grid {}: {}", grid_id, e);
                        }
                    });
                } else {
                    log::warn!("Cannot reconnect: missing grid_id or host_user_id in disconnect event");
                }
            }
        });

        log::info!("Auto-reconnection listener initialized");
    }

    /// Set up event listeners for process crashes/exits to clean up transports
    fn setup_process_cleanup_listeners(&self) {
        let manager_for_exit = self.clone();
        let manager_for_stop = self.clone();

        // Listen for process exit events (crash or normal exit)
        self.app_handle.listen("process_exited", move |event| {
            let manager = manager_for_exit.clone();

            if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
                let grid_id = payload.get("grid_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                let process_id = payload.get("process_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                if !grid_id.is_empty() {
                    log::info!("Process {} exited in grid {}, cleaning up transports", process_id, grid_id);

                    tokio::spawn(async move {
                        if let Err(e) = manager.cleanup_grid_transports(&grid_id).await {
                            log::error!("Failed to clean up transports for grid {}: {}", grid_id, e);
                        }
                    });
                }
            }
        });

        // Listen for process stop events (manual stop)
        self.app_handle.listen("process_stopped", move |event| {
            let manager = manager_for_stop.clone();

            if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
                let grid_id = payload.get("grid_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                let process_id = payload.get("process_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                if !grid_id.is_empty() {
                    log::info!("Process {} stopped in grid {}, cleaning up transports", process_id, grid_id);

                    tokio::spawn(async move {
                        if let Err(e) = manager.cleanup_grid_transports(&grid_id).await {
                            log::error!("Failed to clean up transports for grid {}: {}", grid_id, e);
                        }
                    });
                }
            }
        });

        log::info!("Process cleanup listeners initialized");
    }

    /// Clean up all transports for a grid (when process crashes/exits)
    async fn cleanup_grid_transports(&self, grid_id: &str) -> Result<()> {
        log::info!("Cleaning up transports for grid: {}", grid_id);

        let connections = self.connections.lock().await;

        // Find all connections for this grid
        for (key, connection) in connections.iter() {
            if key == grid_id || key.starts_with(&format!("{}:", grid_id)) {
                log::info!("Stopping all transports for connection: {}", key);
                if let Err(e) = connection.stop_all_transports().await {
                    log::error!("Failed to stop transports for {}: {}", key, e);
                }
            }
        }

        Ok(())
    }


    async fn ensure_websocket_connected(&self) -> Result<()> {
        // Check if already connected
        if self.signal_sender.lock().await.is_some() {
            return Ok(());
        }

        // Get auth token
        let session = get_user_session().await?;
        let token = session
            .ok_or_else(|| anyhow::anyhow!("No active session"))?
            .token;

        // Connect websocket
        let websocket_url = format!("wss://roguegrid9-coordinator.fly.dev/ws?token={}", token);
        let ws_manager = self.websocket_manager.lock().await;
        ws_manager.connect(websocket_url).await?;
        
        // Store sender
        if let Some(sender) = ws_manager.get_sender().await {
            let mut sender_guard = self.signal_sender.lock().await;
            *sender_guard = Some(sender);
            log::info!("WebSocket connected lazily");
        }

        Ok(())
}
    async fn connect_websocket(
        websocket_manager: Arc<Mutex<WebSocketManager>>,
        signal_sender: Arc<Mutex<Option<mpsc::UnboundedSender<serde_json::Value>>>>
    ) -> Result<()> {
        // Get auth token
        let session = get_user_session().await?;
        let token = session
            .ok_or_else(|| anyhow::anyhow!("No active session"))?
            .token;

        // Build websocket URL with auth
        let websocket_url = format!("wss://roguegrid9-coordinator.fly.dev/ws?token={}", token);
        
        // Connect websocket
        let ws_manager = websocket_manager.lock().await;
        ws_manager.connect(websocket_url).await?;
        
        // Get sender and store it
        if let Some(sender) = ws_manager.get_sender().await {
            let mut sender_guard = signal_sender.lock().await;
            *sender_guard = Some(sender);
            log::info!("WebSocket connected and sender stored");
        }

        Ok(())
    }

    pub async fn set_websocket_sender(&mut self, sender: mpsc::UnboundedSender<serde_json::Value>) {
        let mut guard = self.signal_sender.lock().await;
        *guard = Some(sender);
        log::info!("WebSocket sender connected to P2P manager");
    }

    // Add this method to set up communication with ProcessManager
    pub async fn setup_process_integration(&self, process_manager: Arc<Mutex<Option<ProcessManager>>>) -> Result<()> {
        // Create channel for process data communication
        let (sender, receiver) = mpsc::unbounded_channel::<(String, Vec<u8>)>();
        
        // Keep receiver in P2PManager
        {
            let mut receiver_guard = self.process_data_receiver.lock().await;
            *receiver_guard = Some(receiver);
        }
        
        // Start task to handle process output
        self.start_process_output_handler().await;
        
        log::info!("P2P-Process integration established");
        Ok(())
    }

    // Handle process stdout data and send it via P2P to connected clients
    async fn start_process_output_handler(&self) {
        let connections = self.connections.clone();
        let receiver = self.process_data_receiver.clone();
        
        tokio::spawn(async move {
            loop {
                let data = {
                    let mut receiver_guard = receiver.lock().await;
                    if let Some(rx) = receiver_guard.as_mut() {
                        rx.recv().await
                    } else {
                        // Wait and try again if receiver not set up yet
                        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                        continue;
                    }
                };
                
                if let Some((grid_id, process_data)) = data {
                    // Send process output to all connected clients in this grid
                    let connections_guard = connections.lock().await;
                    
                    // Find connections for this grid
                    for (connection_key, connection) in connections_guard.iter() {
                        // Check if this connection is for the same grid
                        if connection_key == &grid_id || connection_key.starts_with(&format!("{}:", grid_id)) {
                            if let Err(e) = connection.send_data(process_data.clone()).await {
                                log::error!("Failed to send process data to connection {}: {}", connection_key, e);
                            }
                        }
                    }
                } else {
                    // Channel closed, exit loop
                    break;
                }
            }
            log::info!("Process output handler task ended");
        });
    }

    // Add method to handle incoming P2P data and route it to processes
    pub async fn handle_process_input(&self, grid_id: String, data: Vec<u8>, process_manager: Arc<Mutex<Option<ProcessManager>>>) -> Result<()> {
        log::debug!("Routing {} bytes from P2P to process for grid: {}", data.len(), grid_id);
        
        let pm_guard = process_manager.lock().await;
        if let Some(pm) = pm_guard.as_ref() {
            pm.handle_p2p_data(grid_id, data).await?;
        } else {
            return Err(anyhow::anyhow!("❌ Process manager is not initialized. Please restart the application."));
        }

        Ok(())
    }

    // NEW: Join a grid session (replaces send_session_invite) - Remove process_manager parameter
    pub async fn join_grid_session(&self, grid_id: String) -> Result<String> {
        log::info!("Attempting to join grid session: {}", grid_id);

        self.ensure_websocket_connected().await?;
        // Get WebSocket sender before creating connection
        if self.signal_sender.lock().await.is_none() {
            return Err(anyhow::anyhow!("🔌 Connection to RogueGrid server lost. Please check your internet connection and try again."));
        }

        // Step 1: Check grid session status
        let status = self.get_grid_status(&grid_id).await?;
        
        match status.session_state.as_str() {
            "hosted" => {
                // Connect to existing host's process
                if let Some(host_id) = status.current_host_id {
                    self.connect_to_grid_host(grid_id, host_id).await
                } else {
                    Err(anyhow::anyhow!("⚠️ Grid is marked as hosted but the host is not available. Please try reconnecting or start the grid yourself."))
                }
            }
            "inactive" | "orphaned" => {
                // Try to become the host
                self.claim_grid_host(grid_id).await
            }
            "restoring" => {
                Err(anyhow::anyhow!("⏳ Grid is currently being restored from a previous session. Please wait a moment and try again."))
            }
            _ => {
                Err(anyhow::anyhow!("❌ Grid is in an unexpected state ({}). Please contact support if this persists.", status.session_state))
            }
        }
    }

    // Check grid session status via existing API client
    pub async fn get_grid_status(&self, grid_id: &str) -> Result<GridSessionStatus> {
        let token = self.get_auth_token().await?;
        
        // Use the existing API client method
        self.api_client.get_grid_status(&token, grid_id.to_string()).await
    }

    // Claim host status for a grid
    pub async fn claim_grid_host(&self, grid_id: String) -> Result<String> {
        log::info!("Attempting to claim host for grid: {}", grid_id);

        let token = self.get_auth_token().await?;

        // Use the existing API client method
        self.api_client.claim_grid_host(&token, grid_id.clone()).await?;

        log::info!("Successfully claimed host for grid: {}", grid_id);
        // Start hosting - no P2P connection needed, we ARE the host
        self.start_hosting_grid(grid_id.clone()).await?;
        Ok(grid_id)
    }

    // Connect to an existing grid host via P2P - Fix to pass None for process_manager
    async fn connect_to_grid_host(&self, grid_id: String, host_user_id: String) -> Result<String> {
        log::info!("Connecting to grid host {} for grid {}", host_user_id, grid_id);

        // Create session ID
        let session_id = Uuid::new_v4().to_string();
        
        // Create guest connection - pass None for process_manager since guest doesn't need it
        let connection = P2PConnection::new_guest(
            session_id.clone(), 
            host_user_id.clone(),
            grid_id.clone(),
            self.app_handle.clone(),
            None, // Guest doesn't manage processes
            None  // Add missing media_manager parameter
        ).await?;

        // Set up signal sender for this connection
        if let Some(sender) = self.signal_sender.lock().await.as_ref() {
            connection.set_signal_sender(sender.clone()).await;
        }

        // Store connection (use grid_id as key since we're connecting to the grid)
        let mut connections = self.connections.lock().await;
        connections.insert(grid_id.clone(), connection);

        // Send session invite to the host via WebSocket
        self.send_session_invite_to_host(&grid_id, &host_user_id).await?;

        Ok(session_id)
    }

    // Start hosting a grid (no P2P needed, we are the host)
    async fn start_hosting_grid(&self, grid_id: String) -> Result<()> {
        log::info!("Started hosting grid: {}", grid_id);
        
        // NEW: Create a host connection entry so get_active_sessions() finds it
        let session_id = Uuid::new_v4().to_string();
        let connection = P2PConnection::new_host(
            session_id.clone(),
            "localhost".to_string(), // Self-connection for hosting
            grid_id.clone(),
            self.app_handle.clone(),
            None, // Host connection for transport management
            None  // Add missing media_manager parameter
        ).await?;

        // Store the host connection using grid_id as key
        {
            let mut connections = self.connections.lock().await;
            connections.insert(grid_id.clone(), connection);
        }
        
        // Emit event to frontend that we're now hosting
        self.app_handle.emit("grid_hosting_started", &serde_json::json!({
            "grid_id": grid_id,
            "is_host": true
        }))?;

        // Start heartbeat to keep host status alive
        self.start_host_heartbeat(grid_id).await;

        Ok(())
    }

    // Send session invite to grid host via WebSocket
    async fn send_session_invite_to_host(&self, grid_id: &str, host_user_id: &str) -> Result<()> {
        let invite_message = serde_json::json!({
            "type": "session_invite",
            "payload": {
                "to_user_id": host_user_id,
                "grid_id": grid_id
            }
        });

        if let Some(sender) = self.signal_sender.lock().await.as_ref() {
            sender.send(invite_message)
                .context("Failed to send session invite")?;
        } else {
            return Err(anyhow::anyhow!("WebSocket not connected"));
        }

        Ok(())
    }

    // Auto-reconnection logic with exponential backoff
    async fn attempt_reconnection(&self, grid_id: String, host_user_id: String) -> Result<()> {
        const MAX_RETRIES: u32 = 5;

        // Check if already reconnecting and initialize state atomically
        let should_start_reconnection = {
            let mut reconnection_states = self.reconnection_states.lock().await;

            // Check if already reconnecting
            if let Some(state) = reconnection_states.get(&grid_id) {
                if state.is_reconnecting {
                    log::info!("Already attempting reconnection for grid {}", grid_id);
                    return Ok(());
                }
            }

            // Initialize reconnection state in the same critical section
            reconnection_states.insert(
                grid_id.clone(),
                ReconnectionState {
                    grid_id: grid_id.clone(),
                    host_user_id: host_user_id.clone(),
                    retry_count: 0,
                    max_retries: MAX_RETRIES,
                    is_reconnecting: true,
                },
            );

            true
        };

        if !should_start_reconnection {
            return Ok(());
        }

        // Clone for the background task
        let manager = self.clone();
        let grid_id_task = grid_id.clone();
        let host_user_id_task = host_user_id.clone();

        // Spawn reconnection task
        tokio::spawn(async move {
            let mut retry_count = 0;

            while retry_count < MAX_RETRIES {
                // Check if reconnection was cancelled (state removed)
                {
                    let reconnection_states = manager.reconnection_states.lock().await;
                    if !reconnection_states.contains_key(&grid_id_task) {
                        log::info!("Reconnection cancelled for grid {}", grid_id_task);
                        return;
                    }
                }

                // Exponential backoff: 1s, 2s, 4s, 8s, 16s
                let delay_secs = 2u64.pow(retry_count);

                log::info!(
                    "Reconnection attempt {}/{} for grid {} in {}s",
                    retry_count + 1,
                    MAX_RETRIES,
                    grid_id_task,
                    delay_secs
                );

                // Emit reconnection attempt event
                manager.app_handle.emit("p2p_reconnecting", &serde_json::json!({
                    "grid_id": grid_id_task,
                    "attempt": retry_count + 1,
                    "max_attempts": MAX_RETRIES,
                    "delay_seconds": delay_secs
                })).ok();

                tokio::time::sleep(tokio::time::Duration::from_secs(delay_secs)).await;

                // Check again after sleep (user might have cancelled during wait)
                {
                    let reconnection_states = manager.reconnection_states.lock().await;
                    if !reconnection_states.contains_key(&grid_id_task) {
                        log::info!("Reconnection cancelled for grid {} (during backoff)", grid_id_task);
                        return;
                    }
                }

                // Clean up old connection before reconnecting
                {
                    let mut connections = manager.connections.lock().await;
                    connections.remove(&grid_id_task);
                    // Also try specific key format
                    connections.remove(&format!("{}:{}", grid_id_task, host_user_id_task));
                }

                // Attempt reconnection
                match manager.connect_to_grid_host(grid_id_task.clone(), host_user_id_task.clone()).await {
                    Ok(_) => {
                        log::info!("Successfully reconnected to grid {}", grid_id_task);

                        // Clear reconnection state
                        {
                            let mut reconnection_states = manager.reconnection_states.lock().await;
                            reconnection_states.remove(&grid_id_task);
                        }

                        // Emit success event
                        manager.app_handle.emit("p2p_reconnected", &serde_json::json!({
                            "grid_id": grid_id_task,
                            "attempt": retry_count + 1
                        })).ok();

                        return;
                    }
                    Err(e) => {
                        log::warn!("Reconnection attempt {} failed for grid {}: {}", retry_count + 1, grid_id_task, e);
                        retry_count += 1;
                    }
                }
            }

            // Max retries exceeded
            log::error!("Failed to reconnect to grid {} after {} attempts", grid_id_task, MAX_RETRIES);

            // Clear reconnection state
            {
                let mut reconnection_states = manager.reconnection_states.lock().await;
                reconnection_states.remove(&grid_id_task);
            }

            // Emit failure event
            manager.app_handle.emit("p2p_reconnection_failed", &serde_json::json!({
                "grid_id": grid_id_task,
                "max_attempts": MAX_RETRIES
            })).ok();
        });

        Ok(())
    }

    /// Cancel ongoing reconnection attempt for a grid
    pub async fn cancel_reconnection(&self, grid_id: &str) -> Result<()> {
        let mut reconnection_states = self.reconnection_states.lock().await;
        if reconnection_states.remove(grid_id).is_some() {
            log::info!("Cancelled reconnection for grid {}", grid_id);

            // Emit cancellation event
            self.app_handle.emit("p2p_reconnection_cancelled", &serde_json::json!({
                "grid_id": grid_id
            })).ok();
        }
        Ok(())
    }

    // Handle incoming session invite (when someone wants to connect to our process)
    pub async fn handle_session_invite(&self, from_user_id: String, grid_id: String) -> Result<()> {
        log::info!("Received session invite from {} for grid {}", from_user_id, grid_id);

        // Note: We don't check grid host status here. Each process owner can accept
        // connections to their own processes without needing to be the grid host.
        // The backend has already authorized this connection by returning our user_id
        // as the process owner to the guest.

        log::info!("Accepting session invite for process connection (no grid-level hosting required)");

        // Accept the invite and create host connection
        self.accept_session_invite(from_user_id, grid_id).await
    }

    // Accept session invite (as host) - Remove process_manager parameter
    pub async fn accept_session_invite(&self, from_user_id: String, grid_id: String) -> Result<()> {
        log::info!("Accepting session invite from {} for grid {}", from_user_id, grid_id);

        // Send accept message via WebSocket
        let accept_message = serde_json::json!({
            "type": "session_accept",
            "payload": {
                "to_user_id": from_user_id,
                "grid_id": grid_id
            }
        });

        if let Some(sender) = self.signal_sender.lock().await.as_ref() {
            sender.send(accept_message)
                .context("Failed to send session accept")?;
        }

        // Create host connection (we're the host accepting a guest's invite)
        let session_id = Uuid::new_v4().to_string();
        let connection = P2PConnection::new_host(
            session_id.clone(),
            from_user_id.clone(),
            grid_id.clone(),
            self.app_handle.clone(),
            None, // Process manager
            None  // Media manager
        ).await?;

        // Set up signal sender
        if let Some(sender) = self.signal_sender.lock().await.as_ref() {
            connection.set_signal_sender(sender.clone()).await;
        }

        // Store connection BEFORE starting WebRTC to prevent race condition
        // where answer arrives before connection is stored
        let connection_key = format!("{}:{}", grid_id, from_user_id);
        {
            let mut connections = self.connections.lock().await;
            connections.insert(connection_key, connection);
        } // Release lock before async operations

        // Now start the WebRTC handshake
        // Host creates the offer and sends it to the guest
        log::info!("Starting WebRTC connection as host for session {}", session_id);

        // Get connection from HashMap to call start_connection
        let mut connections = self.connections.lock().await;
        let connection_key = format!("{}:{}", grid_id, from_user_id);
        if let Some(connection) = connections.get_mut(&connection_key) {
            connection.start_connection().await?;
        }

        Ok(())
    }

    // Handle WebRTC signal with grid context
    pub async fn handle_webrtc_signal(&self, signal: WebRTCSignalPayload) -> Result<()> {
        log::info!("Received WebRTC signal from {} for grid {}", signal.to_user_id, signal.grid_id);

        let mut connections = self.connections.lock().await;

        // Try all possible connection keys
        // 1. Try grid:user key first (most specific - for active P2P sessions)
        let connection_key_specific = format!("{}:{}", signal.grid_id, signal.to_user_id);
        if let Some(connection) = connections.get_mut(&connection_key_specific) {
            log::debug!("Found connection with key: {}", connection_key_specific);
            connection.handle_signal(signal.signal_data).await?;
            return Ok(());
        }

        // 2. Try finding by prefix (when we're host, guest sends signals with to_user_id = host)
        // We need to find the connection for that guest, which is stored as grid_id:guest_id
        for (key, connection) in connections.iter_mut() {
            if key.starts_with(&format!("{}:", signal.grid_id)) && key != &signal.grid_id {
                log::debug!("Found P2P connection with key: {}", key);
                connection.handle_signal(signal.signal_data).await?;
                return Ok(());
            }
        }

        // 3. Try grid-only key last (fallback for simple connections)
        if let Some(connection) = connections.get_mut(&signal.grid_id) {
            // Check if this is an initialized connection (has peer_connection)
            log::debug!("Found grid-only connection with key: {}", signal.grid_id);
            connection.handle_signal(signal.signal_data).await?;
            return Ok(());
        }

        log::warn!("No active connection found for WebRTC signal from {} in grid {}",
                  signal.to_user_id, signal.grid_id);
        Ok(())
    }

    // Start periodic heartbeat to maintain host status
    // IMPROVED: Reduced from 30s to 10s for faster crash detection
    async fn start_host_heartbeat(&self, grid_id: String) {
        let api_client = self.api_client.clone(); // Clone the Arc, not the client
        let grid_id_clone = grid_id.clone();

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(10));

            loop {
                interval.tick().await;

                // Send heartbeat API call - api_client derefs automatically
                if let Err(e) = Self::send_heartbeat(&api_client, &grid_id_clone).await {
                    log::error!("Failed to send heartbeat for grid {}: {}", grid_id_clone, e);
                    // Could break here if we want to stop heartbeat on failure
                }
            }
        });
    }

    // Update send_heartbeat to accept Arc<CoordinatorClient>
    async fn send_heartbeat(api_client: &CoordinatorClient, grid_id: &str) -> Result<()> {
        // Get current token
        let session = get_user_session().await?;
        let token = session
            .ok_or_else(|| anyhow::anyhow!("No active session"))?
            .token;
        
        // Use the existing API client method - Arc derefs automatically
        api_client.send_grid_heartbeat(&token, grid_id.to_string()).await?;

        Ok(())
    }

    // Release host status when we stop hosting
    pub async fn release_grid_host(&self, grid_id: String) -> Result<()> {
        let token = self.get_auth_token().await?;
        
        // Use the existing API client method
        self.api_client.release_grid_host(&token, grid_id.clone()).await?;
        
        log::info!("Successfully released host status for grid: {}", grid_id);
        
        // Emit event to frontend
        self.app_handle.emit("grid_hosting_stopped", &serde_json::json!({
            "grid_id": grid_id,
            "is_host": false
        }))?;

        Ok(())
    }

    // Get list of active sessions
    pub async fn get_active_sessions(&self) -> Vec<P2PSessionInfo> {
        let connections = self.connections.lock().await;
        let mut sessions = Vec::new();

        for (key, connection) in connections.iter() {
            // Parse key to extract grid_id (either "grid_id" or "grid_id:user_id")
            let grid_id = if key.contains(':') {
                key.split(':').next().unwrap_or(key).to_string()
            } else {
                key.clone()
            };

            sessions.push(P2PSessionInfo {
                session_id: key.clone(), // Use the key as session identifier
                grid_id,
                peer_user_id: connection.get_peer_user_id(),
                state: connection.get_state_async().await,
                is_host: connection.is_host(),
                created_at: connection.get_created_at(),
            });
        }

        sessions
    }

    // Close session
    pub async fn close_session(&self, session_key: String) -> Result<()> {
        let mut connections = self.connections.lock().await;
        
        if let Some(mut connection) = connections.remove(&session_key) {
            connection.close().await?;
            log::info!("Session {} closed", session_key);
        }

        Ok(())
    }

    // Send data through a P2P connection
    pub async fn send_data(&self, session_key: String, data: Vec<u8>) -> Result<()> {
        let connections = self.connections.lock().await;
        
        if let Some(connection) = connections.get(&session_key) {
            connection.send_data(data).await?;
        } else {
            return Err(anyhow::anyhow!("Session not found: {}", session_key));
        }

        Ok(())
    }

    pub async fn add_transport_to_connection(&self, grid_id: String, transport_config: crate::transport::TransportConfig) -> Result<String> {
        log::info!("Adding transport to grid connection: {}", grid_id);

        let mut connections = self.connections.lock().await;
        
        // Find the connection for this grid
        let connection = if let Some(conn) = connections.get_mut(&grid_id) {
            conn
        } else {
            // Try with grid:user format (when we're the host)
            let mut found_connection = None;
            for (key, conn) in connections.iter_mut() {
                if key.starts_with(&format!("{}:", grid_id)) {
                    found_connection = Some(conn);
                    break;
                }
            }
            found_connection.ok_or_else(|| anyhow::anyhow!("No active connection found for grid: {}", grid_id))?
        };

        // Add transport config to the connection
        connection.add_transport_config(transport_config.clone()).await?;

        let transport_id = format!("{}_{}", grid_id, transport_config.process_id);
        log::info!("Transport {} added to connection", transport_id);
        Ok(transport_id)
    }

    // NEW: Get transport information for a grid
    pub async fn get_grid_transports(&self, grid_id: String) -> Vec<serde_json::Value> {
        let connections = self.connections.lock().await;
        
        // Try both connection key formats
        if let Some(connection) = connections.get(&grid_id) {
            return connection.get_active_transports().await;
        }

        // Check grid:user format connections
        for (key, connection) in connections.iter() {
            if key.starts_with(&format!("{}:", grid_id)) {
                return connection.get_active_transports().await;
            }
        }

        Vec::new()
    }

    // NEW: Stop transport for a specific grid
    pub async fn stop_grid_transport(&self, grid_id: String, transport_id: String) -> Result<()> {
        let mut connections = self.connections.lock().await;
        
        // Find the connection for this grid
        let connection = if let Some(conn) = connections.get_mut(&grid_id) {
            conn
        } else {
            // Try with grid:user format
            let mut found_connection = None;
            for (key, conn) in connections.iter_mut() {
                if key.starts_with(&format!("{}:", grid_id)) {
                    found_connection = Some(conn);
                    break;
                }
            }
            found_connection.ok_or_else(|| anyhow::anyhow!("No active connection found for grid: {}", grid_id))?
        };

        connection.stop_transport(transport_id).await?;
        Ok(())
    }

    // NEW: Send data through a specific transport
    pub async fn send_transport_data(&self, grid_id: String, message_type: String, data: serde_json::Value) -> Result<()> {
        let connections = self.connections.lock().await;
        
        // Find the connection
        let connection = if let Some(conn) = connections.get(&grid_id) {
            conn
        } else {
            // Try grid:user format
            let mut found_connection = None;
            for (key, conn) in connections.iter() {
                if key.starts_with(&format!("{}:", grid_id)) {
                    found_connection = Some(conn);
                    break;
                }
            }
            found_connection.ok_or_else(|| anyhow::anyhow!("No active connection found for grid: {}", grid_id))?
        };

        // Create transport message
        let transport_message = serde_json::json!({
            "type": message_type,
            "grid_id": grid_id,
            "data": data
        });

        let message_bytes = transport_message.to_string().into_bytes();
        connection.send_data(message_bytes).await?;

        Ok(())
    }

    // NEW: Handle process events and route to P2P connections
    pub async fn handle_process_output(&self, grid_id: String, process_id: String, output_type: String, data: Vec<u8>) -> Result<()> {
        log::debug!("Routing process output to P2P: grid={}, process={}, type={}, bytes={}", 
                   grid_id, process_id, output_type, data.len());

        // Create process output message
        let output_message = serde_json::json!({
            "type": "process_output",
            "process_id": process_id,
            "output_type": output_type, // "stdout", "stderr"
            "data": base64::encode(&data)
        });

        self.send_transport_data(grid_id, "process_output".to_string(), output_message).await?;
        Ok(())
    }

    // NEW: Handle transport input from P2P and route to process
    pub async fn handle_transport_input(&self, grid_id: String, message: serde_json::Value) -> Result<()> {
        let message_type = message.get("type")
            .and_then(|t| t.as_str())
            .unwrap_or("unknown");

        match message_type {
            "terminal_input" => {
                if let Some(data_b64) = message.get("data").and_then(|d| d.as_str()) {
                    if let Ok(input_data) = base64::decode(data_b64) {
                        // Route to ProcessManager
                        self.route_to_process_manager(grid_id, input_data).await?;
                    }
                }
            }
            "http_request" => {
                // Handle HTTP request forwarding
                log::info!("Received HTTP request for grid: {}", grid_id);
                // TODO: Forward to local HTTP server
            }
            "tcp_data" => {
                // Handle TCP data forwarding
                log::info!("Received TCP data for grid: {}", grid_id);
                // TODO: Forward to local TCP socket
            }
            _ => {
                log::warn!("Unknown transport message type: {}", message_type);
            }
        }

        Ok(())
    }

    // Helper method to route data to ProcessManager
    async fn route_to_process_manager(&self, grid_id: String, data: Vec<u8>) -> Result<()> {
        // Emit event that ProcessManager can listen to
        self.app_handle.emit("p2p_process_input", &serde_json::json!({
            "grid_id": grid_id,
            "data": data
        }))?;

        Ok(())
    }

    // NEW: Set up event listeners for process integration
    pub async fn setup_process_event_listeners(&self) -> Result<()> {
        let app_handle = self.app_handle.clone();
        
        // Clone the actual manager instance, not the reference
        let manager_for_stdout = (*self).clone();  // Dereference self before cloning
        let manager_for_stderr = (*self).clone();  // Dereference self before cloning

        // Listen for process stdout events
        app_handle.listen("process_stdout", move |event| {
            let manager = manager_for_stdout.clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
                    if let (Some(grid_id), Some(process_id), Some(data)) = (
                        payload.get("grid_id").and_then(|g| g.as_str()),
                        payload.get("process_id").and_then(|p| p.as_str()),
                        payload.get("data").and_then(|d| d.as_array())
                    ) {
                        // Convert data array to bytes
                        let bytes: Vec<u8> = data.iter()
                            .filter_map(|v| v.as_u64().map(|n| n as u8))
                            .collect();

                        if let Err(e) = manager.handle_process_output(
                            grid_id.to_string(),
                            process_id.to_string(),
                            "stdout".to_string(),
                            bytes
                        ).await {
                            log::error!("Failed to route process stdout to P2P: {}", e);
                        }
                    }
                } else {
                    log::warn!("Failed to parse process_stdout event payload");
                }
            });
        });

        // Listen for process stderr events
        app_handle.listen("process_stderr", move |event| {
            let manager = manager_for_stderr.clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
                    if let (Some(grid_id), Some(process_id), Some(data_str)) = (
                        payload.get("grid_id").and_then(|g| g.as_str()),
                        payload.get("process_id").and_then(|p| p.as_str()),
                        payload.get("data").and_then(|d| d.as_str())
                    ) {
                        let bytes = data_str.as_bytes().to_vec();

                        if let Err(e) = manager.handle_process_output(
                            grid_id.to_string(),
                            process_id.to_string(),
                            "stderr".to_string(),
                            bytes
                        ).await {
                            log::error!("Failed to route process stderr to P2P: {}", e);
                        }
                    }
                } else {
                    log::warn!("Failed to parse process_stderr event payload");
                }
            });
        });

        log::info!("Process event listeners set up for P2P integration");
        Ok(())
    }
    // Helper methods using existing auth system
    async fn get_auth_token(&self) -> Result<String> {
        let session = get_user_session().await?;
        let token = session
            .ok_or_else(|| anyhow::anyhow!("🔐 You're not logged in. Please log in to continue."))?
            .token;
        Ok(token)
    }

    async fn get_current_user_id(&self) -> Result<String> {
        let state = get_user_state().await?;
        let user_id = state.user_id
            .ok_or_else(|| anyhow::anyhow!("🔐 User session is invalid. Please log out and log back in."))?;
        Ok(user_id)
    }

    pub async fn initialize_media_session(&self, session_id: String) -> Result<()> {
        log::info!("Initializing media session: {}", session_id);
        
        let mut connections = self.connections.lock().await;
        
        // Find connection by session_id or grid_id
        for (key, connection) in connections.iter() {
            if key == &session_id || key.contains(&session_id) {
                return connection.initialize_media_session().await;
            }
        }


        Err(anyhow::anyhow!("❌ Connection session not found. The P2P connection may have been closed. Please try reconnecting."))
    }

    pub async fn add_media_track(&self, session_id: String, track_info: crate::commands::p2p::MediaTrackInfo) -> Result<()> {
        log::info!("Adding media track to session: {}", session_id);
        
        let mut connections = self.connections.lock().await;
        
        // Convert from command type to connection type
        let connection_track_info = crate::p2p::connection::MediaTrackInfo {
            track_id: track_info.track_id,
            kind: track_info.kind,
            stream_id: track_info.stream_id,
            enabled: track_info.enabled,
        };
        
        for (key, connection) in connections.iter() {
            if key == &session_id || key.contains(&session_id) {
                return connection.add_media_track(connection_track_info).await;
            }
        }


        Err(anyhow::anyhow!("❌ Connection session not found. The P2P connection may have been closed. Please try reconnecting."))
    }

    pub async fn remove_media_track(&self, session_id: String, track_id: String) -> Result<()> {
        log::info!("Removing media track from session: {}", session_id);
        
        let mut connections = self.connections.lock().await;
        
        for (key, connection) in connections.iter() {
            if key == &session_id || key.contains(&session_id) {
                return connection.remove_media_track(track_id).await;
            }
        }


        Err(anyhow::anyhow!("❌ Connection session not found. The P2P connection may have been closed. Please try reconnecting."))
    }

    pub async fn set_track_enabled(&self, session_id: String, track_id: String, enabled: bool) -> Result<()> {
        log::debug!("Setting track enabled for session: {}", session_id);
        
        let mut connections = self.connections.lock().await;
        
        for (key, connection) in connections.iter() {
            if key == &session_id || key.contains(&session_id) {
                return connection.set_track_enabled(track_id, enabled).await;
            }
        }


        Err(anyhow::anyhow!("❌ Connection session not found. The P2P connection may have been closed. Please try reconnecting."))
    }

    pub async fn replace_video_track(&self, session_id: String, old_track_id: String, new_track_id: String, stream_id: String) -> Result<()> {
        log::info!("Replacing video track in session: {}", session_id);
        
        let mut connections = self.connections.lock().await;
        
        for (key, connection) in connections.iter() {
            if key == &session_id || key.contains(&session_id) {
                return connection.replace_video_track(old_track_id, new_track_id, stream_id).await;
            }
        }


        Err(anyhow::anyhow!("❌ Connection session not found. The P2P connection may have been closed. Please try reconnecting."))
    }

    pub async fn get_media_stats(&self, session_id: String) -> Result<crate::commands::p2p::MediaStats> {
        log::debug!("Getting media stats for session: {}", session_id);
        
        let connections = self.connections.lock().await;
        
        for (key, connection) in connections.iter() {
            if key == &session_id || key.contains(&session_id) {
                let stats_json = connection.get_media_stats().await?;
                
                // Convert from JSON to MediaStats struct
                let audio_stats = if let Some(audio) = stats_json.get("audio") {
                    Some(crate::commands::p2p::AudioStats {
                        packets_lost: audio.get("packets_lost").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                        packets_received: audio.get("packets_received").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                        bytes_received: audio.get("bytes_received").and_then(|v| v.as_u64()).unwrap_or(0),
                        jitter: audio.get("jitter").and_then(|v| v.as_f64()).unwrap_or(0.0),
                    })
                } else {
                    None
                };

                let video_stats = if let Some(video) = stats_json.get("video") {
                    Some(crate::commands::p2p::VideoStats {
                        packets_lost: video.get("packets_lost").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                        packets_received: video.get("packets_received").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                        bytes_received: video.get("bytes_received").and_then(|v| v.as_u64()).unwrap_or(0),
                        frame_rate: video.get("frame_rate").and_then(|v| v.as_f64()).unwrap_or(0.0) as f32,
                        resolution: crate::commands::p2p::VideoResolution {
                            width: video.get("resolution").and_then(|r| r.get("width")).and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                            height: video.get("resolution").and_then(|r| r.get("height")).and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                        },
                    })
                } else {
                    None
                };

                return Ok(crate::commands::p2p::MediaStats {
                    audio: audio_stats,
                    video: video_stats,
                });
            }
        }


        Err(anyhow::anyhow!("❌ Connection session not found. The P2P connection may have been closed. Please try reconnecting."))
    }

    pub async fn configure_media_quality(&self, session_id: String, quality_preset: String) -> Result<()> {
        log::info!("Configuring media quality for session: {}", session_id);
        
        let mut connections = self.connections.lock().await;
        
        for (key, connection) in connections.iter() {
            if key == &session_id || key.contains(&session_id) {
                return connection.configure_media_quality(quality_preset).await;
            }
        }


        Err(anyhow::anyhow!("❌ Connection session not found. The P2P connection may have been closed. Please try reconnecting."))
    }

    pub async fn get_media_sessions(&self) -> Vec<String> {
        log::debug!("Getting media sessions");
        
        let connections = self.connections.lock().await;
        
        // Return all session IDs that have media capabilities
        // For now, assume all connections support media
        connections.keys().cloned().collect()
    }

    pub async fn close_media_session(&self, session_id: String) -> Result<()> {
        log::info!("Closing media session: {}", session_id);
        
        // For now, this is the same as closing the regular session
        // In a full implementation, you might want to specifically close media tracks
        self.close_session(session_id).await
    }

    pub async fn send_media_signal(&self, session_id: String, signal_type: String, signal_data: serde_json::Value) -> Result<()> {
        log::debug!("Sending media signal for session: {}", session_id);
        
        let connections = self.connections.lock().await;
        
        for (key, connection) in connections.iter() {
            if key == &session_id || key.contains(&session_id) {
                // Create media signal message
                let signal_message = serde_json::json!({
                    "type": signal_type,
                    "data": signal_data
                });
                
                let message_bytes = signal_message.to_string().into_bytes();
                return connection.send_data(message_bytes).await;
            }
        }


        Err(anyhow::anyhow!("❌ Connection session not found. The P2P connection may have been closed. Please try reconnecting."))
    }

    pub async fn handle_media_signal(&self, session_id: String, signal_type: String, signal_data: serde_json::Value, from_user_id: String) -> Result<()> {
        log::debug!("Handling media signal for session: {}", session_id);

        let mut connections = self.connections.lock().await;

        for (key, connection) in connections.iter_mut() {
            if key == &session_id || key.contains(&session_id) {
                return connection.handle_media_signal(signal_type, signal_data, from_user_id).await;
            }
        }

        Err(anyhow::anyhow!("Session not found: {}", session_id))
    }

    // ============================================================================
    // Process-Specific Guest Connection Methods
    // ============================================================================

    /// Connect to a specific process as a guest
    /// This establishes a P2P connection and sets up local port forwarding
    pub async fn connect_to_process(
        &self,
        grid_id: String,
        process_id: String,
        local_port: Option<u16>,
    ) -> Result<ProcessConnectionInfo> {
        log::info!(
            "Connecting to process {} in grid {} (local port: {:?})",
            process_id,
            grid_id,
            local_port
        );

        // First, get process availability from backend
        let session = get_user_session().await?;
        let token = session
            .ok_or_else(|| anyhow::anyhow!("No active session"))?
            .token;

        // Call backend to get process availability
        let response = self
            .api_client
            .get_process_availability(&token, &grid_id, &process_id)
            .await?;

        // Check if process is connectable
        if !response.get("is_connectable").and_then(|v| v.as_bool()).unwrap_or(false) {
            return Err(anyhow::anyhow!("⚠️ This process is not available for connection. It may be stopped or not configured for sharing."));
        }

        let host_user_id = response
            .get("host_user_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("No host user ID"))?
            .to_string();

        // Connect to the grid host if not already connected
        let grid_connection_exists = {
            let connections = self.connections.lock().await;
            connections.contains_key(&grid_id)
        };

        if !grid_connection_exists {
            log::info!("No existing grid connection, connecting to host...");
            self.connect_to_grid_host(grid_id.clone(), host_user_id.clone()).await?;
        }

        // Register connection with backend
        let connect_response = self
            .api_client
            .connect_to_process(&token, &grid_id, &process_id, local_port)
            .await?;

        let connection_id = connect_response
            .get("connection_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("No connection ID in response"))?
            .to_string();

        let actual_local_port = local_port.or_else(|| {
            connect_response
                .get("local_port")
                .and_then(|v| v.as_u64())
                .map(|p| p as u16)
        });

        // Start transport tunnel for port forwarding
        // Get process details to determine port and type
        let shared_processes_response = self
            .api_client
            .get_grid_shared_processes(&token, &grid_id)
            .await?;

        let process_data = shared_processes_response
            .processes
            .iter()
            .find(|p| p.id == process_id)
            .ok_or_else(|| anyhow::anyhow!("Process not found in grid"))?;

        let target_port = process_data.config.port as u16;
        let process_name = process_data.config.name.clone();

        // Create transport config
        let transport_config = crate::transport::TransportConfig {
            transport_type: crate::transport::TransportType::Tcp {
                target_port,
                protocol: "tcp".to_string(), // Could be improved to detect actual protocol
            },
            local_port: actual_local_port,
            grid_id: grid_id.clone(),
            process_id: process_id.clone(),
        };

        // Add transport to the P2P connection
        let transport_id = self.add_transport_to_connection(grid_id.clone(), transport_config).await?;
        log::info!("Transport tunnel started: {}", transport_id);

        // Emit connection event
        self.app_handle
            .emit(
                "process_connected",
                &serde_json::json!({
                    "grid_id": grid_id,
                    "process_id": process_id,
                    "connection_id": connection_id,
                    "local_port": actual_local_port,
                    "host_user_id": host_user_id,
                    "transport_id": transport_id,
                }),
            )
            .ok();

        Ok(ProcessConnectionInfo {
            connection_id,
            grid_id,
            process_id,
            local_port: actual_local_port,
            host_user_id,
        })
    }

    /// Disconnect from a process
    pub async fn disconnect_from_process(
        &self,
        grid_id: String,
        process_id: String,
        connection_id: String,
    ) -> Result<()> {
        log::info!(
            "Disconnecting from process {} in grid {}",
            process_id,
            grid_id
        );

        // Cancel any ongoing reconnection attempts
        self.cancel_reconnection(&grid_id).await?;

        // Remove P2P connection
        {
            let mut connections = self.connections.lock().await;
            connections.remove(&grid_id);
            // Also try to find and remove by prefix
            let keys_to_remove: Vec<String> = connections.keys()
                .filter(|k| k.starts_with(&format!("{}:", grid_id)))
                .cloned()
                .collect();
            for key in keys_to_remove {
                connections.remove(&key);
            }
        }

        // Call backend to disconnect
        let session = get_user_session().await?;
        let token = session
            .ok_or_else(|| anyhow::anyhow!("No active session"))?
            .token;

        self.api_client
            .disconnect_from_process(&token, &grid_id, &process_id, &connection_id)
            .await?;

        // Emit disconnection event
        self.app_handle
            .emit(
                "process_disconnected",
                &serde_json::json!({
                    "grid_id": grid_id,
                    "process_id": process_id,
                    "connection_id": connection_id,
                }),
            )
            .ok();

        log::info!("Successfully disconnected from process {}", process_id);
        Ok(())
    }

    /// Get process availability status
    pub async fn get_process_availability(
        &self,
        grid_id: String,
        process_id: String,
    ) -> Result<serde_json::Value> {
        let session = get_user_session().await?;
        let token = session
            .ok_or_else(|| anyhow::anyhow!("No active session"))?
            .token;

        self.api_client
            .get_process_availability(&token, &grid_id, &process_id)
            .await
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProcessConnectionInfo {
    pub connection_id: String,
    pub grid_id: String,
    pub process_id: String,
    pub local_port: Option<u16>,
    pub host_user_id: String,
}