import { useState, useCallback, useEffect } from 'react';
import { Mic, MicOff, Settings, ChevronDown, Volume2, Loader2 } from 'lucide-react';
import { useMediaStreams } from '../../hooks/useMediaStreams';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

interface VoiceToolbarProps {
  onSettingsClick?: () => void;
  className?: string;
  // Override state from parent if provided
  overrideAudioLevel?: number;
  overrideSpeaking?: boolean;
  overrideMuted?: boolean;
}

export default function VoiceToolbar({
  onSettingsClick,
  className = '',
  overrideAudioLevel,
  overrideSpeaking,
  overrideMuted
}: VoiceToolbarProps) {
  const {
    mediaState,
    toggleAudioMute,
    changeDevice,
    getInputDevices,
    getOutputDevices,
    backendAvailable,
    audioSettings
  } = useMediaStreams();

  const inputDevices = getInputDevices();
  const outputDevices = getOutputDevices();
  const currentInputDevice = inputDevices.find(d => d.device_id === mediaState.audio.deviceId);
  const currentOutputDevice = outputDevices.find(d => d.device_id === audioSettings?.output_device_id);

  // Use override values from parent if provided (fixes hook state isolation)
  const isMuted = overrideMuted !== undefined ? overrideMuted : mediaState.audio.muted;
  const audioLevel = overrideAudioLevel !== undefined
    ? (isMuted ? 0 : overrideAudioLevel)
    : (isMuted ? 0 : mediaState.audio.level);
  const speaking = overrideSpeaking !== undefined ? overrideSpeaking : mediaState.audio.speaking;

  const handleMuteToggle = useCallback(() => {
    toggleAudioMute();
  }, [toggleAudioMute]);

  const handleDeviceChange = useCallback(async (deviceId: string, type: 'input' | 'output') => {
    try {
      await changeDevice(deviceId, type === 'input' ? 'audio' : 'output');
    } catch (error) {
      console.error('Failed to change device:', error);
    }
  }, [changeDevice]);

  return (
    <div className={`flex items-center justify-center gap-3 px-6 py-4 bg-sidebar border-t border-sidebar-border ${className}`}>
      {/* Mute/Unmute Button */}
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={handleMuteToggle}
          disabled={!backendAvailable}
          className={`
            relative h-12 w-12 rounded-[10px] transition-all duration-200 flex items-center justify-center
            ${isMuted
              ? 'bg-[#DC2626]/20 border border-[#DC2626]/40 text-[#DC2626] hover:bg-[#DC2626]/30'
              : 'bg-[#3AAFFF]/20 border border-[#3AAFFF]/40 text-[#3AAFFF] hover:bg-[#3AAFFF]/30'
            }
            ${!backendAvailable ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 active:scale-95'}
          `}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? (
            <MicOff className="w-5 h-5" />
          ) : (
            <Mic className="w-5 h-5" />
          )}

          {/* Audio level indicator - Always show when backend available */}
          {backendAvailable && (
            <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-8 h-1 bg-sidebar-border rounded-full overflow-hidden">
              <div
                className="h-full bg-sidebar-primary transition-all duration-75"
                style={{
                  width: `${audioLevel * 100}%`,
                  minWidth: audioLevel > 0 ? '2px' : '0'
                }}
              />
            </div>
          )}
        </button>
        <span className="text-xs text-muted-foreground">
          {isMuted ? 'Unmute' : 'Mute'}
        </span>
      </div>

      {/* Device Selector with shadcn Dropdown */}
      <div className="flex flex-col items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              disabled={!backendAvailable}
              className={`
                h-12 px-4 rounded-[10px] transition-all duration-200 flex items-center gap-2
                bg-sidebar border border-sidebar-border text-sidebar-foreground
                ${!backendAvailable ? 'opacity-50 cursor-not-allowed' : 'hover:bg-sidebar-accent hover:scale-105 active:scale-95'}
              `}
            >
              <Volume2 className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm max-w-[120px] truncate">
                {currentInputDevice?.label || 'Default'}
              </span>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-80 bg-sidebar border-sidebar-border text-sidebar-foreground"
            side="top"
            align="center"
          >
            {/* Input Devices */}
            <DropdownMenuLabel className="text-muted-foreground uppercase tracking-wide text-xs">
              Microphone
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={mediaState.audio.deviceId || ''}
              onValueChange={(value) => handleDeviceChange(value, 'input')}
            >
              {inputDevices.map((device) => (
                <DropdownMenuRadioItem
                  key={device.device_id}
                  value={device.device_id}
                  className="text-sidebar-foreground focus:bg-sidebar-accent focus:text-sidebar-primary data-[state=checked]:text-sidebar-primary"
                >
                  <span className="truncate">{device.label}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>

            <DropdownMenuSeparator className="bg-sidebar-border" />

            {/* Output Devices */}
            <DropdownMenuLabel className="text-muted-foreground uppercase tracking-wide text-xs">
              Speakers
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={audioSettings?.output_device_id || ''}
              onValueChange={(value) => handleDeviceChange(value, 'output')}
            >
              {outputDevices.map((device) => (
                <DropdownMenuRadioItem
                  key={device.device_id}
                  value={device.device_id}
                  className="text-sidebar-foreground focus:bg-sidebar-accent focus:text-sidebar-primary data-[state=checked]:text-sidebar-primary"
                >
                  <span className="truncate">{device.label}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="text-xs text-muted-foreground">Audio</span>
      </div>

      {/* Settings Button */}
      {onSettingsClick && (
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={onSettingsClick}
            className="h-12 w-12 rounded-[10px] transition-all duration-200 flex items-center justify-center bg-sidebar border border-sidebar-border text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground hover:scale-105 active:scale-95"
            title="Voice settings"
          >
            <Settings className="w-5 h-5" />
          </button>
          <span className="text-xs text-muted-foreground">Settings</span>
        </div>
      )}
    </div>
  );
}
