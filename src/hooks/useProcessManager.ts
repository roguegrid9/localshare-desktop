// src/hooks/useProcessManager.ts - INTEGRATED with terminal-process system

import { useCallback, useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { ProcessConfig, ProcessStatus, ProcessInfo } from '../types/process';

// NEW: Terminal process interfaces
interface TerminalProcessConfig {
  command: string;
  workingDirectory?: string;
}

interface CreateTerminalProcessRequest {
  gridId: string;
  shellType?: string;
  workingDirectory?: string;
  initialCommand?: string;
  processName?: string;
  autoHostGrid?: boolean;
}

interface TerminalProcessResult {
  processId: string;
  sessionId: string;
  gridId: string;
  transportId?: string;
  isHostingGrid: boolean;
}

interface TerminalProcessInfo {
  processId: string;
  sessionId: string;
  gridId: string;
  shellType: string;
  workingDirectory: string;
  isActive: boolean;
  connectedUsers: number;
  supportsPortSharing: boolean;
  createdAt: number;
}

interface PortForwardConfig {
  port: number;
  processName: string;
}

interface GamePresetConfig {
  gameType: string;
  customOptions?: Record<string, any>;
}

export function useProcessManager() {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [terminalProcesses, setTerminalProcesses] = useState<TerminalProcessInfo[]>([]);
  const [processOutputs, setProcessOutputs] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize process manager
  const initializeProcessManager = useCallback(async () => {
    try {
      await invoke('initialize_process_manager');
    } catch (err) {
      console.error('Failed to initialize process manager:', err);
      setError(err as string);
    }
  }, []);

  // NEW: Create terminal as integrated process
  const createTerminalProcess = useCallback(async (
    request: CreateTerminalProcessRequest
  ): Promise<TerminalProcessResult> => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Creating integrated terminal process:', request);
      
      const result = await invoke<TerminalProcessResult>('create_terminal_as_grid_process', {
        gridId: request.gridId,
        shellType: request.shellType,
        workingDirectory: request.workingDirectory,
        initialCommand: request.initialCommand,
        processName: request.processName,
        autoHostGrid: request.autoHostGrid,
      });
      
      // Refresh both process lists
      await Promise.all([
        loadActiveProcesses(),
        loadTerminalProcesses(request.gridId)
      ]);
      
      return result;
    } catch (err) {
      const errorMsg = err as string;
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  // NEW: Create quick terminal (blank terminal)
  const createQuickTerminal = useCallback(async (
    gridId: string,
    autoHost: boolean = true
  ): Promise<TerminalProcessResult> => {
    return createTerminalProcess({
      gridId,
      autoHostGrid: autoHost,
      processName: 'Terminal'
    });
  }, [createTerminalProcess]);

  // NEW: Create terminal with command
  const createTerminalWithCommand = useCallback(async (
    gridId: string,
    command: string,
    workingDirectory?: string,
    autoHost: boolean = true
  ): Promise<TerminalProcessResult> => {
    return createTerminalProcess({
      gridId,
      initialCommand: command,
      workingDirectory,
      autoHostGrid: autoHost,
      processName: `Terminal: ${command}`
    });
  }, [createTerminalProcess]);

  // NEW: Load terminal processes for a grid
  const loadTerminalProcesses = useCallback(async (gridId: string): Promise<void> => {
    try {
      const terminals = await invoke<TerminalProcessInfo[]>('get_grid_terminal_processes', {
        gridId
      });
      setTerminalProcesses(terminals);
    } catch (err) {
      console.error('Failed to load terminal processes:', err);
    }
  }, []);

  // NEW: Send input to terminal process
  const sendTerminalProcessInput = useCallback(async (
    gridId: string,
    input: string
  ): Promise<void> => {
    try {
      await invoke('send_terminal_process_input', {
        gridId,
        input
      });
    } catch (err) {
      console.error('Failed to send terminal process input:', err);
      throw new Error(err as string);
    }
  }, []);

  // NEW: Stop terminal process
  const stopTerminalProcess = useCallback(async (gridId: string): Promise<void> => {
    try {
      setLoading(true);
      await invoke('stop_terminal_process', { gridId });
      await Promise.all([
        loadActiveProcesses(),
        loadTerminalProcesses(gridId)
      ]);
    } catch (err) {
      const errorMsg = err as string;
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  // NEW: Check if grid has terminal process
  const gridHasTerminalProcess = useCallback(async (gridId: string): Promise<boolean> => {
    try {
      return await invoke<boolean>('grid_has_terminal_process', { gridId });
    } catch (err) {
      console.error('Failed to check terminal process:', err);
      return false;
    }
  }, []);

  // NEW: Get terminal session ID for grid
  const getGridTerminalSessionId = useCallback(async (gridId: string): Promise<string | null> => {
    try {
      return await invoke<string | null>('get_grid_terminal_session_id', { gridId });
    } catch (err) {
      console.error('Failed to get terminal session ID:', err);
      return null;
    }
  }, []);

  // EXISTING: Start a process for a grid (legacy method)
  const startProcess = useCallback(async (gridId: string, config: ProcessConfig): Promise<string> => {
    try {
      setLoading(true);
      setError(null);
      const processId = await invoke<string>('start_process', { gridId, config });
      await loadActiveProcesses();
      return processId;
    } catch (err) {
      const errorMsg = err as string;
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  // EXISTING: Start a grid process (combines hosting + process start)
  const startGridProcess = useCallback(async (gridId: string, config: ProcessConfig): Promise<string> => {
    try {
      setLoading(true);
      setError(null);
      const processId = await invoke<string>('start_grid_process', { gridId, config });
      await loadActiveProcesses();
      return processId;
    } catch (err) {
      const errorMsg = err as string;
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  // UPDATED: Start a terminal command process (now uses integrated system)
  const startTerminalProcess = useCallback(async (
    gridId: string, 
    config: TerminalProcessConfig
  ): Promise<string> => {
    try {
      const result = await createTerminalWithCommand(
        gridId,
        config.command,
        config.workingDirectory,
        true // Auto-host grid
      );
      return result.processId;
    } catch (err) {
      const errorMsg = err as string;
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, [createTerminalWithCommand]);

  // EXISTING: Start a port forwarding process
  const startPortForwardProcess = useCallback(async (
    gridId: string, 
    config: PortForwardConfig
  ): Promise<string> => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Starting port forward process for grid:', gridId, config);
      
      const processId = await invoke<string>('start_port_forward_process', {
        gridId,
        port: config.port,
        processName: config.processName
      });
      
      await loadActiveProcesses();
      return processId;
    } catch (err) {
      const errorMsg = err as string;
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  // EXISTING: Start a game preset process
  const startGamePresetProcess = useCallback(async (
    gridId: string, 
    config: GamePresetConfig
  ): Promise<string> => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Starting game preset process for grid:', gridId, config);
      
      const processId = await invoke<string>('start_game_preset_process', {
        gridId,
        gameType: config.gameType,
        customOptions: config.customOptions || {}
      });
      
      await loadActiveProcesses();
      return processId;
    } catch (err) {
      const errorMsg = err as string;
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  // EXISTING: Validate a terminal command before running
  const validateTerminalCommand = useCallback(async (
    command: string, 
    workingDirectory?: string
  ): Promise<{
    isValid: boolean;
    executable: string;
    args: string[];
    detectedPort?: number;
    suggestion?: string;
    error?: string;
  }> => {
    try {
      return await invoke('validate_terminal_command', {
        command,
        workingDirectory: workingDirectory || undefined
      });
    } catch (err) {
      return {
        isValid: false,
        executable: '',
        args: [],
        error: err as string
      };
    }
  }, []);

  // EXISTING: Get common ports that are currently in use
  const getCommonPortsInUse = useCallback(async (): Promise<number[]> => {
    try {
      return await invoke<number[]>('get_common_ports_in_use');
    } catch (err) {
      console.error('Failed to get ports in use:', err);
      return [];
    }
  }, []);

  // EXISTING: Get command templates for quick setup
  const getCommandTemplates = useCallback(async (): Promise<{
    name: string;
    command: string;
    description: string;
    category: string;
    defaultPort?: number;
  }[]> => {
    try {
      return await invoke('get_command_templates');
    } catch (err) {
      console.error('Failed to get command templates:', err);
      return [];
    }
  }, []);

  // EXISTING: Stop a process
  const stopProcess = useCallback(async (gridId: string): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      await invoke('stop_process', { gridId });
      await loadActiveProcesses();
    } catch (err) {
      const errorMsg = err as string;
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  // EXISTING: Stop a grid process (combines process stop + host release)
  const stopGridProcess = useCallback(async (gridId: string): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      await invoke('stop_grid_process', { gridId });
      await loadActiveProcesses();
    } catch (err) {
      const errorMsg = err as string;
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  // EXISTING: Get process status for a specific grid
  const getProcessStatus = useCallback(async (gridId: string): Promise<ProcessStatus> => {
    try {
      return await invoke<ProcessStatus>('get_process_status', { gridId });
    } catch (err) {
      console.error('Failed to get process status:', err);
      throw new Error(err as string);
    }
  }, []);

  // UPDATED: Send input to a process (handles both regular and terminal processes)
  const sendProcessInput = useCallback(async (gridId: string, input: string): Promise<void> => {
    try {
      // Check if this is a terminal process first
      const hasTerminal = await gridHasTerminalProcess(gridId);
      if (hasTerminal) {
        await sendTerminalProcessInput(gridId, input);
      } else {
        await invoke('send_process_input', { gridId, input });
      }
    } catch (err) {
      console.error('Failed to send process input:', err);
      throw new Error(err as string);
    }
  }, [gridHasTerminalProcess, sendTerminalProcessInput]);

  // EXISTING: Send data via P2P to a grid process
  const sendGridProcessData = useCallback(async (gridId: string, data: number[]): Promise<void> => {
    try {
      await invoke('send_grid_process_data', { gridId, data });
    } catch (err) {
      console.error('Failed to send grid process data:', err);
      throw new Error(err as string);
    }
  }, []);

  // EXISTING: Load active processes
  const loadActiveProcesses = useCallback(async (): Promise<void> => {
    try {
      const activeProcesses = await invoke<ProcessInfo[]>('get_active_processes');
      setProcesses(activeProcesses);
    } catch (err) {
      console.error('Failed to load active processes:', err);
      setError(err as string);
    }
  }, []);

  // EXISTING: Clear process outputs for a grid
  const clearProcessOutput = useCallback((gridId: string) => {
    setProcessOutputs(prev => ({
      ...prev,
      [gridId]: []
    }));
  }, []);

  // EXISTING: Add output line to a grid's process output
  const addProcessOutput = useCallback((gridId: string, line: string) => {
    setProcessOutputs(prev => ({
      ...prev,
      [gridId]: [...(prev[gridId] || []), line]
    }));
  }, []);

  // ENHANCED: Set up event listeners for both regular and terminal process events
  useEffect(() => {
    let mounted = true;
    let cleanupFn: (() => void) | undefined;

    const setupEventListeners = async () => {
      try {
        // Listen for process started events
        const unlistenStarted = await listen<any>('process_started', (event) => {
          if (!mounted) return;
          console.log('Process started:', event.payload);
          loadActiveProcesses();

          // If it's a terminal process, also refresh terminal processes
          if (event.payload.process_type === 'terminal') {
            loadTerminalProcesses(event.payload.grid_id);
          }
        });

        // Listen for process stopped events
        const unlistenStopped = await listen<any>('process_stopped', (event) => {
          if (!mounted) return;
          console.log('Process stopped:', event.payload);
          loadActiveProcesses();

          // If it's a terminal process, also refresh terminal processes
          if (event.payload.process_type === 'terminal') {
            loadTerminalProcesses(event.payload.grid_id);
          }
        });

        // Listen for process exited events
        const unlistenExited = await listen<any>('process_exited', (event) => {
          if (!mounted) return;
          console.log('Process exited:', event.payload);
          loadActiveProcesses();
        });

        // Listen for process stdout
        const unlistenStdout = await listen<any>('process_stdout', (event) => {
          if (!mounted) return;
          const { grid_id, data } = event.payload;
          if (data && Array.isArray(data)) {
            const text = new TextDecoder().decode(new Uint8Array(data));
            addProcessOutput(grid_id, text.trim());
          }
        });

        // Listen for process stderr
        const unlistenStderr = await listen<any>('process_stderr', (event) => {
          if (!mounted) return;
          const { grid_id, data } = event.payload;
          if (data) {
            addProcessOutput(grid_id, `[ERROR] ${data}`);
          }
        });

        // NEW: Listen for terminal output events
        const unlistenTerminalOutput = await listen<any>('terminal_output', (event) => {
          if (!mounted) return;
          const { session_id, data } = event.payload;
          if (data && Array.isArray(data)) {
            const text = new TextDecoder().decode(new Uint8Array(data));
            // Find which grid this terminal belongs to by session ID
            // Note: We use the session_id directly here rather than relying on state
            const terminal = terminalProcesses.find(t => t.sessionId === session_id);
            if (terminal) {
              addProcessOutput(terminal.gridId, text.trim());
            }
          }
        });

        // Listen for custom refresh-processes event
        const handleProcessRefresh = () => {
          if (!mounted) return;
          console.log('Custom refresh-processes event received, reloading active processes');
          loadActiveProcesses();
        };

        window.addEventListener('refresh-processes', handleProcessRefresh);

        cleanupFn = () => {
          unlistenStarted();
          unlistenStopped();
          unlistenExited();
          unlistenStdout();
          unlistenStderr();
          unlistenTerminalOutput();
          window.removeEventListener('refresh-processes', handleProcessRefresh);
        };
      } catch (error) {
        console.error('Failed to setup event listeners:', error);
      }
    };

    setupEventListeners();

    return () => {
      mounted = false;
      if (cleanupFn) {
        cleanupFn();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadActiveProcesses, addProcessOutput]);


  useEffect(() => {
    const init = async () => {
      try {
        // Don't call initializeProcessManager here - it's already initialized in lib.rs
        await loadActiveProcesses();
      } catch (error) {
        console.error('Failed to load active processes:', error);
        setError(error as string);
      }
    };
    init();
  }, [loadActiveProcesses]);

  return {
    // State
    processes,
    terminalProcesses,
    processOutputs,
    loading,
    error,

    // NEW: Terminal Process Actions
    createTerminalProcess,
    createQuickTerminal,
    createTerminalWithCommand,
    loadTerminalProcesses,
    sendTerminalProcessInput,
    stopTerminalProcess,
    gridHasTerminalProcess,
    getGridTerminalSessionId,

    // EXISTING Actions
    initializeProcessManager,
    startProcess,
    startGridProcess,
    stopProcess,
    stopGridProcess,
    getProcessStatus,
    sendProcessInput,
    sendGridProcessData,
    loadActiveProcesses,
    clearProcessOutput,

    // LEGACY Actions - Terminal Command Support (now use integrated system)
    startTerminalProcess,
    startPortForwardProcess,
    startGamePresetProcess,
    validateTerminalCommand,
    getCommonPortsInUse,
    getCommandTemplates,
 

    // EXISTING Utilities
    getProcessForGrid: (gridId: string) => processes.find(p => p.grid_id === gridId),
    getTerminalForGrid: (gridId: string) => terminalProcesses.find(t => t.gridId === gridId),
    getProcessOutput: (gridId: string) => processOutputs[gridId] || [],
  };

  
}