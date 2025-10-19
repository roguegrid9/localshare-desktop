// Global keyboard shortcuts hook
// Handles all app-wide keyboard shortcuts with fallbacks

import { useEffect } from 'react';
import { useUIStore } from '../stores/useUIStore';

/**
 * Register global keyboard shortcuts
 *
 * Shortcuts:
 * - Ctrl+` or Ctrl+J: Toggle chat dock
 * - Ctrl+Shift+V: Toggle voice drawer
 * - Ctrl+Shift+C: Toggle compact view for selected voice
 * - Ctrl+Shift+M: Mute/unmute (global)
 * - M: Mute/unmute (when voice UI focused)
 * - Esc: Close overlays (bottom view, compact view, etc.)
 * - Ctrl+/: Show shortcut help (TODO: implement help dialog)
 */
export function useKeyboardShortcuts() {
  const toggleChatDock = useUIStore((state) => state.toggleChatDock);
  const toggleVoiceDrawer = useUIStore((state) => state.toggleVoiceDrawer);
  const setMuted = useUIStore((state) => state.setMuted);
  const voice = useUIStore((state) => state.voice);
  const dynamicIsland = useUIStore((state) => state.dynamicIsland);
  const bubbles = useUIStore((state) => state.bubbleDock.bubbles);
  const openBubble = useUIStore((state) => state.openBubble);
  const closeBubble = useUIStore((state) => state.closeBubble);
  const toggleBubbleExpand = useUIStore((state) => state.toggleBubbleExpand);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const key = e.key.toLowerCase();

      // Chat toggle: Ctrl+` (primary) or Ctrl+J (fallback for keyboards without backtick)
      if (ctrl && !shift && (e.key === '`' || key === 'j')) {
        e.preventDefault();
        toggleChatDock();
        return;
      }

      // Voice drawer: Ctrl+Shift+V
      if (ctrl && shift && key === 'v') {
        e.preventDefault();
        toggleVoiceDrawer();
        return;
      }

      // Toggle voice bubble: Ctrl+Shift+C
      if (ctrl && shift && key === 'c') {
        e.preventDefault();
        const selectedVoicePill = dynamicIsland.voicePills.find(
          (p) => p.id === dynamicIsland.selectedVoicePillId
        );
        if (selectedVoicePill) {
          // Check if bubble already exists for this channel
          const existingBubble = bubbles.find(
            (b) => b.channelId === selectedVoicePill.channelId && b.type === 'voice'
          );
          if (existingBubble) {
            // Close if exists
            closeBubble(existingBubble.id);
          } else {
            // Open new bubble
            openBubble('voice', {
              id: selectedVoicePill.id,
              channelId: selectedVoicePill.channelId,
              channelName: selectedVoicePill.channelName,
              isMuted: selectedVoicePill.isMuted,
              isDeafened: selectedVoicePill.isDeafened,
              participantCount: selectedVoicePill.participantCount,
              expanded: true,
              docked: true,
            });
          }
        }
        return;
      }

      // Collapse expanded bubbles with Escape
      if (key === 'escape' && !ctrl && !shift) {
        // Find the most recently focused expanded bubble
        const expandedBubbles = bubbles.filter((b) => b.expanded);
        if (expandedBubbles.length > 0) {
          // Sort by lastFocused to get most recent
          const mostRecentBubble = expandedBubbles.sort(
            (a, b) => b.lastFocused.getTime() - a.lastFocused.getTime()
          )[0];
          e.preventDefault();
          toggleBubbleExpand(mostRecentBubble.id);
          return;
        }
      }

      // Mute toggle (global): Ctrl+Shift+M
      if (ctrl && shift && key === 'm') {
        e.preventDefault();
        setMuted(!voice.muted);
        return;
      }

      // Mute toggle (voice UI focused): M
      // Check if focus is within a voice UI element
      const activeEl = document.activeElement;
      if (key === 'm' && !ctrl && !shift) {
        const isVoiceUIFocused = activeEl?.closest('[data-voice-ui]');
        if (isVoiceUIFocused) {
          e.preventDefault();
          setMuted(!voice.muted);
          return;
        }
      }

      // TODO: Ctrl+/ to show shortcut help dialog
      if (ctrl && !shift && e.key === '/') {
        e.preventDefault();
        console.log('Shortcut help dialog - TODO');
        // showShortcutHelp();
        return;
      }
    };

    // Register global listener
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    toggleChatDock,
    toggleVoiceDrawer,
    setMuted,
    voice.muted,
    dynamicIsland,
    bubbles,
    openBubble,
    closeBubble,
    toggleBubbleExpand,
  ]);
}

/**
 * Hook to register component-specific shortcuts
 * Use this within specific components that need custom shortcuts
 */
export function useComponentShortcuts(shortcuts: Record<string, () => void>) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const alt = e.altKey;
      const key = e.key.toLowerCase();

      // Build key combination string
      let combo = '';
      if (ctrl) combo += 'ctrl+';
      if (shift) combo += 'shift+';
      if (alt) combo += 'alt+';
      combo += key;

      // Check if this combo has a handler
      const handler = shortcuts[combo];
      if (handler) {
        e.preventDefault();
        handler();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts]);
}
