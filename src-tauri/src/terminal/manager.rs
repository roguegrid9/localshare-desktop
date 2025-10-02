// src-tauri/src/terminal/manager.rs - Simplified without persistence

use super::session::TerminalSession;
use super::shell::ShellDetector;
use super::types::{
    CreateSessionRequest, TerminalConfig, TerminalError, TerminalInput, TerminalOutput,
    TerminalSessionInfo,
};
use anyhow::Result;
use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast;
use tokio::time::interval;

#[derive(Clone)]
pub struct TerminalManager {
    sessions: Arc<RwLock<HashMap<String, Arc<TerminalSession>>>>,
    app_handle: AppHandle,
    config: TerminalConfig,
    // Global output broadcaster for the frontend
    global_output_sender: broadcast::Sender<TerminalOutput>,
}

impl TerminalManager {
    pub fn new(app_handle: AppHandle) -> Self {
        let (global_output_sender, _) = broadcast::channel(1000);
        
        let manager = Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            app_handle,
            config: TerminalConfig::default(),
            global_output_sender,
        };

        // Start cleanup task for inactive sessions
        manager.start_cleanup_task();

        manager
    }

    /// Create a new terminal session
    pub async fn create_session(&self, request: CreateSessionRequest) -> Result<String> {
        log::info!("Creating new terminal session for grid: {:?}", request.grid_id);

        // Parse shell type if provided
        let shell_type = if let Some(shell_str) = request.shell_type {
            Some(ShellDetector::parse_shell_type(&shell_str)?)
        } else {
            None
        };

        // Create the session
        let session = Arc::new(TerminalSession::new(
            request.grid_id.clone(),
            shell_type,
            request.working_directory,
            self.config.clone(),
            request.session_name,
        )?);

        let session_id = session.session_id.clone();

        // Store the session
        {
            let mut sessions = self.sessions.write();
            if sessions.contains_key(&session_id) {
                return Err(TerminalError::SessionAlreadyExists(session_id).into());
            }
            sessions.insert(session_id.clone(), session.clone());
        }

        // Start forwarding session output to global broadcaster
        Self::start_session_output_forwarder(
            session.clone(),
            self.global_output_sender.clone(),
            self.app_handle.clone(),
        ).await;

        // Run initial command if provided
        if let Some(initial_command) = request.initial_command {
            let input = TerminalInput {
                session_id: session_id.clone(),
                user_id: None,
                data: format!("{}\n", initial_command).into_bytes(),
                timestamp: chrono::Utc::now(),
            };
            
            if let Err(e) = session.send_input(input) {
                log::warn!("Failed to send initial command: {}", e);
            }
        }

        // Emit session created event
        self.app_handle.emit("terminal_session_created", &session.get_info())?;

        log::info!("Terminal session created: {}", session_id);
        Ok(session_id)
    }

    /// Get a terminal session by ID
    pub fn get_session(&self, session_id: &str) -> Result<Arc<TerminalSession>> {
        let sessions = self.sessions.read();
        sessions
            .get(session_id)
            .cloned()
            .ok_or_else(|| TerminalError::SessionNotFound(session_id.to_string()).into())
    }

    /// Send input to a terminal session
    pub async fn send_input(&self, input: TerminalInput) -> Result<()> {
        let session = self.get_session(&input.session_id)?;
        session.send_input(input)?;
        Ok(())
    }

    /// Get all active sessions (including background ones)
    pub fn get_all_sessions(&self) -> Vec<TerminalSessionInfo> {
        let sessions = self.sessions.read();
        sessions
            .values()
            .filter(|session| session.is_active())
            .map(|session| session.get_info())
            .collect()
    }

    /// Get sessions with active UI connections
    pub fn get_active_ui_sessions(&self) -> Vec<TerminalSessionInfo> {
        let sessions = self.sessions.read();
        sessions
            .values()
            .filter(|session| {
                session.is_active() && !session.get_info().connected_users.is_empty()
            })
            .map(|session| session.get_info())
            .collect()
    }

    /// Get sessions running in background (no UI connections)
    pub fn get_background_sessions(&self) -> Vec<TerminalSessionInfo> {
        let sessions = self.sessions.read();
        sessions
            .values()
            .filter(|session| {
                session.is_active() && session.get_info().connected_users.is_empty()
            })
            .map(|session| session.get_info())
            .collect()
    }

    /// Get sessions for a specific grid
    pub fn get_grid_sessions(&self, grid_id: &str) -> Vec<TerminalSessionInfo> {
        let sessions = self.sessions.read();
        sessions
            .values()
            .filter(|session| {
                session.is_active() && 
                session.get_info().grid_id.as_ref() == Some(&grid_id.to_string())
            })
            .map(|session| session.get_info())
            .collect()
    }

    /// Disconnect UI from session (session continues in background)
    pub async fn disconnect_ui_from_session(&self, session_id: &str, user_id: &str) -> Result<()> {
        log::info!("Disconnecting UI for user {} from session {}", user_id, session_id);
        
        let session = self.get_session(session_id)?;
        session.remove_connected_user(user_id);
        
        // Emit UI disconnected event
        self.app_handle.emit("terminal_ui_disconnected", &serde_json::json!({
            "session_id": session_id,
            "user_id": user_id,
            "background_session_count": self.get_background_sessions().len()
        }))?;

        Ok(())
    }

    /// Reconnect UI to a background session
    pub async fn reconnect_ui_to_session(&self, session_id: &str, user_id: String) -> Result<()> {
        log::info!("Reconnecting UI for user {} to session {}", user_id, session_id);
        
        let session = self.get_session(session_id)?;
        if !session.is_active() {
            return Err(TerminalError::SessionNotFound(session_id.to_string()).into());
        }

        session.add_connected_user(user_id.clone());
        
        // Emit UI reconnected event
        self.app_handle.emit("terminal_ui_reconnected", &serde_json::json!({
            "session_id": session_id,
            "user_id": user_id
        }))?;

        Ok(())
    }

    /// Terminate a session (actually kill the process)
    pub async fn terminate_session(&self, session_id: &str) -> Result<()> {
        log::info!("Terminating terminal session: {}", session_id);

        let session = {
            let mut sessions = self.sessions.write();
            sessions.remove(session_id)
        };

        if let Some(session) = session {
            session.terminate()?;
            
            // Emit session terminated event
            self.app_handle.emit("terminal_session_terminated", &serde_json::json!({
                "session_id": session_id
            }))?;
            
            log::info!("Terminal session terminated: {}", session_id);
        } else {
            return Err(TerminalError::SessionNotFound(session_id.to_string()).into());
        }

        Ok(())
    }

    /// Resize a terminal session
    pub async fn resize_session(&self, session_id: &str, rows: u16, cols: u16) -> Result<()> {
        let session = self.get_session(session_id)?;
        session.resize(rows, cols)?;
        Ok(())
    }

    /// Add a user to a session (for UI connection)
    pub async fn add_user_to_session(&self, session_id: &str, user_id: String) -> Result<()> {
        let session = self.get_session(session_id)?;
        session.add_connected_user(user_id);
        Ok(())
    }

    /// Remove a user from a session (UI disconnect, but session continues)
    pub async fn remove_user_from_session(&self, session_id: &str, user_id: &str) -> Result<()> {
        self.disconnect_ui_from_session(session_id, user_id).await
    }

    /// Get session history for reconnection
    pub async fn get_session_history(
        &self,
        session_id: &str,
        lines: Option<usize>,
    ) -> Result<Vec<super::types::SessionHistoryEntry>> {
        let session = self.get_session(session_id)?;
        Ok(session.get_history(lines))
    }

    /// Subscribe to global terminal output
    pub fn subscribe_to_output(&self) -> broadcast::Receiver<TerminalOutput> {
        self.global_output_sender.subscribe()
    }

    /// Get available shells on the system
    pub fn get_available_shells(&self) -> Vec<String> {
        ShellDetector::get_available_shells()
            .into_iter()
            .map(|shell| shell.as_str().to_string())
            .collect()
    }

    /// Get the default shell for the system
    pub fn get_default_shell(&self) -> Result<String> {
        let shell = ShellDetector::detect_best_shell()?;
        Ok(shell.as_str().to_string())
    }

    /// Get session statistics
    pub async fn get_session_statistics(&self) -> serde_json::Value {
        let sessions = self.sessions.read();
        let total_sessions = sessions.len();
        let active_sessions = sessions.values().filter(|s| s.is_active()).count();
        let ui_connected_sessions = sessions.values().filter(|s| !s.get_info().connected_users.is_empty()).count();
        let background_sessions = active_sessions - ui_connected_sessions;
        
        let mut shell_counts = HashMap::new();
        let mut grid_counts = HashMap::new();
        
        for session in sessions.values() {
            let info = session.get_info();
            
            // Count shells
            *shell_counts.entry(info.shell_type).or_insert(0) += 1;
            
            // Count grids
            if let Some(grid_id) = info.grid_id {
                *grid_counts.entry(grid_id).or_insert(0) += 1;
            }
        }

        serde_json::json!({
            "total_sessions": total_sessions,
            "active_sessions": active_sessions,
            "ui_connected_sessions": ui_connected_sessions,
            "background_sessions": background_sessions,
            "inactive_sessions": total_sessions - active_sessions,
            "shell_distribution": shell_counts,
            "grid_distribution": grid_counts,
            "cleanup_interval_hours": self.config.auto_cleanup_inactive_hours,
            "max_history_lines": self.config.max_history_lines,
        })
    }

    /// Manual cleanup of dead sessions
    pub async fn cleanup_dead_sessions(&self) -> Result<Vec<String>> {
        log::info!("Starting manual cleanup of dead terminal sessions");
        
        let mut cleaned_up = Vec::new();
        {
            let mut sessions = self.sessions.write();
            let session_ids: Vec<String> = sessions.keys().cloned().collect();
            
            for session_id in session_ids {
                if let Some(session) = sessions.get(&session_id) {
                    if !session.is_active() {
                        sessions.remove(&session_id);
                        cleaned_up.push(session_id);
                    }
                }
            }
        }

        if !cleaned_up.is_empty() {
            // Emit cleanup event
            self.app_handle.emit("terminal_sessions_cleaned_up", &serde_json::json!({
                "cleaned_session_ids": cleaned_up,
                "count": cleaned_up.len()
            }))?;
        }

        Ok(cleaned_up)
    }

    /// Start forwarding session output to global broadcaster
    async fn start_session_output_forwarder(
        session: Arc<TerminalSession>,
        global_sender: broadcast::Sender<TerminalOutput>,
        app_handle: AppHandle,
    ) {
        let mut output_receiver = session.subscribe_to_output();
        let session_id = session.session_id.clone();

        tokio::spawn(async move {
            while let Ok(output) = output_receiver.recv().await {
                // Forward to global broadcaster
                if let Err(e) = global_sender.send(output.clone()) {
                    log::debug!("No global output subscribers: {}", e);
                }

                // Emit to frontend via Tauri events
                if let Err(e) = app_handle.emit("terminal_output", &output) {
                    log::error!("Failed to emit terminal output event: {}", e);
                }
            }
            
            log::debug!("Output forwarder stopped for session: {}", session_id);
        });
    }

    /// Start periodic cleanup of inactive sessions
    fn start_cleanup_task(&self) {
        let sessions = self.sessions.clone();
        let cleanup_hours = self.config.auto_cleanup_inactive_hours;
        let app_handle = self.app_handle.clone();

        tokio::spawn(async move {
            let mut cleanup_interval = interval(Duration::from_secs(3600)); // Check every hour

            loop {
                cleanup_interval.tick().await;
                
                log::debug!("Running periodic terminal session cleanup");
                
                let now = chrono::Utc::now();
                let mut sessions_to_remove = Vec::new();

                // Find sessions that are no longer active or truly abandoned
                {
                    let sessions_guard = sessions.read();
                    for (session_id, session) in sessions_guard.iter() {
                        let info = session.get_info();
                        
                        // Remove if process is dead
                        if !session.is_active() {
                            sessions_to_remove.push(session_id.clone());
                            continue;
                        }
                        
                        // Remove if no UI connections for too long
                        if info.connected_users.is_empty() {
                            let inactive_duration = now.signed_duration_since(info.last_activity);
                            if inactive_duration.num_hours() >= cleanup_hours as i64 {
                                sessions_to_remove.push(session_id.clone());
                            }
                        }
                    }
                }

                // Clean up inactive sessions
                for session_id in sessions_to_remove {
                    log::info!("Cleaning up inactive terminal session: {}", session_id);
                    
                    let session = {
                        let mut sessions_guard = sessions.write();
                        sessions_guard.remove(&session_id)
                    };

                    if let Some(session) = session {
                        if let Err(e) = session.terminate() {
                            log::error!("Error terminating session during cleanup: {}", e);
                        }

                        // Emit cleanup event
                        if let Err(e) = app_handle.emit("terminal_session_cleaned_up", &serde_json::json!({
                            "session_id": session_id
                        })) {
                            log::error!("Failed to emit cleanup event: {}", e);
                        }
                    }
                }
            }
        });
    }

    /// Update terminal configuration
    pub fn update_config(&mut self, new_config: TerminalConfig) {
        self.config = new_config;
        log::info!("Terminal manager configuration updated");
    }

    /// Terminate all sessions (for shutdown)
    pub async fn terminate_all_sessions(&self) -> Result<()> {
        log::info!("Terminating all terminal sessions");
        
        let session_ids: Vec<String> = {
            let sessions = self.sessions.read();
            sessions.keys().cloned().collect()
        };

        for session_id in &session_ids {
            if let Err(e) = self.terminate_session(session_id).await {
                log::error!("Failed to terminate session {}: {}", session_id, e);
            }
        }

        Ok(())
    }
}

impl Drop for TerminalManager {
    fn drop(&mut self) {
        // Terminate all sessions synchronously
        let sessions = self.sessions.read();
        for session in sessions.values() {
            if let Err(e) = session.terminate() {
                log::error!("Error terminating session during manager drop: {}", e);
            }
        }
    }
}