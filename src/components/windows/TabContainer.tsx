import React, { useCallback, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { useWindowState } from '../../hooks/useWindowState';
import { DetachableTab } from './DetachableTab';
import { TabContent } from './TabContent';
import type { WindowState, Tab, TabContentType } from '../../types/windows';

interface TabContainerProps {
  window: WindowState;
  isMainWindow?: boolean;
  onTabActivated?: (content: TabContentType) => void;
}

export function TabContainer({
  window,
  isMainWindow = false,
  onTabActivated,
}: TabContainerProps) {
  const {
    activateTab,
    closeTab,
    updateTab,
  } = useWindowState();

  const activeTab = useMemo(() => {
    if (!window.active_tab_id) return null;
    return window.tabs.find(tab => tab.id === window.active_tab_id) || null;
  }, [window.tabs, window.active_tab_id]);

  const handleTabClick = useCallback(async (tab: Tab) => {
    if (tab.is_active) return;

    try {
      await activateTab(window.id, tab.id);
      onTabActivated?.(tab.content);
      updateTab(tab.id, (t) => ({ 
        ...t, 
        last_accessed: new Date().toISOString(),
        is_active: true,
      }));
    } catch (error) {
      console.error('Failed to activate tab:', error);
    }
  }, [window.id, activateTab, onTabActivated, updateTab]);

  const handleTabClose = useCallback(async (tab: Tab, event: React.MouseEvent) => {
    event.stopPropagation();
    
    try {
      await closeTab(window.id, tab.id);
      
    } catch (error) {
      console.error('Failed to close tab:', error);
    }
  }, [window.id, closeTab, onTabActivated]);

  if (window.tabs.length === 0) {
    return (
      <div className="flex-1 flex flex-col h-full bg-[#0A0A0A]">
        {/* Empty tab bar - VS Code style */}
        <div className="flex items-stretch bg-[#000000] border-b border-border h-12">
          <div className="flex-1"></div>
        </div>

        {/* Centered empty state */}
        <div className="flex-1 flex items-center justify-center bg-[#0A0A0A]" style={{ minHeight: '500px' }}>
          <div className="text-center max-w-md mx-auto">
            <div className="w-16 h-16 rounded-full bg-bg-surface flex items-center justify-center mb-4 mx-auto">
              <Plus className="w-8 h-8 text-text-tertiary" />
            </div>
            <h3 className="text-text-primary font-medium mb-2">No processes or channels open</h3>
            <p className="text-text-secondary text-sm">Select something from the sidebar to get started</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0A0A]">
      {/* Tab bar - VS Code style */}
      <div className="flex items-stretch bg-[#000000] border-b border-border h-12">
        <div className="flex-1 flex items-stretch">
          {window.tabs.map((tab) => (
            <DetachableTab
              key={tab.id}
              tab={tab}
              isActive={tab.id === window.active_tab_id}
              onClick={() => handleTabClick(tab)}
              onClose={(event) => handleTabClose(tab, event)}
            />
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0A0A0A]">
        {activeTab && (
          <TabContent
            tab={activeTab}
            windowId={window.id}
            isMainWindow={isMainWindow}
          />
        )}
      </div>
    </div>
  );
}