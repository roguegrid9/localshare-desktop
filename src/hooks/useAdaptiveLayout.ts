// Adaptive layout hook
// Auto-adjusts UI density based on context: window size, active content, user preferences

import { useEffect, useRef } from 'react';
import { useUIStore } from '../stores/useUIStore';

interface AdaptiveLayoutOptions {
  /**
   * Auto-collapse chat when terminal/editor is focused for this many ms
   * @default 3000
   */
  autoCollapseDelay?: number;

  /**
   * Force compact mode when window height is below this threshold (px)
   * @default 720
   */
  minHeightForFull?: number;

  /**
   * Enable adaptive behavior (can be disabled for testing)
   * @default true
   */
  enabled?: boolean;
}

const DEFAULT_OPTIONS: Required<AdaptiveLayoutOptions> = {
  autoCollapseDelay: 3000,
  minHeightForFull: 720,
  enabled: true,
};

/**
 * Hook to implement adaptive layout behavior
 *
 * Rules:
 * 1. Respect pin state - never auto-collapse if user pinned
 * 2. Auto-collapse chat when terminal/editor focused >3s
 * 3. Force compact mode when window height <720px
 * 4. Debounce layout changes to avoid jank
 */
export function useAdaptiveLayout(options: AdaptiveLayoutOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const {
    chat,
    voice,
    setChatMode,
    toggleChatDock,
    activeTabId,
    tabs,
  } = useUIStore();

  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActiveTabRef = useRef<string | undefined>(activeTabId);

  // Get active tab content type
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeContentType = activeTab?.content?.type;

  // Effect 1: Handle window height changes
  useEffect(() => {
    if (!opts.enabled) return;

    const handleResize = () => {
      const height = window.innerHeight;

      // Force compact mode on small screens
      if (height < opts.minHeightForFull) {
        if (chat.mode !== 'compact') {
          setChatMode('compact');
        }
      }
    };

    // Check on mount
    handleResize();

    // Listen for resize
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [opts.enabled, opts.minHeightForFull, chat.mode, setChatMode]);

  // Effect 2: Handle active content type changes
  useEffect(() => {
    if (!opts.enabled) return;

    // Respect pin state - never auto-collapse if pinned
    if (chat.pinned || voice.pinned) {
      return;
    }

    // Clear existing timer when tab changes
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }

    // Only trigger auto-collapse for specific content types
    const shouldAutoCollapse = [
      'Terminal',
      'Process',
      'Editor', // If you have an editor tab type
      'ProcessDashboard',
    ].includes(activeContentType || '');

    if (shouldAutoCollapse && chat.open) {
      // Set timer to auto-collapse after delay
      collapseTimerRef.current = setTimeout(() => {
        console.log(`[Adaptive Layout] Auto-collapsing chat after ${opts.autoCollapseDelay}ms focus on ${activeContentType}`);
        toggleChatDock(false);
      }, opts.autoCollapseDelay);
    }

    // Track last active tab
    lastActiveTabRef.current = activeTabId;

    return () => {
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current);
      }
    };
  }, [
    opts.enabled,
    opts.autoCollapseDelay,
    activeTabId,
    activeContentType,
    chat.pinned,
    chat.open,
    voice.pinned,
    toggleChatDock,
  ]);

  // Effect 3: Auto-expand chat when switching to chat/channel tabs
  useEffect(() => {
    if (!opts.enabled) return;

    // Respect pin state
    if (chat.pinned) {
      return;
    }

    // Auto-open chat when switching to chat/channel tabs
    const shouldAutoOpen = [
      'TextChannel',
      'MediaChannel',
      'VoiceChannel',
    ].includes(activeContentType || '');

    if (shouldAutoOpen && !chat.open) {
      console.log(`[Adaptive Layout] Auto-opening chat for ${activeContentType}`);
      toggleChatDock(true);
    }
  }, [opts.enabled, activeContentType, chat.pinned, chat.open, toggleChatDock]);

  // Return current adaptive state for debugging
  return {
    isAdaptive: opts.enabled,
    activeContentType,
    willAutoCollapse: !chat.pinned && ['Terminal', 'Process', 'Editor', 'ProcessDashboard'].includes(activeContentType || ''),
    windowHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
    isCompactForced: typeof window !== 'undefined' ? window.innerHeight < opts.minHeightForFull : false,
  };
}
