// CompactChatPanel - Bottom sheet dock with resizable height
// Uses shadcn Sheet as base, adds drag-to-resize functionality

import { useEffect, useRef } from 'react';
import { Pin, PinOff, Minimize2, Maximize2 } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import { Sheet, SheetContent } from '../ui/sheet';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { cn } from '../../utils/cx';
import TextChannel from '../channels/TextChannel';

const MIN_HEIGHT = 150;
const MAX_HEIGHT_VH = 0.4;

// Preset heights
const PRESET_PEEK = 150;
const PRESET_EXPANDED = 300;
const PRESET_FULL = () => Math.round(window.innerHeight * 0.7);

export function CompactChatPanel() {
  const {
    chat,
    toggleChatDock,
    setChatHeight,
    pinChat,
  } = useUIStore();

  const handleRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  // Drag-to-resize functionality
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;

    let startY = 0;
    let startHeight = chat.height;

    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      startY = e.clientY;
      startHeight = chat.height;

      // Add global listeners
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);

      // Prevent text selection during drag
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      // Calculate new height (moving up = taller)
      const delta = startY - e.clientY;
      const newHeight = startHeight + delta;

      // Clamp to valid range
      const maxHeight = Math.round(window.innerHeight * MAX_HEIGHT_VH);
      const clampedHeight = Math.max(MIN_HEIGHT, Math.min(newHeight, maxHeight));

      setChatHeight(clampedHeight);
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    handle.addEventListener('mousedown', onMouseDown);

    return () => {
      handle.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [chat.height, setChatHeight]);

  // Preset height handlers
  const setPresetHeight = (preset: 'peek' | 'expanded' | 'full') => {
    switch (preset) {
      case 'peek':
        setChatHeight(PRESET_PEEK);
        break;
      case 'expanded':
        setChatHeight(PRESET_EXPANDED);
        break;
      case 'full':
        setChatHeight(PRESET_FULL());
        break;
    }
  };

  // Only hide when the dock is closed; allow rendering with a placeholder
  if (!chat.open) {
    return null;
  }

  return (
    <Sheet open={chat.open} onOpenChange={(open) => toggleChatDock(open)}>
      <SheetContent
        side="bottom"
        className={cn(
          'z-overlays p-0 border-t border-border bg-bg-surface/95 backdrop-blur rounded-t-2xl overflow-hidden',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom'
        )}
        style={{ height: chat.height }}
        data-no-drag
      >
        {/* Resize Handle */}
        <div
          ref={handleRef}
          className="h-3 w-full flex items-center justify-center cursor-ns-resize hover:bg-bg-hover/50 transition-colors"
          data-no-drag
        >
          <div className="w-24 h-1 rounded-full bg-border" />
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-bg-muted/50" data-no-drag>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary">Chat</span>
          </div>

          <div className="flex items-center gap-1">
            <TooltipProvider>
              {/* Preset Height Buttons */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPresetHeight('peek')}
                    className="h-7 w-7 p-0"
                    data-no-drag
                  >
                    <Minimize2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Peek (150px)</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPresetHeight('expanded')}
                    className="h-7 w-7 p-0"
                    data-no-drag
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Expanded (300px)</TooltipContent>
              </Tooltip>

              {/* Pin Button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => pinChat(!chat.pinned)}
                    className={cn(
                      'h-7 w-7 p-0',
                      chat.pinned && 'text-accent-solid'
                    )}
                    data-no-drag
                  >
                    {chat.pinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {chat.pinned ? 'Unpin (allows auto-hide)' : 'Pin (prevents auto-hide)'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Chat Content */}
        <div className="h-[calc(100%-3.25rem)] overflow-hidden">
          {chat.currentChannelId ? (
            <TextChannel channelId={chat.currentChannelId} />
          ) : (
            <div className="h-full grid place-items-center text-sm text-text-tertiary">
              Select a channel to start chatting
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
