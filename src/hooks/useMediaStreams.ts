// src/hooks/useMediaStreams.ts - Updated to use useAudioDevices hook
import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../components/ui/Toaster';
import { useAudioDevices } from './useAudioDevices';
import type {
  EnhancedMediaState,
  EnhancedDeviceInfo,
  MediaPermissions,
  MediaConstraints,
  ScreenCaptureOptions,
  MediaQualityPreset,
  MediaQualitySettings,
  AudioVisualizationData,
  TauriAudioSettings,
  DeviceSelectionState
} from '../types/media';

// Quality presets for browser WebRTC (keep existing)
const QUALITY_PRESETS: Record<MediaQualityPreset, MediaQualitySettings> = {
  low: {
    video: { width: 320, height: 240, frameRate: 15 },
    audio: { sampleRate: 16000, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  },
  medium: {
    video: { width: 640, height: 480, frameRate: 24 },
    audio: { sampleRate: 44100, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  },
  high: {
    video: { width: 1280, height: 720, frameRate: 30 },
    audio: { sampleRate: 48000, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  },
  auto: {
    video: { width: 640, height: 480, frameRate: 24 },
    audio: { sampleRate: 44100, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  }
};

export function useMediaStreams(initialQuality: MediaQualityPreset = 'medium') {
  const [mediaState, setMediaState] = useState<EnhancedMediaState>({
    backendAvailable: false,
    captureActive: false,
    audio: { enabled: false, muted: false, level: 0, speaking: false },
    video: { enabled: false, muted: false },
    screen: { enabled: false }
  });
  
  const [deviceSelection, setDeviceSelection] = useState<DeviceSelectionState>({
    availableDevices: [],
    isLoading: false,
    testResults: {}
  });
  
  const [permissions, setPermissions] = useState<MediaPermissions>({
    camera: 'prompt',
    microphone: 'prompt',
    screen: 'prompt'
  });
  
  const [qualityPreset, setQualityPreset] = useState<MediaQualityPreset>(initialQuality);
  const [isInitialized, setIsInitialized] = useState(false);
  
  const toast = useToast();
  
  // Use the new audio devices hook
  const {
    devices: audioDevices,
    audioStatus,
    currentSettings: audioSettings,
    audioLevel: backendAudioLevel,
    captureActive: backendCaptureActive,
    startCapture,
    stopCapture,
    muteAudio,
    setVolume,
    testDevice,
    getInputDevices,
    getOutputDevices,
    saveSettings: saveAudioSettings,
    loadSettings: loadAudioSettings
  } = useAudioDevices();
  
  // Browser fallback refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioLevelIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Sync backend state with mediaState
  useEffect(() => {
    // Debug logging for speaking state
    if (backendAudioLevel.speaking) {
      console.log('[Speaking Detected]', {
        level: backendAudioLevel.level,
        speaking: backendAudioLevel.speaking
      });
    }

    setMediaState(prev => ({
      ...prev,
      backendAvailable: audioStatus.available,
      captureActive: backendCaptureActive,
      lastBackendError: audioStatus.error,
      audio: {
        ...prev.audio,
        level: backendAudioLevel.level,
        speaking: backendAudioLevel.speaking,
        captureSettings: audioSettings
      }
    }));
  }, [audioStatus, backendCaptureActive, backendAudioLevel, audioSettings]);

  // Get available devices from both backend and browser
  const refreshAvailableDevices = useCallback(async () => {
    setDeviceSelection(prev => ({ ...prev, isLoading: true }));
    
    try {
      const devices: EnhancedDeviceInfo[] = [];
      
      // Get audio devices from backend (preferred)
      if (audioStatus.available) {
        const backendAudioDevices = audioDevices.map(device => ({
          deviceId: device.device_id,
          label: device.label,
          kind: device.kind as 'audioinput' | 'audiooutput' | 'videoinput',
          groupId: device.group_id,
          source: 'backend' as const,
        }));
        devices.push(...backendAudioDevices);
      }
      
      // Get browser devices for fallback audio only (no video for MVP)
      if (navigator.mediaDevices?.enumerateDevices) {
        try {
          const browserDevices = await navigator.mediaDevices.enumerateDevices();
          const browserDeviceInfos = browserDevices
            .filter(device => {
              // Only include audio devices if backend not available
              return !audioStatus.available && device.kind.includes('audio');
            })
            .map(device => ({
              deviceId: device.deviceId,
              label: device.label || `${device.kind} ${device.deviceId.slice(0, 8)}`,
              kind: device.kind as 'audioinput' | 'audiooutput' | 'videoinput',
              groupId: device.groupId,
              source: 'browser' as const,
            }));
          devices.push(...browserDeviceInfos);
        } catch (error) {
          console.error('Failed to get browser devices:', error);
        }
      }
      
      setDeviceSelection(prev => ({
        ...prev,
        availableDevices: devices,
        isLoading: false
      }));
      
      return devices;
    } catch (error) {
      console.error('Failed to refresh devices:', error);
      setDeviceSelection(prev => ({ ...prev, isLoading: false }));
      return [];
    }
  }, [audioStatus.available, audioDevices]);

  // Test audio device (uses backend if available)
  const testAudioDevice = useCallback(async (deviceId: string): Promise<boolean> => {
    if (audioStatus.available) {
      return await testDevice(deviceId);
    }
    
    // Fallback browser test (simplified)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } }
      });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch {
      return false;
    }
  }, [audioStatus.available, testDevice]);

  // Start audio (prefer backend, fallback to browser)
  const startAudio = useCallback(async (deviceId?: string): Promise<MediaStream | null> => {
    try {
      if (audioStatus.available) {
        // Use Tauri backend for audio capture
        await startCapture(deviceId, audioSettings);
        
        setMediaState(prev => ({
          ...prev,
          audio: {
            ...prev.audio,
            enabled: true,
            deviceId: deviceId || audioSettings.input_device_id,
          }
        }));

        toast('Microphone started (backend)', 'success');
        return null; // Backend doesn't return MediaStream
      } else {
        // Fallback to browser WebRTC
        return await startAudioBrowser(deviceId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to start audio:', error);
      toast(`Failed to start microphone: ${message}`, 'error');
      return null;
    }
  }, [audioStatus.available, audioSettings, startCapture, toast]);

  // Browser WebRTC audio (fallback)
  const startAudioBrowser = useCallback(async (deviceId?: string): Promise<MediaStream | null> => {
    try {
      const settings = QUALITY_PRESETS[qualityPreset];
      const constraints: MediaConstraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          sampleRate: settings.audio.sampleRate,
          echoCancellation: settings.audio.echoCancellation,
          noiseSuppression: settings.audio.noiseSuppression,
          autoGainControl: settings.audio.autoGainControl
        },
        video: false
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Set up browser audio level monitoring
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
      }
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current!);
      
      setMediaState(prev => ({
        ...prev,
        audio: {
          ...prev.audio,
          enabled: true,
          stream,
          deviceId
        }
      }));
      
      startBrowserAudioLevelMonitoring();
      toast('Microphone started (browser)', 'success');
      return stream;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to start browser audio:', error);
      toast(`Failed to start microphone: ${message}`, 'error');
      return null;
    }
  }, [qualityPreset, toast]);

  // Stop audio capture
  const stopAudio = useCallback(async () => {
    try {
      if (audioStatus.available && backendCaptureActive) {
        await stopCapture();
      }
      
      // Also stop browser stream if exists
      const audioStream = mediaState.audio.stream;
      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        setMediaState(prev => ({
          ...prev,
          audio: {
            ...prev.audio,
            enabled: false,
            stream: undefined
          }
        }));
      }

      stopBrowserAudioLevelMonitoring();
      toast('Microphone stopped', 'info');
    } catch (error) {
      console.error('Failed to stop audio:', error);
      toast('Failed to stop microphone', 'error');
    }
  }, [audioStatus.available, backendCaptureActive, mediaState.audio.stream, stopCapture, toast]);

  // Toggle mute
  const toggleAudioMute = useCallback(async () => {
    try {
      const newMutedState = !mediaState.audio.muted;
      
      if (audioStatus.available) {
        await muteAudio(newMutedState);
      }
      
      // Also handle browser stream
      if (mediaState.audio.stream) {
        const audioTracks = mediaState.audio.stream.getAudioTracks();
        audioTracks.forEach(track => {
          track.enabled = !newMutedState;
        });
      }
      
      setMediaState(prev => ({
        ...prev,
        audio: {
          ...prev.audio,
          muted: newMutedState
        }
      }));
      
      toast(newMutedState ? 'Microphone muted' : 'Microphone unmuted', 'info');
    } catch (error) {
      console.error('Failed to toggle mute:', error);
      toast('Failed to toggle mute', 'error');
    }
  }, [audioStatus.available, mediaState.audio.muted, mediaState.audio.stream, muteAudio, toast]);

  // Set audio volume
  const setAudioVolume = useCallback(async (volume: number) => {
    try {
      if (audioStatus.available) {
        await setVolume(volume);
      }
      toast(`Volume set to ${Math.round(volume * 100)}%`, 'info');
    } catch (error) {
      console.error('Failed to set volume:', error);
      toast('Failed to set volume', 'error');
    }
  }, [audioStatus.available, setVolume, toast]);

  // Browser audio level monitoring (fallback)
  const startBrowserAudioLevelMonitoring = useCallback(() => {
    if (audioLevelIntervalRef.current) return;
    
    audioLevelIntervalRef.current = setInterval(() => {
      if (!analyserRef.current) return;
      
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      
      const rms = Math.sqrt(dataArray.reduce((sum, val) => sum + val * val, 0) / dataArray.length);
      const normalizedLevel = Math.min(rms / 128, 1);
      const speaking = normalizedLevel > 0.01;
      
      setMediaState(prev => ({
        ...prev,
        audio: {
          ...prev.audio,
          level: normalizedLevel,
          speaking
        }
      }));
    }, 100);
  }, []);

  // Stop browser audio level monitoring
  const stopBrowserAudioLevelMonitoring = useCallback(() => {
    if (audioLevelIntervalRef.current) {
      clearInterval(audioLevelIntervalRef.current);
      audioLevelIntervalRef.current = null;
    }
  }, []);

  // Video and screen sharing removed for MVP - audio-only focus

  // Change device (audio only for MVP)
  const changeDevice = useCallback(async (deviceId: string) => {
    if (mediaState.audio.enabled) {
      await stopAudio();
      await startAudio(deviceId);
    }
    setDeviceSelection(prev => ({ ...prev, selectedInput: deviceId }));
  }, [mediaState.audio.enabled, stopAudio, startAudio]);

  // Get current audio level for visualization
  const getAudioLevel = useCallback((): AudioVisualizationData => {
    return {
      level: mediaState.audio.level,
      speaking: mediaState.audio.speaking,
      timestamp: Date.now()
    };
  }, [mediaState.audio.level, mediaState.audio.speaking]);

  // Initialize media system
  const initializeMedia = useCallback(async () => {
    try {
      // Refresh available devices (this will also check backend status)
      await refreshAvailableDevices();
      
      // Check browser permissions for fallback
      if (navigator.mediaDevices?.getUserMedia) {
        if ('permissions' in navigator) {
          try {
            const cameraPermission = await navigator.permissions.query({ name: 'camera' as PermissionName });
            const micPermission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
            
            setPermissions({
              camera: cameraPermission.state,
              microphone: micPermission.state,
              screen: 'prompt'
            });
          } catch (error) {
            console.warn('Failed to check permissions:', error);
          }
        }
      }
      
      setIsInitialized(true);
      console.log('Media system initialized');
    } catch (error) {
      console.error('Failed to initialize media system:', error);
      toast('Media system initialization failed', 'error');
    }
  }, [refreshAvailableDevices, toast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop audio stream
      mediaState.audio.stream?.getTracks().forEach(track => track.stop());
      
      // Close audio context
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      
      // Stop monitoring
      stopBrowserAudioLevelMonitoring();
    };
  }, []);

  // Initialize on mount
  useEffect(() => {
    initializeMedia();
  }, [initializeMedia]);

  return {
    // Enhanced state
    mediaState,
    deviceSelection,
    permissions,
    qualityPreset,
    isInitialized,
    audioSettings,
    
    // Device management
    refreshAvailableDevices,
    testAudioDevice,
    changeDevice,
    
    // Audio controls (audio-only for MVP)
    startAudio,
    stopAudio,
    toggleAudioMute,
    setAudioVolume,
    
    // Settings
    setQualityPreset,
    saveAudioSettings,
    loadAudioSettings,
    
    // Audio visualization
    getAudioLevel,
    
    // Utility
    initializeMedia,
    
    // Backend status
    backendAvailable: audioStatus.available,
    lastBackendError: audioStatus.error,
    
    // Available devices (combined)
    availableDevices: deviceSelection.availableDevices,
    
    // Audio device helpers
    getInputDevices,
    getOutputDevices,
  };
}