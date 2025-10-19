// BubbleDock.tsx - Main container for collapsible chat/voice bubbles
import { useUIStore } from '../../stores/useUIStore';
import { BubbleChrome } from './BubbleChrome';
import { TooltipProvider } from '../ui/tooltip';
import { useTauriCommands } from '../../hooks/useTauriCommands';

export function BubbleDock() {
  const bubbles = useUIStore((state) => state.bubbleDock.bubbles);
  const dockOrder = useUIStore((state) => state.bubbleDock.dockOrder);
  const maxDocked = useUIStore((state) => state.bubbleDock.maxDocked);
  const commands = useTauriCommands();

  // Handle sending messages
  const handleSend = async (id: string, text: string) => {
    try {
      const bubble = bubbles.find((b) => b.id === id);
      if (!bubble || !bubble.channelId) {
        console.error('Cannot send message: bubble or channelId not found');
        return;
      }

      // Send message via WebSocket or REST API
      await commands.sendWebSocketTextMessage(
        bubble.channelId,
        text,
        'text'
      );
    } catch (error) {
      console.error('Failed to send message:', error);
      // TODO: Show error toast to user
    }
  };

  // Handle voice actions
  const handleVoiceAction = (id: string, action: 'mute' | 'deafen' | 'leave' | 'settings') => {
    const bubble = bubbles.find((b) => b.id === id);
    if (!bubble) return;

    if (action === 'leave') {
      // Close the bubble and leave voice channel
      useUIStore.getState().closeBubble(id);
      useUIStore.getState().setInCall(false);
      useUIStore.getState().setVoiceChannel(undefined);
      return;
    }

    if (action === 'mute') {
      const newMuted = !bubble.isMuted;
      useUIStore.getState().updateBubble(id, { isMuted: newMuted });
      // Also update global voice state
      useUIStore.getState().setMuted(newMuted);
    } else if (action === 'deafen') {
      const newDeafened = !bubble.isDeafened;
      useUIStore.getState().updateBubble(id, { isDeafened: newDeafened });
      // TODO: Implement deafen in voice backend
    } else if (action === 'settings') {
      // TODO: Open audio settings dialog
      console.log('Open audio settings for bubble:', id);
    }
  };

  // Separate docked and free-floating bubbles
  const dockedBubbles = bubbles
    .filter((b) => b.docked)
    .sort((a, b) => {
      // Sort by dockOrder (right to left)
      const aIndex = dockOrder.indexOf(a.id);
      const bIndex = dockOrder.indexOf(b.id);
      return aIndex - bIndex;
    })
    .slice(0, maxDocked); // Limit to maxDocked

  const freeBubbles = bubbles.filter((b) => !b.docked);

  return (
    <TooltipProvider>
      <div aria-label="Bubble dock" className="pointer-events-none fixed inset-0 z-40">
        {/* Docked bubbles - bottom rail, right to left */}
        <div className="pointer-events-auto fixed bottom-2 right-2 left-2 flex flex-row-reverse gap-2 justify-start">
          {dockedBubbles.map((bubble) => (
            <BubbleChrome
              key={bubble.id}
              bubble={bubble}
              mode="docked"
              onSend={handleSend}
              onVoiceAction={handleVoiceAction}
            />
          ))}
        </div>

        {/* Free-floating bubbles */}
        {freeBubbles.map((bubble) => (
          <BubbleChrome
            key={bubble.id}
            bubble={bubble}
            mode="free"
            onSend={handleSend}
            onVoiceAction={handleVoiceAction}
          />
        ))}
      </div>
    </TooltipProvider>
  );
}
