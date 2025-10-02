// Placeholder ScreenShareOverlay component
import React from 'react';

interface ScreenShareOverlayProps {
  sessionId: string;
  isSharing?: boolean;
  participant?: any;
  onClose?: () => void;
  onMinimize?: () => void;
  onToggleFullscreen?: () => void;
  showControls?: boolean;
  isFullscreen?: boolean;
}

export default function ScreenShareOverlay({ sessionId, isSharing }: ScreenShareOverlayProps) {
  return (
    <div className="screen-share-overlay-placeholder">
      ScreenShare overlay - Session: {sessionId}, Sharing: {isSharing}
    </div>
  );
}