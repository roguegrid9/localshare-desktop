// src/hooks/useGridDetails.ts
import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Process, Channel, Member } from '@/types/grid';

type GridDetails = {
  processes: Process[];
  channels: Channel[];
  members: Member[];
};

export function useGridDetails(gridId: string | null) {
  const [details, setDetails] = useState<GridDetails>({
    processes: [],
    channels: [],
    members: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load all details for a specific grid
  const loadGridDetails = useCallback(async (id: string) => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);
      console.log("Loading details for grid:", id);

      // Load processes, channels, and members in parallel
      const [processesData, channelsData, membersData] = await Promise.allSettled([
        invoke<Process[]>("get_grid_processes", { gridId: id }).catch(() => []),
        invoke<Channel[]>("get_grid_channels", { gridId: id }).catch(() => []),
        invoke<Member[]>("get_grid_members", { gridId: id }).catch(() => []),
      ]);

      const processes = processesData.status === 'fulfilled' ? processesData.value : [];
      const channels = channelsData.status === 'fulfilled' ? channelsData.value : [];
      const members = membersData.status === 'fulfilled' ? membersData.value : [];

      console.log("Grid details loaded:", { processes, channels, members });

      setDetails({
        processes,
        channels,
        members,
      });
    } catch (error) {
      console.error("Failed to load grid details:", error);
      setError(error as string);
      setDetails({ processes: [], channels: [], members: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh details (for after creating/updating processes/channels)
  const refreshDetails = useCallback(() => {
    if (gridId) {
      loadGridDetails(gridId);
    }
  }, [gridId, loadGridDetails]);

  // Load details when gridId changes
  useEffect(() => {
    if (gridId) {
      loadGridDetails(gridId);
    } else {
      setDetails({ processes: [], channels: [], members: [] });
    }
  }, [gridId, loadGridDetails]);

  // Listen for real-time updates
  useEffect(() => {
    if (!gridId) return;

    const setupListeners = async () => {
      try {
        // Process events
        const unsubProcessCreated = await listen('process_created', (event: any) => {
          if (event.payload.grid_id === gridId) {
            console.log("Process created in current grid:", event);
            refreshDetails();
          }
        });

        const unsubProcessStatusChanged = await listen('process_status_changed', (event: any) => {
          if (event.payload.grid_id === gridId) {
            console.log("Process status changed in current grid:", event);
            refreshDetails();
          }
        });

        const unsubProcessDeleted = await listen('process_deleted', (event: any) => {
          if (event.payload.grid_id === gridId) {
            console.log("Process deleted in current grid:", event);
            refreshDetails();
          }
        });

        // Channel events  
        const unsubChannelCreated = await listen('channel_created', (event: any) => {
          if (event.payload.grid_id === gridId) {
            console.log("Channel created in current grid:", event);
            refreshDetails();
          }
        });

        const unsubChannelDeleted = await listen('channel_deleted', (event: any) => {
          if (event.payload.grid_id === gridId) {
            console.log("Channel deleted in current grid:", event);
            refreshDetails();
          }
        });

        // Member events
        const unsubMemberJoined = await listen('member_joined', (event: any) => {
          if (event.payload.grid_id === gridId) {
            console.log("Member joined current grid:", event);
            refreshDetails();
          }
        });

        const unsubMemberLeft = await listen('member_left', (event: any) => {
          if (event.payload.grid_id === gridId) {
            console.log("Member left current grid:", event);
            refreshDetails();
          }
        });

        const unsubMemberStatusChanged = await listen('member_status_changed', (event: any) => {
          if (event.payload.grid_id === gridId) {
            const { user_id, is_online } = event.payload;
            
            // Update member status directly for better UX
            setDetails(prev => ({
              ...prev,
              members: prev.members.map(member => 
                member.id === user_id 
                  ? { ...member, online: is_online }
                  : member
              )
            }));
          }
        });

        return () => {
          unsubProcessCreated();
          unsubProcessStatusChanged();
          unsubProcessDeleted();
          unsubChannelCreated();
          unsubChannelDeleted();
          unsubMemberJoined();
          unsubMemberLeft();
          unsubMemberStatusChanged();
        };
      } catch (error) {
        console.warn("Failed to setup grid detail listeners:", error);
        return () => {};
      }
    };

    let cleanup: (() => void) | undefined;
    setupListeners().then(fn => {
      cleanup = fn;
    });

    return () => {
      cleanup?.();
    };
  }, [gridId, refreshDetails]);

  return {
    details,
    loading,
    error,
    refreshDetails,
    
    // Computed properties
    hasProcesses: details.processes.length > 0,
    hasChannels: details.channels.length > 0,
    hasMembers: details.members.length > 0,
    onlineMembers: details.members.filter(m => m.online),
    isEmpty: !loading && details.processes.length === 0 && details.channels.length === 0,
  };
}
