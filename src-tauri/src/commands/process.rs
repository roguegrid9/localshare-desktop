use crate::process::{ProcessManager};
use crate::process::types::{ProcessConfig, ProcessStatus, ProcessInfo, SimpleProcessConfig, SharedProcess, SharedProcessStatus};
use crate::AppState;
use tauri::State;
use std::time::{SystemTime, UNIX_EPOCH};

// Initialize process manager
#[tauri::command]
pub async fn initialize_process_manager(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: initialize_process_manager called");
    
    // Check if already initialized - PREVENT MULTIPLE INSTANCES
    {
        let manager_state = state.process_manager.lock().await;
        if manager_state.is_some() {
            log::info!("ProcessManager already initialized, reusing existing instance");
            return Ok(());
        }
    }
    
    let process_manager = ProcessManager::new(app_handle);
    let mut manager_state = state.process_manager.lock().await;
    *manager_state = Some(process_manager);
    
    log::info!("Process manager initialized successfully (new instance created)");
    Ok(())
}
// Start a process for a grid
#[tauri::command]
pub async fn start_process(
    grid_id: String,
    config: ProcessConfig,
    state: State<'_, AppState>,
) -> Result<String, String> {
    log::info!("Tauri command: start_process called for grid: {}", grid_id);
    
    // Validate config
    if let Err(e) = config.validate() {
        return Err(e);
    }
    
    let manager_state = state.process_manager.lock().await;
    if let Some(manager) = manager_state.as_ref() {
        manager.start_process(grid_id, config).await.map_err(|e| {
            log::error!("Failed to start process: {}", e);
            e.to_string()
        })
    } else {
        Err("Process manager not initialized".to_string())
    }
}

// Start a process and automatically host the grid
#[tauri::command]
pub async fn start_grid_process(
    grid_id: String,
    config: ProcessConfig,
    state: State<'_, AppState>,
) -> Result<String, String> {
    log::info!("Tauri command: start_grid_process called for grid: {}", grid_id);
    
    // Validate config
    if let Err(e) = config.validate() {
        return Err(e);
    }
    
    // First, claim host status for the grid
    {
        let p2p_state = state.p2p_manager.lock().await;
        if let Some(p2p_manager) = p2p_state.as_ref() {
            if let Err(e) = p2p_manager.join_grid_session(grid_id.clone()).await {
                log::error!("Failed to claim grid host status: {}", e);
                return Err(format!("Failed to claim grid host status: {}", e));
            }
        } else {
            return Err("P2P service not initialized".to_string());
        }
    }
    
    // Then start the process
    let manager_state = state.process_manager.lock().await;
    if let Some(manager) = manager_state.as_ref() {
        manager.start_process(grid_id, config).await.map_err(|e| {
            log::error!("Failed to start process: {}", e);
            e.to_string()
        })
    } else {
        Err("Process manager not initialized".to_string())
    }
}

// Stop process and release grid host
#[tauri::command]
pub async fn stop_grid_process(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: stop_grid_process called for grid: {}", grid_id);

    // Get the process_id before stopping (we need it to close tabs)
    let process_id = {
        let manager_state = state.process_manager.lock().await;
        if let Some(manager) = manager_state.as_ref() {
            // Try to find the process ID for this grid
            let processes = manager.get_all_processes_including_terminals().await;
            processes.iter()
                .find(|p| p.grid_id == grid_id)
                .map(|p| p.process_id.clone())
        } else {
            None
        }
    };

    // Stop the process first
    {
        let manager_state = state.process_manager.lock().await;
        if let Some(manager) = manager_state.as_ref() {
            if let Err(e) = manager.stop_process(grid_id.clone()).await {
                log::error!("Failed to stop process: {}", e);
                return Err(e.to_string());
            }
        } else {
            return Err("Process manager not initialized".to_string());
        }
    }

    // Then release grid host status
    {
        let p2p_state = state.p2p_manager.lock().await;
        if let Some(p2p_manager) = p2p_state.as_ref() {
            if let Err(e) = p2p_manager.release_grid_host(grid_id).await {
                log::error!("Failed to release grid host: {}", e);
                // Don't return error here as process was already stopped
                log::warn!("Process stopped but failed to release host status");
            }
        }
    }

    // Close all tabs associated with this process (non-blocking)
    if let Some(pid) = process_id {
        let window_manager_clone = state.window_manager.clone();
        let pid_clone = pid.clone();
        tokio::spawn(async move {
            let window_manager = window_manager_clone.lock().await;
            if let Some(manager) = window_manager.as_ref() {
                match manager.close_tabs_by_process(&pid_clone).await {
                    Ok(closed_tabs) => {
                        log::info!("Closed {} tabs for stopped grid process {}", closed_tabs.len(), pid_clone);
                    }
                    Err(e) => {
                        log::warn!("Failed to close tabs for process {}: {}", pid_clone, e);
                    }
                }
            }
        });
    }

    log::info!("stop_process command completing successfully");
    Ok(())
}

