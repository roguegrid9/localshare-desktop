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
  Copy,
  Trash2,
  Plus,
  ExternalLink,
  Users
} from 'lucide-react';
import type { ProcessDashboard as ProcessDashboardType } from '../../types/dashboard';
import { getProcessShares, deleteShare, type ProcessShare } from '../../api/coordinator';
import { CreateShareDialog } from './CreateShareDialog';

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

function SharesSection({
  processId,
  gridId,
  processName
}: {
  processId: string;
  gridId: string;
  processName: string;
}) {
  const [shares, setShares] = useState<ProcessShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadShares = async () => {
    try {
      // Get RogueGrid JWT token from Tauri storage
      const token = await window.__TAURI__.core.invoke('get_auth_token');

      if (!token) return;

      const sharesData = await getProcessShares(token, gridId, processId);
      setShares(sharesData);
    } catch (err) {
      console.error('Failed to load shares:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShares();
  }, [processId, gridId]);

  const handleCopyUrl = (shareUrl: string, shareId: string) => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedId(shareId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteShare = async (shareId: string) => {
    if (!confirm('Are you sure you want to delete this share?')) return;

    try {
      // Get RogueGrid JWT token from Tauri storage
      const token = await window.__TAURI__.core.invoke('get_auth_token');

      if (!token) return;

      await deleteShare(token, shareId);
      await loadShares();
    } catch (err) {
      console.error('Failed to delete share:', err);
      alert('Failed to delete share');
    }
  };

  const formatExpiration = (expiresAt: string | null) => {
    if (!expiresAt) return 'Never';
    const date = new Date(expiresAt);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'Expired';
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    return `${diffDays} days`;
  };

  return (
    <>
      <Section title={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4" />
            Public Shares
          </div>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Create Share
          </button>
        </div>
      }>
        {loading ? (
          <div className="bg-white/5 rounded-lg p-6 text-center text-white/60">
            Loading shares...
          </div>
        ) : shares.length === 0 ? (
          <div className="bg-white/5 rounded-lg p-6 text-center">
            <Share2 className="w-12 h-12 text-white/20 mx-auto mb-3" />
            <p className="text-white/60 mb-2">No public shares yet</p>
            <p className="text-white/40 text-sm mb-4">
              Create a public share to let others access this process via a unique URL
            </p>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create Your First Share
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {shares.map((share) => (
              <div key={share.id} className="bg-white/5 rounded-lg p-4 border border-white/10">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-white font-medium mb-1">
                      {share.custom_name || share.subdomain}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-white/60">
                      <Users className="w-3 h-3" />
                      {share.total_visitors} visitor{share.total_visitors !== 1 ? 's' : ''}
                      <span className="text-white/40">•</span>
                      <Clock className="w-3 h-3" />
                      Expires: {formatExpiration(share.expires_at)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteShare(share.id)}
                    className="text-red-400 hover:text-red-300 p-1"
                    title="Delete share"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-black/30 rounded px-3 py-2 text-white/80 text-sm font-mono flex items-center gap-2">
                    <ExternalLink className="w-3 h-3 text-white/40" />
                    {share.share_url}
                  </div>
                  <button
                    onClick={() => handleCopyUrl(share.share_url, share.id)}
                    className="bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded flex items-center gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    {copiedId === share.id ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <CreateShareDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        processId={processId}
        gridId={gridId}
        processName={processName}
        onShareCreated={loadShares}
      />
    </>
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

      <SharesSection
        processId={processId}
        gridId={gridId}
        processName={dashboard.name}
      />

      <ComingSoonSection />
    </div>
  );
}