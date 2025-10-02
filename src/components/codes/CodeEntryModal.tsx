// src/components/codes/CodeEntryModal.tsx
import { useState, useEffect } from "react";
import { useResourceCodeCommands } from "../../hooks/useResourceCodeCommands";
import { useToast } from "../ui/Toaster";
import { type UseCodeResponse } from "../../types/codes";

interface CodeEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  gridId: string;
  prefilledCode?: string;
  onSuccess?: (result: UseCodeResponse) => void;
  onError?: (error: string) => void;
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function CodeEntryModal({
  isOpen,
  onClose,
  gridId,
  prefilledCode,
  onSuccess,
  onError,
}: CodeEntryModalProps) {
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UseCodeResponse | null>(null);
  const [step, setStep] = useState<'enter' | 'success' | 'error'>('enter');

  const { 
    useAccessCode, 
    validateCodeFormat, 
    formatAccessCode 
  } = useResourceCodeCommands();
  const toast = useToast();

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setAccessCode(prefilledCode || '');
      setLoading(false);
      setResult(null);
      setStep('enter');
    }
  }, [isOpen, prefilledCode]);

  const handleCodeChange = (value: string) => {
    // Auto-format the code as user types
    const formatted = formatAccessCode(value);
    setAccessCode(formatted);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!accessCode.trim()) {
      toast("Please enter an access code", "error");
      return;
    }

    if (!validateCodeFormat(accessCode)) {
      toast("Invalid code format. Use XXX-XXX format.", "error");
      return;
    }

    try {
      setLoading(true);
      
      const response = await useAccessCode(gridId, {
        access_code: accessCode
      });

      if (response.success) {
        setResult(response);
        setStep('success');
        toast("Access granted successfully!", "success");
        onSuccess?.(response);
      } else {
        setStep('error');
        const errorMessage = response.message || "Failed to use access code";
        toast(errorMessage, "error");
        onError?.(errorMessage);
      }
    } catch (error) {
      console.error('Failed to use access code:', error);
      setStep('error');
      const errorMessage = `Failed to use access code: ${error}`;
      toast(errorMessage, "error");
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

  const handleTryAgain = () => {
    setStep('enter');
    setResult(null);
    setAccessCode('');
  };

  const getStepIcon = () => {
    switch (step) {
      case 'enter':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-6 6c-3 0-6 1-6 1s1-3 1-6a6 6 0 016-6c0 0 3 1 3 1zm-9 5a2 2 0 100-4 2 2 0 000 4z" />
          </svg>
        );
      case 'success':
        return (
          <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
    }
  };

  const getStepTitle = () => {
    switch (step) {
      case 'enter':
        return 'Enter Access Code';
      case 'success':
        return 'Access Granted!';
      case 'error':
        return 'Access Failed';
    }
  };

  const getStepDescription = () => {
    switch (step) {
      case 'enter':
        return 'Enter the 6-character access code to gain access to the shared resource';
      case 'success':
        return 'You now have access to the shared resource';
      case 'error':
        return 'The access code could not be used. Please check the code and try again.';
    }
  };

  const renderResourceInfo = () => {
    if (!result?.resource_info) return null;

    const resourceInfo = result.resource_info;
    
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
        <h4 className="font-medium mb-2">Resource Access</h4>
        <div className="space-y-2 text-sm">
          {resourceInfo.resource_name ? (
            <div className="flex justify-between">
              <span className="text-white/60">Resource:</span>
              <span>{String(resourceInfo.resource_name)}</span>
            </div>
          ) : null}
          {resourceInfo.resource_type ? (
            <div className="flex justify-between">
              <span className="text-white/60">Type:</span>
              <span className="capitalize">{String(resourceInfo.resource_type).replace('_', ' ')}</span>
            </div>
          ) : null}
          {resourceInfo.owner_name ? (
            <div className="flex justify-between">
              <span className="text-white/60">Shared by:</span>
              <span>{String(resourceInfo.owner_name)}</span>
            </div>
          ) : null}
          {result.session_id && (
            <div className="flex justify-between">
              <span className="text-white/60">Session ID:</span>
              <span className="font-mono text-xs">{result.session_id.slice(0, 8)}...</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderPermissions = () => {
    if (!result?.granted_permissions) return null;

    const permissions = result.granted_permissions;
    const permissionKeys = Object.keys(permissions).filter(key => permissions[key] === true);
    
    if (permissionKeys.length === 0) return null;

    return (
      <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-4">
        <h4 className="font-medium text-green-300 mb-2">Granted Permissions</h4>
        <div className="space-y-1">
          {permissionKeys.map(permission => (
            <div key={permission} className="flex items-center gap-2 text-sm text-green-200">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="capitalize">{permission.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      <div className="relative w-full max-w-md mx-4">
        <div className="rounded-xl border border-white/10 bg-[#111319] p-6 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className={cx(
                "p-2 rounded-lg",
                step === 'success' ? "bg-green-500/20" : 
                step === 'error' ? "bg-red-500/20" : "bg-white/10"
              )}>
                {getStepIcon()}
              </div>
              <div>
                <h2 className="text-xl font-semibold">{getStepTitle()}</h2>
                <p className="text-sm text-white/60">{getStepDescription()}</p>
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

          {step === 'enter' && (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Code Input */}
              <div>
                <label className="block text-sm font-medium mb-3">Access Code</label>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={accessCode}
                    onChange={(e) => handleCodeChange(e.target.value)}
                    placeholder="XXX-XXX"
                    maxLength={7}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-center text-2xl font-mono tracking-widest text-white placeholder-white/40 focus:border-white/20 focus:outline-none"
                    autoFocus
                  />
                  <div className="flex items-center justify-between text-xs text-white/60">
                    <span>Format: XXX-XXX</span>
                    <span>{accessCode.length}/7</span>
                  </div>
                </div>
              </div>

              {/* Validation Feedback */}
              {accessCode.length > 0 && (
                <div className={cx(
                  "flex items-center gap-2 text-sm",
                  validateCodeFormat(accessCode) ? "text-green-400" : "text-orange-400"
                )}>
                  {validateCodeFormat(accessCode) ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.664-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  )}
                  <span>
                    {validateCodeFormat(accessCode) ? "Valid format" : "Use XXX-XXX format"}
                  </span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || !accessCode.trim() || !validateCodeFormat(accessCode)}
                className="w-full rounded-lg bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] px-4 py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {loading ? 'Using Code...' : 'Use Access Code'}
              </button>

              {/* Help Text */}
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
                <p className="text-sm text-blue-200">
                  Access codes are shared by grid members to grant temporary access to their resources.
                  Enter the 6-character code exactly as provided.
                </p>
              </div>
            </form>
          )}

          {step === 'success' && result && (
            <div className="space-y-4">
              {/* Success Message */}
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-green-300 font-medium mb-2">Access Granted!</p>
                <p className="text-sm text-white/60">You can now access the shared resource</p>
              </div>

              {/* Resource Information */}
              {renderResourceInfo()}

              {/* Granted Permissions */}
              {renderPermissions()}

              {/* Success Message */}
              {result.message && (
                <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-3">
                  <p className="text-sm text-green-200">{result.message}</p>
                </div>
              )}

              {/* Action Button */}
              <button
                onClick={handleClose}
                className="w-full rounded-lg bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Continue
              </button>
            </div>
          )}

          {step === 'error' && (
            <div className="space-y-4">
              {/* Error Message */}
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <p className="text-red-300 font-medium mb-2">Access Failed</p>
                <p className="text-sm text-white/60">The access code could not be used</p>
              </div>

              {/* Error Details */}
              {result?.message && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                  <p className="text-sm text-red-200">{result.message}</p>
                </div>
              )}

              {/* Common Issues */}
              <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3">
                <h4 className="font-medium text-yellow-300 mb-2">Common Issues</h4>
                <div className="text-sm text-yellow-200 space-y-1">
                  <p>• Code may have expired</p>
                  <p>• Code may have reached its usage limit</p>
                  <p>• You may not be a member of the required grid</p>
                  <p>• Code may have been revoked by the owner</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleTryAgain}
                  className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium hover:border-white/20"
                >
                  Try Again
                </button>
                <button
                  onClick={handleClose}
                  className="flex-1 rounded-lg bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