// Command to send data to a grid's process via P2P
#[tauri::command]
pub async fn send_grid_process_data(
    grid_id: String,
    data: Vec<u8>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::debug!("Tauri command: send_grid_process_data called for grid: {}", grid_id);
    
    let p2p_state = state.p2p_manager.lock().await;
    if let Some(p2p_manager) = p2p_state.as_ref() {
        // Send data via the P2P connection (will route to process if we're connected to host)
        p2p_manager.send_data(grid_id, data).await.map_err(|e| {
            log::error!("Failed to send data to grid process: {}", e);
            e.to_string()
        })
    } else {
        Err("P2P service not initialized".to_string())
    }
}

// Stop a process for a grid
#[tauri::command]
pub async fn stop_process(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: stop_process called for grid: {}", grid_id);

    // Get the process_id before stopping (we need it to close tabs)
    let process_id = {
        let manager_state = state.process_manager.lock().await;
        if let Some(manager) = manager_state.as_ref() {
            // Try to find the process ID for this grid
            let processes = manager.get_all_processes_including_terminals().await;
            processes.iter()
                .find(|p| p.grid_id == grid_id)
                .map(|p| p.process_id.clone())
        } else {
            None
        }
    };

    // Stop the process
    let manager_state = state.process_manager.lock().await;
    if let Some(manager) = manager_state.as_ref() {
        manager.stop_process(grid_id).await.map_err(|e| {
            log::error!("Failed to stop process: {}", e);
            e.to_string()
        })?;
    } else {
        return Err("Process manager not initialized".to_string());
    }

    // Close all tabs associated with this process (non-blocking)
    if let Some(pid) = process_id {
        let window_manager_clone = state.window_manager.clone();
        let pid_clone = pid.clone();
        tokio::spawn(async move {
            let window_manager = window_manager_clone.lock().await;
            if let Some(manager) = window_manager.as_ref() {
                match manager.close_tabs_by_process(&pid_clone).await {
                    Ok(closed_tabs) => {
                        log::info!("Closed {} tabs for stopped process {}", closed_tabs.len(), pid_clone);
                    }
                    Err(e) => {
                        log::warn!("Failed to close tabs for process {}: {}", pid_clone, e);
                    }
                }
            }
        });
    }

    log::info!("stop_grid_process command completing successfully");
    Ok(())
}

