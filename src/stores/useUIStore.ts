// Zustand UI Store - Centralized layout state management
// Manages: tabs, chat dock, voice drawer, toasts, network status

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { ComponentType } from 'react';
import {
  loadLayoutPreferences,
  setChatHeight as persistChatHeight,
  setChatPinned as persistChatPinned,
  setLayoutMode as persistLayoutMode,
  setVoicePinned as persistVoicePinned,
} from '../utils/storage';
import {
  loadBubbleLayout,
  saveBubbleLayout,
  type PersistedBubbleLayout,
} from '../utils/bubbleStorage';

// Types
export interface Tab {
  id: string;
  title: string;
  icon?: ComponentType<{ className?: string }>;
  content: any; // TabContentType from existing types
  isPinned?: boolean;
}

export interface Participant {
  id: string;
  name: string;
  muted: boolean;
  speaking: boolean;
  audioLevel: number;
}

export interface ChatState {
  open: boolean;
  height: number;
  mode: 'compact' | 'full' | 'auto';
  pinned: boolean;
  currentGridId?: string;
  currentChannelId?: string;
}

export interface VoiceState {
  inCall: boolean;
  muted: boolean;
  drawerOpen: boolean;
  activeChannelId?: string;
  participants: Participant[];
  deviceError: string | null;
  audioLevel: number;
  speaking: boolean;
  pinned: boolean;
}

export interface TitleBarState {
  height: number;
  unreadCount: number;
  networkStatus: 'excellent' | 'good' | 'fair' | 'poor' | 'offline';
}

export interface MessagePill {
  id: string;
  channelId: string;
  channelName: string;
  username: string;
  messagePreview?: string;
  timestamp: Date;
}

export interface VoicePill {
  id: string;
  channelId: string;
  channelName: string;
  isMuted: boolean;
  isDeafened: boolean;
  participantCount: number;
  lastActivity: Date;
}

export interface DynamicIslandState {
  messagePills: MessagePill[];
  voicePills: VoicePill[];
  selectedVoicePillId: string | null;
}

export interface CompactViewState {
  open: boolean;
  channelId: string | null;
  position: { x: number; y: number };
}

export interface BottomViewState {
  open: boolean;
  messageId: string | null;
  channelId: string | null;
}

// Bubble Dock Types (new collapsible bubble system)
export interface ChatBubble {
  id: string;
  type: 'message' | 'voice';
  channelId: string;
  channelName: string;
  username?: string;         // for message bubbles
  messagePreview?: string;   // for message bubbles
  unread?: number;           // for message bubbles
  isMuted?: boolean;         // for voice bubbles
  isDeafened?: boolean;      // for voice bubbles
  speaking?: boolean;        // for voice bubbles
  participantCount?: number; // for voice bubbles
  expanded: boolean;
  docked: boolean;           // docked vs free-floating
  position?: { x: number; y: number }; // for free-floating
  zIndex: number;
  lastFocused: Date;
}

export interface BubbleDockState {
  bubbles: ChatBubble[];
  maxDocked: number;         // default 4
  dockOrder: string[];       // IDs from right-to-left
}

interface UIStore {
  // State
  tabs: Tab[];
  activeTabId?: string;
  chat: ChatState;
  voice: VoiceState;
  titlebar: TitleBarState;
  dynamicIsland: DynamicIslandState;
  compactView: CompactViewState;
  bottomView: BottomViewState;
  bubbleDock: BubbleDockState;

  // Tab Actions
  setTabs: (tabs: Tab[]) => void;
  setActiveTabId: (id: string) => void;
  addTab: (tab: Tab) => void;
  closeTab: (id: string) => void;
  updateTab: (id: string, updates: Partial<Tab>) => void;
  pinTab: (id: string, pinned: boolean) => void;

  // Chat Actions
  toggleChatDock: (open?: boolean) => void;
  setChatHeight: (height: number) => void;
  setChatMode: (mode: 'compact' | 'full' | 'auto') => void;
  pinChat: (pinned: boolean) => void;
  setCurrentChat: (gridId: string, channelId: string) => void;

  // Voice Actions
  toggleVoiceDrawer: (open?: boolean) => void;
  setMuted: (muted: boolean) => void;
  setVoiceChannel: (channelId: string | undefined) => void;
  setParticipants: (participants: Participant[]) => void;
  updateParticipant: (id: string, updates: Partial<Participant>) => void;
  setDeviceError: (error: string | null) => void;
  setAudioLevel: (level: number) => void;
  setSpeaking: (speaking: boolean) => void;
  setInCall: (inCall: boolean) => void;
  pinVoice: (pinned: boolean) => void;

  // TitleBar Actions
  setUnreadCount: (count: number) => void;
  setNetworkStatus: (status: TitleBarState['networkStatus']) => void;

