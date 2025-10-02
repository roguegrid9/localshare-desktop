import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useWindowState } from '../../hooks/useWindowState';
import { TabContainer } from './TabContainer';
import EmptyState from '../EmptyState';
import { Home } from 'lucide-react';
import type { TabContentType } from '../../types/windows';

interface WindowContainerProps {
  selectedGridId?: string;
  selectedChannelId?: string;
  selectedProcessId?: string;
  grids?: any[];
  onTabActivated?: (content: TabContentType) => void;
  onTabClosed?: (content: TabContentType) => void;
}

export function WindowContainer({
  selectedGridId,
  selectedChannelId,
  selectedProcessId,
  grids,
  onTabActivated,
  onTabClosed,
}: WindowContainerProps) {
  const {
    mainWindowId,
    isInitialized,
    error,
    initialize,
    getMainWindow,
    createTabFromSelection,
    createWelcomeTab,
    createTerminalTab,
    refreshWindows,
  } = useWindowState();

  const [hasCreatedInitialTab, setHasCreatedInitialTab] = useState(false);
  const prevSelection = useRef<string>('');

  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [initialize, isInitialized]);

  const mainWindow = useMemo(() => {
    return getMainWindow();
  }, [getMainWindow]);

  // Create welcome tab only on first load
  useEffect(() => {
    if (isInitialized && mainWindow && mainWindow.tabs.length === 0 && !hasCreatedInitialTab) {
      console.log('Creating initial welcome tab for main window:', mainWindowId);
      
      createWelcomeTab(mainWindowId).then(() => {
        console.log('Welcome tab created successfully');
        setHasCreatedInitialTab(true);
        setTimeout(() => refreshWindows(), 500);
      }).catch(error => {
        console.error('Failed to create welcome tab:', error);
        createTerminalTab("welcome-terminal", "default-grid", "Terminal", mainWindowId).then(() => {
          setHasCreatedInitialTab(true);
          setTimeout(() => refreshWindows(), 500);
        }).catch(console.error);
      });
    }
  }, [isInitialized, mainWindow?.tabs.length, mainWindowId, createWelcomeTab, createTerminalTab, refreshWindows, hasCreatedInitialTab]);

  // Check if a tab already exists for the current selection
  const existingTab = useMemo(() => {
    if (!mainWindow) return null;

    // Only look for tabs that exactly match the current selection type
    if (selectedProcessId) {
        return mainWindow.tabs.find(tab =>
        tab.content.type === 'Process' &&
        tab.content.data.process_id === selectedProcessId &&
        tab.content.data.grid_id === selectedGridId
        );
    }

    if (selectedChannelId) {
        return mainWindow.tabs.find(tab =>
        (tab.content.type === 'TextChannel' ||
        tab.content.type === 'MediaChannel' ||
        tab.content.type === 'VoiceChannel') &&
        tab.content.data.channel_id === selectedChannelId &&
        tab.content.data.grid_id === selectedGridId
        );
    }

    return null;
    }, [mainWindow?.tabs, selectedChannelId, selectedProcessId, selectedGridId]);

  // Handle selections from sidebar - FIXED: Only create tabs for specific content, not just grid selection
  useEffect(() => {
    if (!isInitialized || !mainWindow) return;

    const currentSelection = `${selectedChannelId}-${selectedProcessId}-${selectedGridId}`;

    // Only create tab if selection actually changed
    if (currentSelection === prevSelection.current) return;

    // CRITICAL FIX: Only create tabs when we have SPECIFIC content selected, not just a grid
    const hasSpecificContent = selectedChannelId || selectedProcessId;
    if (!hasSpecificContent) {
      console.log('Grid selected but no specific content - NOT creating auto tab');
      prevSelection.current = currentSelection;
      return;
    }

    if (existingTab) return;

    console.log('Creating new tab for selection change:', currentSelection);
    prevSelection.current = currentSelection;

    createTabFromSelection(selectedChannelId, selectedProcessId, undefined, selectedGridId, false, grids)
  .then(() => {
    setTimeout(() => refreshWindows(), 100);
  })
  .catch(console.error);
  }, [selectedChannelId, selectedProcessId, selectedGridId, existingTab, isInitialized, mainWindow, createTabFromSelection, grids, refreshWindows]);

  if (!isInitialized) {
    return (
      <div className="flex-1 flex items-center justify-center w-full h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white/60 mx-auto mb-4"></div>
          <p className="text-white/60">Initializing window system...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center w-full h-full">
        <div className="text-center">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 max-w-md">
            <h3 className="text-red-400 font-semibold mb-2">Window System Error</h3>
            <p className="text-red-300 text-sm mb-4">{error}</p>
            <button
              onClick={initialize}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!mainWindow) {
    return (
      <div className="flex-1 flex items-center justify-center w-full h-full">
        <EmptyState 
          icon={Home}
          title="No Main Window"
          description="The main window could not be found. Try restarting the application."
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full w-full">
      <TabContainer
        window={mainWindow}
        isMainWindow={true}
        onTabActivated={onTabActivated}
      />
    </div>
  );
}