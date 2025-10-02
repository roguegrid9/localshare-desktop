// Complete src/utils/messaging.ts

import type { 
  TextMessage, 
  MessageReaction, 
  ChannelInfo, 
  SystemMessageData,
  MessageWithReactions,
  ChannelWithUnreadCount 
} from '../types/messaging';

// ===== MESSAGE FORMATTING UTILITIES =====

/**
 * Format message timestamp for display
 */
export function formatMessageTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

  if (diffInHours < 1) {
    // Less than 1 hour ago - show minutes
    const minutes = Math.floor(diffInHours * 60);
    return minutes <= 1 ? 'just now' : `${minutes}m ago`;
  } else if (diffInHours < 24) {
    // Less than 24 hours ago - show hours
    const hours = Math.floor(diffInHours);
    return `${hours}h ago`;
  } else if (diffInHours < 24 * 7) {
    // Less than 7 days ago - show days
    const days = Math.floor(diffInHours / 24);
    return `${days}d ago`;
  } else {
    // More than 7 days ago - show full date
    return date.toLocaleDateString();
  }
}

/**
 * Format message timestamp for detailed view (tooltips, etc.)
 */
export function formatDetailedMessageTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

/**
 * Check if two messages should be grouped together (same user, close in time)
 */
export function shouldGroupMessages(
  currentMessage: TextMessage,
  previousMessage: TextMessage | null,
  maxGapMinutes: number = 5
): boolean {
  if (!previousMessage) return false;
  
  // Different users - don't group
  if (currentMessage.user_id !== previousMessage.user_id) return false;
  
  // System messages - don't group
  if (currentMessage.message_type === 'system' || previousMessage.message_type === 'system') {
    return false;
  }
  
  // Time gap too large - don't group
  const currentTime = new Date(currentMessage.created_at).getTime();
  const previousTime = new Date(previousMessage.created_at).getTime();
  const gapMinutes = (currentTime - previousTime) / (1000 * 60);
  
  return gapMinutes <= maxGapMinutes;
}

/**
 * Get display name for a message author
 */
export function getMessageAuthorName(message: TextMessage): string {
  return message.display_name || message.username || 'Unknown User';
}

/**
 * Check if a message mentions a specific user
 */
export function messageContainsMention(message: TextMessage, userId: string): boolean {
  // Simple @username mention detection
  const mentions = message.content.match(/@\w+/g);
  if (!mentions) return false;
  
  // You might want to implement more sophisticated mention detection
  // that maps usernames to user IDs
  return mentions.some(mention => mention.includes(userId.slice(0, 8)));
}

/**
 * Extract plain text content from message (removes markdown, etc.)
 */
export function getMessagePlainText(message: TextMessage): string {
  // Remove basic markdown formatting for preview text
  return message.content
    .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
    .replace(/\*(.*?)\*/g, '$1')     // Italic
    .replace(/`(.*?)`/g, '$1')       // Inline code
    .replace(/```[\s\S]*?```/g, '[Code Block]') // Code blocks
    .replace(/!\[.*?\]\(.*?\)/g, '[Image]')     // Images
    .replace(/\[.*?\]\(.*?\)/g, '[Link]')       // Links
    .trim();
}

/**
 * Truncate message content for previews
 */
export function truncateMessage(content: string, maxLength: number = 100): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength).trim() + '...';
}

// ===== REACTION UTILITIES =====

/**
 * Combine reactions with messages
 */
export function combineMessageWithReactions(
  message: TextMessage,
  reactions: MessageReaction[],
  currentUserId: string
): MessageWithReactions {
  const messageReactions = reactions.filter(r => r.message_id === message.id);
  
  // Count reactions by emoji
  const reactionCounts: Record<string, number> = {};
  messageReactions.forEach(reaction => {
    reactionCounts[reaction.emoji] = (reactionCounts[reaction.emoji] || 0) + 1;
  });
  
  // Get user's reactions
  const userReactions = messageReactions
    .filter(r => r.user_id === currentUserId)
    .map(r => r.emoji);
  
  return {
    ...message,
    reactions: messageReactions,
    reaction_counts: reactionCounts,
    user_reactions: userReactions
  };
}

