use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use serde_json;
use tauri::Manager;
use super::types::*;
use tauri::Emitter;

/// Serializable representation of tab state that can be persisted and restored
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerializableTabState {
    pub tab: Tab,
    pub content_state: ContentState,
}

/// Content-specific state that needs to be preserved when tabs are moved between windows
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "content_type", content = "state")]
pub enum ContentState {
    Terminal {
        session_id: String,
        working_directory: Option<String>,
        environment_vars: HashMap<String, String>,
        command_history: Vec<String>,
        is_running: bool,
        exit_code: Option<i32>,
        scroll_position: Option<u32>,
    },
    TextChannel {
        last_read_message_id: Option<String>,
        draft_message: Option<String>,
        scroll_position: Option<u32>,
        typing_users: Vec<String>,
    },
    MediaChannel {
        is_muted: bool,
        is_video_enabled: bool,
        volume_level: f32,
        connected_users: Vec<String>,
    },
    Process {
        last_status_check: chrono::DateTime<chrono::Utc>,
        auto_restart: bool,
        resource_usage: Option<ProcessResourceUsage>,
    },
    DirectMessage {
        last_read_message_id: Option<String>,
        draft_message: Option<String>,
        scroll_position: Option<u32>,
    },
    GridDashboard {
        selected_view: String,
        filter_settings: HashMap<String, serde_json::Value>,
    },
    VoiceChannel {
        channel_id: String,
        grid_id: String,
        channel_name: String,
        is_muted: bool,
        is_deafened: bool,
        volume_level: f32,
        connected_users: Vec<String>,
    },
    Welcome,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessResourceUsage {
    pub cpu_percent: f32,
    pub memory_mb: u64,
    pub disk_read_mb: u64,
    pub disk_write_mb: u64,
    pub network_rx_mb: u64,
    pub network_tx_mb: u64,
}

/// Manager for serializing and deserializing tab states
pub struct TabStateManager;

impl TabStateManager {
    /// Create content state from a tab's content type
    pub fn create_initial_content_state(content: &TabContentType) -> ContentState {
        match content {
            TabContentType::Terminal { session_id, .. } => ContentState::Terminal {
                session_id: session_id.clone(),
                working_directory: None,
                environment_vars: HashMap::new(),
                command_history: Vec::new(),
                is_running: false,
                exit_code: None,
                scroll_position: None,
            },
            TabContentType::TextChannel { .. } => ContentState::TextChannel {
                last_read_message_id: None,
                draft_message: None,
                scroll_position: None,
                typing_users: Vec::new(),
            },
            TabContentType::MediaChannel { .. } => ContentState::MediaChannel {
                is_muted: false,
                is_video_enabled: false,
                volume_level: 1.0,
                connected_users: Vec::new(),
            },
            TabContentType::VoiceChannel { data } => ContentState::VoiceChannel {
                channel_id: data.channel_id.clone(),
                grid_id: data.grid_id.clone(),
                channel_name: data.channel_name.clone(),
                is_muted: false,
                is_deafened: false,
                volume_level: 1.0,
                connected_users: Vec::new(),
            },
            TabContentType::Process { .. } => ContentState::Process {
                last_status_check: chrono::Utc::now(),
                auto_restart: false,
                resource_usage: None,
            },
            TabContentType::DirectMessage { .. } => ContentState::DirectMessage {
                last_read_message_id: None,
                draft_message: None,
                scroll_position: None,
            },
            TabContentType::GridDashboard { .. } => ContentState::GridDashboard {
                selected_view: "overview".to_string(),
                filter_settings: HashMap::new(),
            },
            TabContentType::Welcome => ContentState::Welcome,
        }
    }

    /// Serialize a tab with its current state
    pub fn serialize_tab(tab: &Tab, content_state: ContentState) -> Result<String, String> {
        let serializable_state = SerializableTabState {
            tab: tab.clone(),
            content_state,
        };

        serde_json::to_string(&serializable_state)
            .map_err(|e| format!("Failed to serialize tab state: {}", e))
    }

