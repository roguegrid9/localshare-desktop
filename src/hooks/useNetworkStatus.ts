import { useState, useEffect } from 'react';
import { invoke } from "@tauri-apps/api/core";

interface NetworkStatus {
  nat_type: string;
  needs_relay: boolean;
  stun_available: boolean;
  turn_available: boolean;
  connection_quality: string;
  last_checked: string;
}

export function useNetworkStatus() {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkNetworkStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const status = await invoke<NetworkStatus>('get_network_status');
      setNetworkStatus(status);
    } catch (err) {
      setError(err as string);
      console.error('Failed to get network status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check on mount
    checkNetworkStatus();
    
    // Check every 30 seconds
    const interval = setInterval(checkNetworkStatus, 30000);
    
    return () => clearInterval(interval);
  }, []);

  return {
    networkStatus,
    loading,
    error,
    checkNetworkStatus,
  };
}
