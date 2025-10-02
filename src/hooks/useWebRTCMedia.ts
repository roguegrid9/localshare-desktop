// src/hooks/useWebRTCMedia.ts - WebRTC media track management hook
import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useToast } from '../components/ui/Toaster';
import { useP2P } from '../context/P2PProvider';
import type {
  MediaSessionInfo,
  RemoteMediaState,
  MediaStateChangedPayload,
  MediaErrorPayload,
  RTCMediaTrackInfo,
  MediaStreamStats
} from '../types/media';
import type { MediaStreamState } from '../types/media';

export function useWebRTCMedia(sessionId?: string) {
  const [mediaSession, setMediaSession] = useState<MediaSessionInfo | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteMediaState[]>([]);
  const [mediaConnected, setMediaConnected] = useState(false);
  const [lastError, setLastError] = useState<string | undefined>();
  
  const { sessions } = useP2P();
  const toast = useToast();
  
  // Track references for managing media streams
  const localTracksRef = useRef<Map<string, MediaStreamTrack>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  
  // Get the current session
  const currentSession = sessionId ? sessions[sessionId] : null;
  
  // Initialize media session for a P2P connection
  const initializeMediaSession = useCallback(async (sessionId: string) => {
    try {
      if (!currentSession) {
        throw new Error('P2P session not found');
      }
      
      // Initialize media session state
      const newMediaSession: MediaSessionInfo = {
        sessionId,
        isHost: currentSession.state === 'Connected', // Simplified host detection
        localMedia: {
          audio: { enabled: false, muted: false },
          video: { enabled: false, muted: false },
          screen: { enabled: false }
        },
        remoteParticipants: [],
        mediaConnected: false
      };
      
      setMediaSession(newMediaSession);
      setMediaConnected(false);
      setLastError(undefined);
      
      // Request WebRTC peer connection from backend
      // This would extend your existing P2P connection to handle media
      await invoke('initialize_media_session', { sessionId });
      
      toast('Media session initialized', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to initialize media session:', error);
      setLastError(message);
      toast(`Failed to initialize media: ${message}`, 'error');
    }
  }, [currentSession, toast]);
  
  // Add local media track to the peer connection
  const addLocalTrack = useCallback(async (track: MediaStreamTrack, stream: MediaStream, kind: 'audio' | 'video') => {
    try {
      if (!mediaSession) {
        throw new Error('Media session not initialized');
      }
      
      // Store track reference
      const trackId = `${kind}_${track.id}`;
      localTracksRef.current.set(trackId, track);
      
      // Signal to backend to add track to peer connection
      await invoke('add_media_track', {
        sessionId: mediaSession.sessionId,
        trackId: track.id,
        kind,
        streamId: stream.id
      });
      
      // Update local media state
      setMediaSession(prev => {
        if (!prev) return prev;
        
        return {
          ...prev,
          localMedia: {
            ...prev.localMedia,
            [kind]: {
              ...prev.localMedia[kind],
              enabled: true,
              stream
            }
          }
        };
      });
      
      toast(`${kind === 'audio' ? 'Microphone' : 'Camera'} added to call`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to add ${kind} track:`, error);
      toast(`Failed to add ${kind === 'audio' ? 'microphone' : 'camera'}: ${message}`, 'error');
    }
  }, [mediaSession, toast]);
  
  // Remove local media track from peer connection
  const removeLocalTrack = useCallback(async (kind: 'audio' | 'video') => {
    try {
      if (!mediaSession) {
        throw new Error('Media session not initialized');
      }
      
      // Find and remove track
      const trackToRemove = Array.from(localTracksRef.current.entries())
        .find(([id]) => id.startsWith(kind));
      
      if (trackToRemove) {
        const [trackId, track] = trackToRemove;
        
        // Stop the track
        track.stop();
        localTracksRef.current.delete(trackId);
        
        // Signal to backend to remove track
        await invoke('remove_media_track', {
          sessionId: mediaSession.sessionId,
          trackId: track.id
        });
        
        // Update local media state
        setMediaSession(prev => {
          if (!prev) return prev;
          
          return {
            ...prev,
            localMedia: {
              ...prev.localMedia,
              [kind]: {
                ...prev.localMedia[kind],
                enabled: false,
                stream: undefined
              }
            }
          };
        });
        
        toast(`${kind === 'audio' ? 'Microphone' : 'Camera'} removed from call`, 'info');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to remove ${kind} track:`, error);
      toast(`Failed to remove ${kind === 'audio' ? 'microphone' : 'camera'}: ${message}`, 'error');
    }
  }, [mediaSession, toast]);
  
  // Update track enabled state (mute/unmute)
  const setTrackEnabled = useCallback(async (kind: 'audio' | 'video', enabled: boolean) => {
    try {
      if (!mediaSession) return;
      
      const trackEntry = Array.from(localTracksRef.current.entries())
        .find(([id]) => id.startsWith(kind));
      
      if (trackEntry) {
        const [_, track] = trackEntry;
        track.enabled = enabled;
        
        // Signal mute state to remote peers
        await invoke('set_track_enabled', {
          sessionId: mediaSession.sessionId,
          trackId: track.id,
          enabled
        });
        
        // Update local state
        setMediaSession(prev => {
          if (!prev) return prev;
          
          return {
            ...prev,
            localMedia: {
              ...prev.localMedia,
              [kind]: {
                ...prev.localMedia[kind],
                muted: !enabled
              }
            }
          };
        });
      }
    } catch (error) {
      console.error(`Failed to set ${kind} track enabled:`, error);
    }
  }, [mediaSession]);
  
  // Replace video track (for camera switching or screen share)
  const replaceVideoTrack = useCallback(async (newTrack: MediaStreamTrack, newStream: MediaStream) => {
    try {
      if (!mediaSession) {
        throw new Error('Media session not initialized');
      }
      
      // Find existing video track
      const existingVideoEntry = Array.from(localTracksRef.current.entries())
        .find(([id]) => id.startsWith('video'));
      
      if (existingVideoEntry) {
        const [oldTrackId, oldTrack] = existingVideoEntry;
        
        // Stop old track
        oldTrack.stop();
        localTracksRef.current.delete(oldTrackId);
        
        // Add new track
        const newTrackId = `video_${newTrack.id}`;
        localTracksRef.current.set(newTrackId, newTrack);
        
        // Signal track replacement to backend
        await invoke('replace_video_track', {
          sessionId: mediaSession.sessionId,
          oldTrackId: oldTrack.id,
          newTrackId: newTrack.id,
          streamId: newStream.id
        });
        
        // Update media state based on track kind
        const isScreenShare = newTrack.label.includes('screen') || newTrack.getSettings().displaySurface;
        
        setMediaSession(prev => {
          if (!prev) return prev;
          
          if (isScreenShare) {
            return {
              ...prev,
              localMedia: {
                ...prev.localMedia,
                video: { ...prev.localMedia.video, enabled: false },
                screen: { enabled: true, stream: newStream }
              }
            };
          } else {
            return {
              ...prev,
              localMedia: {
                ...prev.localMedia,
                video: { ...prev.localMedia.video, enabled: true, stream: newStream },
                screen: { enabled: false }
              }
            };
          }
        });
        
        toast(isScreenShare ? 'Screen sharing started' : 'Camera switched', 'success');
      } else {
        // No existing video track, just add the new one
        await addLocalTrack(newTrack, newStream, 'video');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to replace video track:', error);
      toast(`Failed to update video: ${message}`, 'error');
    }
  }, [mediaSession, addLocalTrack, toast]);
  
  // Get media statistics
  const getMediaStats = useCallback(async (): Promise<MediaStreamStats | null> => {
    try {
      if (!mediaSession) return null;
      
      const stats = await invoke<MediaStreamStats>('get_media_stats', {
        sessionId: mediaSession.sessionId
      });
      
      return stats;
    } catch (error) {
      console.error('Failed to get media stats:', error);
      return null;
    }
  }, [mediaSession]);
  
  // Handle remote media track events
  const handleRemoteTrack = useCallback((event: any) => {
    const { userId, trackId, kind, streamId, enabled } = event.payload;
    
    // This would be called when we receive media tracks from remote peers
    // The actual MediaStream would be handled by the WebRTC peer connection
    
    setRemoteParticipants(prev => {
      const existingParticipant = prev.find(p => p.userId === userId);
      
      if (existingParticipant) {
        // Update existing participant
        return prev.map(p => 
          p.userId === userId 
            ? {
                ...p,
                [kind]: {
                  ...p[kind as keyof typeof p],
                  enabled
                }
              }
            : p
        );
      } else {
        // Add new participant
        const newParticipant: RemoteMediaState = {
          userId,
          sessionId: mediaSession?.sessionId || '',
          audio: { enabled: kind === 'audio' ? enabled : false, speaking: false, volume: 1 },
          video: { enabled: kind === 'video' ? enabled : false },
          screen: { enabled: false }
        };
        
        return [...prev, newParticipant];
      }
    });
  }, [mediaSession]);
  
  // Set up event listeners for media-related events
  useEffect(() => {
    let unsubscribers: Array<() => void> = [];
    
    const setupListeners = async () => {
      try {
        // Listen for remote media track events
        const unsubRemoteTrack = await listen('remote_media_track', handleRemoteTrack);
        unsubscribers.push(unsubRemoteTrack);
        
        // Listen for media state changes
        const unsubMediaState = await listen<MediaStateChangedPayload>('media_state_changed', (event) => {
          const { sessionId: eventSessionId, mediaType, enabled } = event.payload;
          
          if (eventSessionId === sessionId) {
            setMediaSession(prev => {
              if (!prev) return prev;
              
              return {
                ...prev,
                localMedia: {
                  ...prev.localMedia,
                  [mediaType]: {
                    ...prev.localMedia[mediaType as keyof typeof prev.localMedia],
                    enabled
                  }
                }
              };
            });
          }
        });
        unsubscribers.push(unsubMediaState);
        
        // Listen for media errors
        const unsubMediaError = await listen<MediaErrorPayload>('media_error', (event) => {
          const { sessionId: eventSessionId, message } = event.payload;
          
          if (eventSessionId === sessionId) {
            setLastError(message);
            toast(`Media error: ${message}`, 'error');
          }
        });
        unsubscribers.push(unsubMediaError);
        
        // Listen for media connection state
        const unsubMediaConnection = await listen('media_connection_changed', (event: any) => {
          const { sessionId: eventSessionId, connected } = event.payload;
          
          if (eventSessionId === sessionId) {
            setMediaConnected(connected);
            if (connected) {
              toast('Media connection established', 'success');
            }
          }
        });
        unsubscribers.push(unsubMediaConnection);
        
      } catch (error) {
        console.error('Failed to set up media event listeners:', error);
      }
    };
    
    if (sessionId) {
      setupListeners();
    }
    
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [sessionId, handleRemoteTrack, toast]);
  
  // Cleanup on unmount or session change
  useEffect(() => {
    return () => {
      // Stop all local tracks
      localTracksRef.current.forEach(track => track.stop());
      localTracksRef.current.clear();
      
      // Clear remote streams
      remoteStreamsRef.current.clear();
    };
  }, [sessionId]);
  
  return {
    // State
    mediaSession,
    remoteParticipants,
    mediaConnected,
    lastError,
    
    // Session management
    initializeMediaSession,
    
    // Local media control
    addLocalTrack,
    removeLocalTrack,
    setTrackEnabled,
    replaceVideoTrack,
    
    // Utility
    getMediaStats,
    
    // Computed state
    hasLocalAudio: mediaSession?.localMedia.audio.enabled || false,
    hasLocalVideo: mediaSession?.localMedia.video.enabled || false,
    hasScreenShare: mediaSession?.localMedia.screen.enabled || false,
    remoteParticipantCount: remoteParticipants.length
  };
}
