// src/hooks/useTerminalSessions.ts - Background session management (no persistence)

import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { TerminalSessionInfo, CreateSessionRequest, ShellType } from '../types/terminal';

export interface UseTerminalSessionsOptions {
  gridId?: string;
  autoRefresh?: boolean;
}

export function useTerminalSessions(gridId?: string, options: UseTerminalSessionsOptions = {}) {
  const { autoRefresh = true } = options;
  
  const [sessions, setSessions] = useState<TerminalSessionInfo[]>([]);
  const [backgroundSessions, setBackgroundSessions] = useState<TerminalSessionInfo[]>([]);
  const [activeSessions, setActiveSessions] = useState<TerminalSessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load all sessions
  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let allSessions: TerminalSessionInfo[];
      
      if (gridId) {
        allSessions = await invoke<TerminalSessionInfo[]>('get_grid_terminal_sessions', {
          gridId
        });
      } else {
        allSessions = await invoke<TerminalSessionInfo[]>('get_terminal_sessions');
      }

      // Separate active vs background sessions
      const backgroundList = allSessions.filter(s => s.connected_users.length === 0);
      const activeList = allSessions.filter(s => s.connected_users.length > 0);

      setSessions(allSessions);
      setBackgroundSessions(backgroundList);
      setActiveSessions(activeList);
    } catch (err) {
      console.error('Failed to load terminal sessions:', err);
      setError(`Failed to load sessions: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [gridId]);

  // Create new session
  const createSession = useCallback(async (
    config: {
      shell_type?: ShellType;
      working_directory?: string;
      initial_command?: string;
    } = {}
  ): Promise<string> => {
    try {
      setError(null);

      const request: CreateSessionRequest = {
        grid_id: gridId,
        shell_type: config.shell_type,
        working_directory: config.working_directory,
        initial_command: config.initial_command
      };

      const newSessionId = await invoke<string>('create_terminal_session', { request });
      await loadSessions();
      
      return newSessionId;
    } catch (err) {
      console.error('Failed to create terminal session:', err);
      setError(`Failed to create session: ${err}`);
      throw err;
    }
  }, [gridId, loadSessions]);

  // Create session with preset
  const createPresetSession = useCallback(async (
    preset: 'bash' | 'powershell' | 'development' | 'python' | 'node'
  ): Promise<string> => {
    try {
      const newSessionId = await invoke<string>('create_terminal_session_preset', {
        preset,
        gridId
      });
      
      await loadSessions();
      return newSessionId;
    } catch (err) {
      console.error('Failed to create preset session:', err);
      setError(`Failed to create ${preset} session: ${err}`);
      throw err;
    }
  }, [gridId, loadSessions]);

  // Disconnect UI from session (session continues in background)
  const disconnectFromSession = useCallback(async (targetSessionId: string, userId: string = 'current-user') => {
    try {
      await invoke('disconnect_terminal_ui', { sessionId: targetSessionId, userId });
      await loadSessions();
    } catch (err) {
      console.error('Failed to disconnect from session:', err);
      setError(`Failed to disconnect from session: ${err}`);
    }
  }, [loadSessions]);

  // Reconnect UI to background session
  const reconnectToSession = useCallback(async (targetSessionId: string, userId: string = 'current-user') => {
    try {
      await invoke('reconnect_terminal_ui', { sessionId: targetSessionId, userId });
      await loadSessions();
    } catch (err) {
      console.error('Failed to reconnect to session:', err);
      setError(`Failed to reconnect to session: ${err}`);
    }
  }, [loadSessions]);

  // Terminate session (actually kill the process)
  const terminateSession = useCallback(async (targetSessionId: string) => {
    try {
      await invoke('terminate_terminal_session', { sessionId: targetSessionId });
      await loadSessions();
    } catch (err) {
      console.error('Failed to terminate session:', err);
      setError(`Failed to terminate session: ${err}`);
    }
  }, [loadSessions]);

  // Get specific session
  const getSession = useCallback((targetSessionId: string): TerminalSessionInfo | null => {
    return sessions.find(s => s.session_id === targetSessionId) || null;
  }, [sessions]);

  // Check if session is in background
  const isSessionInBackground = useCallback((targetSessionId: string): boolean => {
    return backgroundSessions.some(s => s.session_id === targetSessionId);
  }, [backgroundSessions]);

  // Get session statistics
  const getSessionStats = useCallback(() => {
    return {
      total: sessions.length,
      active: activeSessions.length,
      background: backgroundSessions.length,
      byGrid: sessions.reduce((acc, session) => {
        const gId = session.grid_id || 'personal';
        acc[gId] = (acc[gId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };
  }, [sessions, activeSessions, backgroundSessions]);

  // Get session statistics from backend
  const getEnhancedStats = useCallback(async () => {
    try {
      return await invoke('get_terminal_session_statistics');
    } catch (err) {
      console.error('Failed to get enhanced statistics:', err);
      return null;
    }
  }, []);

  // Manual cleanup of dead sessions
  const cleanupDeadSessions = useCallback(async () => {
    try {
      const cleanedSessions = await invoke<string[]>('cleanup_dead_terminal_sessions');
      await loadSessions();
      return cleanedSessions;
    } catch (err) {
      console.error('Failed to cleanup dead sessions:', err);
      return [];
    }
  }, [loadSessions]);

  // Set up event listeners for session updates
  useEffect(() => {
    let unsubs: Array<() => void> = [];
    let cancelled = false;

    // Run once on mount
    loadSessions();

    // Set up live listeners only when autoRefresh is enabled
    if (autoRefresh) {
      (async () => {
        const listeners = await Promise.all([
          listen('terminal_session_created',     () => loadSessions()),
          listen('terminal_session_terminated',  () => loadSessions()),
          listen('terminal_ui_disconnected',     () => loadSessions()),
          listen('terminal_ui_reconnected',      () => loadSessions()),
          listen('terminal_session_cleaned_up',  () => loadSessions()),
        ]);

        if (cancelled) {
          // effect was cleaned up before listeners resolved
          listeners.forEach(unlisten => unlisten());
          return;
        }
        unsubs = listeners;
      })();
    }

    return () => {
      cancelled = true;
      unsubs.forEach(unlisten => unlisten());
    };
  }, [autoRefresh, loadSessions]);

  return {
    // Session data
    sessions,
    backgroundSessions,
    activeSessions,
    loading,
    error,
    
    // Session actions
    loadSessions,
    createSession,
    createPresetSession,
    disconnectFromSession,
    reconnectToSession,
    terminateSession,
    
    // Utilities
    getSession,
    isSessionInBackground,
    getSessionStats,
    getEnhancedStats,
    cleanupDeadSessions,
    
    // Computed values
    hasBackgroundSessions: backgroundSessions.length > 0,
    hasActiveSessions: activeSessions.length > 0,
  };
}