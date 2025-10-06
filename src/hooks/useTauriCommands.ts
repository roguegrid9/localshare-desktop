import { useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { supabase } from '../utils/supabase';

// Import all type definitions
import type { ProcessConfig, ProcessStatus, ProcessInfo } from '../types/process';
import type { CreateSessionRequest, TerminalSessionInfo, SessionHistoryEntry } from '../types/terminal';
import type { 
  ChannelInfo,
  ChannelDetailsResponse,
  CreateTextChannelRequest,
  CreateDirectMessageRequest,
  CreateDirectMessageResponse,
  SendMessageRequest,
  SendMessageResponse,
  GetMessagesRequest,
  GetMessagesResponse,
  EditMessageRequest,
  DeleteMessageRequest,
  AddReactionRequest,
  RemoveReactionRequest,
  TextMessage,
  MessageReaction,
  MessagingState,
  UserSearchResult,
  SearchUsersRequest,
  SearchUsersResponse,
} from '../types/messaging';

// ===== TYPE DEFINITIONS =====

interface UserSessionResult {
  token: string;
  user_id: string;
  expires_in: number;
  display_name: string;
  account_type: 'guest' | 'authenticated';
}

interface UserState {
  is_authenticated: boolean;
  is_provisional: boolean;
  user_id: string | null;
  username?: string | null;
  display_name: string | null;
  developer_handle?: string | null;
  connection_status: 'connected' | 'disconnected' | 'unhealthy';
  token_expires_at: number | null;
  account_type?: 'guest' | 'authenticated';
}

interface ConnectionStatus {
  status: 'connected' | 'disconnected' | 'unhealthy';
  last_ping: number;
  coordinator_url: string;
}

interface PromotionResponse {
  status: string;
  message: string;
  user_info?: {
    user_id: string;
    email: string;
    display_name: string;
    provider: string;
    is_provisional: boolean;
  };
}

interface CheckUsernameAvailabilityResponse {
  available: boolean;
  message: string;
}

interface Grid {
  id: string;
  name: string;
  description?: string;
  creator_id: string;
  grid_type?: string;
  max_members: number;
  member_count: number;
  user_role: string;
  is_public: boolean;
  invite_code?: string;
  created_at: string;
  updated_at: string;
}

interface CreateGridRequest {
  name: string;
  description?: string;
  grid_type?: string;
  max_members?: number;
  is_public?: boolean;
}

interface CreateGridResponse {
  grid: Grid;
  invite_code?: string;
}

interface GridMember {
  user_id: string;
  username?: string;
  display_name?: string;
  role: string;
  joined_at: string;
  is_online: boolean;
}

interface GridInvitation {
  grid_id: string;
  grid_name: string;
  grid_description?: string;
  inviter_name?: string;
  invited_at: string;
}

interface FileDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: Array<{
    name: string;
    extensions: string[];
  }>;
}

interface PresetValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  missing_requirements: string[];
}

interface PersistedSessionMetadata {
  session_id: string;
  grid_id?: string;
  command?: string;
  working_directory?: string;
  created_at: string;
  last_activity: string;
}

// ===== MAIN HOOK =====

