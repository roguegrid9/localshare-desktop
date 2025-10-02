import React, { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Activity,
  Play,
  Square,
  Clock,
  FileSearch,
  Lock,
  Monitor,
  Cloud,
  Server,
  AlertTriangle,
  Share2,
  Info
} from 'lucide-react';
import type { ProcessDashboard as ProcessDashboardType } from '../../types/dashboard';

interface ProcessDashboardProps {
  processId: string;
  gridId: string;
}

function DashboardSkeleton() {
  return (
    <div className="flex-1 bg-[#0B0D10] p-6 space-y-6">
      <div className="animate-pulse">
        <div className="h-8 bg-white/10 rounded mb-6"></div>
        <div className="h-48 bg-white/5 rounded mb-6"></div>
        <div className="h-32 bg-white/5 rounded mb-6"></div>
        <div className="h-24 bg-white/5 rounded"></div>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex-1 bg-[#0B0D10] flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4 mx-auto">
          <Activity className="w-8 h-8 text-red-400" />
        </div>
        <h3 className="text-red-300 font-medium mb-2">Dashboard Error</h3>
        <p className="text-red-400/60 text-sm">{message}</p>
      </div>
    </div>
  );
}

function DashboardHeader({
  name,
  status
}: {
  name: string;
  status: string;
}) {
  const StatusIcon = status === 'running' ? Play : Square;
  const statusColor = status === 'running' ? 'text-green-400' : 'text-red-400';
  const statusText = status === 'running' ? 'Running' : 'Stopped';

  return (
    <div className="border-b border-white/10 pb-4 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            {name}
            <span className={`text-lg flex items-center gap-2 ${statusColor}`}>
              <StatusIcon className="w-5 h-5" />
              {statusText}
            </span>
          </h1>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ 
  label, 
  value, 
  description 
}: { 
  label: string; 
  value: React.ReactNode; 
  description?: string; 
}) {
  return (
    <div className="bg-white/5 rounded-lg p-4">
      <div className="text-white/60 text-sm mb-1">{label}</div>
      <div className="text-white font-medium">{value}</div>
      {description && (
        <div className="text-white/40 text-xs mt-1">{description}</div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-white mb-4">{title}</h2>
      {children}
    </div>
  );
}

function ProcessStatus({ dashboard }: { dashboard: ProcessDashboardType }) {
  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours} hours ${minutes} minutes`;
  };

  return (
    <Section title={<div className="flex items-center gap-2"><Activity className="w-4 h-4" />Process Status</div>}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <InfoItem
          label="Status"
          value={
            <span className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 ${
              dashboard.status === 'running'
                ? 'bg-green-500/20 text-green-300'
                : 'bg-red-500/20 text-red-300'
            }`}>
              {dashboard.status === 'running' ?
                <><Play className="w-3 h-3" /> Running</> :
                <><Square className="w-3 h-3" /> Stopped</>
              }
            </span>
          }
        />

        <InfoItem
          label="Uptime"
          value={<div className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatUptime(dashboard.uptime)}</div>}
        />

        <InfoItem
          label="PID"
          value={dashboard.pid}
        />

        <InfoItem
          label="Port"
          value={dashboard.local_port}
          description="Process listening port"
        />
      </div>
    </Section>
  );
}

function ProcessDetails({ dashboard }: { dashboard: ProcessDashboardType }) {
  return (
    <Section title={<div className="flex items-center gap-2"><FileSearch className="w-4 h-4" />Process Details</div>}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoItem 
          label="Command" 
          value={<code className="text-sm bg-black/30 px-2 py-1 rounded">{dashboard.command}</code>}
        />
        
        <InfoItem 
          label="Directory" 
          value={<code className="text-sm bg-black/30 px-2 py-1 rounded">{dashboard.working_dir}</code>}
        />
        
        <InfoItem 
          label="Executable" 
          value={<code className="text-sm bg-black/30 px-2 py-1 rounded">{dashboard.executable_path}</code>}
        />
      </div>
    </Section>
  );
}

