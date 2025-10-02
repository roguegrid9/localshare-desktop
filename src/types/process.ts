// src/types/process.ts

export type ProcessType = 'Terminal' | 'Network' | 'Unknown';

export type ProcessState =
  | 'Inactive'
  | 'Starting'
  | 'Running'
  | 'Stopping'
  | 'Stopped'
  | 'Exited'
  | 'Failed';

export interface ProcessConfig {
  executable_path: string;
  args: string[];
  env_vars: Record<string, string>;
  working_directory: string;
}

export interface ProcessStatus {
  process_id: string;
  grid_id: string;
  state: ProcessState;
  pid?: number;
  exit_code?: number;
  started_at: number; // Unix timestamp
  error_message?: string;
}

export interface ProcessInfo {
  process_id: string;
  grid_id: string;
  config: ProcessConfig;
  status: ProcessStatus;
  created_at: number; // Unix timestamp
  process_type: ProcessType;
  display_name?: string;
  metadata?: {
    display_name?: string;
  };
}

export interface ProcessEvent {
  event_type: ProcessEventType;
  grid_id: string;
  process_id: string;
  data?: any;
  timestamp: number;
}

export type ProcessEventType =
  | 'Started'
  | 'Stopped'
  | 'Exited'
  | 'Failed'
  | 'StdoutData'
  | 'StderrData'
  | 'StateChanged';

// Simplified discovery types
export interface DetectedProcess {
  pid: number;
  name: string;           // Process name from PID
  command: string;        // Full command line
  working_dir: string;    // Working directory
  port: number;          // Listening port
  executable_path: string; // Executable path
}

export type ScanScope = 
  | "Localhost"
  | { Network: string }
  | "Docker" 
  | { CustomIP: string };

export interface ScanConfig {
  scope: ScanScope;
  timeout_ms: number;
}

// Simple Process Configuration for MVP
export interface SimpleProcessConfig {
  // User-defined
  name: string;
  description?: string;
  
  // From discovery (read-only display)
  pid: number;
  port: number;
  command: string;
  working_dir: string;
  executable_path: string;
  process_name: string; // e.g., "node", "python3", "java"
}

// Validation error interface
export interface ValidationError {
  field: string;
  message: string;
}

// Process configuration modal props
export interface ProcessConfigModalProps {
  detectedProcess: DetectedProcess;
  gridId: string;
  onSuccess: (processId: string) => void;
  onCancel: () => void;
}
