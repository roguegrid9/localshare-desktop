// src/hooks/useAudioDevices.ts - Core audio device hook for Tauri backend integration
import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { toast } from '../components/ui/sonner';
import type {
  TauriAudioDevice,
  TauriAudioSettings,
  TauriAudioLevel,
  MediaManagerStatus,
  MediaManagerError,
  AudioSystemStatus
} from '../types/media';

// Default audio settings matching your backend
const DEFAULT_TAURI_AUDIO_SETTINGS: TauriAudioSettings = {
  input_volume: 1.0,
  output_volume: 1.0,
  noise_suppression: true,
  echo_cancellation: true,
  auto_gain_control: true,
  push_to_talk: false,
  voice_activation_threshold: 0.1,
};

export function useAudioDevices() {
  // Core state
  const [devices, setDevices] = useState<TauriAudioDevice[]>([]);
  const [audioStatus, setAudioStatus] = useState<AudioSystemStatus>({ 
    available: false 
  });
  const [currentSettings, setCurrentSettings] = useState<TauriAudioSettings>(
    DEFAULT_TAURI_AUDIO_SETTINGS
  );
  const [audioLevel, setAudioLevel] = useState<TauriAudioLevel>({
    level: 0,
    peak: 0,
    speaking: false
  });
  
  // Loading and testing state
  const [isLoading, setIsLoading] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, boolean>>({});
  const [captureActive, setCaptureActive] = useState(false);
  
  // Refs for cleanup
  const levelMonitorRef = useRef<NodeJS.Timeout | null>(null);
  const unlistenErrorRef = useRef<(() => void) | null>(null);
  

  // Check if Tauri media backend is available
  const checkBackendStatus = useCallback(async (): Promise<boolean> => {
    try {
      const status = await invoke<MediaManagerStatus>('get_media_manager_status');
      
      const available = status.initialized && status.audio_available;
      setAudioStatus({
        available,
        error: available ? undefined : 'Audio system not available',
        suggestion: available ? undefined : 'Check audio drivers and restart the application'
      });
      
      console.log(`Tauri audio backend: ${available ? 'available' : 'unavailable'}`, status);
      return available;
    } catch (error) {
      console.error('Failed to check backend status:', error);
      setAudioStatus({
        available: false,
        error: 'Backend communication failed',
        suggestion: 'Restart the application'
      });
      return false;
    }
  }, []);

  // Get available audio devices from backend
  const refreshDevices = useCallback(async (): Promise<TauriAudioDevice[]> => {
    if (!audioStatus.available) {
      console.warn('Backend not available, skipping device refresh');
      return [];
    }
    
    setIsLoading(true);
    
    try {
      const backendDevices = await invoke<TauriAudioDevice[]>('get_media_devices');
      
      console.log('Refreshed audio devices:', backendDevices);
      setDevices(backendDevices);
      return backendDevices;
    } catch (error) {
      console.error('Failed to get audio devices:', error);
      toast.error('Failed to get audio devices');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [audioStatus.available, toast]);

  // Test if a specific device works
  const testDevice = useCallback(async (deviceId: string): Promise<boolean> => {
    if (!audioStatus.available) {
      console.warn('Backend not available, skipping device test');
      return false;
    }
    
    try {
      const result = await invoke<boolean>('test_audio_device', { deviceId });
      
      setTestResults(prev => ({
        ...prev,
        [deviceId]: result
      }));

      if (result) {
        toast.success('Device test successful');
      } else {
        toast.error('Device test failed');
      }

      return result;
    } catch (error) {
      console.error(`Failed to test device ${deviceId}:`, error);
      setTestResults(prev => ({
        ...prev,
        [deviceId]: false
      }));
      toast.error('Device test failed');
      return false;
    }
  }, [audioStatus.available, toast]);

  // Start audio capture with specific device and settings
  const startCapture = useCallback(async (
    deviceId?: string, 
    settings?: Partial<TauriAudioSettings>
  ): Promise<void> => {
    if (!audioStatus.available) {
      throw new Error('Audio backend not available');
    }
    
    const captureSettings = { ...currentSettings, ...settings };
    if (deviceId) {
      captureSettings.input_device_id = deviceId;
    }
    
    try {
      await invoke('start_audio_capture', {
        deviceId: captureSettings.input_device_id,
        settings: captureSettings
      });
      
      setCaptureActive(true);
      setCurrentSettings(captureSettings);
      
      // Start audio level monitoring
      startAudioLevelMonitoring();
      
      console.log('Audio capture started:', captureSettings);
      toast.success('Audio capture started');
    } catch (error) {
      console.error('Failed to start audio capture:', error);
      toast.error('Failed to start audio capture');
      throw error;
    }
  }, [audioStatus.available, currentSettings, toast]);

  // Stop audio capture
  const stopCapture = useCallback(async (): Promise<void> => {
    if (!audioStatus.available || !captureActive) {
      return;
    }
    
    try {
      await invoke('stop_audio_capture');
      setCaptureActive(false);
      
      // Stop audio level monitoring
      stopAudioLevelMonitoring();
      
      // Reset audio level
      setAudioLevel({ level: 0, peak: 0, speaking: false });
      
      console.log('Audio capture stopped');
      toast.info('Audio capture stopped');
    } catch (error) {
      console.error('Failed to stop audio capture:', error);
      toast.error('Failed to stop audio capture');
    }
  }, [audioStatus.available, captureActive, toast]);

  // Mute/unmute audio
  const muteAudio = useCallback(async (muted: boolean): Promise<void> => {
    if (!audioStatus.available) {
      throw new Error('Audio backend not available');
    }
    
    try {
      await invoke('mute_audio', { muted });
      console.log(`Audio ${muted ? 'muted' : 'unmuted'}`);
      toast.info(`Audio ${muted ? 'muted' : 'unmuted'}`);
    } catch (error) {
      console.error('Failed to toggle mute:', error);
      toast.error('Failed to toggle mute');
      throw error;
    }
  }, [audioStatus.available, toast]);

  // Set audio volume
  const setVolume = useCallback(async (volume: number): Promise<void> => {
    if (!audioStatus.available) {
      throw new Error('Audio backend not available');
    }
    
    // Clamp volume between 0 and 2
    const clampedVolume = Math.max(0, Math.min(2, volume));
    
    try {
      await invoke('set_audio_volume', { volume: clampedVolume });
      
      setCurrentSettings(prev => ({
        ...prev,
        input_volume: clampedVolume
      }));
      
      console.log(`Audio volume set to ${clampedVolume}`);
      toast.info(`Volume: ${Math.round(clampedVolume * 100)}%`);
    } catch (error) {
      console.error('Failed to set volume:', error);
      toast.error('Failed to set volume');
      throw error;
    }
  }, [audioStatus.available, toast]);

  // Save audio settings to backend
  const saveSettings = useCallback(async (
    settings: TauriAudioSettings
  ): Promise<void> => {
    if (!audioStatus.available) {
      throw new Error('Audio backend not available');
    }
    
    try {
      await invoke('save_audio_settings', { settings });
      setCurrentSettings(settings);
      
      console.log('Audio settings saved:', settings);
      toast.success('Audio settings saved');
    } catch (error) {
      console.error('Failed to save audio settings:', error);
      toast.error('Failed to save audio settings');
      throw error;
    }
  }, [audioStatus.available, toast]);

  // Load audio settings from backend
  const loadSettings = useCallback(async (): Promise<TauriAudioSettings> => {
    if (!audioStatus.available) {
      return DEFAULT_TAURI_AUDIO_SETTINGS;
    }
    
    try {
      const settings = await invoke<TauriAudioSettings>('load_audio_settings');
      setCurrentSettings(settings);
      
      console.log('Audio settings loaded:', settings);
      return settings;
    } catch (error) {
      console.warn('Failed to load audio settings, using defaults:', error);
      setCurrentSettings(DEFAULT_TAURI_AUDIO_SETTINGS);
      return DEFAULT_TAURI_AUDIO_SETTINGS;
    }
  }, [audioStatus.available]);

  // Get simple audio level (for compatibility)
  const getSimpleAudioLevel = useCallback((): number => {
    return audioLevel.level;
  }, [audioLevel.level]);

  // Get detailed audio level
  const getDetailedAudioLevel = useCallback(async (): Promise<TauriAudioLevel> => {
    if (!audioStatus.available) {
      return { level: 0, peak: 0, speaking: false };
    }

    try {
      const level = await invoke<TauriAudioLevel>('get_detailed_audio_level');
      return level;
    } catch (error) {
      // Silently fail - audio level is not critical
      return { level: 0, peak: 0, speaking: false };
    }
  }, [audioStatus.available]);

  // Start real-time audio level monitoring
  const startAudioLevelMonitoring = useCallback(() => {
    if (levelMonitorRef.current) {
      return; // Already monitoring
    }

    levelMonitorRef.current = setInterval(async () => {
      // Don't check captureActive here - it creates a closure issue
      // The monitoring is only started when capture is active anyway
      if (audioStatus.available) {
        try {
          const level = await getDetailedAudioLevel();
          setAudioLevel(level);
        } catch (error) {
          // Silently ignore monitoring errors
        }
      }
    }, 100); // 10 times per second

    console.log('Started audio level monitoring');
  }, [audioStatus.available, getDetailedAudioLevel]);

  // Stop audio level monitoring
  const stopAudioLevelMonitoring = useCallback(() => {
    if (levelMonitorRef.current) {
      clearInterval(levelMonitorRef.current);
      levelMonitorRef.current = null;
      console.log('Stopped audio level monitoring');
    }
  }, []);

  // Get filtered device lists
  const getInputDevices = useCallback((): TauriAudioDevice[] => {
    return devices.filter(device => device.kind === 'audioinput');
  }, [devices]);

  const getOutputDevices = useCallback((): TauriAudioDevice[] => {
    return devices.filter(device => device.kind === 'audiooutput');
  }, [devices]);

  // Initialize the audio system
  const initialize = useCallback(async (): Promise<void> => {
    console.log('Initializing audio devices...');
    
    // Check backend status
    const backendAvailable = await checkBackendStatus();
    
    if (backendAvailable) {
      // Load saved settings
      await loadSettings();
      
      // Get available devices
      await refreshDevices();
    }
    
    console.log('Audio devices initialization complete');
  }, [checkBackendStatus, loadSettings, refreshDevices]);

  // Set up backend error event listener
  useEffect(() => {
    const setupErrorListener = async () => {
      try {
        const unlisten = await listen<MediaManagerError>('media_manager_error', (event) => {
          console.error('Media manager error:', event.payload);
          
          setAudioStatus({
            available: false,
            error: event.payload.error,
            suggestion: event.payload.suggestion
          });
          
          // Stop any active capture
          setCaptureActive(false);
          stopAudioLevelMonitoring();
          
          toast.error(`Audio error: ${event.payload.suggestion}`);
        });
        
        unlistenErrorRef.current = unlisten;
      } catch (error) {
        console.warn('Failed to set up error listener:', error);
      }
    };
    
    setupErrorListener();
    
    return () => {
      if (unlistenErrorRef.current) {
        unlistenErrorRef.current();
      }
    };
  }, [toast, stopAudioLevelMonitoring]);

  // Initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudioLevelMonitoring();
      if (unlistenErrorRef.current) {
        unlistenErrorRef.current();
      }
    };
  }, [stopAudioLevelMonitoring]);

  return {
    // State
    devices,
    audioStatus,
    currentSettings,
    audioLevel,
    isLoading,
    testResults,
    captureActive,
    
    // Device management
    refreshDevices,
    testDevice,
    getInputDevices,
    getOutputDevices,
    
    // Audio control
    startCapture,
    stopCapture,
    muteAudio,
    setVolume,
    
    // Settings
    saveSettings,
    loadSettings,
    
    // Audio level monitoring
    getSimpleAudioLevel,
    getDetailedAudioLevel,
    startAudioLevelMonitoring,
    stopAudioLevelMonitoring,
    
    // Utility
    initialize,
    checkBackendStatus,
  };
}