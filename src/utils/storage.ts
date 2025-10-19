// Tauri Storage Wrapper for Layout Preferences
// Uses Tauri fs/path APIs to persist layout state to a single JSON file

import { invoke } from '@tauri-apps/api/core';

// Constants
const MIN_CHAT_HEIGHT = 150;
const MAX_CHAT_HEIGHT_VH = 0.4;
const WRITE_DEBOUNCE_MS = 150;
const CURRENT_VERSION = 1;
const DEFAULT_CHAT_HEIGHT = 280;

interface LayoutPreferences {
  chat: {
    heights: Record<string, number>; // "gridId.channelId": height
    pinned: Record<string, boolean>;
  };
  layout: {
    mode: 'compact' | 'full' | 'auto';
  };
  voice: {
    pinned: boolean;
  };
  titlebar: {
    height: number;
  };
}

interface LayoutEnvelope {
  version: number;
  data: LayoutPreferences;
}

const DEFAULT_PREFERENCES: LayoutPreferences = {
  chat: {
    heights: {},
    pinned: {},
  },
  layout: {
    mode: 'compact',
  },
  voice: {
    pinned: false,
  },
  titlebar: {
    height: 48,
  },
};

// Debounce timer (type-safe for browser/Node)
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPrefs: LayoutPreferences | null = null;

// In-memory cache
let preferencesCache: LayoutPreferences | null = null;

/**
 * Deep merge utility - properly merges nested objects
 */
function deepMerge<T>(base: T, patch: Partial<T>): T {
  if (Array.isArray(base) || Array.isArray(patch)) {
    return (patch as T) ?? base;
  }

  if (typeof base === "object" && base && typeof patch === "object" && patch) {
    const out: any = { ...base };
    for (const k of Object.keys(patch)) {
      const pk = (patch as any)[k];
      out[k] = deepMerge((base as any)[k], pk);
    }
    return out;
  }

  return (patch as T) ?? base;
}

/**
 * Migrate stored preferences to current version
 */
function migrate(envelope: any): LayoutPreferences {
  if (!envelope || typeof envelope !== "object") {
    return DEFAULT_PREFERENCES;
  }

  const version = envelope.version ?? 0;
  let data = envelope.data ?? envelope;

  // Future migration logic goes here when bumping CURRENT_VERSION
  // Example:
  // if (version < 2) {
  //   data = migrateV1ToV2(data);
  // }

  return deepMerge(DEFAULT_PREFERENCES, data as LayoutPreferences);
}

/**
 * Persist preferences to storage (internal)
 */
async function doPersist(): Promise<void> {
  if (!pendingPrefs) return;

  const toSave = pendingPrefs;
  pendingPrefs = null;

  const envelope: LayoutEnvelope = {
    version: CURRENT_VERSION,
    data: toSave,
  };

  try {
    // Try to save via Tauri command
    await invoke('save_layout_preferences', { preferences: envelope });
  } catch (error) {
    // Only warn for unexpected errors (not "Command not found" which is expected when Tauri backend is unavailable)
    const errorMessage = String(error);
    if (!errorMessage.includes('Command') && !errorMessage.includes('not found')) {
      console.warn('Failed to save layout preferences via Tauri:', error);
    }

    // Fallback to localStorage
    try {
      localStorage.setItem('roguegrid_layout', JSON.stringify(envelope));
    } catch (storageError) {
      console.error('Failed to save to localStorage:', storageError);
    }
  }
}

/**
 * Load layout preferences from Tauri storage
 */
export async function loadLayoutPreferences(): Promise<LayoutPreferences> {
  if (preferencesCache) {
    return preferencesCache;
  }

  try {
    // Try to load from Tauri command
    const envelope = await invoke<LayoutEnvelope>('get_layout_preferences');
    preferencesCache = migrate(envelope);
    return preferencesCache;
  } catch (error) {
    // Only warn for unexpected errors (not "Command not found" which is expected when Tauri backend is unavailable)
    const errorMessage = String(error);
    if (!errorMessage.includes('Command') && !errorMessage.includes('not found')) {
      console.warn('Failed to load layout preferences from Tauri:', error);
    }

    // Fallback to localStorage if Tauri fails
    try {
      const stored = localStorage.getItem('roguegrid_layout');
      if (stored) {
        const envelope = JSON.parse(stored);
        preferencesCache = migrate(envelope);
        return preferencesCache;
      }
    } catch (parseError) {
      console.error('Failed to parse localStorage preferences:', parseError);
    }

    preferencesCache = DEFAULT_PREFERENCES;
    return preferencesCache;
  }
}

/**
 * Save layout preferences to Tauri storage (debounced)
 */
export async function saveLayoutPreferences(preferences: LayoutPreferences): Promise<void> {
  preferencesCache = preferences;
  pendingPrefs = preferences;

  if (writeTimer) {
    clearTimeout(writeTimer);
  }

  writeTimer = setTimeout(() => {
    void doPersist();
  }, WRITE_DEBOUNCE_MS);
}

/**
 * Flush pending writes immediately (call before app close)
 */
export async function flushLayoutPreferences(): Promise<void> {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  await doPersist();
}

/**
 * Get chat height for a specific grid and channel
 */
export async function getChatHeight(gridId: string, channelId: string): Promise<number> {
  const prefs = await loadLayoutPreferences();
  const key = `${gridId}.${channelId}`;
  return prefs.chat.heights[key] || DEFAULT_CHAT_HEIGHT;
}

/**
 * Set chat height for a specific grid and channel (clamped to valid range)
 */
export async function setChatHeight(gridId: string, channelId: string, height: number): Promise<void> {
  const prefs = await loadLayoutPreferences();
  const key = `${gridId}.${channelId}`;

  // Clamp to valid range
  const maxPx = Math.round(window.innerHeight * MAX_CHAT_HEIGHT_VH);
  const clamped = Math.min(Math.max(height, MIN_CHAT_HEIGHT), maxPx);

  prefs.chat.heights[key] = clamped;
  await saveLayoutPreferences(prefs);
}

/**
 * Get chat pinned state for a specific grid and channel
 */
export async function getChatPinned(gridId: string, channelId: string): Promise<boolean> {
  const prefs = await loadLayoutPreferences();
  const key = `${gridId}.${channelId}`;
  return prefs.chat.pinned[key] || false;
}

/**
 * Set chat pinned state for a specific grid and channel
 */
export async function setChatPinned(gridId: string, channelId: string, pinned: boolean): Promise<void> {
  const prefs = await loadLayoutPreferences();
  const key = `${gridId}.${channelId}`;
  prefs.chat.pinned[key] = pinned;
  await saveLayoutPreferences(prefs);
}

/**
 * Get layout mode
 */
export async function getLayoutMode(): Promise<'compact' | 'full' | 'auto'> {
  const prefs = await loadLayoutPreferences();
  return prefs.layout.mode;
}

/**
 * Set layout mode
 */
export async function setLayoutMode(mode: 'compact' | 'full' | 'auto'): Promise<void> {
  const prefs = await loadLayoutPreferences();
  prefs.layout.mode = mode;
  await saveLayoutPreferences(prefs);
}

/**
 * Get voice pinned state
 */
export async function getVoicePinned(): Promise<boolean> {
  const prefs = await loadLayoutPreferences();
  return prefs.voice.pinned;
}

/**
 * Set voice pinned state
 */
export async function setVoicePinned(pinned: boolean): Promise<void> {
  const prefs = await loadLayoutPreferences();
  prefs.voice.pinned = pinned;
  await saveLayoutPreferences(prefs);
}

// Wire up flush on app exit
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    void flushLayoutPreferences();
  });
}
