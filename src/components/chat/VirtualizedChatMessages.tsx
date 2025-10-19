// VirtualizedChatMessages - High-performance message list with react-virtuoso
// Handles 1000s of messages efficiently with day dividers and message headers

import { useRef, useMemo, useState } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { Hash, ChevronDown, X } from 'lucide-react';
import { cx } from '../../utils/cx';

// Types
export interface Message {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  username?: string;
  is_deleted?: boolean;
  reactions?: Record<string, string[]>; // emoji -> array of user IDs
}

interface VirtualizedChatMessagesProps {
  messages: Message[];
  loading?: boolean;
  currentUserId?: string;
  onReactionAdd: (messageId: string, emoji: string) => void;
  onReactionRemove: (messageId: string, emoji: string) => void;
  getReactionCounts: (messageId: string) => Record<string, number>;
  className?: string;
}

// Virtuoso item types
type ListItem =
  | { type: 'day-divider'; id: string; label: string }
  | { type: 'message'; id: string; message: Message; showHeader: boolean };

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '🔥', '🙏', '😅'];

/** Day divider component */
function DayDivider({ label }: { label: string }) {
  return (
    <div className="relative my-5 flex items-center justify-center">
      <div className="h-px w-full bg-border" />
      <span className="absolute px-3 py-1 text-xs rounded-full bg-bg-surface border border-border text-text-secondary shadow-sm">
        {label}
      </span>
    </div>
  );
}

/** Reaction picker popover */
function ReactionTray({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={boxRef}
      className="z-20 rounded-xl border border-border bg-bg-surface shadow-xl px-2 py-1.5 flex flex-wrap gap-1.5"
      role="dialog"
      aria-label="Add reaction"
    >
      {QUICK_EMOJIS.map((e) => (
        <button
          key={e}
          onClick={() => onPick(e)}
          className="text-base leading-none px-2 py-1 rounded-md hover:bg-bg-hover"
        >
          {e}
        </button>
      ))}
      <button
        onClick={onClose}
        className="ml-1 inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-border hover:bg-bg-hover"
        aria-label="Close"
      >
        <X className="h-3.5 w-3.5" />
        Close
      </button>
    </div>
  );
}

