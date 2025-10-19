import * as React from "react";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Wifi, WifiOff, Shield, ShieldAlert,
  MessageCircle, Plus, Compass, Radar
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";

import { NavUser } from "./nav-user";
import { NavGrids } from "./nav-grids";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from "./ui/sidebar";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { useChannels } from "../hooks/useChannels";
import { useProcessManager } from "../hooks/useProcessManager";
import { useWindowState } from "../hooks/useWindowState";
import { useUIStore } from "../stores/useUIStore";
import { useTauriCommands } from "../hooks/useTauriCommands";
import { supabase } from "../utils/supabase";
import CreateGridModal from "../layout/pages/CreateGridModal";
import JoinGridModal from "../layout/pages/JoinGridModal";
import UserSettings from "../layout/pages/UserSettings";
import CreateChannelModal from "../layout/pages/CreateChannelModal";
import ProcessDiscoveryModal from "../components/discovery/ProcessDiscoveryModal";
import ProcessDiscoveryPanel from "../components/discovery/ProcessDiscoveryPanel";
import ProcessConfigModal from "../components/process/ProcessConfigModal";
import type { GridSummary } from "../types/grid";
import type { DetectedProcess, ProcessInfo } from "../types/process";

interface NetworkStatus {
  nat_type: string;
  needs_relay: boolean;
  stun_available: boolean;
  turn_available: boolean;
  connection_quality: string;
  last_checked: string;
}

interface UserInfo {
  username: string | null;
  display_name: string | null;
  avatar_url?: string | null;
}

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

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  grids: ReadonlyArray<GridSummary>;
  selectedGridId?: string;
  onGridSelect: (id: string) => void;
  onOpenNetworkDashboard: () => void;
  onChannelSelect: (channelId: string) => void;
  onProcessSelect: (processId: string) => void;
}

