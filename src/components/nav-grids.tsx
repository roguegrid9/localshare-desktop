import { useState, useMemo, memo } from "react";
import {
  ChevronRight,
  MessageCircle,
  Volume2,
  Plus,
  Terminal,
  Radio,
  Settings
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarGroupAction,
} from "./ui/sidebar";
import type { GridSummary } from "../types/grid";
import type { ChannelInfo } from "../types/messaging";
import type { ProcessInfo } from "../types/process";

// Helper to get display name for a process
const getProcessDisplayName = (process: ProcessInfo, isShared: boolean): string => {
  try {
    if (isShared) {
      return process.config.env_vars?.SHARED_PROCESS_NAME ||
             process.config.args?.[0] ||
             `Shared Process ${process.process_id.slice(0, 8)}`;
    }

    if (process.config.executable_path === 'internal_terminal' ||
        process.config.executable_path.startsWith('Recovered Terminal')) {
      return process.config.args?.[2] ||
             process.config.env_vars?.TERMINAL_NAME ||
             process.config.env_vars?.SESSION_NAME ||
             `Terminal ${process.process_id.slice(0, 8)}`;
    }

    if (process.config.executable_path.includes('docker') ||
        process.config.executable_path.includes('container')) {
      return process.config.env_vars?.DISPLAY_NAME ||
             process.config.env_vars?.display_name ||
             process.metadata?.display_name ||
             process.config.env_vars?.CONTAINER_NAME ||
             process.config.args?.find(arg => arg.startsWith('--name='))?.replace('--name=', '') ||
             `Container ${process.process_id.slice(0, 8)}`;
    }

    if (process.config.executable_path === 'internal_discovered_process') {
      return process.config.args?.[0] ||
             process.config.env_vars?.PROCESS_NAME ||
             `Process ${process.process_id.slice(0, 8)}`;
    }

    return process.process_id.slice(0, 12);
  } catch (error) {
    return process.process_id.slice(0, 8);
  }
};

// Process type detection
const isTemporaryProcess = (process: ProcessInfo): boolean => {
  return process.config.executable_path === "internal_terminal" ||
         process.config.executable_path === "internal_discovered_process" ||
         process.config.executable_path.startsWith("Recovered Terminal");
};

const isSharedProcess = (process: ProcessInfo): boolean => {
  return process.config.executable_path === "shared_process";
};

interface NavGridsProps {
  grids: ReadonlyArray<GridSummary>;
  selectedGridId?: string;
  onGridSelect: (id: string) => void;
  channels: ChannelInfo[];
  processes: ProcessInfo[];
  onChannelSelect: (channelId: string, channelName: string, gridId: string) => void;
  onVoiceChannelSelect?: (channelId: string, channelName: string, gridId: string) => void;
  onAddChannel: () => void;
  onProcessSelect: (processId: string) => void;
  onAddProcess: () => void;
  onToggleDiscovery: () => void;
  onRefresh: () => void;
  showDiscoveryPanel: boolean;
  onOpenGridManagement: (gridId: string) => void;
}

