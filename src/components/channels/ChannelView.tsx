// Updated ChannelView.tsx with voice channel support
import { Hash, Mic, Video, MoreHorizontal } from "lucide-react";
import { ResourceType } from "../../types/codes";
import ShareButton from "../../components/codes/ShareButton";
import { useChannels } from "../../hooks/useChannels";
import type { ChannelInfo } from "../../types/messaging";
import TextChannel from "./TextChannel";
import { VoiceChannelView } from "./VoiceChannelView";

interface ChannelViewProps {
  gridId: string;
  channelId: string;
}

function ChannelIcon({ type }: { type: string }) {
  switch (type) {
    case "text":
      return <Hash className="h-4 w-4" />;
    case "voice":
      return <Mic className="h-4 w-4" />;
    case "video":
      return <Video className="h-4 w-4" />;
    default:
      return <Hash className="h-4 w-4" />;
  }
}

// Light stub placeholder for video channels (unchanged)
function VideoChannel() {
  return (
    <div className="h-full grid place-items-center p-10 text-white/70">
      Video channel coming soon.
    </div>
  );
}

export default function ChannelView({ gridId, channelId }: ChannelViewProps) {
  const { getChannelById } = useChannels(gridId);
  const channel = getChannelById(channelId) as ChannelInfo | undefined;

  if (!channel) {
    return (
      <div className="h-full grid place-items-center">
        <div className="text-center">
          <div className="text-white/70">Channel not found</div>
          <div className="text-sm text-white/50 mt-1.5">
            It may have been deleted or you don't have access.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-white/10 bg-[#111319]/95 backdrop-blur sticky top-0 z-10">
        <div className="px-4 sm:px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`shrink-0 rounded-lg p-1.5 border ${
                channel.channel_type === 'voice' 
                  ? 'bg-green-500/20 border-green-500/30' 
                  : 'bg-white/5 border-white/10'
              }`}>
                <ChannelIcon type={channel.channel_type} />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-semibold truncate">
                  {channel.name}
                </h1>
                <div className="text-xs text-white/60">
                  {channel.channel_type === "text" && "Text Channel"}
                  {channel.channel_type === "voice" && "Voice Channel"}
                  {channel.channel_type === "video" && "Video Channel"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <ShareButton
                resourceType={
                  channel.channel_type === 'voice' ? ResourceType.ChannelVoice : 
                  channel.channel_type === 'video' ? ResourceType.ChannelVideo : 
                  ResourceType.ChannelText
                }
                resourceId={channel.id}
                resourceName={channel.name}
                gridId={gridId}
                variant="secondary"
                size="sm"
              />
              <button
                className="px-2.5 py-1.5 rounded-lg border border-white/10 hover:border-white/20 text-sm inline-flex items-center gap-1"
                aria-label="Channel options"
                title="Channel options"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {channel.channel_type === "text" && <TextChannel channelId={channelId} />}
        {channel.channel_type === "voice" && <VoiceChannelView gridId={gridId} channelId={channelId} />}
        {channel.channel_type === "video" && <VideoChannel />}
      </div>
    </div>
  );
}