/**
 * Get most common reactions for quick-add UI
 */
export function getCommonEmojis(): string[] {
  return ['👍', '👎', '❤️', '😂', '😮', '😢', '😡', '👀'];
}

/**
 * Get reaction summary text (e.g., "You and 2 others reacted with 👍")
 */
export function getReactionSummary(
  reactions: MessageReaction[],
  emoji: string,
  currentUserId: string
): string {
  const emojiReactions = reactions.filter(r => r.emoji === emoji);
  const count = emojiReactions.length;
  const userReacted = emojiReactions.some(r => r.user_id === currentUserId);
  
  if (count === 0) return '';
  
  if (count === 1) {
    return userReacted ? 'You reacted with ' + emoji : `${emojiReactions[0].display_name || 'Someone'} reacted with ` + emoji;
  }
  
  if (userReacted) {
    const others = count - 1;
    if (others === 1) {
      return `You and 1 other reacted with ${emoji}`;
    } else {
      return `You and ${others} others reacted with ${emoji}`;
    }
  } else {
    return `${count} people reacted with ${emoji}`;
  }
}

// ===== CHANNEL UTILITIES =====

/**
 * Sort channels by type and name
 */
export function sortChannels(channels: ChannelInfo[]): ChannelInfo[] {
  return [...channels].sort((a, b) => {
    // Sort by type first (text, voice, video)
    const typeOrder = { text: 0, voice: 1, video: 2 };
    const aTypeOrder = typeOrder[a.channel_type as keyof typeof typeOrder] ?? 999;
    const bTypeOrder = typeOrder[b.channel_type as keyof typeof typeOrder] ?? 999;
    
    if (aTypeOrder !== bTypeOrder) {
      return aTypeOrder - bTypeOrder;
    }
    
    // Then by name
    return a.name.localeCompare(b.name);
  });
}

/**
 * Filter channels by type
 */
export function filterChannelsByType(
  channels: ChannelInfo[], 
  type: 'text' | 'voice' | 'video'
): ChannelInfo[] {
  return channels.filter(channel => channel.channel_type === type);
}

/**
 * Check if channel is a direct message
 */
export function isDirectMessage(channel: ChannelInfo): boolean {
  return channel.name.startsWith('DM with') || 
         channel.name.startsWith('dm-') ||
         channel.max_members === 2;
}

/**
 * Get channel display name (handles DM naming)
 */
export function getChannelDisplayName(channel: ChannelInfo, _currentUserId: string): string {
  if (isDirectMessage(channel)) {
    // For DMs, show the other person's name
    if (channel.name.startsWith('DM with ')) {
      return channel.name.replace('DM with ', '');
    }
    return channel.name;
  }
  
  return channel.name;
}

/**
 * Get channel icon name for Lucide icons
 */
export function getChannelIcon(channel: ChannelInfo): string {
  if (isDirectMessage(channel)) {
    return 'user'; // Person icon for DMs
  }
  
  switch (channel.channel_type) {
    case 'text':
      return 'hash';
    case 'voice':
      return 'volume-2';
    case 'video':
      return 'video';
    default:
      return 'hash';
  }
}

/**
 * Check if user can access channel
 */
export function canAccessChannel(channel: ChannelInfo): boolean {
  if (channel.is_private) {
    return channel.can_join || channel.user_role !== undefined;
  }
  return true;
}

// ===== SYSTEM MESSAGE UTILITIES =====

/**
 * Parse system message metadata
 */
export function parseSystemMessage(message: TextMessage): SystemMessageData | null {
  if (message.message_type !== 'system') return null;
  
  try {
    const metadata = JSON.parse(message.metadata);
    return metadata as SystemMessageData;
  } catch {
    return null;
  }
}

/**
 * Format system message for display
 */
