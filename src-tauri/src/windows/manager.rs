use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tauri::{AppHandle, Manager, WebviewWindowBuilder, WebviewUrl, WebviewWindow};
use serde_json;
use uuid::Uuid;
use tauri::Emitter;

use super::types::*;

/// Core window management system
#[derive(Clone)]
pub struct WindowManager {
    app_handle: AppHandle,
    windows: Arc<RwLock<HashMap<String, WindowState>>>,
    main_window_id: String,
}

impl WindowManager {
    pub fn new(app_handle: AppHandle) -> Self {
        let main_window_id = "main".to_string();
        let mut windows = HashMap::new();
        
        // Initialize the main window state
        let main_window = WindowState::new_main_window();
        windows.insert(main_window_id.clone(), main_window);

        Self {
            app_handle,
            windows: Arc::new(RwLock::new(windows)),
            main_window_id,
        }
    }

    /// Get all window states
    pub async fn get_all_windows(&self) -> Result<Vec<WindowState>, String> {
        let windows = self.windows.read().await;
        Ok(windows.values().cloned().collect())
    }

    /// Get a specific window state
    pub async fn get_window(&self, window_id: &str) -> Result<WindowState, String> {
        let windows = self.windows.read().await;
        windows.get(window_id)
            .cloned()
            .ok_or_else(|| format!("Window {} not found", window_id))
    }

    /// Get the main window
    pub async fn get_main_window(&self) -> Result<WindowState, String> {
        self.get_window(&self.main_window_id).await
    }

    /// Create a new tab in the specified window (defaults to main window)
    /// If a tab with matching content already exists, activate it instead
    pub async fn create_tab(
        &self,
        content: TabContentType,
        title: Option<String>,
        window_id: Option<String>,
    ) -> Result<Tab, String> {
        // Check if a tab with this content already exists
        if let Some((existing_window_id, existing_tab_id)) = self.find_existing_tab(&content).await {
            log::info!("Tab with matching content already exists (tab: {}, window: {}), activating it instead of creating new", existing_tab_id, existing_window_id);

            // Activate the existing tab
            self.activate_tab(&existing_window_id, &existing_tab_id).await?;

            // Focus the window containing the tab
            if let Err(e) = self.focus_window(&existing_window_id).await {
                log::warn!("Failed to focus window {}: {}", existing_window_id, e);
            }

            // Get and return the existing tab
            let windows = self.windows.read().await;
            let window = windows.get(&existing_window_id)
                .ok_or_else(|| format!("Window {} not found", existing_window_id))?;
            let tab = window.tabs.iter().find(|t| t.id == existing_tab_id)
                .ok_or("Tab not found")?
                .clone();

            return Ok(tab);
        }

        // No existing tab found, create a new one
        let target_window_id = window_id.unwrap_or_else(|| self.main_window_id.clone());
        let tab = Tab::new(content, title);

        {
            let mut windows = self.windows.write().await;
            let window = windows.get_mut(&target_window_id)
                .ok_or_else(|| format!("Window {} not found", target_window_id))?;

            window.add_tab(tab.clone())?;
        }

        // Emit window state change event
        self.emit_window_event(WindowEventType::TabCreated, &target_window_id, Some(&tab.id)).await?;

        log::info!("Created new tab {} in window {}", tab.id, target_window_id);
        Ok(tab)
    }

    /// Close a tab
    pub async fn close_tab(&self, window_id: &str, tab_id: &str) -> Result<(), String> {
        let _removed_tab = {
            let mut windows = self.windows.write().await;
            let window = windows.get_mut(window_id)
                .ok_or_else(|| format!("Window {} not found", window_id))?;
            
            // Don't allow closing non-closable tabs
            if let Some(tab) = window.tabs.iter().find(|t| t.id == tab_id) {
                if !tab.is_closable {
                    return Err("This tab cannot be closed".to_string());
                }
            }

            window.remove_tab(tab_id)?
        };

        // If the window is now empty and it's not the main window, close it
        let should_close_window = {
            let windows = self.windows.read().await;
            if let Some(window) = windows.get(window_id) {
                window.is_empty() && !window.is_main_window
            } else {
                false
            }
        };

        if should_close_window {
            self.close_window(window_id).await?;
        } else {
            // Emit tab closed event
            self.emit_window_event(WindowEventType::TabClosed, window_id, Some(tab_id)).await?;
        }

        log::info!("Closed tab {} from window {}", tab_id, window_id);
        Ok(())
    }

