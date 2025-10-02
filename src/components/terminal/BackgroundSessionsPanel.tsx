// src/components/terminal/BackgroundSessionsPanel.tsx - Manage background terminal sessions

import React from 'react';
import { Terminal, Play, Trash2, Clock, Cpu } from 'lucide-react';
import { useTerminalSessions } from '../../hooks/useTerminalSessions';
import { useWindowState } from '../../hooks/useWindowState';

interface BackgroundSessionsPanelProps {
  gridId?: string;
  className?: string;
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function formatDuration(isoString: string): string {
  const now = new Date();
  const then = new Date(isoString);
  const diffMs = now.getTime() - then.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (diffHours > 0) {
    return `${diffHours}h ${diffMinutes}m ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes}m ago`;
  } else {
    return 'Just now';
  }
}

export function BackgroundSessionsPanel({ gridId, className }: BackgroundSessionsPanelProps) {
  const { 
    backgroundSessions, 
    loading, 
    error,
    terminateSession,
    getSessionStats 
  } = useTerminalSessions(gridId);
  
  const { createTerminalTab, mainWindowId } = useWindowState();

  const handleRestoreSession = async (sessionId: string) => {
    try {
      // Create a new tab connected to the existing session
      const session = backgroundSessions.find(s => s.session_id === sessionId);
      if (!session) return;

      const title = `Terminal ${sessionId.slice(0, 8)}`;
      await createTerminalTab(sessionId, gridId, title, mainWindowId);
    } catch (error) {
      console.error('Failed to restore session:', error);
    }
  };

  const handleTerminateSession = async (sessionId: string) => {
    if (confirm('This will permanently terminate the terminal session. Are you sure?')) {
      await terminateSession(sessionId);
    }
  };

  if (loading) {
    return (
      <div className={cx('p-4 border border-white/10 rounded-lg bg-[#0a0b0f]', className)}>
        <div className="flex items-center gap-2 text-white/60">
          <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
          <span>Loading background sessions...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cx('p-4 border border-red-500/20 rounded-lg bg-red-500/10', className)}>
        <div className="text-red-300 text-sm">{error}</div>
      </div>
    );
  }

  if (backgroundSessions.length === 0) {
    return null; // Don't show panel if no background sessions
  }

  const stats = getSessionStats();

  return (
    <div className={cx('border border-white/10 rounded-lg bg-[#0a0b0f] overflow-hidden', className)}>
      {/* Header */}
      <div className="bg-[#111319] border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-yellow-400" />
            <span className="font-medium text-white">Background Sessions</span>
            <span className="text-xs text-white/60 bg-yellow-400/20 px-2 py-1 rounded">
              {backgroundSessions.length}
            </span>
          </div>
          <div className="text-xs text-white/40">
            {stats.active} active, {stats.background} background
          </div>
        </div>
      </div>

      {/* Session List */}
      <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
        {backgroundSessions.map((session) => {
          const shortId = session.session_id.slice(0, 8);
          const workingDir = session.working_directory.split('/').pop() || session.working_directory;
          
          return (
            <div 
              key={session.session_id}
              className="flex items-center gap-3 p-3 border border-white/10 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            >
              {/* Session info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-sm text-white font-medium">
                    {session.shell_type}:{workingDir}
                  </span>
                  <div className="w-2 h-2 rounded-full bg-yellow-400" title="Running in background" />
                </div>
                
                <div className="flex items-center gap-4 text-xs text-white/60">
                  <span>ID: {shortId}</span>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{formatDuration(session.last_activity)}</span>
                  </div>
                  {session.process_info && (
                    <div className="flex items-center gap-1">
                      <Cpu className="w-3 h-3" />
                      <span>PID {session.process_info.pid}</span>
                    </div>
                  )}
                </div>

                {/* NEW: Show current command if available */}
                {session.initial_command && (
                  <div className="text-xs text-blue-400 mt-1 truncate">
                    Last: {session.initial_command}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRestoreSession(session.session_id)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-green-400 hover:text-green-300 hover:bg-green-400/10 rounded transition-colors"
                  title="Restore session in new tab"
                >
                  <Play className="w-3 h-3" />
                  Restore
                </button>
                
                <button
                  onClick={() => handleTerminateSession(session.session_id)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors"
                  title="Permanently terminate session"
                >
                  <Trash2 className="w-3 h-3" />
                  Kill
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer info */}
      <div className="bg-[#111319] border-t border-white/10 px-4 py-2">
        <p className="text-xs text-white/40">
          Background sessions continue running even when not visible. 
          Click "Restore" to reconnect or "Kill" to terminate.
        </p>
      </div>
    </div>
  );
}