export function formatSystemMessage(message: TextMessage): string {
  const systemData = parseSystemMessage(message);
  if (!systemData) return message.content;
  
  switch (systemData.message_type) {
    case 'process_started':
      return `${systemData.actor_name} started a process`;
    
    case 'process_stopped':
      return `${systemData.actor_name} stopped a process`;
    
    case 'code_generated':
      return `${systemData.actor_name} generated a share code`;
    
    case 'user_joined':
      return `${systemData.actor_name} joined the channel`;
    
    case 'user_left':
      return `${systemData.actor_name} left the channel`;
    
    case 'channel_created':
      return `${systemData.actor_name} created this channel`;
    
    case 'port_shared':
      return `${systemData.actor_name} shared a port`;
    
    case 'terminal_session_started':
      return `${systemData.actor_name} started a terminal session`;
    
    default:
      return message.content;
  }
}

// ===== SEARCH AND FILTERING =====

/**
 * Search messages by content
 */
export function searchMessages(
  messages: TextMessage[],
  query: string
): TextMessage[] {
  if (!query.trim()) return messages;
  
  const searchTerm = query.toLowerCase().trim();
  
  return messages.filter(message => {
    // Skip deleted messages
    if (message.is_deleted) return false;
    
    // Search content
    if (message.content.toLowerCase().includes(searchTerm)) return true;
    
    // Search author name
    const authorName = getMessageAuthorName(message).toLowerCase();
    if (authorName.includes(searchTerm)) return true;
    
    return false;
  });
}

/**
 * Filter messages by type
 */
export function filterMessagesByType(
  messages: TextMessage[],
  types: string[]
): TextMessage[] {
  return messages.filter(message => types.includes(message.message_type));
}

/**
 * Get messages from specific user
 */
export function getMessagesFromUser(
  messages: TextMessage[],
  userId: string
): TextMessage[] {
  return messages.filter(message => message.user_id === userId);
}

// ===== PAGINATION UTILITIES =====

/**
 * Get messages for a specific page
 */
export function paginateMessages(
  messages: TextMessage[],
  page: number,
  pageSize: number = 50
): TextMessage[] {
  const startIndex = page * pageSize;
  const endIndex = startIndex + pageSize;
  return messages.slice(startIndex, endIndex);
}

/**
 * Get total pages for message list
 */
export function getTotalPages(
  totalMessages: number,
  pageSize: number = 50
): number {
  return Math.ceil(totalMessages / pageSize);
}

// ===== VALIDATION UTILITIES =====

/**
 * Validate message content
 */
export function validateMessageContent(content: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!content || !content.trim()) {
    errors.push('Message cannot be empty');
  }
  
  if (content.length > 2000) {
    errors.push('Message too long (max 2000 characters)');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate channel name
 */
export function validateChannelName(name: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!name || !name.trim()) {
    errors.push('Channel name cannot be empty');
  }
  
  if (name.length > 100) {
    errors.push('Channel name too long (max 100 characters)');
  }
  
  if (!/^[a-zA-Z0-9_-\s]+$/.test(name)) {
    errors.push('Channel name contains invalid characters');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// ===== MESSAGE THREADING =====

/**
 * Group messages into threads (replies)
 */
export function groupMessagesIntoThreads(messages: TextMessage[]): Map<string, TextMessage[]> {
  const threads = new Map<string, TextMessage[]>();
  
  messages.forEach(message => {
    if (message.reply_to_id) {
      // This is a reply
      if (!threads.has(message.reply_to_id)) {
        threads.set(message.reply_to_id, []);
      }
      threads.get(message.reply_to_id)!.push(message);
    }
  });
  
  return threads;
}

/**
 * Get thread for a specific message
 */
export function getMessageThread(
  messages: TextMessage[],
  messageId: string
): TextMessage[] {
  return messages.filter(m => m.reply_to_id === messageId);
}

// ===== UTILITY EXPORTS =====

export {
  type MessageWithReactions,
  type ChannelWithUnreadCount,
  type SystemMessageData
};