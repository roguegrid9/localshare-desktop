import { useState, useEffect, useCallback, useMemo } from 'react';
import { Hash, Volume2, Plus, Terminal, Users, ChevronDown, ChevronRight, MessageCircle, MoreVertical, Settings, LogOut, ExternalLink, RefreshCw, Search, Radio } from 'lucide-react';
import { useChannels } from '../../hooks/useChannels';
import { useProcessManager } from '../../hooks/useProcessManager';
import { useTauriCommands } from '../../hooks/useTauriCommands';
import { useTerminalSessions } from '../../hooks/useTerminalSessions';
import { useWindowState } from '../../hooks/useWindowState';
import CreateChannelModal from './CreateChannelModal';
import ProcessDiscoveryPanel from '../../components/discovery/ProcessDiscoveryPanel';
import ProcessDiscoveryModal from '../../components/discovery/ProcessDiscoveryModal';
import ProcessConfigModal from '../../components/process/ProcessConfigModal';
import type { ChannelInfo } from '../../types/messaging';
import type { ProcessInfo, DetectedProcess } from '../../types/process';
import { invoke } from '@tauri-apps/api/core';

// Shared Process types (from Rust backend)
interface SharedProcess {
  id: string;
  grid_id: string;
  user_id: string;
  config: {
    name: string;
    description?: string;
    pid: number;
    port: number;
    command: string;
    working_dir: string;
    executable_path: string;
    process_name: string;
  };
  status: 'Running' | 'Stopped' | 'Error';
  last_seen_at?: number;
  created_at: number;
  updated_at: number;
}

type Grid = {
  id: string;
  name: string;
};

type ContentPanelProps = {
  selectedGridId?: string;
  grids: ReadonlyArray<Grid>;
  onChannelSelect: (channelId: string) => void;
  onProcessSelect: (processId: string) => void;
};

