// Placeholder VideoCall component
import React from 'react';

interface VideoCallProps {
  sessionId: string;
  gridId?: string;
  participants?: any[];
  onClose?: () => void;
  layout?: string;
}

export default function VideoCall({ sessionId, participants }: VideoCallProps) {
  return (
    <div className="video-call-placeholder">
      VideoCall component - Session: {sessionId}
      {participants && `Participants: ${participants.length}`}
    </div>
  );
}