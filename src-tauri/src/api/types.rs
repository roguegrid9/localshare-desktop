use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use serde_json::Value;

// Request/Response types for coordinator API
#[derive(Debug, Serialize, Deserialize)]
pub struct TokenRequest {
    pub user_handle: String,
    pub display_name: String,
    pub account_type: Option<String>, // "guest" or "authenticated"
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenResponse {
    pub token: String,
    pub user_id: String,
    pub expires_in: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PromotionRequest {
    pub supabase_access_token: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PromotionResponse {
    pub status: String,
    pub message: String,
    pub token: String,
    pub user_info: Option<PromotedUserInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PromotedUserInfo {
    pub user_id: String,
    pub email: String,
    pub display_name: String,
    pub provider: String,
    pub is_provisional: bool,
}

// Client state types
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserState {
    pub is_authenticated: bool,
    pub is_provisional: bool,
    pub user_id: Option<String>,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub developer_handle: Option<String>,
    pub connection_status: String,
    pub token_expires_at: Option<u64>,
    pub account_type: Option<String>,
}

impl Default for UserState {
    fn default() -> Self {
        Self {
            is_authenticated: false,
            is_provisional: false,
            user_id: None,
            username: None,
            display_name: None,
            developer_handle: None,
            connection_status: "disconnected".to_string(),
            token_expires_at: None,
            account_type: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserSessionResult {
    pub token: String,
    pub user_id: String,
    pub expires_in: u64,
    pub display_name: String,
    pub account_type: String, // "guest" or "authenticated"
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectionStatus {
    pub status: String,
    pub last_ping: Option<u64>,
    pub coordinator_url: String,
}

// Grid API types (replaces friends)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Grid {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub creator_id: String,
    pub grid_type: Option<String>,
    pub max_members: u32,
    pub member_count: u32,
    pub user_role: String, // "owner", "admin", "member"
    pub is_public: bool,
    pub invite_code: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GridMember {
    pub user_id: String,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub role: String,
    pub joined_at: String,
    pub is_online: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GridInvitation {
    pub grid_id: String,
    pub grid_name: String,
    pub grid_description: Option<String>,
    pub inviter_name: Option<String>,
    pub invited_at: String,
}

// Grid API request/response types
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateGridRequest {
    pub name: String,
    pub description: Option<String>,
    pub grid_type: Option<String>,
    pub max_members: Option<u32>,
    pub is_public: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateGridResponse {
    pub grid: Grid,
    pub invite_code: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetMyGridsResponse {
    pub grids: Vec<Grid>,
    pub total: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InviteToGridRequest {
    pub user_id: Option<String>,
    pub username: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JoinGridRequest {
    pub invite_code: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GridDetailsResponse {
    pub grid: Grid,
    pub members: Vec<GridMember>,
}

// User search types
#[derive(Debug, Serialize, Deserialize)]
pub struct SearchUsersRequest {
    pub query: String,
    pub limit: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserSearchResult {
    pub user_id: String,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub is_online: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchUsersResponse {
    pub users: Vec<UserSearchResult>,
    pub total: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateUsernameRequest {
    pub username: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CheckUsernameAvailabilityResponse {
    pub available: bool,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PromotionRequestWithUsername {
    pub supabase_access_token: String,
    pub username: Option<String>,
}

// WebSocket message types
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WebSocketMessage {
    pub r#type: String, // "type" is a keyword in Rust
    pub payload: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PresenceEvent {
    pub user_id: String,
    pub grid_id: String, // Grid context for presence
}

// Grid-related WebSocket message types
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GridInvitePayload {
    pub grid_id: String,
    pub to_user_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GridJoinedPayload {
    pub grid_id: String,
    pub user_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GridMemberPresencePayload {
    pub grid_id: String,
    pub user_id: String,
    pub is_online: bool,
}

// Enhanced grids state
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GridsState {
    pub grids: Vec<Grid>,
    pub grid_members: std::collections::HashMap<String, Vec<GridMember>>,
    pub pending_invitations: Vec<GridInvitation>,
    pub last_updated: Option<u64>,
    pub websocket_connected: bool,
}

// P2P Session message types - Updated for grid context
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SessionInvitePayload {
    pub to_user_id: String,
    pub grid_id: String, // Grid context
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SessionAcceptPayload {
    pub to_user_id: String,
    pub grid_id: String, // Grid context
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WebRTCSignalPayload {
    pub to_user_id: String,
    pub grid_id: String, // Grid context
    pub signal_data: serde_json::Value,
}

// P2P Session state types
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum SessionState {
    Idle,
    Inviting,
    Connecting,
    Connected,
    Disconnected,
    Failed,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct P2PSessionInfo {
    pub session_id: String,
    pub peer_user_id: String,
    pub grid_id: String, // Grid context
    pub state: SessionState,
    pub is_host: bool,
    pub created_at: u64, // timestamp
}

// Events for frontend - Updated for grid context
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SessionInviteEvent {
    pub from_user_id: String,
    pub from_display_name: Option<String>,
    pub grid_id: String, // Grid context
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SessionStateEvent {
    pub session_id: String,
    pub peer_user_id: String,
    pub grid_id: String, // Grid context
    pub state: SessionState,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct GridSessionStatus {
    pub grid_id: String,
    pub session_state: String, // "inactive", "hosted", "orphaned", "restoring"
    pub current_host_id: Option<String>,
    pub host_last_seen: Option<String>,
    pub session_metadata: HashMap<String, Value>,
    pub host_display_name: Option<String>,
    pub host_username: Option<String>,
}

// Add these permission-related types to your types.rs file

// Grid Permission Types
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GridPermissions {
    // Member management
    pub can_invite: bool,
    pub can_kick: bool,
    pub can_ban: bool,
    pub can_manage_roles: bool,

    // Process management
    pub can_create_process: bool,
    pub can_view_all_processes: bool,
    pub can_connect_to_processes: bool,
    pub can_manage_own_processes: bool,
    pub can_manage_all_processes: bool,
    pub can_view_logs: bool,
    pub can_send_commands: bool,

    // Grid management
    pub can_modify_settings: bool,
    pub can_delete_grid: bool,
    pub can_view_invite_code: bool,
    pub can_view_audit_log: bool,

    // Limits
    pub max_processes: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProcessPermissions {
    pub can_view: bool,
    pub can_connect: bool,
    pub can_view_logs: bool,
    pub can_send_commands: bool,
    pub can_restart: bool,
    pub can_modify_settings: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GridSettings {
    pub allow_member_invite: Option<bool>,
    pub allow_member_kick: Option<bool>,
    pub require_approval_for_invite: Option<bool>,
    pub allow_member_create_process: Option<bool>,
    pub allow_member_view_all_processes: Option<bool>,
    pub allow_member_connect_to_processes: Option<bool>,
    pub max_processes_per_member: Option<i32>,
    pub require_process_approval: Option<bool>,
    pub allow_external_connections: Option<bool>,
    pub audit_process_access: Option<bool>,
    pub allow_member_view_logs: Option<bool>,
    pub allow_member_send_commands: Option<bool>,
    pub auto_backup_processes: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateGridSettingsRequest {
    pub allow_member_invite: Option<bool>,
    pub allow_member_kick: Option<bool>,
    pub require_approval_for_invite: Option<bool>,
    pub allow_member_create_process: Option<bool>,
    pub allow_member_view_all_processes: Option<bool>,
    pub allow_member_connect_to_processes: Option<bool>,
    pub max_processes_per_member: Option<i32>,
    pub require_process_approval: Option<bool>,
    pub allow_external_connections: Option<bool>,
    pub audit_process_access: Option<bool>,
    pub allow_member_view_logs: Option<bool>,
    pub allow_member_send_commands: Option<bool>,
    pub auto_backup_processes: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateMemberPermissionsRequest {
    pub can_invite: Option<bool>,
    pub can_kick: Option<bool>,
    pub can_create_process: Option<bool>,
    pub can_view_all_processes: Option<bool>,
    pub can_connect_to_processes: Option<bool>,
    pub can_view_logs: Option<bool>,
    pub can_send_commands: Option<bool>,
    pub can_manage_grid_settings: Option<bool>,
    pub max_processes: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GridAuditLogEntry {
    pub id: String,
    pub grid_id: String,
    pub user_id: String,
    pub action: String,
    pub resource_type: String,
    pub resource_id: String,
    pub details: String, // JSON string
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub timestamp: String,
    pub username: Option<String>,
    pub display_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetAuditLogRequest {
    pub limit: Option<i32>,
    pub offset: Option<i32>,
    pub action: Option<String>,
    pub user_id: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetAuditLogResponse {
    pub entries: Vec<GridAuditLogEntry>,
    pub total: i32,
}

// Enhanced Grid type with permissions
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GridWithPermissions {
    pub grid: Grid,
    pub permissions: GridPermissions,
    pub settings: Option<GridSettings>,
}

// Permission checking result
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PermissionCheckResult {
    pub allowed: bool,
    pub reason: Option<String>,
}

// Add these types to the end of your existing types.rs file

// ===== RESOURCE CODE SYSTEM TYPES =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceAccessCode {
    pub id: String,
    pub grid_id: String,
    pub resource_type: ResourceType,
    pub resource_id: String,
    pub access_code: String,
    pub code_name: Option<String>,
    pub created_by: String,
    pub expires_at: Option<String>,
    pub usage_limit: i32,
    pub used_count: i32,
    pub permissions: serde_json::Value,
    pub metadata: serde_json::Value,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
    pub creator_display_name: Option<String>,
    pub resource_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum ResourceType {
    #[serde(rename = "grid_invite")]
    GridInvite,
    #[serde(rename = "process")]
    Process,
    #[serde(rename = "channel_voice")]
    ChannelVoice,
    #[serde(rename = "channel_text")]
    ChannelText,
    #[serde(rename = "channel_video")]
    ChannelVideo,
    #[serde(rename = "file")]
    File,
    #[serde(rename = "terminal")]
    Terminal,
    #[serde(rename = "backup")]
    Backup,
}

// Request/Response Types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateCodeRequest {
    pub resource_type: ResourceType,
    pub resource_id: String,
    pub code_name: Option<String>,
    pub expiry_minutes: Option<i32>,
    pub usage_limit: Option<i32>,
    pub permissions: Option<serde_json::Value>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateCodeResponse {
    pub code: ResourceAccessCode,
    pub shareable_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UseCodeRequest {
    pub access_code: String,
    pub resource_type: Option<ResourceType>,
    pub resource_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UseCodeResponse {
    pub success: bool,
    pub message: String,
    pub granted_permissions: Option<serde_json::Value>,
    pub resource_info: Option<serde_json::Value>,
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListCodesRequest {
    pub resource_type: Option<ResourceType>,
    pub resource_id: Option<String>,
    pub active_only: Option<bool>,
    pub limit: Option<i32>,
    pub offset: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListCodesResponse {
    pub codes: Vec<ResourceAccessCode>,
    pub total: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeUsageAuditEntry {
    pub id: String,
    pub code_id: String,
    pub used_by: String,
    pub success: bool,
    pub failure_reason: Option<String>,
    pub used_at: String,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub granted_permissions: serde_json::Value,
    pub session_id: Option<String>,
    pub user_display_name: Option<String>,
    pub code_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeUsageHistoryRequest {
    pub limit: Option<i32>,
    pub offset: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeUsageHistoryResponse {
    pub entries: Vec<CodeUsageAuditEntry>,
    pub total: i32,
}

// Convenience Types for Specific Resources
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessCodeOptions {
    pub code_name: Option<String>,
    pub expiry_minutes: Option<i32>,
    pub usage_limit: Option<i32>,
    pub can_view: Option<bool>,
    pub can_connect: Option<bool>,
    pub can_send_commands: Option<bool>,
    pub can_restart: Option<bool>,
    pub can_view_logs: Option<bool>,
    pub session_duration_minutes: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProcessInfo {
    pub process_id: String,
    pub grid_id: String,
    pub status: ProcessStatus,
    pub config: ProcessConfig,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProcessStatus {
    pub state: String, // "Running", "Starting", "Stopped", "Failed"
    pub pid: Option<u32>,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProcessConfig {
    pub executable_path: String,
    pub args: Vec<String>,
    pub env_vars: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GridInviteCodeOptions {
    pub code_name: Option<String>,
    pub expiry_minutes: Option<i32>,
    pub usage_limit: Option<i32>,
    pub role: Option<String>,
    pub auto_approve: Option<bool>,
    pub welcome_message: Option<String>,
    pub skip_onboarding: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelCodeOptions {
    pub code_name: Option<String>,
    pub expiry_minutes: Option<i32>,
    pub usage_limit: Option<i32>,
    pub can_join: Option<bool>,
    pub can_speak: Option<bool>,
    pub can_moderate: Option<bool>,
    pub can_screen_share: Option<bool>,
    pub can_record: Option<bool>,
    pub session_duration_minutes: Option<i32>,
}

// WebSocket Event Types for Resource Codes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeGeneratedEvent {
    pub grid_id: String,
    pub code: ResourceAccessCode,
    pub generated_by: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeUsedEvent {
    pub grid_id: String,
    pub code_id: String,
    pub used_by: String,
    pub resource_type: ResourceType,
    pub resource_id: String,
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeRevokedEvent {
    pub grid_id: String,
    pub code_id: String,
    pub revoked_by: String,
}

// Resource Code State
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeState {
    pub grid_codes: HashMap<String, Vec<ResourceAccessCode>>,
    pub my_codes: HashMap<String, ResourceAccessCode>,
    pub usage_history: HashMap<String, Vec<CodeUsageAuditEntry>>,
    pub last_updated: HashMap<String, u64>,
}


#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TextMessage {
    pub id: String,
    pub channel_id: String,
    pub user_id: String,
    pub content: String,
    pub message_type: String, // "text", "system", "file", "code_share"
    pub reply_to_id: Option<String>,
    pub metadata: String, // JSON string
    pub is_edited: bool,
    pub edited_at: Option<String>,
    pub is_deleted: bool,
    pub deleted_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    // Joined fields from user table
    pub username: Option<String>,
    pub display_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MessageReaction {
    pub id: String,
    pub message_id: String,
    pub user_id: String,
    pub emoji: String,
    pub created_at: String,
    // Joined fields
    pub username: Option<String>,
    pub display_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ChannelInfo {
    pub id: String,
    pub grid_id: String,
    pub channel_type: String, // "text", "voice", "video"
    pub name: String,
    pub description: Option<String>,
    pub created_by: String,
    pub is_private: bool,
    pub max_members: Option<i32>,
    pub member_count: i32,
    pub user_role: Option<String>,
    pub can_join: bool,
    pub requires_code: bool,
    pub metadata: HashMap<String, Value>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChannelMember {
    pub user_id: String,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub role: String, // "member", "moderator"
    pub joined_at: String,
    pub is_online: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DirectMessageChannel {
    pub id: String,
    pub grid_id: String,
    pub user1_id: String,
    pub user2_id: String,
    pub channel_id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TypingIndicator {
    pub channel_id: String,
    pub user_id: String,
    pub is_typing: bool,
    pub timestamp: String,
}

// ===== API REQUEST/RESPONSE TYPES =====

// Channel Management
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CreateChannelRequest {
    pub name: String,
    pub description: Option<String>,
    pub is_private: Option<bool>,
    pub max_members: Option<i32>,
    pub channel_type: String, // Required field
    pub metadata: Option<HashMap<String, Value>>,
}

// Keep the existing CreateTextChannelRequest and add the alias:
pub type CreateTextChannelRequest = CreateChannelRequest;

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateDirectMessageRequest {
    pub target_user_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateDirectMessageResponse {
    pub channel: ChannelInfo,
    pub existed_before: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChannelListResponse {
    pub channels: Vec<ChannelInfo>,
    pub total: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChannelDetailsResponse {
    pub channel: ChannelInfo,
    pub members: Vec<ChannelMember>,
}

// Text Messages
#[derive(Debug, Serialize, Deserialize)]
pub struct SendMessageRequest {
    pub content: String,
    pub message_type: Option<String>,
    pub reply_to_id: Option<String>,
    pub metadata: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SendMessageResponse {
    pub message: TextMessage,
    pub success: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetMessagesRequest {
    pub limit: Option<i32>,
    pub before: Option<String>, // message ID for cursor pagination
    pub after: Option<String>,  // message ID for loading newer
    pub message_id: Option<String>, // load around specific message
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetMessagesResponse {
    pub messages: Vec<TextMessage>,
    pub has_more: bool,
    pub oldest_id: Option<String>,
    pub newest_id: Option<String>,
    pub total_count: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EditMessageRequest {
    pub content: String,
    pub metadata: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DeleteMessageRequest {
    pub reason: Option<String>,
}

// Reactions
#[derive(Debug, Serialize, Deserialize)]
pub struct AddReactionRequest {
    pub emoji: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RemoveReactionRequest {
    pub emoji: String,
}

// Typing Indicators
#[derive(Debug, Serialize, Deserialize)]
pub struct SetTypingIndicatorRequest {
    pub is_typing: bool,
}

// ===== WEBSOCKET MESSAGE PAYLOADS =====

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TextMessagePayload {
    pub channel_id: String,
    pub message: TextMessage,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MessageEditedPayload {
    pub channel_id: String,
    pub message: TextMessage,
    pub edited_by: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MessageDeletedPayload {
    pub channel_id: String,
    pub message_id: String,
    pub deleted_by: String,
    pub reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MessageReactionPayload {
    pub channel_id: String,
    pub message_id: String,
    pub reaction: MessageReaction,
    pub action: String, // "added" or "removed"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TypingIndicatorPayload {
    pub channel_id: String,
    pub user_id: String,
    pub username: Option<String>,
    pub is_typing: bool,
}

// ===== SYSTEM MESSAGES =====

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemMessageData {
    pub message_type: String, // "process_started", "process_stopped", "code_generated", etc.
    pub actor_id: String,
    pub actor_name: String,
    pub resource_id: Option<String>,
    pub details: Option<HashMap<String, Value>>,
}

// ===== CLIENT STATE TYPES =====

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MessagingState {
    // Channel data
    pub channels: HashMap<String, Vec<ChannelInfo>>, // grid_id -> channels
    pub channel_members: HashMap<String, Vec<ChannelMember>>, // channel_id -> members
    pub direct_messages: HashMap<String, Vec<DirectMessageChannel>>, // grid_id -> DM channels
    
    // Message data
    pub messages: HashMap<String, Vec<TextMessage>>, // channel_id -> messages
    pub message_reactions: HashMap<String, Vec<MessageReaction>>, // message_id -> reactions
    
    // Real-time state
    pub typing_indicators: HashMap<String, Vec<TypingIndicator>>, // channel_id -> typing users
    pub last_read_message: HashMap<String, String>, // channel_id -> last_read_message_id
    
    // Pagination cursors
    pub pagination_cursors: HashMap<String, MessagePaginationCursor>, // channel_id -> cursor
    
    pub last_updated: HashMap<String, u64>, // channel_id -> timestamp
    pub websocket_connected: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MessagePaginationCursor {
    pub oldest_message_id: Option<String>,
    pub newest_message_id: Option<String>,
    pub has_more_older: bool,
    pub has_more_newer: bool,
    pub total_count: i32,
}

impl Default for MessagingState {
    fn default() -> Self {
        Self {
            channels: HashMap::new(),
            channel_members: HashMap::new(),
            direct_messages: HashMap::new(),
            messages: HashMap::new(),
            message_reactions: HashMap::new(),
            typing_indicators: HashMap::new(),
            last_read_message: HashMap::new(),
            pagination_cursors: HashMap::new(),
            last_updated: HashMap::new(),
            websocket_connected: false,
        }
    }
}

// ===== FILE ATTACHMENT SUPPORT =====

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MessageFile {
    pub id: String,
    pub name: String,
    pub size: i64,
    pub mime_type: String,
    pub url: String, // P2P share URL or download link
    pub hash: String, // File hash for integrity
}

// ===== MESSAGE SEARCH =====

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchMessagesRequest {
    pub query: String,
    pub channel_id: Option<String>,
    pub user_id: Option<String>,
    pub before: Option<String>, // ISO timestamp
    pub after: Option<String>,  // ISO timestamp
    pub limit: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchMessagesResponse {
    pub messages: Vec<TextMessage>,
    pub total: i32,
    pub has_more: bool,
}


#[derive(Debug, Deserialize, Serialize)]
pub struct CurrentUserResponse {
    pub user_id: String,
    pub email: String,
    pub username: Option<String>,
    pub display_name: String,
    pub account_type: String,
    pub created_at: String,
    pub updated_at: String,
}

// Also update your existing PromotionResponse to include user_info with username
#[derive(Debug, Deserialize, Serialize)]
pub struct UserInfo {
    pub user_id: String,
    pub email: String,
    pub username: Option<String>,  // Make sure this line exists
    pub display_name: String,
    pub account_type: String,
}

impl Default for CodeState {
    fn default() -> Self {
        Self {
            grid_codes: HashMap::new(),
            my_codes: HashMap::new(),
            usage_history: HashMap::new(),
            last_updated: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VoiceChannelData {
    pub channel_id: String,
    pub grid_id: String, 
    pub channel_name: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VoiceJoinResponse {
    pub session_id: String,
    pub participants: Vec<VoiceParticipant>,
    pub routing_info: VoiceRoutingInfo,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VoiceParticipant {
    pub user_id: String,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub is_speaking: bool,
    pub is_muted: bool,
    pub audio_enabled: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VoiceRoutingInfo {
    pub session_type: String, // "mesh" | "sfu"
    pub required_connections: Option<Vec<String>>,
    pub max_participants: i32,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VoiceChannelStatus {
    pub channel_id: String,
    pub is_connected: bool,
    pub participant_count: i32,
    pub participants: Vec<VoiceParticipant>,
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateVoiceChannelRequest {
    pub name: String,
    pub description: Option<String>,
    pub is_private: Option<bool>,
    pub max_members: Option<i32>,
    
    // Voice-specific settings
    pub auto_routing_threshold: Option<i32>,
    pub default_quality: Option<String>,
    pub push_to_talk_default: Option<bool>,
    pub noise_suppression: Option<bool>,
    pub echo_cancellation: Option<bool>,
    pub auto_gain_control: Option<bool>,
    pub voice_activation_threshold: Option<f64>,
    pub allow_guest_participants: Option<bool>,
    pub max_session_duration_minutes: Option<i32>,
    pub recording_enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceChannelSettings {
    pub channel_id: String,
    pub auto_routing_threshold: Option<i32>,
    pub default_quality: Option<String>,
    pub push_to_talk_default: Option<bool>,
    pub noise_suppression: Option<bool>,
    pub echo_cancellation: Option<bool>,
    pub auto_gain_control: Option<bool>,
    pub voice_activation_threshold: Option<f64>,
    pub allow_guest_participants: Option<bool>,
    pub max_session_duration_minutes: Option<i32>,
    pub recording_enabled: Option<bool>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterContainerRequest {
    pub grid_id: String,
    pub container_id: String,       // Docker container ID
    pub container_name: String,     // User-chosen name
    pub container_type: String,     // "minecraft", "web_server", etc.
    pub image_name: String,
    pub host_machine_id: String,
    pub environment: Option<std::collections::HashMap<String, String>>,
    pub resource_limits: Option<std::collections::HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerProcessResponse {
    pub process_uuid: String,       // RogueGrid9 unique ID
    pub container_id: String,       // Docker container ID  
    pub container_name: String,     // User-chosen name
    pub container_type: String,
    pub image_name: String,
    pub access_address: String,     // rg9://grid-id/container-name
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    
    // Connection tracking
    pub active_connections: i32,
    pub last_activity: Option<String>,
    
    // Owner info
    pub owner_user_id: String,
    pub owner_display_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateContainerStatusRequest {
    pub status: String,
    pub metadata: Option<std::collections::HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListContainersResponse {
    pub containers: Vec<ContainerProcessResponse>,
    pub total: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackConnectionRequest {
    pub connection_type: String,    // "terminal", "file_browser", "application"
    pub p2p_connection_id: String,
    pub action: String,             // "connect" or "disconnect"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerStatsResponse {
    pub total_containers: i32,
    pub running_containers: i32,
    pub active_connections: i32,
    pub idle_containers: i32,
}

// ===== SIMPLIFIED SHARED PROCESS TYPES =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSharedProcessRequest {
    pub name: String,
    pub description: Option<String>,
    pub pid: i32,
    pub port: i32,
    pub command: String,
    pub working_dir: String,
    pub executable_path: String,
    pub process_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSharedProcessResponse {
    pub id: String,
    pub process: SharedProcessData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedProcessData {
    pub id: String,
    pub grid_id: String,
    pub user_id: String,
    pub config: SharedProcessConfig,
    pub status: String,
    pub last_seen_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedProcessConfig {
    pub name: String,
    pub description: Option<String>,
    pub pid: i32,
    pub port: i32,
    pub command: String,
    pub working_dir: String,
    pub executable_path: String,
    pub process_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetGridSharedProcessesResponse {
    pub processes: Vec<SharedProcessData>,
    pub total: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSharedProcessStatusRequest {
    pub status: String,
}

// ===== GRID RELAY TYPES =====

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RelayMode {
    P2pFirst,
    RelayOnly,
    P2pOnly,
}

impl RelayMode {
    pub fn as_str(&self) -> &str {
        match self {
            RelayMode::P2pFirst => "p2p_first",
            RelayMode::RelayOnly => "relay_only",
            RelayMode::P2pOnly => "p2p_only",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GridRelayStatusResponse {
    pub grid_id: String,
    pub relay_mode: String,
    pub allocation: Option<RelayAllocation>,
    pub turn_credentials: Option<TurnCredentials>,
    pub relay_servers: Vec<RelayServer>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayAllocation {
    pub id: String,
    pub purchased_gb: i32,
    pub used_gb: f64,
    pub expires_at: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TurnCredentials {
    pub username: String,
    pub credential: String,
    pub ttl: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayServer {
    pub id: String,
    pub region: String,
    pub urls: Vec<String>,
    pub is_healthy: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateRelayModeRequest {
    pub relay_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportBandwidthUsageRequest {
    pub bytes_sent: i64,
    pub bytes_received: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PurchaseBandwidthRequest {
    pub bandwidth_gb: i32,
    pub duration_months: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentIntentResponse {
    pub payment_intent_id: String,
    pub client_secret: String,
    pub amount: f64,
    pub currency: String,
    pub status: String,
}