function StoppedState({ dashboard }: { dashboard: ProcessDashboardType }) {
  return (
    <Section title={<div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Process Not Running</div>}>
      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-6">
        <div className="text-yellow-300 font-medium mb-2">This process is no longer running.</div>
        {dashboard.last_seen_at && (
          <div className="text-yellow-400/60 text-sm">
            Last seen: {new Date(dashboard.last_seen_at).toLocaleString()}
          </div>
        )}
      </div>
    </Section>
  );
}

function GridSharingSection() {
  return (
    <Section title={<div className="flex items-center gap-2"><Share2 className="w-4 h-4" />Grid Sharing</div>}>
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
            <Info className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-blue-300 mb-2">Share at Grid Level</h3>
            <p className="text-sm text-blue-200/80 mb-3">
              Process sharing is now managed at the grid level. Create a grid share to make multiple processes and channels accessible via a single public landing page.
            </p>
            <ul className="space-y-2 text-sm text-blue-200/70 mb-4">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                One subdomain per grid (e.g., my-grid.roguegrid9.com)
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                Share multiple processes and channels together
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                Automatic HTTP/WebSocket tunneling
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                Public landing page with all shared resources
              </li>
            </ul>
            <p className="text-sm text-blue-200/60">
              To share this process, go to the <span className="font-semibold text-blue-300">Grid Management</span> page and click <span className="font-semibold text-blue-300">"Share This Grid"</span>.
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}

function ComingSoonSection() {
  return (
    <Section title={<div className="flex items-center gap-2"><Lock className="w-4 h-4" />Advanced Features (Coming Soon)</div>}>
      <div className="bg-white/5 rounded-lg p-4">
        <div className="text-white/60 space-y-2 text-sm">
          <div className="flex items-center gap-2"><Cloud className="w-3 h-3" /> Cloud Backup Status</div>
          <div className="flex items-center gap-2"><Clock className="w-3 h-3" /> Version History</div>
          <div className="flex items-center gap-2"><Server className="w-3 h-3" /> Deployment Options</div>
          <div className="flex items-center gap-2"><Monitor className="w-3 h-3" /> Resource Monitoring</div>
        </div>
      </div>
    </Section>
  );
}

export function ProcessDashboard({ processId, gridId }: ProcessDashboardProps) {
  const [dashboard, setDashboard] = useState<ProcessDashboardType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout>();
  
  const loadDashboard = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) {
        setLoading(true);
        setError(null);
      }
      
      // Get process information from multiple sources
      const [processInfo, sharedProcesses, processDisplayName] = await Promise.all([
        invoke<any>('get_process_info', { processId }).catch(() => null),
        invoke<any[]>('get_grid_shared_processes', { gridId }).catch(() => []),
        invoke<string>('get_process_display_name', { processId }).catch(() => processId.slice(0, 8))
      ]);
      
      // Find the shared process data
      const sharedProcess = sharedProcesses.find(p => p.id === processId);

      // Debug logging
      console.log('ProcessDashboard debug:', {
        processInfo,
        sharedProcess,
        sharedProcesses
      });

      // Determine if this is our own process (if we have process info) or a shared process
      const isOwner = processInfo !== null;

      // Calculate uptime (round to minutes to prevent constant re-renders)
      const now = Date.now() / 1000;
      const createdAt = processInfo?.created_at ?? sharedProcess?.created_at ?? now;
      const uptime = Math.floor(Math.max(0, now - createdAt) / 60) * 60; // Round to minutes

      console.log('Uptime calculation:', {
        now,
        createdAt,
        processInfoCreatedAt: processInfo?.created_at,
        sharedProcessCreatedAt: sharedProcess?.created_at,
        rawUptime: now - createdAt,
        uptime
      });

      // Determine status - for shared processes, check actual health
      let status: 'running' | 'stopped' | 'error' = 'stopped';
      let currentPid = processInfo?.status?.pid || sharedProcess?.config?.pid || 0;

      if (processInfo) {
        status = processInfo.status?.state === 'Running' ? 'running' : 'stopped';
      } else if (sharedProcess) {
        // Check actual health by monitoring the port
        const port = sharedProcess.config?.port;

        if (port) {
          try {
            const healthStatus = await invoke<{ healthy: boolean; current_pid: number | null }>('check_process_health', { port });
            status = healthStatus.healthy ? 'running' : 'stopped';

            // Update PID if we got a current one from the health check
            if (healthStatus.current_pid) {
              currentPid = healthStatus.current_pid;
            }

            console.log(`Health check for port ${port}: ${healthStatus.healthy ? 'healthy' : 'unhealthy'}, PID: ${healthStatus.current_pid || 'unknown'}`);
          } catch (error) {
            console.error('Health check failed:', error);
            status = 'stopped';
          }
        } else {
          // Fallback to API status if we don't have port
          const statusStr = String(sharedProcess.status);
          console.log('SharedProcess status (no health check):', statusStr);
          status = statusStr === 'Running' ? 'running' : 'stopped';
        }
      }
      
      // Get process details from either source
      const config = processInfo?.config || sharedProcess?.config;
      const processData = processInfo || sharedProcess;
      
      if (!processData && !sharedProcess) {
        throw new Error('Process not found');
      }
      
      // Create dashboard data structure
      const dashboardData: ProcessDashboardType = {
        id: processId,
        name: processDisplayName || config?.name || `Process ${processId.slice(0, 8)}`,
        description: config?.description || undefined,
        status,
        uptime,
        last_seen_at: sharedProcess?.last_seen_at ? new Date(sharedProcess.last_seen_at * 1000) : undefined,
        pid: currentPid,
        command: config?.command || config?.executable_path || 'Unknown',
        working_dir: config?.working_dir || config?.working_directory || 'Unknown',
        executable_path: config?.executable_path || 'Unknown',
        local_port: config?.port || 0,
        p2p_port: 0,
        connection_status: status === 'running' ? 'active' : 'inactive',
        grid_members_connected: [],
        owner_id: sharedProcess?.user_id || "current_user",
        owner_name: isOwner ? "You" : "Unknown User",
        is_owner: isOwner,
        grid_id: gridId
      };
      
      // Only update state if data has actually changed
      setDashboard(prevDashboard => {
        if (!prevDashboard) {
          return dashboardData;
        }
        
        // Compare essential fields only to prevent unnecessary re-renders
        const hasChanged = 
          prevDashboard.status !== dashboardData.status ||
          prevDashboard.connection_status !== dashboardData.connection_status ||
          prevDashboard.pid !== dashboardData.pid ||
          prevDashboard.name !== dashboardData.name ||
          Math.abs(prevDashboard.uptime - dashboardData.uptime) >= 60; // Only update uptime every minute
        
        if (!hasChanged) {
          return prevDashboard; // Return same reference to prevent re-render
        }
        
        return dashboardData;
      });
      
      if (isInitial) {
        setLoading(false);
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      if (isInitial) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
        setLoading(false);
      }
    }
  }, [processId, gridId]);
  
  useEffect(() => {
    // Initial load
    loadDashboard(true);
    
    // Set up polling interval - every 10 seconds to reduce UI interruptions
    intervalRef.current = setInterval(() => {
      loadDashboard(false);
    }, 10000);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [loadDashboard]);
  
  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState message={error} />;
  if (!dashboard) return <ErrorState message="Process not found" />;
  
  return (
    <div className="flex-1 bg-[#0B0D10] p-6 overflow-y-auto">
      <DashboardHeader
        name={dashboard.name}
        status={dashboard.status}
      />

      {dashboard.status === 'running' ? (
        <>
          <ProcessStatus dashboard={dashboard} />
          <ProcessDetails dashboard={dashboard} />
        </>
      ) : (
        <>
          <StoppedState dashboard={dashboard} />
          <ProcessDetails dashboard={dashboard} />
        </>
      )}

      <GridSharingSection />

      <ComingSoonSection />
    </div>
  );
}