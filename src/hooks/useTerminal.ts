// src/hooks/useTerminal.ts - Consolidated terminal hook

import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import type { 
  CreateSessionRequest, 
  TerminalSessionInfo, 
  TerminalOutput, 
  SessionHistoryEntry,
  ShellType 
} from '../types/terminal';

export interface UseTerminalOptions {
  sessionId?: string;
  gridId?: string;
  autoConnect?: boolean;
  theme?: 'dark' | 'light';
}

export function useTerminal(options: UseTerminalOptions = {}) {
  const { sessionId, gridId, autoConnect = true, theme = 'dark' } = options;
  
  // Terminal instance state
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<TerminalSessionInfo | null>(null);
  const [connectedUsers, setConnectedUsers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Session management state
  const [sessions, setSessions] = useState<TerminalSessionInfo[]>([]);
  const [backgroundSessions, setBackgroundSessions] = useState<TerminalSessionInfo[]>([]);
  const [activeSessions, setActiveSessions] = useState<TerminalSessionInfo[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  
  // Terminal instance refs
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  // Load all terminal sessions
  const loadSessions = useCallback(async () => {
    try {
      setSessionsLoading(true);
      setSessionsError(null);

      let allSessions: TerminalSessionInfo[];
      let backgroundSessionsList: TerminalSessionInfo[];
      let activeSessionsList: TerminalSessionInfo[];
      
      if (gridId) {
        // Get sessions for specific grid
        allSessions = await invoke<TerminalSessionInfo[]>('get_grid_terminal_sessions', {
          gridId
        });
        // Filter background vs active for grid sessions
        backgroundSessionsList = allSessions.filter(s => s.connected_users.length === 0);
        activeSessionsList = allSessions.filter(s => s.connected_users.length > 0);
      } else {
        // Get all sessions
        allSessions = await invoke<TerminalSessionInfo[]>('get_terminal_sessions');
        
        // Get background sessions specifically
        backgroundSessionsList = await invoke<TerminalSessionInfo[]>('get_background_terminal_sessions');
        
        // Get active UI sessions specifically
        activeSessionsList = await invoke<TerminalSessionInfo[]>('get_active_ui_terminal_sessions');
      }

      setSessions(allSessions);
      setBackgroundSessions(backgroundSessionsList);
      setActiveSessions(activeSessionsList);
    } catch (err) {
      console.error('Failed to load terminal sessions:', err);
      setSessionsError(`Failed to load sessions: ${err}`);
    } finally {
      setSessionsLoading(false);
    }
  }, [gridId]);

  // Initialize terminal instance
  const initializeTerminal = useCallback(() => {
    if (!containerRef.current || terminalRef.current) {
      return;
    }

    try {
      const terminal = new Terminal({
        theme: {
          background: '#1a1b26',        // Softer dark blue background
          foreground: '#a9b1d6',        // Light blue-gray text
          cursor: '#f7768e',            // Pink cursor
          cursorAccent: '#1a1b26',      // Dark cursor accent
          selection: 'rgba(125, 207, 255, 0.3)',
          black: '#32344a',
          red: '#f7768e',               // Soft red
          green: '#9ece6a',             // Bright green for good visibility
          yellow: '#e0af68',            // Warm yellow
          blue: '#7aa2f7',              // Bright blue
          magenta: '#ad8ee6',           // Purple
          cyan: '#449dab',              // Teal
          white: '#787c99',
          brightBlack: '#444b6a',
          brightRed: '#ff7a93',
          brightGreen: '#b9f27c',       // Very bright green for prompts
          brightYellow: '#ff9e64',
          brightBlue: '#7da6ff',
          brightMagenta: '#bb9af7',
          brightCyan: '#0db9d7',
          brightWhite: '#acb0d0'
        },
        fontFamily: '"SF Mono", "Monaco", "Inconsolata", "Roboto Mono", "Source Code Pro", monospace',
        fontSize: 14,
        lineHeight: 1.2,
        cursorBlink: true,
        allowTransparency: true,
        convertEol: true,
        scrollback: 10000,
        rows: 24,
        cols: 80
      });

      if (terminal._isDisposed) {
        console.error('Terminal was disposed immediately after creation!');
        return;
      }

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();
      
      terminal.loadAddon(fitAddon);
      terminal.loadAddon(webLinksAddon);

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      // Open terminal in container
      setTimeout(() => {
        if (containerRef.current && terminal && !terminal._isDisposed) {
          try {
            terminal.open(containerRef.current);
            
            setTimeout(() => {
              const xtermElements = document.querySelectorAll('.xterm');
              if (xtermElements.length > 0) {
                fitAddon.fit();
                terminal.focus();
                
                // Auto-connect if session provided
                if (sessionId && autoConnect && !isConnected && !isConnecting) {
                  setTimeout(() => connectToSession(sessionId), 100);
                }
              }
            }, 50);
            
          } catch (error) {
            console.error('Error opening terminal:', error);
          }
        }
      }, 100);

      // Handle user input
      terminal.onData((data) => {
        if (sessionId) {
          sendInput(data);
        }
      });

      // Handle resize
      terminal.onResize(({ cols, rows }) => {
        if (sessionId && isConnected) {
          resizeSession(sessionId, rows, cols);
        }
      });

    } catch (err) {
      console.error('Failed to initialize terminal:', err);
      setError(`Failed to initialize terminal: ${err}`);
    }
  }, [theme, sessionId, autoConnect, isConnected, isConnecting]);

  // Connect to session
  const connectToSession = useCallback(async (targetSessionId: string) => {
    if (!terminalRef.current || terminalRef.current._isDisposed) {
      setError('Terminal not ready');
      return;
    }

    try {
      setIsConnecting(true);
      setError(null);

      // Get session info
      const info = await invoke<TerminalSessionInfo>('get_terminal_session', { 
        sessionId: targetSessionId 
      });

      // Clear terminal first
      terminalRef.current.clear();

      // NOW load and display history
      const history = await invoke<SessionHistoryEntry[]>('get_terminal_session_history', { 
        sessionId: targetSessionId, 
        lines: 1000 
      });
          
      for (const entry of history) {
        const text = new TextDecoder().decode(new Uint8Array(entry.data));
        if (entry.output_type === 'Stdout' || entry.output_type === 'SystemMessage') {
          terminalRef.current.write(text);
        } else if (entry.output_type === 'Stderr') {
          terminalRef.current.write(`\x1b[31m${text}\x1b[0m`);
        }
      }

      // Add user to session
      await invoke('add_user_to_terminal_session', {
        sessionId: targetSessionId,
        userId: 'current-user'
      });

      // Set up event listener for real-time output
      if (unlistenRef.current) {
        unlistenRef.current();
      }

      const unlisten = await listen<TerminalOutput>('terminal_output', (event) => {
        const output = event.payload;
        if (output.session_id === targetSessionId && terminalRef.current && !terminalRef.current._isDisposed) {
          const text = new TextDecoder().decode(new Uint8Array(output.data));
          
          if (output.output_type === 'Stdout' || output.output_type === 'SystemMessage') {
            terminalRef.current.write(text);
          } else if (output.output_type === 'Stderr') {
            terminalRef.current.write(`\x1b[31m${text}\x1b[0m`);
          }
        }
      });

      unlistenRef.current = unlisten;

      setSessionInfo(info);
      setConnectedUsers(info.connected_users);
      setIsConnected(true);


      if (!terminalRef.current._isDisposed) {
        terminalRef.current.focus();
      }

      // Refresh sessions list
      await loadSessions();

    } catch (err) {
      console.error('Failed to connect to session:', err);
      setError(`Failed to connect: ${err}`);
    } finally {
      setIsConnecting(false);
    }
  }, [loadSessions]);

  // Disconnect from session
  const disconnect = useCallback(async () => {
    if (!sessionId || !isConnected) return;

    try {
      await invoke('remove_user_from_terminal_session', {
        sessionId,
        userId: 'current-user'
      });

      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }

      setIsConnected(false);
      setSessionInfo(null);
      setConnectedUsers([]);
      
      await loadSessions();
    } catch (err) {
      console.error('Failed to disconnect:', err);
    }
  }, [sessionId, isConnected, loadSessions]);

  // Send input to terminal
  const sendInput = useCallback(async (data: string) => {
    if (!sessionId) return;

    try {
      await invoke('send_terminal_string', {
        sessionId,
        text: data,
        userId: 'current-user'
      });
    } catch (err) {
      console.error('Failed to send input:', err);
      setError(`Failed to send input: ${err}`);
    }
  }, [sessionId]);

  // Send command with newline
  const sendCommand = useCallback(async (command: string) => {
    return sendInput(command + '\r');
  }, [sendInput]);

  // Send control sequences
  const sendInterrupt = useCallback(async () => {
    if (!sessionId || !isConnected) return;
    
    try {
      await invoke('send_terminal_interrupt', {
        sessionId,
        userId: 'current-user'
      });
    } catch (err) {
      console.error('Failed to send interrupt:', err);
    }
  }, [sessionId, isConnected]);

  const sendEOF = useCallback(async () => {
    if (!sessionId || !isConnected) return;
    
    try {
      await invoke('send_terminal_eof', {
        sessionId,
        userId: 'current-user'
      });
    } catch (err) {
      console.error('Failed to send EOF:', err);
    }
  }, [sessionId, isConnected]);

  // Resize session
  const resizeSession = useCallback(async (targetSessionId: string, rows: number, cols: number) => {
    try {
      await invoke('resize_terminal_session', {
        sessionId: targetSessionId,
        rows,
        cols
      });
    } catch (err) {
      console.error('Failed to resize session:', err);
    }
  }, []);

  // Fit terminal to container
  const fitTerminal = useCallback(() => {
    if (fitAddonRef.current && containerRef.current && terminalRef.current && !terminalRef.current._isDisposed) {
      try {
        fitAddonRef.current.fit();
      } catch (err) {
        console.error('Failed to fit terminal:', err);
      }
    }
  }, []);

  // Create new terminal session
  const createSession = useCallback(async (
    config: {
      shell_type?: ShellType;
      working_directory?: string;
      initial_command?: string;
    } = {}
  ): Promise<string> => {
    try {
      setSessionsError(null);

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
      setSessionsError(`Failed to create session: ${err}`);
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
      setSessionsError(`Failed to create ${preset} session: ${err}`);
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
      setSessionsError(`Failed to disconnect from session: ${err}`);
    }
  }, [loadSessions]);

  // Reconnect UI to background session
  const reconnectToSession = useCallback(async (targetSessionId: string, userId: string = 'current-user') => {
    try {
      await invoke('reconnect_terminal_ui', { sessionId: targetSessionId, userId });
      await loadSessions();
    } catch (err) {
      console.error('Failed to reconnect to session:', err);
      setSessionsError(`Failed to reconnect to session: ${err}`);
    }
  }, [loadSessions]);

  // Terminate session (actually kill the process)
  const terminateSession = useCallback(async (targetSessionId: string) => {
    try {
      await invoke('terminate_terminal_session', { sessionId: targetSessionId });
      await loadSessions();
    } catch (err) {
      console.error('Failed to terminate session:', err);
      setSessionsError(`Failed to terminate session: ${err}`);
    }
  }, [loadSessions]);

  // Utility functions
  const getSession = useCallback((targetSessionId: string): TerminalSessionInfo | null => {
    return sessions.find(s => s.session_id === targetSessionId) || null;
  }, [sessions]);

  const isSessionInBackground = useCallback((targetSessionId: string): boolean => {
    return backgroundSessions.some(s => s.session_id === targetSessionId);
  }, [backgroundSessions]);

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

  // Set up event listeners for session updates
  useEffect(() => {
    const setupEventListeners = async () => {
      const listeners = await Promise.all([
        listen('terminal_session_created', () => loadSessions()),
        listen('terminal_session_terminated', () => loadSessions()),
        listen('terminal_ui_disconnected', () => loadSessions()),
        listen('terminal_ui_reconnected', () => loadSessions()),
        listen('terminal_session_cleaned_up', () => loadSessions()),
      ]);

      return () => {
        listeners.forEach(unlisten => unlisten());
      };
    };

    let cleanup: (() => void) | undefined;
    setupEventListeners().then(fn => cleanup = fn);

    return () => {
      if (cleanup) cleanup();
    };
  }, [loadSessions]);

  // Auto-connect effect
  useEffect(() => {
    if (sessionId && autoConnect && !isConnected && !isConnecting) {
      connectToSession(sessionId);
    }
  }, [sessionId, autoConnect, isConnected, isConnecting, connectToSession]);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
      }
      if (terminalRef.current && !terminalRef.current._isDisposed) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
    };
  }, []);

  return {
    // Terminal instance
    containerRef,
    terminal: terminalRef.current,
    fitAddon: fitAddonRef.current,
    
    // Connection state
    isConnected,
    isConnecting,
    sessionInfo,
    connectedUsers,
    error,
    
    // Session management
    sessions,
    backgroundSessions,
    activeSessions,
    sessionsLoading,
    sessionsError,
    
    // Terminal actions
    initializeTerminal,
    connectToSession,
    disconnect,
    sendInput,
    sendCommand,
    sendInterrupt,
    sendEOF,
    fitTerminal,
    
    // Session management actions
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
    
    // Computed values
    hasBackgroundSessions: backgroundSessions.length > 0,
    hasActiveSessions: activeSessions.length > 0,
  };
}