    /// Deserialize a tab with its state
    pub fn deserialize_tab(serialized_data: &str) -> Result<(Tab, ContentState), String> {
        let serializable_state: SerializableTabState = serde_json::from_str(serialized_data)
            .map_err(|e| format!("Failed to deserialize tab state: {}", e))?;

        Ok((serializable_state.tab, serializable_state.content_state))
    }

    /// Prepare tab for detachment by capturing its current state
    pub async fn prepare_tab_for_detachment(
        tab: &Tab,
        app_handle: &tauri::AppHandle,
    ) -> Result<ContentState, String> {
        match &tab.content {
            TabContentType::Terminal { session_id, .. } => {
                // Get terminal state from terminal manager
                let terminal_state = Self::capture_terminal_state(session_id, app_handle).await?;
                Ok(terminal_state)
            },
            TabContentType::TextChannel { channel_id, .. } => {
                // Get channel state from messaging service
                let channel_state = Self::capture_channel_state(channel_id, app_handle).await?;
                Ok(channel_state)
            },
            TabContentType::MediaChannel { channel_id, .. } => {
                // Get media channel state
                let media_state = Self::capture_media_state(channel_id, app_handle).await?;
                Ok(media_state)
            },
            TabContentType::VoiceChannel { data } => {
                let voice_state = Self::capture_voice_state(&data.channel_id, app_handle).await?;
                Ok(voice_state)
            },
            TabContentType::Process { process_id, .. } => {
                // Get process state from process manager
                let process_state = Self::capture_process_state(process_id, app_handle).await?;
                Ok(process_state)
            },
            TabContentType::DirectMessage { conversation_id, .. } => {
                // Get DM state
                let dm_state = Self::capture_dm_state(conversation_id, app_handle).await?;
                Ok(dm_state)
            },
            TabContentType::GridDashboard { grid_id, .. } => {
                // Get dashboard state
                let dashboard_state = Self::capture_dashboard_state(grid_id, app_handle).await?;
                Ok(dashboard_state)
            },
            TabContentType::Welcome => Ok(ContentState::Welcome),
        }
    }

    /// Restore tab state after reattachment
    pub async fn restore_tab_state(
        tab: &Tab,
        content_state: &ContentState,
        app_handle: &tauri::AppHandle,
    ) -> Result<(), String> {
        match (&tab.content, content_state) {
            (TabContentType::Terminal { session_id, .. }, ContentState::Terminal { .. }) => {
                Self::restore_terminal_state(session_id, content_state, app_handle).await?;
            },
            (TabContentType::TextChannel { channel_id, .. }, ContentState::TextChannel { .. }) => {
                Self::restore_channel_state(channel_id, content_state, app_handle).await?;
            },
            (TabContentType::MediaChannel { channel_id, .. }, ContentState::MediaChannel { .. }) => {
                Self::restore_media_state(channel_id, content_state, app_handle).await?;
            },
            (TabContentType::Process { process_id, .. }, ContentState::Process { .. }) => {
                Self::restore_process_state(process_id, content_state, app_handle).await?;
            },
            (TabContentType::DirectMessage { conversation_id, .. }, ContentState::DirectMessage { .. }) => {
                Self::restore_dm_state(conversation_id, content_state, app_handle).await?;
            },
            (TabContentType::GridDashboard { grid_id, .. }, ContentState::GridDashboard { .. }) => {
                Self::restore_dashboard_state(grid_id, content_state, app_handle).await?;
            },
            (TabContentType::Welcome, ContentState::Welcome) => {
                // No state to restore for welcome tab
            },
            _ => {
                return Err("Content type and state type mismatch".to_string());
            }
        }

        Ok(())
    }

