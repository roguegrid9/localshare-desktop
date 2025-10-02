// Window management types that match the Rust backend

export type TabContentType = 
  | { type: 'Terminal'; data: { session_id: string; grid_id?: string; title: string } }
  | { type: 'TextChannel'; data: { channel_id: string; grid_id: string; channel_name: string } }
  | { type: 'MediaChannel'; data: { channel_id: string; grid_id: string; channel_name: string; media_type: MediaType } }
  | { type: 'VoiceChannel'; data: { channel_id: string; grid_id: string; channel_name: string } }
  | { type: 'Process'; data: { process_id: string; grid_id: string; process_name: string } }
  | { type: 'Container'; data: { container_id: string; grid_id: string; container_name: string } }  // ADD THIS LINE
  | { type: 'DirectMessage'; data: { conversation_id: string; user_name: string } }
  | { type: 'GridDashboard'; data: { grid_id: string; grid_name: string } }
  | { type: 'Welcome'; data: {} };

export type MediaType = 'Voice' | 'Video' | 'Both';

export interface Tab {
  id: string;
  title: string;
  content: TabContentType;
  is_active: boolean;
  is_closable: boolean;
  created_at: string;
  last_accessed: string;
  icon?: string;
  has_notifications: boolean;
  metadata: Record<string, any>;
}

export type WindowType = 'Main' | 'Detached' | 'Popup';

export interface WindowPosition {
  x: number;
  y: number;
}

export interface WindowSize {
  width: number;
  height: number;
}

export interface WindowState {
  id: string;
  label: string;
  title: string;
  tabs: Tab[];
  active_tab_id?: string;
  window_type: WindowType;
  is_main_window: boolean;
  created_at: string;
  position?: WindowPosition;
  size?: WindowSize;
}

export interface CreateTabRequest {
  content: TabContentType;
  title?: string;
  window_id?: string;
}

export interface DetachTabRequest {
  tab_id: string;
  source_window_id: string;
  position?: WindowPosition;
  size?: WindowSize;
}

export interface ReattachTabRequest {
  tab_id: string;
  source_window_id: string;
  target_window_id: string;
  position_index?: number;
}

export interface MoveTabRequest {
  tab_id: string;
  source_window_id: string;
  target_window_id: string;
  position_index?: number;
}

export interface AllWindowsResponse {
  windows: WindowState[];
  main_window_id: string;
}

export interface WindowStateResponse {
  window: WindowState;
}

export type WindowEventType = 
  | 'WindowCreated'
  | 'WindowClosed'
  | 'TabCreated'
  | 'TabClosed'
  | 'TabMoved'
  | 'TabActivated'
  | 'TabDetached'
  | 'TabReattached'
  | 'WindowFocused'
  | 'WindowResized'
  | 'WindowMoved';

export interface WindowStateChangeEvent {
  event_type: WindowEventType;
  window_id: string;
  tab_id?: string;
  data: any;
  timestamp: string;
}

// Drag and drop types
export interface DragData {
  type: 'tab';
  tab_id: string;
  source_window_id: string;
  tab_title: string;
  tab_content: TabContentType;
}

// Window configuration for creation
export interface WindowConfig {
  title: string;
  width: number;
  height: number;
  min_width?: number;
  min_height?: number;
  position?: WindowPosition;
  resizable: boolean;
  maximized: boolean;
  visible: boolean;
  always_on_top: boolean;
}
