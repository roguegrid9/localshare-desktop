// src/types/media.ts - Updated media types with Tauri backend integration

// Keep existing browser WebRTC types
export type MediaStreamType = 'camera' | 'microphone' | 'screen' | 'window' | 'tab';

export type MediaDeviceInfo = {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput' | 'videoinput';
  groupId: string;
};

export type MediaStreamState = {
  audio: {
    enabled: boolean;
    muted: boolean;
    deviceId?: string;
    stream?: MediaStream;
  };
  video: {
    enabled: boolean;
    muted: boolean;
    deviceId?: string;
    stream?: MediaStream;
  };
  screen: {
    enabled: boolean;
    stream?: MediaStream;
    sourceType?: 'screen' | 'window' | 'tab';
  };
};

export type RemoteMediaState = {
  userId: string;
  sessionId: string;
  displayName?: string;
  audio: {
    enabled: boolean;
    speaking: boolean;
    volume: number;
  };
  video: {
    enabled: boolean;
    stream?: MediaStream;
  };
  screen: {
    enabled: boolean;
    stream?: MediaStream;
  };
};

export type MediaPermissions = {
  camera: PermissionState;
  microphone: PermissionState;
  screen: PermissionState;
};

export type MediaConstraints = {
  audio: boolean | MediaTrackConstraints;
  video: boolean | MediaTrackConstraints;
};

export type ScreenCaptureOptions = {
  video: boolean | {
    cursor?: 'always' | 'motion' | 'never';
    displaySurface?: 'browser' | 'window' | 'monitor';
    logicalSurface?: boolean;
    resizeMode?: 'none' | 'crop-and-scale';
  };
  audio?: boolean;
  preferCurrentTab?: boolean;
  selfBrowserSurface?: 'exclude' | 'include';
  systemAudio?: 'exclude' | 'include';
};

// ===== NEW: Tauri Backend Types =====

// Audio device from Tauri backend
export type TauriAudioDevice = {
  device_id: string;
  label: string;
  kind: string; // "audioinput" | "audiooutput" | "videoinput"
  group_id: string;
};

// Audio settings for Tauri backend
export type TauriAudioSettings = {
  input_device_id?: string;
  output_device_id?: string;
  input_volume: number;        // 0.0 to 2.0
  output_volume: number;       // 0.0 to 2.0
  noise_suppression: boolean;
  echo_cancellation: boolean;
  auto_gain_control: boolean;
  push_to_talk: boolean;
  push_to_talk_key?: string;
  voice_activation_threshold: number; // 0.0 to 1.0
};

// Audio level from Tauri backend
export type TauriAudioLevel = {
  level: number;      // 0.0 to 1.0 RMS level
  peak: number;       // Peak level for visualization
  speaking: boolean;  // Voice activation detection
};

// Media manager status
export type MediaManagerStatus = {
  initialized: boolean;
  audio_available: boolean;
  video_available: boolean;
  screen_share_available: boolean;
};

// Media error from backend
export type MediaManagerError = {
  error: string;
  suggestion: string;
};

// ===== ENHANCED TYPES =====

// Enhanced media state that combines browser and backend
export type EnhancedMediaState = {
  // Backend state
  backendAvailable: boolean;
  lastBackendError?: string;
  captureActive: boolean;
  selectedInputDevice?: string;
  selectedOutputDevice?: string;
  
  // Audio state combining both sources
  audio: {
    enabled: boolean;
    muted: boolean;
    deviceId?: string;
    stream?: MediaStream;
    level: number;           // Real-time level from backend
    speaking: boolean;       // Voice activation from backend
    captureSettings?: TauriAudioSettings;
  };
  
  // Keep existing video/screen (browser-only for now)
  video: {
    enabled: boolean;
    muted: boolean;
    deviceId?: string;
    stream?: MediaStream;
  };
  screen: {
    enabled: boolean;
    stream?: MediaStream;
    sourceType?: 'screen' | 'window' | 'tab';
  };
};

// Available devices combining browser and backend
export type EnhancedDeviceInfo = {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput' | 'videoinput';
  groupId: string;
  source: 'browser' | 'backend';  // Where this device info came from
  isDefault?: boolean;            // Only available from backend
  capabilities?: {               // Only available from backend
    sampleRates: number[];
    channels: number[];
  };
};

// Events that get emitted for media state changes
export type MediaStateChangedPayload = {
  sessionId: string;
  userId: string;
  mediaType: 'audio' | 'video' | 'screen';
  enabled: boolean;
  muted?: boolean;
};

export type MediaErrorPayload = {
  sessionId: string;
  errorType: 'permission_denied' | 'device_not_found' | 'stream_failed' | 'connection_failed' | 'backend_unavailable';
  message: string;
  mediaType?: MediaStreamType;
};

// WebRTC-specific media types
export type RTCMediaTrackInfo = {
  trackId: string;
  kind: 'audio' | 'video';
  label: string;
  enabled: boolean;
  muted: boolean;
  readyState: 'live' | 'ended';
};

