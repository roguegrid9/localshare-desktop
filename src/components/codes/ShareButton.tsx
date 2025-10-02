// src/components/codes/ShareButton.tsx
import { useState } from "react";
import { ResourceType } from "../../types/codes";
import type { ResourceAccessCode } from "../../types/codes";
import CodeGenerationModal from "./CodeGenerationModal";

interface ShareButtonProps {
  resourceType: ResourceType;
  resourceId: string;
  resourceName?: string;
  gridId: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'compact';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
  onSuccess?: (code: ResourceAccessCode) => void;
  onError?: (error: string) => void;
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function ShareButton({
  resourceType,
  resourceId,
  resourceName,
  gridId,
  variant = 'secondary',
  size = 'md',
  disabled = false,
  className,
  onSuccess,
  onError,
}: ShareButtonProps) {
  const [showModal, setShowModal] = useState(false);

  const getButtonStyles = () => {
    const baseStyles = "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500/50";
    
    const sizeStyles = {
      sm: "px-2 py-1 text-xs",
      md: "px-3 py-2 text-sm", 
      lg: "px-4 py-3 text-base",
    };

    const variantStyles = {
      primary: "bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] text-white hover:opacity-90",
      secondary: "border border-white/10 bg-white/5 text-white hover:bg-white/10 hover:border-white/20",
      ghost: "text-white/60 hover:text-white hover:bg-white/5",
      compact: "border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 text-xs px-2 py-1",
    };

    return cx(
      baseStyles,
      sizeStyles[size],
      variantStyles[variant],
      disabled && "opacity-50 cursor-not-allowed"
    );
  };

  const getShareIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
    </svg>
  );

  const getButtonText = () => {
    if (variant === 'compact') return '';
    
    switch (resourceType) {
      case ResourceType.Process:
        return size === 'sm' ? 'Share' : 'Share Process';
      case ResourceType.GridInvite:
        return size === 'sm' ? 'Invite' : 'Invite Members';
      case ResourceType.ChannelVoice:
      case ResourceType.ChannelText:
      case ResourceType.ChannelVideo:
        return size === 'sm' ? 'Share' : 'Share Channel';
      case ResourceType.Terminal:
        return size === 'sm' ? 'Share' : 'Share Terminal';
      case ResourceType.File:
        return size === 'sm' ? 'Share' : 'Share File';
      default:
        return 'Share';
    }
  };

  const handleSuccess = (code: ResourceAccessCode) => {
    setShowModal(false);
    onSuccess?.(code);
  };

  const handleError = (error: string) => {
    onError?.(error);
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        disabled={disabled}
        className={cx(getButtonStyles(), className)}
        title={`Share ${resourceName || resourceType}`}
      >
        {getShareIcon()}
        {getButtonText() && <span>{getButtonText()}</span>}
      </button>

      {showModal && (
        <CodeGenerationModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          resourceType={resourceType}
          resourceId={resourceId}
          resourceName={resourceName}
          gridId={gridId}
          onCodeGenerated={handleSuccess}
          onError={handleError}
        />
      )}
    </>
  );
}
