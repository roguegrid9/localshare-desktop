// VoiceBubble.tsx - Voice bubble content (collapsed + expanded views)
import { useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Settings, PhoneOff } from 'lucide-react';
import { useUIStore, type ChatBubble } from '../../stores/useUIStore';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import { Badge } from '../ui/badge';
import { cn } from '../../utils/cx';

interface VoiceBubbleProps {
  bubble: ChatBubble;
  onVoiceAction: (id: string, action: 'mute' | 'deafen' | 'leave' | 'settings') => void;
}

export function VoiceBubble({ bubble, onVoiceAction }: VoiceBubbleProps) {
  // Get real participant data from voice state
  const voiceState = useUIStore((state) => state.voice);
  const updateBubble = useUIStore((state) => state.updateBubble);
  const participants = voiceState.activeChannelId === bubble.channelId ? voiceState.participants : [];

  // Sync participant count to bubble
  useEffect(() => {
    if (voiceState.activeChannelId === bubble.channelId && participants.length !== bubble.participantCount) {
      updateBubble(bubble.id, { participantCount: participants.length });
    }
  }, [voiceState.activeChannelId, bubble.channelId, participants.length, bubble.participantCount, bubble.id, updateBubble]);

  if (!bubble.expanded) {
    // Collapsed view - controls already in header
    return null;
  }

  // Expanded view - detailed voice interface
  return (
    <div className="flex h-[calc(100%-48px)] flex-col">
      {/* Voice controls */}
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <Button
          size="sm"
          variant={bubble.isMuted ? 'destructive' : 'secondary'}
          onClick={() => onVoiceAction(bubble.id, 'mute')}
          className="flex-1"
        >
          {bubble.isMuted ? (
            <>
              <MicOff className="h-4 w-4 mr-2" />
              Unmute
            </>
          ) : (
            <>
              <Mic className="h-4 w-4 mr-2" />
              Mute
            </>
          )}
        </Button>

        <Button
          size="sm"
          variant={bubble.isDeafened ? 'destructive' : 'secondary'}
          onClick={() => onVoiceAction(bubble.id, 'deafen')}
          className="flex-1"
        >
          {bubble.isDeafened ? (
            <>
              <VolumeX className="h-4 w-4 mr-2" />
              Undeafen
            </>
          ) : (
            <>
              <Volume2 className="h-4 w-4 mr-2" />
              Deafen
            </>
          )}
        </Button>
      </div>

      {/* Participant list */}
      <ScrollArea className="flex-1 px-3 py-2">
        <div className="space-y-2">
          <div className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
            Participants ({participants.length})
          </div>

          {/* Real participant list */}
          <div className="space-y-2">
            {participants.length === 0 ? (
              <div className="text-sm text-text-tertiary text-center py-4">
                No participants yet
              </div>
            ) : (
              participants.map((participant) => (
                <div
                  key={participant.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-bg-hover transition-colors"
                >
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-accent-gradient-start to-accent-gradient-end flex items-center justify-center text-xs font-medium text-white">
                    {participant.name[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary truncate">
                        {participant.name}
                      </span>
                      {participant.speaking && (
                        <Badge variant="default" className="text-xs">Speaking</Badge>
                      )}
                    </div>
                    {participant.muted && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <MicOff className="h-3 w-3 text-text-tertiary" />
                        <span className="text-xs text-text-tertiary">Muted</span>
                      </div>
                    )}
                  </div>
                  {participant.speaking && (
                    <div className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </ScrollArea>

      <Separator />

      {/* Bottom actions */}
      <div className="flex items-center gap-2 p-3">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onVoiceAction(bubble.id, 'settings')}
          className="flex-1"
        >
          <Settings className="h-4 w-4 mr-2" />
          Settings
        </Button>

        <Button
          size="sm"
          variant="destructive"
          onClick={() => onVoiceAction(bubble.id, 'leave')}
          className="flex-1"
        >
          <PhoneOff className="h-4 w-4 mr-2" />
          Leave
        </Button>
      </div>
    </div>
  );
}
