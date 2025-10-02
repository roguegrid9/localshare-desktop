import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// keep imports relative to match your codebase style
import { useToast } from "../components/ui/Toaster";
import type {
  P2PSession,
  SessionStateChangedPayload,
  Grid,
  // NEW: Media event payloads
  MediaSessionInitializedPayload,
  MediaTrackAddedPayload,
  MediaTrackRemovedPayload,
  VideoTrackReplacedPayload,
  RemoteMediaTrackPayload,
  MediaConnectionChangedPayload,
  RemoteMediaStateChangedPayload,
  RemoteQualityChangedPayload
} from "../types/p2p";

// UPDATED: Enhanced context type with media capabilities
type P2PContextType = {
  sessions: Record<string, P2PSession>;
  joinGridSession: (gridId: string) => Promise<void>;
  releaseGridHost: (gridId: string) => Promise<void>;
  getGridStatus: (gridId: string) => Promise<any>;
  closeSession: (sessionId: string) => Promise<void>;
  sendData: (sessionId: string, data: number[]) => Promise<void>;
  p2pReady: boolean;
  gridsLoaded: boolean;
  loadGrids: () => Promise<void>;
  
  // NEW: Media-related functions
  initializeMediaSession: (sessionId: string) => Promise<void>;
  getMediaSessions: () => Promise<string[]>;
  closeMediaSession: (sessionId: string) => Promise<void>;
  
  // NEW: Media state
  activeCalls: Record<string, boolean>; // sessionId -> isActive
  mediaQuality: string;
  setMediaQuality: (quality: string) => void;
};

const P2PContext = createContext<P2PContextType | undefined>(undefined);

