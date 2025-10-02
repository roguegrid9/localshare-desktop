// Process Dashboard types

export interface ProcessDashboard {
  // Basic info
  id: string;
  name: string;
  description?: string;
  
  // Status
  status: 'running' | 'stopped' | 'error';
  uptime: number; // seconds
  last_seen_at?: Date;
  
  // Process details
  pid: number;
  command: string;
  working_dir: string;
  executable_path: string;
  
  // Connection info
  local_port: number;
  p2p_port: number;
  connection_status: 'active' | 'inactive' | 'error';
  
  // System stats (if running)
  cpu_percent?: number;
  memory_mb?: number;
  
  // Grid members
  grid_members_connected: GridMemberConnection[];
  
  // Ownership
  owner_id: string;
  owner_name: string;
  is_owner: boolean;
  
  // Grid context
  grid_id: string;
}

export interface GridMemberConnection {
  user_id: string;
  username: string;
  status: 'viewing' | 'connected'; // viewing = on dashboard, connected = tunneled
  connected_at: Date;
}

export interface ProcessStats {
  cpu_percent: number;
  memory_mb: number;
}

export interface ProcessDashboardProps {
  processId: string;
  gridId: string;
}

export interface ShareCodeResponse {
  code: string;
  expires_at: Date;
}