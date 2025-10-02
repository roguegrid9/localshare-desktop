import { useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type {
  WindowState,
  Tab,
  TabContentType,
  CreateTabRequest,
  DetachTabRequest,
  ReattachTabRequest,
  MoveTabRequest,
  AllWindowsResponse,
  WindowStateResponse,
  WindowPosition,
  WindowSize,
} from '../types/windows';

export function useWindowManager() {
  // Initialize window manager
  const initializeWindowManager = useCallback(async (): Promise<void> => {
    return await invoke('initialize_window_manager');
  }, []);

  // Get all windows
  const getAllWindows = useCallback(async (): Promise<AllWindowsResponse> => {
    return await invoke('get_all_windows');
  }, []);

  // Get specific window
  const getWindowState = useCallback(async (windowId: string): Promise<WindowStateResponse> => {
    return await invoke('get_window_state', { windowId });
  }, []);

  // Create a new tab
  const createTab = useCallback(async (request: CreateTabRequest): Promise<Tab> => {
    return await invoke('create_tab', { request });
  }, []);

  // Close a tab
  const closeTab = useCallback(async (windowId: string, tabId: string): Promise<void> => {
    return await invoke('close_tab', { windowId, tabId });
  }, []);

  // Activate a tab
  const activateTab = useCallback(async (windowId: string, tabId: string): Promise<void> => {
    return await invoke('activate_tab', { windowId, tabId });
  }, []);

  // Detach a tab into a new window
  const detachTab = useCallback(async (request: DetachTabRequest): Promise<WindowState> => {
    return await invoke('detach_tab', { request });
  }, []);

  // Reattach a tab to an existing window
  const reattachTab = useCallback(async (request: ReattachTabRequest): Promise<void> => {
    return await invoke('reattach_tab', { request });
  }, []);

  // Move a tab between windows or within the same window
  const moveTab = useCallback(async (request: MoveTabRequest): Promise<void> => {
    return await invoke('move_tab', { request });
  }, []);

  // Close a window
  const closeWindow = useCallback(async (windowId: string): Promise<void> => {
    return await invoke('close_window', { windowId });
  }, []);

  // Focus a window
  const focusWindow = useCallback(async (windowId: string): Promise<void> => {
    return await invoke('focus_window', { windowId });
  }, []);

  // Update tab title
  const updateTabTitle = useCallback(async (
    windowId: string,
    tabId: string,
    title: string
  ): Promise<void> => {
    return await invoke('update_tab_title', { windowId, tabId, title });
  }, []);

  // Set tab notification status
  const setTabNotification = useCallback(async (
    windowId: string,
    tabId: string,
    hasNotification: boolean
  ): Promise<void> => {
    return await invoke('set_tab_notification', { windowId, tabId, hasNotification });
  }, []);

  // Content-specific tab creation helpers
  const createTerminalTab = useCallback(async (
    sessionId: string,
    gridId?: string,
    title?: string,
    windowId?: string
  ): Promise<Tab> => {
    return await invoke('create_terminal_tab', { sessionId, gridId, title, windowId });
  }, []);

  const createTextChannelTab = useCallback(async (
    channelId: string,
    gridId: string,
    channelName: string,
    windowId?: string
  ): Promise<Tab> => {
    return await invoke('create_text_channel_tab', { 
      channelId, 
      gridId, 
      channelName, 
      windowId 
    });
  }, []);

  const createMediaChannelTab = useCallback(async (
    channelId: string,
    gridId: string,
    channelName: string,
    mediaType: string,
    windowId?: string
  ): Promise<Tab> => {
    return await invoke('create_media_channel_tab', { 
      channelId, 
      gridId, 
      channelName, 
      mediaType, 
      windowId 
    });
  }, []);

  // NEW: Create voice channel tab
  const createVoiceChannelTab = useCallback(async (
    channelId: string,
    gridId: string,
    channelName: string,
    windowId?: string
  ): Promise<Tab> => {
    return await invoke('create_voice_channel_tab', { 
      channelId, 
      gridId, 
      channelName, 
      windowId 
    });
  }, []);

  const createProcessTab = useCallback(async (
    processId: string,
    gridId: string,
    processName: string,
    windowId?: string
  ): Promise<Tab> => {
    return await invoke('create_process_tab', { 
      processId, 
      gridId, 
      processName, 
      windowId 
    });
  }, []);

  const createDirectMessageTab = useCallback(async (
    conversationId: string,
    userName: string,
    windowId?: string
  ): Promise<Tab> => {
    return await invoke('create_direct_message_tab', { 
      conversationId, 
      userName, 
      windowId 
    });
  }, []);

  const createGridDashboardTab = useCallback(async (
    gridId: string,
    gridName: string,
    windowId?: string
  ): Promise<Tab> => {
    return await invoke('create_grid_dashboard_tab', { 
      gridId, 
      gridName, 
      windowId 
    });
  }, []);

  const createWelcomeTab = useCallback(async (windowId?: string): Promise<Tab> => {
    return await invoke('create_welcome_tab', { windowId });
  }, []);

  // Get active tab for a window
  const getActiveTab = useCallback(async (windowId: string): Promise<Tab | null> => {
    return await invoke('get_active_tab', { windowId });
  }, []);

  // Check if window exists
  const windowExists = useCallback(async (windowId: string): Promise<boolean> => {
    return await invoke('window_exists', { windowId });
  }, []);

  // Get tab count for a window
  const getTabCount = useCallback(async (windowId: string): Promise<number> => {
    return await invoke('get_tab_count', { windowId });
  }, []);

  // State persistence
  const serializeWindowState = useCallback(async (): Promise<string> => {
    return await invoke('serialize_window_state');
  }, []);

  const restoreWindowState = useCallback(async (serializedState: string): Promise<void> => {
    return await invoke('restore_window_state', { serializedState });
  }, []);

  // Get window statistics for debugging
  const getWindowStats = useCallback(async (): Promise<Record<string, any>> => {
    return await invoke('get_window_stats');
  }, []);

  // Helper functions for creating tabs from existing selections
  const createTabFromSelection = useCallback(async (
    selectedChannelId?: string,
    selectedProcessId?: string,
    selectedDMId?: string,
    selectedGridId?: string,
    isDMMode?: boolean,
    grids?: any[]
  ): Promise<Tab | null> => {
    if (isDMMode && selectedDMId) {
      // Create DM tab
      const userName = "User"; // You might need to get this from your data
      return await createDirectMessageTab(selectedDMId, userName);
    }
    
    if (selectedChannelId && selectedGridId) {
      try {
        // First try to get channel details from the grid channels
        const gridChannels = await invoke<any[]>('get_grid_channels', { 
          gridId: selectedGridId 
        });
        
        // Find the channel in the grid channels list
        const channel = gridChannels.find(ch => ch.id === selectedChannelId);
        
        if (channel) {
          console.log('Found channel details:', channel);
          const channelName = channel.name || `Channel ${selectedChannelId.slice(0, 8)}`;
          
          // Check channel type and create appropriate tab
          if (channel.channel_type === 'voice') {
            return await createVoiceChannelTab(
              selectedChannelId,
              selectedGridId,
              channelName
            );
          } else if (channel.channel_type === 'video') {
            return await createMediaChannelTab(
              selectedChannelId,
              selectedGridId,
              channelName,
              channel.channel_type
            );
          } else {
            return await createTextChannelTab(
              selectedChannelId,
              selectedGridId,
              channelName
            );
          }
        } else {
          console.warn('Channel not found in grid channels, trying fallback');
          
          // Fallback: try the original get_channel_details method
          try {
            const channelDetails = await invoke<any>('get_channel_details', { 
              channelId: selectedChannelId 
            });
            
            const channelName = channelDetails.channel?.name || channelDetails.name || `Channel ${selectedChannelId.slice(0, 8)}`;
            
            return await createTextChannelTab(
              selectedChannelId, 
              selectedGridId, 
              channelName
            );
          } catch (detailsError) {
            console.error('Failed to get channel details:', detailsError);
            // Final fallback to a generic name
            return await createTextChannelTab(
              selectedChannelId, 
              selectedGridId, 
              `Channel ${selectedChannelId.slice(0, 8)}`
            );
          }
        }
      } catch (error) {
        console.error('Failed to get grid channels:', error);
        // Fallback to using channel ID if we can't get the name
        return await createTextChannelTab(
          selectedChannelId, 
          selectedGridId, 
          `Channel ${selectedChannelId.slice(0, 8)}`
        );
      }
    }
    
    if (selectedProcessId) {
      // Get process details to extract the display name
      try {
        const displayName = await invoke<string>('get_process_display_name', {
          processId: selectedProcessId
        });
        
        return await createProcessTab(
          selectedProcessId, 
          selectedGridId || "", 
          displayName // Use the terminal name instead of process ID
        );
      } catch (error) {
        console.error('Failed to get process display name:', error);
        // Fallback to process ID if we can't get the display name
        return await createProcessTab(
          selectedProcessId, 
          selectedGridId || "", 
          `Process ${selectedProcessId.slice(0, 8)}`
        );
      }
    }
    
    if (selectedGridId) {
      // Create grid dashboard tab
      const grid = grids?.find(g => g.id === selectedGridId);
      return await createGridDashboardTab(selectedGridId, grid?.name || "Grid");
    }
    
    // Default to welcome tab
    return await createWelcomeTab();
  }, [
    createDirectMessageTab,
    createTextChannelTab,
    createMediaChannelTab,
    createVoiceChannelTab, // NEW
    createProcessTab,
    createGridDashboardTab,
    createWelcomeTab
  ]);

  return useMemo(() => ({
    // Core window operations
    initializeWindowManager,
    getAllWindows,
    getWindowState,
    closeWindow,
    focusWindow,
    windowExists,
    getWindowStats,
    
    // Tab operations
    createTab,
    closeTab,
    activateTab,
    getActiveTab,
    getTabCount,
    updateTabTitle,
    setTabNotification,
    
    // Tab movement operations
    detachTab,
    reattachTab,
    moveTab,
    
    // Content-specific tab creation
    createTerminalTab,
    createTextChannelTab,
    createMediaChannelTab,
    createVoiceChannelTab, // NEW
    createProcessTab,
    createDirectMessageTab,
    createGridDashboardTab,
    createWelcomeTab,
    
    // Helper functions
    createTabFromSelection,
    
    // State persistence
    serializeWindowState,
    restoreWindowState,
  }), [
    initializeWindowManager,
    getAllWindows,
    getWindowState,
    closeWindow,
    focusWindow,
    windowExists,
    getWindowStats,
    createTab,
    closeTab,
    activateTab,
    getActiveTab,
    getTabCount,
    updateTabTitle,
    setTabNotification,
    detachTab,
    reattachTab,
    moveTab,
    createTerminalTab,
    createTextChannelTab,
    createMediaChannelTab,
    createVoiceChannelTab, // NEW
    createProcessTab,
    createDirectMessageTab,
    createGridDashboardTab,
    createWelcomeTab,
    createTabFromSelection,
    serializeWindowState,
    restoreWindowState,
  ]);
}