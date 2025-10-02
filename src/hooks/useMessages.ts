// src/hooks/useMessages.ts - Consolidated messaging hook
import { useState, useEffect, useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useTauriCommands } from './useTauriCommands';
import type { 
  TextMessage, 
  SendMessageRequest, 
  GetMessagesRequest,
  MessagePaginationCursor,
  MessageReaction,
  TextMessagePayload,
  MessageEditedPayload,
  MessageDeletedPayload,
  MessageReactionPayload
} from '../types/messaging';

export interface UseMessagesReturn {
  // State
  messages: TextMessage[];
  reactions: Record<string, MessageReaction[]>; // messageId -> reactions
  loading: boolean;
  error: string | null;
  hasMoreOlder: boolean;
  hasMoreNewer: boolean;
  
  // Operations
  sendMessage: (content: string, options?: Partial<SendMessageRequest>) => Promise<TextMessage>;
  editMessage: (messageId: string, content: string) => Promise<TextMessage>;
  deleteMessage: (messageId: string, reason?: string) => Promise<void>;
  loadMoreMessages: (direction: 'older' | 'newer') => Promise<void>;
  
  // Reactions
  addReaction: (messageId: string, emoji: string) => Promise<void>;
  removeReaction: (messageId: string, emoji: string) => Promise<void>;
  getReactionCounts: (messageId: string) => Record<string, number>;
  getUserReactions: (messageId: string, userId: string) => string[];
  
  // Utilities
  getMessageById: (messageId: string) => TextMessage | undefined;
  refreshMessages: () => Promise<void>;
  clearMessages: () => void;
}