  // Dynamic Island Actions
  addMessagePill: (pill: MessagePill) => void;
  removeMessagePill: (id: string) => void;
  addVoicePill: (pill: VoicePill) => void;
  removeVoicePill: (id: string) => void;
  updateVoicePill: (id: string, updates: Partial<VoicePill>) => void;
  selectVoicePill: (id: string | null) => void;

  // Compact View Actions
  openCompactView: (channelId: string, position?: { x: number; y: number }) => void;
  closeCompactView: () => void;
  setCompactViewPosition: (position: { x: number; y: number }) => void;

  // Bottom View Actions
  openBottomView: (messageId: string, channelId: string) => void;
  closeBottomView: () => void;

  // Bubble Dock Actions (new collapsible bubble system)
  openBubble: (type: 'message' | 'voice', data: Partial<ChatBubble>) => void;
  closeBubble: (id: string) => void;
  toggleBubbleExpand: (id: string) => void;
  dockBubble: (id: string) => void;
  undockBubble: (id: string, position: { x: number; y: number }) => void;
  updateBubblePosition: (id: string, position: { x: number; y: number }) => void;
  focusBubble: (id: string) => void;
  reorderDock: (order: string[]) => void;
  updateBubble: (id: string, updates: Partial<ChatBubble>) => void;

  // Initialization
  initializeFromStorage: () => Promise<void>;
}