    /// Activate a tab in a window
    pub async fn activate_tab(&self, window_id: &str, tab_id: &str) -> Result<(), String> {
        {
            let mut windows = self.windows.write().await;
            let window = windows.get_mut(window_id)
                .ok_or_else(|| format!("Window {} not found", window_id))?;
            
            window.activate_tab(tab_id)?;
        }

        // Emit tab activated event
        self.emit_window_event(WindowEventType::TabActivated, window_id, Some(tab_id)).await?;

        log::info!("Activated tab {} in window {}", tab_id, window_id);
        Ok(())
    }

    /// Detach a tab into a new window
    pub async fn detach_tab(
        &self,
        source_window_id: &str,
        tab_id: &str,
        config: Option<WindowConfig>,
    ) -> Result<WindowState, String> {
        // Get the tab from the source window
        let tab = {
            let mut windows = self.windows.write().await;
            let source_window = windows.get_mut(source_window_id)
                .ok_or_else(|| format!("Source window {} not found", source_window_id))?;
            
            // Don't allow detaching from main window if it would leave it empty
            if false {
                return Err("Cannot detach the last tab from the main window".to_string());
            }

            source_window.remove_tab(tab_id)?
        };

        // Create new detached window
        let window_config = config.unwrap_or_default();
        let new_window = WindowState::new_detached_window(
            format!("{} - Detached", tab.title),
            Some(tab.clone())
        );

        // Create the actual Tauri window
        let window_url = WebviewUrl::App("index.html".into());
        let tauri_window = WebviewWindowBuilder::new(
            &self.app_handle,
            &new_window.label,
            window_url,
        )
        .title(&window_config.title)
        .inner_size(window_config.width as f64, window_config.height as f64)
        .min_inner_size(
            window_config.min_width.unwrap_or(800) as f64,
            window_config.min_height.unwrap_or(600) as f64,
        )
        .resizable(window_config.resizable)
        .maximized(window_config.maximized)
        .visible(window_config.visible)
        .always_on_top(window_config.always_on_top);

        let tauri_window = if let Some(pos) = &window_config.position {
            tauri_window.position(pos.x as f64, pos.y as f64)
        } else {
            tauri_window.center()
        };

        let window = tauri_window.build()
            .map_err(|e| format!("Failed to create Tauri window: {}", e))?;

        // Store the window state
        {
            let mut windows = self.windows.write().await;
            windows.insert(new_window.id.clone(), new_window.clone());
        }

        // Emit events
        self.emit_window_event(WindowEventType::WindowCreated, &new_window.id, None).await?;
        self.emit_window_event(WindowEventType::TabDetached, &new_window.id, Some(&tab.id)).await?;

        // Set up window event handlers
        self.setup_window_event_handlers(&window, &new_window.id).await?;

        // Emit initialization event with tab data to the new window
        window.emit("initialize-detached-tab", serde_json::json!({
            "tab": tab,
            "window_id": new_window.id
        })).map_err(|e| format!("Failed to emit tab initialization event: {}", e))?;

        log::info!("Detached tab {} from window {} to new window {}", tab_id, source_window_id, new_window.id);
        Ok(new_window)
    }

    /// Reattach a tab from one window to another
    pub async fn reattach_tab(
        &self,
        source_window_id: &str,
        target_window_id: &str,
        tab_id: &str,
        position_index: Option<usize>,
    ) -> Result<(), String> {
        // Remove tab from source window
        let mut tab = {
            let mut windows = self.windows.write().await;
            let source_window = windows.get_mut(source_window_id)
                .ok_or_else(|| format!("Source window {} not found", source_window_id))?;
            
            // Don't allow reattaching from main window if it would leave it empty
            if source_window.is_main_window && source_window.tab_count() <= 1 {
                return Err("Cannot reattach the last tab from the main window".to_string());
            }

            source_window.remove_tab(tab_id)?
        };

        // Add tab to target window
        {
            let mut windows = self.windows.write().await;
            let target_window = windows.get_mut(target_window_id)
                .ok_or_else(|| format!("Target window {} not found", target_window_id))?;

            // If position_index is specified, insert at that position
            if let Some(index) = position_index {
                // Deactivate all existing tabs
                for existing_tab in &mut target_window.tabs {
                    existing_tab.deactivate();
                }
                
                tab.activate();
                target_window.active_tab_id = Some(tab.id.clone());
                
                let insert_index = index.min(target_window.tabs.len());
                target_window.tabs.insert(insert_index, tab.clone());
            } else {
                target_window.add_tab(tab.clone())?;
            }
        }

        // Close source window if it's empty and not the main window
        let should_close_source = {
            let windows = self.windows.read().await;
            if let Some(source_window) = windows.get(source_window_id) {
                source_window.is_empty() && !source_window.is_main_window
            } else {
                false
            }
        };

        if should_close_source {
            self.close_window(source_window_id).await?;
        }

        // Emit events
        self.emit_window_event(WindowEventType::TabMoved, target_window_id, Some(&tab.id)).await?;
        self.emit_window_event(WindowEventType::TabReattached, target_window_id, Some(&tab.id)).await?;

        log::info!("Reattached tab {} from window {} to window {}", tab_id, source_window_id, target_window_id);
        Ok(())
    }

