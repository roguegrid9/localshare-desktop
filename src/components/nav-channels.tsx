import { useState } from "react";
import { MessageCircle, Volume2, Plus, ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarGroupAction,
} from "./ui/sidebar";
import type { ChannelInfo } from "../types/messaging";

export function NavChannels({
  channels,
  selectedGridId,
  onChannelSelect,
  onVoiceChannelSelect,
  onAddChannel,
}: {
  channels: ChannelInfo[];
  selectedGridId?: string;
  onChannelSelect: (channelId: string) => void;
  onVoiceChannelSelect?: (channelId: string, channelName: string, gridId: string) => void;
  onAddChannel: () => void;
}) {
  const [isOpen, setIsOpen] = useState(true);

  // Filter out DM channels
  const visibleChannels = channels.filter(c => !c.is_private || !c.name.startsWith('DM'));

  // Sort: text channels first, then voice
  const sortedChannels = visibleChannels.sort((a, b) => {
    if (a.channel_type !== b.channel_type) {
      return a.channel_type === 'text' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  const handleChannelClick = (channel: ChannelInfo) => {
    const isVoiceChannel = channel.channel_type === 'voice';
    if (isVoiceChannel && onVoiceChannelSelect && selectedGridId) {
      onVoiceChannelSelect(channel.id, channel.name, selectedGridId);
    } else {
      onChannelSelect(channel.id);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="group/collapsible">
      <SidebarGroup>
        <SidebarGroupLabel asChild>
          <CollapsibleTrigger>
            Channels
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <SidebarGroupAction onClick={onAddChannel} title="Add Channel">
          <Plus className="h-4 w-4" />
          <span className="sr-only">Add Channel</span>
        </SidebarGroupAction>
        <CollapsibleContent>
          <SidebarMenu>
            {sortedChannels.length === 0 ? (
              <SidebarMenuItem>
                <div className="px-2 py-1 text-xs text-text-secondary">
                  No channels
                </div>
              </SidebarMenuItem>
            ) : (
              sortedChannels.map((channel) => (
                <SidebarMenuItem key={channel.id}>
                  <SidebarMenuButton
                    onClick={() => handleChannelClick(channel)}
                    tooltip={channel.name}
                  >
                    {channel.channel_type === 'voice' ? (
                      <Volume2 className="h-4 w-4 text-green-400" />
                    ) : (
                      <MessageCircle className="h-4 w-4 text-blue-400" />
                    )}
                    <span>{channel.name}</span>
                    {channel.member_count > 0 && (
                      <span className="ml-auto text-xs text-text-tertiary">
                        {channel.member_count}
                      </span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))
            )}
          </SidebarMenu>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
