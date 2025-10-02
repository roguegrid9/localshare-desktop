import React, { createContext, useContext, useEffect, ReactNode } from 'react';
import { useWindowState } from '../../hooks/useWindowState';
import { useToast } from '../ui/Toaster';
import type { WindowState, Tab, TabContentType } from '../../types/windows';

interface WindowStateContextType {
  // State
  windows: WindowState[];
  mainWindowId: string;
  isInitialized: boolean;
  error: string | null;
  
  // Window operations
  getWindow: (windowId: string) => WindowState | undefined;
  getMainWindow: () => WindowState | undefined;
  getActiveTab: (windowId: string) => Tab | undefined;
  
  // Tab operations with toast notifications
  createTerminalTab: (sessionId: string, gridId?: string, title?: string, windowId?: string) => Promise<Tab>;
  createTextChannelTab: (channelId: string, gridId: string, channelName: string, windowId?: string) => Promise<Tab>;
  createProcessTab: (processId: string, gridId: string, processName: string, windowId?: string) => Promise<Tab>;
  createDirectMessageTab: (conversationId: string, userName: string, windowId?: string) => Promise<Tab>;
  createGridDashboardTab: (gridId: string, gridName: string, windowId?: string) => Promise<Tab>;
  
  // Tab management
  activateTab: (windowId: string, tabId: string) => Promise<void>;
  closeTab: (windowId: string, tabId: string) => Promise<void>;
  detachTab: (tabId: string, sourceWindowId: string, position?: { x: number; y: number }) => Promise<void>;
  
  // Utility
  refreshWindows: () => Promise<void>;
  stats: {
    totalWindows: number;
    totalTabs: number;
    tabsWithNotifications: number;
    windowsWithTabs: number;
    emptyWindows: number;
  };
}

const WindowStateContext = createContext<WindowStateContextType | undefined>(undefined);

interface WindowStateProviderProps {
  children: ReactNode;
}

export function WindowStateProvider({ children }: WindowStateProviderProps) {
  const windowState = useWindowState();
  const addToast = useToast();

  // Initialize on mount
  useEffect(() => {
    if (!windowState.isInitialized) {
      windowState.initialize();
    }
  }, [windowState.initialize, windowState.isInitialized]);

  // Show error toasts
  useEffect(() => {
    if (windowState.error) {
      addToast(windowState.error, 'error');
    }
  }, [windowState.error, addToast]);

  // Enhanced tab creation functions with error handling and toasts
  const createTerminalTabWithToast = async (
    sessionId: string, 
    gridId?: string, 
    title?: string, 
    windowId?: string
  ): Promise<Tab> => {
    try {
      const tab = await windowState.createTerminalTab(sessionId, gridId, title, windowId);
      addToast(`Terminal tab "${tab.title}" created`, 'success');
      return tab;
    } catch (error) {
      addToast(`Failed to create terminal tab: ${error}`, 'error');
      throw error;
    }
  };

  const createTextChannelTabWithToast = async (
    channelId: string, 
    gridId: string, 
    channelName: string, 
    windowId?: string
  ): Promise<Tab> => {
    try {
      const tab = await windowState.createTextChannelTab(channelId, gridId, channelName, windowId);
      addToast(`Channel tab "#${channelName}" opened`, 'success');
      return tab;
    } catch (error) {
      addToast(`Failed to open channel: ${error}`, 'error');
      throw error;
    }
  };

  const createProcessTabWithToast = async (
    processId: string, 
    gridId: string, 
    processName: string, 
    windowId?: string
  ): Promise<Tab> => {
    try {
      const tab = await windowState.createProcessTab(processId, gridId, processName, windowId);
      addToast(`Process "${processName}" opened`, 'success');
      return tab;
    } catch (error) {
      addToast(`Failed to open process: ${error}`, 'error');
      throw error;
    }
  };

  const createDirectMessageTabWithToast = async (
    conversationId: string, 
    userName: string, 
    windowId?: string
  ): Promise<Tab> => {
    try {
      const tab = await windowState.createDirectMessageTab(conversationId, userName, windowId);
      addToast(`DM with ${userName} opened`, 'success');
      return tab;
    } catch (error) {
      addToast(`Failed to open DM: ${error}`, 'error');
      throw error;
    }
  };

  const createGridDashboardTabWithToast = async (
    gridId: string, 
    gridName: string, 
    windowId?: string
  ): Promise<Tab> => {
    try {
      const tab = await windowState.createGridDashboardTab(gridId, gridName, windowId);
      addToast(`${gridName} dashboard opened`, 'success');
      return tab;
    } catch (error) {
      addToast(`Failed to open dashboard: ${error}`, 'error');
      throw error;
    }
  };

  // Enhanced tab operations with toasts
  const activateTabWithToast = async (windowId: string, tabId: string): Promise<void> => {
    try {
      await windowState.activateTab(windowId, tabId);
    } catch (error) {
      addToast(`Failed to activate tab: ${error}`, 'error');
      throw error;
    }
  };

  const closeTabWithToast = async (windowId: string, tabId: string): Promise<void> => {
    try {
      const window = windowState.getWindow(windowId);
      const tab = window?.tabs.find(t => t.id === tabId);
      await windowState.closeTab(windowId, tabId);
      if (tab) {
        addToast(`Tab "${tab.title}" closed`, 'info');
      }
    } catch (error) {
      addToast(`Failed to close tab: ${error}`, 'error');
      throw error;
    }
  };

  const detachTabWithToast = async (
    tabId: string, 
    sourceWindowId: string, 
    position?: { x: number; y: number }
  ): Promise<void> => {
    try {
      const sourceWindow = windowState.getWindow(sourceWindowId);
      const tab = sourceWindow?.tabs.find(t => t.id === tabId);
      
      const request = {
        tab_id: tabId,
        source_window_id: sourceWindowId,
        position,
        size: { width: 1200, height: 800 },
      };
      
      await windowState.detachTab(request);
      
      if (tab) {
        addToast(`Tab "${tab.title}" detached to new window`, 'success');
      }
    } catch (error) {
      addToast(`Failed to detach tab: ${error}`, 'error');
      throw error;
    }
  };

  const contextValue: WindowStateContextType = {
    // State
    windows: windowState.windows,
    mainWindowId: windowState.mainWindowId,
    isInitialized: windowState.isInitialized,
    error: windowState.error,
    
    // Window operations
    getWindow: windowState.getWindow,
    getMainWindow: windowState.getMainWindow,
    getActiveTab: windowState.getActiveTab,
    
    // Tab creation with toasts
    createTerminalTab: createTerminalTabWithToast,
    createTextChannelTab: createTextChannelTabWithToast,
    createProcessTab: createProcessTabWithToast,
    createDirectMessageTab: createDirectMessageTabWithToast,
    createGridDashboardTab: createGridDashboardTabWithToast,
    
    // Tab management with toasts
    activateTab: activateTabWithToast,
    closeTab: closeTabWithToast,
    detachTab: detachTabWithToast,
    
    // Utility
    refreshWindows: windowState.refreshWindows,
    stats: windowState.stats,
  };

  return (
    <WindowStateContext.Provider value={contextValue}>
      {children}
    </WindowStateContext.Provider>
  );
}

export function useWindowStateContext(): WindowStateContextType {
  const context = useContext(WindowStateContext);
  if (!context) {
    throw new Error('useWindowStateContext must be used within a WindowStateProvider');
  }
  return context;
}
