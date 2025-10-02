// React Hook for Bandwidth Tracking
import { useState, useEffect, useCallback, useRef } from 'react';
import { GridConnectionManager, type ConnectionState } from '../utils/connectionManager';
import { getGridRelayConfig, type GridRelayStatus } from '../utils/gridRelay';

// Local type definition to avoid import issues
interface ConnectionStats {
  bytesSent: number;
  bytesReceived: number;
  packetsLost: number;
  roundTripTime: number;
  connectionType: 'p2p' | 'stun' | 'turn' | 'unknown';
}

export interface BandwidthTrackingState {
  // Connection state
  connectionState: ConnectionState;
  connectionType: 'p2p' | 'stun' | 'turn' | 'unknown';

  // Bandwidth stats
  bytesSent: number;
  bytesReceived: number;
  totalBytes: number;
  packetsLost: number;
  roundTripTime: number;

  // Quota information
  usedGB: number;
  purchasedGB: number;
  remainingGB: number;
  percentUsed: number;
  quotaWarningLevel: number | null; // 80, 90, 95, or null

  // Allocation info
  expiresAt: string | null;
  allocationStatus: string | null;
  isExpired: boolean;
  isQuotaExceeded: boolean;

  // Relay config
  relayMode: string;
  hasAllocation: boolean;
}

export interface UseBandwidthTrackingOptions {
  gridId: string;
  enabled?: boolean;
  autoConnect?: boolean;
  onQuotaWarning?: (level: number) => void;
  onQuotaExceeded?: () => void;
  onConnectionFailed?: (error: Error) => void;
}

export function useBandwidthTracking(options: UseBandwidthTrackingOptions) {
  const { gridId, enabled = true, autoConnect = false } = options;

  const [state, setState] = useState<BandwidthTrackingState>({
    connectionState: 'idle',
    connectionType: 'unknown',
    bytesSent: 0,
    bytesReceived: 0,
    totalBytes: 0,
    packetsLost: 0,
    roundTripTime: 0,
    usedGB: 0,
    purchasedGB: 0,
    remainingGB: 0,
    percentUsed: 0,
    quotaWarningLevel: null,
    expiresAt: null,
    allocationStatus: null,
    isExpired: false,
    isQuotaExceeded: false,
    relayMode: 'p2p_first',
    hasAllocation: false,
  });

  const [relayConfig, setRelayConfig] = useState<GridRelayStatus | null>(null);
  const connectionManagerRef = useRef<GridConnectionManager | null>(null);
  const refreshIntervalRef = useRef<number | null>(null);

  // Fetch relay config
  const fetchRelayConfig = useCallback(async () => {
    try {
      const config = await getGridRelayConfig(gridId);
      setRelayConfig(config);

      // Update state with allocation info
      if (config.allocation) {
        const now = new Date();
        const expiresAt = new Date(config.allocation.expires_at);
        const isExpired = expiresAt < now;
        const isQuotaExceeded = config.allocation.status === 'exhausted' ||
                                config.allocation.used_gb >= config.allocation.purchased_gb;

        setState(prev => ({
          ...prev,
          usedGB: config.allocation!.used_gb,
          purchasedGB: config.allocation!.purchased_gb,
          remainingGB: Math.max(0, config.allocation!.purchased_gb - config.allocation!.used_gb),
          percentUsed: (config.allocation!.used_gb / config.allocation!.purchased_gb) * 100,
          expiresAt: config.allocation!.expires_at,
          allocationStatus: config.allocation!.status,
          isExpired,
          isQuotaExceeded,
          relayMode: config.relay_mode,
          hasAllocation: true,
        }));
      } else {
        setState(prev => ({
          ...prev,
          usedGB: 0,
          purchasedGB: 0,
          remainingGB: 0,
          percentUsed: 0,
          expiresAt: null,
          allocationStatus: null,
          isExpired: false,
          isQuotaExceeded: false,
          relayMode: config.relay_mode,
          hasAllocation: false,
        }));
      }

      return config;
    } catch (error) {
      // Silently handle 404 errors (relay service not configured)
      const errorStr = error instanceof Error ? error.message : String(error);
      if (errorStr.includes('404')) {
        // Relay service not available, set default state
        setState(prev => ({
          ...prev,
          hasAllocation: false,
          relayMode: 'p2p_first',
        }));
        return null;
      }
      console.error('Failed to fetch relay config:', error);
      return null;
    }
  }, [gridId]);

  // Connect to grid
  const connect = useCallback(async () => {
    if (!enabled) return;

    try {
      // Create connection manager if not exists
      if (!connectionManagerRef.current) {
        connectionManagerRef.current = new GridConnectionManager({
          gridId,
          onStateChange: (connectionState) => {
            setState(prev => ({ ...prev, connectionState }));

            if (connectionState === 'quota-exceeded' && options.onQuotaExceeded) {
              options.onQuotaExceeded();
            }
          },
          onStatsUpdate: (stats: ConnectionStats) => {
            setState(prev => ({
              ...prev,
              bytesSent: stats.bytesSent,
              bytesReceived: stats.bytesReceived,
              totalBytes: stats.bytesSent + stats.bytesReceived,
              packetsLost: stats.packetsLost,
              roundTripTime: stats.roundTripTime,
              connectionType: stats.connectionType,
            }));
          },
          onQuotaWarning: (level: number) => {
            setState(prev => ({ ...prev, quotaWarningLevel: level }));

            if (options.onQuotaWarning) {
              options.onQuotaWarning(level);
            }
          },
        });
      }

      await connectionManagerRef.current.connect();
    } catch (error) {
      console.error('Connection failed:', error);

      if (options.onConnectionFailed) {
        options.onConnectionFailed(error as Error);
      }

      throw error;
    }
  }, [gridId, enabled, options]);

  // Disconnect from grid
  const disconnect = useCallback(() => {
    if (connectionManagerRef.current) {
      connectionManagerRef.current.disconnect();
      connectionManagerRef.current = null;
    }

    setState(prev => ({
      ...prev,
      connectionState: 'idle',
      connectionType: 'unknown',
      quotaWarningLevel: null,
    }));
  }, []);

  // Refresh relay config periodically
  useEffect(() => {
    if (!enabled) return;

    // Initial fetch (errors are handled inside fetchRelayConfig)
    fetchRelayConfig();

    // Refresh every 30 seconds
    refreshIntervalRef.current = window.setInterval(() => {
      fetchRelayConfig();
    }, 30000);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, gridId]);

  // Auto-connect if enabled
  useEffect(() => {
    if (autoConnect && enabled && relayConfig) {
      connect();
    }

    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, enabled, relayConfig]);

  // Calculate time until expiration
  const getTimeUntilExpiration = useCallback((): string | null => {
    if (!state.expiresAt) return null;

    const now = new Date();
    const expiresAt = new Date(state.expiresAt);
    const diffMs = expiresAt.getTime() - now.getTime();

    if (diffMs < 0) return 'Expired';

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }, [state.expiresAt]);

  return {
    // State
    ...state,
    relayConfig,

    // Actions
    connect,
    disconnect,
    refresh: fetchRelayConfig,

    // Utilities
    getTimeUntilExpiration,

    // Computed values
    isConnected: state.connectionState.startsWith('connected-'),
    isConnecting: state.connectionState.startsWith('attempting-'),
    needsPurchase: !state.hasAllocation || state.isQuotaExceeded || state.isExpired,
  };
}
