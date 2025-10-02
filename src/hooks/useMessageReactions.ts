import { useState, useCallback } from 'react';
import { useTauriCommands } from './useTauriCommands';
import type { MessageReaction } from '../types/messaging';

export function useMessageReactions(messageId: string) {
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  const [loading, setLoading] = useState(false);

  const commands = useTauriCommands();

  const addReaction = useCallback(async (emoji: string): Promise<void> => {
    try {
      setLoading(true);
      const reaction = await commands.addMessageReaction(messageId, emoji);
      setReactions(prev => [...prev, reaction]);
    } catch (err) {
      console.error('Failed to add reaction:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [messageId, commands]);

  const removeReaction = useCallback(async (emoji: string): Promise<void> => {
    try {
      setLoading(true);
      await commands.removeMessageReaction(messageId, emoji);
      setReactions(prev => prev.filter(r => r.emoji !== emoji));
    } catch (err) {
      console.error('Failed to remove reaction:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [messageId, commands]);

  const getReactionCounts = useCallback((): Record<string, number> => {
    const counts: Record<string, number> = {};
    reactions.forEach(reaction => {
      counts[reaction.emoji] = (counts[reaction.emoji] || 0) + 1;
    });
    return counts;
  }, [reactions]);

  const getUserReactions = useCallback((userId: string): string[] => {
    return reactions
      .filter(r => r.user_id === userId)
      .map(r => r.emoji);
  }, [reactions]);

  return {
    reactions,
    loading,
    addReaction,
    removeReaction,
    getReactionCounts,
    getUserReactions
  };
}
