import React, { useState, useEffect } from 'react'
import { useGrids } from '../hooks/useGrids'
import GridsRail from './pages/Mainsidebar'
import ContentPanel from './pages/ContentPanel'
import { WindowContainer } from '../components/windows/WindowContainer'
import { WindowStateProvider, useWindowStateContext } from '../components/windows/WindowStateProvider'
import type { TabContentType } from '../types/windows'

interface AppShellProps {
  children?: React.ReactNode
  userState?: any
}

const LAST_GRID_KEY = 'roguegrid9_last_selected_grid';

function AppShellInner({ children, userState }: AppShellProps) {
  const { grids, allGrids, refreshGrids } = useGrids()
  const [selectedGridId, setSelectedGridId] = useState<string>("")
  const [selectedChannelId, setSelectedChannelId] = useState<string>("")
  const [selectedProcessId, setSelectedProcessId] = useState<string>("")
  const { createProcessTab, mainWindowId } = useWindowStateContext()

  // Auto-select the last opened grid when grids are loaded
  useEffect(() => {
    if (grids.length > 0 && !selectedGridId) {
      const lastGridId = localStorage.getItem(LAST_GRID_KEY);

      // Check if the last grid still exists
      const lastGrid = grids.find(g => g.id === lastGridId);

      if (lastGrid) {
        console.log("Auto-selecting last opened grid:", lastGridId);
        setSelectedGridId(lastGridId);
      } else {
        // Select the first grid if last grid doesn't exist
        console.log("Auto-selecting first grid:", grids[0].id);
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
    console.log("Selected grid:", gridId)
  }

  const handleChannelSelect = (channelId: string) => {
    setSelectedChannelId(channelId)
    setSelectedProcessId("")
    console.log("Selected channel:", channelId)
  }

  const handleProcessSelect = async (processId: string) => {
    try {
      // Clear selection state
      setSelectedProcessId("")
      setSelectedChannelId("")

      // Create a process tab with dashboard instead of just setting selection
      console.log("Creating process tab for:", processId)

      // Get process name for the tab title (you may want to improve this)
      const processName = `Process ${processId.slice(0, 8)}`

      await createProcessTab(
        processId,
        selectedGridId || "",
        processName,
        mainWindowId
      )

      console.log("Process tab created successfully")
    } catch (error) {
      console.error("Failed to create process tab:", error)
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
  console.log('Tab closed, clearing selection:', content);

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

  return (
    <div className="h-screen w-screen bg-[#0B0D10] text-white flex">
      {/* Left sidebar with grids - Fixed width */}
      <div className="w-[68px] flex-shrink-0">
        <GridsRail
          grids={grids}
          selectedId={selectedGridId}
          onSelect={handleGridSelect}
        />
      </div>

      {/* Middle panel with channels/processes - Fixed width */}
      <div className="w-[280px] flex-shrink-0">
        <ContentPanel
          selectedGridId={selectedGridId}
          grids={allGrids}
          onChannelSelect={handleChannelSelect}
          onProcessSelect={handleProcessSelect}
        />
      </div>

      {/* Main content area - Flexible width */}
      <div className="flex-1 min-w-0">
        <WindowContainer
          selectedGridId={selectedGridId}
          selectedChannelId={selectedChannelId}
          selectedProcessId={selectedProcessId}
          grids={allGrids}
          onTabActivated={handleTabActivated}
          onTabClosed={handleTabClosed}
        />
      </div>
    </div>
  )
}

export function AppShell({ children, userState }: AppShellProps) {
  return (
    <WindowStateProvider>
      <AppShellInner children={children} userState={userState} />
    </WindowStateProvider>
  )
}