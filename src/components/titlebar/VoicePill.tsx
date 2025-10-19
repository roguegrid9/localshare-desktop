// VoicePill.tsx - Individual voice channel pill with controls
import { useState, useEffect, useRef } from 'react';
import { X, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import type { VoicePill as VoicePillType } from '../../stores/useUIStore';
import { useUIStore } from '../../stores/useUIStore';
import { cn } from '../../utils/cx';

interface VoicePillProps {
  pill: VoicePillType;
  isSelected: boolean;
}

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const WARNING_TIME = 30 * 1000; // 30 seconds before timeout

export default function VoicePill({ pill, isSelected }: VoicePillProps) {
  const removeVoicePill = useUIStore((state) => state.removeVoicePill);
  const updateVoicePill = useUIStore((state) => state.updateVoicePill);
  const selectVoicePill = useUIStore((state) => state.selectVoicePill);
  const openBubble = useUIStore((state) => state.openBubble);
  const voiceState = useUIStore((state) => state.voice);

  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const lastClickTime = useRef(0);

  // Sync participant count from voice state
  useEffect(() => {
    if (voiceState.activeChannelId === pill.channelId) {
      const realCount = voiceState.participants.length;
      if (realCount !== pill.participantCount) {
        updateVoicePill(pill.id, { participantCount: realCount });
      }
    }
  }, [voiceState.activeChannelId, voiceState.participants.length, pill.channelId, pill.id, pill.participantCount, updateVoicePill]);

  // Inactivity timer - only if not selected
  useEffect(() => {
    if (isSelected) {
      setShowWarning(false);
      return;
    }

    const timeSinceActivity = Date.now() - pill.lastActivity.getTime();
    const timeUntilWarning = INACTIVITY_TIMEOUT - WARNING_TIME - timeSinceActivity;

    if (timeUntilWarning <= 0) {
      // Already past warning time
      setShowWarning(true);

      const timeUntilRemoval = INACTIVITY_TIMEOUT - timeSinceActivity;

      if (timeUntilRemoval <= 0) {
        removeVoicePill(pill.id);
        return;
      }

      // Start countdown
      const countdownInterval = setInterval(() => {
        const remaining = Math.ceil((INACTIVITY_TIMEOUT - (Date.now() - pill.lastActivity.getTime())) / 1000);
        setCountdown(remaining);

        if (remaining <= 0) {
          removeVoicePill(pill.id);
        }
      }, 1000);

      return () => clearInterval(countdownInterval);
    } else {
      // Set timer for warning
      const warningTimer = setTimeout(() => {
        setShowWarning(true);
      }, timeUntilWarning);

      return () => clearTimeout(warningTimer);
    }
  }, [pill.id, pill.lastActivity, isSelected, removeVoicePill]);

  const handleClick = () => {
    const now = Date.now();
    const timeSinceLastClick = now - lastClickTime.current;

    if (timeSinceLastClick < 300) {
      // Double click - open voice bubble (expanded)
      openBubble('voice', {
        id: pill.id,
        channelId: pill.channelId,
        channelName: pill.channelName,
        isMuted: pill.isMuted,
        isDeafened: pill.isDeafened,
        participantCount: pill.participantCount,
        expanded: true,
        docked: true,
      });
    } else {
      // Single click - select this pill
      selectVoicePill(pill.id);
    }

    lastClickTime.current = now;
  };

  const handleToggleMic = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateVoicePill(pill.id, { isMuted: !pill.isMuted });
  };

  const handleToggleAudio = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateVoicePill(pill.id, { isDeafened: !pill.isDeafened });
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeVoicePill(pill.id);
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        'group relative flex items-center gap-2 px-3 h-8 rounded-lg transition-all cursor-pointer',
        'bg-bg-surface border text-text-primary text-sm font-medium',
        isSelected
          ? 'ring-2 ring-green-500/70 border-green-500/50'
          : 'border-border hover:border-border-hover',
        showWarning && !isSelected && 'border-yellow-500/50 ring-1 ring-yellow-500/30'
      )}
      data-no-drag
      role="button"
      tabIndex={0}
      title={isSelected ? 'Active voice channel (double-click for controls)' : 'Click to select, double-click for controls'}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {/* Channel name */}
      <span className="max-w-[100px] truncate">{pill.channelName}</span>

      {/* Mic toggle */}
      <button
        onClick={handleToggleMic}
        className={cn(
          'h-5 w-5 rounded flex items-center justify-center transition-colors',
          pill.isMuted
            ? 'text-red-400 hover:bg-red-500/10'
            : 'text-green-400 hover:bg-green-500/10'
        )}
        aria-label={pill.isMuted ? 'Unmute' : 'Mute'}
        title={pill.isMuted ? 'Unmute' : 'Mute'}
      >
        {pill.isMuted ? (
          <MicOff className="h-3.5 w-3.5" />
        ) : (
          <Mic className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Audio toggle */}
      <button
        onClick={handleToggleAudio}
        className={cn(
          'h-5 w-5 rounded flex items-center justify-center transition-colors',
          pill.isDeafened
            ? 'text-red-400 hover:bg-red-500/10'
            : 'text-text-secondary hover:bg-bg-hover'
        )}
        aria-label={pill.isDeafened ? 'Undeafen' : 'Deafen'}
        title={pill.isDeafened ? 'Undeafen' : 'Deafen'}
      >
        {pill.isDeafened ? (
          <VolumeX className="h-3.5 w-3.5" />
        ) : (
          <Volume2 className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Close/Leave button */}
      <button
        onClick={handleRemove}
        className={cn(
          'h-4 w-4 rounded flex items-center justify-center',
          'opacity-0 group-hover:opacity-100 transition-opacity',
          'hover:bg-bg-hover'
        )}
        aria-label="Leave voice channel"
      >
        <X className="h-3 w-3" />
      </button>

      {/* Warning countdown indicator */}
      {showWarning && !isSelected && (
        <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-yellow-500 text-black text-[9px] font-bold flex items-center justify-center animate-pulse">
          {countdown}
        </div>
      )}
    </div>
  );
}
