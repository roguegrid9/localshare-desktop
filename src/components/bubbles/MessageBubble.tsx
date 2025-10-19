// MessageBubble.tsx - Message bubble content (collapsed + expanded views)
import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { useUIStore, type ChatBubble } from '../../stores/useUIStore';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import { cn } from '../../utils/cx';

interface MessageBubbleProps {
  bubble: ChatBubble;
  onSend: (id: string, text: string) => void;
}

export function MessageBubble({ bubble, onSend }: MessageBubbleProps) {
  const [replyText, setReplyText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const updateBubble = useUIStore((state) => state.updateBubble);

  // Focus input and reset unread when expanded
  useEffect(() => {
    if (bubble.expanded) {
      if (inputRef.current) {
        inputRef.current.focus();
      }
      // Reset unread count when user opens the bubble
      if (bubble.unread && bubble.unread > 0) {
        updateBubble(bubble.id, { unread: 0 });
      }
    }
  }, [bubble.expanded, bubble.id, bubble.unread, updateBubble]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!replyText.trim()) return;

    onSend(bubble.id, replyText);
    setReplyText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  if (!bubble.expanded) {
    // Collapsed view - just preview (header shows avatar and username)
    return null;
  }

  // Expanded view - full message interface
  return (
    <div className="flex h-[calc(100%-48px)] flex-col">
      {/* Message history */}
      <ScrollArea className="flex-1 px-3 py-2">
        <div className="space-y-3">
          {/* Placeholder for message list */}
          <div className="text-sm text-text-tertiary">
            Message history for {bubble.channelName} will appear here
          </div>
          {bubble.messagePreview && (
            <div className="text-sm text-text-secondary p-2 bg-bg-muted rounded">
              <span className="font-medium">{bubble.username}: </span>
              {bubble.messagePreview}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Quick reply */}
      <div className="border-t border-border p-2">
        <form onSubmit={handleSend} className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Reply to ${bubble.channelName}...`}
            className={cn(
              'flex-1 rounded-md border border-border bg-bg-surface px-3 py-2',
              'text-sm text-text-primary placeholder:text-text-tertiary',
              'outline-none focus:ring-2 focus:ring-accent-solid/50'
            )}
          />
          <Button
            type="submit"
            size="sm"
            disabled={!replyText.trim()}
            className="h-9"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <div className="mt-1 text-xs text-text-tertiary px-1">
          Cmd/Ctrl+Enter to send
        </div>
      </div>
    </div>
  );
}
