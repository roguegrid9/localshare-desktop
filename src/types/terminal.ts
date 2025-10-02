// src/types/terminal.ts

export interface CreateSessionRequest {
  grid_id?: string;
  shell_type?: string;
  working_directory?: string;
  initial_command?: string;
  session_name?: string;
}

export interface TerminalSessionInfo {
  session_id: string;
  grid_id?: string;
  shell_type: string;
  working_directory: string;
  created_at: string;
  last_activity: string;
  is_active: boolean;
  connected_users: string[];
  session_name?: string;
  initial_command?: string;
}

export interface TerminalInput {
  session_id: string;
  user_id?: string;
  data: number[];
  timestamp: string;
}

export interface TerminalOutput {
  session_id: string;
  timestamp: string;
  data: number[];
  output_type: 'Stdout' | 'Stderr' | 'UserInput' | 'SystemMessage';
}

export interface SessionHistoryEntry {
  timestamp: string;
  data: number[];
  output_type: 'Stdout' | 'Stderr' | 'UserInput' | 'SystemMessage';
}

export interface TerminalSessionConfig {
  name: string;
  shell_type: string;
  working_directory: string;
  initial_command?: string;
  auto_restart: boolean;
  visibility: 'private' | 'grid' | 'public';
  permissions: {
    can_view: boolean;
    can_input: boolean;
    can_control: boolean;
  };
}

export type ShellType = 'bash' | 'zsh' | 'fish' | 'powershell' | 'cmd' | 'pwsh';

export interface TerminalStats {
  uptime: number;
  commands_executed: number;
  data_sent: number;
  data_received: number;
}

export interface PersistedSessionMetadata {
  session_id: string;
  grid_id?: string;
  shell_type: string;
  working_directory: string;
  environment_vars: Record<string, string>;
  pid?: number;
  created_at: string;
  last_activity: string;
  command_history: string[];
  current_command?: string;
  is_background: boolean;
  total_output_bytes: number;
  session_name?: string;
}

export interface SessionRecoveryInfo {
  recovered: number;
  failed: number;
  total: number;
}