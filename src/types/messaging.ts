// Create this as src/types/messaging.ts

export interface TextMessage {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  message_type: 'text' | 'system' | 'file' | 'code_share';
  reply_to_id?: string;
  metadata: string; // JSON string
  is_edited: boolean;
  edited_at?: string;
  is_deleted: boolean;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
  // Joined fields from user table
  username?: string;
  display_name?: string;
}

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
  // Joined fields
  username?: string;
  display_name?: string;
}

export interface ChannelInfo {
  id: string;
  grid_id: string;
  channel_type: 'text' | 'voice' | 'video';
  name: string;
  description?: string;
  created_by: string;
  is_private: boolean;
  max_members?: number;
  member_count: number;
  user_role?: string;
  can_join: boolean;
  requires_code: boolean;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ChannelMember {
  user_id: string;
  username?: string;
  display_name?: string;
  role: 'member' | 'moderator';
  joined_at: string;
  is_online: boolean;
}

export interface DirectMessageChannel {
  id: string;
  grid_id: string;
  user1_id: string;
  user2_id: string;
  channel_id: string;
  created_at: string;
  updated_at: string;
}

export interface TypingIndicator {
  channel_id: string;
  user_id: string;
  is_typing: boolean;
  timestamp: string;
}

// ===== USER SEARCH TYPES =====

export interface UserSearchResult {
  user_id: string;
  username?: string;
  display_name?: string;
  is_online: boolean;
}

export interface SearchUsersRequest {
  query: string;
  limit?: number;
}

export interface SearchUsersResponse {
  users: UserSearchResult[];
  total: number;
}

// ===== API REQUEST/RESPONSE TYPES =====

// Channel Management
export interface CreateChannelRequest {
  name: string;
  description?: string;
  is_private?: boolean;
  max_members?: number;
  channel_type?: 'text' | 'voice' | 'video';
  metadata?: Record<string, any>;
}

// Keep this as an alias for backward compatibility
export type CreateTextChannelRequest = CreateChannelRequest;

export interface CreateDirectMessageRequest {
  target_user_id: string;
}

export interface CreateDirectMessageResponse {
  channel: ChannelInfo;
  existed_before: boolean;
}

export interface ChannelListResponse {
  channels: ChannelInfo[];
  total: number;
}

export interface ChannelDetailsResponse {
  channel: ChannelInfo;
  members: ChannelMember[];
}

// Text Messages
export interface SendMessageRequest {
  content: string;
  message_type?: string;
  reply_to_id?: string;
  metadata?: string;
}

export interface SendMessageResponse {
  message: TextMessage;
  success: boolean;
}

export interface GetMessagesRequest {
  limit?: number;
  before?: string; // message ID for cursor pagination
  after?: string;  // message ID for loading newer
  message_id?: string; // load around specific message
}

export interface GetMessagesResponse {
  messages: TextMessage[];
  has_more: boolean;
  oldest_id?: string;
  newest_id?: string;
  total_count: number;
}

export interface EditMessageRequest {
  content: string;
  metadata?: string;
}

export interface DeleteMessageRequest {
  reason?: string;
}

// Reactions
export interface AddReactionRequest {
  emoji: string;
}

export interface RemoveReactionRequest {
  emoji: string;
}

// Typing Indicators
export interface SetTypingIndicatorRequest {
  is_typing: boolean;
}

// ===== WEBSOCKET MESSAGE PAYLOADS =====

export interface TextMessagePayload {
  channel_id: string;
  message: TextMessage;
}

export interface MessageEditedPayload {
  channel_id: string;
  message: TextMessage;
  edited_by: string;
}

export interface MessageDeletedPayload {
  channel_id: string;
  message_id: string;
  deleted_by: string;
  reason?: string;
}

export interface MessageReactionPayload {
  channel_id: string;
  message_id: string;
  reaction: MessageReaction;
  action: 'added' | 'removed';
}

export interface TypingIndicatorPayload {
  channel_id: string;
  user_id: string;
  username?: string;
  is_typing: boolean;
}

// ===== SYSTEM MESSAGES =====

export interface SystemMessageData {
  message_type: string; // "process_started", "process_stopped", "code_generated", etc.
  actor_id: string;
  actor_name: string;
  resource_id?: string;
  details?: Record<string, any>;
}

// ===== CLIENT STATE TYPES =====

export interface MessagingState {
  // Channel data
  channels: Record<string, ChannelInfo[]>; // grid_id -> channels
  channel_members: Record<string, ChannelMember[]>; // channel_id -> members
  direct_messages: Record<string, DirectMessageChannel[]>; // grid_id -> DM channels
  
