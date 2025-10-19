// src/components/media/MediaControls.tsx - Audio-only controls for voice channels
import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Settings, Volume2, VolumeX, TestTube, Mic, MicOff } from 'lucide-react';
import { useMediaStreams } from '../../hooks/useMediaStreams';
import { useWebRTCMedia } from '../../hooks/useWebRTCMedia';
import { toast } from '../ui/sonner';
import type { MediaControlsConfig, TauriAudioDevice } from '../../types/media';

interface MediaControlsProps {
  sessionId: string;
  config?: Partial<MediaControlsConfig>;
  className?: string;
}

const DEFAULT_CONFIG: MediaControlsConfig = {
  showAudio: true,
  showVideo: false, // Disabled for MVP
  showScreenShare: false, // Disabled for MVP
  showSettings: true,
  allowDeviceSelection: true,
  size: 'md'
};

export default function MediaControls({ 
  sessionId, 
  config = {}, 
  className = '' 
}: MediaControlsProps) {
  const [showDeviceSelector, setShowDeviceSelector] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [testingDevice, setTestingDevice] = useState<string | null>(null);
  
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  
  // Media hooks - audio only
  const {
    mediaState,
    isInitialized,
    startAudio,
    stopAudio,
    toggleAudioMute,
    changeDevice,
    getAudioLevel,
    setAudioVolume,
    backendAvailable,
    lastBackendError,
    getInputDevices,
    getOutputDevices,
    audioSettings,
    saveAudioSettings,
    testAudioDevice
  } = useMediaStreams();
  
  const {
    mediaSession,
    mediaConnected,
    initializeMediaSession,
    addLocalTrack,
    removeLocalTrack,
    setTrackEnabled,
    hasLocalAudio
  } = useWebRTCMedia(sessionId);

  // Get available audio devices
  const inputDevices = getInputDevices();
  const outputDevices = getOutputDevices();
  
  // Don't auto-initialize media session - let the parent component handle this
  // The session should only be initialized when explicitly joining a voice channel
  
  // Audio level monitoring for visual feedback
  const [audioLevel, setAudioLevel] = useState(0);
  useEffect(() => {
    if (!mediaState.audio.enabled) {
      setAudioLevel(0);
      return;
    }
    
    const interval = setInterval(() => {
      const level = getAudioLevel();
      setAudioLevel(level.level);
    }, 100);
    
    return () => clearInterval(interval);
  }, [mediaState.audio.enabled, getAudioLevel]);

  // Test audio device
  const handleTestDevice = useCallback(async (deviceId: string) => {
    setTestingDevice(deviceId);
    try {
      const success = await testAudioDevice(deviceId);
      if (success) {
        toast.success('Device test successful');
      } else {
        toast.error('Device test failed');
      }
    } catch (error) {
      toast.error('Device test failed');
    } finally {
      setTestingDevice(null);
    }
  }, [testAudioDevice]);
  
  // Handle audio toggle
  const handleAudioToggle = useCallback(async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    
    try {
      if (mediaState.audio.enabled) {
        if (hasLocalAudio) {
          await removeLocalTrack('audio');
        }
        stopAudio();
      } else {
        const stream = await startAudio();
        if (stream && mediaSession) {
          const audioTrack = stream.getAudioTracks()[0];
          if (audioTrack) {
            await addLocalTrack(audioTrack, stream, 'audio');
          }
        }
      }
    } catch (error) {
      console.error('Audio toggle failed:', error);
      toast.error(`Audio ${mediaState.audio.enabled ? 'stop' : 'start'} failed`);
    } finally {
      setIsConnecting(false);
    }
  }, [
    mediaState.audio.enabled, hasLocalAudio, mediaSession, isConnecting,
    startAudio, stopAudio, addLocalTrack, removeLocalTrack, toast
  ]);
  
  // Handle mute toggle
  const handleAudioMute = useCallback(async () => {
    toggleAudioMute();
    if (hasLocalAudio) {
      await setTrackEnabled('audio', mediaState.audio.muted);
    }
  }, [mediaState.audio.muted, hasLocalAudio, toggleAudioMute, setTrackEnabled]);
  
  // Device selection
  const handleDeviceChange = useCallback(async (deviceId: string) => {
    try {
      await changeDevice(deviceId, 'audio');
      
      // Update WebRTC track if active
      if (hasLocalAudio) {
        await removeLocalTrack('audio');
        const stream = await startAudio(deviceId);
        if (stream && mediaSession) {
          const audioTrack = stream.getAudioTracks()[0];
          if (audioTrack) {
            await addLocalTrack(audioTrack, stream, 'audio');
          }
        }
      }
      
      setShowDeviceSelector(false);
      toast.success('Microphone changed');
    } catch (error) {
      console.error('Device change failed:', error);
      toast.error('Failed to change microphone');
    }
  }, [hasLocalAudio, mediaSession, changeDevice, startAudio, removeLocalTrack, addLocalTrack, toast]);

  // Volume change
  const handleVolumeChange = useCallback(async (volume: number) => {
    try {
      await setAudioVolume(volume);
      // Save settings automatically
      const newSettings = { ...audioSettings, input_volume: volume };
      await saveAudioSettings(newSettings);
    } catch (error) {
      console.error('Failed to change volume:', error);
    }
  }, [setAudioVolume, audioSettings, saveAudioSettings]);

  // Threshold change
  const handleThresholdChange = useCallback(async (threshold: number) => {
    try {
      const newSettings = { ...audioSettings, voice_activation_threshold: threshold };
      await saveAudioSettings(newSettings);
      toast.info(`Voice threshold: ${Math.round(threshold * 100)}%`);
    } catch (error) {
      console.error('Failed to change threshold:', error);
    }
  }, [audioSettings, saveAudioSettings, toast]);
  
  // Get button size classes with proper flex centering
  const getSizeClasses = () => {
    switch (mergedConfig.size) {
      case 'sm': return 'h-8 w-8 text-sm flex items-center justify-center';
      case 'lg': return 'h-12 w-12 text-lg flex items-center justify-center';
      default: return 'h-10 w-10 text-base flex items-center justify-center';
    }
  };
  
  // Connection status indicator
  const getConnectionStatus = () => {
    if (!isInitialized) return { color: 'text-gray-400', text: 'Initializing...' };
    if (!backendAvailable) return { color: 'text-yellow-400', text: 'Fallback mode' };
    if (!mediaSession) return { color: 'text-yellow-400', text: 'Setting up...' };
    if (!mediaConnected) return { color: 'text-yellow-400', text: 'Connecting...' };
    return { color: 'text-green-400', text: 'Connected' };
  };
  
  const connectionStatus = getConnectionStatus();
  const buttonSizeClasses = getSizeClasses();
  
  if (!isInitialized) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="text-sm text-white/60">Initializing audio...</div>
      </div>
    );
  }

  // Show audio unavailable state if backend failed
  if (!backendAvailable && lastBackendError) {
    return (
      <div className={`flex items-center gap-2 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 ${className}`}>
        <AlertTriangle className="w-4 h-4 text-orange-400" />
        <span className="text-sm text-orange-300">Audio unavailable: {lastBackendError}</span>
      </div>
    );
  }
  
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Connection Status */}
      <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/5 border border-white/10">
        <div className={`w-2 h-2 rounded-full ${connectionStatus.color.replace('text-', 'bg-')}`} />
        <span className={`text-xs ${connectionStatus.color}`}>
          {connectionStatus.text}
        </span>
      </div>
      
      {/* Audio Controls */}
      {mergedConfig.showAudio && (
        <div className="flex items-center gap-1">
          <button
            onClick={handleAudioToggle}
            disabled={isConnecting}
            className={`
              relative ${buttonSizeClasses} rounded-lg border transition-all duration-200
              ${mediaState.audio.enabled 
                ? 'bg-green-500/20 border-green-500/30 text-green-300 hover:bg-green-500/30' 
                : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
              }
              ${isConnecting ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 active:scale-95'}
            `}
            title={mediaState.audio.enabled ? 'Stop microphone' : 'Start microphone'}
          >
            <div className="flex items-center justify-center">
              {mediaState.audio.enabled ? (
                <Mic className="w-4 h-4" />
              ) : (
                <MicOff className="w-4 h-4" />
              )}
            </div>
            
            {/* Audio level indicator */}
            {mediaState.audio.enabled && (
              <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2">
                <div className="w-6 h-1 bg-white/20 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-400 transition-all duration-75"
                    style={{ width: `${audioLevel * 100}%` }}
                  />
                </div>
              </div>
            )}
          </button>
          
          {/* Mute button */}
          {mediaState.audio.enabled && (
            <button
              onClick={handleAudioMute}
              className={`
                ${buttonSizeClasses} rounded-lg border transition-all duration-200
                ${mediaState.audio.muted 
                  ? 'bg-red-500/20 border-red-500/30 text-red-300' 
                  : 'bg-white/5 border-white/10 text-white/60'
                }
                hover:bg-white/10 hover:scale-105 active:scale-95
              `}
              title={mediaState.audio.muted ? 'Unmute' : 'Mute'}
            >
              <div className="flex items-center justify-center">
                {mediaState.audio.muted ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </div>
            </button>
          )}
        </div>
      )}
      
      {/* Settings */}
      {mergedConfig.showSettings && (
        <div className="relative">
          <button
            onClick={() => setShowDeviceSelector(!showDeviceSelector)}
            className={`
              ${buttonSizeClasses} rounded-lg border border-white/10 bg-white/5 text-white/60
              hover:bg-white/10 hover:scale-105 active:scale-95 transition-all duration-200
            `}
            title="Audio settings"
          >
            <div className="flex items-center justify-center">
              <Settings className="w-4 h-4" />
            </div>
          </button>
          
          {/* Settings dropdown */}
          {showDeviceSelector && (
            <div className="absolute top-full mt-2 right-0 w-80 rounded-lg border border-white/10 bg-neutral-900/95 p-4 shadow-2xl z-50">
              <div className="space-y-4">
                <h3 className="font-medium text-white">Audio Settings</h3>
                
                {/* Device selection */}
                {mergedConfig.allowDeviceSelection && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-white/70 mb-2">Microphone</label>
                      <div className="space-y-2">
                        <select
                          value={mediaState.audio.deviceId || ''}
                          onChange={(e) => handleDeviceChange(e.target.value)}
                          className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-sm"
                        >
                          {inputDevices.map(device => (
                            <option key={device.device_id} value={device.device_id}>
                              {device.label}
                            </option>
                          ))}
                        </select>
                        
                        {/* Test current device */}
                        {mediaState.audio.deviceId && (
                          <button
                            onClick={() => handleTestDevice(mediaState.audio.deviceId!)}
                            disabled={testingDevice === mediaState.audio.deviceId}
                            className="flex items-center gap-2 px-2 py-1 rounded text-xs bg-white/5 hover:bg-white/10 transition-colors"
                          >
                            <TestTube className="w-3 h-3" />
                            {testingDevice === mediaState.audio.deviceId ? 'Testing...' : 'Test Device'}
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-white/70 mb-2">Output Device</label>
                      <select
                        className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-sm"
                      >
                        {outputDevices.map(device => (
                          <option key={device.device_id} value={device.device_id}>
                            {device.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
                
                {/* Volume controls */}
                <div>
                  <label className="block text-xs font-medium text-white/70 mb-2">
                    Input Volume ({Math.round((audioSettings?.input_volume || 1) * 100)}%)
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={audioSettings?.input_volume || 1}
                    onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-white/70 mb-2">
                    Voice Activation Threshold ({Math.round((audioSettings?.voice_activation_threshold || 0.1) * 100)}%)
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={audioSettings?.voice_activation_threshold || 0.1}
                    onChange={(e) => handleThresholdChange(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>
                
                {/* Audio processing toggles */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/70">Noise Suppression</span>
                    <input 
                      type="checkbox" 
                      checked={audioSettings?.noise_suppression || false}
                      onChange={(e) => {
                        const newSettings = { ...audioSettings, noise_suppression: e.target.checked };
                        saveAudioSettings(newSettings);
                      }}
                      className="rounded" 
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/70">Echo Cancellation</span>
                    <input 
                      type="checkbox" 
                      checked={audioSettings?.echo_cancellation || false}
                      onChange={(e) => {
                        const newSettings = { ...audioSettings, echo_cancellation: e.target.checked };
                        saveAudioSettings(newSettings);
                      }}
                      className="rounded" 
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/70">Auto Gain Control</span>
                    <input 
                      type="checkbox" 
                      checked={audioSettings?.auto_gain_control || false}
                      onChange={(e) => {
                        const newSettings = { ...audioSettings, auto_gain_control: e.target.checked };
                        saveAudioSettings(newSettings);
                      }}
                      className="rounded" 
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/70">Push to Talk</span>
                    <input 
                      type="checkbox" 
                      checked={audioSettings?.push_to_talk || false}
                      onChange={(e) => {
                        const newSettings = { ...audioSettings, push_to_talk: e.target.checked };
                        saveAudioSettings(newSettings);
                      }}
                      className="rounded" 
                    />
                  </div>
                </div>
                
                <button
                  onClick={() => setShowDeviceSelector(false)}
                  className="w-full mt-4 px-3 py-2 rounded-lg border border-white/10 text-sm hover:bg-white/10 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}