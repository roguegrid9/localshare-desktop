import { useState, useEffect, useCallback } from 'react';
import { Mic, MicOff, Volume2, Settings, Users, X, Minimize2, Phone, PhoneOff } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core'; // Add this import
import { useChannels } from '../../hooks/useChannels';
import { useP2P } from '../../context/P2PProvider';
import { useWebRTCMedia } from '../../hooks/useWebRTCMedia';
import { useMediaStreams } from '../../hooks/useMediaStreams';
import MediaControls from '../media/MediaControls';
import { AudioErrorBoundary } from '../media/AudioErrorBoundary';

interface VoiceChannelWindowProps {
  channelId: string;
  gridId: string;
  onClose?: () => void;
  onMinimize?: () => void;
  className?: string;
}

interface VoiceParticipant {
  userId: string;
  displayName: string;
  isLocal: boolean;
  audioEnabled: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  audioLevel?: number;
  connectionState: 'connecting' | 'connected' | 'disconnected';
}

export default function VoiceChannelWindow({
  channelId,
  gridId,
  onClose,
  onMinimize,
  className = ''
}: VoiceChannelWindowProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Hooks
  const { getChannelById } = useChannels(gridId);
  useP2P(); // Used for P2P context setup
  const { 
    mediaState, 
    backendAvailable,
    startAudio, 
    stopAudio, 
    toggleAudioMute, 
    getAudioLevel,
    audioSettings,
    saveAudioSettings
  } = useMediaStreams();
  
  // Get channel info
  const channel = getChannelById(channelId);
  
  const { 
    mediaSession, 
    remoteParticipants, 
    mediaConnected,
    hasLocalAudio,
    addLocalTrack,
    removeLocalTrack,
    setTrackEnabled
  } = useWebRTCMedia(sessionId || undefined);

  // Join voice channel
  const handleJoinChannel = useCallback(async () => {
    if (isConnecting || isConnected) return;
    
    setIsConnecting(true);
    
    try {
      // Use the actual channel ID for the session, not a generated one
      const voiceSessionId = channelId; // Use real channel ID
      console.log('Joining voice channel with channel ID:', channelId, 'in grid:', gridId);
      
      // Create a modified initializeMediaSession that passes gridId
      await invoke("create_media_session", { 
        sessionId: voiceSessionId,
        sessionType: "voice_channel",
        channelId: channelId,
        gridId: gridId
      });
      console.log('Media session initialized');
      
      // Set session ID after successful initialization
      setSessionId(voiceSessionId);
      
      // Small delay to ensure the session is fully initialized
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Start audio after session is ready
      const audioStream = await startAudio();
      console.log('Audio started:', !!audioStream);
      
      setIsConnected(true);
      console.log('Voice channel joined successfully');
    } catch (error) {
      console.error('Failed to join voice channel:', error);
      // Reset session ID if join failed
      setSessionId(null);
    } finally {
      setIsConnecting(false);
    }
  }, [channelId, gridId, isConnecting, isConnected, startAudio]);

  // Leave voice channel
  const handleLeaveChannel = useCallback(async () => {
    if (!isConnected) return;
    
    try {
      if (hasLocalAudio) {
        await removeLocalTrack('audio');
      }
      stopAudio();
      
      setIsConnected(false);
      setSessionId(null);
    } catch (error) {
      console.error('Failed to leave voice channel:', error);
    }
  }, [isConnected, hasLocalAudio, removeLocalTrack, stopAudio]);

  // Handle mute toggle
  const handleMuteToggle = useCallback(async () => {
    toggleAudioMute();
    if (hasLocalAudio) {
      await setTrackEnabled('audio', mediaState.audio.muted);
    }
  }, [toggleAudioMute, hasLocalAudio, setTrackEnabled, mediaState.audio.muted]);

  // Handle volume change
  const handleVolumeChange = useCallback(async (volume: number) => {
    const newSettings = { ...audioSettings, input_volume: volume };
    await saveAudioSettings(newSettings);
  }, [audioSettings, saveAudioSettings]);

  // Build participants list
  useEffect(() => {
    const localParticipant: VoiceParticipant = {
      userId: 'local',
      displayName: 'You',
      isLocal: true,
      audioEnabled: mediaState.audio.enabled,
      isMuted: mediaState.audio.muted,
      isSpeaking: mediaState.audio.enabled && getAudioLevel().speaking,
      audioLevel: mediaState.audio.level,
      connectionState: mediaConnected ? 'connected' : 'connecting'
    };

    const remoteParticipantList: VoiceParticipant[] = remoteParticipants.map(remote => ({
      userId: remote.userId,
      displayName: remote.displayName || remote.userId,
      isLocal: false,
      audioEnabled: remote.audio.enabled,
      isMuted: false,
      isSpeaking: remote.audio.speaking,
      audioLevel: remote.audio.volume || 0,
      connectionState: 'connected'
    }));

    setParticipants([localParticipant, ...remoteParticipantList]);
  }, [mediaState, remoteParticipants, mediaConnected, getAudioLevel]);

  // Don't auto-join - let user explicitly click join button
  // This prevents premature P2P session initialization
  // useEffect(() => {
  //   if (channel?.channel_type === 'voice' && !isConnected && !isConnecting) {
  //     handleJoinChannel();
  //   }
  // }, [channel, isConnected, isConnecting, handleJoinChannel]);

  // Handle adding audio track when mediaSession becomes available
  useEffect(() => {
    const addAudioIfReady = async () => {
      if (mediaSession && mediaState.audio.enabled && mediaState.audio.stream && !hasLocalAudio) {
        try {
          const audioTrack = mediaState.audio.stream.getAudioTracks()[0];
          if (audioTrack) {
            console.log('Adding audio track to existing session');
            await addLocalTrack(audioTrack, mediaState.audio.stream, 'audio');
          }
        } catch (error) {
          console.error('Failed to add audio track to session:', error);
        }
      }
    };

    addAudioIfReady();
  }, [mediaSession, mediaState.audio.enabled, mediaState.audio.stream, hasLocalAudio, addLocalTrack]);

  if (!channel) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#0B0D10]">
        <div className="text-white/60">Voice channel not found</div>
      </div>
    );
  }

  return (
    <AudioErrorBoundary>
      <div className={`w-full h-full bg-[#0B0D10] flex flex-col ${className}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#0E1116] border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-white/5 border border-white/10 rounded flex items-center justify-center">
              <Volume2 className="w-4 h-4 text-white/70" />
            </div>
            <div>
              <h2 className="font-semibold text-white text-sm">{channel.name}</h2>
              <div className="text-xs text-white/60">
                {participants.length} participant{participants.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
              title="Voice Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            
            {onMinimize && (
              <button
                onClick={onMinimize}
                className="p-2 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                title="Minimize"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            )}
            
            <button
              onClick={onClose}
              className="p-2 rounded hover:bg-red-500/20 text-white/60 hover:text-white transition-colors"
              title="Close Voice Channel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Connection Status Bar */}
        <div className="px-4 py-2 bg-[#0E1116] border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-400' :
                isConnecting ? 'bg-yellow-400' : 'bg-red-400'
              }`} />
              <span className="text-xs text-white/60">
                {isConnected ? 'Voice Connected' :
                 isConnecting ? 'Connecting...' : 'Disconnected'}
              </span>
              {backendAvailable && (
                <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
                  HD Audio
                </span>
              )}
            </div>
            
            {!isConnected && !isConnecting && (
              <button
                onClick={handleJoinChannel}
                className="flex items-center gap-2 px-3 py-1 rounded bg-white/10 hover:bg-white/15 text-white text-xs font-medium transition-colors border border-white/20"
              >
                <Phone className="w-3 h-3" />
                Join Voice
              </button>
            )}
            
            {isConnected && (
              <button
                onClick={handleLeaveChannel}
                className="flex items-center gap-2 px-3 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-white text-xs font-medium transition-colors border border-red-500/30"
              >
                <PhoneOff className="w-3 h-3" />
                Leave
              </button>
            )}
          </div>
        </div>

        {/* Participants List */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-2">
            {participants.map((participant) => (
              <VoiceParticipantCard
                key={participant.userId}
                participant={participant}
                onMuteToggle={participant.isLocal ? handleMuteToggle : undefined}
              />
            ))}
            
            {participants.length === 1 && isConnected && (
              <div className="text-center py-12 text-white/40">
                <Users className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="text-sm font-medium mb-1">No one else is here</p>
                <p className="text-xs opacity-75">Invite others to start talking!</p>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Controls Bar */}
        {isConnected && (
          <div className="p-3 bg-[#0E1116] border-t border-white/10">
            <div className="flex justify-center">
              {sessionId && (
                <MediaControls
                  sessionId={sessionId}
                  config={{
                    showAudio: true,
                    showVideo: false,
                    showScreenShare: false,
                    showSettings: true,
                    size: 'md'
                  }}
                  className="bg-white/5 border border-white/10 rounded-lg p-2"
                />
              )}
            </div>
          </div>
        )}

        {/* Settings Panel */}
        {showSettings && (
          <div className="absolute top-12 right-4 w-80 bg-[#0E1116] border border-white/10 rounded-lg shadow-2xl overflow-hidden z-50">
            <div className="bg-white/5 px-4 py-3 border-b border-white/10">
              <h3 className="font-semibold text-white">Voice Settings</h3>
            </div>
            
            <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
              {/* Input Volume */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-white/70 uppercase tracking-wide">
                    Input Volume
                  </label>
                  <span className="text-xs text-white/50">
                    {Math.round((audioSettings?.input_volume || 1) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={audioSettings?.input_volume || 1}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer
                    [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full 
                    [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-none"
                />
              </div>

              {/* Voice Activity */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-white/70 uppercase tracking-wide">
                    Voice Activity Threshold
                  </label>
                  <span className="text-xs text-white/50">
                    {Math.round((audioSettings?.voice_activation_threshold || 0.1) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={audioSettings?.voice_activation_threshold || 0.1}
                  onChange={(e) => {
                    const newSettings = { ...audioSettings, voice_activation_threshold: parseFloat(e.target.value) };
                    saveAudioSettings(newSettings);
                  }}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
                />
              </div>

              {/* Audio Processing Toggles */}
              <div className="space-y-3">
                <SettingsToggle
                  label="Noise Suppression"
                  description="Reduces background noise"
                  checked={audioSettings?.noise_suppression || false}
                  onChange={(checked) => {
                    const newSettings = { ...audioSettings, noise_suppression: checked };
                    saveAudioSettings(newSettings);
                  }}
                />
                
                <SettingsToggle
                  label="Echo Cancellation"
                  description="Prevents audio feedback"
                  checked={audioSettings?.echo_cancellation || false}
                  onChange={(checked) => {
                    const newSettings = { ...audioSettings, echo_cancellation: checked };
                    saveAudioSettings(newSettings);
                  }}
                />
                
                <SettingsToggle
                  label="Auto Gain Control"
                  description="Automatically adjusts input levels"
                  checked={audioSettings?.auto_gain_control || false}
                  onChange={(checked) => {
                    const newSettings = { ...audioSettings, auto_gain_control: checked };
                    saveAudioSettings(newSettings);
                  }}
                />
                
                <SettingsToggle
                  label="Push to Talk"
                  description="Hold a key to transmit audio"
                  checked={audioSettings?.push_to_talk || false}
                  onChange={(checked) => {
                    const newSettings = { ...audioSettings, push_to_talk: checked };
                    saveAudioSettings(newSettings);
                  }}
                />
              </div>
            </div>
            
            <div className="p-3 bg-white/5 border-t border-white/10">
              <button
                onClick={() => setShowSettings(false)}
                className="w-full py-2 rounded bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-colors border border-white/20"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </AudioErrorBoundary>
  );
}

// Discord-style settings toggle component
function SettingsToggle({ 
  label, 
  description, 
  checked, 
  onChange 
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="text-xs text-white/50">{description}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`w-10 h-6 rounded-full transition-colors relative ${
          checked ? 'bg-white/20 border border-white/30' : 'bg-white/5 border border-white/10'
        }`}
      >
        <div
          className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

// Discord-style participant card
function VoiceParticipantCard({ 
  participant, 
  onMuteToggle 
}: { 
  participant: VoiceParticipant; 
  onMuteToggle?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-2 rounded hover:bg-white/5 transition-colors group">
      {/* Avatar with speaking ring */}
      <div className="relative">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-200 ${
          participant.isSpeaking 
            ? 'bg-white/20 text-white ring-2 ring-white/30 ring-offset-2 ring-offset-[#0B0D10]' 
            : participant.audioEnabled
              ? 'bg-green-500/30 text-white'
              : 'bg-white/10 text-white/60'
        }`}>
          {participant.displayName[0]?.toUpperCase() || '?'}
        </div>
        
        {/* Mic status indicator */}
        <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0B0D10] flex items-center justify-center ${
          participant.audioEnabled && !participant.isMuted 
            ? 'bg-green-400' 
            : 'bg-red-400'
        }`}>
          {participant.audioEnabled && !participant.isMuted ? (
            <Mic className="w-1.5 h-1.5 text-white" />
          ) : (
            <MicOff className="w-1.5 h-1.5 text-white" />
          )}
        </div>
      </div>
      
      {/* Participant Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white text-sm truncate">
            {participant.displayName}
            {participant.isLocal && (
              <span className="text-white/50 font-normal"> (You)</span>
            )}
          </span>
          
          {participant.connectionState === 'connecting' && (
            <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">
              Connecting
            </span>
          )}
        </div>
        
        {/* Audio level bar */}
        {participant.audioEnabled && !participant.isMuted && (
          <div className="mt-1 w-full h-1 bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-white/40 transition-all duration-100"
              style={{ width: `${(participant.audioLevel || 0) * 100}%` }}
            />
          </div>
        )}
      </div>
      
      {/* Local Controls */}
      {participant.isLocal && onMuteToggle && (
        <button
          onClick={onMuteToggle}
          className={`p-1.5 rounded transition-colors opacity-0 group-hover:opacity-100 ${
            participant.isMuted
              ? 'bg-red-500/20 hover:bg-red-500/30 text-white border border-red-500/30'
              : 'bg-white/10 hover:bg-white/15 text-white/70 border border-white/20'
          }`}
          title={participant.isMuted ? 'Unmute' : 'Mute'}
        >
          {participant.isMuted ? (
            <MicOff className="w-3 h-3" />
          ) : (
            <Mic className="w-3 h-3" />
          )}
        </button>
      )}
    </div>
  );
}