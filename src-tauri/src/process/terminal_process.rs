// src-tauri/src/process/terminal_process.rs
use crate::terminal::types::{TerminalSessionInfo, CreateSessionRequest};
use crate::terminal::manager::TerminalManager;
use crate::process::types::{ProcessConfig, ProcessStatus, ProcessState, ProcessInfo};
use anyhow::{Result, Context};
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;
use chrono::Utc;

/// Terminal process configuration for the process manager
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TerminalProcessConfig {
    pub session_id: String,
    pub shell_type: String,
    pub working_directory: String,
    pub initial_command: Option<String>,
    pub supports_manual_sharing: bool,
}

/// Terminal process metadata for the process manager
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TerminalProcessMetadata {
    pub session_id: String,
    pub shell_type: String,
    pub working_directory: String,
    pub connected_users: Vec<String>,
    pub is_background: bool,
    pub supports_input: bool,
    pub supports_port_sharing: bool,
    pub last_activity: chrono::DateTime<chrono::Utc>,
}

/// Bridge between terminal sessions and the process manager
pub struct TerminalProcessBridge {
    terminal_manager: Arc<Mutex<Option<TerminalManager>>>,
}

impl TerminalProcessBridge {
    pub fn new() -> Self {
        Self {
            terminal_manager: Arc::new(Mutex::new(None)),
        }
    }

    /// Set the terminal manager reference
    pub async fn set_terminal_manager(&self, manager: TerminalManager) {
        let mut tm_guard = self.terminal_manager.lock().await;
        *tm_guard = Some(manager);
    }

    /// Create a terminal session and return a ProcessConfig for the process manager
    pub async fn create_terminal_process(
        &self,
        grid_id: String,
        request: CreateSessionRequest,
        process_name: Option<String>,
    ) -> Result<(String, ProcessConfig, TerminalProcessMetadata)> {
        // Create the terminal session first
        let session_id = {
            let tm_guard = self.terminal_manager.lock().await;
            if let Some(manager) = tm_guard.as_ref() {
                manager.create_session(request.clone()).await
                    .context("Failed to create terminal session")?
            } else {
                return Err(anyhow::anyhow!("Terminal manager not initialized"));
            }
        };

        // Generate process ID
        let process_id = Uuid::new_v4().to_string();

        // Create process name
        let name = process_name.unwrap_or_else(|| {
            format!("Terminal ({})", 
                request.shell_type.as_deref().unwrap_or("bash")
            )
        });

        // Create ProcessConfig that represents this terminal
        let process_config = ProcessConfig {
            executable_path: "internal_terminal".to_string(), // Special marker
            args: vec![
                session_id.clone(),
                request.shell_type.clone().unwrap_or_else(|| "bash".to_string()),
            ],
            env_vars: std::collections::HashMap::new(),
            working_directory: request.working_directory.clone().unwrap_or_else(|| {
                std::env::current_dir()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string()
            }),
        };

        // Create terminal metadata
        let metadata = TerminalProcessMetadata {
            session_id: session_id.clone(),
            shell_type: request.shell_type.unwrap_or_else(|| "bash".to_string()),
            working_directory: process_config.working_directory.clone(),
            connected_users: vec![], // Will be updated as users connect
            is_background: true, // Terminals start in background
            supports_input: true,
            supports_port_sharing: true,
            last_activity: Utc::now(),
        };

        log::info!("Created terminal process bridge: {} -> {}", process_id, session_id);

        Ok((process_id, process_config, metadata))
    }

    /// Convert terminal session info to ProcessInfo
    pub fn terminal_to_process_info(
        &self,
        process_id: String,
        grid_id: String,
        session_info: &TerminalSessionInfo,
        _owner_id: String,
    ) -> ProcessInfo {
        // Create process config that represents the terminal
        let config = ProcessConfig {
            executable_path: "internal_terminal".to_string(),
            args: vec![
                session_info.session_id.clone(),
                session_info.shell_type.clone(),
            ],
            env_vars: std::collections::HashMap::new(),
            working_directory: session_info.working_directory.clone(),
        };

        // Create process status
        let status = ProcessStatus {
            process_id: process_id.clone(),
            grid_id: grid_id.clone(),
            state: if session_info.is_active {
                ProcessState::Running
            } else {
                ProcessState::Stopped
            },
            pid: None, // Terminals don't have traditional PIDs
            exit_code: None,
            started_at: session_info.created_at.timestamp() as u64,
            error_message: None,
        };

        ProcessInfo {
            process_id,
            grid_id,
            config,
            status,
            created_at: session_info.created_at.timestamp() as u64,
            process_type: crate::process::types::ProcessType::Terminal,
        }
    }

    /// Get terminal session info from process args
    pub fn extract_session_id_from_process(config: &ProcessConfig) -> Option<String> {
        if config.executable_path == "internal_terminal" && !config.args.is_empty() {
            Some(config.args[0].clone())
        } else {
            None
        }
    }

    /// Check if a ProcessConfig represents a terminal
    pub fn is_terminal_process(config: &ProcessConfig) -> bool {
        config.executable_path == "internal_terminal"
    }

