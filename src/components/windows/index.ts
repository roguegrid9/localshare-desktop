// Main components
export { WindowContainer } from './WindowContainer';
export { TabContainer } from './TabContainer';
export { DetachableTab } from './DetachableTab';
export { TabContent } from './TabContent';
export { WindowStateProvider, useWindowStateContext } from './WindowStateProvider';

// Hooks
export { useWindowManager } from '../hooks/useWindowManager';
export { useWindowState } from '../hooks/useWindowState';

// Types (re-export for convenience)
export type {
  WindowState,
  Tab,
  TabContentType,
  WindowType,
  WindowPosition,
  WindowSize,
  CreateTabRequest,
  DetachTabRequest,
  ReattachTabRequest,
  MoveTabRequest,
  AllWindowsResponse,
  WindowStateResponse,
  WindowEventType,
  WindowStateChangeEvent,
  DragData,
  WindowConfig,
  MediaType,
} from '../../types/windows';
