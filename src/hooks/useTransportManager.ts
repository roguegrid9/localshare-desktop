// src/hooks/useTransportManager.ts
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export function useTransportManager(gridId: string) {
  const [activeTransports, setActiveTransports] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadActiveTransports();
    
    // Listen for transport events
    const unsubscribe = Promise.all([
      listen("transport_started", (event: any) => {
        if (event.payload.grid_id === gridId) {
          setActiveTransports(prev => [...prev, event.payload]);
        }
      }),
      listen("transport_stopped", (event: any) => {
        setActiveTransports(prev => 
          prev.filter(t => t.transport_id !== event.payload.transport_id)
        );
      }),
    ]);

    return () => {
      unsubscribe.then(unsubs => unsubs.forEach(unsub => unsub()));
    };
  }, [gridId]);

  const loadActiveTransports = async () => {
    try {
      setIsLoading(true);
      const transports = await invoke<any[]>("get_active_transports", { gridId });
      setActiveTransports(transports);
    } catch (error) {
      console.error("Failed to load transports:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const startTransport = async (config: any) => {
    try {
      await invoke("start_transport_tunnel", { request: config });
    } catch (error) {
      console.error("Failed to start transport:", error);
      throw error;
    }
  };

  const stopTransport = async (transportId: string) => {
    try {
      await invoke("stop_transport_tunnel", { transportId, gridId });
    } catch (error) {
      console.error("Failed to stop transport:", error);
      throw error;
    }
  };

  return {
    activeTransports,
    isLoading,
    startTransport,
    stopTransport,
    reload: loadActiveTransports,
  };
}
