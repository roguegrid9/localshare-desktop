import { useState, useEffect, useCallback } from 'react';
import { Mic, MicOff, Volume2, Users, Minimize2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useChannels } from '../../hooks/useChannels';
import { useP2P } from '../../context/P2PProvider';
import { useMediaStreams } from '../../hooks/useMediaStreams';
import { useRustAudioStream } from '../../hooks/useRustAudioStream';
import { useVoiceWebRTC } from '../../hooks/useVoiceWebRTC';
import { useUIStore } from '../../stores/useUIStore';
import VoiceToolbar from '../voice/VoiceToolbar';
import { AudioErrorBoundary } from '../media/AudioErrorBoundary';
import { Spinner } from '../ui/spinner';

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
  const { setVoiceChannel, setInCall } = useUIStore();

  // Get channel info
  const channel = getChannelById(channelId);

  // Hybrid approach: Get MediaStream from Rust audio chunks
  const { audioStream: rustAudioStream, isActive: rustAudioActive } = useRustAudioStream(sessionId);

  // Browser WebRTC for voice channels (uses rustAudioStream)
  const { peerConnections, connectToParticipant } = useVoiceWebRTC({
    channelId,
    gridId,
    localAudioStream: rustAudioStream
  });

  // Join voice channel
  const handleJoinChannel = useCallback(async () => {
    if (isConnecting || isConnected) return;

    setIsConnecting(true);

    try {
      console.log('Joining voice channel:', channelId, 'in grid:', gridId);

      // Call the backend to join the voice channel (creates media session + registers with backend)
      const joinResponse = await invoke<{
        session_id: string;
        participants: Array<{
          user_id: string;
          display_name?: string;
          username?: string;
          peer_connection_id?: string;
          is_muted: boolean;
          is_deafened: boolean;
        }>;
        routing_info: {
          session_type: string;
          required_connections?: string[];
          max_participants: number;
        };
      }>("join_voice_channel", {
        channelId: channelId,
        gridId: gridId,
        audioQuality: "medium",
        startMuted: false,
        startDeafened: false
      });

      console.log('Voice channel join response:', joinResponse);

      // Set session ID from response
      setSessionId(joinResponse.session_id);

      // Small delay to ensure the session is fully initialized
      await new Promise(resolve => setTimeout(resolve, 200));

      // Start Rust audio capture
      await startAudio();
      console.log('Rust audio capture started');

      // Connect to other participants via browser WebRTC
      if (joinResponse.participants.length > 0) {
        console.log(`Connecting to ${joinResponse.participants.length} participants via WebRTC`);

        // Give a moment for rustAudioStream to initialize
        await new Promise(resolve => setTimeout(resolve, 500));

        // Connect to each participant
        for (const participant of joinResponse.participants) {
          console.log(`Initiating WebRTC connection to ${participant.user_id}`);
          await connectToParticipant(
            participant.user_id,
            participant.display_name || participant.username || 'Unknown'
          );
        }
      }

      setIsConnected(true);

      // Update UI store for compact voice bar
      setVoiceChannel(channelId);
      setInCall(true);

      console.log('Voice channel joined successfully - hybrid audio active');
    } catch (error) {
      console.error('Failed to join voice channel:', error);
      // Reset session ID if join failed
      setSessionId(null);
    } finally {
      setIsConnecting(false);
    }
  }, [channelId, gridId, isConnecting, isConnected, startAudio, connectToParticipant, setVoiceChannel, setInCall]);

  // Leave voice channel
  const handleLeaveChannel = useCallback(async () => {
    if (!isConnected) return;

    try {
      console.log('Leaving voice channel:', channelId);

      // Stop Rust audio capture
      stopAudio();

      // Call backend to leave the voice channel
      await invoke("leave_voice_channel", {
        channelId: channelId,
        gridId: gridId
      });

      setIsConnected(false);
      setSessionId(null);

      // Update UI store to hide compact voice bar
      setVoiceChannel(undefined);
      setInCall(false);

      console.log('Successfully left voice channel');
    } catch (error) {
      console.error('Failed to leave voice channel:', error);
    }
  }, [isConnected, channelId, gridId, stopAudio, setVoiceChannel, setInCall]);

  // Handle mute toggle
  const handleMuteToggle = useCallback(async () => {
    toggleAudioMute();
  }, [toggleAudioMute]);

  // Handle volume change
  const handleVolumeChange = useCallback(async (volume: number) => {
    const newSettings = { ...audioSettings, input_volume: volume };
    await saveAudioSettings(newSettings);
  }, [audioSettings, saveAudioSettings]);

  // Build participants list
  useEffect(() => {
    // Debug log for speaking state
    if (mediaState.audio.speaking) {
      console.log('[VoiceChannel] Local user speaking:', {
        audioLevel: mediaState.audio.level,
        speaking: mediaState.audio.speaking,
        audioEnabled: mediaState.audio.enabled,
        muted: mediaState.audio.muted
      });
    }

    const localParticipant: VoiceParticipant = {
      userId: 'local',
      displayName: 'You',
      isLocal: true,
      audioEnabled: mediaState.audio.enabled,
      isMuted: mediaState.audio.muted,
      isSpeaking: mediaState.audio.speaking,
      audioLevel: mediaState.audio.level,
      connectionState: rustAudioActive ? 'connected' : 'connecting'
    };

    // Create participant list from WebRTC peer connections
    const remoteParticipantList: VoiceParticipant[] = peerConnections.map(peer => ({
      userId: peer.userId,
      displayName: peer.username || `User ${peer.userId.slice(0, 8)}`,
      isLocal: false,
      audioEnabled: true, // Assume enabled if connected
      isMuted: false,
      isSpeaking: false, // TODO: Implement speaking detection for remote participants
      audioLevel: 0,
      connectionState: peer.connection.connectionState === 'connected' ? 'connected' :
                       peer.connection.connectionState === 'failed' ? 'disconnected' : 'connecting'
    }));

    setParticipants([localParticipant, ...remoteParticipantList]);
  }, [mediaState.audio.enabled, mediaState.audio.muted, mediaState.audio.speaking, mediaState.audio.level, peerConnections, rustAudioActive]);

  // Auto-join voice channel when window opens
  useEffect(() => {
    if (channel?.channel_type === 'voice' && !isConnected && !isConnecting) {
      handleJoinChannel();
    }
  }, [channel?.channel_type]); // Only depend on channel type to avoid re-joining

  if (!channel) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#050507]">
        <div className="text-[#A4ACB9]">Voice channel not found</div>
      </div>
    );
  }

  return (
    <AudioErrorBoundary>
      <div className={`w-full h-full bg-[#050507] flex flex-col ${className}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#0B0C10] border-b border-[#1C1E26]">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-[#0B0C10] border border-[#1C1E26] rounded-[10px] flex items-center justify-center">
              <Volume2 className="w-4 h-4 text-[#A4ACB9]" />
            </div>
            <div>
              <h2 className="font-semibold text-[#E9ECF3] text-sm">{channel.name}</h2>
              <div className="text-xs text-[#A4ACB9] flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-[#10B981]' :
                  isConnecting ? 'bg-[#F59E0B]' : 'bg-[#DC2626]'
                }`} />
                {participants.length} participant{participants.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {onMinimize && (
              <button
                onClick={onMinimize}
                className="p-2 rounded-[10px] hover:bg-[#050507] text-[#A4ACB9] hover:text-[#E9ECF3] transition-colors"
                title="Minimize"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Participants List */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-2">
            {isConnecting && (
              <div className="text-center py-12 text-[#A4ACB9]">
                <Spinner className="w-16 h-16 mx-auto mb-4 text-[#3AAFFF]" />
                <p className="text-sm font-medium">Connecting to voice channel...</p>
              </div>
            )}

            {!isConnecting && participants.map((participant) => (
              <VoiceParticipantCard
                key={participant.userId}
                participant={participant}
                onMuteToggle={participant.isLocal ? handleMuteToggle : undefined}
              />
            ))}

            {participants.length === 1 && isConnected && !isConnecting && (
              <div className="text-center py-12 text-[#A4ACB9]">
                <Users className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="text-sm font-medium mb-1">No one else is here</p>
                <p className="text-xs opacity-75">Invite others to start talking!</p>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Toolbar - Always visible */}
        <VoiceToolbar
          onSettingsClick={() => setShowSettings(!showSettings)}
          overrideAudioLevel={mediaState.audio.level}
          overrideSpeaking={mediaState.audio.speaking}
          overrideMuted={mediaState.audio.muted}
        />

        {/* Settings Panel */}
        {showSettings && (
          <div className="absolute top-12 right-4 w-80 bg-[#0B0C10] border border-[#1C1E26] rounded-[10px] shadow-2xl overflow-hidden z-50">
            <div className="bg-[#050507] px-4 py-3 border-b border-[#1C1E26]">
              <h3 className="font-semibold text-[#E9ECF3]">Voice Settings</h3>
            </div>

            <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
              {/* Input Volume */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-[#A4ACB9] uppercase tracking-wide">
                    Input Volume
                  </label>
                  <span className="text-xs text-[#A4ACB9]">
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
                  className="w-full h-2 bg-[#1C1E26] rounded-[10px] appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#3AAFFF] [&::-webkit-slider-thumb]:cursor-pointer
                    [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full
                    [&::-moz-range-thumb]:bg-[#3AAFFF] [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-none"
                />
              </div>

              {/* Voice Activity */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-[#A4ACB9] uppercase tracking-wide">
                    Voice Activity Threshold
                  </label>
                  <span className="text-xs text-[#A4ACB9]">
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
                  className="w-full h-2 bg-[#1C1E26] rounded-[10px] appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#3AAFFF] [&::-webkit-slider-thumb]:cursor-pointer"
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

            <div className="p-3 bg-[#050507] border-t border-[#1C1E26]">
              <button
                onClick={() => setShowSettings(false)}
                className="w-full py-2 rounded-[10px] bg-[#0B0C10] hover:bg-[#1C1E26] text-[#E9ECF3] text-sm font-medium transition-colors border border-[#1C1E26]"
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

// Settings toggle component
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
        <div className="text-sm font-medium text-[#E9ECF3]">{label}</div>
        <div className="text-xs text-[#A4ACB9]">{description}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`w-10 h-6 rounded-full transition-colors relative ${
          checked ? 'bg-[#3AAFFF]/20 border border-[#3AAFFF]/40' : 'bg-[#1C1E26] border border-[#1C1E26]'
        }`}
      >
        <div
          className={`w-4 h-4 rounded-full absolute top-1 transition-transform ${
            checked ? 'bg-[#3AAFFF] translate-x-5' : 'bg-[#A4ACB9] translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

// Voice participant card component
function VoiceParticipantCard({
  participant,
  onMuteToggle
}: {
  participant: VoiceParticipant;
  onMuteToggle?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-[10px] hover:bg-[#0B0C10] transition-colors group">
      {/* Avatar with speaking ring */}
      <div className="relative">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-200 ${
          participant.isSpeaking
            ? 'bg-[#3AAFFF]/30 text-[#E9ECF3] ring-2 ring-[#3AAFFF]/40 ring-offset-2 ring-offset-[#050507]'
            : participant.audioEnabled
              ? 'bg-[#10B981]/30 text-[#E9ECF3]'
              : 'bg-[#1C1E26] text-[#A4ACB9]'
        }`}>
          {participant.displayName[0]?.toUpperCase() || '?'}
        </div>

        {/* Mic status indicator */}
        <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#050507] flex items-center justify-center ${
          participant.audioEnabled && !participant.isMuted
            ? 'bg-[#10B981]'
            : 'bg-[#DC2626]'
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
          <span className="font-medium text-[#E9ECF3] text-sm truncate">
            {participant.displayName}
            {participant.isLocal && (
              <span className="text-[#A4ACB9] font-normal"> (You)</span>
            )}
          </span>

          {participant.connectionState === 'connecting' && (
            <span className="text-xs text-[#F59E0B] bg-[#F59E0B]/10 px-2 py-0.5 rounded-full">
              Connecting
            </span>
          )}
        </div>

        {/* Audio level bar */}
        {participant.audioEnabled && !participant.isMuted && (
          <div className="mt-1 w-full h-1 bg-[#1C1E26] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#3AAFFF] transition-all duration-100"
              style={{ width: `${(participant.audioLevel || 0) * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* Local Controls */}
      {participant.isLocal && onMuteToggle && (
        <button
          onClick={onMuteToggle}
          className={`p-1.5 rounded-[10px] transition-colors opacity-0 group-hover:opacity-100 ${
            participant.isMuted
              ? 'bg-[#DC2626]/20 hover:bg-[#DC2626]/30 text-[#E9ECF3] border border-[#DC2626]/30'
              : 'bg-[#0B0C10] hover:bg-[#1C1E26] text-[#A4ACB9] border border-[#1C1E26]'
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