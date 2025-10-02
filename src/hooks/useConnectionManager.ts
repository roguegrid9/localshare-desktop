import { useState, useEffect, useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

type ConnectionStatus = 'connected' | 'connecting' | 'offline';

// NEW: Media connection status
type MediaConnectionStatus = {
  enabled: boolean;
  connected: boolean;
  activeSessions: number;
  totalBandwidth?: number;
  quality?: string;
};

// Global singleton to prevent multiple instances
let globalInstance: boolean = false;

export function useConnectionManager() {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [wsConnected, setWsConnected] = useState(false);
  
  // NEW: Media connection state
  const [mediaStatus, setMediaStatus] = useState<MediaConnectionStatus>({
    enabled: false,
    connected: false,
    activeSessions: 0
  });
  
  const lastCheckRef = useRef<number>(0);
  const checkingRef = useRef(false);

  const checkConnection = useCallback(async () => {
    // Debounce: only check once per 5 seconds
    const now = Date.now();
    if (now - lastCheckRef.current < 5000 || checkingRef.current) {
      return;
    }

    checkingRef.current = true;
    lastCheckRef.current = now;

    try {
      const result = await invoke('check_connection_status');
      setStatus((result as any).status === 'connected' ? 'connected' : 'offline');
      
      // NEW: Check media sessions
      try {
        const mediaSessions = await invoke<string[]>('get_media_sessions');
        setMediaStatus(prev => ({
          ...prev,
          enabled: true,
          activeSessions: mediaSessions.length
        }));
      } catch (error) {
        // Media service might not be initialized yet
        setMediaStatus(prev => ({
          ...prev,
          enabled: false,
          activeSessions: 0
        }));
      }
      
    } catch (error) {
      console.error('Connection check failed:', error);
      setStatus('offline');
      setMediaStatus(prev => ({
        ...prev,
        connected: false,
        activeSessions: 0
      }));
    } finally {
      checkingRef.current = false;
    }
  }, []);

  const retryConnection = useCallback(async () => {
    setStatus('connecting');
    try {
      await invoke('connect_websocket');
    } catch (error) {
      console.error('WebSocket connection failed:', error);
      setStatus('offline');
    }
  }, []);

  // NEW: Get overall connection health
  const getConnectionHealth = useCallback(() => {
    if (status === 'offline') return 'poor';
    if (status === 'connecting') return 'fair';
    if (!wsConnected) return 'fair';
    if (mediaStatus.enabled && mediaStatus.activeSessions > 0 && !mediaStatus.connected) return 'fair';
    return 'good';
  }, [status, wsConnected, mediaStatus]);

  // NEW: Get connection summary
  const getConnectionSummary = useCallback(() => {
    const health = getConnectionHealth();
    const parts = [];
    
    if (status === 'connected') parts.push('P2P Connected');
    if (wsConnected) parts.push('WebSocket OK');
    if (mediaStatus.activeSessions > 0) parts.push(`${mediaStatus.activeSessions} Media Sessions`);
    
    if (parts.length === 0) return 'Disconnected';
    return parts.join(' • ');
  }, [status, wsConnected, mediaStatus, getConnectionHealth]);

  // Initialize connection manager (singleton pattern)
  useEffect(() => {
    if (globalInstance) {
      return;
    }
    globalInstance = true;

    // Initial connection check
    checkConnection();

    // Set up WebSocket event listeners
    const setupListeners = async () => {
      try {
        const unsubConnected = await listen('websocket_connected', () => {
          setWsConnected(true);
          setStatus('connected');
        });

        const unsubDisconnected = await listen('websocket_disconnected', () => {
          setWsConnected(false);
          setStatus('connecting');
        });

        // NEW: Media connection listeners
        const unsubMediaConnection = await listen('media_connection_changed', (event: any) => {
          const { connected, quality } = event.payload;
          setMediaStatus(prev => ({
            ...prev,
            connected,
            quality
          }));
        });

        const unsubMediaSessionInit = await listen('media_session_initialized', (event: any) => {
          setMediaStatus(prev => ({
            ...prev,
            enabled: true
          }));
        });

        const unsubMediaTrackAdded = await listen('media_track_added', (event: any) => {
          // Update bandwidth estimation if needed
          setMediaStatus(prev => ({
            ...prev,
            connected: true
          }));
        });

        return () => {
          unsubConnected();
          unsubDisconnected();
          unsubMediaConnection();
          unsubMediaSessionInit();
          unsubMediaTrackAdded();
        };
      } catch (error) {
        console.error('Failed to set up listeners:', error);
        return () => {};
      }
    };

    let cleanup: (() => void) | undefined;
    setupListeners().then(fn => {
      cleanup = fn;
    });

    // Periodic health check (every 2 minutes as backup)
    const interval = setInterval(() => {
      checkConnection();
    }, 120000);

    return () => {
      clearInterval(interval);
      if (cleanup) {
        cleanup();
      }
      globalInstance = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkConnection]);

  // Check WebSocket status on mount
  useEffect(() => {
    const checkWsStatus = async () => {
      try {
        const isConnected = await invoke('is_websocket_connected');
        setWsConnected(isConnected as boolean);
        setStatus(isConnected ? 'connected' : 'connecting');
      } catch (error) {
        console.error('Failed to check WebSocket status:', error);
        setStatus('offline');
      }
    };

    checkWsStatus();
  }, []);

  return {
    // Original connection state
    status,
    wsConnected,
    checkConnection,
    retryConnection,
    
    // NEW: Media connection state
    mediaStatus,
    
    // NEW: Overall health indicators
    connectionHealth: getConnectionHealth(),
    connectionSummary: getConnectionSummary(),
    
    // NEW: Computed flags
    isFullyConnected: status === 'connected' && wsConnected,
    hasActiveMedia: mediaStatus.activeSessions > 0,
    isMediaHealthy: mediaStatus.enabled && mediaStatus.connected
  };
}