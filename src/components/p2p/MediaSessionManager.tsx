// src/components/p2p/MediaSessionManager.tsx - Media-specific session controls
import { useState, useEffect, useCallback } from 'react';
import { useMediaStreams } from '../../hooks/useMediaStreams';
import { useWebRTCMedia } from '../../hooks/useWebRTCMedia';
import { useP2P } from '../../context/P2PProvider';
import { useToast } from '../ui/Toaster';
import MediaControls from '../media/MediaControls';
import VideoCall from '../media/VideoCall';
import ScreenShareOverlay from '../media/ScreenShareOverlay';
import AudioIndicator from '../media/AudioIndicator';
import type { P2PSession } from '../../types/p2p';
import type { MediaQualityPreset } from '../../types/media';

interface MediaSessionManagerProps {
  open?: boolean;
  onClose?: () => void;
  className?: string;
}

interface MediaSessionCardProps {
  session: P2PSession;
  onStartCall: (sessionId: string) => void;
  onJoinCall: (sessionId: string) => void;
  onEndCall: (sessionId: string) => void;
  isInCall: boolean;
}

const MediaSessionCard = ({ 
  session, 
  onStartCall, 
  onJoinCall, 
  onEndCall,
  isInCall 
}: MediaSessionCardProps) => {
  const { 
    mediaSession, 
    mediaConnected, 
    hasLocalAudio, 
    hasLocalVideo, 
    hasScreenShare,
    remoteParticipantCount 
  } = useWebRTCMedia(session.sessionId);
  
  const { mediaState } = useMediaStreams();
  
  const getCallStatus = () => {
    if (!mediaSession) return { text: 'No media session', color: 'text-gray-400' };
    if (!mediaConnected) return { text: 'Connecting...', color: 'text-yellow-400' };
    if (remoteParticipantCount === 0) return { text: 'Waiting for others', color: 'text-blue-400' };
    return { text: `${remoteParticipantCount + 1} participants`, color: 'text-green-400' };
  };
  
  const callStatus = getCallStatus();
  
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="font-medium text-white truncate">
              Session {session.sessionId.slice(0, 8)}...
            </h3>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
              session.state === 'Connected' 
                ? 'bg-emerald-500/20 text-emerald-300' 
                : 'bg-yellow-500/20 text-yellow-300'
            }`}>
              {session.state}
            </span>
          </div>
          
          <div className="flex items-center gap-4 text-sm text-white/60">
            <span>Grid: {session.gridId}</span>
            <span className={callStatus.color}>{callStatus.text}</span>
          </div>
        </div>
        
        {/* Quick media status */}
        <div className="flex items-center gap-2">
          {isInCall && (
            <>
              <AudioIndicator
                audioEnabled={hasLocalAudio}
                muted={mediaState.audio.muted}
                speaking={mediaState.audio.enabled && false} // Would need actual speaking detection
                size="sm"
                showLevel={false}
              />
              
              {hasLocalVideo && (
                <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                  <svg className="w-3 h-3 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
              
              {hasScreenShare && (
                <div className="w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                  <svg className="w-3 h-3 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      
      {/* Media controls for active sessions */}
      {isInCall && mediaSession && (
        <div className="mb-4 p-3 bg-white/5 rounded-lg">
          <MediaControls
            sessionId={session.sessionId}
            config={{
              size: 'sm',
              showAudio: true,
              showVideo: true,
              showScreenShare: true,
              showSettings: false
            }}
          />
        </div>
      )}
      
      {/* Action buttons */}
      <div className="flex gap-2">
        {!isInCall ? (
          <>
            <button
              onClick={() => onStartCall(session.sessionId)}
              disabled={session.state !== 'Connected'}
              className="flex-1 rounded-lg bg-green-500/20 border border-green-500/30 px-3 py-2 text-sm text-green-300 hover:bg-green-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Start Call
            </button>
            
            {mediaSession && (
              <button
                onClick={() => onJoinCall(session.sessionId)}
                disabled={session.state !== 'Connected'}
                className="flex-1 rounded-lg bg-blue-500/20 border border-blue-500/30 px-3 py-2 text-sm text-blue-300 hover:bg-blue-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Join Call
              </button>
            )}
          </>
        ) : (
          <button
            onClick={() => onEndCall(session.sessionId)}
            className="flex-1 rounded-lg bg-red-500/20 border border-red-500/30 px-3 py-2 text-sm text-red-300 hover:bg-red-500/30 transition-colors"
          >
            End Call
          </button>
        )}
        
        <button
          onClick={() => {/* Open session details */}}
          className="rounded-lg border border-white/10 px-3 py-2 text-sm hover:border-white/20 transition-colors"
          title="Session details"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default function MediaSessionManager({ 
  open = true, 
  onClose,
  className = '' 
}: MediaSessionManagerProps) {
  const [activeCallSession, setActiveCallSession] = useState<string | null>(null);
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [showScreenShare, setShowScreenShare] = useState(false);
  const [qualityPreset, setQualityPreset] = useState<MediaQualityPreset>('medium');
  
  const { sessions } = useP2P();
  const toast = useToast();
  
  // Get media-enabled sessions
  const mediaSessions = Object.values(sessions).filter(session => 
    session.state === 'Connected' || session.state === 'Connecting'
  );
  
  // Handle starting a call
  const handleStartCall = useCallback(async (sessionId: string) => {
    try {
      setActiveCallSession(sessionId);
      setShowVideoCall(true);
      toast('Starting video call...', 'info');
    } catch (error) {
      console.error('Failed to start call:', error);
      toast('Failed to start call', 'error');
    }
  }, [toast]);
  
  // Handle joining a call
  const handleJoinCall = useCallback(async (sessionId: string) => {
    try {
      setActiveCallSession(sessionId);
      setShowVideoCall(true);
      toast('Joining video call...', 'info');
    } catch (error) {
      console.error('Failed to join call:', error);
      toast('Failed to join call', 'error');
    }
  }, [toast]);
  
  // Handle ending a call
  const handleEndCall = useCallback(async (sessionId: string) => {
    try {
      setActiveCallSession(null);
      setShowVideoCall(false);
      setShowScreenShare(false);
      toast('Call ended', 'info');
    } catch (error) {
      console.error('Failed to end call:', error);
      toast('Failed to end call', 'error');
    }
  }, [toast]);
  
  // Handle closing video call
  const handleCloseVideoCall = useCallback(() => {
    setShowVideoCall(false);
    if (activeCallSession) {
      handleEndCall(activeCallSession);
    }
  }, [activeCallSession, handleEndCall]);
  
  // Auto-cleanup when sessions disconnect
  useEffect(() => {
    if (activeCallSession) {
      const session = sessions[activeCallSession];
      if (!session || session.state === 'Disconnected' || session.state === 'Failed') {
        setActiveCallSession(null);
        setShowVideoCall(false);
        setShowScreenShare(false);
      }
    }
  }, [sessions, activeCallSession]);
  
  if (!open) return null;
  
  return (
    <>
      {/* Main session manager panel */}
      <div className={`fixed inset-0 z-40 flex items-end justify-end ${className}`}>
        {/* Overlay */}
        <div
          className="absolute inset-0 bg-black/40"
          onClick={() => onClose?.()}
        />
        
        {/* Panel */}
        <div className="relative m-3 w-full max-w-2xl rounded-2xl border border-white/10 bg-neutral-900/95 p-4 shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Media Sessions</h2>
            
            <div className="flex items-center gap-2">
              {/* Quality settings */}
              <select
                value={qualityPreset}
                onChange={(e) => setQualityPreset(e.target.value as MediaQualityPreset)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-sm"
              >
                <option value="auto">Auto Quality</option>
                <option value="low">Low Quality</option>
                <option value="medium">Medium Quality</option>
                <option value="high">High Quality</option>
              </select>
              
              <button
                aria-label="Close"
                className="rounded-md p-1 text-neutral-400 hover:bg-white/10 hover:text-white"
                onClick={() => onClose?.()}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </div>
          
          {/* Session list */}
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {mediaSessions.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-2xl font-bold text-white mb-4 mx-auto">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="text-lg font-medium text-white mb-2">No Active Sessions</div>
                <div className="text-sm text-white/60">
                  Connect to a P2P session from your grids to start video calling
                </div>
              </div>
            ) : (
              mediaSessions.map((session) => (
                <MediaSessionCard
                  key={session.sessionId}
                  session={session}
                  onStartCall={handleStartCall}
                  onJoinCall={handleJoinCall}
                  onEndCall={handleEndCall}
                  isInCall={activeCallSession === session.sessionId}
                />
              ))
            )}
          </div>
          
          {/* Quick actions */}
          {activeCallSession && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/70">Active Call</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowVideoCall(!showVideoCall)}
                    className={`rounded-lg border px-3 py-1 text-sm transition-colors ${
                      showVideoCall
                        ? 'border-blue-500/30 bg-blue-500/20 text-blue-300'
                        : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                    }`}
                  >
                    {showVideoCall ? 'Hide Video' : 'Show Video'}
                  </button>
                  
                  <button
                    onClick={() => setShowScreenShare(!showScreenShare)}
                    className={`rounded-lg border px-3 py-1 text-sm transition-colors ${
                      showScreenShare
                        ? 'border-purple-500/30 bg-purple-500/20 text-purple-300'
                        : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                    }`}
                  >
                    Screen Share
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Video call overlay */}
      {showVideoCall && activeCallSession && (
        <VideoCall
          sessionId={activeCallSession}
          gridId={sessions[activeCallSession]?.gridId || ''}
          onClose={handleCloseVideoCall}
          layout="grid"
        />
      )}
      
      {/* Screen share overlay */}
      {showScreenShare && activeCallSession && (
        <ScreenShareOverlay
          participant={{
            userId: 'local',
            displayName: 'You',
            isLocal: true,
            screenStream: undefined, // Would be populated from useMediaStreams
            audioEnabled: false,
            speaking: false
          }}
          onClose={() => setShowScreenShare(false)}
          onMinimize={() => setShowScreenShare(false)}
          onToggleFullscreen={() => {/* Handle fullscreen toggle */}}
          showControls={true}
          isFullscreen={false}
        />
      )}
    </>
  );
}
