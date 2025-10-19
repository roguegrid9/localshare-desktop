// Enhanced TitleBar - Merges tabs + status badges + window controls
// All interactive elements must have data-no-drag to prevent drag region conflicts

import React, { useRef, useState } from 'react';
import { Minus, Square, X, ChevronLeft, ChevronRight, Pin } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useUIStore } from '../stores/useUIStore';
import { Separator } from './ui/separator';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from './ui/context-menu';
import { cn } from '../utils/cx';
import { ToastContainer } from './toast/ToastContainer';
import { DynamicIsland } from './titlebar/DynamicIsland';

interface TitleBarProps {
  gridName?: string;
}

export function TitleBar({ gridName }: TitleBarProps) {
  const isTogglingRef = useRef(false);
  const lastToggleTime = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftScroll, setShowLeftScroll] = useState(false);
  const [showRightScroll, setShowRightScroll] = useState(false);

  const {
    tabs,
    activeTabId,
    setActiveTabId,
    closeTab,
    pinTab,
  } = useUIStore();

  // Window control handlers
  const handleMinimize = async () => {
    try {
      const window = getCurrentWindow();
      await window.minimize();
    } catch (error) {
      console.error('Failed to minimize window:', error);
    }
  };

  const handleMaximize = () => {
    const now = Date.now();

    if (now - lastToggleTime.current < 400) {
      return;
    }

    if (isTogglingRef.current) {
      return;
    }

    lastToggleTime.current = now;
    isTogglingRef.current = true;

    (async () => {
      try {
        const window = getCurrentWindow();
        const isMaximized = await window.isMaximized();
        if (isMaximized) {
          await window.unmaximize();
        } else {
          await window.maximize();
        }
      } catch (error) {
        console.error('Failed to maximize window:', error);
      } finally {
        setTimeout(() => {
          isTogglingRef.current = false;
        }, 100);
      }
    })();
  };

  const handleClose = async () => {
    try {
      const window = getCurrentWindow();
      await window.close();
    } catch (error) {
      console.error('Failed to close window:', error);
    }
  };

  // Tab handlers
  const handleTabClick = (tabId: string) => {
    setActiveTabId(tabId);
  };

  const handleTabClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    closeTab(tabId);
  };

  const handlePinTab = (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (tab) {
      pinTab(tabId, !tab.isPinned);
    }
  };

  const handleCloseOthers = (tabId: string) => {
    tabs.forEach((tab) => {
      if (tab.id !== tabId && !tab.isPinned) {
        closeTab(tab.id);
      }
    });
  };

  const handleCloseAll = () => {
    tabs.forEach((tab) => {
      if (!tab.isPinned) {
        closeTab(tab.id);
      }
    });
  };

  // Scroll handlers for tabs
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setShowLeftScroll(scrollLeft > 0);
    setShowRightScroll(scrollLeft < scrollWidth - clientWidth - 1);
  };

  const scrollTabs = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const scrollAmount = 200;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  return (
    <div className="titlebar h-12 bg-bg-surface border-b border-border flex items-center select-none z-titlebar relative" data-tauri-drag-region>
      {/* Toast notifications inside titlebar */}
      <ToastContainer />

      {/* Left: App Logo / Workspace */}
      <div className="flex items-center gap-2 px-3" data-no-drag>
        <div className="h-6 w-6 rounded bg-gradient-to-br from-accent-gradient-start to-accent-gradient-end" />
        <Separator orientation="vertical" className="h-6" />
      </div>

      {/* Dynamic Island - Pills for messages and voice */}
      <DynamicIsland />

      {/* Center: Tabs with horizontal scroll */}
      <div className="flex-1 min-w-0 relative flex items-center" data-no-drag>
        {showLeftScroll && (
          <button
            onClick={() => scrollTabs('left')}
            className="absolute left-0 z-10 h-8 w-8 rounded flex items-center justify-center bg-bg-surface/90 hover:bg-bg-hover border border-border"
            data-no-drag
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-x-auto no-scrollbar flex items-center gap-1 px-1"
        >
          {tabs.map((tab) => (
            <ContextMenu key={tab.id}>
              <ContextMenuTrigger asChild>
                <button
                  onClick={() => handleTabClick(tab.id)}
                  className={cn(
                    'group relative flex items-center gap-2 px-3 h-8 rounded-md text-sm transition-colors whitespace-nowrap',
                    tab.id === activeTabId
                      ? 'bg-bg-muted border border-border text-text-primary'
                      : 'hover:bg-bg-hover text-text-secondary hover:text-text-primary'
                  )}
                  data-no-drag
                >
                  {tab.icon && <tab.icon className="h-4 w-4 shrink-0" />}
                  <span className="truncate max-w-[120px]">{tab.title}</span>
                  {tab.isPinned && <Pin className="h-3 w-3 shrink-0 opacity-50" />}
                  <X
                    className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-70 hover:opacity-100 ml-1"
                    onClick={(e) => handleTabClose(e, tab.id)}
                  />
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent data-no-drag>
                <ContextMenuItem onClick={() => handleTabClose({} as React.MouseEvent, tab.id)}>
                  Close
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleCloseOthers(tab.id)}>
                  Close Others
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleCloseAll()}>
                  Close All
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handlePinTab(tab.id)}>
                  {tab.isPinned ? 'Unpin' : 'Pin'} Tab
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </div>

        {showRightScroll && (
          <button
            onClick={() => scrollTabs('right')}
            className="absolute right-0 z-10 h-8 w-8 rounded flex items-center justify-center bg-bg-surface/90 hover:bg-bg-hover border border-border"
            data-no-drag
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Right: Window Controls */}
      <div className="flex items-center gap-2 px-3" data-no-drag>
        {/* Window Controls */}
        <button
          onClick={handleMinimize}
          className="h-8 w-8 rounded-lg hover:bg-bg-hover flex items-center justify-center text-text-secondary hover:text-text-primary transition-all"
          aria-label="Minimize"
          data-no-drag
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={handleMaximize}
          className="h-8 w-8 rounded-lg hover:bg-bg-hover flex items-center justify-center text-text-secondary hover:text-text-primary transition-all"
          aria-label="Maximize"
          data-no-drag
        >
          <Square className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleClose}
          className="h-8 w-8 rounded-lg hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center text-text-secondary transition-all"
          aria-label="Close"
          data-no-drag
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
