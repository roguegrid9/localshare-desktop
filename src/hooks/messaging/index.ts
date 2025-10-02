// src/hooks/messaging/index.ts - Centralized exports for messaging functionality

// Core messaging hooks
export { useChannels } from '../useChannels';
export { useMessages } from '../useMessages';
export { useMessaging } from '../useMessaging';
export { useMessageReactions } from '../useMessageReactions';
export { useTypingIndicators } from '../useTypingIndicators';

// Master messaging system hook
export { useMessagingSystem } from '../useMessagingSystem';
export type { MessagingSystem } from '../useMessagingSystem';

// Event handling
export { useMessagingEvents, withMessagingEvents } from '../useMessagingEvents';

// Utility functions
export * from '../utils/messaging';

// Re-export types for convenience
export type {
  // Core types
  TextMessage,
  MessageReaction,
  ChannelInfo,
  ChannelMember,
  DirectMessageChannel,
  TypingIndicator,
  
  // Request/Response types
  CreateTextChannelRequest,
  CreateDirectMessageRequest,
  CreateDirectMessageResponse,
  SendMessageRequest,
  SendMessageResponse,
  GetMessagesRequest,
  GetMessagesResponse,
  EditMessageRequest,
  DeleteMessageRequest,
  
  // WebSocket payloads
  TextMessagePayload,
  MessageEditedPayload,
  MessageDeletedPayload,
  MessageReactionPayload,
  TypingIndicatorPayload,
  
  // Enhanced types
  MessageWithReactions,
  ChannelWithUnreadCount,
  SystemMessageData,
  MessagingState,
  MessagePaginationCursor,
  
  // Hook return types
  UseMessagingReturn,
  UseChannelsReturn,
  UseMessagesReturn
} from '../../types/messaging';