export function NavGrids({
  grids,
  selectedGridId,
  onGridSelect,
  channels,
  processes,
  onChannelSelect,
  onVoiceChannelSelect,
  onAddChannel,
  onProcessSelect,
  onAddProcess,
  onToggleDiscovery,
  onRefresh,
  showDiscoveryPanel,
  onOpenGridManagement,
}: NavGridsProps) {
  const [openGrids, setOpenGrids] = useState<Record<string, boolean>>({});
  const [openChannels, setOpenChannels] = useState<Record<string, boolean>>({});
  const [openProcesses, setOpenProcesses] = useState<Record<string, boolean>>({});

  const toggleGrid = (gridId: string) => {
    setOpenGrids(prev => ({ ...prev, [gridId]: !prev[gridId] }));
  };

  const toggleChannelsForGrid = (gridId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenChannels(prev => ({ ...prev, [gridId]: !prev[gridId] }));
  };

  const toggleProcessesForGrid = (gridId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenProcesses(prev => ({ ...prev, [gridId]: !prev[gridId] }));
  };

  // Filter channels and processes by grid
  const getChannelsForGrid = (gridId: string) => {
    return channels
      .filter(c => c.grid_id === gridId && (!c.is_private || !c.name.startsWith('DM')))
      .sort((a, b) => {
        if (a.channel_type !== b.channel_type) {
          return a.channel_type === 'text' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
  };

  const getProcessesForGrid = (gridId: string) => {
    return processes.filter(p => {
      const directMatch = p.grid_id === gridId;
      const recoveredMatch = p.grid_id === 'recovered' &&
        (p.config?.executable_path?.includes('Recovered Terminal') ||
         p.config?.args?.some(arg => typeof arg === 'string' && arg.includes(gridId)) ||
         p.config?.env_vars?.GRID_ID === gridId);
      const orphanedMatch = (!p.grid_id || p.grid_id === 'unknown' || p.grid_id === '') &&
        (Date.now() - (p.created_at || 0) < 60000);

      return directMatch || recoveredMatch || orphanedMatch;
    });
  };

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Grids</SidebarGroupLabel>
      <SidebarMenu>
        {grids.map((grid) => {
          const isOpen = openGrids[grid.id];
          const gridChannels = getChannelsForGrid(grid.id);
          const gridProcesses = getProcessesForGrid(grid.id);
          const channelsOpen = openChannels[grid.id] !== false; // default open
          const processesOpen = openProcesses[grid.id] !== false; // default open

          return (
            <Collapsible
              key={grid.id}
              open={isOpen}
              onOpenChange={() => toggleGrid(grid.id)}
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton
                    onClick={() => onGridSelect(grid.id)}
                    isActive={selectedGridId === grid.id}
                    tooltip={grid.name}
                    className="data-[active=true]:bg-transparent data-[active=true]:font-normal"
                  >
                    <ChevronRight className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-90" />
                    <span className="text-sm">{grid.name}</span>
                  </SidebarMenuButton>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <SidebarMenuSub>
                    {/* Grid Management Button */}
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenGridManagement(grid.id);
                        }}
                        className="flex items-center gap-2"
                      >
                        <Settings className="h-3 w-3" />
                        <span className="text-sm font-medium">Grid Settings</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>

                    {/* Channels Section */}
                    <Collapsible
                      open={channelsOpen}
                      onOpenChange={(open) => setOpenChannels(prev => ({ ...prev, [grid.id]: open }))}
                    >
                      <SidebarMenuSubItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuSubButton
                            onClick={(e) => toggleChannelsForGrid(grid.id, e)}
                            className="flex items-center gap-2"
                          >
                            <ChevronRight className="h-3 w-3 transition-transform duration-200 data-[state=open]:rotate-90" />
                            <span className="text-sm font-medium">Channels</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onGridSelect(grid.id);
                                onAddChannel();
                              }}
                              className="ml-auto h-4 w-4 flex items-center justify-center hover:bg-sidebar-accent rounded"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </SidebarMenuSubButton>
                        </CollapsibleTrigger>

                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {gridChannels.length === 0 ? (
                              <SidebarMenuSubItem>
                                <div className="px-2 py-1 text-sm text-text-secondary">
                                  No channels
                                </div>
                              </SidebarMenuSubItem>
                            ) : (
                              gridChannels.map((channel) => (
                                <SidebarMenuSubItem key={channel.id}>
                                  <SidebarMenuSubButton
                                    onClick={() => {
                                      const isVoiceChannel = channel.channel_type === 'voice';
                                      if (isVoiceChannel && onVoiceChannelSelect) {
                                        onVoiceChannelSelect(channel.id, channel.name, grid.id);
                                      } else {
                                        onChannelSelect(channel.id, channel.name, grid.id);
                                      }
                                    }}
                                  >
                                    {channel.channel_type === 'voice' ? (
                                      <Volume2 className="h-3 w-3 text-green-400" />
                                    ) : (
                                      <MessageCircle className="h-3 w-3 text-blue-400" />
                                    )}
                                    <span className="text-sm">{channel.name}</span>
                                    {channel.member_count > 0 && (
                                      <span className="ml-auto text-xs text-text-tertiary">
                                        {channel.member_count}
                                      </span>
                                    )}
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))
                            )}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuSubItem>
                    </Collapsible>

                    {/* Processes Section */}
                    <Collapsible
                      open={processesOpen}
                      onOpenChange={(open) => setOpenProcesses(prev => ({ ...prev, [grid.id]: open }))}
                    >
                      <SidebarMenuSubItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuSubButton
                            onClick={(e) => toggleProcessesForGrid(grid.id, e)}
                            className="flex items-center gap-2"
                          >
                            <ChevronRight className="h-3 w-3 transition-transform duration-200 data-[state=open]:rotate-90" />
                            <span className="text-sm font-medium">Processes</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onGridSelect(grid.id);
                                onAddProcess();
                              }}
                              className="ml-auto h-4 w-4 flex items-center justify-center hover:bg-sidebar-accent rounded"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </SidebarMenuSubButton>
                        </CollapsibleTrigger>

                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {gridProcesses.length === 0 ? (
                              <SidebarMenuSubItem>
                                <div className="px-2 py-1 text-sm text-text-secondary">
                                  No processes running
                                </div>
                              </SidebarMenuSubItem>
                            ) : (
                              <>
                                {gridProcesses.map(process => {
                                  const isTemp = isTemporaryProcess(process);
                                  const isShared = isSharedProcess(process);
                                  const displayName = getProcessDisplayName(process, isShared);

                                  return (
                                    <SidebarMenuSubItem key={process.process_id}>
                                      <SidebarMenuSubButton
                                        onClick={() => onProcessSelect(process.process_id)}
                                      >
                                        {isShared ? (
                                          <Radio className="h-3 w-3 text-orange-400" />
                                        ) : isTemp ? (
                                          <Terminal className="h-3 w-3 text-text-tertiary" />
                                        ) : (
                                          <Terminal className="h-3 w-3 text-blue-400" />
                                        )}
                                        <span className="text-sm truncate">{displayName}</span>
                                        <div className={`w-2 h-2 rounded-full ml-auto ${
                                          process.status?.state === 'Running' ? 'bg-green-500' :
                                          process.status?.state === 'Starting' ? 'bg-yellow-500' :
                                          process.status?.state === 'Stopped' ? 'bg-red-500' : 'bg-gray-500'
                                        }`} />
                                      </SidebarMenuSubButton>
                                    </SidebarMenuSubItem>
                                  );
                                })}
                              </>
                            )}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuSubItem>
                    </Collapsible>
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