export function useMessages(channelId: string): UseMessagesReturn {
  const [messages, setMessages] = useState<TextMessage[]>([]);
  const [reactions, setReactions] = useState<Record<string, MessageReaction[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paginationCursor, setPaginationCursor] = useState<MessagePaginationCursor | null>(null);
  
  // Add user state
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);

  const commands = useTauriCommands();
  const unsubscribersRef = useRef<Array<() => void>>([]);

  // Get current user info
  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const userState = await commands.getUserState();
        setCurrentUserId(userState.user_id);
        setCurrentUsername(userState.username || userState.display_name);
      } catch (error) {
        console.error('Failed to get user state:', error);
      }
    };
    getCurrentUser();
  }, [commands]);

  // Load messages for the channel
  const loadMessages = useCallback(async (request?: GetMessagesRequest) => {
    if (!channelId) return;

    try {
      setLoading(true);
      setError(null);

      const response = await commands.getChannelMessages(channelId, request);
      
      if (!request?.before && !request?.after) {
        // Initial load
        setMessages(response.messages || []);
      } else if (request.before) {
        // Loading older messages
        setMessages(prev => [...(response.messages || []), ...prev]);
      } else if (request.after) {
        // Loading newer messages  
        setMessages(prev => [...prev, ...(response.messages || [])]);
      }

      setPaginationCursor({
        oldest_message_id: response.oldest_id,
        newest_message_id: response.newest_id,
        has_more_older: response.has_more || false,
        has_more_newer: false,
        total_count: response.total_count || 0
      });

    } catch (err) {
      const errorString = String(err);
      
      // Check if this is an "empty channel" scenario vs a real error
      if (errorString.includes('Failed to get channel messages') || 
          errorString.includes('No messages found') ||
          errorString.includes('Channel empty') ||
          errorString.includes('channel appears to be empty')) {
        
        // This is likely just an empty channel, not a real error
        console.log(`Channel ${channelId} appears to be empty, setting empty state`);
        setMessages([]);
        setPaginationCursor({
          oldest_message_id: undefined,
          newest_message_id: undefined,
          has_more_older: false,
          has_more_newer: false,
          total_count: 0
        });
        setError(null); // Don't show error for empty channels
      } else {
        // This is a real error that should be displayed
        console.error('Failed to load messages:', err);
        setError(`Failed to load messages: ${errorString}`);
      }
    } finally {
      setLoading(false);
    }
  }, [channelId, commands]);

  // WebSocket connection check
  const checkWebSocketConnection = async (): Promise<boolean> => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('is_websocket_connected');
    } catch (error) {
      console.warn('Failed to check WebSocket status:', error);
      return false;
    }
  };

  // Send a message with proper user data
  const sendMessage = useCallback(async (
    content: string, 
    options?: Partial<SendMessageRequest>
  ): Promise<TextMessage> => {
    const request: SendMessageRequest = {
      content,
      message_type: options?.message_type || 'text',
      reply_to_id: options?.reply_to_id,
      metadata: options?.metadata
    };

    // Check if WebSocket is actually connected before trying to use it
    const isWebSocketConnected = await checkWebSocketConnection();
    
    if (isWebSocketConnected) {
      try {
        // Try WebSocket first for real-time
        await commands.sendWebSocketTextMessage(
          channelId, 
          request.content, 
          request.message_type, 
          request.reply_to_id,
          request.metadata
        );
        
        // Create optimistic message with actual user data
        const optimisticMessage: TextMessage = {
          id: `temp-${Date.now()}`,
          channel_id: channelId,
          user_id: currentUserId || 'unknown-user',
          content,
          message_type: request.message_type || 'text',
          reply_to_id: request.reply_to_id,
          metadata: request.metadata || '{}',
          is_edited: false,
          is_deleted: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          // Add the username fields for display
          username: currentUsername,
          display_name: currentUsername
        };
        
        setMessages(prev => [...prev, optimisticMessage]);
        return optimisticMessage;
        
      } catch (wsError) {
        console.warn('WebSocket send failed despite connection check:', wsError);
        // Fall through to REST API
      }
    } else {
      console.warn('WebSocket not connected, using REST API directly');
    }
    
    // REST API fallback
    try {
      const response = await commands.sendMessage(channelId, request);
      
      if (!response) {
        throw new Error('API returned null/undefined response');
      }
      
      let message: TextMessage;
      if ('message' in response && response.message) {
        message = response.message;
      } else if ('id' in response && response.id) {
        message = response as TextMessage;
      } else {
        console.error('Unexpected API response format:', response);
        throw new Error(`Invalid message format returned from API: ${JSON.stringify(response)}`);
      }
      
      if (!message.id || !message.content) {
        console.error('Message missing required fields:', message);
        throw new Error(`Message missing required fields. ID: ${message.id}, Content: ${message.content}`);
      }
      
      setMessages(prev => [...prev, message]);
      return message;
      
    } catch (apiError) {
      console.error('Failed to send message via REST API:', apiError);
      throw new Error(`Failed to send message: ${apiError}`);
    }
  }, [channelId, commands, currentUserId, currentUsername]);

  // Edit a message
  const editMessage = useCallback(async (messageId: string, content: string): Promise<TextMessage> => {
    try {
      // Try WebSocket first
      await commands.sendWebSocketEditMessage(messageId, content);
      
      // Update optimistically
      setMessages(prev => 
        prev.map(msg => 
          msg.id === messageId 
            ? { ...msg, content, is_edited: true, edited_at: new Date().toISOString() }
            : msg
        )
      );
      
      const updatedMessage = messages.find(m => m.id === messageId);
      if (updatedMessage) {
        return { ...updatedMessage, content, is_edited: true, edited_at: new Date().toISOString() };
      }
      throw new Error('Message not found');
      
    } catch (wsError) {
      // Fall back to REST API
      const editedMessage = await commands.editMessage(messageId, { content });
      setMessages(prev => prev.map(msg => msg.id === messageId ? editedMessage : msg));
      return editedMessage;
    }
  }, [commands, messages]);

  // Delete a message
  const deleteMessage = useCallback(async (messageId: string, reason?: string): Promise<void> => {
    try {
      // Try WebSocket first
      await commands.sendWebSocketDeleteMessage(messageId, reason);
      
      // Update optimistically
      setMessages(prev => 
        prev.map(msg => 
          msg.id === messageId 
            ? { ...msg, is_deleted: true, deleted_at: new Date().toISOString() }
            : msg
        )
      );
      
    } catch (wsError) {
      // Fall back to REST API
      await commands.deleteMessage(messageId, reason ? { reason } : undefined);
      setMessages(prev => 
        prev.map(msg => 
          msg.id === messageId 
            ? { ...msg, is_deleted: true, deleted_at: new Date().toISOString() }
            : msg
        )
      );
    }
  }, [commands]);

  // Load more messages
  const loadMoreMessages = useCallback(async (direction: 'older' | 'newer'): Promise<void> => {
    if (!paginationCursor) return;

    const request: GetMessagesRequest = {
      limit: 50,
      [direction === 'older' ? 'before' : 'after']: 
        direction === 'older' ? paginationCursor.oldest_message_id : paginationCursor.newest_message_id
    };

    await loadMessages(request);
  }, [paginationCursor, loadMessages]);

  // Add reaction
  const addReaction = useCallback(async (messageId: string, emoji: string): Promise<void> => {
    try {
      const reaction = await commands.addMessageReaction(messageId, emoji);
      setReactions(prev => ({
        ...prev,
        [messageId]: [...(prev[messageId] || []), reaction]
      }));
    } catch (err) {
      console.error('Failed to add reaction:', err);
      throw err;
    }
  }, [commands]);

  // Remove reaction
  const removeReaction = useCallback(async (messageId: string, emoji: string): Promise<void> => {
    try {
      await commands.removeMessageReaction(messageId, emoji);
      setReactions(prev => ({
        ...prev,
        [messageId]: (prev[messageId] || []).filter(r => r.emoji !== emoji)
      }));
    } catch (err) {
      console.error('Failed to remove reaction:', err);
      throw err;
    }
  }, [commands]);

  // Get reaction counts for a message
  const getReactionCounts = useCallback((messageId: string): Record<string, number> => {
    const messageReactions = reactions[messageId] || [];
    const counts: Record<string, number> = {};
    messageReactions.forEach(reaction => {
      counts[reaction.emoji] = (counts[reaction.emoji] || 0) + 1;
    });
    return counts;
  }, [reactions]);

  // Get user's reactions for a message
  const getUserReactions = useCallback((messageId: string, userId: string): string[] => {
    const messageReactions = reactions[messageId] || [];
    return messageReactions
      .filter(r => r.user_id === userId)
      .map(r => r.emoji);
  }, [reactions]);

  // Setup real-time event listeners
  useEffect(() => {
    if (!channelId) return;

    const setupEventListeners = async () => {
      try {
        // Clear existing listeners
        unsubscribersRef.current.forEach(unsub => unsub());
        unsubscribersRef.current = [];

        // Message received events
        const unsubTextMessage = await listen<TextMessagePayload>(
          'text_message_received',
          (event) => {
            const { channel_id, message } = event.payload;
            if (channel_id === channelId) {
              setMessages(prev => {
                // Avoid duplicates and replace optimistic messages
                const filtered = prev.filter(m => m.id !== message.id && !m.id.startsWith('temp-'));
                return [...filtered, message];
              });
            }
          }
        );
        unsubscribersRef.current.push(unsubTextMessage);

        const unsubSystemMessage = await listen<TextMessagePayload>(
          'system_message_received',
          (event) => {
            const { channel_id, message } = event.payload;
            if (channel_id === channelId) {
              setMessages(prev => {
                if (prev.some(m => m.id === message.id)) return prev;
                return [...prev, message];
              });
            }
          }
        );
        unsubscribersRef.current.push(unsubSystemMessage);

        // Message edit events
        const unsubMessageEdited = await listen<MessageEditedPayload>(
          'text_message_edited',
          (event) => {
            const { channel_id, message } = event.payload;
            if (channel_id === channelId) {
              setMessages(prev => 
                prev.map(msg => msg.id === message.id ? message : msg)
              );
            }
          }
        );
        unsubscribersRef.current.push(unsubMessageEdited);

        // Message delete events
        const unsubMessageDeleted = await listen<MessageDeletedPayload>(
          'text_message_deleted',
          (event) => {
            const { channel_id, message_id } = event.payload;
            if (channel_id === channelId) {
              setMessages(prev => 
                prev.map(msg => 
                  msg.id === message_id 
                    ? { ...msg, is_deleted: true, deleted_at: new Date().toISOString() }
                    : msg
                )
              );
            }
          }
        );
        unsubscribersRef.current.push(unsubMessageDeleted);

        // Reaction events
        const unsubReactionChanged = await listen<MessageReactionPayload>(
          'message_reaction_changed',
          (event) => {
            const { channel_id, message_id, reaction, action } = event.payload;
            if (channel_id === channelId) {
              setReactions(prev => {
                const messageReactions = prev[message_id] || [];
                
                if (action === 'added') {
                  if (!messageReactions.some(r => r.id === reaction.id)) {
                    return {
                      ...prev,
                      [message_id]: [...messageReactions, reaction]
                    };
                  }
                } else if (action === 'removed') {
                  return {
                    ...prev,
                    [message_id]: messageReactions.filter(r => r.id !== reaction.id)
                  };
                }
                
                return prev;
              });
            }
          }
        );
        unsubscribersRef.current.push(unsubReactionChanged);

      } catch (error) {
        console.warn('Failed to setup message event listeners:', error);
      }
    };

    setupEventListeners();

    return () => {
      unsubscribersRef.current.forEach(unsub => unsub());
      unsubscribersRef.current = [];
    };
  }, [channelId]);

  // Load messages when channel changes
  useEffect(() => {
    if (channelId) {
      // Clear messages immediately when switching channels
      setMessages([]);
      setReactions({});
      setPaginationCursor(null);
      
      // Then load new messages
      loadMessages();
    } else {
      setMessages([]);
      setReactions({});
      setPaginationCursor(null);
    }
  }, [channelId, loadMessages]);

  // Utility functions
  const getMessageById = useCallback((messageId: string): TextMessage | undefined => {
    return messages.find(m => m.id === messageId);
  }, [messages]);

  const refreshMessages = useCallback(async (): Promise<void> => {
    await loadMessages();
  }, [loadMessages]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setReactions({});
    setPaginationCursor(null);
  }, []);

  return {
    // State
    messages,
    reactions,
    loading,
    error,
    hasMoreOlder: paginationCursor?.has_more_older ?? false,
    hasMoreNewer: paginationCursor?.has_more_newer ?? false,
    
    // Operations
    sendMessage,
    editMessage,
    deleteMessage,
    loadMoreMessages,
    
    // Reactions
    addReaction,
    removeReaction,
    getReactionCounts,
    getUserReactions,
    
    // Utilities
    getMessageById,
    refreshMessages,
    clearMessages
  };
}