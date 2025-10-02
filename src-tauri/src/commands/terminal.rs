// src-tauri/src/commands/terminal.rs - CONSOLIDATED VERSION WITHOUT PERSISTENCE
// This replaces terminal.rs, terminal_process_bridge.rs, and process_terminal.rs

use crate::terminal::types::{CreateSessionRequest, TerminalInput, TerminalSessionInfo, SessionHistoryEntry};
use crate::process::types::ProcessConfig;
use crate::AppState;
use anyhow::Result;
use tauri::State;

// ============================================================================
// CORE TERMINAL COMMANDS (from original terminal.rs)
// ============================================================================

#[tauri::command]
pub async fn create_terminal_session(
    request: CreateSessionRequest,
    state: State<'_, AppState>,
) -> Result<String, String> {
    log::info!("Creating terminal session: {:?}", request);

    let terminal_manager = state.terminal_manager.lock().await;
    if let Some(manager) = terminal_manager.as_ref() {
        manager
            .create_session(request)
            .await
            .map_err(|e| {
                log::error!("Failed to create terminal session: {}", e);
                e.to_string()
            })
    } else {
        Err("Terminal manager not initialized".to_string())
    }
}

#[tauri::command]
pub async fn send_terminal_input(
    session_id: String,
    data: Vec<u8>,
    user_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::debug!("Sending input to terminal session: {} ({} bytes)", session_id, data.len());

    let input = TerminalInput {
        session_id,
        user_id,
        data,
        timestamp: chrono::Utc::now(),
    };

    let terminal_manager = state.terminal_manager.lock().await;
    if let Some(manager) = terminal_manager.as_ref() {
        manager
            .send_input(input)
            .await
            .map_err(|e| {
                log::error!("Failed to send terminal input: {}", e);
                e.to_string()
            })
    } else {
        Err("Terminal manager not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_terminal_sessions(
    state: State<'_, AppState>,
) -> Result<Vec<TerminalSessionInfo>, String> {
    let terminal_manager = state.terminal_manager.lock().await;
    if let Some(manager) = terminal_manager.as_ref() {
        Ok(manager.get_all_sessions())
    } else {
        Err("Terminal manager not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_grid_terminal_sessions(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<TerminalSessionInfo>, String> {
    let terminal_manager = state.terminal_manager.lock().await;
    if let Some(manager) = terminal_manager.as_ref() {
        Ok(manager.get_grid_sessions(&grid_id))
    } else {
        Err("Terminal manager not initialized".to_string())
    }
}

#[tauri::command]
pub async fn terminate_terminal_session(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Terminating terminal session: {}", session_id);

    let terminal_manager = state.terminal_manager.lock().await;
    if let Some(manager) = terminal_manager.as_ref() {
        manager
            .terminate_session(&session_id)
            .await
            .map_err(|e| {
                log::error!("Failed to terminate terminal session: {}", e);
                e.to_string()
            })
    } else {
        Err("Terminal manager not initialized".to_string())
    }
}

// ============================================================================
// TERMINAL AS PROCESS COMMANDS (simplified from terminal_process_bridge.rs)
// ============================================================================

#[derive(Debug, serde::Serialize)]
pub struct TerminalProcessResult {
    pub process_id: String,
    pub session_id: String,
    pub grid_id: String,
    pub is_hosting_grid: bool,
}

/// MAIN COMMAND: Create a terminal that's registered as a process
#[tauri::command]
pub async fn create_terminal_as_grid_process(
    grid_id: String,
    shell_type: Option<String>,
    working_directory: Option<String>,
    initial_command: Option<String>,
    process_name: Option<String>,
    auto_host_grid: Option<bool>,
    state: State<'_, AppState>,
) -> Result<TerminalProcessResult, String> {
    log::info!("Creating terminal as grid process for grid: {}", grid_id);

    // Step 1: Create terminal session
    let request = CreateSessionRequest {
        grid_id: Some(grid_id.clone()),
        shell_type: shell_type.clone(),
        working_directory: working_directory.clone(),
        initial_command: initial_command.clone(),
        session_name: process_name.clone(), // Use process_name as session_name
    };

    let session_id = {
        let terminal_manager = state.terminal_manager.lock().await;
        if let Some(manager) = terminal_manager.as_ref() {
            manager
                .create_session(request)
                .await
                .map_err(|e| {
                    log::error!("Failed to create terminal session: {}", e);
                    e.to_string()
                })?
        } else {
            return Err("Terminal manager not initialized".to_string());
        }
    };

    // Step 2: Get the session info to retrieve the generated name
    let session_display_name = {
        let terminal_manager = state.terminal_manager.lock().await;
        if let Some(manager) = terminal_manager.as_ref() {
            match manager.get_session(&session_id) {
                Ok(session) => {
                    let info = session.get_info();
                    info.session_name.unwrap_or_else(|| format!("Terminal {}", &session_id[0..8]))
                }
                Err(_) => format!("Terminal {}", &session_id[0..8])
            }
        } else {
            format!("Terminal {}", &session_id[0..8])
        }
    };

    // Step 3: Register terminal as a process with proper metadata
    log::info!("Step 3: Registering terminal as process with name: {}", session_display_name);
    
    let mut env_vars = std::collections::HashMap::new();
    env_vars.insert("TERMINAL_SESSION_ID".to_string(), session_id.clone());
    env_vars.insert("TERMINAL_NAME".to_string(), session_display_name.clone());
    
    let process_config = ProcessConfig {
        executable_path: "internal_terminal".to_string(),
        args: vec![
            session_id.clone(),
            shell_type.unwrap_or_else(|| "bash".to_string()),
            session_display_name.clone(), // NEW: Include the display name as an arg
        ],
        env_vars, // NEW: Include environment variables with the name
        working_directory: working_directory.unwrap_or_else(|| {
            std::env::current_dir()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string()
        }),
    };

    log::info!("Process config created: executable={}, args={:?}", 
            process_config.executable_path, process_config.args);

    let process_id = {
        let process_manager = state.process_manager.lock().await;
        if let Some(manager) = process_manager.as_ref() {
            log::info!("Process manager found, calling start_process...");
            let result = manager.start_process(grid_id.clone(), process_config).await;
            log::info!("start_process result: {:?}", result);
            result.map_err(|e| {
                log::error!("Failed to register terminal as process: {}", e);
                e.to_string()
            })?
        } else {
            log::error!("Process manager not initialized");
            return Err("Process manager not initialized".to_string());
        }
    };

    log::info!("Terminal registered as process with ID: {}", process_id);

    // Step 4: Optionally start hosting the grid
    if auto_host_grid.unwrap_or(false) {
        let p2p_state = state.p2p_manager.lock().await;
        if let Some(p2p_manager) = p2p_state.as_ref() {
            if let Err(e) = p2p_manager.join_grid_session(grid_id.clone()).await {
                log::warn!("Failed to auto-host grid {}: {}", grid_id, e);
            } else {
                log::info!("Auto-hosting grid: {}", grid_id);
            }
        }
    }

    Ok(TerminalProcessResult {
        process_id,
        session_id,
        grid_id,
        is_hosting_grid: auto_host_grid.unwrap_or(false),
    })
}

/// Send input to a terminal process via grid ID
#[tauri::command]
pub async fn send_terminal_process_input(
    grid_id: String,
    input: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::debug!("Sending input to terminal process for grid: {}", grid_id);

    // Get the terminal session ID for this grid
    let session_id = {
        let process_manager = state.process_manager.lock().await;
        if let Some(manager) = process_manager.as_ref() {
            manager.get_terminal_session_id(&grid_id).await
        } else {
            return Err("Process manager not initialized".to_string());
        }
    };

    if let Some(session_id) = session_id {
        // Send input to the terminal session
        let terminal_input = TerminalInput {
            session_id,
            user_id: Some("grid_user".to_string()),
            data: input.into_bytes(),
            timestamp: chrono::Utc::now(),
        };

        let terminal_manager = state.terminal_manager.lock().await;
        if let Some(manager) = terminal_manager.as_ref() {
            manager
                .send_input(terminal_input)
                .await
                .map_err(|e| {
                    log::error!("Failed to send terminal input: {}", e);
                    e.to_string()
                })
        } else {
            Err("Terminal manager not initialized".to_string())
        }
    } else {
        Err("No terminal process found for grid".to_string())
    }
}

/// Stop a terminal process (terminates both process and session)
#[tauri::command]
pub async fn stop_terminal_process(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Stopping terminal process for grid: {}", grid_id);

    // Stop the process (which should handle terminal cleanup)
    let process_manager = state.process_manager.lock().await;
    if let Some(manager) = process_manager.as_ref() {
        manager
            .stop_process(grid_id)
            .await
            .map_err(|e| {
                log::error!("Failed to stop terminal process: {}", e);
                e.to_string()
            })
    } else {
        Err("Process manager not initialized".to_string())
    }
}

/// Check if a grid has a terminal process
#[tauri::command]
pub async fn grid_has_terminal_process(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let process_manager = state.process_manager.lock().await;
    if let Some(manager) = process_manager.as_ref() {
        Ok(manager.has_terminal_process(&grid_id).await)
    } else {
        Err("Process manager not initialized".to_string())
    }
}

/// Get the terminal session ID for a grid's terminal process
#[tauri::command]
pub async fn get_grid_terminal_session_id(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let process_manager = state.process_manager.lock().await;
    if let Some(manager) = process_manager.as_ref() {
        Ok(manager.get_terminal_session_id(&grid_id).await)
    } else {
        Err("Process manager not initialized".to_string())
    }
}

// ============================================================================
// CONVENIENCE COMMANDS (from various files)
// ============================================================================

#[tauri::command]
pub async fn send_terminal_string(
    session_id: String,
    text: String,
    user_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    send_terminal_input(session_id, text.into_bytes(), user_id, state).await
}

#[tauri::command]
pub async fn send_terminal_command(
    session_id: String,
    command: String,
    user_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let command_with_newline = format!("{}\n", command);
    send_terminal_string(session_id, command_with_newline, user_id, state).await
}

#[tauri::command]
pub async fn get_available_shells(
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let terminal_manager = state.terminal_manager.lock().await;
    if let Some(manager) = terminal_manager.as_ref() {
        Ok(manager.get_available_shells())
    } else {
        Err("Terminal manager not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_default_shell(
    state: State<'_, AppState>,
) -> Result<String, String> {
    let terminal_manager = state.terminal_manager.lock().await;
    if let Some(manager) = terminal_manager.as_ref() {
        manager
            .get_default_shell()
            .map_err(|e| e.to_string())
    } else {
        Err("Terminal manager not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_terminal_session(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<TerminalSessionInfo, String> {
    let terminal_manager = state.terminal_manager.lock().await;
    if let Some(manager) = terminal_manager.as_ref() {
        let session = manager
            .get_session(&session_id)
            .map_err(|e| e.to_string())?;
        Ok(session.get_info())
    } else {
        Err("Terminal manager not initialized".to_string())
    }
}

#[tauri::command]
pub async fn resize_terminal_session(
    session_id: String,
    rows: u16,
    cols: u16,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let terminal_manager = state.terminal_manager.lock().await;
    if let Some(manager) = terminal_manager.as_ref() {
        manager
            .resize_session(&session_id, rows, cols)
            .await
            .map_err(|e| e.to_string())
    } else {
        Err("Terminal manager not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_terminal_session_history(
    session_id: String,
    lines: Option<usize>,
    state: State<'_, AppState>,
) -> Result<Vec<SessionHistoryEntry>, String> {
    let terminal_manager = state.terminal_manager.lock().await;
    if let Some(manager) = terminal_manager.as_ref() {
        manager
            .get_session_history(&session_id, lines)
            .await
            .map_err(|e| e.to_string())
    } else {
        Err("Terminal manager not initialized".to_string())
    }
}

#[tauri::command]
pub async fn add_user_to_terminal_session(
    session_id: String,
    user_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let terminal_manager = state.terminal_manager.lock().await;
    if let Some(manager) = terminal_manager.as_ref() {
        manager
            .add_user_to_session(&session_id, user_id)
            .await
            .map_err(|e| e.to_string())
    } else {
        Err("Terminal manager not initialized".to_string())
    }
}

#[tauri::command]
pub async fn remove_user_from_terminal_session(
    session_id: String,
    user_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let terminal_manager = state.terminal_manager.lock().await;
    if let Some(manager) = terminal_manager.as_ref() {
        manager
            .remove_user_from_session(&session_id, &user_id)
            .await
            .map_err(|e| e.to_string())
    } else {
        Err("Terminal manager not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_terminal_statistics(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let terminal_manager = state.terminal_manager.lock().await;
    if let Some(manager) = terminal_manager.as_ref() {
        Ok(manager.get_session_statistics().await)
    } else {
        Err("Terminal manager not initialized".to_string())
    }
}

#[tauri::command]
pub async fn create_terminal_session_preset(
    preset: String,
    grid_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let request = match preset.as_str() {
        "bash" => CreateSessionRequest {
            grid_id,
            shell_type: Some("bash".to_string()),
            working_directory: None,
            initial_command: None,
            session_name: None, 
        },
        "powershell" => CreateSessionRequest {
            grid_id,
            shell_type: Some("powershell".to_string()),
            working_directory: None,
            initial_command: None,
            session_name: None, 
        },
        "development" => CreateSessionRequest {
            grid_id,
            shell_type: None,
            working_directory: None,
            initial_command: Some("clear && echo 'Development terminal ready!'".to_string()),
            session_name: None, 
        },
        _ => return Err(format!("Unknown preset: {}", preset)),
    };

    create_terminal_session(request, state).await
}

#[tauri::command]
pub async fn create_terminal_session_with_command(
    grid_id: Option<String>,
    command: String,
    working_directory: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let request = CreateSessionRequest {
        grid_id,
        shell_type: None,
        working_directory,
        initial_command: Some(command),
        session_name: None, 
    };

    create_terminal_session(request, state).await
}

#[tauri::command]
pub async fn send_terminal_interrupt(
    session_id: String,
    user_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    send_terminal_input(session_id, vec![3], user_id, state).await
}

#[tauri::command]
pub async fn send_terminal_eof(
    session_id: String,
    user_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    send_terminal_input(session_id, vec![4], user_id, state).await
}

#[tauri::command]
pub async fn disconnect_terminal_ui(
    session_id: String,
    user_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let terminal_manager = state.terminal_manager.lock().await;
    if let Some(manager) = terminal_manager.as_ref() {
        manager
            .disconnect_ui_from_session(&session_id, &user_id)
            .await
            .map_err(|e| e.to_string())
    } else {
        Err("Terminal manager not initialized".to_string())
    }
}

#[tauri::command]
pub async fn reconnect_terminal_ui(
    session_id: String,
    user_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let terminal_manager = state.terminal_manager.lock().await;
    if let Some(manager) = terminal_manager.as_ref() {
        manager
            .reconnect_ui_to_session(&session_id, user_id)
            .await
            .map_err(|e| e.to_string())
    } else {
        Err("Terminal manager not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_background_terminal_sessions(
    state: State<'_, AppState>,
) -> Result<Vec<TerminalSessionInfo>, String> {
    let terminal_manager = state.terminal_manager.lock().await;
    if let Some(manager) = terminal_manager.as_ref() {
        Ok(manager.get_background_sessions())
    } else {
        Err("Terminal manager not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_active_ui_terminal_sessions(
    state: State<'_, AppState>,
) -> Result<Vec<TerminalSessionInfo>, String> {
    let terminal_manager = state.terminal_manager.lock().await;
    if let Some(manager) = terminal_manager.as_ref() {
        Ok(manager.get_active_ui_sessions())
    } else {
        Err("Terminal manager not initialized".to_string())
    }
}

// Add these bridge commands that were in terminal_process_bridge.rs:

#[tauri::command]
pub async fn create_terminal_process_command(
    grid_id: String,
    request: CreateSessionRequest,
    process_name: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let process_manager = state.process_manager.lock().await;
    if let Some(manager) = process_manager.as_ref() {
        manager.create_terminal_process(grid_id, request, process_name)
            .await
            .map_err(|e| e.to_string())
    } else {
        Err("Process manager not initialized".to_string())
    }
}

#[tauri::command]
pub async fn connect_terminal_to_grid(
    session_id: String,
    grid_id: String,
    process_name: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let terminal_manager = state.terminal_manager.lock().await;
    if let Some(manager) = terminal_manager.as_ref() {
        let session = manager.get_session(&session_id)
            .map_err(|e| format!("Terminal session not found: {}", e))?;
        let session_info = session.get_info();
        
        let config = ProcessConfig {
            executable_path: "internal_terminal".to_string(),
            args: vec![session_id.clone(), session_info.shell_type.clone()],
            env_vars: std::collections::HashMap::new(),
            working_directory: session_info.working_directory,
        };

        let process_manager = state.process_manager.lock().await;
        if let Some(manager) = process_manager.as_ref() {
            manager.start_process(grid_id, config).await
                .map_err(|e| e.to_string())
        } else {
            Err("Process manager not initialized".to_string())
        }
    } else {
        Err("Terminal manager not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_grid_terminal_processes(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    // Simplified version - you can enhance this later
    let process_manager = state.process_manager.lock().await;
    if let Some(manager) = process_manager.as_ref() {
        let processes = manager.get_active_processes().await;
        let terminal_processes: Vec<serde_json::Value> = processes
            .into_iter()
            .filter(|p| p.grid_id == grid_id && p.config.executable_path == "internal_terminal")
            .map(|p| serde_json::json!(p))
            .collect();
        Ok(terminal_processes)
    } else {
        Err("Process manager not initialized".to_string())
    }
}

#[tauri::command]
pub async fn register_terminal_as_process(
    grid_id: String,
    session_id: String,
    process_name: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let terminal_manager = state.terminal_manager.lock().await;
    if let Some(manager) = terminal_manager.as_ref() {
        let session = manager.get_session(&session_id)
            .map_err(|e| format!("Terminal session not found: {}", e))?;
        let session_info = session.get_info();
        
        let config = ProcessConfig {
            executable_path: "internal_terminal".to_string(),
            args: vec![session_id.clone(), session_info.shell_type.clone()],
            env_vars: std::collections::HashMap::new(),
            working_directory: session_info.working_directory,
        };

        let process_manager = state.process_manager.lock().await;
        if let Some(manager) = process_manager.as_ref() {
            manager.start_process(grid_id, config).await
                .map_err(|e| e.to_string())
        } else {
            Err("Process manager not initialized".to_string())
        }
    } else {
        Err("Terminal manager not initialized".to_string())
    }
}

/// Manually cleanup dead terminal sessions
#[tauri::command]
pub async fn cleanup_dead_terminal_sessions(
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let terminal_manager = state.terminal_manager.lock().await;
    
    if let Some(ref manager) = *terminal_manager {
        manager.cleanup_dead_sessions().await
            .map_err(|e| e.to_string())
    } else {
        Err("Terminal manager not initialized".to_string())
    }
}

/// Get session working directory and command history
#[tauri::command]
pub async fn get_terminal_session_context(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let terminal_manager = state.terminal_manager.lock().await;
    
    if let Some(ref manager) = *terminal_manager {
        let session = manager.get_session(&session_id)
            .map_err(|e| format!("Session not found: {}", e))?;
        
        Ok(serde_json::json!({
            "session_id": session_id,
            "working_directory": session.get_working_directory(),
            "command_history": session.get_command_history(),
            "current_command": session.get_current_command(),
            "is_active": session.is_active()
        }))
    } else {
        Err("Terminal manager not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_process_display_name(
    process_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let process_manager = state.process_manager.lock().await;
    if let Some(manager) = process_manager.as_ref() {
        let processes = manager.get_active_processes().await;
        
        if let Some(process) = processes.iter().find(|p| p.process_id == process_id) {
            // For terminal processes, extract name from args or env vars
            if process.config.executable_path == "internal_terminal" {
                // Try to get name from args (third argument)
                if process.config.args.len() >= 3 {
                    return Ok(process.config.args[2].clone());
                }
                
                // Try to get name from environment variables
                if let Some(name) = process.config.env_vars.get("TERMINAL_NAME") {
                    return Ok(name.clone());
                }
                
                // Fallback to process ID
                return Ok(format!("Terminal {}", &process.process_id[0..8]));
            }
            
            // For other processes, use the process ID
            Ok(process.process_id.clone())
        } else {
            Err("Process not found".to_string())
        }
    } else {
        Err("Process manager not initialized".to_string())
    }
}

