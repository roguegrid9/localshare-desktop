// src/components/codes/CodeDisplay.tsx
import { useState } from "react";
import type { ResourceAccessCode } from "../../types/codes";
import { useResourceCodeCommands } from "../../hooks/useResourceCodeCommands";
import { toast } from "../ui/sonner";

interface CodeDisplayProps {
  code: ResourceAccessCode;
  shareableUrl?: string | null;
  onClose: () => void;
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function CodeDisplay({ code, shareableUrl, onClose }: CodeDisplayProps) {
  const [copied, setCopied] = useState<'code' | 'url' | null>(null);
  const { copyCodeToClipboard, getExpiryStatus, getUsageStatus } = useResourceCodeCommands();

  const handleCopyCode = async () => {
    try {
      await copyCodeToClipboard(code.access_code);
      setCopied('code');
      toast.success("Access code copied to clipboard!");
      setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      console.error("Failed to copy code:", error);
      toast.error("Failed to copy code");
    }
  };

  const handleCopyUrl = async () => {
    if (!shareableUrl) return;
    
    try {
      await navigator.clipboard.writeText(shareableUrl);
      setCopied('url');
      toast.success("Shareable link copied to clipboard!");
      setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      console.error("Failed to copy URL:", error);
      toast.error("Failed to copy link");
    }
  };

  const getResourceIcon = () => {
    switch (code.resource_type) {
      case 'process':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
        );
      case 'grid_invite':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
          </svg>
        );
      case 'channel_voice':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        );
      case 'channel_text':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        );
      case 'channel_video':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        );
      default:
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
          </svg>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Success Header */}
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-medium mb-2">Access Code Generated!</h3>
        <p className="text-white/60">Share this code to grant access to your {code.resource_type.replace('_', ' ')}</p>
      </div>

      {/* Resource Info */}
      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-lg bg-white/10">
            {getResourceIcon()}
          </div>
          <div>
            <div className="font-medium">{code.resource_name || code.resource_id}</div>
            <div className="text-sm text-white/60 capitalize">
              {code.resource_type.replace('_', ' ')}
              {code.code_name && ` • ${code.code_name}`}
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-white/60">Expires:</span>
            <div className="font-medium">{getExpiryStatus(code)}</div>
          </div>
          <div>
            <span className="text-white/60">Usage:</span>
            <div className="font-medium">{getUsageStatus(code)}</div>
          </div>
        </div>
      </div>

      {/* Access Code */}
      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
        <div className="text-center mb-3">
          <h4 className="font-medium mb-1">Access Code</h4>
          <p className="text-sm text-white/60">Share this code with others to grant access</p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-3 font-mono text-center text-2xl tracking-widest">
            {code.access_code}
          </div>
          <button
            onClick={handleCopyCode}
            className={cx(
              "rounded-lg px-4 py-3 text-sm font-medium transition-colors",
              copied === 'code' 
                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                : "bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] text-white hover:opacity-90"
            )}
          >
            {copied === 'code' ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Shareable URL */}
      {shareableUrl && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="text-center mb-3">
            <h4 className="font-medium mb-1">Shareable Link</h4>
            <p className="text-sm text-white/60">Direct link that automatically applies the code</p>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 truncate">
              {shareableUrl}
            </div>
            <button
              onClick={handleCopyUrl}
              className={cx(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                copied === 'url' 
                  ? "bg-green-500/20 text-green-400 border border-green-500/30"
                  : "border border-white/10 hover:border-white/20"
              )}
            >
              {copied === 'url' ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-4">
        <h4 className="font-medium text-blue-300 mb-2">How to Use</h4>
        <div className="text-sm text-blue-200 space-y-1">
          <p>• Share the access code or link with others</p>
          <p>• They can enter the code in RogueGrid9 to access your {code.resource_type.replace('_', ' ')}</p>
          <p>• Code expires {getExpiryStatus(code).toLowerCase()}</p>
          <p>• Monitor usage in the grid management dashboard</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-white/10">
        <button
          onClick={onClose}
          className="flex-1 rounded-lg bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Done
        </button>
      </div>
    </div>
  );
}