/** Message row component */
function MessageRow({
  message,
  showHeader,
  reactionCounts,
  onReactionAdd,
  onReactionRemove,
  onOpenReactionTray,
  isReactionTrayOpen,
}: {
  message: Message;
  showHeader: boolean;
  reactionCounts: Record<string, number>;
  onReactionAdd: (messageId: string, emoji: string) => void;
  onReactionRemove: (messageId: string, emoji: string) => void;
  onOpenReactionTray: (messageId: string) => void;
  isReactionTrayOpen: boolean;
}) {
  const hasReactions = Object.keys(reactionCounts).length > 0;
  const when = new Date(message.created_at).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  const name = message.username || message.user_id;

  return (
    <div className="group/message grid grid-cols-[40px_1fr] gap-3 px-4 sm:px-6">
      {/* Avatar */}
      <div className="pt-0.5">
        {showHeader ? (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent-gradient-start to-accent-gradient-end text-white grid place-items-center text-sm font-medium">
            {name[0]?.toUpperCase?.() || '?'}
          </div>
        ) : (
          <div className="w-10" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0">
        {/* Header (username + timestamp) */}
        {showHeader && (
          <div className="flex items-baseline gap-2 leading-none">
            <span className="font-medium text-text-primary text-[13px]">{name}</span>
            <time className="text-[11px] text-text-tertiary tabular-nums">{when}</time>
          </div>
        )}

        {/* Message text */}
        <div className={showHeader ? 'mt-1' : 'mt-0.5'}>
          {message.is_deleted ? (
            <div className="text-text-tertiary text-sm italic select-none">
              This message was deleted
            </div>
          ) : (
            <div className="text-[14px] leading-6 text-text-primary whitespace-pre-wrap break-words">
              {message.content}
            </div>
          )}
        </div>

        {/* Reactions */}
        {hasReactions && (
          <div className="mt-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar pr-2">
            {Object.entries(reactionCounts).map(([emoji, count]) => (
              <button
                key={emoji}
                onClick={() => onReactionRemove(message.id, emoji)}
                className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border bg-bg-muted hover:bg-bg-hover hover:border-border-hover px-2 py-[3px] text-xs"
                title={`${emoji} ${count}`}
                aria-label={`${emoji} ${count}`}
              >
                <span>{emoji}</span>
                <span className="text-text-secondary">{count}</span>
              </button>
            ))}

            {/* Add reaction button */}
            {!message.is_deleted && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenReactionTray(message.id);
                }}
                className="opacity-0 group-hover/message:opacity-100 transition-opacity shrink-0 inline-flex items-center gap-1 rounded-md border border-border bg-bg-surface/90 px-2 py-[3px] text-[11px] text-text-secondary hover:text-text-primary hover:border-border-hover"
                aria-label="Add reaction"
              >
                +
              </button>
            )}
          </div>
        )}

        {/* Reaction picker */}
        {isReactionTrayOpen && (
          <div className="relative h-0">
            <div className="absolute mt-2">
              <ReactionTray
                onPick={(emoji) => {
                  onReactionAdd(message.id, emoji);
                  onOpenReactionTray(''); // Close
                }}
                onClose={() => onOpenReactionTray('')}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function VirtualizedChatMessages({
  messages,
  loading = false,
  currentUserId,
  onReactionAdd,
  onReactionRemove,
  getReactionCounts,
  className = '',
}: VirtualizedChatMessagesProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [openReactionFor, setOpenReactionFor] = useState<string>('');

  // Flatten messages into virtuoso items (day dividers + messages)
  const items = useMemo<ListItem[]>(() => {
    const result: ListItem[] = [];
    const byDay: Record<string, Message[]> = {};

    // Group by day
    for (const m of messages) {
      if (!m?.id) continue;
      const d = new Date(m.created_at);
      const key = d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      (byDay[key] ||= []).push(m);
    }

    // Flatten with day dividers
    const days = Object.keys(byDay).sort((a, b) => {
      return new Date(byDay[a][0].created_at).getTime() - new Date(byDay[b][0].created_at).getTime();
    });

    for (const day of days) {
      // Add day divider
      result.push({
        type: 'day-divider',
        id: `day-${day}`,
        label: day,
      });

      // Add messages for this day
      const dayMessages = byDay[day];
      for (let i = 0; i < dayMessages.length; i++) {
        const current = dayMessages[i];
        const previous = i > 0 ? dayMessages[i - 1] : null;

        // Determine if we should show header
        let showHeader = true;
        if (previous) {
          const currentUserId = current.username || current.user_id;
          const previousUserId = previous.username || previous.user_id;

          // Same user within 7 minutes = no header
          if (currentUserId === previousUserId) {
            const currentTime = new Date(current.created_at).getTime();
            const previousTime = new Date(previous.created_at).getTime();
            const timeDiff = currentTime - previousTime;
            if (timeDiff <= 7 * 60 * 1000) {
              showHeader = false;
            }
          }
        }

        result.push({
          type: 'message',
          id: current.id,
          message: current,
          showHeader,
        });
      }
    }

    return result;
  }, [messages]);

  // Auto-scroll to bottom when new messages arrive
  const followOutput = useMemo(() => {
    return atBottom ? 'smooth' : false;
  }, [atBottom]);

  // Scroll to bottom button handler
  const scrollToBottom = () => {
    virtuosoRef.current?.scrollToIndex({
      index: items.length - 1,
      behavior: 'smooth',
    });
  };

  // Empty state
  if (!loading && messages.length === 0) {
    return (
      <div className={cx('h-full flex items-center justify-center', className)}>
        <div className="text-center text-text-secondary">
          <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-gradient-to-br from-accent-gradient-start to-accent-gradient-end opacity-20 grid place-items-center border border-border">
            <Hash className="h-7 w-7 text-text-primary" />
          </div>
          <div className="font-medium mb-1 text-text-primary">Be the first to say something</div>
          <div className="text-sm text-text-tertiary">Start a conversation in this channel.</div>
        </div>
      </div>
    );
  }

  return (
    <div className={cx('h-full relative', className)}>
      <Virtuoso
        ref={virtuosoRef}
        data={items}
        followOutput={followOutput}
        atBottomStateChange={setAtBottom}
        itemContent={(index, item) => {
          if (item.type === 'day-divider') {
            return <DayDivider label={item.label} />;
          }

          // Message row
          const reactionCounts = getReactionCounts(item.message.id);
          return (
            <MessageRow
              message={item.message}
              showHeader={item.showHeader}
              reactionCounts={reactionCounts}
              onReactionAdd={onReactionAdd}
              onReactionRemove={onReactionRemove}
              onOpenReactionTray={setOpenReactionFor}
              isReactionTrayOpen={openReactionFor === item.message.id}
            />
          );
        }}
        components={{
          List: (props) => (
            <div
              {...props}
              role="log"
              aria-live="polite"
              className="py-4"
            />
          ),
        }}
      />

      {/* Scroll to bottom button */}
      {!atBottom && !loading && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={scrollToBottom}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-surface/90 backdrop-blur px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:border-border-hover shadow-lg"
          >
            <ChevronDown className="h-4 w-4" />
            New messages
          </button>
        </div>
      )}
    </div>
  );
}