    /// Move a tab to a different position within the same window or to another window
    pub async fn move_tab(
        &self,
        source_window_id: &str,
        target_window_id: &str,
        tab_id: &str,
        position_index: usize,
    ) -> Result<(), String> {
        if source_window_id == target_window_id {
            // Move within the same window
            let mut windows = self.windows.write().await;
            let window = windows.get_mut(source_window_id)
                .ok_or_else(|| format!("Window {} not found", source_window_id))?;

            let current_index = window.tabs.iter().position(|t| t.id == tab_id)
                .ok_or("Tab not found")?;

            let tab = window.tabs.remove(current_index);
            let new_index = position_index.min(window.tabs.len());
            window.tabs.insert(new_index, tab);
        } else {
            // Move to different window (same as reattach)
            self.reattach_tab(source_window_id, target_window_id, tab_id, Some(position_index)).await?;
        }

        // Emit tab moved event
        self.emit_window_event(WindowEventType::TabMoved, target_window_id, Some(tab_id)).await?;

        Ok(())
    }

    /// Close a window
    pub async fn close_window(&self, window_id: &str) -> Result<(), String> {
        // Don't allow closing the main window
        if window_id == self.main_window_id {
            return Err("Cannot close the main window".to_string());
        }

        // Get window state before closing
        let window_state = {
            let mut windows = self.windows.write().await;
            windows.remove(window_id)
                .ok_or_else(|| format!("Window {} not found", window_id))?
        };

        // Close the actual Tauri window
        if let Some(tauri_window) = self.app_handle.get_webview_window(&window_state.label) {
            tauri_window.close()
                .map_err(|e| format!("Failed to close Tauri window: {}", e))?;
        }

        // Emit window closed event
        self.emit_window_event(WindowEventType::WindowClosed, window_id, None).await?;

        log::info!("Closed window {}", window_id);
        Ok(())
    }

    /// Update tab notification status
    pub async fn set_tab_notification(
        &self,
        window_id: &str,
        tab_id: &str,
        has_notification: bool,
    ) -> Result<(), String> {
        {
            let mut windows = self.windows.write().await;
            let window = windows.get_mut(window_id)
                .ok_or_else(|| format!("Window {} not found", window_id))?;
            
            let tab = window.tabs.iter_mut().find(|t| t.id == tab_id)
                .ok_or("Tab not found")?;
            
            tab.set_notification(has_notification);
        }

        // Emit state change to frontend
        self.emit_window_state_change().await?;

        Ok(())
    }

    /// Update tab title
    pub async fn update_tab_title(
        &self,
        window_id: &str,
        tab_id: &str,
        title: String,
    ) -> Result<(), String> {
        {
            let mut windows = self.windows.write().await;
            let window = windows.get_mut(window_id)
                .ok_or_else(|| format!("Window {} not found", window_id))?;
            
            let tab = window.tabs.iter_mut().find(|t| t.id == tab_id)
                .ok_or("Tab not found")?;
            
            tab.update_title(title);
        }

        // Emit state change to frontend
        self.emit_window_state_change().await?;

        Ok(())
    }

