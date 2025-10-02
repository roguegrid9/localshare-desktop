// src/app/tauri/WindowBridge.ts
// Tiny bridge around @tauri-apps/api for multi-window & cross-window events.
// Safe to import in web dev: falls back to window.open/close when Tauri isn't present.

import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

type Size = { width: number; height: number };
type Position = { x: number; y: number };

export const Channels = {
  // high-level window actions
  DockWindow: "rg9://dock-window",             // payload: { windowId: string }
  // tab-level actions (optional; for cross-window tab moves)
  TabMove: "rg9://tab-move",                   // payload: { tabId: string; targetWindowId: string; index?: number }
  // hover/preview (optional; for snap affordances)
  HoverTabStrip: "rg9://hover-tab-strip",      // payload: { windowId: string; hovering: boolean }
} as const;

export type DockWindowPayload = { windowId: string };
export type TabMovePayload = { tabId: string; targetWindowId: string; index?: number };
export type HoverTabStripPayload = { windowId: string; hovering: boolean };

// ---- Environment detection ---------------------------------------------------

export function hasTauri(): boolean {
  return typeof (window as any).__TAURI__ !== "undefined";
}

// Lazy import helpers so the file doesn’t error in web.
async function tauriWin() {
  const mod = await import("@tauri-apps/api/webviewWindow");
  return mod;
}
async function tauriEvent() {
  const mod = await import("@tauri-apps/api/event");
  return mod;
}

// ---- Window helpers ----------------------------------------------------------

/**
 * Create (or focus existing) process workspace window.
 * label: unique window label (e.g., "proc-abc123")
 * url:   route to open (e.g., `/workspace/proc-abc123`)
 */
export async function createProcessWindow(
  label: string,
  url: string,
  opts?: Partial<{
    size: Size;
    position: Position;
    title: string;
    decorations: boolean;
    resizable: boolean;
    skipTaskbar: boolean;
  }>
): Promise<WebviewWindow | Window | null> {
  if (!hasTauri()) {
    // Web fallback: open a popup so you can visualize detach in dev
    const w = window.open(
      `${location.origin}${url}`,
      label,
      `popup,width=${opts?.size?.width ?? 1100},height=${opts?.size?.height ?? 780}`
    );
    return w;
  }

  const { WebviewWindow } = await tauriWin();

  // Focus if it already exists
  // @ts-ignore - getByLabel exists at runtime
  const existing = (WebviewWindow as any).getByLabel?.(label) as WebviewWindow | undefined;
  if (existing) {
    existing.setFocus();
    return existing;
  }

  const win = new WebviewWindow(label, {
    url,
    width: opts?.size?.width ?? 1100,
    height: opts?.size?.height ?? 780,
    x: opts?.position?.x,
    y: opts?.position?.y,
    title: opts?.title ?? "Process Workspace",
    decorations: opts?.decorations ?? true,
    resizable: opts?.resizable ?? true,
    skipTaskbar: opts?.skipTaskbar ?? false,
  });

  await new Promise<void>((resolve, reject) => {
    win.once("tauri://created", () => resolve());
    win.once("tauri://error", (e: any) => reject(e));
  });

  return win;
}

/** Current window handle (Tauri) or null in web. */
export async function currentWindow() {
  if (!hasTauri()) return null;
  return getCurrentWebviewWindow();
}

export async function closeCurrentWindow() {
  if (!hasTauri()) {
    window.close();
    return;
  }
  const cur = await currentWindow();
  await cur?.close();
}

export async function setWindowSize(size: Size) {
  if (!hasTauri()) return;
  const cur = await currentWindow();
  await cur?.setSize(size as any);
}
export async function setWindowPosition(pos: Position) {
  if (!hasTauri()) return;
  const cur = await currentWindow();
  await cur?.setPosition(pos as any);
}

// ---- Events (emit/listen) ----------------------------------------------------

export async function emitDockWindow(p: DockWindowPayload) {
  const { emit } = await tauriEvent();
  await emit(Channels.DockWindow, p);
}
export async function onDockWindow(cb: (p: DockWindowPayload) => void) {
  const { listen } = await tauriEvent();
  const unlisten = await listen<DockWindowPayload>(Channels.DockWindow, (e) => cb(e.payload));
  return () => unlisten();
}

export async function emitTabMove(p: TabMovePayload) {
  const { emit } = await tauriEvent();
  await emit(Channels.TabMove, p);
}
export async function onTabMove(cb: (p: TabMovePayload) => void) {
  const { listen } = await tauriEvent();
  const unlisten = await listen<TabMovePayload>(Channels.TabMove, (e) => cb(e.payload));
  return () => unlisten();
}

export async function emitHoverTabStrip(p: HoverTabStripPayload) {
  const { emit } = await tauriEvent();
  await emit(Channels.HoverTabStrip, p);
}
export async function onHoverTabStrip(cb: (p: HoverTabStripPayload) => void) {
  const { listen } = await tauriEvent();
  const unlisten = await listen<HoverTabStripPayload>(Channels.HoverTabStrip, (e) => cb(e.payload));
  return () => unlisten();
}

// ---- High-level flows you’ll call from the tab container ---------------------

/**
 * Detach: persist the tab(s) under a new windowId and open the window at /workspace/:windowId
 */
export async function detachToNewWindow(windowId: string, tabsStateJson: string) {
  // Persist tabs for the new window
  localStorage.setItem(storageKeyFor(windowId), tabsStateJson);
  // Open window
  await createProcessWindow(windowId, `/workspace/${windowId}`, {
    size: { width: 1100, height: 780 },
    title: "Process Workspace",
  });
}

/**
 * Dock: move tabs from a detached window back to main, then close the detached window.
 */
export async function dockThisWindowToMain(thisWindowId: string) {
  if (thisWindowId === "main") return;

  const mainKey = storageKeyFor("main");
  const thisKey = storageKeyFor(thisWindowId);

  const main = safeParsePersist(localStorage.getItem(mainKey));
  const cur = safeParsePersist(localStorage.getItem(thisKey));

  const mergedTabs = [...(main?.tabs ?? []), ...(cur?.tabs ?? [])];
  const activeTabId =
    cur?.activeTabId ?? main?.activeTabId ?? mergedTabs[0]?.id ?? null;

  localStorage.setItem(mainKey, JSON.stringify({ tabs: mergedTabs, activeTabId }));
  localStorage.removeItem(thisKey);

  await closeCurrentWindow();
}

// ---- Keys & utils ------------------------------------------------------------

export function storageKeyFor(windowId: string) {
  return `rg9.tabs.${windowId}`;
}

function safeParsePersist(raw: string | null): { tabs: any[]; activeTabId: string | null } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.tabs)) return parsed;
  } catch {}
  return null;
}
