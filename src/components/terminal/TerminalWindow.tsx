// src/components/terminal/TerminalWindow.tsx - Simplified with proper reconnection

import { useEffect, useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTerminal } from '../../hooks/useTerminal';
import PortSharingModal from './PortSharingModal';

interface TerminalWindowProps {
  sessionId: string;
  gridId?: string;
  windowId?: string;
  className?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export default function TerminalWindow({
  sessionId,
  gridId,
  windowId,
  className,
  autoFocus = true,
  readOnly = false
}: TerminalWindowProps) {
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [showPortSharing, setShowPortSharing] = useState(false);
  
  const {
    containerRef,
    isConnected,
    isConnecting,
    sessionInfo,
    error,
    initializeTerminal,
    connectToSession,
    fitTerminal,
    terminal
  } = useTerminal({
    sessionId,
    autoConnect: true
  });

  // Initialize terminal when component mounts
  useEffect(() => {
    initializeTerminal();
  }, [initializeTerminal]);

  // Handle disconnection (when tab is closed but session should continue)
  const handleDisconnection = useCallback(async () => {
    if (isConnected) {
      try {
        await invoke('disconnect_terminal_ui', {
          sessionId,
          userId: 'current-user'
        });
        console.log(`Disconnected UI from session: ${sessionId} (session continues in background)`);
      } catch (err) {
        console.error('Failed to disconnect UI:', err);
      }
    }
  }, [sessionId, isConnected]);

  // Clean up on unmount - disconnect UI but keep session running in background
  useEffect(() => {
    return () => {
      handleDisconnection();
    };
  }, [handleDisconnection]);

  // Set up resize observer to auto-fit terminal
  useEffect(() => {
    if (!containerRef.current) return;

    resizeObserverRef.current = new ResizeObserver(() => {
      setTimeout(() => {
        fitTerminal();
      }, 100);
    });

    resizeObserverRef.current.observe(containerRef.current);

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, [fitTerminal]);

  // Auto-focus terminal and make it clickable
  useEffect(() => {
    if (terminal && containerRef.current) {
      const terminalElement = containerRef.current.querySelector('.xterm');
      if (terminalElement) {
        (terminalElement as HTMLElement).tabIndex = 0;
        
        const handleClick = () => {
          terminal.focus();
        };
        
        terminalElement.addEventListener('click', handleClick);
        
        if (autoFocus && isConnected) {
          terminal.focus();
        }
        
        return () => {
          terminalElement.removeEventListener('click', handleClick);
        };
      }
    }
  }, [terminal, autoFocus, isConnected]);

  // Disable input if read-only
  useEffect(() => {
    if (terminal && readOnly) {
      const originalOnData = terminal.onData;
      terminal.onData = () => {};
      
      return () => {
        terminal.onData = originalOnData;
      };
    }
  }, [terminal, readOnly]);

  const handleTerminalClick = () => {
    if (terminal) {
      terminal.focus();
    }
  };

  const handleRetry = () => {
    connectToSession(sessionId);
  };

  return (
    <div className={cx('flex flex-col h-full bg-[#0a0b0f] relative', className)}>
      {/* Status bar - minimal, since tab handles most UI */}
      {(error || isConnecting) && (
        <div className={cx(
          'px-4 py-2 text-sm border-b border-white/10',
          error ? 'bg-red-500/10 border-red-500/20 text-red-300' : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300'
        )}>
          <div className="flex items-center gap-2">
            {isConnecting && (
              <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
            )}
            {error && (
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <span>{error || 'Connecting to terminal...'}</span>
            {error && (
              <button
                onClick={handleRetry}
                className="ml-auto px-2 py-1 bg-red-500/20 hover:bg-red-500/30 rounded text-xs"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      {/* Show session info if connected */}
      {isConnected && sessionInfo && (
        <div className="px-4 py-1 text-xs text-white/40 border-b border-white/5 bg-white/5">
          Session: {sessionInfo.session_id.slice(0, 8)} • {sessionInfo.shell_type} • {sessionInfo.working_directory}
        </div>
      )}

      {/* Terminal container - takes full available space */}
      <div 
        ref={containerRef}
        onClick={handleTerminalClick}
        className={cx(
          'flex-1 min-h-0 bg-[#0a0b0f] cursor-text',
          'focus-within:ring-1 focus-within:ring-orange-400/50',
          isConnecting && 'opacity-50',
          readOnly && 'cursor-default'
        )}
        style={{
          minHeight: '300px',
        }}
        title={readOnly ? 'Terminal is read-only' : 'Click to focus terminal'}
      />

      {/* Connection overlay */}
      {isConnecting && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="flex items-center gap-2 text-white/80">
            <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
            <span>Connecting to terminal...</span>
          </div>
        </div>
      )}

      {/* Terminal info overlay */}
      {!readOnly && isConnected && (
        <div className="absolute bottom-4 right-4 flex items-center gap-3 pointer-events-none">
          <div className="text-xs text-white/30">
            Click to focus • Type to interact
          </div>
          {gridId && (
            <button
              onClick={() => setShowPortSharing(true)}
              className="pointer-events-auto flex items-center gap-1 px-2 py-1 text-xs text-white/60 hover:text-white hover:bg-white/10 rounded transition-colors"
              title="Share a port from this terminal"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
              </svg>
              Share Port
            </button>
          )}
        </div>
      )}

      {/* Port Sharing Modal */}
      {showPortSharing && gridId && (
        <PortSharingModal
          isOpen={showPortSharing}
          onClose={() => setShowPortSharing(false)}
          gridId={gridId}
          sessionId={sessionId}
          sessionName={sessionInfo?.session_id.slice(0, 8)}
        />
      )}
    </div>
  );
}