    // Terminal state capture/restore
    async fn capture_terminal_state(
        session_id: &str,
        app_handle: &tauri::AppHandle,
    ) -> Result<ContentState, String> {
        use crate::state::app::AppState;
        
        let state = app_handle.state::<AppState>();
        let terminal_manager = state.terminal_manager.lock().await;
        
        if let Some(manager) = terminal_manager.as_ref() {
        if let Ok(session) = manager.get_session(session_id).map_err(|e| e.to_string()) {
            return Ok(ContentState::Terminal {
                session_id: session_id.to_string(),
                working_directory: None,
                environment_vars: HashMap::new(),
                command_history: Vec::new(),
                is_running: false,
                exit_code: None,
                scroll_position: None, // This would come from frontend
            });
        }
    }

        // Return default state if session not found
        Ok(ContentState::Terminal {
            session_id: session_id.to_string(),
            working_directory: None,
            environment_vars: HashMap::new(),
            command_history: Vec::new(),
            is_running: false,
            exit_code: None,
            scroll_position: None,
        })
    }

    async fn restore_terminal_state(
        session_id: &str,
        content_state: &ContentState,
        app_handle: &tauri::AppHandle,
    ) -> Result<(), String> {
        if let ContentState::Terminal { scroll_position, .. } = content_state {
            // Emit event to frontend to restore terminal UI state
            app_handle
                .emit("restore-terminal-state", serde_json::json!({
                    "session_id": session_id,
                    "scroll_position": scroll_position,
                }))
                .map_err(|e| format!("Failed to emit terminal restore event: {}", e))?;
        }

        Ok(())
    }

    // Channel state capture/restore
    async fn capture_channel_state(
        channel_id: &str,
        app_handle: &tauri::AppHandle,
    ) -> Result<ContentState, String> {
        use crate::state::app::AppState;
        
        let state = app_handle.state::<AppState>();
        let messaging_service = state.messaging_service.lock().await;
        
        if let Some(_service) = messaging_service.as_ref() {
            // TODO: Implement get_channel_ui_state method in messaging service
            // For now, return default state
            return Ok(ContentState::TextChannel {
                last_read_message_id: None,
                draft_message: None,
                scroll_position: None,
                typing_users: Vec::new(),
            });
        }

        Ok(ContentState::TextChannel {
            last_read_message_id: None,
            draft_message: None,
            scroll_position: None,
            typing_users: Vec::new(),
        })
    }

    async fn capture_voice_state(
        _channel_id: &str,
        _app_handle: &tauri::AppHandle,
    ) -> Result<ContentState, String> {
        // For now, return default voice state
        Ok(ContentState::VoiceChannel {
            channel_id: _channel_id.to_string(),
            grid_id: "".to_string(), // Would get from app state
            channel_name: "".to_string(), // Would get from app state
            is_muted: false,
            is_deafened: false,
            volume_level: 1.0,
            connected_users: Vec::new(),
        })
    }
        async fn restore_channel_state(
        channel_id: &str,
        content_state: &ContentState,
        app_handle: &tauri::AppHandle,
    ) -> Result<(), String> {
        if let ContentState::TextChannel { 
            last_read_message_id, 
            draft_message, 
            scroll_position, 
            .. 
        } = content_state {
            // Emit event to frontend to restore channel UI state
            app_handle
                .emit("restore-channel-state", serde_json::json!({
                    "channel_id": channel_id,
                    "last_read_message_id": last_read_message_id,
                    "draft_message": draft_message,
                    "scroll_position": scroll_position,
                }))
                .map_err(|e| format!("Failed to emit channel restore event: {}", e))?;
        }

        Ok(())
    }

    // Media channel state capture/restore
    async fn capture_media_state(
        _channel_id: &str,
        _app_handle: &tauri::AppHandle,
    ) -> Result<ContentState, String> {
        // For now, return default media state
        // In the future, integrate with WebRTC media manager
        Ok(ContentState::MediaChannel {
            is_muted: false,
            is_video_enabled: false,
            volume_level: 1.0,
            connected_users: Vec::new(),
        })
    }