    /// Update terminal process metadata from session info
    pub async fn update_terminal_metadata(
        &self,
        session_id: &str,
    ) -> Result<TerminalProcessMetadata> {
        let tm_guard = self.terminal_manager.lock().await;
        if let Some(manager) = tm_guard.as_ref() {
            let session = manager.get_session(session_id)
                .context("Failed to get terminal session")?;
            
            let session_info = session.get_info();
            
            Ok(TerminalProcessMetadata {
                session_id: session_id.to_string(),
                shell_type: session_info.shell_type,
                working_directory: session_info.working_directory,
                connected_users: session_info.connected_users.clone(),
                is_background: session_info.connected_users.is_empty(),
                supports_input: session_info.is_active,
                supports_port_sharing: session_info.is_active,
                last_activity: session_info.last_activity,
            })
        } else {
            Err(anyhow::anyhow!("Terminal manager not initialized"))
        }
    }

    /// Handle terminal session termination
    pub async fn handle_terminal_termination(&self, session_id: &str) -> Result<()> {
        log::info!("Handling terminal termination for session: {}", session_id);
        
        let tm_guard = self.terminal_manager.lock().await;
        if let Some(manager) = tm_guard.as_ref() {
            manager.terminate_session(session_id).await
                .context("Failed to terminate terminal session")?;
        }
        
        Ok(())
    }

    /// Send input to terminal via process manager
    pub async fn send_terminal_input(
        &self,
        session_id: &str,
        input: Vec<u8>,
    ) -> Result<()> {
        let tm_guard = self.terminal_manager.lock().await;
        if let Some(manager) = tm_guard.as_ref() {
            let terminal_input = crate::terminal::types::TerminalInput {
                session_id: session_id.to_string(),
                user_id: Some("process_manager".to_string()),
                data: input,
                timestamp: chrono::Utc::now(),
            };
            
            manager.send_input(terminal_input).await
                .context("Failed to send input to terminal")?;
        } else {
            return Err(anyhow::anyhow!("Terminal manager not initialized"));
        }
        
        Ok(())
    }

    /// Get terminal status for process manager
    pub async fn get_terminal_status(&self, session_id: &str) -> Result<ProcessStatus> {
        let tm_guard = self.terminal_manager.lock().await;
        if let Some(manager) = tm_guard.as_ref() {
            let session = manager.get_session(session_id)
                .context("Failed to get terminal session")?;
            
            let session_info = session.get_info();
            
            Ok(ProcessStatus {
                process_id: session_id.to_string(),
                grid_id: session_info.grid_id.unwrap_or_else(|| "unknown".to_string()),
                state: if session_info.is_active {
                    ProcessState::Running
                } else {
                    ProcessState::Stopped
                },
                pid: None,
                exit_code: None,
                started_at: session_info.created_at.timestamp() as u64,
                error_message: None,
            })
        } else {
            Err(anyhow::anyhow!("Terminal manager not initialized"))
        }
    }

    /// Subscribe to terminal events for process manager
    pub async fn setup_terminal_event_forwarding(
        &self,
        app_handle: tauri::AppHandle,
    ) -> Result<()> {
        // This will forward terminal events as process events
        // The actual implementation would depend on your event system
        
        log::info!("Setting up terminal-to-process event forwarding");
        
        // Example: Listen for terminal events and emit as process events
        // You would implement this based on your existing event system
        
        Ok(())
    }

    /// Convert terminal process metadata to process card metadata
    pub fn terminal_metadata_to_process_metadata(
        &self,
        terminal_meta: &TerminalProcessMetadata,
    ) -> serde_json::Value {
        serde_json::json!({
            "session_id": terminal_meta.session_id,
            "shell_type": terminal_meta.shell_type,
            "working_directory": terminal_meta.working_directory,
            "connected_users": terminal_meta.connected_users.len(),
            "is_background": terminal_meta.is_background,
            "supports_input": terminal_meta.supports_input,
            "supports_port_sharing": terminal_meta.supports_port_sharing,
            "last_activity": terminal_meta.last_activity.to_rfc3339(),
            "process_type": "terminal"
        })
    }
}

/// Helper functions for terminal process integration
impl TerminalProcessBridge {
    /// Create a terminal process name based on session info
    pub fn generate_terminal_process_name(
        shell_type: &str,
        working_dir: &str,
        initial_command: Option<&str>,
    ) -> String {
        if let Some(cmd) = initial_command {
            format!("{} - {}", shell_type, cmd)
        } else {
            let dir_name = std::path::Path::new(working_dir)
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("~");
            format!("{} Terminal ({})", shell_type, dir_name)
        }
    }

    /// Check if a port is available for manual sharing
    pub async fn can_share_port(&self, port: u16) -> bool {
        // Check if port is actually in use
        crate::utils::network::is_port_in_use(port).await
    }

    /// Validate terminal process configuration
    pub fn validate_terminal_config(config: &ProcessConfig) -> Result<()> {
        if !Self::is_terminal_process(config) {
            return Err(anyhow::anyhow!("Not a terminal process configuration"));
        }

        if config.args.len() < 2 {
            return Err(anyhow::anyhow!("Invalid terminal process arguments"));
        }

        // Validate session ID format
        let session_id = &config.args[0];
        if session_id.is_empty() {
            return Err(anyhow::anyhow!("Invalid session ID"));
        }

        Ok(())
    }
}