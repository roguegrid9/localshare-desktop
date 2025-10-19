// MessagePill.tsx - Individual message notification pill
import { useEffect } from 'react';
import { X, Hash } from 'lucide-react';
import type { MessagePill as MessagePillType } from '../../stores/useUIStore';
import { useUIStore } from '../../stores/useUIStore';
import { cn } from '../../utils/cx';

interface MessagePillProps {
  pill: MessagePillType;
}

const AUTO_DISMISS_TIME = 5000; // 5 seconds

export default function MessagePill({ pill }: MessagePillProps) {
  const removeMessagePill = useUIStore((state) => state.removeMessagePill);
  const openBubble = useUIStore((state) => state.openBubble);

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      removeMessagePill(pill.id);
    }, AUTO_DISMISS_TIME);

    return () => clearTimeout(timer);
  }, [pill.id, removeMessagePill]);

  const handleClick = () => {
    // Open message bubble
    openBubble('message', {
      id: pill.id,
      channelId: pill.channelId,
      channelName: pill.channelName,
      username: pill.username,
      messagePreview: pill.messagePreview,
      expanded: false,
      docked: true,
    });
    // Remove the pill
    removeMessagePill(pill.id);
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeMessagePill(pill.id);
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        'group relative flex items-center gap-2 px-3 h-8 rounded-lg transition-all cursor-pointer',
        'bg-bg-surface border border-border hover:border-border-hover',
        'text-text-primary text-sm font-medium'
      )}
      data-no-drag
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {/* Channel icon */}
      <Hash className="h-3.5 w-3.5 text-text-secondary" />

      {/* Username */}
      <span className="max-w-[100px] truncate">{pill.username}</span>

      {/* Close button */}
      <button
        onClick={handleDismiss}
        className={cn(
          'ml-1 h-4 w-4 rounded flex items-center justify-center',
          'opacity-0 group-hover:opacity-100 transition-opacity',
          'hover:bg-bg-hover'
        )}
        aria-label="Dismiss"
      >
        <X className="h-3 w-3" />
      </button>

      {/* Progress bar for auto-dismiss */}
      <div
        className="absolute bottom-0 left-0 h-0.5 bg-accent-solid rounded-full"
        style={{
          animation: `shrink ${AUTO_DISMISS_TIME}ms linear`,
          width: '100%',
        }}
      />

      {/* CSS for progress bar animation */}
      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}