export const P2PProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sessions, setSessions] = useState<Record<string, P2PSession>>({});
  const [grids, setGrids] = useState<Grid[]>([]);
  const [p2pReady, setP2PReady] = useState(false);
  const [gridsLoaded, setGridsLoaded] = useState(false);
  
  // NEW: Media state
  const [activeCalls, setActiveCalls] = useState<Record<string, boolean>>({});
  const [mediaQuality, setMediaQuality] = useState<string>('medium');
  
  const toast = useToast();

  // ---- helpers ----
  const upsertSession = useCallback((s: P2PSession) => {
    setSessions(prev => ({ ...prev, [s.sessionId]: s }));
  }, []);

  // Load user's grids - FIXED: Now only loads when explicitly called
  const loadGrids = useCallback(async () => {
    try {
      console.log("Loading grids...");
      const gridsData = await invoke<{ grids: Grid[]; total: number }>("get_my_grids");
      setGrids(gridsData.grids || []);
      setGridsLoaded(true);
      console.log("Grids loaded successfully:", gridsData.grids?.length || 0);
    } catch (error) {
      console.error("Failed to load grids:", error);
      // Don't throw - this is expected when user isn't authenticated
      setGridsLoaded(false);
    }
  }, []);

  // NEW: Initialize media session
   const initializeMediaSession = useCallback(async (sessionId: string) => {
    try {
      // Check if this looks like a channel ID (UUID format)
      const isChannelId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId);
      const isVoiceChannel = sessionId.startsWith('voice_') || isChannelId;
      
      if (isVoiceChannel) {
        // For voice channels, create a standalone media session with channelId AND gridId
        // We need to extract gridId from the current context
        
        // Try to get gridId from current window/tab context
        // This should be available from the VoiceChannelWindow props
        const currentUrl = window.location.href;
        const gridIdMatch = currentUrl.match(/grid\/([a-f0-9-]+)/);
        const gridId = gridIdMatch ? gridIdMatch[1] : null;
        
        if (!gridId && isChannelId) {
          throw new Error('Grid ID not available for voice channel');
        }
        
        await invoke("create_media_session", { 
          sessionId,
          sessionType: "voice_channel",
          channelId: sessionId,
          gridId: gridId // Pass the grid ID
        });
        console.log(`Created voice channel media session for channel: ${sessionId} in grid: ${gridId}`);
      } else {
        // For P2P grid sessions, use the existing initialize command
        await invoke("initialize_media_session", { sessionId });
        console.log(`Initialized P2P media session: ${sessionId}`);
      }
      
      // Update session to indicate media is enabled
      setSessions(prev => ({
        ...prev,
        [sessionId]: {
          ...prev[sessionId],
          sessionId,
          hasMediaSession: true,
          mediaConnected: false,
          state: prev[sessionId]?.state || 'Connecting',
          createdAt: prev[sessionId]?.createdAt || Date.now(),
          updatedAt: Date.now()
        }
      }));
      
      // Mark as active call for voice channels
      if (isVoiceChannel) {
        setActiveCalls(prev => ({ ...prev, [sessionId]: true }));
      }
      
      toast('Media session initialized', 'success');
    } catch (error) {
      console.error("Failed to initialize media session:", error);
      toast(`Failed to initialize media: ${error}`, 'error');
      throw error; // Re-throw so caller can handle it
    }
  }, [toast]);

  // NEW: Get active media sessions
  const getMediaSessions = useCallback(async () => {
    try {
      const sessions = await invoke<string[]>("get_media_sessions");
      return sessions;
    } catch (error) {
      console.error("Failed to get media sessions:", error);
      return [];
    }
  }, []);

  // NEW: Close media session
  const closeMediaSession = useCallback(async (sessionId: string) => {
    try {
      await invoke("close_media_session", { sessionId });
      
      // Update session state
      setSessions(prev => ({
        ...prev,
        [sessionId]: {
          ...prev[sessionId],
          hasMediaSession: false,
          mediaConnected: false,
          hasAudio: false,
          hasVideo: false,
          hasScreenShare: false
        }
      }));
      
      // Remove from active calls
      setActiveCalls(prev => {
        const { [sessionId]: _, ...rest } = prev;
        return rest;
      });
      
      toast('Media session closed', 'info');
    } catch (error) {
      console.error("Failed to close media session:", error);
      toast(`Failed to close media session: ${error}`, 'error');
    }
  }, [toast]);

  // ---- init service + listeners ----
  useEffect(() => {
    let unsubscribers: Array<() => void> = [];

    (async () => {
      try {
        // Wait for services to be ready
        let serviceReady = false;
        let attempts = 0;
        const maxAttempts = 10;
        
        while (!serviceReady && attempts < maxAttempts) {
          try {
            await invoke("get_grids_from_cache");
            serviceReady = true;
          } catch (error) {
            attempts++;
            console.log(`Waiting for grids service... attempt ${attempts}`);
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        
        if (!serviceReady) {
          console.warn("Grids service not ready after waiting, continuing anyway");
        }
        
        setP2PReady(true);

        // REMOVED: Don't auto-load grids here
        // This was causing the "No token available" error
        // Grids will be loaded when user authenticates

        // Existing transport and process listeners
        const unsubTransportStarted = await listen("transport_started", (event: any) => {
          const { grid_id, connection_info } = event.payload;
          toast(`Transport tunnel active: ${connection_info.instructions}`, "success");
        });
        unsubscribers.push(unsubTransportStarted);
        
        const unsubProcessOutput = await listen("process_output", (event: any) => {
          const { grid_id, data } = event.payload;
          console.log("Process output:", atob(data));
        });
        unsubscribers.push(unsubProcessOutput);

        // UPDATED: Enhanced P2P session state changes with media info
        const unsubState = await listen<SessionStateChangedPayload>(
          "session_state_changed",
          (event) => {
            const { 
              session_id, 
              peer_user_id, 
              grid_id, 
              state, 
              error_message,
              media_connected,
              has_audio,
              has_video,
              has_screen_share
            } = event.payload;

            upsertSession({
              sessionId: session_id,
              peerUserId: peer_user_id,
              gridId: grid_id,
              state,
              lastError: error_message,
              updatedAt: Date.now(),
              createdAt: sessions[session_id]?.createdAt ?? Date.now(),
              // NEW: Media fields
              mediaConnected: media_connected,
              hasAudio: has_audio,
              hasVideo: has_video,
              hasScreenShare: has_screen_share
            });

            if (state === "Connected") {
              const grid = grids.find(g => g.id === grid_id);
              toast(
                `P2P Connected - Session ${session_id}${grid ? ` in ${grid.name}` : ''}`,
                "success"
              );
            } else if (state === "Failed") {
              toast(
                `P2P Connection Failed: ${error_message ?? "Unknown error"}`,
                "error"
              );
            }
          }
        );
        unsubscribers.push(unsubState);

        // NEW: Media event listeners
        const unsubMediaSessionInit = await listen<MediaSessionInitializedPayload>(
          "media_session_initialized",
          (event) => {
            const { session_id, media_enabled } = event.payload;
            
            setSessions(prev => ({
              ...prev,
              [session_id]: {
                ...prev[session_id],
                hasMediaSession: media_enabled
              }
            }));
            
            toast('Media session ready', 'success');
          }
        );
        unsubscribers.push(unsubMediaSessionInit);

        const unsubMediaTrackAdded = await listen<MediaTrackAddedPayload>(
          "media_track_added",
          (event) => {
            const { session_id, track_id, kind, enabled } = event.payload;
            
            setSessions(prev => ({
              ...prev,
              [session_id]: {
                ...prev[session_id],
                [kind === 'audio' ? 'hasAudio' : 'hasVideo']: enabled
              }
            }));
            
            toast(`${kind === 'audio' ? 'Microphone' : 'Camera'} ${enabled ? 'added' : 'removed'}`, 'info');
          }
        );
        unsubscribers.push(unsubMediaTrackAdded);

        const unsubMediaTrackRemoved = await listen<MediaTrackRemovedPayload>(
          "media_track_removed",
          (event) => {
            const { session_id, track_id } = event.payload;
            
            // Update session to remove the track
            setSessions(prev => {
              const session = prev[session_id];
              if (!session) return prev;
              
              // Determine which track was removed based on track_id
              const isAudio = track_id.includes('audio');
              
              return {
                ...prev,
                [session_id]: {
                  ...session,
                  [isAudio ? 'hasAudio' : 'hasVideo']: false
                }
              };
            });
          }
        );
        unsubscribers.push(unsubMediaTrackRemoved);

        const unsubVideoTrackReplaced = await listen<VideoTrackReplacedPayload>(
          "video_track_replaced",
          (event) => {
            const { session_id, old_track_id, new_track_id } = event.payload;
            
            // Determine if this is screen share based on track characteristics
            const isScreenShare = new_track_id.includes('screen') || old_track_id.includes('camera');
            
            setSessions(prev => ({
              ...prev,
              [session_id]: {
                ...prev[session_id],
                hasVideo: !isScreenShare,
                hasScreenShare: isScreenShare
              }
            }));
            
            toast(isScreenShare ? 'Screen sharing started' : 'Camera switched', 'info');
          }
        );
        unsubscribers.push(unsubVideoTrackReplaced);

        const unsubRemoteMediaTrack = await listen<RemoteMediaTrackPayload>(
          "remote_media_track",
          (event) => {
            const { session_id, user_id, kind, enabled } = event.payload;
            
            // Update participant count when remote media is detected
            setSessions(prev => ({
              ...prev,
              [session_id]: {
                ...prev[session_id],
                participantCount: (prev[session_id]?.participantCount || 0) + (enabled ? 1 : -1)
              }
            }));
            
            toast(`Remote ${kind} ${enabled ? 'started' : 'stopped'}`, 'info');
          }
        );
        unsubscribers.push(unsubRemoteMediaTrack);

        const unsubMediaConnection = await listen<MediaConnectionChangedPayload>(
          "media_connection_changed",
          (event) => {
            const { session_id, connected, quality } = event.payload;
            
            setSessions(prev => ({
              ...prev,
              [session_id]: {
                ...prev[session_id],
                mediaConnected: connected,
                mediaQuality: quality as any
              }
            }));
            
            if (connected) {
              setActiveCalls(prev => ({ ...prev, [session_id]: true }));
              toast('Media connection established', 'success');
            } else {
              setActiveCalls(prev => {
                const { [session_id]: _, ...rest } = prev;
                return rest;
              });
              toast('Media connection lost', 'warning');
            }
          }
        );
        unsubscribers.push(unsubMediaConnection);

        const unsubRemoteMediaState = await listen<RemoteMediaStateChangedPayload>(
          "remote_media_state_changed",
          (event) => {
            const { session_id, user_id, enabled } = event.payload;
            console.log(`Remote media state changed: ${user_id} - ${enabled}`);
          }
        );
        unsubscribers.push(unsubRemoteMediaState);

        const unsubRemoteQuality = await listen<RemoteQualityChangedPayload>(
          "remote_quality_changed",
          (event) => {
            const { session_id, user_id, quality_preset } = event.payload;
            toast(`${user_id} changed quality to ${quality_preset}`, 'info');
          }
        );
        unsubscribers.push(unsubRemoteQuality);

        // Existing grid listeners
        const unsubHostChanged = await listen<{grid_id: string, new_host_id?: string, session_state: string}>(
          "grid_host_changed",
          (event) => {
            const { grid_id, new_host_id } = event.payload;
            const grid = grids.find(g => g.id === grid_id);
            
            if (new_host_id) {
              toast(`Grid ${grid?.name || grid_id} is now hosted by ${new_host_id}`, "info");
            } else {
              toast(`Grid ${grid?.name || grid_id} is no longer hosted`, "info");
            }
          }
        );
        unsubscribers.push(unsubHostChanged);

        const unsubHostingStarted = await listen<{grid_id: string, is_host: boolean}>(
          "grid_hosting_started",
          (event) => {
            const { grid_id } = event.payload;
            const grid = grids.find(g => g.id === grid_id);
            toast(`You are now hosting ${grid?.name || grid_id}`, "success");
          }
        );
        unsubscribers.push(unsubHostingStarted);

        const unsubHostingStopped = await listen<{grid_id: string, is_host: boolean}>(
          "grid_hosting_stopped",
          (event) => {
            const { grid_id } = event.payload;
            const grid = grids.find(g => g.id === grid_id);
            toast(`Stopped hosting ${grid?.name || grid_id}`, "info");
          }
        );
        unsubscribers.push(unsubHostingStopped);

      } catch (err) {
        console.error("P2P init failed:", err);
        toast("Failed to initialize P2P service", "error");
      }
    })();

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [toast, upsertSession, grids]); // Removed loadGrids from dependencies

  // ---- Grid-based actions (unchanged) ----
  const joinGridSession = useCallback(async (gridId: string) => {
    try {
      await invoke<string>("join_grid_session", { gridId });
      
      const grid = grids.find(g => g.id === gridId);
      toast(
        `Joining session in ${grid?.name || gridId}...`,
        "success"
      );
    } catch (err) {
      toast(`Failed to join grid session: ${String(err)}`, "error");
    }
  }, [toast, grids]);

  const releaseGridHost = useCallback(async (gridId: string) => {
    try {
      await invoke("release_grid_host", { gridId });
      
      const grid = grids.find(g => g.id === gridId);
      toast(`Released host status for ${grid?.name || gridId}`, "success");
    } catch (err) {
      toast(`Failed to release host: ${String(err)}`, "error");
    }
  }, [toast, grids]);

  const getGridStatus = useCallback(async (gridId: string) => {
    try {
      const status = await invoke("get_grid_session_status", { gridId });
      return status;
    } catch (err) {
      console.error("Failed to get grid status:", err);
      return null;
    }
  }, []);

  const closeSession = useCallback(async (sessionId: string) => {
    try {
      // Close media session first if it exists
      if (sessions[sessionId]?.hasMediaSession) {
        await closeMediaSession(sessionId);
      }
      
      // Then close P2P session
      await invoke("close_p2p_session", { sessionId });
      setSessions(prev => {
        const { [sessionId]: _, ...rest } = prev;
        return rest;
      });
      
      // Remove from active calls
      setActiveCalls(prev => {
        const { [sessionId]: _, ...rest } = prev;
        return rest;
      });
      
      toast(`Session closed: ${sessionId}`, "success");
    } catch (err) {
      toast(`Failed to close session: ${String(err)}`, "error");
    }
  }, [toast, sessions, closeMediaSession]);

  const sendData = useCallback(async (sessionId: string, data: number[]) => {
    try {
      await invoke("send_p2p_data", { sessionId, data });
      toast(`Data sent to session ${sessionId}`, "success");
    } catch (err) {
      toast(`Failed to send data: ${String(err)}`, "error");
    }
  }, [toast]);

  return (
    <P2PContext.Provider value={{ 
      sessions, 
      joinGridSession, 
      releaseGridHost, 
      getGridStatus, 
      closeSession, 
      sendData, 
      p2pReady,
      gridsLoaded,
      loadGrids, // Now exposed so parent components can trigger loading
      
      // NEW: Media functions
      initializeMediaSession,
      getMediaSessions,
      closeMediaSession,
      
      // NEW: Media state
      activeCalls,
      mediaQuality,
      setMediaQuality
    }}>
      {children}
    </P2PContext.Provider>
  );
};

export function useP2P() {
  const ctx = useContext(P2PContext);
  if (!ctx) throw new Error("useP2P must be used within P2PProvider");
  return ctx;
}