// src/types/codes.ts

export const ResourceType = {
  GridInvite: 'grid_invite',
  Process: 'process',
  ChannelVoice: 'channel_voice',
  ChannelText: 'channel_text',
  ChannelVideo: 'channel_video',
  File: 'file',
  Terminal: 'terminal',
  Backup: 'backup',
} as const;

export type ResourceType = typeof ResourceType[keyof typeof ResourceType];

export interface ResourceAccessCode {
  id: string;
  grid_id: string;
  resource_type: ResourceType;
  resource_id: string;
  access_code: string;
  code_name?: string;
  created_by: string;
  expires_at?: string;
  usage_limit: number;
  used_count: number;
  permissions: Record<string, unknown>; // Changed from any
  metadata: Record<string, unknown>;    // Changed from any
  is_active: boolean;
  created_at: string;
  updated_at: string;
  creator_display_name?: string;
  resource_name?: string;
}

export interface GenerateCodeRequest {
  resource_type: ResourceType;
  resource_id: string;
  code_name?: string;
  expiry_minutes?: number;
  usage_limit?: number;
  permissions?: Record<string, unknown>; // Changed from any
  metadata?: Record<string, unknown>;    // Changed from any
}

export interface GenerateCodeResponse {
  code: ResourceAccessCode;
  shareable_url?: string;
}

export interface UseCodeRequest {
  access_code: string;
  resource_type?: ResourceType;
  resource_id?: string;
}

export interface UseCodeResponse {
  success: boolean;
  message: string;
  granted_permissions?: Record<string, unknown>; // Changed from any
  resource_info?: Record<string, unknown>;       // Changed from any
  session_id?: string;
}

export interface CodeUsageAuditEntry {
  id: string;
  code_id: string;
  used_by: string;
  success: boolean;
  failure_reason?: string;
  used_at: string;
  ip_address?: string;
  user_agent?: string;
  granted_permissions: Record<string, unknown>; // Changed from any
  session_id?: string;
  user_display_name?: string;
  code_name?: string;
}

// Rest of the interfaces remain the same...
export interface ProcessCodeOptions {
  code_name?: string;
  expiry_minutes?: number;
  usage_limit?: number;
  can_view?: boolean;
  can_connect?: boolean;
  can_send_commands?: boolean;
  can_restart?: boolean;
  can_view_logs?: boolean;
  session_duration_minutes?: number;
}

export interface GridInviteCodeOptions {
  code_name?: string;
  expiry_minutes?: number;
  usage_limit?: number;
  role?: 'member' | 'admin';
  auto_approve?: boolean;
  welcome_message?: string;
  skip_onboarding?: boolean;
}

export interface ChannelCodeOptions {
  code_name?: string;
  expiry_minutes?: number;
  usage_limit?: number;
  can_join?: boolean;
  can_speak?: boolean;
  can_moderate?: boolean;
  can_screen_share?: boolean;
  can_record?: boolean;
  session_duration_minutes?: number;
}

export interface CodeGeneratedEvent {
  grid_id: string;
  code: ResourceAccessCode;
  generated_by: string;
}

export interface CodeUsedEvent {
  grid_id: string;
  code_id: string;
  used_by: string;
  resource_type: ResourceType;
  resource_id: string;
  success: boolean;
}

export interface CodeRevokedEvent {
  grid_id: string;
  code_id: string;
  revoked_by: string;
}

export interface CodeFilters {
  resource_type?: ResourceType;
  resource_id?: string;
  active_only?: boolean;
  created_by?: string;
}

export interface ListCodesParams extends CodeFilters {
  page?: number;
  limit?: number;
}

export interface ListCodesResponse {
  codes: ResourceAccessCode[];
  total: number;
  page: number;
  limit: number;
}

export interface UsageHistoryParams {
  page?: number;
  limit?: number;
}

export interface CodeUsageHistoryResponse {
  usage_history: CodeUsageAuditEntry[];
  total: number;
  page: number;
  limit: number;
}