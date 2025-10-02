// src/types/p2p.ts - Updated for grid-based P2P with media support

export type P2PSessionState =
  | 'Idle'
  | 'Inviting'
  | 'Connecting'
  | 'Connected'
  | 'Disconnected'
  | 'Failed';

// UPDATED: Enhanced P2PSession with media capabilities
export type P2PSession = {
  sessionId: string;
  peerUserId: string;
  peerDisplayName?: string;
  gridId: string; // Grid context for the session
  state: P2PSessionState;
  lastError?: string;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
  
  // NEW: Media-related fields
  hasMediaSession?: boolean;
  mediaConnected?: boolean;
  hasAudio?: boolean;
  hasVideo?: boolean;
  hasScreenShare?: boolean;
  mediaQuality?: 'low' | 'medium' | 'high' | 'auto';
  participantCount?: number;
};

// ---- Event payloads from Tauri side ----

export type SessionInviteReceivedPayload = {
  from_user_id: string;
  from_display_name?: string;
  grid_id: string; // Grid context
};

export type SessionStateChangedPayload = {
  session_id: string;
  peer_user_id: string;
  grid_id: string; // Grid context
  state: P2PSessionState;
  error_message?: string;
  
  // NEW: Media state in session events
  media_connected?: boolean;
  has_audio?: boolean;
  has_video?: boolean;
  has_screen_share?: boolean;
};

// NEW: Media-specific event payloads
export type MediaSessionInitializedPayload = {
  session_id: string;
  media_enabled: boolean;
};

export type MediaTrackAddedPayload = {
  session_id: string;
  track_id: string;
  kind: 'audio' | 'video';
  enabled: boolean;
  user_id?: string;
};

export type MediaTrackRemovedPayload = {
  session_id: string;
  track_id: string;
  user_id?: string;
};

export type VideoTrackReplacedPayload = {
  session_id: string;
  old_track_id: string;
  new_track_id: string;
  user_id?: string;
};

export type RemoteMediaTrackPayload = {
  session_id: string;
  user_id: string;
  track_id: string;
  kind: 'audio' | 'video';
  stream_id: string;
  enabled: boolean;
};

export type MediaConnectionChangedPayload = {
  session_id: string;
  connected: boolean;
  quality?: string;
};

export type RemoteMediaStateChangedPayload = {
  session_id: string;
  user_id: string;
  track_id: string;
  enabled: boolean;
};

export type RemoteQualityChangedPayload = {
  session_id: string;
  user_id: string;
  quality_preset: string;
};

// ---- Grid types (unchanged) ----

export type Grid = {
  id: string;
  name: string;
  description?: string;
  creator_id: string;
  grid_type?: string;
  max_members: number;
  member_count: number;
  user_role: string; // "owner", "admin", "member"
  is_public: boolean;
  invite_code?: string;
  created_at: string;
  updated_at: string;
};

export type GridMember = {
  user_id: string;
  username?: string;
  display_name?: string;
  role: string;
  joined_at: string;
  is_online: boolean;
  
  // NEW: Media presence
  in_call?: boolean;
  has_audio?: boolean;
  has_video?: boolean;
  is_speaking?: boolean;
};

export type GridInvitation = {
  grid_id: string;
  grid_name: string;
  grid_description?: string;
  inviter_name?: string;
  invited_at: string;
};

// ---- WebSocket message types for grids ----

export type GridInvitePayload = {
  grid_id: string;
  to_user_id: string;
};

export type GridJoinedPayload = {
  grid_id: string;
  user_id: string;
};

export type GridMemberPresencePayload = {
  grid_id: string;
  user_id: string;
  is_online: boolean;
  
  // NEW: Media presence updates
  in_call?: boolean;
  has_audio?: boolean;
  has_video?: boolean;
  is_speaking?: boolean;
};

// NEW: Media-specific WebSocket messages
export type MediaInvitePayload = {
  grid_id: string;
  session_id: string;
  from_user_id: string;
  to_user_id: string;
  media_type: 'audio' | 'video' | 'screen';
};

export type MediaAnswerPayload = {
  grid_id: string;
  session_id: string;
  from_user_id: string;
  to_user_id: string;
  accepted: boolean;
};

// NEW: Enhanced P2P session info for API responses
export type P2PSessionInfo = {
  session_id: string;
  peer_user_id: string;
  peer_display_name?: string;
  grid_id: string;
  state: P2PSessionState;
  created_at: number;
  updated_at: number;
  
  // Media information
  media_session?: {
    enabled: boolean;
    connected: boolean;
    has_audio: boolean;
    has_video: boolean;
    has_screen_share: boolean;
    quality_preset: string;
    participant_count: number;
  };
  
  // Connection information
  connection_info?: {
    ice_connection_state: string;
    peer_connection_state: string;
    signaling_state: string;
  };
};