export type MediaSessionInfo = {
  sessionId: string;
  isHost: boolean;
  localMedia: EnhancedMediaState;
  remoteParticipants: RemoteMediaState[];
  mediaConnected: boolean;
  lastError?: string;
};

// Media quality settings
export type MediaQualityPreset = 'low' | 'medium' | 'high' | 'auto';

export type MediaQualitySettings = {
  video: {
    width: number;
    height: number;
    frameRate: number;
    bitrate?: number;
  };
  audio: {
    sampleRate: number;
    bitrate?: number;
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
  };
};

// Stats and debugging
export type MediaStreamStats = {
  audio?: {
    packetsLost: number;
    packetsReceived: number;
    bytesReceived: number;
    jitter: number;
  };
  video?: {
    packetsLost: number;
    packetsReceived: number;
    bytesReceived: number;
    frameRate: number;
    resolution: { width: number; height: number };
  };
};

// UI component props helpers
export type MediaControlsConfig = {
  showAudio: boolean;
  showVideo: boolean;
  showScreenShare: boolean;
  showSettings: boolean;
  allowDeviceSelection: boolean;
  size: 'sm' | 'md' | 'lg';
};

export type VideoLayoutMode = 'grid' | 'speaker' | 'pip' | 'sidebar';

export type AudioVisualizationData = {
  level: number; // 0-1 normalized audio level
  speaking: boolean;
  timestamp: number;
};

// ===== DEVICE SELECTION TYPES =====

export type DeviceSelectionState = {
  availableDevices: EnhancedDeviceInfo[];
  selectedInput?: string;
  selectedOutput?: string;
  isLoading: boolean;
  testResults: Record<string, boolean>; // device_id -> test success
};

// ===== VOICE CHANNEL TYPES =====

export type VoiceChannelState = {
  channelId: string;
  sessionId?: string;
  isConnected: boolean;
  isConnecting: boolean;
  participants: VoiceParticipant[];
  audioSettings?: TauriAudioSettings;
};

export type VoiceParticipant = {
  userId: string;
  displayName: string;
  isLocal: boolean;
  audioEnabled: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  audioLevel?: number;
  connectionState: 'connecting' | 'connected' | 'disconnected';
};

// ===== ERROR HANDLING =====

export type MediaBackendError = 
  | { type: 'not_available'; message: string }
  | { type: 'device_error'; deviceId: string; message: string }
  | { type: 'capture_failed'; message: string }
  | { type: 'permission_denied'; message: string };

// ===== SETTINGS PERSISTENCE =====

export type MediaSettingsProfile = {
  name: string;
  audioSettings: TauriAudioSettings;
  videoSettings?: any; // For future video settings
  lastUsed: string;
  isDefault: boolean;
};

export type MediaPreferences = {
  profiles: MediaSettingsProfile[];
  activeProfile: string;
  rememberDeviceSelection: boolean;
  autoJoinVoice: boolean;
  showAdvancedSettings: boolean;
};

// Audio system availability state
export interface AudioSystemStatus {
  available: boolean;
  error?: string;
  suggestion?: string;
}

// Audio error boundary component props
export interface AudioErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: string; suggestion?: string }>;
}

// Audio unavailable state component props
export interface AudioUnavailableStateProps {
  message?: string;
  error?: string;
  suggestion?: string;
  onRetry?: () => void;
}

// Device selection UI state
export interface DeviceTestState {
  isTestingDevice?: string;
  testResults: Record<string, boolean>;
}

// Voice channel participant with real audio data
export interface VoiceParticipantWithAudio extends VoiceParticipant {
  audioLevel?: number;
  peak?: number;
  lastSpokeAt?: number;
}

// Enhanced media controls config for voice channels
export interface VoiceMediaControlsConfig extends MediaControlsConfig {
  showVolumeSlider?: boolean;
  showNoiseSuppressionToggle?: boolean;
  showPushToTalkToggle?: boolean;
  showThresholdSlider?: boolean;
}

// Real-time audio settings that can be adjusted during capture
export interface LiveAudioSettings {
  volume: number;
  muted: boolean;
  voiceActivationThreshold: number;
  pushToTalkEnabled: boolean;
  pushToTalkKey?: string;
}

// Audio device capabilities (from backend)
export interface AudioDeviceCapabilities {
  sampleRates: number[];
  channels: number[];
  isDefault: boolean;
  supportsAEC: boolean; // Acoustic Echo Cancellation
  supportsNS: boolean;  // Noise Suppression
  supportsAGC: boolean; // Auto Gain Control
}

// Enhanced device info with capabilities
export interface EnhancedDeviceInfoWithCapabilities extends EnhancedDeviceInfo {
  capabilities?: AudioDeviceCapabilities;
  lastTested?: number;
  testResult?: boolean;
}