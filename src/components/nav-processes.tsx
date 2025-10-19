import { useState, useMemo, memo } from "react";
import { Terminal, Radio, Plus, ChevronRight, Search, RefreshCw } from "lucide-react";
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
  SidebarGroupAction,
} from "./ui/sidebar";
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

// Process list item component
const ProcessListItem = memo(({
  process,
  onProcessSelect,
  isTemporary,
  isShared
}: {
  process: ProcessInfo;
  onProcessSelect: (processId: string) => void;
  isTemporary: boolean;
  isShared: boolean;
}) => {
  const displayName = getProcessDisplayName(process, isShared);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={() => onProcessSelect(process.process_id)}
        tooltip={`${displayName} (${process.process_id})`}
      >
        {isShared ? (
          <Radio className="h-4 w-4 text-orange-400" />
        ) : isTemporary ? (
          <Terminal className="h-4 w-4 text-text-tertiary" />
        ) : (
          <Terminal className="h-4 w-4 text-blue-400" />
        )}
        <span className="truncate">{displayName}</span>
        <div className={`w-2 h-2 rounded-full ml-auto ${
          process.status?.state === 'Running' ? 'bg-green-500' :
          process.status?.state === 'Starting' ? 'bg-yellow-500' :
          process.status?.state === 'Stopped' ? 'bg-red-500' : 'bg-gray-500'
        }`} />
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
});

ProcessListItem.displayName = 'ProcessListItem';

export function NavProcesses({
  processes,
  onProcessSelect,
  onAddProcess,
  onToggleDiscovery,
  onRefresh,
  showDiscoveryPanel,
}: {
  processes: ProcessInfo[];
  onProcessSelect: (processId: string) => void;
  onAddProcess: () => void;
  onToggleDiscovery: () => void;
  onRefresh: () => void;
  showDiscoveryPanel: boolean;
}) {
  const [isOpen, setIsOpen] = useState(true);

  // Process type detection
  const isTemporaryProcess = (process: ProcessInfo): boolean => {
    return process.config.executable_path === "internal_terminal" ||
           process.config.executable_path === "internal_discovered_process" ||
           process.config.executable_path.startsWith("Recovered Terminal");
  };

  const isSharedProcess = (process: ProcessInfo): boolean => {
    return process.config.executable_path === "shared_process";
  };

  // Separate processes by type
  const { temporaryProcesses, sharedProcesses } = useMemo(() => {
    const temporary = processes.filter(isTemporaryProcess);
    const shared = processes.filter(isSharedProcess);
    return { temporaryProcesses: temporary, sharedProcesses: shared };
  }, [processes]);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="group/collapsible">
      <SidebarGroup>
        <SidebarGroupLabel asChild>
          <CollapsibleTrigger>
            Processes
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </CollapsibleTrigger>
        </SidebarGroupLabel>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          <SidebarGroupAction onClick={onToggleDiscovery} title="Discover processes">
            <Search className={`h-4 w-4 ${showDiscoveryPanel ? 'text-blue-400' : ''}`} />
            <span className="sr-only">Discover processes</span>
          </SidebarGroupAction>

          <SidebarGroupAction onClick={onRefresh} title="Refresh processes">
            <RefreshCw className="h-4 w-4" />
            <span className="sr-only">Refresh</span>
          </SidebarGroupAction>

          <SidebarGroupAction onClick={onAddProcess} title="Add process">
            <Plus className="h-4 w-4" />
            <span className="sr-only">Add process</span>
          </SidebarGroupAction>
        </div>

        <CollapsibleContent>
          <SidebarMenu>
            {processes.length === 0 ? (
              <SidebarMenuItem>
                <div className="px-2 py-1 text-xs text-text-secondary">
                  No processes running
                </div>
              </SidebarMenuItem>
            ) : (
              <>
                {(temporaryProcesses.length > 0 || sharedProcesses.length > 0) && (
                  <SidebarMenuItem>
                    <div className="px-2 py-1 text-xs text-text-tertiary">
                      {temporaryProcesses.length + sharedProcesses.length} process
                      {(temporaryProcesses.length + sharedProcesses.length) !== 1 ? 'es' : ''}
                      {sharedProcesses.length > 0 && ` (${sharedProcesses.length} shared)`}
                    </div>
                  </SidebarMenuItem>
                )}

                {/* Shared processes first */}
                {sharedProcesses.map(process => (
                  <ProcessListItem
                    key={process.process_id}
                    process={process}
                    onProcessSelect={onProcessSelect}
                    isTemporary={false}
                    isShared={true}
                  />
                ))}

                {/* Temporary processes */}
                {temporaryProcesses.map(process => (
                  <ProcessListItem
                    key={process.process_id}
                    process={process}
                    onProcessSelect={onProcessSelect}
                    isTemporary={true}
                    isShared={false}
                  />
                ))}
              </>
            )}
          </SidebarMenu>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
