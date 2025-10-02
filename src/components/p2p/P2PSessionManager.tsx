import { useMemo, useState } from "react";
import { useP2P } from "../../context/P2PProvider";
import AudioIndicator from "../media/AudioIndicator";
import type { P2PSession } from "../../types/p2p";

type Props = {
  open?: boolean;
  onClose?: () => void;
  onOpenMediaManager?: () => void; // NEW: Callback to open media session manager
};

const stateBadgeClasses: Record<string, string> = {
  Inviting: "bg-yellow-500/20 text-yellow-300",
  Connecting: "bg-yellow-500/20 text-yellow-300",
  Connected: "bg-emerald-500/20 text-emerald-300",
  Disconnected: "bg-neutral-600/30 text-neutral-300",
  Failed: "bg-red-500/20 text-red-300",
  Idle: "bg-neutral-600/30 text-neutral-300",
};

function SessionRow({
  s,
  onClose,
  onSendTest,
  onStartMedia,
  onJoinCall,
}: {
  s: P2PSession;
  onClose: (id: string) => void;
  onSendTest: (id: string) => void;
  onStartMedia: (id: string) => void;
  onJoinCall: (id: string) => void;
}) {
  const badgeClass =
    stateBadgeClasses[s.state] ?? "bg-neutral-600/30 text-neutral-300";

  // NEW: Get media status
  const getMediaStatus = () => {
    if (!s.hasMediaSession) return null;
    
    if (!s.mediaConnected) return { text: 'Connecting...', color: 'text-yellow-400' };
    if (s.participantCount && s.participantCount > 0) {
      return { text: `${s.participantCount + 1} in call`, color: 'text-green-400' };
    }
    return { text: 'Ready for call', color: 'text-blue-400' };
  };

  const mediaStatus = getMediaStatus();

  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <div className="truncate text-sm font-semibold">
            {s.peerDisplayName ?? s.peerUserId}
          </div>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${badgeClass}`}>
            {s.state}
          </span>
          
          {/* NEW: Media session indicator */}
          {s.hasMediaSession && (
            <span className="inline-flex rounded-full px-2 py-0.5 text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30">
              📹 Media
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-3 text-xs text-neutral-400">
          <span>Session: {s.sessionId.slice(0, 8)}…</span>
          
          {/* NEW: Media status */}
          {mediaStatus && (
            <span className={mediaStatus.color}>{mediaStatus.text}</span>
          )}
          
          {s.lastError && <span className="text-red-300">Error: {s.lastError}</span>}
        </div>
        
        {/* NEW: Media indicators row */}
        {s.hasMediaSession && s.mediaConnected && (
          <div className="flex items-center gap-2 mt-1">
            {s.hasAudio && (
              <div className="flex items-center gap-1">
                <AudioIndicator
                  audioEnabled={true}
                  muted={false}
                  speaking={false}
                  size="sm"
                  showLevel={false}
                />
                <span className="text-xs text-green-300">Audio</span>
              </div>
            )}
            
            {s.hasVideo && (
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                  <svg className="w-2 h-2 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="text-xs text-blue-300">Video</span>
              </div>
            )}
            
            {s.hasScreenShare && (
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                  <svg className="w-2 h-2 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="text-xs text-purple-300">Screen</span>
              </div>
            )}
            
            {s.mediaQuality && (
              <span className="text-xs text-white/50 bg-white/10 px-1 rounded">
                {s.mediaQuality}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Existing test button */}
        <button
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10 active:scale-[0.98]"
          onClick={() => onSendTest(s.sessionId)}
          disabled={s.state !== "Connected"}
          title={s.state === "Connected" ? "Send a small test packet" : "Connect first"}
        >
          Send test
        </button>
        
        {/* NEW: Media action buttons */}
        {s.state === "Connected" && (
          <>
            {!s.hasMediaSession ? (
              <button
                className="rounded-lg border border-blue-500/30 bg-blue-500/20 px-2 py-1 text-xs text-blue-300 hover:bg-blue-500/30 active:scale-[0.98]"
                onClick={() => onStartMedia(s.sessionId)}
                title="Initialize media session"
              >
                Start Media
              </button>
            ) : s.mediaConnected && (s.participantCount || 0) > 0 ? (
              <button
                className="rounded-lg border border-green-500/30 bg-green-500/20 px-2 py-1 text-xs text-green-300 hover:bg-green-500/30 active:scale-[0.98]"
                onClick={() => onJoinCall(s.sessionId)}
                title="Join ongoing call"
              >
                Join Call
              </button>
            ) : s.hasMediaSession ? (
              <button
                className="rounded-lg border border-blue-500/30 bg-blue-500/20 px-2 py-1 text-xs text-blue-300 hover:bg-blue-500/30 active:scale-[0.98]"
                onClick={() => onJoinCall(s.sessionId)}
                title="Start video call"
              >
                Start Call
              </button>
            ) : null}
          </>
        )}
        
        <button
          className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-black hover:bg-white/90 active:scale-[0.98]"
          onClick={() => onClose(s.sessionId)}
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default function P2PSessionManager({ open = true, onClose, onOpenMediaManager }: Props) {
  const p2pContext = useP2P();
  const { sessions, closeSession, sendData, initializeMediaSession } = p2pContext;
  const activeCalls = p2pContext.activeCalls || {};
  const [filter, setFilter] = useState<"" | "active" | "errored" | "media">("");

  const items = useMemo(() => {
    const arr = Object.values(sessions);
    if (filter === "active") return arr.filter((s) => s.state === "Connected" || s.state === "Connecting" || s.state === "Inviting");
    if (filter === "errored") return arr.filter((s) => s.state === "Failed");
    if (filter === "media") return arr.filter((s) => s.hasMediaSession); // NEW: Media filter
    return arr;
  }, [sessions, filter]);

  // NEW: Handle media session initialization
  const handleStartMedia = async (sessionId: string) => {
    try {
      await initializeMediaSession(sessionId);
    } catch (error) {
      console.error('Failed to start media:', error);
    }
  };

  // NEW: Handle joining/starting calls
  const handleJoinCall = (sessionId: string) => {
    // This would typically open the video call interface
    // For now, we'll just open the media manager
    onOpenMediaManager?.();
  };

  // NEW: Count active media sessions
  const activeMediaCount = Object.values(sessions).filter(s => s.hasMediaSession && s.mediaConnected).length;
  const activeCallCount = Object.keys(activeCalls).length;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-end">
      {/* overlay */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => onClose?.()}
      />
      {/* panel */}
      <div className="relative m-3 w-full max-w-lg rounded-2xl border border-white/10 bg-neutral-900/95 p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold">P2P Sessions</h2>
            
            {/* NEW: Media session stats */}
            {(activeMediaCount > 0 || activeCallCount > 0) && (
              <div className="flex items-center gap-2 text-xs">
                {activeMediaCount > 0 && (
                  <span className="bg-blue-500/20 text-blue-300 px-2 py-1 rounded border border-blue-500/30">
                    {activeMediaCount} media
                  </span>
                )}
                {activeCallCount > 0 && (
                  <span className="bg-green-500/20 text-green-300 px-2 py-1 rounded border border-green-500/30">
                    {activeCallCount} calls
                  </span>
                )}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs"
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="media">Media Sessions</option>
              <option value="errored">Errored</option>
            </select>
            
            {/* NEW: Quick access to media manager */}
            {activeMediaCount > 0 && (
              <button
                onClick={onOpenMediaManager}
                className="rounded-lg border border-blue-500/30 bg-blue-500/20 px-2 py-1 text-xs text-blue-300 hover:bg-blue-500/30"
                title="Open Media Manager"
              >
                📹
              </button>
            )}
            
            <button
              aria-label="Close"
              className="rounded-md p-1 text-neutral-400 hover:bg-white/10 hover:text-white"
              onClick={() => onClose?.()}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M18 6L6 18M6 6l12 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {items.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-neutral-300">
              {filter === "media" 
                ? "No media sessions yet. Start media in an active P2P session."
                : "No sessions yet. Start one from your Friends list."
              }
            </div>
          ) : (
            items.map((s) => (
              <SessionRow
                key={s.sessionId}
                s={s}
                onClose={(id) => closeSession(id)}
                onSendTest={(id) => sendData(id, [1, 2, 3, 4])}
                onStartMedia={handleStartMedia}
                onJoinCall={handleJoinCall}
              />
            ))
          )}
        </div>
        
        {/* NEW: Quick actions footer */}
        {Object.values(sessions).some(s => s.state === "Connected") && (
          <div className="mt-4 pt-3 border-t border-white/10">
            <div className="flex justify-between items-center">
              <span className="text-xs text-white/60">Quick Actions</span>
              <div className="flex gap-2">
                <button
                  onClick={onOpenMediaManager}
                  className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                >
                  Media Manager
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}