export function AppSidebar({
  grids,
  selectedGridId,
  onGridSelect,
  onOpenNetworkDashboard,
  onChannelSelect,
  onProcessSelect,
  ...props
}: AppSidebarProps) {
  // Sidebar state
  const { state: sidebarState, toggleSidebar } = useSidebar();
  const [isHoveringLogo, setIsHoveringLogo] = useState(false);

  // Modal states
  const [openCreate, setOpenCreate] = useState(false);
  const [openJoin, setOpenJoin] = useState(false);
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [createChannelModalOpen, setCreateChannelModalOpen] = useState(false);
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [showDiscoveryPanel, setShowDiscoveryPanel] = useState(false);
  const [showProcessConfigModal, setShowProcessConfigModal] = useState(false);
  const [processToConfig, setProcessToConfig] = useState<DetectedProcess | null>(null);

  // User info
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  // Network status
  const { networkStatus } = useNetworkStatus();
  const [relaySubscription, setRelaySubscription] = useState<{ status: string; vps_id?: string | null } | null>(null);
  const [frpStatus, setFrpStatus] = useState<{ connected: boolean } | null>(null);

  // Channels and processes
  const { channels = [], refreshChannels } = useChannels(selectedGridId);
  const { processes: allProcesses = [], loadActiveProcesses } = useProcessManager();
  const { mainWindowId } = useWindowState();

  // Tauri commands
  const { clearSession } = useTauriCommands();

  // Shared processes
  const [sharedProcesses, setSharedProcesses] = useState<SharedProcess[]>([]);

  // Load user info and relay status
  useEffect(() => {
    loadUserInfo();
    loadRelayStatus();
    const interval = setInterval(loadRelayStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // Load shared processes when grid changes
  useEffect(() => {
    if (selectedGridId) {
      loadSharedProcesses(selectedGridId);
      loadActiveProcesses();
    }
  }, [selectedGridId, loadActiveProcesses]);

  // Listen for process events
  useEffect(() => {
    const handleProcessEvent = () => {
      loadActiveProcesses();
      if (selectedGridId) {
        loadSharedProcesses(selectedGridId);
      }
    };

    window.addEventListener('process-created', handleProcessEvent);
    window.addEventListener('process-updated', handleProcessEvent);
    window.addEventListener('process-deleted', handleProcessEvent);

    return () => {
      window.removeEventListener('process-created', handleProcessEvent);
      window.removeEventListener('process-updated', handleProcessEvent);
      window.removeEventListener('process-deleted', handleProcessEvent);
    };
  }, [loadActiveProcesses, selectedGridId]);

  // WebSocket listeners for process events
  useEffect(() => {
    const setupWSListeners = async () => {
      const { listen } = await import('@tauri-apps/api/event');

      const unlisten1 = await listen('process_deleted_ws', () => {
        loadActiveProcesses();
        if (selectedGridId) loadSharedProcesses(selectedGridId);
      });

      const unlisten2 = await listen('shared_process_status_changed', () => {
        if (selectedGridId) loadSharedProcesses(selectedGridId);
      });

      return () => {
        unlisten1();
        unlisten2();
      };
    };

    const cleanup = setupWSListeners();
    return () => {
      cleanup.then(fn => fn());
    };
  }, [loadActiveProcesses, selectedGridId]);

  const loadUserInfo = async () => {
    try {
      const info = await invoke<UserInfo>('get_current_user');
      setUserInfo(info);
    } catch (error) {
      console.error('Failed to load user info:', error);
    }
  };

  const loadRelayStatus = async () => {
    try {
      const frpResponse = await invoke<any>('get_frp_status');
      setFrpStatus(frpResponse);

      try {
        const coordinatorToken = await invoke<string>('get_auth_token');
        const subResponse = await invoke<any>('get_relay_subscription', { token: coordinatorToken });
        setRelaySubscription(subResponse);
      } catch (subError) {
        setRelaySubscription(null);
      }
    } catch (error) {
      console.debug('Failed to load FRP status:', error);
    }
  };

  const loadSharedProcesses = async (gridId: string) => {
    try {
      const processes = await invoke<SharedProcess[]>('get_grid_shared_processes', { gridId });
      setSharedProcesses(processes);
    } catch (error) {
      console.error('Failed to load shared processes:', error);
      setSharedProcesses([]);
    }
  };

  // Convert SharedProcess to ProcessInfo
  const convertSharedProcessToProcessInfo = useCallback((sharedProcess: SharedProcess): ProcessInfo => {
    return {
      process_id: sharedProcess.id,
      grid_id: sharedProcess.grid_id,
      config: {
        executable_path: "shared_process",
        args: [sharedProcess.config.name, sharedProcess.config.description || ''],
        env_vars: {
          SHARED_PROCESS_NAME: sharedProcess.config.name,
          SHARED_PROCESS_DESCRIPTION: sharedProcess.config.description || '',
          SHARED_PROCESS_PORT: sharedProcess.config.port.toString(),
        },
        working_directory: sharedProcess.config.working_dir,
      },
      status: {
        process_id: sharedProcess.id,
        grid_id: sharedProcess.grid_id,
        state: sharedProcess.status as any,
        pid: sharedProcess.config.pid,
        exit_code: null,
        started_at: sharedProcess.created_at,
        error_message: null,
      },
      created_at: sharedProcess.created_at,
      process_type: 'Network' as any,
    };
  }, []);

  // Combined and filtered processes
  const processes = useMemo(() => {
    if (!selectedGridId) return [];

    const convertedSharedProcesses = sharedProcesses
      .filter(sp => sp.grid_id === selectedGridId)
      .map(convertSharedProcessToProcessInfo);

    const allCombinedProcesses = [...allProcesses, ...convertedSharedProcesses];

    return allCombinedProcesses.filter(p => {
      const directMatch = p.grid_id === selectedGridId;
      const recoveredMatch = p.grid_id === 'recovered' &&
        (p.config?.executable_path?.includes('Recovered Terminal') ||
         p.config?.args?.some(arg => typeof arg === 'string' && arg.includes(selectedGridId)) ||
         p.config?.env_vars?.GRID_ID === selectedGridId);
      const orphanedMatch = (!p.grid_id || p.grid_id === 'unknown' || p.grid_id === '') &&
        (Date.now() - (p.created_at || 0) < 60000);

      return directMatch || recoveredMatch || orphanedMatch;
    });
  }, [selectedGridId, allProcesses, sharedProcesses, convertSharedProcessToProcessInfo]);

  // Handlers
  const handleSupportClick = async () => {
    try {
      await open('https://discord.gg/m5DupEDv');
    } catch (error) {
      console.error('Failed to open Discord link:', error);
    }
  };

  const handleCreateSuccess = (gridId?: string) => {
    setOpenCreate(false);
    if (gridId) {
      onGridSelect(gridId);
    }
  };

  const handleJoinSuccess = () => {
    setOpenJoin(false);
  };

  const handleChannelCreated = async () => {
    setCreateChannelModalOpen(false);
    if (refreshChannels) {
      await refreshChannels();
    }
  };

  const handleTextChannelSelect = useCallback((channelId: string, channelName: string, gridId: string) => {
    try {
      // Open message bubble for text channel
      useUIStore.getState().openBubble('message', {
        id: `msg-${channelId}-${Date.now()}`,
        channelId,
        channelName,
        username: channelName,
        messagePreview: '',
        unread: 0,
        expanded: true,
        docked: true,
      });
    } catch (error) {
      console.error('Failed to open message bubble:', error);
    }
  }, []);

  const handleVoiceChannelSelect = useCallback(async (channelId: string, channelName: string, gridId: string) => {
    try {
      // Add voice pill to titlebar
      const pillId = `voice-pill-${channelId}`;
      useUIStore.getState().addVoicePill({
        id: pillId,
        channelId,
        channelName,
        isMuted: false,
        isDeafened: false,
        participantCount: 0,
        lastActivity: new Date(),
      });

      // Open voice bubble (expanded)
      useUIStore.getState().openBubble('voice', {
        id: `voice-${channelId}-${Date.now()}`,
        channelId,
        channelName,
        isMuted: false,
        isDeafened: false,
        participantCount: 0,
        expanded: true,
        docked: true,
      });
    } catch (error) {
      console.error('Failed to open voice bubble:', error);
    }
  }, []);

  const handleCreateProcessFromDiscovery = (process: DetectedProcess) => {
    setShowDiscoveryModal(false);
    setShowDiscoveryPanel(false);
    setProcessToConfig(process);
    setShowProcessConfigModal(true);
  };

  const handleProcessConfigSuccess = (processId: string) => {
    setShowProcessConfigModal(false);
    setProcessToConfig(null);
    loadActiveProcesses();
    if (selectedGridId) {
      loadSharedProcesses(selectedGridId);
    }
    onProcessSelect(processId);
  };

  const handleProcessConfigCancel = () => {
    setShowProcessConfigModal(false);
    setProcessToConfig(null);
  };

  const handleManualRefresh = useCallback(async () => {
    try {
      await loadActiveProcesses();
      if (selectedGridId) {
        await loadSharedProcesses(selectedGridId);
      }
    } catch (error) {
      console.error('Manual refresh failed:', error);
    }
  }, [loadActiveProcesses, selectedGridId]);

  const handleLogout = useCallback(async () => {
    try {
      // Clear Tauri session
      await clearSession();

      // Clear Supabase session
      await supabase.auth.signOut();

      // Reload the app to return to login screen
      window.location.reload();
    } catch (error) {
      console.error('Logout failed:', error);
      // Reload anyway to reset the app
      window.location.reload();
    }
  }, [clearSession]);

  const handleManageSubscription = useCallback(async () => {
    try {
      await invoke('create_tab', {
        request: {
          content: {
            type: 'Subscription'
          },
          title: 'Subscription',
          window_id: mainWindowId
        }
      });
    } catch (error) {
      console.error('Failed to open subscription page:', error);
    }
  }, [mainWindowId]);

  const handleOpenGridManagement = async (gridId: string) => {
    try {
      // Find the grid to get its name
      const grid = grids.find(g => g.id === gridId);
      const gridName = grid?.name || 'Grid Settings';

      // Create a GridDashboard tab
      await invoke('create_tab', {
        request: {
          content: {
            type: 'GridDashboard',
            data: {
              grid_id: gridId,
              grid_name: gridName
            }
          },
          title: gridName,
          window_id: mainWindowId
        }
      });
    } catch (error) {
      console.error('Failed to open grid settings:', error);
    }
  };

  // Network status helpers
  const getNetworkStatusColor = () => {
    if (frpStatus?.connected) return "bg-green-600/20 text-green-400";
    if (relaySubscription?.status === 'active')
      return "bg-green-600/20 text-green-400";
    if (networkStatus?.connection_quality === "excellent") return "bg-green-600/20 text-green-400";
    if (networkStatus?.connection_quality === "good") return "bg-blue-600/20 text-blue-400";
    if (networkStatus?.connection_quality === "fair") return "bg-yellow-600/20 text-yellow-400";
    if (networkStatus?.needs_relay) return "bg-red-600/20 text-red-400";
    return "bg-gray-600/20 text-gray-400";
  };

  const getNetworkStatusIcon = () => {
    if (frpStatus?.connected) return <Wifi className="h-4 w-4" />;
    if (relaySubscription?.status === 'active') return <Shield className="h-4 w-4" />;
    if (networkStatus?.needs_relay) return <ShieldAlert className="h-4 w-4" />;
    if (networkStatus?.stun_available) return <Shield className="h-4 w-4" />;
    return <WifiOff className="h-4 w-4" />;
  };

  return (
    <>
      <Sidebar collapsible="icon" {...props}>
        <SidebarHeader className="pb-2">
          {/* App Logo - Radar + Sidebar Trigger */}
          <SidebarMenu>
            <SidebarMenuItem>
              {sidebarState === 'collapsed' ? (
                <div
                  className="flex items-center gap-2"
                  onMouseEnter={() => setIsHoveringLogo(true)}
                  onMouseLeave={() => setIsHoveringLogo(false)}
                >
                  {isHoveringLogo ? (
                    <SidebarTrigger />
                  ) : (
                    <SidebarMenuButton
                      onClick={toggleSidebar}
                      tooltip="Expand Sidebar"
                      className="w-full h-12 bg-gradient-to-br from-accent-gradient-start to-accent-gradient-end hover:from-accent-gradient-start hover:to-accent-gradient-end cursor-pointer"
                    >
                      <Radar className="!h-6 !w-6 text-white" />
                    </SidebarMenuButton>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <SidebarMenuButton
                    className="w-full h-12 bg-gradient-to-br from-accent-gradient-start to-accent-gradient-end cursor-default hover:!bg-transparent"
                  >
                    <Radar className="!h-6 !w-6 text-white" />
                  </SidebarMenuButton>
                  <SidebarTrigger />
                </div>
              )}
            </SidebarMenuItem>
          </SidebarMenu>

          {/* Action Buttons */}
          <SidebarMenu>
            {/* Create Grid - Primary Action */}
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setOpenCreate(true)}
                tooltip="Create Grid"
                className="bg-gradient-to-r from-accent-gradient-start to-accent-gradient-end"
              >
                <Plus className="h-4 w-4" />
                <span>Create Grid</span>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {/* Join Grid - Secondary Entry Action */}
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => setOpenJoin(true)} tooltip="Join Grid">
                <Compass className="h-4 w-4" />
                <span>Join Grid</span>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {/* Network Dashboard - Contextual/Settings */}
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={onOpenNetworkDashboard}
                className={getNetworkStatusColor()}
                tooltip="Network Dashboard"
              >
                {getNetworkStatusIcon()}
                <span>Network</span>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {/* Support - Help/Fallback */}
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleSupportClick} tooltip="Support & Feedback">
                <MessageCircle className="h-4 w-4" />
                <span>Support</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          {/* Only show grids when sidebar is expanded */}
          {sidebarState === "expanded" && (
            <>
              {/* Process Discovery Panel (shown above grids when active) */}
              {showDiscoveryPanel && selectedGridId && (
                <ProcessDiscoveryPanel
                  onProcessSelect={() => {}}
                  onCreateProcess={handleCreateProcessFromDiscovery}
                  className="mx-2 mb-2"
                />
              )}

              {/* Grids with nested Channels and Processes */}
              <NavGrids
                grids={grids}
                selectedGridId={selectedGridId}
                onGridSelect={onGridSelect}
                channels={channels}
                processes={processes}
                onChannelSelect={handleTextChannelSelect}
                onVoiceChannelSelect={handleVoiceChannelSelect}
                onAddChannel={() => setCreateChannelModalOpen(true)}
                onProcessSelect={onProcessSelect}
                onAddProcess={() => setShowDiscoveryModal(true)}
                onToggleDiscovery={() => setShowDiscoveryPanel(!showDiscoveryPanel)}
                onRefresh={handleManualRefresh}
                showDiscoveryPanel={showDiscoveryPanel}
                onOpenGridManagement={handleOpenGridManagement}
              />
            </>
          )}
        </SidebarContent>

        <SidebarFooter>
          <NavUser
            user={{
              name: userInfo?.username || userInfo?.display_name || "User",
              email: "",
              avatar: userInfo?.avatar_url || "",
              subscription_tier: relaySubscription?.status === 'active' ? 'relay' : 'free'
            }}
            onLogout={handleLogout}
            onManageSubscription={handleManageSubscription}
          />
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      {/* Modals */}
      {openCreate && (
        <CreateGridModal
          open={openCreate}
          onClose={() => setOpenCreate(false)}
          onSuccess={handleCreateSuccess}
        />
      )}
      {openJoin && (
        <JoinGridModal
          open={openJoin}
          onClose={() => setOpenJoin(false)}
          onSuccess={handleJoinSuccess}
        />
      )}
      {showUserSettings && (
        <UserSettings onClose={() => setShowUserSettings(false)} />
      )}
      {createChannelModalOpen && selectedGridId && (
        <CreateChannelModal
          open={createChannelModalOpen}
          onClose={() => setCreateChannelModalOpen(false)}
          onSuccess={handleChannelCreated}
          gridId={selectedGridId}
        />
      )}
      {showDiscoveryModal && (
        <ProcessDiscoveryModal
          open={showDiscoveryModal}
          onClose={() => setShowDiscoveryModal(false)}
          onCreateProcess={handleCreateProcessFromDiscovery}
        />
      )}
      {processToConfig && selectedGridId && (
        <ProcessConfigModal
          detectedProcess={processToConfig}
          gridId={selectedGridId}
          onSuccess={handleProcessConfigSuccess}
          onCancel={handleProcessConfigCancel}
        />
      )}
    </>
  );
}
