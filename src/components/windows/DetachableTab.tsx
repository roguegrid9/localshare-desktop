import React, { useMemo } from 'react';
import { 
  X, 
  Terminal, 
  Hash, 
  Volume2, 
  Cog, 
  MessageCircle, 
  Grid3X3, 
  Home,
  Video
} from 'lucide-react';
import { cx } from '../../utils/cx';
import type { Tab } from '../../types/windows';

interface SimpleTabProps {
  tab: Tab;
  isActive: boolean;
  onClick: () => void;
  onClose: (event: React.MouseEvent) => void;
}

export function DetachableTab({
  tab,
  isActive,
  onClick,
  onClose,
}: SimpleTabProps) {
  console.log('Tab render:', { title: tab.title, isClosable: tab.is_closable, isActive });
  
  const TabIcon = useMemo(() => {
    switch (tab.content.type) {
      case 'Terminal':
        return Terminal;
      case 'Container':
        return Monitor;
      case 'TextChannel':
        return MessageCircle;
      case 'MediaChannel':
        return tab.content.data.media_type === 'Video' || tab.content.data.media_type === 'Both' 
          ? Video 
          : Volume2;
      case 'Process':
        return Cog;
      case 'DirectMessage':
        return MessageCircle;
      case 'GridDashboard':
        return Grid3X3;
      case 'Welcome':
        return Home;
      default:
        return Home;
    }
  }, [tab.content]);

  const displayTitle = useMemo(() => {
    return tab.title.length > 20 ? `${tab.title.slice(0, 17)}...` : tab.title;
  }, [tab.title]);

  const handleCloseClick = (event: React.MouseEvent) => {
    console.log('🔴 Close button clicked!', { tabTitle: tab.title, tabId: tab.id, isClosable: tab.is_closable });
    event.stopPropagation();
    event.preventDefault();
    
    if (!tab.is_closable) {
      console.log('🔴 Tab is not closable, ignoring click');
      return;
    }
    
    onClose(event);
  };

  return (
    <div
      className="group relative flex items-stretch min-w-0 transition-all duration-200"
    >
      <div
        data-tab-id={tab.id}
        onClick={onClick}
        className={cx(
          "relative flex items-center gap-2 px-4 py-2 min-w-[160px] max-w-[280px] cursor-pointer transition-all duration-200",
          "select-none rounded-t-lg mx-[1px] mt-1",
          isActive
            ? "bg-[#0B0D10] text-white shadow-lg border-t-2 border-t-blue-500"
            : "bg-[#2D3748] text-white/90 hover:bg-[#374151] border-t-2 border-t-transparent hover:border-t-white/20"
        )}
        title={tab.title}
      >
        <div className="shrink-0 relative">
          <TabIcon className="w-4 h-4" />
          {tab.has_notifications && (
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
          )}
        </div>

        <span className="truncate text-sm font-medium flex-1">
          {displayTitle}
        </span>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleCloseClick}
            onMouseDown={(e) => console.log('Close button mouse down', e)}
            onMouseUp={(e) => console.log('Close button mouse up', e)}
            className="flex items-center justify-center w-5 h-5 text-white/70 hover:text-red-400 hover:bg-red-500/20 rounded transition-colors ml-2"
            title="Close tab"
            type="button"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}