  // Message data
  messages: Record<string, TextMessage[]>; // channel_id -> messages
  message_reactions: Record<string, MessageReaction[]>; // message_id -> reactions
  
  // Real-time state
  typing_indicators: Record<string, TypingIndicator[]>; // channel_id -> typing users
  last_read_message: Record<string, string>; // channel_id -> last_read_message_id
  
  // Pagination cursors
  pagination_cursors: Record<string, MessagePaginationCursor>; // channel_id -> cursor
  
  last_updated: Record<string, number>; // channel_id -> timestamp
  websocket_connected: boolean;
}

export interface MessagePaginationCursor {
  oldest_message_id?: string;
  newest_message_id?: string;
  has_more_older: boolean;
  has_more_newer: boolean;
  total_count: number;
}

// ===== FILE ATTACHMENT SUPPORT =====

export interface MessageFile {
  id: string;
  name: string;
  size: number;
  mime_type: string;
  url: string; // P2P share URL or download link
  hash: string; // File hash for integrity
}

// ===== MESSAGE SEARCH =====

export interface SearchMessagesRequest {
  query: string;
  channel_id?: string;
  user_id?: string;
  before?: string; // ISO timestamp
  after?: string;  // ISO timestamp
  limit?: number;
}

export interface SearchMessagesResponse {
  messages: TextMessage[];
  total: number;
  has_more: boolean;
}

// ===== UTILITY TYPES =====

export interface MessageWithReactions extends TextMessage {
  reactions: MessageReaction[];
  reaction_counts: Record<string, number>; // emoji -> count
  user_reactions: string[]; // emojis the current user has reacted with
}

export interface ChannelWithUnreadCount extends ChannelInfo {
  unread_count: number;
  last_message?: TextMessage;
  has_mentions: boolean;
}

export interface MessageThread {
  parent_message: TextMessage;
  replies: TextMessage[];
  reply_count: number;
  last_reply_at?: string;
}

// ===== HOOK RETURN TYPES =====

export interface UseMessagingReturn {
  // State
  channels: ChannelInfo[];
  messages: TextMessage[];
  typingUsers: TypingIndicator[];
  loading: boolean;
  error: string | null;
  
  // Channel operations
  createChannel: (request: CreateTextChannelRequest) => Promise<ChannelInfo>;
  createDirectMessage: (targetUserId: string) => Promise<CreateDirectMessageResponse>;
  joinChannel: (channelId: string) => Promise<void>;
  leaveChannel: (channelId: string) => Promise<void>;
  
  // Message operations
  sendMessage: (content: string, options?: Partial<SendMessageRequest>) => Promise<TextMessage>;
  editMessage: (messageId: string, content: string, metadata?: string) => Promise<TextMessage>;
  deleteMessage: (messageId: string, reason?: string) => Promise<void>;
  loadMoreMessages: (direction: 'older' | 'newer') => Promise<void>;
  
  // Reactions
  addReaction: (messageId: string, emoji: string) => Promise<void>;
  removeReaction: (messageId: string, emoji: string) => Promise<void>;
  
  // Typing indicators
  setTyping: (isTyping: boolean) => Promise<void>;
  
  // Utilities
  refreshChannel: () => Promise<void>;
  clearMessages: () => void;
}

export interface UseChannelsReturn {
  // State
  channels: ChannelInfo[];
  loading: boolean;
  error: string | null;
  
  // Operations
  createChannel: (request: CreateTextChannelRequest) => Promise<ChannelInfo>; // This will now support all channel types
  joinChannel: (channelId: string) => Promise<void>;
  leaveChannel: (channelId: string) => Promise<void>;
  refreshChannels: () => Promise<void>;
  
  // Utilities
  getChannelById: (channelId: string) => ChannelInfo | undefined;
  getTextChannels: () => ChannelInfo[];
  getVoiceChannels: () => ChannelInfo[];
  getDirectMessages: () => ChannelInfo[];
}

export interface UseMessagesReturn {
  // State
  messages: TextMessage[];
  loading: boolean;
  error: string | null;
  hasMoreOlder: boolean;
  hasMoreNewer: boolean;
  