// Get process status for a grid
#[tauri::command]
pub async fn get_process_status(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<ProcessStatus, String> {
    log::info!("Tauri command: get_process_status called for grid: {}", grid_id);
    
    let manager_state = state.process_manager.lock().await;
    if let Some(manager) = manager_state.as_ref() {
        manager.get_process_status(grid_id).await.map_err(|e| {
            log::error!("Failed to get process status: {}", e);
            e.to_string()
        })
    } else {
        Err("Process manager not initialized".to_string())
    }
}

// Send input to a process
#[tauri::command]
pub async fn send_process_input(
    grid_id: String,
    input: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::debug!("Tauri command: send_process_input called for grid: {}", grid_id);
    
    let manager_state = state.process_manager.lock().await;
    if let Some(manager) = manager_state.as_ref() {
        // Convert string to bytes (add newline for commands)
        let mut input_bytes = input.into_bytes();
        input_bytes.push(b'\n');
        
        manager.send_process_input(grid_id, input_bytes).await.map_err(|e| {
            log::error!("Failed to send process input: {}", e);
            e.to_string()
        })
    } else {
        Err("Process manager not initialized".to_string())
    }
}

// Get list of active processes
#[tauri::command]
pub async fn get_active_processes(
    state: State<'_, AppState>,
) -> Result<Vec<ProcessInfo>, String> {
    log::info!("Tauri command: get_active_processes called");
    
    let manager_state = state.process_manager.lock().await;
    if let Some(manager) = manager_state.as_ref() {
        // CHANGE: Use get_all_processes_including_terminals instead of get_active_processes
        Ok(manager.get_all_processes_including_terminals().await)
    } else {
        Err("Process manager not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_process_session_id(
    process_id: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    log::info!("Getting session ID for process: {}", process_id);
    
    let manager_state = state.process_manager.lock().await;
    if let Some(manager) = manager_state.as_ref() {
        // FIRST: Try the new direct lookup method
        if let Some(session_id) = manager.get_terminal_session_id_by_process_id(&process_id).await {
            log::info!("Found session ID for process {} via direct lookup: {}", process_id, session_id);
            return Ok(Some(session_id));
        }
        
        log::info!("No session ID found via direct lookup, trying fallback method");
        
        // FALLBACK: Try the old method for backwards compatibility
        let all_processes = manager.get_all_processes_including_terminals().await;
        
        log::info!("Found {} active processes", all_processes.len());
        
        for process in all_processes {
            log::info!("Checking process: {} (looking for: {})", process.process_id, process_id);
            
            if process.process_id == process_id {
                log::info!("Found matching process! Config: {:?}", process.config);
                
                // For recovered terminals, try to extract session ID from the config
                if process.config.executable_path.starts_with("Recovered Terminal (") {
                    // Extract the session ID from the ProcessManager directly
                    if let Some(session_id) = manager.get_terminal_session_id_by_process_id(&process_id).await {
                        log::info!("Extracted session ID from ProcessManager: {}", session_id);
                        return Ok(Some(session_id));
                    }
                }
                
                // Use the existing bridge function to extract session ID
                let session_id = crate::process::terminal_process::TerminalProcessBridge::extract_session_id_from_process(&process.config);
                log::info!("Extracted session ID via bridge: {:?}", session_id);
                
                return Ok(session_id);
            }
        }
        
        log::warn!("No matching process found for ID: {}", process_id);
        Ok(None)
    } else {
        Err("Process manager not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_process_info(
    process_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    log::info!("Getting process info for: {}", process_id);
    
    let manager_state = state.process_manager.lock().await;
    if let Some(manager) = manager_state.as_ref() {
        let all_processes = manager.get_all_processes_including_terminals().await;
        
        for process in all_processes {
            if process.process_id == process_id {
                log::info!("Found process: {} with executable_path: {}", process_id, process.config.executable_path);
                return Ok(serde_json::json!({
                    "process_id": process.process_id,
                    "grid_id": process.grid_id,
                    "config": {
                        "executable_path": process.config.executable_path,
                        "args": process.config.args,
                        "env_vars": process.config.env_vars,
                        "working_directory": process.config.working_directory
                    },
                    "status": process.status,
                    "created_at": process.created_at
                }));
            }
        }

        log::debug!("Process not found in local ProcessManager: {} (may be a shared process)", process_id);
        Err(format!("Process not found locally: {}", process_id))
    } else {
        Err("Process manager not initialized".to_string())
    }
}

// Create a shared process with simplified configuration
#[tauri::command]
pub async fn create_shared_process(
    grid_id: String,
    config: SimpleProcessConfig,
    state: State<'_, AppState>,
) -> Result<String, String> {
    use crate::api::types::CreateSharedProcessRequest;
    use crate::api::client::CoordinatorClient;
    use crate::auth::storage::get_user_session;
    
    log::info!("Tauri command: create_shared_process called for grid: {}", grid_id);

    // Get the authentication token
    let session = match get_user_session().await {
        Ok(Some(session)) => session,
        Ok(None) => return Err("No user session available. Please log in again.".to_string()),
        Err(e) => return Err(format!("Failed to get user session: {}", e)),
    };

    // Validate token hasn't expired
    let jwt_claims = match crate::auth::parse_jwt_claims(&session.token) {
        Ok(claims) => claims,
        Err(e) => return Err(format!("Invalid authentication token: {}. Please log in again.", e)),
    };

    if crate::auth::is_token_expired(jwt_claims.exp) {
        return Err("Authentication token has expired. Please log in again.".to_string());
    }

    let token = session.token;

    // Get device ID to identify which computer owns this process
    let device_id = match crate::auth::storage::get_device_id().await {
        Ok(id) => id,
        Err(e) => return Err(format!("Failed to get device ID: {}", e)),
    };

    // Create coordinator client
    let coordinator_client = CoordinatorClient::new();

    // Set the token in the client
    {
        let mut client_token = coordinator_client.token.write().await;
        *client_token = token.clone();
    }

    // Create API request with device_id and traffic detection
    let api_request = CreateSharedProcessRequest {
        name: config.name.clone(),
        description: config.description.clone(),
        pid: config.pid as i32,
        port: config.port as i32,
        command: config.command.clone(),
        working_dir: config.working_dir.clone(),
        executable_path: config.executable_path.clone(),
        process_name: config.process_name.clone(),
        device_id: device_id.clone(),
        service_type: config.service_type.clone(),
        protocol: config.protocol.clone(),
    };
    
    // Call the backend API to create the shared process
    let api_response = coordinator_client
        .create_shared_process(&token, &grid_id, api_request)
        .await
        .map_err(|e| format!("Failed to create shared process via API: {}", e))?;
    
    // Get current timestamp for local storage
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Failed to get timestamp: {}", e))?
        .as_secs();
    
    // Create local shared process record
    let shared_process = SharedProcess {
        id: api_response.id.clone(),
        grid_id: grid_id.clone(),
        user_id: api_response.process.user_id.clone(),
        device_id: device_id.clone(),
        config: config.clone(),
        status: SharedProcessStatus::Running,
        last_seen_at: Some(now),
        created_at: now,
        updated_at: now,
    };
    
    // Store the shared process in app state
    {
        let mut shared_processes = state.shared_processes.lock().await;
        shared_processes.insert(api_response.id.clone(), shared_process.clone());
    }
    
    // Start P2P sharing for the process
    if let Err(e) = start_p2p_sharing(api_response.id.clone(), state.clone()).await {
        log::warn!("Failed to start P2P sharing for process {}: {}", api_response.id, e);
        // Don't fail the entire operation if P2P sharing fails
    }

    // Start heartbeat for the process
    if let Err(e) = start_process_heartbeat(api_response.id.clone(), grid_id.clone(), state.clone()).await {
        log::error!("Failed to start heartbeat for process {}: {}", api_response.id, e);
        // Don't fail if heartbeat fails, but this is concerning
    }

    log::info!("Successfully created shared process: {} for grid: {}", api_response.id, grid_id);

    Ok(api_response.id)
}

// Check if a process is running on a port and get its current PID
#[derive(serde::Serialize)]
pub struct ProcessHealthStatus {
    pub healthy: bool,
    pub current_pid: Option<u32>,
}

#[tauri::command]
pub async fn check_process_health(
    port: u16,
) -> Result<ProcessHealthStatus, String> {
    log::info!("Checking process health on port {}", port);

    #[cfg(target_os = "windows")]
    {
        // Use netstat on Windows
        let output = std::process::Command::new("netstat")
            .args(&["-ano"])
            .output()
            .map_err(|e| format!("Failed to run netstat command: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);

        // Parse output to find PID
        // Format: TCP    0.0.0.0:8000           0.0.0.0:0              LISTENING       12345
        for line in stdout.lines() {
            if line.contains("LISTENING") && line.contains(&format!(":{}", port)) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                // The PID is the last column
                if let Some(pid_str) = parts.last() {
                    if let Ok(pid) = pid_str.parse::<u32>() {
                        log::info!("Port {} is listening, PID: {}", port, pid);
                        return Ok(ProcessHealthStatus {
                            healthy: true,
                            current_pid: Some(pid),
                        });
                    }
                }

                // Port is listening but couldn't extract PID
                log::warn!("Port {} is listening but couldn't extract PID", port);
                return Ok(ProcessHealthStatus {
                    healthy: true,
                    current_pid: None,
                });
            }
        }

        log::info!("Port {} not listening", port);
        Ok(ProcessHealthStatus {
            healthy: false,
            current_pid: None,
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Use ss on Linux/Unix
        let output = std::process::Command::new("ss")
            .args(&["-tlnp", &format!("sport = :{}", port)])
            .output()
            .map_err(|e| format!("Failed to run ss command: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);

        // Parse output to find PID
        // Format: LISTEN 0 128 *:25565 *:* users:(("java",pid=123456,fd=42))
        for line in stdout.lines() {
            if line.contains(&format!(":{}", port)) {
                // Extract PID from users:(("processname",pid=XXXXX,fd=YY))
                if let Some(users_part) = line.split("users:((").nth(1) {
                    if let Some(pid_part) = users_part.split("pid=").nth(1) {
                        if let Some(pid_str) = pid_part.split(',').next() {
                            if let Ok(pid) = pid_str.parse::<u32>() {
                                log::info!("Port {} is listening, PID: {}", port, pid);
                                return Ok(ProcessHealthStatus {
                                    healthy: true,
                                    current_pid: Some(pid),
                                });
                            }
                        }
                    }
                }

                // Port is listening but couldn't extract PID (maybe permission issue)
                log::warn!("Port {} is listening but couldn't extract PID", port);
                return Ok(ProcessHealthStatus {
                    healthy: true,
                    current_pid: None,
                });
            }
        }

        log::info!("Port {} not listening", port);
        Ok(ProcessHealthStatus {
            healthy: false,
            current_pid: None,
        })
    }
}

// Get all shared processes for a grid
#[tauri::command]
pub async fn get_grid_shared_processes(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<SharedProcess>, String> {
    log::info!("Tauri command: get_grid_shared_processes called for grid: {}", grid_id);
    
    // Get user session for authentication
    let token = match crate::auth::get_user_session().await {
        Ok(Some(session)) => session.token,
        Ok(None) => return Err("No user session available".to_string()),
        Err(e) => return Err(format!("Failed to get user session: {}", e)),
    };
    
    // Create coordinator client
    let coordinator_client = crate::api::client::CoordinatorClient::new();
    
    // Set the token in the client
    {
        let mut client_token = coordinator_client.token.write().await;
        *client_token = token.clone();
    }
    
    match coordinator_client.get_grid_shared_processes(&token, &grid_id).await {
        Ok(api_response) => {
            log::info!("Successfully fetched {} shared processes from API for grid: {}", api_response.processes.len(), grid_id);
            
            // Convert API response to SharedProcess format and update local state
            let mut shared_processes = state.shared_processes.lock().await;
            let mut result = Vec::new();
            
            for api_process in api_response.processes {
                let shared_process = SharedProcess {
                    id: api_process.id.clone(),
                    grid_id: api_process.grid_id.clone(),
                    user_id: api_process.user_id.clone(),
                    device_id: api_process.device_id.clone(),
                    config: SimpleProcessConfig {
                        name: api_process.config.name,
                        description: api_process.config.description,
                        pid: api_process.config.pid as u32,
                        port: api_process.config.port as u16,
                        command: api_process.config.command,
                        working_dir: api_process.config.working_dir,
                        executable_path: api_process.config.executable_path,
                        process_name: api_process.config.process_name,
                        service_type: api_process.config.service_type,
                        protocol: api_process.config.protocol,
                    },
                    status: match api_process.status.as_str() {
                        "running" => SharedProcessStatus::Running,
                        "stopped" => SharedProcessStatus::Stopped,
                        "error" => SharedProcessStatus::Error,
                        _ => SharedProcessStatus::Running,
                    },
                    last_seen_at: api_process.last_seen_at.and_then(|ts| {
                        use chrono::{DateTime, Utc};
                        log::debug!("Parsing last_seen_at: {}", ts);
                        DateTime::parse_from_rfc3339(&ts)
                            .ok()
                            .map(|dt| dt.timestamp() as u64)
                    }),
                    created_at: {
                        use chrono::{DateTime, Utc};
                        log::debug!("Parsing created_at: {}", api_process.created_at);
                        DateTime::parse_from_rfc3339(&api_process.created_at)
                            .map(|dt| dt.timestamp() as u64)
                            .unwrap_or_else(|e| {
                                log::warn!("Failed to parse created_at '{}': {}", api_process.created_at, e);
                                0
                            })
                    },
                    updated_at: {
                        use chrono::{DateTime, Utc};
                        log::debug!("Parsing updated_at: {}", api_process.updated_at);
                        DateTime::parse_from_rfc3339(&api_process.updated_at)
                            .map(|dt| dt.timestamp() as u64)
                            .unwrap_or_else(|e| {
                                log::warn!("Failed to parse updated_at '{}': {}", api_process.updated_at, e);
                                0
                            })
                    },
                };
                
                // Update local state cache
                shared_processes.insert(shared_process.id.clone(), shared_process.clone());
                result.push(shared_process);
            }
            
            Ok(result)
        },
        Err(e) => {
            log::error!("Failed to fetch shared processes from API: {}", e);
            
            // Fallback to local state if API fails
            log::info!("Falling back to local state for shared processes");
            let shared_processes = state.shared_processes.lock().await;
            let grid_processes: Vec<SharedProcess> = shared_processes
                .values()
                .filter(|p| p.grid_id == grid_id)
                .cloned()
                .collect();
            
            Ok(grid_processes)
        }
    }
}

// ===== HEARTBEAT HELPER FUNCTIONS =====

/// Start a heartbeat task for a shared process
async fn start_process_heartbeat(
    process_id: String,
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("🫀 Starting heartbeat for shared process {} in grid {}", process_id, grid_id);

    let process_id_clone = process_id.clone();
    let grid_id_clone = grid_id.clone();

    let task = tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));
        let mut heartbeat_count = 0u32;

        loop {
            interval.tick().await;
            heartbeat_count += 1;

            match send_process_heartbeat(&process_id_clone, &grid_id_clone).await {
                Ok(_) => {
                    // Log every 10th heartbeat (every 5 minutes)
                    if heartbeat_count % 10 == 0 {
                        log::info!("🫀 Shared process heartbeat #{} sent for process {}", heartbeat_count, &process_id_clone);
                    }
                }
                Err(e) => {
                    log::error!("❌ Shared process heartbeat #{} FAILED for process {}: {}", heartbeat_count, &process_id_clone, e);
                }
            }
        }
    });

    let mut heartbeats = state.shared_process_heartbeats.lock().await;
    heartbeats.insert(process_id.clone(), task);
    log::info!("✅ Heartbeat task started for shared process: {}", process_id);

    Ok(())
}

/// Stop a heartbeat task for a shared process
async fn stop_process_heartbeat(
    process_id: &str,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("🛑 Stopping heartbeat for shared process {}", process_id);

    let mut heartbeats = state.shared_process_heartbeats.lock().await;
    if let Some(task) = heartbeats.remove(process_id) {
        task.abort();
        log::info!("✅ Heartbeat task stopped for shared process: {}", process_id);
    }

    Ok(())
}

/// Update device_id for a process (for adopting legacy processes)
async fn update_process_device_id(token: &str, grid_id: &str, process_id: &str, device_id: &str) -> Result<(), String> {
    use crate::api::client::{CoordinatorClient, COORDINATOR_BASE_URL};

    let client = CoordinatorClient::new();
    let url = format!("{}/api/grids/{}/shared-processes/{}/device", COORDINATOR_BASE_URL, grid_id, process_id);

    let body = serde_json::json!({
        "device_id": device_id
    });

    let response = client.client
        .patch(&url)
        .header("Authorization", format!("Bearer {}", token))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to update device_id: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Failed to update device_id: {}", response.status()));
    }

    Ok(())
}

/// Send a single heartbeat for a shared process
async fn send_process_heartbeat(process_id: &str, grid_id: &str) -> Result<(), String> {
    use crate::auth::storage::get_user_session;
    use crate::api::client::CoordinatorClient;

    let session = get_user_session().await
        .map_err(|e| format!("Failed to get user session: {}", e))?;

    let token = session
        .ok_or_else(|| "No active session".to_string())?
        .token;

    let client = CoordinatorClient::new();
    client.send_process_heartbeat(&token, grid_id.to_string(), process_id.to_string())
        .await
        .map_err(|e| format!("Failed to send heartbeat: {}", e))?;

    Ok(())
}

/// Resume heartbeats for all active shared processes (called after authentication)
#[tauri::command]
pub async fn resume_heartbeats_after_auth(
    state: State<'_, AppState>,
) -> Result<(), String> {
    resume_all_shared_process_heartbeats(state).await
}

/// Internal resume function for all active shared processes
async fn resume_all_shared_process_heartbeats(
    state: State<'_, AppState>,
) -> Result<(), String> {
    use crate::auth::storage::get_user_session;
    use crate::api::client::CoordinatorClient;

    log::info!("🔄 Resuming heartbeats for all shared processes...");

    // Get user session
    let session = match get_user_session().await {
        Ok(Some(session)) => session,
        Ok(None) => {
            log::info!("No user session found, skipping heartbeat resumption");
            return Ok(());
        }
        Err(e) => {
            log::error!("Failed to get user session: {}", e);
            return Ok(());
        }
    };

    // Fetch all grids from API
    let client = CoordinatorClient::new();
    let grids = match client.get_my_grids(&session.token).await {
        Ok(response) => response.grids,
        Err(e) => {
            log::error!("Failed to fetch grids for heartbeat resumption: {}", e);
            return Ok(());
        }
    };

    log::info!("Fetched {} grids to check for shared processes", grids.len());

    // Get THIS device's ID to filter processes
    let my_device_id = match crate::auth::storage::get_device_id().await {
        Ok(id) => id,
        Err(e) => {
            log::error!("Failed to get device ID for heartbeat resumption: {}", e);
            return Ok(());
        }
    };

    let mut total_processes = 0;

    // For each grid, fetch shared processes and resume heartbeats
    for grid in grids {
        match client.get_grid_shared_processes(&session.token, &grid.id).await {
            Ok(response) => {
                log::info!("Grid {} has {} shared processes", grid.id, response.processes.len());

                for process in response.processes {
                    // Check if this user owns the process
                    if process.user_id != session.user_id {
                        continue; // Not our user, skip
                    }

                    // Check device ownership
                    let should_resume = if process.device_id == my_device_id {
                        // Exact match - this is our process
                        log::info!("Resuming heartbeat for owned process {} in grid {} (device: {})",
                                   process.id, grid.id, &my_device_id[..8]);
                        true
                    } else if process.device_id.is_empty() || process.device_id.starts_with("migration-") {
                        // Legacy process without device_id or migration placeholder - adopt it
                        log::info!("Adopting legacy process {} in grid {} (old device_id: {:?}, new device_id: {})",
                                   process.id, grid.id, &process.device_id, &my_device_id[..8]);

                        // Update the device_id in the database
                        if let Err(e) = update_process_device_id(&session.token, &grid.id, &process.id, &my_device_id).await {
                            log::error!("Failed to update device_id for process {}: {}", process.id, e);
                        }
                        true
                    } else if let Some(last_seen) = &process.last_seen_at {
                        // Check if process was recently active (within last 10 minutes)
                        // This handles device_id changes due to app restarts or storage issues
                        if let Ok(last_seen_time) = chrono::DateTime::parse_from_rfc3339(last_seen) {
                            let now = chrono::Utc::now();
                            let age = now.signed_duration_since(last_seen_time.with_timezone(&chrono::Utc));

                            if age.num_minutes() < 10 {
                                log::info!("Adopting recently active process {} in grid {} (age: {} minutes, old device: {}, new device: {})",
                                           process.id, grid.id, age.num_minutes(), &process.device_id[..8], &my_device_id[..8]);

                                // Update the device_id in the database
                                if let Err(e) = update_process_device_id(&session.token, &grid.id, &process.id, &my_device_id).await {
                                    log::error!("Failed to update device_id for process {}: {}", process.id, e);
                                }
                                true
                            } else {
                                // Too old - likely belongs to another machine
                                log::debug!("Skipping old process {} - last seen {} minutes ago (theirs: {}, ours: {})",
                                           process.id, age.num_minutes(), &process.device_id[..8], &my_device_id[..8]);
                                false
                            }
                        } else {
                            log::warn!("Failed to parse last_seen_at for process {}: {}", process.id, last_seen);
                            false
                        }
                    } else {
                        // Different device_id and no last_seen - belongs to another machine
                        log::debug!("Skipping process {} - belongs to different device (theirs: {}, ours: {})",
                                   process.id, &process.device_id[..8], &my_device_id[..8]);
                        false
                    };

                    if should_resume {
                        total_processes += 1;

                        // Convert SharedProcessData to SharedProcess
                        let shared_process = SharedProcess {
                            id: process.id.clone(),
                            grid_id: grid.id.clone(),
                            user_id: process.user_id.clone(),
                            device_id: process.device_id.clone(),
                            config: SimpleProcessConfig {
                                name: process.config.name.clone(),
                                description: process.config.description.clone(),
                                pid: process.config.pid as u32,
                                port: process.config.port as u16,
                                command: process.config.command.clone(),
                                working_dir: process.config.working_dir.clone(),
                                executable_path: process.config.executable_path.clone(),
                                process_name: process.config.process_name.clone(),
                                service_type: process.config.service_type.clone(),
                                protocol: process.config.protocol.clone(),
                            },
                            status: match process.status.as_str() {
                                "running" => SharedProcessStatus::Running,
                                "stopped" => SharedProcessStatus::Stopped,
                                _ => SharedProcessStatus::Error,
                            },
                            last_seen_at: process.last_seen_at.and_then(|dt| {
                                use chrono::DateTime;
                                DateTime::parse_from_rfc3339(&dt)
                                    .ok()
                                    .map(|dt| dt.timestamp() as u64)
                            }),
                            created_at: {
                                use chrono::DateTime;
                                DateTime::parse_from_rfc3339(&process.created_at)
                                    .ok()
                                    .map(|dt| dt.timestamp() as u64)
                                    .unwrap_or(0)
                            },
                            updated_at: {
                                use chrono::DateTime;
                                DateTime::parse_from_rfc3339(&process.updated_at)
                                    .ok()
                                    .map(|dt| dt.timestamp() as u64)
                                    .unwrap_or(0)
                            },
                        };

                        {
                            let mut shared_processes = state.shared_processes.lock().await;
                            shared_processes.insert(process.id.clone(), shared_process);
                        }

                        // Start heartbeat
                        if let Err(e) = start_process_heartbeat(process.id.clone(), grid.id.clone(), state.clone()).await {
                            log::error!("Failed to resume heartbeat for process {}: {}", process.id, e);
                        }

                        // Claim grid host to make process connectable
                        {
                            let p2p_state = state.p2p_manager.lock().await;
                            if let Some(p2p_manager) = p2p_state.as_ref() {
                                if let Err(e) = p2p_manager.claim_grid_host(grid.id.clone()).await {
                                    log::error!("Failed to claim grid host {} for resumed process {}: {}", grid.id, process.id, e);
                                } else {
                                    log::info!("Claimed grid host {} for resumed process {}", grid.id, process.id);
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                log::error!("Failed to fetch shared processes for grid {}: {}", grid.id, e);
            }
        }
    }

    log::info!("✅ Shared process heartbeat resumption complete - resumed {} processes", total_processes);
    Ok(())
}

// Start P2P sharing for a process
#[tauri::command]
pub async fn start_p2p_sharing(
    process_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: start_p2p_sharing called for process: {}", process_id);
    
    // Get the shared process
    let shared_process = {
        let shared_processes = state.shared_processes.lock().await;
        shared_processes.get(&process_id).cloned()
    };
    
    if let Some(process) = shared_process {
        // TODO: Implement actual P2P sharing logic
        // For now, just log that we're starting sharing
        log::info!("Starting P2P sharing for process: {} on port: {}", process_id, process.config.port);
        
        // Update last seen timestamp
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| format!("Failed to get timestamp: {}", e))?
            .as_secs();
        
        let mut shared_processes = state.shared_processes.lock().await;
        if let Some(mut process) = shared_processes.get_mut(&process_id) {
            process.last_seen_at = Some(now);
        }
        
        Ok(())
    } else {
        Err(format!("Shared process not found: {}", process_id))
    }
}

// Stop P2P sharing for a process
#[tauri::command]
pub async fn stop_p2p_sharing(
    process_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: stop_p2p_sharing called for process: {}", process_id);
    
    // Update process status to stopped
    {
        let mut shared_processes = state.shared_processes.lock().await;
        if let Some(mut process) = shared_processes.get_mut(&process_id) {
            process.status = SharedProcessStatus::Stopped;
            
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|e| format!("Failed to get timestamp: {}", e))?
                .as_secs();
            process.updated_at = now;
        } else {
            return Err(format!("Shared process not found: {}", process_id));
        }
    }
    
    // TODO: Implement actual P2P sharing stop logic
    log::info!("Stopped P2P sharing for process: {}", process_id);

    // Stop the heartbeat
    if let Err(e) = stop_process_heartbeat(&process_id, state.clone()).await {
        log::error!("Failed to stop heartbeat for process {}: {}", process_id, e);
    }

    Ok(())
}

// ============================================================================
// Host/Guest Process Availability Commands
// ============================================================================

/// Get process availability status (host/guest info)
#[tauri::command]
pub async fn get_process_availability(
    grid_id: String,
    process_id: String,
    state: State<'_, AppState>,
) -> Result<Option<crate::process::types::ProcessAvailability>, String> {
    log::info!("Getting availability for process {} in grid {}", process_id, grid_id);

    let p2p_state = state.p2p_manager.lock().await;
    if let Some(p2p_manager) = p2p_state.as_ref() {
        p2p_manager
            .get_process_availability(grid_id, process_id)
            .await
            .map(|v| serde_json::from_value(v).ok())
            .map_err(|e| e.to_string())
    } else {
        Err("P2P manager not initialized".to_string())
    }
}

/// Connect to a remote process as guest
#[tauri::command]
pub async fn connect_to_process(
    grid_id: String,
    process_id: String,
    local_port: Option<u16>,
    state: State<'_, AppState>,
) -> Result<crate::p2p::ProcessConnectionInfo, String> {
    log::info!(
        "Connecting to process {} in grid {} (local port: {:?})",
        process_id,
        grid_id,
        local_port
    );

    let p2p_state = state.p2p_manager.lock().await;
    if let Some(p2p_manager) = p2p_state.as_ref() {
        p2p_manager
            .connect_to_process(grid_id, process_id, local_port)
            .await
            .map_err(|e| e.to_string())
    } else {
        Err("P2P manager not initialized".to_string())
    }
}

/// Disconnect from a remote process
#[tauri::command]
pub async fn disconnect_from_process(
    grid_id: String,
    process_id: String,
    connection_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!(
        "Disconnecting from process {} in grid {}",
        process_id,
        grid_id
    );

    let p2p_state = state.p2p_manager.lock().await;
    if let Some(p2p_manager) = p2p_state.as_ref() {
        p2p_manager
            .disconnect_from_process(grid_id, process_id, connection_id)
            .await
            .map_err(|e| e.to_string())
    } else {
        Err("P2P manager not initialized".to_string())
    }
}