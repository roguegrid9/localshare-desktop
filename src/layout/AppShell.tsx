import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useGrids } from '../hooks/useGrids'
import { AppSidebar } from '../components/AppSidebar'
import { WindowContainer } from '../components/windows/WindowContainer'
import { WindowStateProvider, useWindowStateContext } from '../components/windows/WindowStateProvider'
import { TitleBar } from '../components/TitleBar'
import { SidebarProvider, SidebarInset } from '../components/ui/sidebar'
import { BubbleDock } from '../components/bubbles/BubbleDock'
import { DynamicIslandDemo } from '../components/dev/DynamicIslandDemo'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useAdaptiveLayout } from '../hooks/useAdaptiveLayout'
import { useMessageNotifications } from '../hooks/useMessageNotifications'
import { useUIStore } from '../stores/useUIStore'
import type { TabContentType } from '../types/windows'

interface AppShellProps {
  children?: React.ReactNode
  userState?: any
}

const LAST_GRID_KEY = 'localshare_last_selected_grid';

function AppShellInner({ children, userState }: AppShellProps) {
  const { grids, allGrids, refreshGrids } = useGrids()
  const [selectedGridId, setSelectedGridId] = useState<string>("")
  const [selectedChannelId, setSelectedChannelId] = useState<string>("")
  const [selectedProcessId, setSelectedProcessId] = useState<string>("")
  const { createProcessTab, createNetworkDashboardTab, mainWindowId } = useWindowStateContext()
  const { initializeFromStorage, setCurrentChat } = useUIStore()

  // Initialize UI store from storage on mount
  useEffect(() => {
    void initializeFromStorage()
  }, [initializeFromStorage])

  // Sync selected channel to UI store
  useEffect(() => {
    if (selectedGridId && selectedChannelId) {
      setCurrentChat(selectedGridId, selectedChannelId)
    }
  }, [selectedGridId, selectedChannelId, setCurrentChat])

  // Enable keyboard shortcuts
  useKeyboardShortcuts()

  // Enable adaptive layout behavior
  useAdaptiveLayout()

  // Enable global message notifications
  useMessageNotifications()

  // Auto-select the last opened grid when grids are loaded
  useEffect(() => {
    if (grids.length > 0 && !selectedGridId) {
      const lastGridId = localStorage.getItem(LAST_GRID_KEY);

      // Check if the last grid still exists
      const lastGrid = grids.find(g => g.id === lastGridId);

      if (lastGrid) {
        // console.log("Auto-selecting last opened grid:", lastGridId);
        setSelectedGridId(lastGridId);
      } else {
        // Select the first grid if last grid doesn't exist
        // console.log("Auto-selecting first grid:", grids[0].id);
        setSelectedGridId(grids[0].id);
        localStorage.setItem(LAST_GRID_KEY, grids[0].id);
      }
    }
  }, [grids, selectedGridId]);

  const handleGridSelect = (gridId: string) => {
    setSelectedGridId(gridId)
    setSelectedChannelId("")
    setSelectedProcessId("")
    localStorage.setItem(LAST_GRID_KEY, gridId);
    // console.log("Selected grid:", gridId)
  }

  const handleChannelSelect = (channelId: string) => {
    setSelectedChannelId(channelId)
    setSelectedProcessId("")
    // console.log("Selected channel:", channelId)
  }

  const handleProcessSelect = async (processId: string) => {
    try {
      // Clear selection state
      setSelectedProcessId("")
      setSelectedChannelId("")

      // Create a process tab with dashboard instead of just setting selection
      // console.log("Creating process tab for:", processId)

      // Get process name for the tab title (you may want to improve this)
      const processName = `Process ${processId.slice(0, 8)}`

      await createProcessTab(
        processId,
        selectedGridId || "",
        processName,
        mainWindowId
      )

      // console.log("Process tab created successfully")
    } catch (error) {
      // console.error("Failed to create process tab:", error)
    }
  }

  const handleTabActivated = (content: TabContentType) => {
    switch (content.type) {
      case 'TextChannel':
        setSelectedChannelId(content.data.channel_id)
        setSelectedGridId(content.data.grid_id)
        setSelectedProcessId("")
        break;
      case 'MediaChannel':
        setSelectedChannelId(content.data.channel_id)
        setSelectedGridId(content.data.grid_id)
        setSelectedProcessId("")
        break;
      case 'Process':
        setSelectedProcessId(content.data.process_id)
        setSelectedGridId(content.data.grid_id)
        setSelectedChannelId("")
        break;
      case 'GridDashboard':
        setSelectedGridId(content.data.grid_id)
        setSelectedChannelId("")
        setSelectedProcessId("")
        break;
      case 'Terminal':
        if (content.data.grid_id) {
          setSelectedGridId(content.data.grid_id)
        }
        setSelectedChannelId("")
        setSelectedProcessId("")
        break;
      default:
        setSelectedChannelId("")
        setSelectedProcessId("")
        break;
    }
  }

  const handleTabClosed = (content: TabContentType) => {
  // console.log('Tab closed, clearing selection:', content);

  switch (content.type) {
    case 'Process':
      if (content.data.process_id === selectedProcessId) {
        setSelectedProcessId("");
      }
      break;
    case 'TextChannel':
    case 'MediaChannel':
      if (content.data.channel_id === selectedChannelId) {
        setSelectedChannelId("");
      }
      break;
  }
};

  const handleOpenNetworkDashboard = async () => {
    try {
      await createNetworkDashboardTab(mainWindowId);
    } catch (error) {
      // console.error('Failed to open network dashboard:', error);
    }
  };

  const selectedGrid = allGrids.find(g => g.id === selectedGridId);

  return (
    <SidebarProvider>
      <div className="relative h-screen w-screen bg-bg-primary text-text-primary overflow-hidden flex flex-col">
        {/* Optimized static orb backgrounds - removed animation for performance */}
        <div
          className="orb-background orb-primary absolute top-0 left-0 w-[30rem] h-[30rem] opacity-20"
          aria-hidden
        />
        <div
          className="orb-background orb-secondary absolute bottom-0 right-0 w-[32rem] h-[32rem] opacity-18"
          aria-hidden
        />

        {/* Main Layout with Sidebar - L-shaped layout */}
        <div className="relative flex flex-1 overflow-hidden backdrop-blur-[2px]">
          {/* Unified Sidebar - extends to top */}
          <AppSidebar
            grids={grids}
            selectedGridId={selectedGridId}
            onGridSelect={handleGridSelect}
            onOpenNetworkDashboard={handleOpenNetworkDashboard}
            onChannelSelect={handleChannelSelect}
            onProcessSelect={handleProcessSelect}
          />

          {/* Main content area with title bar */}
          <SidebarInset className="flex-1 min-w-0 bg-bg-primary flex flex-col">
            {/* Title Bar - only spans content area */}
            <TitleBar gridName={selectedGrid?.name} />

            {/* Window Container */}
            <WindowContainer
                selectedGridId={selectedGridId}
                selectedChannelId={selectedChannelId}
                selectedProcessId={selectedProcessId}
                grids={allGrids}
                onTabActivated={handleTabActivated}
                onTabClosed={handleTabClosed}
              />
          </SidebarInset>
        </div>

        {/* Overlay Components */}
        <BubbleDock />

        {/* Dev Tools - Remove in production */}
        {process.env.NODE_ENV === 'development' && <DynamicIslandDemo />}
      </div>
    </SidebarProvider>
  )
}

export function AppShell({ children, userState }: AppShellProps) {
  return (
    <WindowStateProvider>
      <AppShellInner children={children} userState={userState} />
    </WindowStateProvider>
  )
}