    /// Focus a window
    pub async fn focus_window(&self, window_id: &str) -> Result<(), String> {
        let window_state = {
            let windows = self.windows.read().await;
            windows.get(window_id)
                .ok_or_else(|| format!("Window {} not found", window_id))?
                .clone()
        };

        // Focus the actual Tauri window
        if let Some(tauri_window) = self.app_handle.get_webview_window(&window_state.label) {
            tauri_window.set_focus()
                .map_err(|e| format!("Failed to focus window: {}", e))?;
        }
        // Emit window focused event
        self.emit_window_event(WindowEventType::WindowFocused, window_id, None).await?;

        Ok(())
    }

    /// Set up event handlers for a Tauri window
    async fn setup_window_event_handlers(
        &self,
        window: &WebviewWindow,
        new_window_id: &str,
    ) -> Result<(), String> {
        let window_id = new_window_id.to_string();
        let windows_clone = self.windows.clone();
        let app_handle = self.app_handle.clone();

        // Handle window close event
        let window_id_clone = window_id.clone();
        let windows_clone2 = windows_clone.clone();
        window.on_window_event(move |event| {
            match event {
                tauri::WindowEvent::CloseRequested { .. } => {
                    let window_id = window_id_clone.clone();
                    let windows = windows_clone2.clone();
                    let app_handle = app_handle.clone();
                    
                    tauri::async_runtime::spawn(async move {
                        // Remove from our window state
                        {
                            let mut windows = windows.write().await;
                            windows.remove(&window_id);
                        }
                        
                        // Emit window closed event
                        if let Err(e) = app_handle.emit("window-closed", serde_json::json!({
                            "window_id": window_id
                        })) {
                            log::error!("Failed to emit window closed event: {}", e);
                        }
                    });
                },
                _ => {}
            }
        });

        Ok(())
    }

    /// Emit a window event to all windows
    async fn emit_window_event(
        &self,
        event_type: WindowEventType,
        window_id: &str,
        tab_id: Option<&str>,
    ) -> Result<(), String> {
        let event = WindowStateChangeEvent {
            event_type,
            window_id: window_id.to_string(),
            tab_id: tab_id.map(|s| s.to_string()),
            data: serde_json::json!({}),
            timestamp: chrono::Utc::now(),
        };

        self.app_handle
            .emit("window-state-change", &event)
            .map_err(|e| format!("Failed to emit window event: {}", e))?;

        Ok(())
    }

    /// Emit current window state to all windows
    async fn emit_window_state_change(&self) -> Result<(), String> {
        let windows = self.get_all_windows().await?;
        
        self.app_handle
            .emit("window-state-updated", AllWindowsResponse { 
                windows,
                main_window_id: self.main_window_id.clone() 
            })
            .map_err(|e| format!("Failed to emit window state: {}", e))?;

        Ok(())
    }

    /// Get window statistics for debugging
    pub async fn get_window_stats(&self) -> HashMap<String, serde_json::Value> {
        let windows = self.windows.read().await;
        let mut stats = HashMap::new();

        stats.insert("total_windows".to_string(), serde_json::json!(windows.len()));
        stats.insert("main_window_id".to_string(), serde_json::json!(self.main_window_id));

        let mut tab_counts = HashMap::new();
        let mut window_types = HashMap::new();

        for window in windows.values() {
            tab_counts.insert(window.id.clone(), window.tabs.len());
            window_types.insert(window.id.clone(), format!("{:?}", window.window_type));
        }

        stats.insert("tab_counts".to_string(), serde_json::json!(tab_counts));
        stats.insert("window_types".to_string(), serde_json::json!(window_types));

        stats
    }

    /// Find an existing tab with matching content across all windows
    /// Returns (window_id, tab_id) if found
    pub async fn find_existing_tab(&self, content: &TabContentType) -> Option<(String, String)> {
        let windows = self.windows.read().await;

        for (window_id, window) in windows.iter() {
            for tab in &window.tabs {
                if tab.content.matches(content) {
                    log::info!("Found existing tab {} in window {} matching content", tab.id, window_id);
                    return Some((window_id.clone(), tab.id.clone()));
                }
            }
        }

        None
    }

