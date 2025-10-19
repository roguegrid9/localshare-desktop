// src/hooks/useGrids.ts
import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { GridSummary } from '../types/grid';

type Grid = {
  id: string;
  name: string;
  description?: string;
  creator_id: string;
  grid_type?: string;
  max_members: number;
  member_count: number;
  user_role: string;
  is_public: boolean;
  invite_code?: string;
  created_at: string;
  updated_at: string;
  metadata?: any; // Added to check for grid_type info
};

// Convert full Grid to GridSummary for the rail
function gridToSummary(grid: Grid): GridSummary {
  return {
    id: grid.id,
    name: grid.name,
    status: "online", // TODO: Determine actual status based on member activity
    memberCount: grid.member_count,
    unread: 0, // TODO: Implement unread counts
    metadata: {
      grid_type: grid.grid_type || grid.metadata?.grid_type // Handle both locations
    }
  };
}

export function useGrids() {
  const [allGrids, setAllGrids] = useState<GridSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Separate normal grids from personal message grids
  const grids = allGrids.filter(g => {
    // Check both grid_type in metadata and direct grid_type field
    const gridType = g.metadata?.grid_type || (g as any).grid_type;
    return gridType !== 'personal_messages';
  });
  
  const personalMessageGrid = allGrids.find(g => {
    const gridType = g.metadata?.grid_type || (g as any).grid_type;
    return gridType === 'personal_messages';
  });

  // Load grids from backend
  const loadGrids = useCallback(async () => {
    try {
      // console.log("Loading grids...");
      setError(null);
      
      const rawResponse = await invoke("get_my_grids");
      // console.log("Raw grids response:", rawResponse);
      
      // Handle different response formats
      let gridsArray: Grid[] = [];
      if (Array.isArray(rawResponse)) {
        gridsArray = rawResponse as Grid[];
      } else if (rawResponse && typeof rawResponse === 'object' && 'grids' in rawResponse) {
        const typedResponse = rawResponse as { grids: Grid[] };
        gridsArray = typedResponse.grids || [];
      } else {
        // console.warn("Unexpected grids response format:", rawResponse);
        gridsArray = [];
      }
      
      // Convert to GridSummary format
      const gridSummaries = gridsArray.map(gridToSummary);
      // console.log("Converted grid summaries:", gridSummaries);
      
      setAllGrids(gridSummaries);
    } catch (error) {
      // console.error("Failed to load grids:", error);
      setError(error as string);
      setAllGrids([]);
    }
  }, []);

  // Create personal messages grid if it doesn't exist
  const ensurePersonalMessagesGrid = useCallback(async () => {
    // First check if we already have one using the same logic as the filter
    const existingPersonalGrid = allGrids.find(g => {
      const gridType = g.metadata?.grid_type || (g as any).grid_type;
      return gridType === 'personal_messages';
    });
    
    if (existingPersonalGrid) {
      // console.log("Found existing personal grid:", existingPersonalGrid);
      return existingPersonalGrid;
    }

    try {
      // console.log("Creating personal messages grid...");
      
      const request = {
        name: "Personal Messages",
        description: "Direct messages and conversations",
        grid_type: "personal_messages",
        max_members: 50, // Use the backend maximum instead of 1000
        is_public: false
      };

      const response = await invoke("create_grid", { request });
      // console.log("Personal messages grid created:", response);
      
      // Refresh grids to include the new personal grid
      await loadGrids();
      
      // Return the created grid directly from the response instead of searching allGrids
      const createdGrid = gridToSummary({
        ...response.grid,
        grid_type: "personal_messages",
        metadata: { grid_type: "personal_messages" }
      });
      
      return createdGrid;
      
    } catch (error) {
      // console.error("Failed to create personal messages grid:", error);
      throw error;
    }
  }, [allGrids, loadGrids]);

  // Create a conversation (channel) in the personal messages grid
  const createConversation = useCallback(async (targetUserId: string, targetUserName: string, createTextChannelFn: any) => {
    try {
      // Ensure personal messages grid exists
      const personalGrid = await ensurePersonalMessagesGrid();
      if (!personalGrid) {
        throw new Error("Could not create personal messages grid");
      }

      // console.log("Creating conversation with:", targetUserId);
      
      // Create a private channel for the conversation
      const channelRequest = {
        name: `DM: ${targetUserName}`,
        description: `Direct message conversation with ${targetUserName}`,
        is_private: true,
        max_members: 2,
        metadata: {
          is_dm_conversation: true,
          other_user_id: targetUserId,
          other_user_name: targetUserName
        }
      };

      // Use the passed createTextChannel function
      const channel = await createTextChannelFn(personalGrid.id, channelRequest);
      
      // console.log("Conversation channel created:", channel);
      return channel.id;
      
    } catch (error) {
      // console.error("Failed to create conversation:", error);
      throw error;
    }
  }, [ensurePersonalMessagesGrid]);

  // Refresh grids (for after create/join operations)
  const refreshGrids = useCallback(() => {
    loadGrids();
  }, [loadGrids]);

  // Initial load
  useEffect(() => {
    const initializeGrids = async () => {
      setLoading(true);
      await loadGrids();
      setLoading(false);
    };

    initializeGrids();
  }, [loadGrids]);

  // Listen for real-time grid updates
  useEffect(() => {
    const setupListeners = async () => {
      try {
        // Listen for grid creation/join events
        const unsubGridCreated = await listen('grid_created', (event: any) => {
          // console.log("Grid created event:", event);
          refreshGrids();
        });

        const unsubGridJoined = await listen('grid_joined', (event: any) => {
          // console.log("Grid joined event:", event);
          refreshGrids();
        });

        const unsubGridLeft = await listen('grid_left', (event: any) => {
          // console.log("Grid left event:", event);
          refreshGrids();
        });

        // Listen for member status changes to update online status
        let memberStatusChangeCount = 0;
        let memberStatusTimeout: NodeJS.Timeout | null = null;

        const unsubMemberStatusChanged = await listen('member_status_changed', (event: any) => {
          const { grid_id, user_id, is_online } = event.payload;

          // Throttle grid refreshes - batch member status changes
          memberStatusChangeCount++;

          if (memberStatusTimeout) {
            clearTimeout(memberStatusTimeout);
          }

          memberStatusTimeout = setTimeout(() => {
            if (memberStatusChangeCount > 0) {
              refreshGrids();
              memberStatusChangeCount = 0;
            }
            memberStatusTimeout = null;
          }, 2000); // Refresh at most every 2 seconds
        });

        return () => {
          unsubGridCreated();
          unsubGridJoined();
          unsubGridLeft();
          unsubMemberStatusChanged();
        };
      } catch (error) {
        // console.warn("Failed to setup grid listeners:", error);
        return () => {};
      }
    };

    // Listen for grid-updated DOM event (from GridManagement)
    const handleGridUpdated = () => {
      // console.log("Grid updated event received, refreshing grids...");
      refreshGrids();
    };
    window.addEventListener('grid-updated', handleGridUpdated);

    let cleanup: (() => void) | undefined;
    setupListeners().then(fn => {
      cleanup = fn;
    });

    return () => {
      cleanup?.();
      window.removeEventListener('grid-updated', handleGridUpdated);
    };
  }, [refreshGrids]);

  return {
    grids, // Only normal grids (filtered)
    allGrids, // All grids including personal
    personalMessageGrid, // The personal messages grid specifically
    loading,
    error,
    refreshGrids,
    ensurePersonalMessagesGrid,
    createConversation,
    
    // Computed properties
    hasGrids: grids.length > 0,
    isEmpty: !loading && grids.length === 0,
    hasPersonalGrid: !!personalMessageGrid,
  };
}