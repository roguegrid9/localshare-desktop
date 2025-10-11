use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// Represents different types of content that can be displayed in a tab
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum TabContentType {
    /// Terminal session content
    Terminal {
        session_id: String,
        grid_id: Option<String>,
        title: String,
    },
    /// Text channel content
    TextChannel {
        channel_id: String,
        grid_id: String,
        channel_name: String,
    },
    /// Voice/Video channel content
    MediaChannel {
        channel_id: String,
        grid_id: String,
        channel_name: String,
        media_type: MediaType,
    },
    /// Voice channel content
    VoiceChannel {
        data: VoiceChannelData,
    },
    /// Process management content
    Process {
        process_id: String,
        grid_id: String,
        process_name: String,
    },
    /// Direct message conversation
    DirectMessage {
        conversation_id: String,
        user_name: String,
    },
    /// Grid dashboard/overview
    GridDashboard {
        grid_id: String,
        grid_name: String,
    },
    /// Welcome/empty state
    Welcome,
}

/// Data structure for voice channels
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceChannelData {
    pub channel_id: String,
    pub grid_id: String,
    pub channel_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MediaType {
    Voice,
    Video,
    Both,
}

/// Represents a tab within a window
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tab {
    pub id: String,
    pub title: String,
    pub content: TabContentType,
    pub is_active: bool,
    pub is_closable: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub last_accessed: chrono::DateTime<chrono::Utc>,
    /// Optional icon identifier for the tab
    pub icon: Option<String>,
    /// Whether this tab has unsaved changes or notifications
    pub has_notifications: bool,
    /// Custom metadata for specific tab types
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Represents a window containing multiple tabs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowState {
    pub id: String,
    pub label: String,
    pub title: String,
    pub tabs: Vec<Tab>,
    pub active_tab_id: Option<String>,
    pub window_type: WindowType,
    pub is_main_window: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub position: Option<WindowPosition>,
    pub size: Option<WindowSize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WindowType {
    /// The main application window
    Main,
    /// A detached window containing specific content
    Detached,
    /// A popup window for specific actions
    Popup,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowPosition {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowSize {
    pub width: u32,
    pub height: u32,
}

/// Request to create a new tab
#[derive(Debug, Deserialize)]
pub struct CreateTabRequest {
    pub content: TabContentType,
    pub title: Option<String>,
    pub window_id: Option<String>,
}

/// Request to detach a tab into a new window
#[derive(Debug, Deserialize)]
pub struct DetachTabRequest {
    pub tab_id: String,
    pub source_window_id: String,
    pub position: Option<WindowPosition>,
    pub size: Option<WindowSize>,
}

/// Request to reattach a tab to an existing window
#[derive(Debug, Deserialize)]
pub struct ReattachTabRequest {
    pub tab_id: String,
    pub source_window_id: String,
    pub target_window_id: String,
    pub position_index: Option<usize>,
}

/// Request to move a tab between windows
#[derive(Debug, Deserialize)]
pub struct MoveTabRequest {
    pub tab_id: String,
    pub source_window_id: String,
    pub target_window_id: String,
    pub position_index: Option<usize>,
}

/// Response containing window state
#[derive(Debug, Serialize)]
pub struct WindowStateResponse {
    pub window: WindowState,
}

/// Response containing all windows
#[derive(Debug, Serialize, Clone)]
pub struct AllWindowsResponse {
    pub windows: Vec<WindowState>,
    pub main_window_id: String,
}

/// Event sent when window state changes
#[derive(Debug, Clone, Serialize)]
pub struct WindowStateChangeEvent {
    pub event_type: WindowEventType,
    pub window_id: String,
    pub tab_id: Option<String>,
    pub data: serde_json::Value,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub enum WindowEventType {
    WindowCreated,
    WindowClosed,
    TabCreated,
    TabClosed,
    TabMoved,
    TabActivated,
    TabDetached,
    TabReattached,
    WindowFocused,
    WindowResized,
    WindowMoved,
}

/// Configuration for creating a new window
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowConfig {
    pub title: String,
    pub width: u32,
    pub height: u32,
    pub min_width: Option<u32>,
    pub min_height: Option<u32>,
    pub position: Option<WindowPosition>,
    pub resizable: bool,
    pub maximized: bool,
    pub visible: bool,
    pub always_on_top: bool,
}

impl Default for WindowConfig {
    fn default() -> Self {
        Self {
            title: "RogueGrid9".to_string(),
            width: 1200,
            height: 800,
            min_width: Some(800),
            min_height: Some(600),
            position: None,
            resizable: true,
            maximized: false,
            visible: true,
            always_on_top: false,
        }
    }
}

impl Tab {
    pub fn new(content: TabContentType, title: Option<String>) -> Self {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now();
        
        let (default_title, icon) = match &content {
            TabContentType::Terminal { title, .. } => (title.clone(), Some("terminal".to_string())),
            TabContentType::TextChannel { channel_name, .. } => (format!("#{}", channel_name), Some("hash".to_string())),
            TabContentType::MediaChannel { channel_name, media_type, .. } => {
                let icon = match media_type {
                    MediaType::Voice => "mic",
                    MediaType::Video => "video",
                    MediaType::Both => "video-camera",
                };
                (format!("{}", channel_name), Some(icon.to_string()))
            },
            TabContentType::VoiceChannel { data } => {
                (format!("{}", data.channel_name), Some("mic".to_string()))
            },
            TabContentType::Process { process_name, .. } => (process_name.clone(), Some("cog".to_string())),
            TabContentType::DirectMessage { user_name, .. } => (user_name.clone(), Some("user".to_string())),
            TabContentType::GridDashboard { grid_name, .. } => (format!("{} Dashboard", grid_name), Some("grid".to_string())),
            TabContentType::Welcome => ("Welcome".to_string(), Some("home".to_string())),
        };

        Self {
            id,
            title: title.unwrap_or(default_title),
            content,
            is_active: false,
            is_closable: true,
            created_at: now,
            last_accessed: now,
            icon,
            has_notifications: false,
            metadata: HashMap::new(),
        }
    }


    pub fn activate(&mut self) {
        self.is_active = true;
        self.last_accessed = chrono::Utc::now();
    }

    pub fn deactivate(&mut self) {
        self.is_active = false;
    }

    pub fn set_notification(&mut self, has_notification: bool) {
        self.has_notifications = has_notification;
    }

    pub fn update_title(&mut self, title: String) {
        self.title = title;
    }
}

impl WindowState {
    pub fn new_main_window() -> Self {
        let id = "main".to_string();
        let now = chrono::Utc::now();

        Self {
            id,
            label: "main".to_string(),
            title: "RogueGrid9".to_string(),
            tabs: vec![],
            active_tab_id: None,
            window_type: WindowType::Main,
            is_main_window: true,
            created_at: now,
            position: None,
            size: None,
        }
    }

    pub fn new_detached_window(title: String, initial_tab: Option<Tab>) -> Self {
        let id = Uuid::new_v4().to_string();
        let label = format!("detached-{}", id);
        let now = chrono::Utc::now();

        let mut tabs = vec![];
        let mut active_tab_id = None;

        if let Some(mut tab) = initial_tab {
            tab.activate();
            active_tab_id = Some(tab.id.clone());
            tabs.push(tab);
        }

        Self {
            id,
            label,
            title,
            tabs,
            active_tab_id,
            window_type: WindowType::Detached,
            is_main_window: false,
            created_at: now,
            position: None,
            size: None,
        }
    }

    pub fn add_tab(&mut self, mut tab: Tab) -> Result<(), String> {
        // Check if tab already exists
        if self.tabs.iter().any(|t| t.id == tab.id) {
            return Err("Tab already exists in this window".to_string());
        }

        // Deactivate all tabs
        for existing_tab in &mut self.tabs {
            existing_tab.deactivate();
        }

        // Activate the new tab
        tab.activate();
        self.active_tab_id = Some(tab.id.clone());
        self.tabs.push(tab);

        Ok(())
    }

    pub fn remove_tab(&mut self, tab_id: &str) -> Result<Tab, String> {
        let tab_index = self.tabs.iter().position(|t| t.id == tab_id)
            .ok_or("Tab not found")?;

        let removed_tab = self.tabs.remove(tab_index);

        // If we removed the active tab, activate another one
        if Some(tab_id) == self.active_tab_id.as_deref() {
            self.active_tab_id = None;
            
            // Try to activate the tab at the same index, or the previous one
            let new_index = tab_index.min(self.tabs.len().saturating_sub(1));
            if let Some(new_active_tab) = self.tabs.get_mut(new_index) {
                new_active_tab.activate();
                self.active_tab_id = Some(new_active_tab.id.clone());
            }
        }

        Ok(removed_tab)
    }

    pub fn activate_tab(&mut self, tab_id: &str) -> Result<(), String> {
        // Deactivate all tabs
        for tab in &mut self.tabs {
            tab.deactivate();
        }

        // Activate the specified tab
        let tab = self.tabs.iter_mut().find(|t| t.id == tab_id)
            .ok_or("Tab not found")?;
        
        tab.activate();
        self.active_tab_id = Some(tab_id.to_string());

        Ok(())
    }

    pub fn get_active_tab(&self) -> Option<&Tab> {
        if let Some(active_id) = &self.active_tab_id {
            self.tabs.iter().find(|t| t.id == *active_id)
        } else {
            None
        }
    }

    pub fn get_active_tab_mut(&mut self) -> Option<&mut Tab> {
        if let Some(active_id) = &self.active_tab_id {
            let active_id = active_id.clone();
            self.tabs.iter_mut().find(|t| t.id == active_id)
        } else {
            None
        }
    }

    pub fn is_empty(&self) -> bool {
        self.tabs.is_empty()
    }

    pub fn tab_count(&self) -> usize {
        self.tabs.len()
    }
}

impl TabContentType {
    /// Check if two tab contents represent the same resource
    /// Used for duplicate detection when opening tabs
    pub fn matches(&self, other: &TabContentType) -> bool {
        match (self, other) {
            // Terminal tabs match if they have the same session ID
            (TabContentType::Terminal { session_id: sid1, .. }, TabContentType::Terminal { session_id: sid2, .. }) => {
                sid1 == sid2
            },
            // Text channels match if they have the same channel_id and grid_id
            (
                TabContentType::TextChannel { channel_id: cid1, grid_id: gid1, .. },
                TabContentType::TextChannel { channel_id: cid2, grid_id: gid2, .. }
            ) => {
                cid1 == cid2 && gid1 == gid2
            },
            // Media channels match if they have the same channel_id and grid_id
            (
                TabContentType::MediaChannel { channel_id: cid1, grid_id: gid1, .. },
                TabContentType::MediaChannel { channel_id: cid2, grid_id: gid2, .. }
            ) => {
                cid1 == cid2 && gid1 == gid2
            },
            // Voice channels match if they have the same channel_id and grid_id
            (
                TabContentType::VoiceChannel { data: data1 },
                TabContentType::VoiceChannel { data: data2 }
            ) => {
                data1.channel_id == data2.channel_id && data1.grid_id == data2.grid_id
            },
            // Cross-match: VoiceChannel and MediaChannel with Voice type
            (
                TabContentType::VoiceChannel { data },
                TabContentType::MediaChannel { channel_id, grid_id, media_type: MediaType::Voice, .. }
            ) | (
                TabContentType::MediaChannel { channel_id, grid_id, media_type: MediaType::Voice, .. },
                TabContentType::VoiceChannel { data }
            ) => {
                &data.channel_id == channel_id && &data.grid_id == grid_id
            },
            // Processes match if they have the same process_id and grid_id
            (
                TabContentType::Process { process_id: pid1, grid_id: gid1, .. },
                TabContentType::Process { process_id: pid2, grid_id: gid2, .. }
            ) => {
                pid1 == pid2 && gid1 == gid2
            },
            // Direct messages match if they have the same conversation_id
            (
                TabContentType::DirectMessage { conversation_id: cid1, .. },
                TabContentType::DirectMessage { conversation_id: cid2, .. }
            ) => {
                cid1 == cid2
            },
            // Grid dashboards match if they have the same grid_id
            (
                TabContentType::GridDashboard { grid_id: gid1, .. },
                TabContentType::GridDashboard { grid_id: gid2, .. }
            ) => {
                gid1 == gid2
            },
            // Welcome tabs always match (there should only be one)
            (TabContentType::Welcome, TabContentType::Welcome) => true,
            // Different types never match
            _ => false,
        }
    }

    /// Extract the grid_id from the content if it exists
    pub fn get_grid_id(&self) -> Option<&str> {
        match self {
            TabContentType::Terminal { grid_id: Some(gid), .. } => Some(gid.as_str()),
            TabContentType::TextChannel { grid_id, .. } => Some(grid_id.as_str()),
            TabContentType::MediaChannel { grid_id, .. } => Some(grid_id.as_str()),
            TabContentType::VoiceChannel { data } => Some(data.grid_id.as_str()),
            TabContentType::Process { grid_id, .. } => Some(grid_id.as_str()),
            TabContentType::GridDashboard { grid_id, .. } => Some(grid_id.as_str()),
            _ => None,
        }
    }

    /// Extract the process_id from the content if it exists
    pub fn get_process_id(&self) -> Option<&str> {
        match self {
            TabContentType::Process { process_id, .. } => Some(process_id.as_str()),
            _ => None,
        }
    }

    /// Extract the channel_id from the content if it exists
    pub fn get_channel_id(&self) -> Option<&str> {
        match self {
            TabContentType::TextChannel { channel_id, .. } => Some(channel_id.as_str()),
            TabContentType::MediaChannel { channel_id, .. } => Some(channel_id.as_str()),
            TabContentType::VoiceChannel { data } => Some(data.channel_id.as_str()),
            _ => None,
        }
    }
}