    /// Close all tabs belonging to a specific grid
    /// Returns list of closed tab IDs
    pub async fn close_tabs_by_grid(&self, grid_id: &str) -> Result<Vec<String>, String> {
        log::info!("Closing all tabs for grid: {}", grid_id);
        let mut closed_tabs = Vec::new();

        // Collect tabs to close (window_id, tab_id)
        let tabs_to_close: Vec<(String, String)> = {
            let windows = self.windows.read().await;
            windows.iter()
                .flat_map(|(window_id, window)| {
                    window.tabs.iter()
                        .filter(|tab| tab.content.get_grid_id() == Some(grid_id))
                        .map(|tab| (window_id.clone(), tab.id.clone()))
                        .collect::<Vec<_>>()
                })
                .collect()
        };

        // Close each tab
        for (window_id, tab_id) in tabs_to_close {
            log::info!("Closing tab {} from window {} (belongs to grid {})", tab_id, window_id, grid_id);
            if let Err(e) = self.close_tab(&window_id, &tab_id).await {
                log::warn!("Failed to close tab {} from window {}: {}", tab_id, window_id, e);
            } else {
                closed_tabs.push(tab_id);
            }
        }

        log::info!("Closed {} tabs for grid {}", closed_tabs.len(), grid_id);
        Ok(closed_tabs)
    }

    /// Close all tabs belonging to a specific process
    /// Returns list of closed tab IDs
    pub async fn close_tabs_by_process(&self, process_id: &str) -> Result<Vec<String>, String> {
        log::info!("Closing all tabs for process: {}", process_id);
        let mut closed_tabs = Vec::new();

        // Collect tabs to close (window_id, tab_id)
        let tabs_to_close: Vec<(String, String)> = {
            let windows = self.windows.read().await;
            windows.iter()
                .flat_map(|(window_id, window)| {
                    window.tabs.iter()
                        .filter(|tab| tab.content.get_process_id() == Some(process_id))
                        .map(|tab| (window_id.clone(), tab.id.clone()))
                        .collect::<Vec<_>>()
                })
                .collect()
        };

        // Close each tab
        for (window_id, tab_id) in tabs_to_close {
            log::info!("Closing tab {} from window {} (belongs to process {})", tab_id, window_id, process_id);
            if let Err(e) = self.close_tab(&window_id, &tab_id).await {
                log::warn!("Failed to close tab {} from window {}: {}", tab_id, window_id, e);
            } else {
                closed_tabs.push(tab_id);
            }
        }

        log::info!("Closed {} tabs for process {}", closed_tabs.len(), process_id);
        Ok(closed_tabs)
    }

    /// Close all tabs belonging to a specific channel
    /// Returns list of closed tab IDs
    pub async fn close_tabs_by_channel(&self, channel_id: &str) -> Result<Vec<String>, String> {
        log::info!("Closing all tabs for channel: {}", channel_id);
        let mut closed_tabs = Vec::new();

        // Collect tabs to close (window_id, tab_id)
        let tabs_to_close: Vec<(String, String)> = {
            let windows = self.windows.read().await;
            windows.iter()
                .flat_map(|(window_id, window)| {
                    window.tabs.iter()
                        .filter(|tab| tab.content.get_channel_id() == Some(channel_id))
                        .map(|tab| (window_id.clone(), tab.id.clone()))
                        .collect::<Vec<_>>()
                })
                .collect()
        };

        // Close each tab
        for (window_id, tab_id) in tabs_to_close {
            log::info!("Closing tab {} from window {} (belongs to channel {})", tab_id, window_id, channel_id);
            if let Err(e) = self.close_tab(&window_id, &tab_id).await {
                log::warn!("Failed to close tab {} from window {}: {}", tab_id, window_id, e);
            } else {
                closed_tabs.push(tab_id);
            }
        }

        log::info!("Closed {} tabs for channel {}", closed_tabs.len(), channel_id);
        Ok(closed_tabs)
    }

    /// Serialize window state for persistence
    pub async fn serialize_state(&self) -> Result<String, String> {
        let windows = self.windows.read().await;
        serde_json::to_string(&*windows)
            .map_err(|e| format!("Failed to serialize window state: {}", e))
    }

    /// Restore window state from serialized data
    pub async fn restore_state(&self, serialized_state: &str) -> Result<(), String> {
        let restored_windows: HashMap<String, WindowState> = serde_json::from_str(serialized_state)
            .map_err(|e| format!("Failed to deserialize window state: {}", e))?;

        // Validate that main window exists
        if !restored_windows.contains_key(&self.main_window_id) {
            return Err("Restored state missing main window".to_string());
        }

        // Update our state
        {
            let mut windows = self.windows.write().await;
            *windows = restored_windows;
        }

        // Emit state change
        self.emit_window_state_change().await?;

        log::info!("Successfully restored window state");
        Ok(())
    }
}