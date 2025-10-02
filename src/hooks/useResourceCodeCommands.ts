// src/hooks/useResourceCodeCommands.ts
import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type {
  ResourceAccessCode,
  GenerateCodeRequest,
  GenerateCodeResponse,
  UseCodeRequest,
  UseCodeResponse,
  CodeUsageAuditEntry,
  ProcessCodeOptions,
  GridInviteCodeOptions,
  ChannelCodeOptions,
  ResourceType,
} from '../types/codes';

export function useResourceCodeCommands() {
  // ===== CORE RESOURCE CODE COMMANDS =====

  // Generate a resource access code
  const generateResourceCode = useCallback(async (
    gridId: string,
    request: GenerateCodeRequest
  ): Promise<GenerateCodeResponse> => {
    return await invoke('generate_resource_code', {
      gridId,
      request
    });
  }, []);

  // Use an access code
  const useAccessCode = useCallback(async (
    gridId: string,
    request: UseCodeRequest
  ): Promise<UseCodeResponse> => {
    return await invoke('use_access_code', {
      gridId,
      request
    });
  }, []);

  // List codes for a grid
  const listGridCodes = useCallback(async (
    gridId: string,
    resourceType?: ResourceType,
    resourceId?: string,
    activeOnly?: boolean
  ): Promise<ResourceAccessCode[]> => {
    return await invoke('list_grid_codes', {
      gridId,
      resourceType,
      resourceId,
      activeOnly
    });
  }, []);

  // Get specific code details
  const getCodeDetails = useCallback(async (
    gridId: string,
    codeId: string
  ): Promise<ResourceAccessCode> => {
    return await invoke('get_code_details', {
      gridId,
      codeId
    });
  }, []);

  // Revoke a code
  const revokeCode = useCallback(async (
    gridId: string,
    codeId: string
  ): Promise<void> => {
    return await invoke('revoke_code', {
      gridId,
      codeId
    });
  }, []);

  // Get code usage history
  const getCodeUsageHistory = useCallback(async (
    gridId: string,
    codeId: string
  ): Promise<CodeUsageAuditEntry[]> => {
    return await invoke('get_code_usage_history', {
      gridId,
      codeId
    });
  }, []);

  // ===== CONVENIENCE COMMANDS =====

  // Share a process with a code
  const shareProcess = useCallback(async (
    gridId: string,
    processId: string,
    options: ProcessCodeOptions
  ): Promise<GenerateCodeResponse> => {
    return await invoke('share_process', {
      gridId,
      processId,
      options
    });
  }, []);

  // Create grid invite code
  const createGridInviteCode = useCallback(async (
    gridId: string,
    options: GridInviteCodeOptions
  ): Promise<GenerateCodeResponse> => {
    return await invoke('create_grid_invite_code', {
      gridId,
      options
    });
  }, []);

  // Share a channel with a code
  const shareChannel = useCallback(async (
    gridId: string,
    channelId: string,
    channelType: ResourceType,
    options: ChannelCodeOptions
  ): Promise<GenerateCodeResponse> => {
    return await invoke('share_channel', {
      gridId,
      channelId,
      channelType,
      options
    });
  }, []);

  // ===== UTILITY COMMANDS =====

  // Copy code to clipboard
  const copyCodeToClipboard = useCallback(async (
    code: string
  ): Promise<void> => {
    return await invoke('copy_code_to_clipboard', {
      code
    });
  }, []);

  // Create shareable link
  const createShareableLink = useCallback(async (
    gridId: string,
    accessCode: string
  ): Promise<string> => {
    return await invoke('create_shareable_link', {
      gridId,
      accessCode
    });
  }, []);

  // ===== VALIDATION & UTILITIES =====

  // Validate access code format (client-side)
  const validateCodeFormat = useCallback((code: string): boolean => {
    // XXX-XXX format validation
    const codeRegex = /^[A-Z0-9]{3}-[A-Z0-9]{3}$/;
    return codeRegex.test(code);
  }, []);

  // Format access code input (auto-format to XXX-XXX)
  const formatAccessCode = useCallback((code: string): string => {
    const cleaned = code.replace(/[^A-Z0-9]/g, '').toUpperCase();
    if (cleaned.length <= 3) return cleaned;
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}`;
  }, []);

  // Get expiry duration options for UI
  const getExpiryOptions = useCallback(() => [
    { label: '15 minutes', value: 15 },
    { label: '1 hour', value: 60 },
    { label: '6 hours', value: 360 },
    { label: '1 day', value: 1440 },
    { label: '1 week', value: 10080 },
    { label: 'Never', value: null },
  ], []);

  // Get usage limit options for UI
  const getUsageLimitOptions = useCallback(() => [
    { label: '1 use', value: 1 },
    { label: '5 uses', value: 5 },
    { label: '10 uses', value: 10 },
    { label: '25 uses', value: 25 },
    { label: '50 uses', value: 50 },
    { label: 'Unlimited', value: -1 },
  ], []);

  // Check if code is expired
  const isCodeExpired = useCallback((code: ResourceAccessCode): boolean => {
    if (!code.expires_at) return false;
    return new Date(code.expires_at) < new Date();
  }, []);

  // Check if code is at usage limit
  const isCodeAtLimit = useCallback((code: ResourceAccessCode): boolean => {
    if (code.usage_limit === -1) return false; // Unlimited
    return code.used_count >= code.usage_limit;
  }, []);

  // Get human-readable expiry status
  const getExpiryStatus = useCallback((code: ResourceAccessCode) => {
    if (!code.expires_at) return 'Never expires';
    
    const expiryDate = new Date(code.expires_at);
    const now = new Date();
    
    if (expiryDate < now) return 'Expired';
    
    const diffMs = expiryDate.getTime() - now.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) return `Expires in ${diffDays} day${diffDays > 1 ? 's' : ''}`;
    if (diffHours > 0) return `Expires in ${diffHours} hour${diffHours > 1 ? 's' : ''}`;
    if (diffMinutes > 0) return `Expires in ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
    return 'Expires soon';
  }, []);

  // Get usage status text
  const getUsageStatus = useCallback((code: ResourceAccessCode): string => {
    if (code.usage_limit === -1) return `Used ${code.used_count} times`;
    return `${code.used_count}/${code.usage_limit} uses`;
  }, []);

  return {
    // Core commands
    generateResourceCode,
    useAccessCode,
    listGridCodes,
    getCodeDetails,
    revokeCode,
    getCodeUsageHistory,
    
    // Convenience commands
    shareProcess,
    createGridInviteCode,
    shareChannel,
    
    // Utility commands
    copyCodeToClipboard,
    createShareableLink,
    
    // Validation & utilities
    validateCodeFormat,
    formatAccessCode,
    getExpiryOptions,
    getUsageLimitOptions,
    isCodeExpired,
    isCodeAtLimit,
    getExpiryStatus,
    getUsageStatus,
  };
}
