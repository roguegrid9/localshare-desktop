// Global message notification listener
// Creates message bubbles for new messages from other users in non-focused channels

import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useUIStore } from '../stores/useUIStore';
import { useTauriCommands } from './useTauriCommands';
import type { TextMessagePayload } from '../types/messaging';

export function useMessageNotifications() {
  const openBubble = useUIStore((state) => state.openBubble);
  const chatOpen = useUIStore((state) => state.chat.open);
  const currentChannelId = useUIStore((state) => state.chat.currentChannelId);
  const bubbles = useUIStore((state) => state.bubbleDock.bubbles);

  const commands = useTauriCommands();
  const currentUserId = useRef<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Get current user ID on mount
  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const userState = await commands.getUserState();
        currentUserId.current = userState.user_id;
      } catch (error) {
        console.error('Failed to get user state for notifications:', error);
      }
    };
    getCurrentUser();
  }, [commands]);

  // Setup global message listener
  useEffect(() => {
    const setupListener = async () => {
      try {
        // Clear existing listener
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
          unsubscribeRef.current = null;
        }

        // Listen to all incoming text messages
        const unsubscribe = await listen<TextMessagePayload>(
          'text_message_received',
          (event) => {
            const { channel_id, message } = event.payload;

            // Filter: Ignore messages from current user
            if (message.user_id === currentUserId.current) {
              return;
            }

            // Filter: Ignore messages in currently focused channel (if chat is open)
            if (chatOpen && channel_id === currentChannelId) {
              return;
            }

            // Filter: Check if bubble already exists for this channel
            const existingBubble = bubbles.find(
              (b) => b.channelId === channel_id && b.type === 'message'
            );

            if (existingBubble) {
              // Update existing bubble with new message preview and increment unread
              useUIStore.getState().updateBubble(existingBubble.id, {
                messagePreview: message.content.slice(0, 100),
                username: message.username || message.display_name || 'Unknown',
                unread: (existingBubble.unread || 0) + 1,
              });
              return;
            }

            // Create message bubble
            openBubble('message', {
              id: `msg-${channel_id}-${Date.now()}`,
              channelId: channel_id,
              channelName: `Channel ${channel_id.slice(0, 8)}`, // TODO: Get actual channel name
              username: message.username || message.display_name || 'Unknown',
              messagePreview: message.content.slice(0, 100),
              unread: 1,
              expanded: false,
              docked: true,
            });
          }
        );

        unsubscribeRef.current = unsubscribe;
      } catch (error) {
        console.error('Failed to setup message notification listener:', error);
      }
    };

    setupListener();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [openBubble, chatOpen, currentChannelId, bubbles]);
}
