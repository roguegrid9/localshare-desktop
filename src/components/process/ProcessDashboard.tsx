import React, { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
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
  Info,
  Copy,
  CheckCircle2
} from 'lucide-react';
import type { ProcessDashboard as ProcessDashboardType } from '../../types/dashboard';
import type { ProcessAvailability, LocalProcessStatus } from '../../types/process';

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
  status,
  availability
}: {
  name: string;
  status: string;
  availability?: ProcessAvailability;
}) {
  const StatusIcon = status === 'running' ? Play : Square;
  const statusColor = status === 'running' ? 'text-green-400' : 'text-red-400';
  const statusText = status === 'running' ? 'Running' : 'Stopped';

  // Determine local status badge
  const getLocalStatusBadge = () => {
    if (!availability) return null;

    const { local_status, host_display_name } = availability;

    switch (local_status) {
      case 'hosting':
        return (
          <span className="text-sm px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5" />
            Hosting
          </span>
        );
      case 'connected':
        return (
          <span className="text-sm px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1.5">
            <Share2 className="w-3.5 h-3.5" />
            Connected
          </span>
        );
      case 'available':
        return (
          <span className="text-sm px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 flex items-center gap-1.5">
            <Cloud className="w-3.5 h-3.5" />
            Available from {host_display_name || 'host'}
          </span>
        );
      case 'unavailable':
      default:
        return null;
    }
  };

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
            {getLocalStatusBadge()}
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

function P2PConnectionSection({
  dashboard,
  gridId,
  processId,
  availability
}: {
  dashboard: ProcessDashboardType;
  gridId: string;
  processId: string;
  availability?: ProcessAvailability;
}) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'reconnecting'>('disconnected');
  const [connectionUrl, setConnectionUrl] = useState<string | null>(null);
  const [transportId, setTransportId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [reconnectionAttempt, setReconnectionAttempt] = useState<number>(0);
  const [maxReconnectionAttempts, setMaxReconnectionAttempts] = useState<number>(5);
  const [reconnectionDelay, setReconnectionDelay] = useState<number>(0);
  const [reconnectionCountdown, setReconnectionCountdown] = useState<number>(0);

  // Auto-host the grid only if the user owns the process
  useEffect(() => {
    const ensureGridHosted = async () => {
      // Only auto-host if this is the owner's process
      if (!dashboard || !dashboard.is_owner) {
        console.log('Skipping auto-host: not the process owner');
        return;
      }

      try {
        await invoke('auto_host_grid', { gridId });
        console.log('Grid auto-hosted successfully (owner)');
      } catch (error) {
        console.warn('Failed to auto-host grid:', error);
      }
    };
    ensureGridHosted();
  }, [gridId, dashboard?.is_owner]);

  // Listen for transport_started event to get the actual local port
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    listen('transport_started', (event: any) => {
      const data = event.payload;
      console.log('Transport started event received:', data);

      // Check if this transport is for our process
      if (data.process_id === processId && data.grid_id === gridId) {
        setConnectionUrl(`localhost:${data.local_port}`);
        setTransportId(data.transport_id);
        setConnectionStatus('connected');
        setErrorMessage(null);
        setReconnectionAttempt(0); // Reset reconnection state
        console.log(`Transport tunnel ready on localhost:${data.local_port}`);
      }
    }).then(fn => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [processId, gridId]);

  // Listen for reconnection events
  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    listen('p2p_reconnecting', (event: any) => {
      const data = event.payload;
      if (data.grid_id === gridId) {
        setConnectionStatus('reconnecting');
        setReconnectionAttempt(data.attempt);
        setMaxReconnectionAttempts(data.max_attempts);
        setReconnectionDelay(data.delay_seconds);
        setReconnectionCountdown(data.delay_seconds);
        setErrorMessage(null);
        console.log(`Reconnecting: attempt ${data.attempt}/${data.max_attempts}`);
      }
    }).then(fn => unlisteners.push(fn));

    listen('p2p_reconnected', (event: any) => {
      const data = event.payload;
      if (data.grid_id === gridId) {
        setConnectionStatus('connected');
        setReconnectionAttempt(0);
        setErrorMessage(null);
        console.log('Successfully reconnected!');
      }
    }).then(fn => unlisteners.push(fn));

    listen('p2p_reconnection_failed', (event: any) => {
      const data = event.payload;
      if (data.grid_id === gridId) {
        setConnectionStatus('disconnected');
        setReconnectionAttempt(0);
        setErrorMessage(`Failed to reconnect after ${data.max_attempts} attempts. Please try connecting again.`);
        console.error('Reconnection failed after max attempts');
      }
    }).then(fn => unlisteners.push(fn));

    listen('host_disconnected', (event: any) => {
      const data = event.payload;
      if (data.grid_id === gridId) {
        setConnectionStatus('reconnecting');
        setErrorMessage('Connection lost. Reconnecting...');
        console.log('Host disconnected, will attempt reconnection');
      }
    }).then(fn => unlisteners.push(fn));

    return () => {
      unlisteners.forEach(fn => fn());
    };
  }, [gridId]);

  // Countdown timer for reconnection delay
  useEffect(() => {
    if (connectionStatus === 'reconnecting' && reconnectionCountdown > 0) {
      const timer = setTimeout(() => {
        setReconnectionCountdown(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [connectionStatus, reconnectionCountdown]);

  // Auto-connect for guests only (hosts don't need P2P connection to their own process)
  useEffect(() => {
    if (availability?.local_status === 'available' &&
        availability?.is_connectable &&
        connectionStatus === 'disconnected' &&
        !isConnecting) {
      // Small delay to ensure availability is fully loaded
      const timer = setTimeout(() => {
        handleConnectAsGuest();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [availability?.local_status, availability?.is_connectable]);

  // Handle connecting to a remote process as guest
  const handleConnectAsGuest = async () => {
    setIsConnecting(true);
    setConnectionStatus('connecting');
    setErrorMessage(null);

    try {
      // First, cleanup any stale connections
      console.log('Cleaning up stale connections before connecting...');
      await invoke('cleanup_stale_connection', {
        gridId,
        processId,
      });

      // Connect to process - this will:
      // 1. Establish P2P connection to host
      // 2. Register connection in database
      // 3. Start transport tunnel for port forwarding (async)
      const result = await invoke<any>('connect_to_process', {
        gridId,
        processId,
        localPort: null, // Let the system choose
      });

      setConnectionId(result.connection_id);
      setErrorMessage(null);

      // Don't set to 'connected' yet - wait for transport_started event
      // which will provide the actual local port
      console.log('Connection initiated, waiting for transport to start...', result);
    } catch (error) {
      console.error('Failed to connect to process:', error);
      const errorMsg = String(error);
      setErrorMessage(errorMsg);
      setConnectionStatus('disconnected');
    } finally {
      setIsConnecting(false);
    }
  };

  // Handle disconnecting from a remote process
  const handleDisconnect = async () => {
    if (!connectionId) return;

    try {
      // Disconnect from process - this will clean up the transport tunnel too
      await invoke('disconnect_from_process', {
        gridId,
        processId,
        connectionId,
      });

      setConnectionId(null);
      setConnectionUrl(null);
      setConnectionStatus('disconnected');
    } catch (error) {
      console.error('Failed to disconnect:', error);
      setErrorMessage(String(error));
    }
  };

  // Original host connection logic
  const handleConnect = async () => {
    setIsConnecting(true);
    setConnectionStatus('connecting');
    setErrorMessage(null);

    try {
      // Start P2P transport tunnel to this process
      const result = await invoke<any>('start_transport_tunnel', {
        request: {
          grid_id: gridId,
          process_id: processId,
          transport_type: 'http',
          target_port: dashboard.local_port,
          service_name: dashboard.name
        }
      });

      setTransportId(result.transport_id);
      setConnectionUrl(`http://localhost:${result.local_port || dashboard.local_port}`);
      setConnectionStatus('connected');
      setErrorMessage(null);
    } catch (error) {
      console.error('Failed to connect to process:', error);
      const errorMsg = String(error);
      setErrorMessage(errorMsg);
      setConnectionStatus('disconnected');
    } finally {
      setIsConnecting(false);
    }
  };

  // Determine if we're hosting or available to connect
  const isHosting = availability?.local_status === 'hosting';
  const isAvailable = availability?.local_status === 'available' && availability?.is_connectable;
  const isConnected = availability?.local_status === 'connected';

  return (
    <Section title={
      <div className="flex items-center gap-2">
        <Share2 className="w-4 h-4" />
        Connection & Sharing
      </div>
    }>
      <div className={`rounded-lg border p-6 ${
        isHosting ? 'border-blue-500/20 bg-blue-500/10' :
        isAvailable ? 'border-yellow-500/20 bg-yellow-500/10' :
        isConnected ? 'border-purple-500/20 bg-purple-500/10' :
        'border-blue-500/20 bg-blue-500/10'
      }`}>
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
            isHosting ? 'bg-blue-500/20' :
            isAvailable ? 'bg-yellow-500/20' :
            isConnected ? 'bg-purple-500/20' :
            'bg-blue-500/20'
          }`}>
            <Server className={`w-5 h-5 ${
              isHosting ? 'text-blue-400' :
              isAvailable ? 'text-yellow-400' :
              isConnected ? 'text-purple-400' :
              'text-blue-400'
            }`} />
          </div>
          <div className="flex-1">
            <h3 className={`font-semibold mb-2 ${
              isHosting ? 'text-blue-300' :
              isAvailable ? 'text-yellow-300' :
              isConnected ? 'text-purple-300' :
              'text-blue-300'
            }`}>
              {isHosting ? 'You are hosting this process' :
               isAvailable ? `Available from ${availability.host_display_name || 'another user'}` :
               isConnected ? 'Connected to remote process' :
               'Connect to Process'}
            </h3>
            <p className={`text-sm mb-4 ${
              isHosting ? 'text-blue-200/80' :
              isAvailable ? 'text-yellow-200/80' :
              isConnected ? 'text-purple-200/80' :
              'text-blue-200/80'
            }`}>
              {isHosting
                ? 'This process is running on your machine and is accessible to grid members via P2P.'
                : isAvailable
                ? `This process is running on ${availability.host_display_name || "another user's"} machine. Click connect to access it locally.`
                : isConnected
                ? 'You are connected to a remote process. Access it via the local port below.'
                : 'This process is automatically shared via P2P networking when running. Grid members can access it directly through encrypted peer-to-peer connections.'
              }
            </p>

            {/* Connection Status */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'connected' ? 'bg-green-400' :
                  connectionStatus === 'reconnecting' ? 'bg-orange-400 animate-pulse' :
                  connectionStatus === 'connecting' ? 'bg-yellow-400 animate-pulse' :
                  isHosting && dashboard.status === 'running' ? 'bg-green-400' :
                  'bg-gray-400'
                }`} />
                <span className="text-sm text-white/80 font-medium">
                  {connectionStatus === 'connected' ? 'Connected' :
                   connectionStatus === 'reconnecting' ? 'Reconnecting...' :
                   connectionStatus === 'connecting' ? 'Connecting...' :
                   isHosting && dashboard.status === 'running' ? 'Ready' :
                   'Disconnected'}
                </span>
              </div>

              {/* Reconnection Progress - simplified */}
              {connectionStatus === 'reconnecting' && reconnectionAttempt > 0 && (
                <div className="bg-orange-500/10 border border-orange-500/20 rounded p-3 mb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-orange-300">
                      Reconnecting... ({reconnectionAttempt}/{maxReconnectionAttempts})
                    </span>
                    {reconnectionCountdown > 0 && (
                      <span className="text-xs text-orange-400">{reconnectionCountdown}s</span>
                    )}
                  </div>
                </div>
              )}

              {connectionUrl && connectionStatus === 'connected' && (
                <div className="mb-2 space-y-2">
                  {/* Service Type Badge for connected guests */}
                  {dashboard.service_type && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-green-300/80">Type:</span>
                      <span className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-300 border border-green-500/30 font-medium">
                        {dashboard.service_type.toUpperCase()}
                      </span>
                    </div>
                  )}

                  <CopyAddressButton
                    port={parseInt(connectionUrl.split(':')[1]) || dashboard.local_port}
                    serviceType={dashboard.service_type}
                    protocol={dashboard.protocol}
                  />
                </div>
              )}

              {errorMessage && (
                <div className="bg-red-500/10 border border-red-500/20 rounded p-3 mb-2">
                  <p className="text-xs text-red-300">{errorMessage}</p>
                </div>
              )}
            </div>

            {/* Copy Address - only shown for hosts */}
            {dashboard.status === 'running' && isHosting && !connectionUrl && (
              <div className="mb-4">
                <CopyAddressButton
                  port={dashboard.local_port}
                  serviceType={dashboard.service_type}
                  protocol={dashboard.protocol}
                />
              </div>
            )}

            {/* Action Buttons */}
            {isAvailable && !isConnected && (
              <div className="flex gap-2">
                <button
                  onClick={handleConnectAsGuest}
                  disabled={isConnecting || connectionStatus === 'reconnecting'}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    isConnecting || connectionStatus === 'reconnecting'
                      ? 'bg-yellow-600/50 text-yellow-300 cursor-wait'
                      : 'bg-yellow-600 text-white hover:bg-yellow-700'
                  }`}
                >
                  {connectionStatus === 'reconnecting' ? 'Reconnecting...' :
                   isConnecting ? 'Connecting...' :
                   'Connect to Process'}
                </button>
              </div>
            )}

            {isConnected && connectionId && (
              <div className="flex gap-2">
                <button
                  onClick={handleDisconnect}
                  disabled={connectionStatus === 'reconnecting'}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    connectionStatus === 'reconnecting'
                      ? 'bg-red-600/50 text-red-300 cursor-not-allowed'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                >
                  Disconnect
                </button>
              </div>
            )}

            {isHosting && connectionStatus !== 'connected' && connectionStatus !== 'reconnecting' && (
              <div className="flex gap-2">
                <button
                  onClick={handleConnect}
                  disabled={isConnecting || dashboard.status !== 'running'}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    dashboard.status !== 'running'
                      ? 'bg-gray-600/50 text-gray-400 cursor-not-allowed'
                      : isConnecting
                      ? 'bg-blue-600/50 text-blue-300 cursor-wait'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {isConnecting ? 'Connecting...' : 'Retry Connection'}
                </button>
              </div>
            )}

            {/* Status Messages - simplified */}
            {dashboard.status !== 'running' && (
              <p className="text-xs text-yellow-300/80 mt-3">
                Process must be running to share
              </p>
            )}
            {connectionStatus === 'connected' && (
              <p className="text-xs text-green-300/80 mt-3">
                {isHosting ? 'Accessible to grid members' : 'Connected to remote process'}
              </p>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

function CopyAddressButton({
  port,
  serviceType,
  protocol
}: {
  port: number;
  serviceType?: string;
  protocol?: string;
}) {
  const [copied, setCopied] = useState(false);

  // Format address based on service type
  const getAddress = () => {
    const isHTTP = serviceType === 'http' || protocol === 'http';
    return isHTTP ? `http://localhost:${port}` : `localhost:${port}`;
  };

  const address = getAddress();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="bg-blue-500/10 border border-blue-500/20 rounded p-2">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="text-xs text-blue-300/80 mb-1">Local Address</div>
          <code className="text-sm text-blue-300 font-mono">{address}</code>
        </div>
        <button
          onClick={handleCopy}
          className="ml-2 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1.5 transition-all"
        >
          {copied ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              Copy
            </>
          )}
        </button>
      </div>
    </div>
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
  const [availability, setAvailability] = useState<ProcessAvailability | null>(null);
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
      const [processInfo, sharedProcesses, processDisplayName, processAvailability] = await Promise.all([
        invoke<any>('get_process_info', { processId }).catch(() => null),
        invoke<any[]>('get_grid_shared_processes', { gridId }).catch(() => []),
        invoke<string>('get_process_display_name', { processId }).catch(() => processId.slice(0, 8)),
        invoke<ProcessAvailability | null>('get_process_availability', { gridId, processId }).catch(() => null)
      ]);

      // Update availability state
      setAvailability(processAvailability);

      // DEBUG: Log availability data
      console.log('🔍 AVAILABILITY DATA:', processAvailability);

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

      // Determine status based on whether this is a local or remote process
      const isRemoteProcess = processAvailability?.local_status === 'available' ||
                              processAvailability?.local_status === 'connected';

      if (processInfo) {
        // Local process - use process manager status
        status = processInfo.status?.state === 'Running' ? 'running' : 'stopped';
      } else if (isRemoteProcess) {
        // Remote process - use grid_status from availability
        status = processAvailability?.grid_status === 'hosted' ? 'running' : 'stopped';
        console.log(`Remote process status from grid: ${status} (grid_status: ${processAvailability?.grid_status})`);
      } else if (sharedProcess) {
        // Local shared process - check actual health by monitoring the port
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
        availability={availability || undefined}
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

      <P2PConnectionSection
        dashboard={dashboard}
        gridId={gridId}
        processId={processId}
        availability={availability || undefined}
      />

      <ComingSoonSection />
    </div>
  );
}