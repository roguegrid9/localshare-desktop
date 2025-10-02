// src/components/codes/CodeGenerationModal.tsx
import { useState, useEffect } from "react";
import { useResourceCodeCommands } from "../../hooks/useResourceCodeCommands";
import { useToast } from "../ui/Toaster";
import { ResourceType, type ResourceAccessCode, type ProcessCodeOptions, type GridInviteCodeOptions, type ChannelCodeOptions } from "../../types/codes";
import CodeDisplay from "./CodeDisplay";

interface CodeGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  resourceType: ResourceType;
  resourceId: string;
  resourceName?: string;
  gridId: string;
  onCodeGenerated?: (code: ResourceAccessCode) => void;
  onError?: (error: string) => void;
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function CodeGenerationModal({
  isOpen,
  onClose,
  resourceType,
  resourceId,
  resourceName,
  gridId,
  onCodeGenerated,
  onError,
}: CodeGenerationModalProps) {
  const [step, setStep] = useState<'configure' | 'generated'>('configure');
  const [loading, setLoading] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<ResourceAccessCode | null>(null);
  const [shareableUrl, setShareableUrl] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Form state
  const [codeName, setCodeName] = useState('');
  const [expiryMinutes, setExpiryMinutes] = useState<number | null>(60); // Default 1 hour
  const [usageLimit, setUsageLimit] = useState(10);
  
  // Resource-specific permissions
  const [permissions, setPermissions] = useState<Record<string, boolean | string>>({});
  
  const { 
    shareProcess, 
    createGridInviteCode, 
    shareChannel, 
    generateResourceCode,
    getExpiryOptions,
    getUsageLimitOptions
  } = useResourceCodeCommands();
  const toast = useToast();

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('configure');
      setGeneratedCode(null);
      setShareableUrl(null);
      setCodeName('');
      setExpiryMinutes(60);
      setUsageLimit(10);
      setShowAdvanced(false);
      setPermissions(getDefaultPermissions());
    }
  }, [isOpen, resourceType]);

  const getDefaultPermissions = (): Record<string, boolean> => {
    switch (resourceType) {
      case ResourceType.Process:
        return {
          can_view: true,
          can_connect: true,
          can_send_commands: false,
          can_restart: false,
          can_view_logs: true,
        };
      case ResourceType.GridInvite:
        return {
          auto_approve: true,
          skip_onboarding: false,
        };
      case ResourceType.ChannelVoice:
      case ResourceType.ChannelText:
      case ResourceType.ChannelVideo:
        return {
          can_join: true,
          can_speak: true,
          can_moderate: false,
          can_screen_share: false,
          can_record: false,
        };
      default:
        return {};
    }
  };

  const getResourceIcon = () => {
    switch (resourceType) {
      case ResourceType.Process:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
        );
      case ResourceType.GridInvite:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
          </svg>
        );
      case ResourceType.ChannelVoice:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
          </svg>
        );
    }
  };

  const getResourceTypeLabel = () => {
    switch (resourceType) {
      case ResourceType.Process:
        return 'Process';
      case ResourceType.GridInvite:
        return 'Grid Invitation';
      case ResourceType.ChannelVoice:
        return 'Voice Channel';
      case ResourceType.ChannelText:
        return 'Text Channel';
      case ResourceType.ChannelVideo:
        return 'Video Channel';
      case ResourceType.Terminal:
        return 'Terminal';
      case ResourceType.File:
        return 'File';
      default:
        return 'Resource';
    }
  };

  const renderPermissionControls = () => {
    switch (resourceType) {
      case ResourceType.Process:
        return (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-white/80">Process Permissions</h4>
            {[
              { key: 'can_view', label: 'View process output', description: 'Allow viewing terminal output and status' },
              { key: 'can_connect', label: 'Connect to process', description: 'Allow establishing connections to the process' },
              { key: 'can_view_logs', label: 'View process logs', description: 'Access stdout/stderr logs' },
              { key: 'can_send_commands', label: 'Send commands', description: 'Send input to the terminal process' },
              { key: 'can_restart', label: 'Restart process', description: 'Allow restarting the process if it fails' },
            ].map(perm => (
              <div key={perm.key} className="flex items-start justify-between p-3 rounded-lg bg-white/5">
                <div className="flex-1">
                  <div className="font-medium text-sm">{perm.label}</div>
                  <div className="text-xs text-white/60 mt-1">{perm.description}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setPermissions(prev => ({ ...prev, [perm.key]: !prev[perm.key] }))}
                  className={cx(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors ml-3",
                    permissions[perm.key] ? "bg-gradient-to-r from-[#FF8A00] to-[#FF3D00]" : "bg-white/20"
                  )}
                >
                  <span
                    className={cx(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      permissions[perm.key] ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>
            ))}
          </div>
        );

      case ResourceType.GridInvite:
        return (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-white/80">Invitation Settings</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-2">Default Role</label>
                <select
                  value={typeof permissions.role === 'string' ? permissions.role : 'member'}
                  onChange={(e) => setPermissions(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-white/20 focus:outline-none"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex items-start justify-between p-3 rounded-lg bg-white/5">
                <div className="flex-1">
                  <div className="font-medium text-sm">Auto-approve</div>
                  <div className="text-xs text-white/60 mt-1">Automatically approve users who use this code</div>
                </div>
                <button
                  type="button"
                  onClick={() => setPermissions(prev => ({ ...prev, auto_approve: !prev.auto_approve }))}
                  className={cx(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors ml-3",
                    permissions.auto_approve ? "bg-gradient-to-r from-[#FF8A00] to-[#FF3D00]" : "bg-white/20"
                  )}
                >
                  <span
                    className={cx(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      permissions.auto_approve ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>
            </div>
          </div>
        );

      case ResourceType.ChannelVoice:
      case ResourceType.ChannelText:
      case ResourceType.ChannelVideo:
        return (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-white/80">Channel Permissions</h4>
            {[
              { key: 'can_join', label: 'Join channel', description: 'Allow joining the channel' },
              { key: 'can_speak', label: 'Speak/type in channel', description: 'Allow speaking in voice or typing in text channels' },
              { key: 'can_moderate', label: 'Moderate channel', description: 'Allow muting, kicking, or moderating other users' },
              { key: 'can_screen_share', label: 'Screen share', description: 'Allow sharing screen in video channels' },
              { key: 'can_record', label: 'Record sessions', description: 'Allow recording channel sessions' },
            ].map(perm => (
              <div key={perm.key} className="flex items-start justify-between p-3 rounded-lg bg-white/5">
                <div className="flex-1">
                  <div className="font-medium text-sm">{perm.label}</div>
                  <div className="text-xs text-white/60 mt-1">{perm.description}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setPermissions(prev => ({ ...prev, [perm.key]: !prev[perm.key] }))}
                  className={cx(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors ml-3",
                    permissions[perm.key] ? "bg-gradient-to-r from-[#FF8A00] to-[#FF3D00]" : "bg-white/20"
                  )}
                >
                  <span
                    className={cx(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      permissions[perm.key] ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  const handleGenerate = async () => {
    try {
      setLoading(true);

      let response;
      
      switch (resourceType) {
        case ResourceType.Process:
          response = await shareProcess(gridId, resourceId, {
            code_name: codeName || undefined,
            expiry_minutes: expiryMinutes || undefined,
            usage_limit: usageLimit,
            ...permissions,
          } as ProcessCodeOptions);
          break;
          
        case ResourceType.GridInvite:
          response = await createGridInviteCode(gridId, {
            code_name: codeName || undefined,
            expiry_minutes: expiryMinutes || undefined,
            usage_limit: usageLimit,
            ...permissions,
          } as GridInviteCodeOptions);
          break;
          
        case ResourceType.ChannelVoice:
        case ResourceType.ChannelText:
        case ResourceType.ChannelVideo:
          response = await shareChannel(gridId, resourceId, resourceType, {
            code_name: codeName || undefined,
            expiry_minutes: expiryMinutes || undefined,
            usage_limit: usageLimit,
            ...permissions,
          } as ChannelCodeOptions);
          break;
          
        default:
          response = await generateResourceCode(gridId, {
            resource_type: resourceType,
            resource_id: resourceId,
            code_name: codeName || undefined,
            expiry_minutes: expiryMinutes || undefined,
            usage_limit: usageLimit,
            permissions,
          });
          break;
      }

      setGeneratedCode(response.code);
      setShareableUrl(response.shareable_url || null);
      setStep('generated');
      onCodeGenerated?.(response.code);
      
    } catch (error) {
      console.error('Failed to generate code:', error);
      const errorMessage = `Failed to generate code: ${error}`;
      toast(errorMessage, 'error');
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      <div className="relative w-full max-w-lg mx-4">
        <div className="rounded-xl border border-white/10 bg-[#111319] p-6 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-white/10">
                {getResourceIcon()}
              </div>
              <div>
                <h2 className="text-xl font-semibold">
                  {step === 'configure' ? 'Share Resource' : 'Code Generated'}
                </h2>
                <p className="text-sm text-white/60">
                  {resourceName ? `${resourceName} (${getResourceTypeLabel()})` : getResourceTypeLabel()}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              disabled={loading}
              className="rounded-lg p-1 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {step === 'configure' && (
            <div className="space-y-6">
              {/* Basic Settings */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Code Name (Optional)</label>
                  <input
                    type="text"
                    value={codeName}
                    onChange={(e) => setCodeName(e.target.value)}
                    placeholder="e.g., Dev Server Access, Monday Meeting"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 focus:border-white/20 focus:outline-none"
                    maxLength={50}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Expires</label>
                    <select
                      value={expiryMinutes || 'never'}
                      onChange={(e) => setExpiryMinutes(e.target.value === 'never' ? null : parseInt(e.target.value))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-white/20 focus:outline-none"
                    >
                      {getExpiryOptions().map(option => (
                        <option key={option.value || 'never'} value={option.value || 'never'}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Usage Limit</label>
                    <select
                      value={usageLimit}
                      onChange={(e) => setUsageLimit(parseInt(e.target.value))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-white/20 focus:outline-none"
                    >
                      {getUsageLimitOptions().map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Advanced Settings Toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-2 text-sm text-white/60 hover:text-white"
                >
                  <svg 
                    className={cx("w-4 h-4 transition-transform", showAdvanced && "rotate-90")}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Advanced Permissions
                </button>
              </div>

              {/* Permission Controls */}
              {showAdvanced && renderPermissionControls()}

              {/* Generate Button */}
              <div className="pt-4 border-t border-white/10">
                <button
                  onClick={handleGenerate}
                  disabled={loading}
                  className="w-full rounded-lg bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] px-4 py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? 'Generating Code...' : 'Generate Access Code'}
                </button>
              </div>
            </div>
          )}

          {step === 'generated' && generatedCode && (
            <CodeDisplay
              code={generatedCode}
              shareableUrl={shareableUrl}
              onClose={handleClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}
