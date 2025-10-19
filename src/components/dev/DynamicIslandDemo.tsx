// DynamicIslandDemo.tsx - Dev panel for testing dynamic island features
import { useState, useEffect } from 'react';
import { useUIStore } from '../../stores/useUIStore';
import { X, MessageSquare, Volume2 } from 'lucide-react';
import { cn } from '../../utils/cx';

export function DynamicIslandDemo() {
  const [isOpen, setIsOpen] = useState(false);
  const addMessagePill = useUIStore((state) => state.addMessagePill);
  const addVoicePill = useUIStore((state) => state.addVoicePill);

  // Listen for Ctrl+Shift+D to toggle dev panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const createTestMessagePill = () => {
    addMessagePill({
      id: `msg-${Date.now()}`,
      channelId: 'test-channel-1',
      channelName: 'general',
      username: 'TestUser',
      messagePreview: 'Hey! This is a test message from the demo panel.',
      timestamp: new Date(),
    });
  };

  const createTestVoicePill = () => {
    addVoicePill({
      id: `voice-${Date.now()}`,
      channelId: `test-voice-${Date.now()}`,
      channelName: `Voice ${Math.floor(Math.random() * 100)}`,
      isMuted: false,
      isDeafened: false,
      participantCount: Math.floor(Math.random() * 10) + 1,
      lastActivity: new Date(),
    });
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed bottom-4 right-4 w-80 bg-bg-surface border border-border rounded-xl shadow-2xl z-[100]"
      data-no-drag
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg-muted rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm font-medium text-text-primary">
            Dynamic Island Demo
          </span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="h-6 w-6 rounded flex items-center justify-center hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <div className="text-xs text-text-tertiary mb-2">
          Press <kbd className="px-1.5 py-0.5 rounded bg-bg-muted border border-border text-text-secondary">Ctrl+Shift+D</kbd> to toggle this panel
        </div>

        <button
          onClick={createTestMessagePill}
          className={cn(
            'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all',
            'bg-bg-muted border border-border hover:border-border-hover',
            'text-text-primary hover:bg-bg-hover'
          )}
        >
          <MessageSquare className="h-5 w-5 text-accent-solid" />
          <div className="flex-1 text-left">
            <div className="text-sm font-medium">Add Message Pill</div>
            <div className="text-xs text-text-tertiary">Test message notification</div>
          </div>
        </button>

        <button
          onClick={createTestVoicePill}
          className={cn(
            'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all',
            'bg-bg-muted border border-border hover:border-border-hover',
            'text-text-primary hover:bg-bg-hover'
          )}
        >
          <Volume2 className="h-5 w-5 text-green-500" />
          <div className="flex-1 text-left">
            <div className="text-sm font-medium">Add Voice Pill</div>
            <div className="text-xs text-text-tertiary">Test voice channel</div>
          </div>
        </button>

        <div className="pt-3 border-t border-border">
          <div className="text-xs text-text-tertiary space-y-1">
            <p><strong>Keyboard Shortcuts:</strong></p>
            <p>• Click message pill → Opens bottom view</p>
            <p>• Click voice pill → Selects it (green outline)</p>
            <p>• Double-click voice pill → Opens compact view</p>
            <p>• Ctrl+Shift+C → Toggle compact view</p>
            <p>• Esc → Close overlays</p>
          </div>
        </div>
      </div>
    </div>
  );
}
