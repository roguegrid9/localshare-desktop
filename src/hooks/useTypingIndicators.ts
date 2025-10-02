import { useState, useEffect, useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useTauriCommands } from './useTauriCommands';
import type { TypingIndicator, TypingIndicatorPayload } from '../types/messaging';

export function useTypingIndicators(channelId: string) {
  const [typingUsers, setTypingUsers] = useState<TypingIndicator[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  const commands = useTauriCommands();
  const typingTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});
  const sendTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Listen for typing events
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const setupListener = async () => {
      unsubscribe = await listen<TypingIndicatorPayload>(
        'typing_indicator',
        (event) => {
          const { channel_id, user_id, is_typing } = event.payload;
          
          if (channel_id === channelId) {
            setTypingUsers(prev => {
              if (is_typing) {
                // Add typing indicator
                const indicator: TypingIndicator = {
                  channel_id,
                  user_id,
                  is_typing: true,
                  timestamp: new Date().toISOString()
                };
                
                // Clear existing timeout
                if (typingTimeoutRef.current[user_id]) {
                  clearTimeout(typingTimeoutRef.current[user_id]);
                }
                
                // Auto-remove after 3 seconds
                typingTimeoutRef.current[user_id] = setTimeout(() => {
                  setTypingUsers(current => current.filter(t => t.user_id !== user_id));
                  delete typingTimeoutRef.current[user_id];
                }, 3000);
                
                // Remove existing indicator and add new one
                const filtered = prev.filter(t => t.user_id !== user_id);
                return [...filtered, indicator];
              } else {
                // Remove typing indicator
                if (typingTimeoutRef.current[user_id]) {
                  clearTimeout(typingTimeoutRef.current[user_id]);
                  delete typingTimeoutRef.current[user_id];
                }
                return prev.filter(t => t.user_id !== user_id);
              }
            });
          }
        }
      );
    };

    setupListener();

    return () => {
      unsubscribe?.();
      // Clear all timeouts
      Object.values(typingTimeoutRef.current).forEach(timeout => clearTimeout(timeout));
      typingTimeoutRef.current = {};
    };
  }, [channelId]);

  const startTyping = useCallback(async (): Promise<void> => {
    if (isTyping) return; // Already typing

    try {
      await commands.setTypingIndicator(channelId, true);
      setIsTyping(true);

      // Clear existing timeout
      if (sendTypingTimeoutRef.current) {
        clearTimeout(sendTypingTimeoutRef.current);
      }

      // Auto-stop typing after 3 seconds
      sendTypingTimeoutRef.current = setTimeout(async () => {
        try {
          await commands.setTypingIndicator(channelId, false);
        } catch (err) {
          console.warn('Failed to stop typing indicator:', err);
        }
        setIsTyping(false);
        sendTypingTimeoutRef.current = null;
      }, 3000);

    } catch (err) {
      console.warn('Failed to start typing indicator:', err);
    }
  }, [channelId, commands, isTyping]);

  const stopTyping = useCallback(async (): Promise<void> => {
    if (!isTyping) return; // Not typing

    try {
      await commands.setTypingIndicator(channelId, false);
      setIsTyping(false);

      // Clear timeout
      if (sendTypingTimeoutRef.current) {
        clearTimeout(sendTypingTimeoutRef.current);
        sendTypingTimeoutRef.current = null;
      }
    } catch (err) {
      console.warn('Failed to stop typing indicator:', err);
    }
  }, [channelId, commands, isTyping]);

  // Clean up when channel changes
  useEffect(() => {
    return () => {
      if (sendTypingTimeoutRef.current) {
        clearTimeout(sendTypingTimeoutRef.current);
        sendTypingTimeoutRef.current = null;
      }
      setIsTyping(false);
      setTypingUsers([]);
    };
  }, [channelId]);

  return {
    typingUsers,
    isTyping,
    startTyping,
    stopTyping
  };
}
