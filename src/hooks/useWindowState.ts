import { useState, useEffect, useCallback, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useWindowManager } from './useWindowManager';
import type {
  WindowState,
  Tab,
  AllWindowsResponse,
  WindowStateChangeEvent,
} from '../types/windows';

export function useWindowState() {
  const [windows, setWindows] = useState<WindowState[]>([]);
  const [mainWindowId, setMainWindowId] = useState<string>('main');
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const windowManager = useWindowManager();

  // Initialize window manager and load initial state
  const initialize = useCallback(async () => {
    try {
      setError(null);
      await windowManager.initializeWindowManager();
      
      const response = await windowManager.getAllWindows();
      setWindows(response.windows);
      setMainWindowId(response.main_window_id);
      setIsInitialized(true);
      
      console.log('Window manager initialized with', response.windows.length, 'windows');
    } catch (error) {
      console.error('Failed to initialize window manager:', error);
      setError(error as string);
    }
  }, [windowManager]);

  // Refresh window state from backend
  const refreshWindows = useCallback(async () => {
    try {
      const response = await windowManager.getAllWindows();
      setWindows(response.windows);
      setMainWindowId(response.main_window_id);
    } catch (error) {
      console.error('Failed to refresh windows:', error);
      setError(error as string);
    }
  }, [windowManager]);

  // Get a specific window by ID
  const getWindow = useCallback((windowId: string): WindowState | undefined => {
    return windows.find(w => w.id === windowId);
  }, [windows]);

  // Get the main window
  const getMainWindow = useCallback((): WindowState | undefined => {
    return getWindow(mainWindowId);
  }, [getWindow, mainWindowId]);

  // Get active tab for a window
  const getActiveTab = useCallback((windowId: string): Tab | undefined => {
    const window = getWindow(windowId);
    if (!window?.active_tab_id) return undefined;
    return window.tabs.find(tab => tab.id === window.active_tab_id);
  }, [getWindow]);

  // Get all tabs across all windows
  const getAllTabs = useCallback((): Tab[] => {
    return windows.flatMap(window => window.tabs);
  }, [windows]);

  // Find which window contains a specific tab
  const findWindowByTabId = useCallback((tabId: string): WindowState | undefined => {
    return windows.find(window => 
      window.tabs.some(tab => tab.id === tabId)
    );
  }, [windows]);

  // Get tabs with notifications
  const getTabsWithNotifications = useCallback((): Tab[] => {
    return getAllTabs().filter(tab => tab.has_notifications);
  }, [getAllTabs]);

  // Update a specific window in state
  const updateWindow = useCallback((windowId: string, updater: (window: WindowState) => WindowState) => {
    setWindows(prev => 
      prev.map(window => 
        window.id === windowId ? updater(window) : window
      )
    );
  }, []);

  // Update a specific tab in state
  const updateTab = useCallback((tabId: string, updater: (tab: Tab) => Tab) => {
    setWindows(prev => 
      prev.map(window => ({
        ...window,
        tabs: window.tabs.map(tab => 
          tab.id === tabId ? updater(tab) : tab
        )
      }))
    );
  }, []);

  // Set up event listeners for real-time updates
  useEffect(() => {
    let windowStateUnlisten: (() => void) | undefined;
    let windowChangeUnlisten: (() => void) | undefined;

    const setupListeners = async () => {
      try {
        // Listen for complete window state updates
        windowStateUnlisten = await listen<AllWindowsResponse>('window-state-updated', (event) => {
          console.log('Window state updated:', event.payload);
          setWindows(event.payload.windows);
          setMainWindowId(event.payload.main_window_id);
        });

        // Listen for specific window change events
        windowChangeUnlisten = await listen<WindowStateChangeEvent>('window-state-change', (event) => {
          console.log('Window state change:', event.payload);
          
          // Only refresh for certain event types to prevent infinite loops
          const shouldRefresh = [
            'WindowCreated',
            'WindowClosed', 
            'TabClosed',
            'TabDetached',
            'TabReattached',
            'TabCreated',
            'TabActivated' 
          ].includes(event.payload.event_type);
          
          if (shouldRefresh) {
            // Add a small delay to batch multiple rapid changes
            setTimeout(() => {
              refreshWindows();
            }, 100);
          }
        });

        // Listen for window closed events
        const windowClosedUnlisten = await listen<{ window_id: string }>('window-closed', (event) => {
          console.log('Window closed:', event.payload);
          setWindows(prev => prev.filter(w => w.id !== event.payload.window_id));
        });

        return () => {
          windowClosedUnlisten();
        };
      } catch (error) {
        console.error('Failed to set up window event listeners:', error);
        setError(error as string);
      }
    };

    if (isInitialized) {
      setupListeners();
    }

    return () => {
      windowStateUnlisten?.();
      windowChangeUnlisten?.();
    };
  }, [isInitialized, refreshWindows]);

  // Listen for tab restore events from backend
  useEffect(() => {
    const setupRestoreListeners = async () => {
      // Terminal state restore
      const terminalRestoreUnlisten = await listen<any>('restore-terminal-state', (event) => {
        console.log('Restoring terminal state:', event.payload);
        // Emit to terminal components if needed
      });

      // Channel state restore
      const channelRestoreUnlisten = await listen<any>('restore-channel-state', (event) => {
        console.log('Restoring channel state:', event.payload);
        // Emit to channel components if needed
      });

      // Media state restore
      const mediaRestoreUnlisten = await listen<any>('restore-media-state', (event) => {
        console.log('Restoring media state:', event.payload);
        // Emit to media components if needed
      });

      // Process state restore
      const processRestoreUnlisten = await listen<any>('restore-process-state', (event) => {
        console.log('Restoring process state:', event.payload);
        // Emit to process components if needed
      });

      // DM state restore
      const dmRestoreUnlisten = await listen<any>('restore-dm-state', (event) => {
        console.log('Restoring DM state:', event.payload);
        // Emit to DM components if needed
      });

      // Dashboard state restore
      const dashboardRestoreUnlisten = await listen<any>('restore-dashboard-state', (event) => {
        console.log('Restoring dashboard state:', event.payload);
        // Emit to dashboard components if needed
      });

      return () => {
        terminalRestoreUnlisten();
        channelRestoreUnlisten();
        mediaRestoreUnlisten();
        processRestoreUnlisten();
        dmRestoreUnlisten();
        dashboardRestoreUnlisten();
      };
    };

    if (isInitialized) {
      setupRestoreListeners();
    }
  }, [isInitialized]);

  // Statistics and debugging info
  const stats = useMemo(() => ({
    totalWindows: windows.length,
    totalTabs: getAllTabs().length,
    tabsWithNotifications: getTabsWithNotifications().length,
    windowsWithTabs: windows.filter(w => w.tabs.length > 0).length,
    emptyWindows: windows.filter(w => w.tabs.length === 0).length,
  }), [windows, getAllTabs, getTabsWithNotifications]);

  return {
    // State
    windows,
    mainWindowId,
    isInitialized,
    error,
    stats,

    // Initialization
    initialize,
    refreshWindows,

    // Window queries
    getWindow,
    getMainWindow,
    getActiveTab,
    getAllTabs,
    findWindowByTabId,
    getTabsWithNotifications,

    // State updates (for optimistic updates)
    updateWindow,
    updateTab,

    // Window manager operations (re-exported for convenience)
    ...windowManager,
  };
}