export const useUIStore = create<UIStore>()(
  subscribeWithSelector((set, get) => ({
  // Initial State
  tabs: [],
  activeTabId: undefined,
  chat: {
    open: false,
    height: 280,
    mode: 'compact',
    pinned: false,
  },
  voice: {
    inCall: false,
    muted: true,
    drawerOpen: false,
    participants: [],
    deviceError: null,
    audioLevel: 0,
    speaking: false,
    pinned: false,
  },
  titlebar: {
    height: 48,
    unreadCount: 0,
    networkStatus: 'good',
  },
  dynamicIsland: {
    messagePills: [],
    voicePills: [],
    selectedVoicePillId: null,
  },
  compactView: {
    open: false,
    channelId: null,
    position: { x: 100, y: 100 },
  },
  bottomView: {
    open: false,
    messageId: null,
    channelId: null,
  },
  bubbleDock: {
    bubbles: [],
    maxDocked: 4,
    dockOrder: [],
  },

  // Tab Actions
  setTabs: (tabs) => set({ tabs }),

  setActiveTabId: (id) => set({ activeTabId: id }),

  addTab: (tab) => set((state) => ({
    tabs: [...state.tabs, tab],
    activeTabId: tab.id,
  })),

  closeTab: (id) => set((state) => {
    const newTabs = state.tabs.filter((t) => t.id !== id);
    let newActiveTabId = state.activeTabId;

    // If closing the active tab, switch to the next one
    if (state.activeTabId === id && newTabs.length > 0) {
      const closedIndex = state.tabs.findIndex((t) => t.id === id);
      newActiveTabId = newTabs[Math.min(closedIndex, newTabs.length - 1)]?.id;
    }

    return { tabs: newTabs, activeTabId: newActiveTabId };
  }),

  updateTab: (id, updates) => set((state) => ({
    tabs: state.tabs.map((tab) =>
      tab.id === id ? { ...tab, ...updates } : tab
    ),
  })),

  pinTab: (id, pinned) => set((state) => ({
    tabs: state.tabs.map((tab) =>
      tab.id === id ? { ...tab, isPinned: pinned } : tab
    ),
  })),

  // Chat Actions
  toggleChatDock: (open) => set((state) => ({
    chat: { ...state.chat, open: open ?? !state.chat.open },
  })),

  setChatHeight: (height) => {
    const { chat } = get();
    set({ chat: { ...chat, height } });

    // Persist to storage
    if (chat.currentGridId && chat.currentChannelId) {
      void persistChatHeight(chat.currentGridId, chat.currentChannelId, height);
    }
  },

  setChatMode: (mode) => {
    const { chat } = get();
    set({ chat: { ...chat, mode } });
    void persistLayoutMode(mode);
  },

  pinChat: (pinned) => {
    const { chat } = get();
    set({ chat: { ...chat, pinned } });

    // Persist to storage
    if (chat.currentGridId && chat.currentChannelId) {
      void persistChatPinned(chat.currentGridId, chat.currentChannelId, pinned);
    }
  },

  setCurrentChat: (gridId, channelId) => set((state) => ({
    chat: { ...state.chat, currentGridId: gridId, currentChannelId: channelId },
  })),

  // Voice Actions
  toggleVoiceDrawer: (open) => set((state) => ({
    voice: { ...state.voice, drawerOpen: open ?? !state.voice.drawerOpen },
  })),

  setMuted: (muted) => set((state) => ({
    voice: { ...state.voice, muted },
  })),

  setVoiceChannel: (channelId) => set((state) => ({
    voice: {
      ...state.voice,
      activeChannelId: channelId,
      inCall: !!channelId,
    },
  })),

  setParticipants: (participants) => set((state) => ({
    voice: { ...state.voice, participants },
  })),

  updateParticipant: (id, updates) => set((state) => ({
    voice: {
      ...state.voice,
      participants: state.voice.participants.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    },
  })),

  setDeviceError: (error) => set((state) => ({
    voice: { ...state.voice, deviceError: error },
  })),

  setAudioLevel: (level) => set((state) => ({
    voice: { ...state.voice, audioLevel: level },
  })),

  setSpeaking: (speaking) => set((state) => ({
    voice: { ...state.voice, speaking },
  })),

  setInCall: (inCall) => set((state) => ({
    voice: { ...state.voice, inCall },
  })),

  pinVoice: (pinned) => {
    set((state) => ({
      voice: { ...state.voice, pinned },
    }));
    void persistVoicePinned(pinned);
  },

  // TitleBar Actions
  setUnreadCount: (count) => set((state) => ({
    titlebar: { ...state.titlebar, unreadCount: count },
  })),

  setNetworkStatus: (status) => set((state) => ({
    titlebar: { ...state.titlebar, networkStatus: status },
  })),

  // Dynamic Island Actions
  addMessagePill: (pill) => set((state) => ({
    dynamicIsland: {
      ...state.dynamicIsland,
      messagePills: [...state.dynamicIsland.messagePills, pill],
    },
  })),

  removeMessagePill: (id) => set((state) => ({
    dynamicIsland: {
      ...state.dynamicIsland,
      messagePills: state.dynamicIsland.messagePills.filter((p) => p.id !== id),
    },
  })),

  addVoicePill: (pill) => set((state) => {
    const existingPill = state.dynamicIsland.voicePills.find((p) => p.channelId === pill.channelId);
    if (existingPill) return state; // Don't add duplicate

    const newVoicePills = [...state.dynamicIsland.voicePills, pill];
    return {
      dynamicIsland: {
        ...state.dynamicIsland,
        voicePills: newVoicePills,
        // Auto-select first voice pill if none selected
        selectedVoicePillId: state.dynamicIsland.selectedVoicePillId || pill.id,
      },
    };
  }),

  removeVoicePill: (id) => set((state) => {
    const newVoicePills = state.dynamicIsland.voicePills.filter((p) => p.id !== id);
    let newSelectedId = state.dynamicIsland.selectedVoicePillId;

    // If removing selected pill, select another one
    if (state.dynamicIsland.selectedVoicePillId === id) {
      newSelectedId = newVoicePills.length > 0 ? newVoicePills[0].id : null;
    }

    return {
      dynamicIsland: {
        ...state.dynamicIsland,
        voicePills: newVoicePills,
        selectedVoicePillId: newSelectedId,
      },
    };
  }),

  updateVoicePill: (id, updates) => set((state) => ({
    dynamicIsland: {
      ...state.dynamicIsland,
      voicePills: state.dynamicIsland.voicePills.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    },
  })),

  selectVoicePill: (id) => set((state) => ({
    dynamicIsland: {
      ...state.dynamicIsland,
      selectedVoicePillId: id,
    },
  })),

  // Compact View Actions
  openCompactView: (channelId, position) => set((state) => ({
    compactView: {
      open: true,
      channelId,
      position: position || state.compactView.position,
    },
  })),

  closeCompactView: () => set((state) => ({
    compactView: {
      ...state.compactView,
      open: false,
    },
  })),

  setCompactViewPosition: (position) => set((state) => ({
    compactView: {
      ...state.compactView,
      position,
    },
  })),

  // Bottom View Actions
  openBottomView: (messageId, channelId) => set({
    bottomView: {
      open: true,
      messageId,
      channelId,
    },
  }),

  closeBottomView: () => set((state) => ({
    bottomView: {
      ...state.bottomView,
      open: false,
    },
  })),

  // Bubble Dock Actions
  openBubble: (type, data) => set((state) => {
    // Check if bubble already exists
    const existing = state.bubbleDock.bubbles.find(
      (b) => b.channelId === data.channelId && b.type === type
    );

    if (existing) {
      // If exists, focus it and optionally expand
      const updated = state.bubbleDock.bubbles.map((b) =>
        b.id === existing.id
          ? { ...b, expanded: data.expanded ?? b.expanded, lastFocused: new Date() }
          : b
      );
      return {
        bubbleDock: {
          ...state.bubbleDock,
          bubbles: updated,
        },
      };
    }

    // Create new bubble
    const maxZIndex = Math.max(0, ...state.bubbleDock.bubbles.map((b) => b.zIndex));
    const newBubble: ChatBubble = {
      id: data.id || `${type}-${data.channelId}-${Date.now()}`,
      type,
      channelId: data.channelId!,
      channelName: data.channelName!,
      username: data.username,
      messagePreview: data.messagePreview,
      unread: data.unread || 0,
      isMuted: data.isMuted || false,
      isDeafened: data.isDeafened || false,
      speaking: data.speaking || false,
      participantCount: data.participantCount || 0,
      expanded: data.expanded ?? false,
      docked: data.docked ?? true,
      position: data.position,
      zIndex: maxZIndex + 1,
      lastFocused: new Date(),
    };

    const newBubbles = [...state.bubbleDock.bubbles, newBubble];
    const newDockOrder = newBubble.docked
      ? [...state.bubbleDock.dockOrder, newBubble.id]
      : state.bubbleDock.dockOrder;

    return {
      bubbleDock: {
        ...state.bubbleDock,
        bubbles: newBubbles,
        dockOrder: newDockOrder,
      },
    };
  }),

  closeBubble: (id) => set((state) => ({
    bubbleDock: {
      ...state.bubbleDock,
      bubbles: state.bubbleDock.bubbles.filter((b) => b.id !== id),
      dockOrder: state.bubbleDock.dockOrder.filter((bId) => bId !== id),
    },
  })),

  toggleBubbleExpand: (id) => set((state) => ({
    bubbleDock: {
      ...state.bubbleDock,
      bubbles: state.bubbleDock.bubbles.map((b) =>
        b.id === id ? { ...b, expanded: !b.expanded, lastFocused: new Date() } : b
      ),
    },
  })),

  dockBubble: (id) => set((state) => {
    const bubble = state.bubbleDock.bubbles.find((b) => b.id === id);
    if (!bubble || bubble.docked) return state;

    return {
      bubbleDock: {
        ...state.bubbleDock,
        bubbles: state.bubbleDock.bubbles.map((b) =>
          b.id === id ? { ...b, docked: true, position: undefined } : b
        ),
        dockOrder: [...state.bubbleDock.dockOrder, id],
      },
    };
  }),

  undockBubble: (id, position) => set((state) => ({
    bubbleDock: {
      ...state.bubbleDock,
      bubbles: state.bubbleDock.bubbles.map((b) =>
        b.id === id ? { ...b, docked: false, position } : b
      ),
      dockOrder: state.bubbleDock.dockOrder.filter((bId) => bId !== id),
    },
  })),

  updateBubblePosition: (id, position) => set((state) => ({
    bubbleDock: {
      ...state.bubbleDock,
      bubbles: state.bubbleDock.bubbles.map((b) =>
        b.id === id ? { ...b, position } : b
      ),
    },
  })),

  focusBubble: (id) => set((state) => {
    const maxZIndex = Math.max(0, ...state.bubbleDock.bubbles.map((b) => b.zIndex));
    return {
      bubbleDock: {
        ...state.bubbleDock,
        bubbles: state.bubbleDock.bubbles.map((b) =>
          b.id === id
            ? { ...b, zIndex: maxZIndex + 1, lastFocused: new Date() }
            : b
        ),
      },
    };
  }),

  reorderDock: (order) => set((state) => ({
    bubbleDock: {
      ...state.bubbleDock,
      dockOrder: order,
    },
  })),

  updateBubble: (id, updates) => set((state) => ({
    bubbleDock: {
      ...state.bubbleDock,
      bubbles: state.bubbleDock.bubbles.map((b) =>
        b.id === id ? { ...b, ...updates } : b
      ),
    },
  })),

  // Initialization
  initializeFromStorage: async () => {
    try {
      const prefs = await loadLayoutPreferences();
      set((state) => ({
        chat: {
          ...state.chat,
          mode: prefs.layout.mode,
        },
        voice: {
          ...state.voice,
          pinned: prefs.voice.pinned,
        },
        titlebar: {
          ...state.titlebar,
          height: prefs.titlebar.height,
        },
      }));

      // Load bubble layout
      const savedLayout = loadBubbleLayout();
      if (savedLayout && savedLayout.length > 0) {
        set((state) => ({
          bubbleDock: {
            ...state.bubbleDock,
            bubbles: state.bubbleDock.bubbles.map((bubble) => {
              const saved = savedLayout.find((s) => s.id === bubble.id);
              if (saved) {
                return {
                  ...bubble,
                  docked: saved.docked,
                  position: saved.position,
                  expanded: saved.expanded,
                };
              }
              return bubble;
            }),
          },
        }));
      }
    } catch (error) {
      console.error('Failed to initialize UI store from storage:', error);
    }
  },
})));

// Subscribe to bubble changes and save to storage
useUIStore.subscribe(
  (state) => state.bubbleDock.bubbles,
  (bubbles) => {
    saveBubbleLayout(bubbles);
  },
  { fireImmediately: false }
);