export function useTauriCommands() {
  
  // ===== APP LIFECYCLE =====
  
  const initializeApp = useCallback(async (): Promise<void> => {
    return await invoke('initialize_app_storage');
  }, []);

  // ===== AUTHENTICATION & SESSION MANAGEMENT =====

  const createGuestSession = useCallback(async (
    userHandle: string, 
    displayName: string
  ): Promise<UserSessionResult> => {
    return await invoke('create_guest_session', { userHandle, displayName });
  }, []);

  // Deprecated - kept for backwards compatibility
  const createProvisionalSession = useCallback(async (
    userHandle: string, 
    displayName: string
  ): Promise<UserSessionResult> => {
    return await invoke('initialize_user_session', { userHandle, displayName });
  }, []);

  const getUserState = useCallback(async (): Promise<UserState> => {
    return await invoke('get_user_state');
  }, []);

  const promoteAccount = useCallback(async (
    supabaseAccessToken: string
  ): Promise<PromotionResponse> => {
    return await invoke('promote_account_simple', { supabaseAccessToken });
  }, []);

  const promoteAccountLegacy = useCallback(async (
    supabaseAccessToken: string
  ): Promise<PromotionResponse> => {
    return await invoke('promote_account', { supabaseAccessToken });
  }, []);

  const promoteAccountWithUsername = useCallback(async (
    supabaseAccessToken: string,
    username?: string
  ): Promise<PromotionResponse> => {
    return await invoke('promote_account_with_username', {
      supabaseAccessToken,
      username
    });
  }, []);

  const clearSession = useCallback(async (): Promise<void> => {
    return await invoke('clear_user_session');
  }, []);

  const checkConnection = useCallback(async (): Promise<ConnectionStatus> => {
    return await invoke('check_connection_status');
  }, []);

  const validateToken = useCallback(async (): Promise<boolean> => {
    return await invoke('validate_token');
  }, []);

  // ===== OAUTH & SUPABASE INTEGRATION =====
  
  const checkAndPromoteSupabaseSession = useCallback(async (): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.access_token) {
        console.log('Found Supabase session, promoting account...');
        await promoteAccount(session.access_token);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to check/promote Supabase session:', error);
      return false;
    }
  }, [promoteAccount]);

  const setupOAuthDetection = useCallback((onSessionCreated: (userState: UserState) => void) => {
    const handleAuthChange = async (event: string, session: any) => {
      if (event === 'SIGNED_IN' && session?.access_token) {
        try {
          console.log('OAuth sign-in detected, promoting account...');
          await promoteAccount(session.access_token);
          const userState = await getUserState();
          onSessionCreated(userState);
        } catch (error) {
          console.error('Failed to handle OAuth sign-in:', error);
        }
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthChange);
    
    return () => {
      subscription.unsubscribe();
    };
  }, [promoteAccount, getUserState]);

  // ===== USERNAME MANAGEMENT =====
  
  const updateUsername = useCallback(async (username: string): Promise<void> => {
    return await invoke('update_username', { username });
  }, []);

  const checkUsernameAvailability = useCallback(async (
    username: string
  ): Promise<CheckUsernameAvailabilityResponse> => {
    return await invoke('check_username_availability', { username });
  }, []);

  // ===== GRID MANAGEMENT =====
  
  const createGrid = useCallback(async (request: CreateGridRequest): Promise<CreateGridResponse> => {
    return await invoke('create_grid', { request });
  }, []);

  const joinGridByCode = useCallback(async (inviteCode: string): Promise<Grid> => {
    return await invoke('join_grid_by_code', { inviteCode });
  }, []);

  const getMyGrids = useCallback(async (): Promise<Grid[]> => {
    return await invoke('get_my_grids');
  }, []);

  const getGridMembers = useCallback(async (gridId: string): Promise<GridMember[]> => {
    return await invoke('get_grid_members', { gridId });
  }, []);

  const getGridInvitations = useCallback(async (): Promise<GridInvitation[]> => {
    return await invoke('get_grid_invitations');
  }, []);

  const acceptGridInvitation = useCallback(async (gridId: string): Promise<void> => {
    return await invoke('accept_grid_invitation', { gridId });
  }, []);

  const declineGridInvitation = useCallback(async (gridId: string): Promise<void> => {
    return await invoke('decline_grid_invitation', { gridId });
  }, []);

  const leaveGrid = useCallback(async (gridId: string): Promise<void> => {
    return await invoke('leave_grid', { gridId });
  }, []);

  const updateGrid = useCallback(async (
    gridId: string, 
    updates: Partial<CreateGridRequest>
  ): Promise<Grid> => {
    return await invoke('update_grid', { gridId, updates });
  }, []);

  const regenerateInviteCode = useCallback(async (gridId: string): Promise<string> => {
    return await invoke('regenerate_invite_code', { gridId });
  }, []);

  const deleteGrid = useCallback(async (gridId: string): Promise<void> => {
    return await invoke('delete_grid', { gridId });
  }, []);

  // ===== PROCESS MANAGEMENT =====
  
  const initializeProcessManager = useCallback(async (): Promise<void> => {
    return await invoke('initialize_process_manager');
  }, []);

  const startProcess = useCallback(async (
    gridId: string, 
    config: ProcessConfig
  ): Promise<string> => {
    return await invoke('start_process', { gridId, config });
  }, []);

  const startGridProcess = useCallback(async (
    gridId: string, 
    config: ProcessConfig
  ): Promise<string> => {
    return await invoke('start_grid_process', { gridId, config });
  }, []);

  const stopProcess = useCallback(async (gridId: string): Promise<void> => {
    return await invoke('stop_process', { gridId });
  }, []);

  const stopGridProcess = useCallback(async (gridId: string): Promise<void> => {
    return await invoke('stop_grid_process', { gridId });
  }, []);

  const getProcessStatus = useCallback(async (gridId: string): Promise<ProcessStatus> => {
    return await invoke('get_process_status', { gridId });
  }, []);

  const sendProcessInput = useCallback(async (
    gridId: string, 
    input: string
  ): Promise<void> => {
    return await invoke('send_process_input', { gridId, input });
  }, []);

  const sendGridProcessData = useCallback(async (
    gridId: string, 
    data: number[]
  ): Promise<void> => {
    return await invoke('send_grid_process_data', { gridId, data });
  }, []);

  const getActiveProcesses = useCallback(async (): Promise<ProcessInfo[]> => {
    return await invoke('get_active_processes');
  }, []);

  // ===== TERMINAL MANAGEMENT =====
  
  const createTerminalSession = useCallback(async (request: CreateSessionRequest): Promise<string> => {
    return await invoke('create_terminal_session', { request });
  }, []);

  const sendTerminalInput = useCallback(async (
    sessionId: string, 
    text: string, 
    userId?: string
  ): Promise<void> => {
    return await invoke('send_terminal_string', { sessionId, text, userId });
  }, []);

  const sendTerminalBytes = useCallback(async (
    sessionId: string, 
    data: number[], 
    userId?: string
  ): Promise<void> => {
    return await invoke('send_terminal_input', { sessionId, data, userId });
  }, []);

  const getTerminalSessions = useCallback(async (): Promise<TerminalSessionInfo[]> => {
    return await invoke('get_terminal_sessions');
  }, []);

  const getGridTerminalSessions = useCallback(async (gridId: string): Promise<TerminalSessionInfo[]> => {
    return await invoke('get_grid_terminal_sessions', { gridId });
  }, []);

  const getTerminalSession = useCallback(async (sessionId: string): Promise<TerminalSessionInfo> => {
    return await invoke('get_terminal_session', { sessionId });
  }, []);

  const terminateTerminalSession = useCallback(async (sessionId: string): Promise<void> => {
    return await invoke('terminate_terminal_session', { sessionId });
  }, []);

  const resizeTerminalSession = useCallback(async (
    sessionId: string, 
    rows: number, 
    cols: number
  ): Promise<void> => {
    return await invoke('resize_terminal_session', { sessionId, rows, cols });
  }, []);

  const getTerminalSessionHistory = useCallback(async (
    sessionId: string, 
    lines?: number
  ): Promise<SessionHistoryEntry[]> => {
    return await invoke('get_terminal_session_history', { sessionId, lines });
  }, []);

  const addUserToTerminalSession = useCallback(async (
    sessionId: string, 
    userId: string
  ): Promise<void> => {
    return await invoke('add_user_to_terminal_session', { sessionId, userId });
  }, []);

  const removeUserFromTerminalSession = useCallback(async (
    sessionId: string, 
    userId: string
  ): Promise<void> => {
    return await invoke('remove_user_from_terminal_session', { sessionId, userId });
  }, []);

  const getAvailableShells = useCallback(async (): Promise<string[]> => {
    return await invoke('get_available_shells');
  }, []);

  const getDefaultShell = useCallback(async (): Promise<string> => {
    return await invoke('get_default_shell');
  }, []);

  const getTerminalStatistics = useCallback(async (): Promise<any> => {
    return await invoke('get_terminal_statistics');
  }, []);

  const getEnhancedTerminalStatistics = useCallback(async () => {
    return await invoke<any>('get_enhanced_terminal_statistics');
  }, []);

  const cleanupDeadTerminalSessions = useCallback(async () => {
    return await invoke<string[]>('cleanup_dead_terminal_sessions');
  }, []);

  const getRecoverableTerminalSessions = useCallback(async () => {
    return await invoke<PersistedSessionMetadata[]>('get_recoverable_terminal_sessions');
  }, []);

  const getTerminalSessionContext = useCallback(async (sessionId: string) => {
    return await invoke<any>('get_terminal_session_context', { sessionId });
  }, []);

  const createTerminalSessionPreset = useCallback(async (
    preset: string, 
    gridId?: string
  ): Promise<string> => {
    return await invoke('create_terminal_session_preset', { preset, gridId });
  }, []);

  const createTerminalSessionWithCommand = useCallback(async (
    gridId: string | undefined, 
    command: string, 
    workingDirectory?: string
  ): Promise<string> => {
    return await invoke('create_terminal_session_with_command', { 
      gridId, 
      command, 
      workingDirectory 
    });
  }, []);

  const sendTerminalCommand = useCallback(async (
    sessionId: string, 
    command: string, 
    userId?: string
  ): Promise<void> => {
    return await invoke('send_terminal_command', { sessionId, command, userId });
  }, []);

  const sendTerminalInterrupt = useCallback(async (
    sessionId: string, 
    userId?: string
  ): Promise<void> => {
    return await invoke('send_terminal_interrupt', { sessionId, userId });
  }, []);

  const sendTerminalEOF = useCallback(async (
    sessionId: string, 
    userId?: string
  ): Promise<void> => {
    return await invoke('send_terminal_eof', { sessionId, userId });
  }, []);

  // ===== FILE DIALOGS =====
  
  const openFileDialog = useCallback(async (options?: FileDialogOptions): Promise<string | null> => {
    try {
      const result = await open({
        title: options?.title || 'Select File',
        defaultPath: options?.defaultPath,
        filters: options?.filters,
        multiple: false,
        directory: false
      });
      return result as string | null;
    } catch (error) {
      console.error('Failed to open file dialog:', error);
      return null;
    }
  }, []);

  const openDirectoryDialog = useCallback(async (options?: FileDialogOptions): Promise<string | null> => {
    try {
      const result = await open({
        title: options?.title || 'Select Directory',
        defaultPath: options?.defaultPath,
        multiple: false,
        directory: true
      });
      return result as string | null;
    } catch (error) {
      console.error('Failed to open directory dialog:', error);
      return null;
    }
  }, []);

  // ===== PRESET SYSTEM =====
  
  const listPresets = useCallback(async (): Promise<any[]> => {
    return await invoke('list_presets');
  }, []);

  const listPresetsByCategory = useCallback(async (category: string): Promise<any[]> => {
    return await invoke('list_presets_by_category', { category });
  }, []);

  const getFeaturedPresets = useCallback(async (): Promise<any[]> => {
    return await invoke('get_featured_presets');
  }, []);

  const getRecentPresets = useCallback(async (): Promise<any[]> => {
    return await invoke('get_recent_presets');
  }, []);

  const searchPresets = useCallback(async (query: string): Promise<any[]> => {
    return await invoke('search_presets', { query });
  }, []);

  const getPresetSchema = useCallback(async (presetId: string): Promise<any> => {
    return await invoke('get_preset_schema', { presetId });
  }, []);

  const generatePresetConfigTemplate = useCallback(async (presetId: string): Promise<Record<string, any>> => {
    return await invoke('generate_preset_config_template', { presetId });
  }, []);

  const validatePresetConfig = useCallback(async (presetId: string, config: any): Promise<void> => {
    return await invoke('validate_preset_config', { presetId, config });
  }, []);

  const checkPresetRequirements = useCallback(async (presetId: string): Promise<string[]> => {
    return await invoke('check_preset_requirements', { presetId });
  }, []);

  const executePreset = useCallback(async (presetId: string, configValues: any): Promise<any> => {
    return await invoke('execute_preset', { presetId, configValues });
  }, []);

  const executePresetAsGridProcess = useCallback(async (
    gridId: string, 
    presetId: string, 
    configValues: any
  ): Promise<string> => {
    return await invoke('execute_preset_as_grid_process', { gridId, presetId, configValues });
  }, []);

  const getPresetCategories = useCallback(async (): Promise<Array<[string, number]>> => {
    return await invoke('get_preset_categories');
  }, []);

  const reloadCommunityPresets = useCallback(async (): Promise<void> => {
    return await invoke('reload_community_presets');
  }, []);

  // ===== PORT SHARING =====
  
  const createManualPortShare = useCallback(async (
    gridId: string,
    port: number,
    tunnelType: 'http' | 'tcp',
    name?: string
  ): Promise<string> => {
    return await invoke('create_manual_port_share', { 
      gridId, 
      port, 
      tunnelType, 
      name 
    });
  }, []);

  const stopManualPortShare = useCallback(async (
    gridId: string,
    shareId: string
  ): Promise<void> => {
    return await invoke('stop_manual_port_share', { gridId, shareId });
  }, []);

  const getActivePortShares = useCallback(async (gridId: string): Promise<any[]> => {
    return await invoke('get_active_port_shares', { gridId });
  }, []);

  // ===== TEXT MESSAGING =====
  
  const createTextChannel = useCallback(async (
    gridId: string,
    request: CreateTextChannelRequest
  ): Promise<ChannelInfo> => {
    return await invoke('create_text_channel', {
      gridId,
      name: request.name,
      description: request.description,
      isPrivate: request.is_private,
      maxMembers: request.max_members
    });
  }, []);

  const createDirectMessage = useCallback(async (
    gridId: string,
    targetUserId: string
  ): Promise<CreateDirectMessageResponse> => {
    return await invoke('create_direct_message', {
      gridId,
      targetUserId
    });
  }, []);

  const getGridChannels = useCallback(async (
    gridId: string
  ): Promise<ChannelInfo[]> => {
    return await invoke('get_grid_channels', { gridId });
  }, []);

  const getChannelDetails = useCallback(async (
    channelId: string
  ): Promise<ChannelDetailsResponse> => {
    return await invoke('get_channel_details', { channelId });
  }, []);

  const joinChannel = useCallback(async (
    gridId: string,
    channelId: string
  ): Promise<void> => {
    return await invoke('join_channel', { gridId, channelId });
  }, []);

  const leaveChannel = useCallback(async (
    gridId: string,
    channelId: string
  ): Promise<void> => {
    return await invoke('leave_channel', { gridId, channelId });
  }, []);

  const sendMessage = useCallback(async (
    channelId: string,
    request: SendMessageRequest
  ): Promise<TextMessage> => {
    const message: TextMessage = await invoke('send_message', {
      channelId,
      content: request.content,
      messageType: request.message_type,
      replyToId: request.reply_to_id,
      metadata: request.metadata
    });
    
    return message;
  }, []);

  const getChannelMessages = useCallback(async (
    channelId: string,
    request?: GetMessagesRequest
  ): Promise<GetMessagesResponse> => {
    return await invoke('get_channel_messages', {
      channelId,
      limit: request?.limit,
      before: request?.before,
      after: request?.after,
      messageId: request?.message_id
    });
  }, []);

  const editMessage = useCallback(async (
    messageId: string,
    request: EditMessageRequest
  ): Promise<TextMessage> => {
    return await invoke('edit_message', {
      messageId,
      content: request.content,
      metadata: request.metadata
    });
  }, []);

  const deleteMessage = useCallback(async (
    messageId: string,
    request?: DeleteMessageRequest
  ): Promise<void> => {
    return await invoke('delete_message', {
      messageId,
      reason: request?.reason
    });
  }, []);

  const addMessageReaction = useCallback(async (
    messageId: string,
    emoji: string
  ): Promise<MessageReaction> => {
    return await invoke('add_message_reaction', {
      messageId,
      emoji
    });
  }, []);

  const removeMessageReaction = useCallback(async (
    messageId: string,
    emoji: string
  ): Promise<void> => {
    return await invoke('remove_message_reaction', {
      messageId,
      emoji
    });
  }, []);

  const setTypingIndicator = useCallback(async (
    channelId: string,
    isTyping: boolean
  ): Promise<void> => {
    return await invoke('set_typing_indicator', {
      channelId,
      isTyping
    });
  }, []);

  // WebSocket messaging
  const sendWebSocketTextMessage = useCallback(async (
    channelId: string,
    content: string,
    messageType?: string,
    replyToId?: string,
    metadata?: string
  ): Promise<void> => {
    return await invoke('send_websocket_text_message', {
      channelId,
      content,
      messageType,
      replyToId,
      metadata
    });
  }, []);

  const sendWebSocketEditMessage = useCallback(async (
    messageId: string,
    content: string,
    metadata?: string
  ): Promise<void> => {
    return await invoke('send_websocket_edit_message', {
      messageId,
      content,
      metadata
    });
  }, []);

  const sendWebSocketDeleteMessage = useCallback(async (
    messageId: string,
    reason?: string
  ): Promise<void> => {
    return await invoke('send_websocket_delete_message', {
      messageId,
      reason
    });
  }, []);

  const sendWebSocketTypingIndicator = useCallback(async (
    channelId: string,
    isTyping: boolean
  ): Promise<void> => {
    return await invoke('send_websocket_typing_indicator', {
      channelId,
      isTyping
    });
  }, []);

  // Generic channel creation (supports both text and voice)
  const createChannel = useCallback(async (
    gridId: string,
    name: string,
    description?: string,
    isPrivate?: boolean,
    maxMembers?: number,
    channelType?: string
  ): Promise<ChannelInfo> => {
    console.log('Frontend sending channel creation request:', {
      gridId,
      name,
      channelType,
      description,
      isPrivate,
      maxMembers
    });
    
    return await invoke('create_channel', {
      gridId,
      name,
      description,
      isPrivate,
      maxMembers,
      channelType: channelType || 'text'
    });
  }, []);

  // Messaging state management
  const getMessagingState = useCallback(async (): Promise<MessagingState> => {
    return await invoke('get_messaging_state');
  }, []);

  const getCachedMessages = useCallback(async (
    channelId: string
  ): Promise<TextMessage[]> => {
    return await invoke('get_cached_messages', { channelId });
  }, []);

  const getCachedChannels = useCallback(async (
    gridId: string
  ): Promise<ChannelInfo[]> => {
    return await invoke('get_cached_channels', { gridId });
  }, []);

  const clearGridMessagingState = useCallback(async (
    gridId: string
  ): Promise<void> => {
    return await invoke('clear_grid_messaging_state', { gridId });
  }, []);

  const reinitializeMessagingService = useCallback(async (): Promise<void> => {
    return await invoke('reinitialize_messaging_service');
  }, []);

  // User search
  const searchUsers = useCallback(async (
    query: string, 
    limit?: number
  ): Promise<UserSearchResult[]> => {
    const response: SearchUsersResponse = await invoke('search_users', { 
      query: query.trim(), 
      limit: limit || 20 
    });
    return response.users;
  }, []);

  const searchGridMembers = useCallback(async (
    gridId: string,
    query: string, 
    limit?: number
  ): Promise<UserSearchResult[]> => {
    const response: SearchUsersResponse = await invoke('search_grid_members', { 
      gridId,
      query: query.trim(), 
      limit: limit || 20 
    });
    return response.users;
  }, []);

  // ===== VOICE CHANNELS =====
  
  const createVoiceChannel = useCallback(async (
    gridId: string,
    name: string,
    description?: string,
    isPrivate?: boolean,
    maxMembers?: number,
    autoRoutingThreshold?: number,
    defaultQuality?: string,
    pushToTalkDefault?: boolean,
    noiseSuppression?: boolean,
    echoCancellation?: boolean,
    autoGainControl?: boolean,
    voiceActivationThreshold?: number,
    allowGuestParticipants?: boolean,
    maxSessionDurationMinutes?: number,
    recordingEnabled?: boolean,
  ): Promise<ChannelInfo> => {
    return await invoke('create_voice_channel', {
      gridId,
      name,
      description,
      isPrivate,
      maxMembers,
      autoRoutingThreshold,
      defaultQuality,
      pushToTalkDefault,
      noiseSuppression,
      echoCancellation,
      autoGainControl,
      voiceActivationThreshold,
      allowGuestParticipants,
      maxSessionDurationMinutes,
      recordingEnabled,
    });
  }, []);

  const createVoiceChannelTab = useCallback(async (
    channelId: string,
    gridId: string,
    channelName: string,
    windowId?: string
  ) => {
    return await invoke('create_voice_channel_tab', {
      channelId,
      gridId,
      channelName,
      windowId
    });
  }, []);
  
  const initializeVoiceSession = useCallback(async (channelId: string, gridId: string): Promise<void> => {
    return await invoke('initialize_voice_session', {
      channelId,
      gridId
    });
  }, []);

  const joinVoiceChannel = useCallback(async (channelId: string, gridId: string) => {
    return await invoke('join_voice_channel', {
      channelId,
      gridId,
      audioQuality: 'medium',
      startMuted: false,
      startDeafened: false
    });
  }, []);

  const leaveVoiceChannel = useCallback(async (channelId: string, gridId: string): Promise<void> => {
    return await invoke('leave_voice_channel', {
      channelId,
      gridId
    });
  }, []);

  const getVoiceChannelStatus = useCallback(async (channelId: string) => {
    return await invoke('get_voice_channel_status', {
      channelId
    });
  }, []);

  // ===== DOCKER & CONTAINER MANAGEMENT =====
  
  // Docker availability and discovery
  const checkDockerAvailable = useCallback(async (): Promise<{
    available: boolean;
    version?: string;
    error?: string;
  }> => {
    return await invoke('check_docker_available');
  }, []);



  const findAvailablePort = useCallback(async (): Promise<number> => {
    return await invoke('find_available_port');
  }, []);

  // ===== PROCESS HEARTBEATS =====

  const resumeHeartbeatsAfterAuth = useCallback(async (): Promise<void> => {
    return await invoke('resume_heartbeats_after_auth');
  }, []);

  // ===== RETURN MEMOIZED OBJECT =====
  
  return useMemo(() => ({
    // App lifecycle
    initializeApp,

    // Authentication & session management
    createGuestSession,
    createProvisionalSession, // Deprecated
    getUserState,
    promoteAccount,
    promoteAccountLegacy,
    promoteAccountWithUsername,
    clearSession,
    checkConnection,
    validateToken,
    
    // OAuth handling
    checkAndPromoteSupabaseSession,
    setupOAuthDetection,

    // Username management
    updateUsername,
    checkUsernameAvailability,

    // Grid management
    createGrid,
    joinGridByCode,
    getMyGrids,
    getGridMembers,
    getGridInvitations,
    acceptGridInvitation,
    declineGridInvitation,
    leaveGrid,
    updateGrid,
    regenerateInviteCode,
    deleteGrid,

    // Process management
    initializeProcessManager,
    startProcess,
    startGridProcess,
    stopProcess,
    stopGridProcess,
    getProcessStatus,
    sendProcessInput,
    sendGridProcessData,
    getActiveProcesses,

    // Terminal management
    createTerminalSession,
    sendTerminalInput,
    sendTerminalBytes,
    getTerminalSessions,
    getGridTerminalSessions,
    getTerminalSession,
    terminateTerminalSession,
    resizeTerminalSession,
    getTerminalSessionHistory,
    addUserToTerminalSession,
    removeUserFromTerminalSession,
    getAvailableShells,
    getDefaultShell,
    getTerminalStatistics,
    getEnhancedTerminalStatistics,
    cleanupDeadTerminalSessions,
    getRecoverableTerminalSessions,
    getTerminalSessionContext,
    createTerminalSessionPreset,
    createTerminalSessionWithCommand,
    sendTerminalCommand,
    sendTerminalInterrupt,
    sendTerminalEOF,

    // File dialogs
    openFileDialog,
    openDirectoryDialog,

    // Preset system
    listPresets,
    listPresetsByCategory,
    getFeaturedPresets,
    getRecentPresets,
    searchPresets,
    getPresetSchema,
    generatePresetConfigTemplate,
    validatePresetConfig,
    checkPresetRequirements,
    executePreset,
    executePresetAsGridProcess,
    getPresetCategories,
    reloadCommunityPresets,

    // Port sharing
    createManualPortShare,
    stopManualPortShare,
    getActivePortShares,

    // Text messaging
    createTextChannel,
    createDirectMessage,
    getGridChannels,
    getChannelDetails,
    joinChannel,
    leaveChannel,
    sendMessage,
    getChannelMessages,
    editMessage,
    deleteMessage,
    addMessageReaction,
    removeMessageReaction,
    setTypingIndicator,
    sendWebSocketTextMessage,
    sendWebSocketEditMessage,
    sendWebSocketDeleteMessage,
    sendWebSocketTypingIndicator,
    createChannel,
    getMessagingState,
    getCachedMessages,
    getCachedChannels,
    clearGridMessagingState,
    reinitializeMessagingService,
    searchUsers,
    searchGridMembers,

    // Voice channels
    createVoiceChannel,
    createVoiceChannelTab,
    initializeVoiceSession,
    joinVoiceChannel,
    leaveVoiceChannel,
    getVoiceChannelStatus,

    // Utility functions
    checkDockerAvailable,
    findAvailablePort,

    // Process heartbeats
    resumeHeartbeatsAfterAuth,

  }), [
    // Dependencies for useMemo - all the useCallback functions
    initializeApp,
    createGuestSession,
    createProvisionalSession,
    getUserState,
    promoteAccount,
    promoteAccountLegacy,
    promoteAccountWithUsername,
    clearSession,
    checkConnection,
    validateToken,
    checkAndPromoteSupabaseSession,
    setupOAuthDetection,
    updateUsername,
    checkUsernameAvailability,
    createGrid,
    joinGridByCode,
    getMyGrids,
    getGridMembers,
    getGridInvitations,
    acceptGridInvitation,
    declineGridInvitation,
    leaveGrid,
    updateGrid,
    regenerateInviteCode,
    deleteGrid,
    initializeProcessManager,
    startProcess,
    startGridProcess,
    stopProcess,
    stopGridProcess,
    getProcessStatus,
    sendProcessInput,
    sendGridProcessData,
    getActiveProcesses,
    createTerminalSession,
    sendTerminalInput,
    sendTerminalBytes,
    getTerminalSessions,
    getGridTerminalSessions,
    getTerminalSession,
    terminateTerminalSession,
    resizeTerminalSession,
    getTerminalSessionHistory,
    addUserToTerminalSession,
    removeUserFromTerminalSession,
    getAvailableShells,
    getDefaultShell,
    getTerminalStatistics,
    getEnhancedTerminalStatistics,
    cleanupDeadTerminalSessions,
    getRecoverableTerminalSessions,
    getTerminalSessionContext,
    createTerminalSessionPreset,
    createTerminalSessionWithCommand,
    sendTerminalCommand,
    sendTerminalInterrupt,
    sendTerminalEOF,
    openFileDialog,
    openDirectoryDialog,
    listPresets,
    listPresetsByCategory,
    getFeaturedPresets,
    getRecentPresets,
    searchPresets,
    getPresetSchema,
    generatePresetConfigTemplate,
    validatePresetConfig,
    checkPresetRequirements,
    executePreset,
    executePresetAsGridProcess,
    getPresetCategories,
    reloadCommunityPresets,
    createManualPortShare,
    stopManualPortShare,
    getActivePortShares,
    createTextChannel,
    createDirectMessage,
    getGridChannels,
    getChannelDetails,
    joinChannel,
    leaveChannel,
    sendMessage,
    getChannelMessages,
    editMessage,
    deleteMessage,
    addMessageReaction,
    removeMessageReaction,
    setTypingIndicator,
    sendWebSocketTextMessage,
    sendWebSocketEditMessage,
    sendWebSocketDeleteMessage,
    sendWebSocketTypingIndicator,
    createChannel,
    getMessagingState,
    getCachedMessages,
    getCachedChannels,
    clearGridMessagingState,
    reinitializeMessagingService,
    searchUsers,
    searchGridMembers,
    createVoiceChannel,
    createVoiceChannelTab,
    initializeVoiceSession,
    joinVoiceChannel,
    leaveVoiceChannel,
    getVoiceChannelStatus,
    checkDockerAvailable,
    findAvailablePort,
    resumeHeartbeatsAfterAuth,
  ]);
}