  // Operations
  sendMessage: (content: string, options?: Partial<SendMessageRequest>) => Promise<TextMessage>;
  editMessage: (messageId: string, content: string) => Promise<TextMessage>;
  deleteMessage: (messageId: string, reason?: string) => Promise<void>;
  loadMoreMessages: (direction: 'older' | 'newer') => Promise<void>;
  
  // Utilities
  getMessageById: (messageId: string) => TextMessage | undefined;
  refreshMessages: () => Promise<void>;
  clearMessages: () => void;
}

// Voice channel specific types
export interface VoiceJoinResponse {
  session_id: string;
  participants: VoiceParticipant[];
  routing_info: VoiceRoutingInfo;
}

export interface VoiceParticipant {
  user_id: string;
  username?: string;
  display_name?: string;
  is_speaking: boolean;
  is_muted: boolean;
  audio_enabled: boolean;
}

export interface VoiceRoutingInfo {
  session_type: 'mesh' | 'sfu';
  required_connections?: string[];
  max_participants: number;
}

export interface VoiceChannelStatus {
  channel_id: string;
  is_connected: boolean;
  participant_count: number;
  participants: VoiceParticipant[];
  session_id?: string;
}

export interface CreateVoiceChannelRequest {
  name: string;
  description?: string;
  is_private?: boolean;
  max_members?: number;
  
  // Voice-specific settings
  auto_routing_threshold?: number;
  default_quality?: 'low' | 'medium' | 'high' | 'auto';
  push_to_talk_default?: boolean;
  noise_suppression?: boolean;
  echo_cancellation?: boolean;
  auto_gain_control?: boolean;
  voice_activation_threshold?: number;
  allow_guest_participants?: boolean;
  max_session_duration_minutes?: number;
  recording_enabled?: boolean;
}

// Voice channel settings
export interface VoiceChannelSettings {
  channel_id: string;
  auto_routing_threshold?: number;
  default_quality?: string;
  push_to_talk_default?: boolean;
  noise_suppression?: boolean;
  echo_cancellation?: boolean;
  auto_gain_control?: boolean;
  voice_activation_threshold?: number;
  allow_guest_participants?: boolean;
  max_session_duration_minutes?: number;
  recording_enabled?: boolean;
  created_at: string;
  updated_at: string;
}

// Voice participant information
export interface VoiceParticipant {
  user_id: string;
  username?: string;
  display_name?: string;
  is_speaking: boolean;
  is_muted: boolean;
  is_deafened: boolean;
  audio_quality: string;
  connection_state: 'connecting' | 'connected' | 'disconnected';
  joined_at: string;
}

// Voice session responses
export interface VoiceJoinResponse {
  session_id: string;
  participants: VoiceParticipant[];
  routing_info: VoiceRoutingInfo;
}

export interface VoiceRoutingInfo {
  session_type: 'mesh' | 'sfu';
  required_connections?: string[];
  max_participants: number;
}

export interface VoiceChannelStatus {
  channel_id: string;
  is_connected: boolean;
  participant_count: number;
  participants: VoiceParticipant[];
  session_id?: string;
}

// Update the UseChannelsReturn interface to include separated functions
export interface UseChannelsReturn {
  // State
  channels: ChannelInfo[];
  loading: boolean;
  error: string | null;
  
  // Separated channel creation operations
  createTextChannel: (request: CreateChannelRequest) => Promise<ChannelInfo>;
  createVoiceChannel: (request: CreateVoiceChannelRequest) => Promise<ChannelInfo>;
  
  // Generic operations
  joinChannel: (channelId: string) => Promise<void>;
  leaveChannel: (channelId: string) => Promise<void>;
  refreshChannels: () => Promise<void>;
  
  // Direct messages
  createDirectMessage: (targetUserId: string) => Promise<CreateDirectMessageResponse>;
  
  // Utilities
  getChannelById: (channelId: string) => ChannelInfo | undefined;
  getTextChannels: () => ChannelInfo[];
  getVoiceChannels: () => ChannelInfo[];
  getDirectMessages: () => ChannelInfo[];
  getSortedChannels: () => ChannelInfo[];
  getAccessibleChannels: () => ChannelInfo[];
}