export default function ContentPanel({
  selectedGridId,
  grids,
  onChannelSelect,
  onProcessSelect,
}: ContentPanelProps) {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [createChannelModalOpen, setCreateChannelModalOpen] = useState(false);
  const [gridUpdateTrigger, setGridUpdateTrigger] = useState(0);

  // State for process discovery
  const [showDiscoveryPanel, setShowDiscoveryPanel] = useState(false);
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [selectedDiscoveredProcess, setSelectedDiscoveredProcess] = useState<DetectedProcess | null>(null);

  // State for process configuration modal
  const [showProcessConfigModal, setShowProcessConfigModal] = useState(false);
  const [processToConfig, setProcessToConfig] = useState<DetectedProcess | null>(null);

  const commands = useTauriCommands();

  // Listen for grid updates to refresh the displayed grid name
  useEffect(() => {
    const handleGridUpdated = () => {
      console.log('ContentPanel: Grid updated, triggering re-render');
      setGridUpdateTrigger(prev => prev + 1);
    };
    window.addEventListener('grid-updated', handleGridUpdated);
    return () => window.removeEventListener('grid-updated', handleGridUpdated);
  }, []);
  
  const actualGridId = selectedGridId;
  
  const { channels = [], refreshChannels } = useChannels(actualGridId);
  const { mainWindowId, createGridDashboardTab } = useWindowState();

  // Get all processes and filter for current grid
  const { 
    processes: allProcesses = [], 
    loadActiveProcesses,
    loading: processLoading,
    error: processError
  } = useProcessManager();

  // State for shared processes
  const [sharedProcesses, setSharedProcesses] = useState<SharedProcess[]>([]);
  const [sharedProcessLoading, setSharedProcessLoading] = useState(false);
  const [sharedProcessError, setSharedProcessError] = useState<string | null>(null);

  // Load shared processes for the current grid
  const loadSharedProcesses = useCallback(async (gridId: string) => {
    if (!gridId) return;
    
    try {
      setSharedProcessLoading(true);
      setSharedProcessError(null);
      
      console.log('📡 Loading shared processes for grid:', gridId);
      const processes = await invoke<SharedProcess[]>('get_grid_shared_processes', { gridId });
      
      console.log('✅ Loaded shared processes:', processes);
      setSharedProcesses(processes);
    } catch (error) {
      console.error('❌ Failed to load shared processes:', error);
      setSharedProcessError(error as string);
      setSharedProcesses([]);
    } finally {
      setSharedProcessLoading(false);
    }
  }, []);

  // Convert SharedProcess to ProcessInfo format for unified display
  const convertSharedProcessToProcessInfo = useCallback((sharedProcess: SharedProcess): ProcessInfo => {
    return {
      process_id: sharedProcess.id,
      grid_id: sharedProcess.grid_id,
      config: {
        executable_path: "shared_process", // Special identifier for shared processes
        args: [sharedProcess.config.name, sharedProcess.config.description || ''],
        env_vars: {
          SHARED_PROCESS_NAME: sharedProcess.config.name,
          SHARED_PROCESS_DESCRIPTION: sharedProcess.config.description || '',
          SHARED_PROCESS_PORT: sharedProcess.config.port.toString(),
          SHARED_PROCESS_PID: sharedProcess.config.pid.toString(),
          SHARED_PROCESS_COMMAND: sharedProcess.config.command,
          SHARED_PROCESS_WORKING_DIR: sharedProcess.config.working_dir,
          SHARED_PROCESS_EXECUTABLE: sharedProcess.config.executable_path,
          SHARED_PROCESS_PROCESS_NAME: sharedProcess.config.process_name,
        },
        working_directory: sharedProcess.config.working_dir,
      },
      status: {
        process_id: sharedProcess.id,
        grid_id: sharedProcess.grid_id,
        state: sharedProcess.status as any, // Convert string to ProcessState
        pid: sharedProcess.config.pid,
        exit_code: null,
        started_at: sharedProcess.created_at,
        error_message: null,
      },
      created_at: sharedProcess.created_at,
      process_type: 'Network' as any,
    };
  }, []);
  
  // Enhanced debugging and process filtering with useMemo for performance
  const processes = useMemo(() => {
    console.log('🔍 ENHANCED ContentPanel Process Debug:');
    console.log('- selectedGridId:', selectedGridId);
    console.log('- actualGridId:', actualGridId);
    console.log('- allProcesses count:', allProcesses.length);
    console.log('- sharedProcesses count:', sharedProcesses.length);
    console.log('- processLoading:', processLoading);
    console.log('- sharedProcessLoading:', sharedProcessLoading);
    console.log('- processError:', processError);
    console.log('- sharedProcessError:', sharedProcessError);

    // Log each process with details
    allProcesses.forEach((process, index) => {
      console.log(`  Process ${index}:`, {
        id: process.process_id,
        grid_id: process.grid_id,
        executable_path: process.config?.executable_path,
        status: process.status?.state,
        args: process.config?.args,
        env_vars: process.config?.env_vars
      });
    });

    if (!actualGridId) {
      console.log('- No actualGridId, returning empty array');
      return [];
    }

    // Convert shared processes to ProcessInfo format
    const convertedSharedProcesses = sharedProcesses
      .filter(sp => sp.grid_id === actualGridId)
      .map(convertSharedProcessToProcessInfo);

    console.log('- Converted shared processes:', convertedSharedProcesses);

    // Combine both regular and shared processes
    const allCombinedProcesses = [...allProcesses, ...convertedSharedProcesses];
    console.log('- All combined processes count:', allCombinedProcesses.length);
    
    // More inclusive filtering logic
    const filtered = allCombinedProcesses.filter(p => {
      // Direct grid match
      const directMatch = p.grid_id === actualGridId;
      
      // Recovered processes that might belong to this grid
      const recoveredMatch = p.grid_id === 'recovered' && 
        (p.config?.executable_path?.includes('Recovered Terminal') ||
         p.config?.args?.some(arg => typeof arg === 'string' && arg.includes(actualGridId)) ||
         p.config?.env_vars?.GRID_ID === actualGridId);
      
      // Processes without proper grid_id (might be new or improperly tagged)
      const orphanedMatch = !p.grid_id || p.grid_id === 'unknown' || p.grid_id === '';
      
      // Processes that might have been created for this grid but haven't been properly associated
      const recentMatch = Date.now() - (p.created_at || 0) < 60000; // Last minute
      
      const shouldInclude = directMatch || recoveredMatch || (orphanedMatch && recentMatch);
      
      console.log(`  Filtering process ${p.process_id}:`, {
        grid_id: p.grid_id,
        actualGridId,
        directMatch,
        recoveredMatch,
        orphanedMatch,
        recentMatch,
        shouldInclude
      });
      
      return shouldInclude;
    });
    
    console.log('- Filtered processes count:', filtered.length);
    console.log('- Filtered processes:', filtered);
    
    return filtered;
  }, [actualGridId, allProcesses, sharedProcesses, processLoading, sharedProcessLoading, processError, sharedProcessError, convertSharedProcessToProcessInfo]);

  // Process type detection functions with better logging
  const isTemporaryProcess = useCallback((process: ProcessInfo): boolean => {
    const isTemp = process.config.executable_path === "internal_terminal" ||
           process.config.executable_path === "internal_discovered_process" ||
           process.config.executable_path.startsWith("Recovered Terminal");
    
    console.log(`  isTemporary(${process.process_id}):`, {
      executable_path: process.config.executable_path,
      isTemp
    });
    
    return isTemp;
  }, []);

  const isSharedProcess = useCallback((process: ProcessInfo): boolean => {
    return process.config.executable_path === "shared_process";
  }, []);

  const isPersistentProcess = useCallback((process: ProcessInfo): boolean => {
    return !isTemporaryProcess(process) && !isSharedProcess(process);
  }, [isTemporaryProcess, isSharedProcess]);

  // Separate processes by type
  const temporaryProcesses = useMemo(() => processes.filter(isTemporaryProcess), [processes, isTemporaryProcess]);
  const persistentProcesses = useMemo(() => processes.filter(isPersistentProcess), [processes, isPersistentProcess]);
  const sharedProcessesList = useMemo(() => processes.filter(isSharedProcess), [processes, isSharedProcess]);
  
  console.log('- temporary processes count:', temporaryProcesses.length);
  console.log('- persistent processes count:', persistentProcesses.length);
  console.log('- shared processes count:', sharedProcessesList.length);
  
  // Get terminal sessions for this grid (keeping for potential future use)
  const { 
    sessions: terminalSessions = [], 
    backgroundSessions = [], 
    loading: terminalLoading 
  } = useTerminalSessions(actualGridId);

  // Enhanced effect for initial process loading
  useEffect(() => {
    console.log('🔄 Loading processes on mount or grid change');
    if (actualGridId) {
      loadActiveProcesses();
      loadSharedProcesses(actualGridId);
    }
  }, [actualGridId, loadActiveProcesses, loadSharedProcesses]);

  // Enhanced event listener with better dependency management and additional events
  useEffect(() => {
    console.log('🎧 Setting up enhanced process event listeners');

    const handleProcessCreated = (event: any) => {
      console.log('🚀 Process created event received in ContentPanel!', event.detail);
      console.log('- Current actualGridId:', actualGridId);
      console.log('- Event gridId:', event.detail?.gridId);

      // Always refresh processes when any process is created
      // The filtering will happen after we get fresh data
      loadActiveProcesses();

      // Also refresh shared processes if we have a gridId
      if (actualGridId) {
        loadSharedProcesses(actualGridId);
      }
    };

    const handleProcessUpdated = (event: any) => {
      console.log('📝 Process updated event received', event.detail);
      loadActiveProcesses();
      if (actualGridId) {
        loadSharedProcesses(actualGridId);
      }
    };

    const handleProcessDeleted = (event: any) => {
      console.log('🗑️ Process deleted event received (local)', event.detail);
      // Refresh both local processes and shared processes
      loadActiveProcesses();
      if (actualGridId) {
        loadSharedProcesses(actualGridId);
      }
    };

    // Add event listeners
    window.addEventListener('process-created', handleProcessCreated);
    window.addEventListener('process-updated', handleProcessUpdated);
    window.addEventListener('process-deleted', handleProcessDeleted);

    return () => {
      console.log('🧹 Removing enhanced process event listeners');
      window.removeEventListener('process-created', handleProcessCreated);
      window.removeEventListener('process-updated', handleProcessUpdated);
      window.removeEventListener('process-deleted', handleProcessDeleted);
    };
  }, [loadActiveProcesses, loadSharedProcesses, actualGridId]); // Fixed dependencies

  // WebSocket listener for process deletion from other clients
  useEffect(() => {
    const setupWSListener = async () => {
      const { listen } = await import('@tauri-apps/api/event');

      const unlisten = await listen('process_deleted_ws', (event: any) => {
        console.log('🗑️ Process deleted via WebSocket', event.payload);
        // Refresh both local processes and shared processes
        loadActiveProcesses();
        if (actualGridId) {
          loadSharedProcesses(actualGridId);
        }
      });

      return unlisten;
    };

    const unlistenPromise = setupWSListener();

    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, [loadActiveProcesses, loadSharedProcesses, actualGridId]);

  // WebSocket listener for shared process status changes (updates status dots in real-time)
  useEffect(() => {
    const setupWSListener = async () => {
      const { listen } = await import('@tauri-apps/api/event');

      const unlisten = await listen('shared_process_status_changed', (event: any) => {
        console.log('🔄 Shared process status changed via WebSocket', event.payload);
        // Refresh shared processes to update status dots
        if (actualGridId) {
          loadSharedProcesses(actualGridId);
        }
      });

      return unlisten;
    };

    const unlistenPromise = setupWSListener();

    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, [loadSharedProcesses, actualGridId]);

  // Manual refresh function for debugging
  const handleManualRefresh = useCallback(async () => {
    console.log('🔄 Manual refresh triggered by user');
    try {
      await loadActiveProcesses();
      if (actualGridId) {
        await loadSharedProcesses(actualGridId);
      }
      console.log('✅ Manual refresh completed');
    } catch (error) {
      console.error('❌ Manual refresh failed:', error);
    }
  }, [loadActiveProcesses, loadSharedProcesses, actualGridId]);

  const toggleSection = (sectionName: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionName]: !prev[sectionName]
    }));
  };

  const handleAddChannel = (type: 'text' | 'voice') => {
    console.log(`Add ${type} channel for grid:`, selectedGridId);
    setCreateChannelModalOpen(true);
  };

  // Updated to show process discovery modal
  const handleAddProcess = () => {
    console.log('Add process for grid:', selectedGridId);
    setShowDiscoveryModal(true);
  };

  // Discovery panel handlers
  const handleDiscoveredProcessSelect = (process: DetectedProcess) => {
    console.log('Selected discovered process:', process);
    setSelectedDiscoveredProcess(process);
  };

  const handleCreateProcessFromDiscovery = (process: DetectedProcess) => {
    console.log('Opening process config modal for discovered process:', process);
    
    // Close discovery modal/panel and open process config modal
    setShowDiscoveryModal(false);
    setShowDiscoveryPanel(false);
    setSelectedDiscoveredProcess(null);
    
    // Set up the process config modal
    setProcessToConfig(process);
    setShowProcessConfigModal(true);
  };

  // Handle successful process creation from config modal
  const handleProcessConfigSuccess = (processId: string) => {
    console.log('✅ Process created successfully:', processId);
    
    // Close the config modal
    setShowProcessConfigModal(false);
    setProcessToConfig(null);
    
    // Refresh both types of processes
    loadActiveProcesses();
    if (selectedGridId) {
      loadSharedProcesses(selectedGridId);
    }
    
    // Dispatch event for other components
    window.dispatchEvent(new CustomEvent('process-created', { 
      detail: { gridId: selectedGridId, processId } 
    }));
    
    // Trigger process selection to open the dashboard
    onProcessSelect(processId);
  };

  // Handle cancelling process configuration
  const handleProcessConfigCancel = () => {
    console.log('Process configuration cancelled');
    setShowProcessConfigModal(false);
    setProcessToConfig(null);
  };

  // Process type selection handlers removed


  const handleProcessCreated = () => {
    console.log('Process created successfully');
    // Force refresh the processes
    window.dispatchEvent(new CustomEvent('process-created', { 
      detail: { gridId: selectedGridId } 
    }));
    
    // Also manually refresh
    loadActiveProcesses();
  };

  // FIXED: Proper channel creation success handler
  const handleChannelCreated = async () => {
    console.log('✅ Channel created successfully, refreshing channels...');
    setCreateChannelModalOpen(false);
    
    // Refresh the channel list
    if (refreshChannels) {
      await refreshChannels();
    }
  };

  // Container-related handlers removed - ready for AI capsules


  const handleLeaveGrid = () => {
    console.log('Leave grid:', selectedGridId);
    setDropdownOpen(false);
  };

  const handleSettings = () => {
    console.log('Open settings for grid:', selectedGridId);
    setDropdownOpen(false);
  };

  const handleManageGrid = async () => {
    if (!selectedGridId || !mainWindowId) {
      console.error('Missing required data:', { selectedGridId, mainWindowId });
      return;
    }
    
    try {
      console.log('🎯 Opening grid management for:', selectedGridId);
      const gridName = grids.find(g => g.id === selectedGridId)?.name || 'Grid';
      
      // Use the correct function from useWindowManager
      const tab = await createGridDashboardTab(selectedGridId, gridName, mainWindowId);
      
      console.log('✅ Grid management tab created:', tab);
    } catch (error) {
      console.error('❌ Failed to open grid management:', error);
    }
  };

  const getChannelPreview = (channel: ChannelInfo): string => {
    // Get last message preview or member count
    if (channel.metadata?.last_message) {
      return channel.metadata.last_message;
    }
    
    return `${channel.member_count} members`;
  };

  const handleOpenVoiceWindow = useCallback(async (channelId: string) => {
    if (!selectedGridId || !mainWindowId) return;
  
    try {
      const channel = channels.find(c => c.id === channelId);
      if (!channel) return;
  
      // This would use your window creation logic
      console.log('Opening voice window for channel:', channelId);
      // await createVoiceChannelWindow(channelId, channel.name, selectedGridId, mainWindowId);
    } catch (error) {
      console.error('Failed to open voice window:', error);
    }
  }, [selectedGridId, mainWindowId, channels]);
  
  const handleVoiceChannelSelect = useCallback(async (channelId: string, channelName: string, gridId: string) => {
    if (!mainWindowId) {
      onChannelSelect(channelId);
      return;
    }
    
    try {
      console.log('Creating voice channel tab:', { channelId, channelName, gridId });
      
      // Use invoke directly instead of commands.invoke
      await invoke('create_voice_channel_tab', {
        channelId,
        gridId,
        channelName,
        windowId: mainWindowId
      });
      
    } catch (error) {
      console.error('Failed to create voice channel tab:', error);
      console.log('Falling back to regular channel selection');
      onChannelSelect(channelId);
    }
  }, [mainWindowId, onChannelSelect]);

  // Updated ChannelListItem component to handle both text and voice channels
  const ChannelListItem = ({ 
    channel, 
    onChannelSelect,
    onVoiceChannelSelect, // Add this new prop
    onOpenVoiceWindow 
  }: {
    channel: ChannelInfo;
    onChannelSelect: (channelId: string) => void;
    onVoiceChannelSelect?: (channelId: string, channelName: string, gridId: string) => void; // Add this
    onOpenVoiceWindow?: (channelId: string) => void;
  }) => {
    const [isHovered, setIsHovered] = useState(false);
    const isVoiceChannel = channel.channel_type === 'voice';

    const handleChannelClick = () => {
      if (isVoiceChannel && onVoiceChannelSelect && selectedGridId) {
        // Call voice channel handler
        onVoiceChannelSelect(channel.id, channel.name, selectedGridId);
      } else {
        // Call regular text channel handler
        onChannelSelect(channel.id);
      }
    };

    return (
      <div 
        className="group flex items-center justify-between"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <button
          onClick={handleChannelClick} // Use the new handler
          className="flex items-center gap-2 flex-1 px-2 py-1 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        >
          {isVoiceChannel ? (
            <Volume2 className="w-4 h-4 text-green-400" />
          ) : (
            <MessageCircle className="w-4 h-4 text-blue-400" />
          )}
          <span className="truncate">{channel.name}</span>
          {channel.member_count > 0 && (
            <span className="text-xs text-white/40">
              {channel.member_count}
            </span>
          )}
        </button>
        
        {isVoiceChannel && isHovered && onOpenVoiceWindow && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenVoiceWindow(channel.id);
            }}
            className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
            title="Open voice window"
          >
            <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  };

  // Enhanced ProcessListItem component with better error handling and display
  const ProcessListItem = ({ process }: { process: ProcessInfo }) => {
    const isTemporary = isTemporaryProcess(process);
    const isShared = isSharedProcess(process);
    
    // More robust display name extraction
    const getDisplayName = () => {
      try {
        // Handle shared processes
        if (isShared) {
          return process.config.env_vars?.SHARED_PROCESS_NAME || 
                 process.config.args?.[0] || 
                 `Shared Process ${process.process_id.slice(0, 8)}`;
        }

        if (process.config.executable_path === 'internal_terminal' || 
            process.config.executable_path.startsWith('Recovered Terminal')) {
          
          // Try multiple sources for terminal name
          const terminalName = 
            process.config.args?.[2] || 
            process.config.env_vars?.TERMINAL_NAME || 
            process.config.env_vars?.SESSION_NAME ||
            `Terminal ${process.process_id.slice(0, 8)}`;
            
          return terminalName;
        }
        
        // For containers, try to extract a meaningful name
        if (process.config.executable_path.includes('docker') || 
            process.config.executable_path.includes('container')) {
          // First try to get the display name
          const displayName = 
            process.config.env_vars?.DISPLAY_NAME ||
            process.config.env_vars?.display_name ||
            process.metadata?.display_name;
          
          if (displayName) {
            return displayName;
          }
          
          // Then fall back to container name
          const containerName = 
            process.config.env_vars?.CONTAINER_NAME ||
            process.config.args?.find(arg => arg.startsWith('--name='))?.replace('--name=', '') ||
            `Container ${process.process_id.slice(0, 8)}`;
            
          return containerName;
        }
        
        // For discovered processes
        if (process.config.executable_path === 'internal_discovered_process') {
          const discoveredName = 
            process.config.args?.[0] || 
            process.config.env_vars?.PROCESS_NAME ||
            `Process ${process.process_id.slice(0, 8)}`;
            
          return discoveredName;
        }
        
        // Fallback to process ID
        return process.process_id.slice(0, 12);
      } catch (error) {
        console.error('Error getting display name for process:', process, error);
        return process.process_id.slice(0, 8);
      }
    };

    const displayName = getDisplayName();

    return (
      <button
        key={process.process_id}
        onClick={() => onProcessSelect(process.process_id)}
        className="flex items-center gap-2 w-full px-2 py-1 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        title={`${displayName} (${process.process_id})`}
      >
        {isShared ? (
          <Radio className="w-4 h-4 text-orange-400" />
        ) : isTemporary ? (
          <Terminal className="w-4 h-4 text-white/40" />
        ) : (
          <Terminal className="w-4 h-4 text-blue-400" />
        )}
        <span className="truncate">{displayName}</span>
        <div className={`w-2 h-2 rounded-full ml-auto ${
          process.status?.state === 'Running' ? 'bg-green-500' :
          process.status?.state === 'Starting' ? 'bg-yellow-500' : 
          process.status?.state === 'Stopped' ? 'bg-red-500' : 'bg-gray-500'
        }`} />
      </button>
    );
  };

  // Enhanced ProcessSectionHeader with discovery and refresh buttons
  const ProcessSectionHeader = () => (
    <div className="flex items-center justify-between w-full px-3 py-1 text-xs font-semibold text-white/60 hover:text-white/80 uppercase tracking-wide group">
      <button
        onClick={() => toggleSection('processes')}
        className="flex items-center gap-2"
      >
        <span>Processes</span>
        {collapsedSections.processes ? (
          <ChevronRight className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
      </button>
      <div className="flex items-center gap-1">
        {/* Discovery button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowDiscoveryPanel(!showDiscoveryPanel);
          }}
          className={`h-4 w-4 grid place-items-center rounded hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity ${
            showDiscoveryPanel ? 'bg-blue-600 opacity-100' : ''
          }`}
          title="Discover processes"
        >
          <Search className="w-3 h-3" />
        </button>
        {/* Debug refresh button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleManualRefresh();
          }}
          className="h-4 w-4 grid place-items-center rounded hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Refresh processes"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleAddProcess();
          }}
          className="h-4 w-4 grid place-items-center rounded hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Add process"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  );

  // Empty state when no grids exist
  if (grids.length === 0) {
    return (
      <aside className="w-[280px] h-screen bg-[#0B0D10] border-r border-white/10 flex items-center justify-center">
        <div className="text-center text-white/40 px-6">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium mb-2">No grids yet</p>
          <p className="text-xs text-white/30">Create or join a grid to get started</p>
        </div>
      </aside>
    );
  }

  if (!selectedGridId) {
    return (
      <aside className="w-[280px] h-screen bg-[#0B0D10] border-r border-white/10 flex items-center justify-center">
        <div className="text-center text-white/40">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">Select a grid</p>
        </div>
      </aside>
    );
  }

  return (
    <>
      <aside className="w-[280px] h-screen bg-[#0B0D10] border-r border-white/10 flex flex-col">
        {/* Grid Header */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-white truncate">
                {grids.find(g => g.id === selectedGridId)?.name || "Grid"}
              </h2>
              <div className="text-xs text-white/40 mt-1">
                Connected • {processes.length} processes
                {sharedProcessesList.length > 0 && ` (${sharedProcessesList.length} shared)`}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Manage Grid Button */}
              <button
                onClick={handleManageGrid}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] hover:opacity-90 transition-opacity text-white text-xs font-medium"
                title="Manage Grid"
              >
                <Settings className="h-3 w-3" />
                Manage
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Loading State */}
          {(processLoading || sharedProcessLoading) && (
            <div className="px-4 py-2 text-white/40 text-sm flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white/60"></div>
              Loading processes...
            </div>
          )}

          {/* Error State */}
          {(processError || sharedProcessError) && (
            <div className="px-4 py-2 text-red-400 text-sm">
              Error loading processes: {processError || sharedProcessError}
              <button 
                onClick={handleManualRefresh}
                className="ml-2 text-xs underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          )}

          {/* Channels Section */}
          <div className="mt-4">
            <div className="flex items-center justify-between w-full px-3 py-1 text-xs font-semibold text-white/60 hover:text-white/80 uppercase tracking-wide group">
              <button
                onClick={() => toggleSection('channels')}
                className="flex items-center gap-2"
              >
                <span>Channels</span>
                {collapsedSections.channels ? (
                  <ChevronRight className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddChannel('text');
                }}
                className="h-4 w-4 grid place-items-center rounded hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Create channel"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>

            {!collapsedSections.channels && (
              <div className="px-2 pb-2">
                {channels.filter(c => !c.is_private || !c.name.startsWith('DM')).length === 0 ? (
                  <div className="px-4 py-2 text-white/40 text-sm">
                    No channels
                  </div>
                ) : (
                  channels
                    .filter(channel => !channel.is_private || !channel.name.startsWith('DM'))
                    .sort((a, b) => {
                      // Sort by type (text first, then voice), then by name
                      if (a.channel_type !== b.channel_type) {
                        return a.channel_type === 'text' ? -1 : 1;
                      }
                      return a.name.localeCompare(b.name);
                    })
                    .map(channel => (
                      <ChannelListItem
                        key={channel.id}
                        channel={channel}
                        onChannelSelect={onChannelSelect}
                        onVoiceChannelSelect={handleVoiceChannelSelect}
                        onOpenVoiceWindow={handleOpenVoiceWindow}
                      />
                    ))
                )}
              </div>
            )}
          </div>

          {/* Enhanced Processes Section */}
          <div className="mt-4">
            <ProcessSectionHeader />

            {!collapsedSections.processes && (
              <div className="px-2 pb-2 space-y-3">
                {/* Process Discovery Panel */}
                {showDiscoveryPanel && (
                  <ProcessDiscoveryPanel
                    onProcessSelect={handleDiscoveredProcessSelect}
                    onCreateProcess={handleCreateProcessFromDiscovery}
                    className="mb-3"
                  />
                )}
                
                {processes.length === 0 ? (
                  <div className="px-4 py-2 text-white/40 text-sm">
                    {processLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white/60"></div>
                        Loading processes...
                      </div>
                    ) : (
                      <>
                        No processes running
                        <div className="text-xs text-white/30 mt-1">
                          Add terminals to get started
                        </div>
                        <button
                          onClick={handleAddProcess}
                          className="mt-2 text-xs text-blue-400 hover:text-blue-300 underline"
                        >
                          Add your first process
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {/* Show count summary for debugging */}
                    {(temporaryProcesses.length > 0 || persistentProcesses.length > 0 || sharedProcessesList.length > 0) && (
                      <div className="px-2 py-1 text-xs text-white/30 border-b border-white/5">
                        {temporaryProcesses.length + sharedProcessesList.length} process{(temporaryProcesses.length + sharedProcessesList.length) !== 1 ? 'es' : ''}
                        {sharedProcessesList.length > 0 && ` (${sharedProcessesList.length} shared)`}
                      </div>
                    )}
                    
                    {/* Shared processes first */}
                    {sharedProcessesList.map(process => (
                      <ProcessListItem key={process.process_id} process={process} />
                    ))}
                    
                    {/* Temporary processes */}
                    {temporaryProcesses.map(process => (
                      <ProcessListItem key={process.process_id} process={process} />
                    ))}
                    
                    {/* Persistent processes section removed - containers eliminated */}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Modals */}
      <CreateChannelModal
        open={createChannelModalOpen}
        onClose={() => setCreateChannelModalOpen(false)}
        onSuccess={handleChannelCreated}
        gridId={selectedGridId || ''}
      />
      
      {/* Process Discovery Modal */}
      <ProcessDiscoveryModal
        open={showDiscoveryModal}
        onClose={() => setShowDiscoveryModal(false)}
        onCreateProcess={handleCreateProcessFromDiscovery}
      />

      {/* Process Configuration Modal */}
      {processToConfig && (
        <ProcessConfigModal
          detectedProcess={processToConfig}
          gridId={selectedGridId || ''}
          onSuccess={handleProcessConfigSuccess}
          onCancel={handleProcessConfigCancel}
        />
      )}

    </>
  );
}