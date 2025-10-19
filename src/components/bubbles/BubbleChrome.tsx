// BubbleChrome.tsx - Individual bubble wrapper with drag and collapse/expand
import { ChevronDown, ChevronUp, X, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import type { ChatBubble } from '../../stores/useUIStore';
import { useUIStore } from '../../stores/useUIStore';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { Card } from '../ui/card';
import { cn } from '../../utils/cx';
import { useDraggable } from './useDraggable';
import { MessageBubble } from './MessageBubble';
import { VoiceBubble } from './VoiceBubble';

const COLLAPSED = { w: 300, h: 60 };
const EXPANDED = { w: 360, h: 480 };

interface BubbleChromeProps {
  bubble: ChatBubble;
  mode: 'docked' | 'free';
  onSend: (id: string, text: string) => void;
  onVoiceAction: (id: string, action: 'mute' | 'deafen' | 'leave' | 'settings') => void;
}

export function BubbleChrome({ bubble, mode, onSend, onVoiceAction }: BubbleChromeProps) {
  const {
    closeBubble,
    toggleBubbleExpand,
    focusBubble,
    dockBubble,
    undockBubble,
    updateBubble,
  } = useUIStore();

  const size = bubble.expanded ? EXPANDED : COLLAPSED;

  const { ref, isDragging } = useDraggable({
    enabled: mode === 'free',
    position: bubble.position || { x: 0, y: 0 },
    onDragEnd: (x, y, shouldDock) => {
      if (shouldDock) {
        dockBubble(bubble.id);
      } else {
        undockBubble(bubble.id, { x, y });
      }
    },
  });

  const handleFocus = () => {
    focusBubble(bubble.id);
  };

  const handleToggleExpand = () => {
    toggleBubbleExpand(bubble.id);
  };

  const handleClose = () => {
    closeBubble(bubble.id);
  };

  const handleQuickAction = (action: 'mute' | 'deafen') => {
    if (bubble.type === 'voice') {
      const updates: Partial<ChatBubble> = {};
      if (action === 'mute') updates.isMuted = !bubble.isMuted;
      if (action === 'deafen') updates.isDeafened = !bubble.isDeafened;
      updateBubble(bubble.id, updates);
    }
  };

  // Initials for avatar
  const initials = bubble.username
    ? bubble.username.slice(0, 2).toUpperCase()
    : bubble.channelName.slice(0, 2).toUpperCase();

  return (
    <div
      ref={ref}
      role={bubble.expanded ? 'dialog' : 'group'}
      aria-label={`${bubble.type} bubble: ${bubble.channelName}`}
      tabIndex={0}
      onFocus={handleFocus}
      style={{
        width: size.w,
        height: size.h,
        zIndex: bubble.zIndex,
        position: mode === 'free' ? 'fixed' : 'relative',
        left: mode === 'free' ? bubble.position?.x : undefined,
        top: mode === 'free' ? bubble.position?.y : undefined,
        willChange: 'transform',
      }}
      className={cn(
        'pointer-events-auto select-none transition-all duration-200',
        isDragging && 'cursor-grabbing',
        bubble.expanded ? 'shadow-xl' : 'shadow-md'
      )}
    >
      <Card className="h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-surface',
            mode === 'free' && 'cursor-grab active:cursor-grabbing'
          )}
          data-drag-handle
        >
          {/* Avatar */}
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-accent-gradient-start text-white text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>

          {/* Title and badges */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="truncate text-sm font-medium text-text-primary">
                {bubble.type === 'message' ? bubble.username : bubble.channelName}
              </div>
              {bubble.unread && bubble.unread > 0 ? (
                <Badge variant="destructive" className="text-xs">{bubble.unread}</Badge>
              ) : null}
              {bubble.type === 'voice' && bubble.speaking ? (
                <div className="flex items-center gap-1.5">
                  <div className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </div>
                  <Badge variant="secondary" className="text-xs">Speaking</Badge>
                </div>
              ) : null}
            </div>
            {!bubble.expanded && bubble.type === 'message' && bubble.messagePreview ? (
              <div className="truncate text-xs text-text-tertiary">
                {bubble.messagePreview}
              </div>
            ) : null}
            {!bubble.expanded && bubble.type === 'voice' && bubble.participantCount ? (
              <div className="text-xs text-text-tertiary">
                {bubble.participantCount} {bubble.participantCount === 1 ? 'participant' : 'participants'}
              </div>
            ) : null}
          </div>

          {/* Quick controls for voice (collapsed only) */}
          {!bubble.expanded && bubble.type === 'voice' && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleQuickAction('mute');
                    }}
                  >
                    {bubble.isMuted ? (
                      <MicOff className="h-3.5 w-3.5 text-red-400" />
                    ) : (
                      <Mic className="h-3.5 w-3.5 text-green-400" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{bubble.isMuted ? 'Unmute' : 'Mute'}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleQuickAction('deafen');
                    }}
                  >
                    {bubble.isDeafened ? (
                      <VolumeX className="h-3.5 w-3.5 text-red-400" />
                    ) : (
                      <Volume2 className="h-3.5 w-3.5 text-text-secondary" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{bubble.isDeafened ? 'Undeafen' : 'Deafen'}</TooltipContent>
              </Tooltip>
            </>
          )}

          {/* Expand/Collapse button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={handleToggleExpand}
              >
                {bubble.expanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{bubble.expanded ? 'Collapse' : 'Expand'}</TooltipContent>
          </Tooltip>

          {/* Close button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={handleClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close</TooltipContent>
          </Tooltip>
        </div>

        {/* Content */}
        {bubble.type === 'message' ? (
          <MessageBubble bubble={bubble} onSend={onSend} />
        ) : (
          <VoiceBubble bubble={bubble} onVoiceAction={onVoiceAction} />
        )}
      </Card>
    </div>
  );
}
