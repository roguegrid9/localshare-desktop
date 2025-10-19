// VoiceChannelView.tsx - Updated ChannelView for voice channels
import { useState, useCallback } from 'react';
import { Volume2, Users, Mic, Settings, ExternalLink } from 'lucide-react';
import { useChannels } from '../../hooks/useChannels';
import { useWindowManager } from '../../hooks/useWindowManager';
import { useP2P } from '../../context/P2PProvider';
import { useUIStore } from '../../stores/useUIStore';
import type { ChannelInfo } from '../../types/messaging';

interface VoiceChannelViewProps {
  gridId: string;
  channelId: string;
}

export function VoiceChannelView({ gridId, channelId }: VoiceChannelViewProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [, setIsConnected] = useState(false);
  
  const { getChannelById, channels } = useChannels(gridId);
  const { createVoiceChannelTab } = useWindowManager();
  const { activeCalls, initializeMediaSession } = useP2P();
  const { setVoiceChannel, setInCall } = useUIStore();
  
  const channel = getChannelById(channelId);
  
  console.log('VoiceChannelView Debug:', {
    gridId,
    channelId,
    channel,
    allChannelsCount: channels.length,
    allChannels: channels.map(c => ({ id: c.id, name: c.name, type: c.channel_type }))
  });

  // Check if we're already in this voice channel
  const isInVoiceChannel = sessionId && activeCalls[sessionId];
  
  // Quick join voice channel (without opening window)
  const handleQuickJoin = useCallback(async () => {
    if (!channel) return;

    try {
      const voiceSessionId = `voice_${channelId}`;
      setSessionId(voiceSessionId);

      await initializeMediaSession(voiceSessionId);
      setIsConnected(true);

      // Update UI store for compact voice bar
      setVoiceChannel(channelId);
      setInCall(true);
    } catch (error) {
      console.error('Failed to join voice channel:', error);
    }
  }, [channel, channelId, initializeMediaSession, setVoiceChannel, setInCall]);
  
  // Open voice channel in dedicated tab
  const handleOpenVoiceWindow = useCallback(async () => {
    if (!channel) return;
    
    try {
      await createVoiceChannelTab(
        channelId,
        gridId,
        channel.name
      );
    } catch (error) {
      console.error('Failed to open voice channel tab:', error);
    }
  }, [channel, channelId, gridId, createVoiceChannelTab]);

  if (!channel) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0B0D10] text-white/60">
        Voice channel not found
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0B0D10]">
      {/* Voice Channel Header */}
      <div className="p-6 text-center border-b border-white/10 bg-[#0E1116]">
        <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center mx-auto mb-4">
          <Volume2 className="w-8 h-8 text-white/70" />
        </div>
        
        <h1 className="text-xl font-semibold text-white mb-2">{channel.name}</h1>
        <p className="text-white/60 text-sm mb-4">
          Voice channel • {channel.member_count} member{channel.member_count !== 1 ? 's' : ''}
        </p>
        
        {channel.description && (
          <p className="text-sm text-white/50 max-w-md mx-auto">
            {channel.description}
          </p>
        )}
      </div>
      
      {/* Voice Channel Actions */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-md space-y-6">
          
          {/* Connection Status */}
          <div className="text-center mb-8">
            {isInVoiceChannel ? (
              <div className="flex items-center justify-center gap-2 text-green-400">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-sm font-medium">Connected to voice</span>
              </div>
            ) : (
              <div className="text-white/40">
                <Mic className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Not connected to voice</p>
              </div>
            )}
          </div>

          {/* Primary Actions */}
          <div className="space-y-3">
            <button
              onClick={handleOpenVoiceWindow}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white/10 hover:bg-white/15 text-white font-medium border border-white/20 rounded-lg transition-all duration-200"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open Voice Channel</span>
            </button>
            
            {!isInVoiceChannel && (
              <button
                onClick={handleQuickJoin}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 rounded-lg transition-all duration-200"
              >
                <Mic className="w-4 h-4" />
                <span>Quick Join Voice</span>
              </button>
            )}
            
            <button
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 rounded-lg transition-all duration-200"
            >
              <Settings className="w-4 h-4" />
              <span>Voice Settings</span>
            </button>
          </div>

          {/* Current Participants Preview */}
          <div className="mt-6 p-4 bg-white/5 border border-white/10 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-white/60" />
              <span className="text-sm font-medium text-white/70">
                {channel.member_count} in channel
              </span>
            </div>
            
            {/* Placeholder for participant avatars */}
            <div className="flex -space-x-2">
              {[...Array(Math.min(channel.member_count, 5))].map((_, i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full bg-white/10 border-2 border-[#0B0D10] flex items-center justify-center text-xs font-medium text-white/70"
                >
                  {String.fromCharCode(65 + i)}
                </div>
              ))}
              {channel.member_count > 5 && (
                <div className="w-8 h-8 rounded-full bg-white/10 border-2 border-[#0B0D10] flex items-center justify-center text-xs text-white/60">
                  +{channel.member_count - 5}
                </div>
              )}
            </div>
          </div>

          {/* Voice Channel Features */}
          <div className="mt-6 p-4 bg-white/5 border border-white/10 rounded-lg">
            <h3 className="text-sm font-medium text-white/70 mb-3">Features</h3>
            <div className="space-y-2 text-sm text-white/50">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-white/40 rounded-full" />
                <span>High-quality voice chat</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-white/40 rounded-full" />
                <span>Noise suppression & echo cancellation</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-white/40 rounded-full" />
                <span>Push-to-talk & voice activation</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-white/40 rounded-full" />
                <span>Individual volume controls</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Window Manager Hook Extension (add to useWindowManager.ts)
export const useWindowManagerVoiceExtension = () => {
  // This would be added to your existing useWindowManager hook
  const createVoiceChannelWindow = async (
    channelId: string,
    channelName: string,
    gridId: string,
  ) => {
    // Use your existing window creation logic
    const windowData = {
      id: `voice_${channelId}`,
      type: 'voice_channel' as const,
      title: channelName,
      data: {
        channelId,
        gridId,
        channelName
      }
    };
    
    // This would call your existing window creation command
    // return await commands.createDetachableWindow(parentWindowId, windowData);
    console.log('Window data:', windowData);
  };
  
  return { createVoiceChannelWindow };
};

// ContentPanel Integration (add to your existing ContentPanel.tsx)
export const VoiceChannelListItem = ({ 
  channel, 
  onChannelSelect,
  onOpenVoiceWindow 
}: {
  channel: ChannelInfo;
  onChannelSelect: (channelId: string) => void;
  onOpenVoiceWindow: (channelId: string) => void;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <div 
      className="group flex items-center justify-between"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        onClick={() => onChannelSelect(channel.id)}
        className="flex items-center gap-2 flex-1 px-2 py-1 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors"
      >
        <Volume2 className="w-4 h-4 text-green-400" />
        <span className="truncate">{channel.name}</span>
        {channel.member_count > 0 && (
          <span className="text-xs text-white/40">
            {channel.member_count}
          </span>
        )}
      </button>
      
      {/* Quick join button on hover */}
      {isHovered && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenVoiceWindow(channel.id);
          }}
          className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
          title="Open voice window"
        >
          <ExternalLink className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};

export default VoiceChannelView;