    async fn restore_media_state(
        channel_id: &str,
        content_state: &ContentState,
        app_handle: &tauri::AppHandle,
    ) -> Result<(), String> {
        if let ContentState::MediaChannel { 
            is_muted, 
            is_video_enabled, 
            volume_level, 
            .. 
        } = content_state {
            // Emit event to frontend to restore media state
            app_handle
                .emit("restore-media-state", serde_json::json!({
                    "channel_id": channel_id,
                    "is_muted": is_muted,
                    "is_video_enabled": is_video_enabled,
                    "volume_level": volume_level,
                }))
                .map_err(|e| format!("Failed to emit media restore event: {}", e))?;
        }

        Ok(())
    }

    // Process state capture/restore
    async fn capture_process_state(
        process_id: &str,
        app_handle: &tauri::AppHandle,
    ) -> Result<ContentState, String> {
        use crate::state::app::AppState;
        
        let state = app_handle.state::<AppState>();
        let process_manager = state.process_manager.lock().await;
        
        if let Some(manager) = process_manager.as_ref() {
            if let Ok(process_status) = manager.get_process_status(process_id.to_string()).await {
                return Ok(ContentState::Process {
                    last_status_check: chrono::Utc::now(),
                    auto_restart: false, // Get from process config
                    resource_usage: Some(ProcessResourceUsage {
                        cpu_percent: 0.0, // These fields don't exist in ProcessStatus
                        memory_mb: 0,     // Use default values or implement proper fields
                        disk_read_mb: 0,
                        disk_write_mb: 0,
                        network_rx_mb: 0,
                        network_tx_mb: 0,
                    }),
                });
            }
        }

        Ok(ContentState::Process {
            last_status_check: chrono::Utc::now(),
            auto_restart: false,
            resource_usage: None,
        })
    }

    async fn restore_process_state(
        process_id: &str,
        content_state: &ContentState,
        app_handle: &tauri::AppHandle,
    ) -> Result<(), String> {
        if let ContentState::Process { auto_restart, .. } = content_state {
            // Emit event to frontend to restore process UI state
            app_handle
                .emit("restore-process-state", serde_json::json!({
                    "process_id": process_id,
                    "auto_restart": auto_restart,
                }))
                .map_err(|e| format!("Failed to emit process restore event: {}", e))?;
        }

        Ok(())
    }

    // DM state capture/restore
    async fn capture_dm_state(
        _conversation_id: &str,
        _app_handle: &tauri::AppHandle,
    ) -> Result<ContentState, String> {
        // Similar to channel state but for DMs
        Ok(ContentState::DirectMessage {
            last_read_message_id: None,
            draft_message: None,
            scroll_position: None,
        })
    }

    async fn restore_dm_state(
        conversation_id: &str,
        content_state: &ContentState,
        app_handle: &tauri::AppHandle,
    ) -> Result<(), String> {
        if let ContentState::DirectMessage { 
            last_read_message_id, 
            draft_message, 
            scroll_position 
        } = content_state {
            app_handle
                .emit("restore-dm-state", serde_json::json!({
                    "conversation_id": conversation_id,
                    "last_read_message_id": last_read_message_id,
                    "draft_message": draft_message,
                    "scroll_position": scroll_position,
                }))
                .map_err(|e| format!("Failed to emit DM restore event: {}", e))?;
        }

        Ok(())
    }

    // Dashboard state capture/restore
    async fn capture_dashboard_state(
        _grid_id: &str,
        _app_handle: &tauri::AppHandle,
    ) -> Result<ContentState, String> {
        Ok(ContentState::GridDashboard {
            selected_view: "overview".to_string(),
            filter_settings: HashMap::new(),
        })
    }

    async fn restore_dashboard_state(
        grid_id: &str,
        content_state: &ContentState,
        app_handle: &tauri::AppHandle,
    ) -> Result<(), String> {
        if let ContentState::GridDashboard { 
            selected_view, 
            filter_settings 
        } = content_state {
            app_handle
                .emit("restore-dashboard-state", serde_json::json!({
                    "grid_id": grid_id,
                    "selected_view": selected_view,
                    "filter_settings": filter_settings,
                }))
                .map_err(|e| format!("Failed to emit dashboard restore event: {}", e))?;
        }

        Ok(())
    }
}