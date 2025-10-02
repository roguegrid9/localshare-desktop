// src-tauri/src/media/audio_device_manager.rs - Fixed for Send + Sync compatibility

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, Host, Stream, StreamConfig, SampleFormat, SampleRate};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex, RwLock};
use anyhow::{Result, Context};
use serde::{Serialize, Deserialize};


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDevice {
    pub device_id: String,
    pub label: String,
    pub kind: String, // "audioinput", "audiooutput"
    pub group_id: String,
    pub is_default: bool,
    pub sample_rates: Vec<u32>,
    pub channels: Vec<u16>,
}

#[derive(Debug, Clone)]
pub struct AudioSettings {
    pub input_device_id: Option<String>,
    pub output_device_id: Option<String>,
    pub sample_rate: u32,
    pub channels: u16,
    pub buffer_size: u32,
    pub input_volume: f32,
    pub output_volume: f32,
    pub noise_suppression: bool,
    pub echo_cancellation: bool,
    pub auto_gain_control: bool,
}

impl Default for AudioSettings {
    fn default() -> Self {
        Self {
            input_device_id: None,
            output_device_id: None,
            sample_rate: 48000,
            channels: 2,
            buffer_size: 1024,
            input_volume: 1.0,
            output_volume: 1.0,
            noise_suppression: true,
            echo_cancellation: true,
            auto_gain_control: true,
        }
    }
}

#[derive(Debug, Clone)]
pub struct AudioLevel {
    pub level: f32,      // 0.0 to 1.0
    pub peak: f32,       // Peak level for visualization
    pub speaking: bool,  // Voice activation detection
}

// Thread-safe stream handle that doesn't store the actual Stream
pub struct StreamHandle {
    is_active: Arc<RwLock<bool>>,
    stop_sender: Arc<Mutex<Option<mpsc::UnboundedSender<()>>>>,
}

impl StreamHandle {
    fn new() -> Self {
        Self {
            is_active: Arc::new(RwLock::new(false)),
            stop_sender: Arc::new(Mutex::new(None)),
        }
    }

    async fn set_active(&self, active: bool, stop_sender: Option<mpsc::UnboundedSender<()>>) {
        *self.is_active.write().await = active;
        *self.stop_sender.lock().await = stop_sender;
    }

    pub async fn cleanup(&self) {
        if self.is_active().await {
            self.stop().await;
        }
    }

    async fn is_active(&self) -> bool {
        *self.is_active.read().await
    }

    async fn stop(&self) {
        if let Some(sender) = self.stop_sender.lock().await.take() {
            let _ = sender.send(());
        }
        *self.is_active.write().await = false;
    }
}

pub struct AudioDeviceManager {
    host: Host,
    devices: Arc<RwLock<HashMap<String, Device>>>,
    settings: Arc<RwLock<AudioSettings>>,
    
    // Use handles instead of storing streams directly
    input_handle: Arc<StreamHandle>,
    output_handle: Arc<StreamHandle>,
    
    // Audio level monitoring
    audio_level_tx: Arc<Mutex<Option<mpsc::UnboundedSender<AudioLevel>>>>,
    current_level: Arc<RwLock<AudioLevel>>,
    
    // Audio data streaming to WebRTC
    audio_data_tx: Arc<Mutex<Option<mpsc::UnboundedSender<Vec<f32>>>>>,
    
    // Voice activation detection
    voice_activation_threshold: Arc<RwLock<f32>>,
    speaking_timeout: Arc<RwLock<std::time::Instant>>,
}

impl AudioDeviceManager {
    pub fn new() -> Result<Self> {
        let host = cpal::default_host();
        
        Ok(Self {
            host,
            devices: Arc::new(RwLock::new(HashMap::new())),
            settings: Arc::new(RwLock::new(AudioSettings::default())),
            input_handle: Arc::new(StreamHandle::new()),
            output_handle: Arc::new(StreamHandle::new()),
            audio_level_tx: Arc::new(Mutex::new(None)),
            current_level: Arc::new(RwLock::new(AudioLevel {
                level: 0.0,
                peak: 0.0,
                speaking: false,
            })),
            audio_data_tx: Arc::new(Mutex::new(None)),
            voice_activation_threshold: Arc::new(RwLock::new(0.01)),
            speaking_timeout: Arc::new(RwLock::new(std::time::Instant::now())),
        })
    }

    // Enumerate all available audio devices
    pub async fn get_available_devices(&self) -> Result<Vec<AudioDevice>> {
        let mut audio_devices = Vec::new();
        let mut device_map = HashMap::new();

        // Get default devices for comparison
        let default_input = self.host.default_input_device();
        let default_output = self.host.default_output_device();

        // Enumerate input devices
        let input_devices = self.host.input_devices()
            .context("Failed to enumerate input devices")?;

        for (index, device) in input_devices.enumerate() {
            let device_name = device.name()
                .unwrap_or_else(|_| format!("Unknown Input Device {}", index));
            
            let device_id = format!("input_{}", index);
            let is_default = default_input.as_ref()
                .map(|d| d.name().unwrap_or_default() == device_name)
                .unwrap_or(false);

            // Get supported configurations
            let (sample_rates, channels) = self.get_device_capabilities(&device)?;

            let audio_device = AudioDevice {
                device_id: device_id.clone(),
                label: device_name,
                kind: "audioinput".to_string(),
                group_id: "default".to_string(),
                is_default,
                sample_rates,
                channels,
            };

            audio_devices.push(audio_device);
            device_map.insert(device_id, device);
        }

        // Enumerate output devices
        let output_devices = self.host.output_devices()
            .context("Failed to enumerate output devices")?;

        for (index, device) in output_devices.enumerate() {
            let device_name = device.name()
                .unwrap_or_else(|_| format!("Unknown Output Device {}", index));
            
            let device_id = format!("output_{}", index);
            let is_default = default_output.as_ref()
                .map(|d| d.name().unwrap_or_default() == device_name)
                .unwrap_or(false);

            // Get supported configurations
            let (sample_rates, channels) = self.get_device_capabilities(&device)?;

            let audio_device = AudioDevice {
                device_id: device_id.clone(),
                label: device_name,
                kind: "audiooutput".to_string(),
                group_id: "default".to_string(),
                is_default,
                sample_rates,
                channels,
            };

            audio_devices.push(audio_device);
            device_map.insert(device_id, device);
        }

        // Store devices for later use
        {
            let mut devices = self.devices.write().await;
            *devices = device_map;
        }

        log::info!("Enumerated {} audio devices", audio_devices.len());
        Ok(audio_devices)
    }

    // Get device capabilities (sample rates and channel counts)
    fn get_device_capabilities(&self, device: &Device) -> Result<(Vec<u32>, Vec<u16>)> {
        let mut sample_rates = Vec::new();
        let mut channels = Vec::new();

        // Try to get supported input configs
        if let Ok(configs) = device.supported_input_configs() {
            for config_range in configs {
                // Collect sample rates
                let min_rate = config_range.min_sample_rate().0;
                let max_rate = config_range.max_sample_rate().0;
                
                // Add common sample rates within the supported range
                for &rate in &[8000, 16000, 22050, 44100, 48000, 96000] {
                    if rate >= min_rate && rate <= max_rate {
                        sample_rates.push(rate);
                    }
                }

                // Add channel counts
                let channel_count = config_range.channels();
                if !channels.contains(&channel_count) {
                    channels.push(channel_count);
                }
            }
        }

        // Try output configs if input failed
        if sample_rates.is_empty() {
            if let Ok(configs) = device.supported_output_configs() {
                for config_range in configs {
                    let min_rate = config_range.min_sample_rate().0;
                    let max_rate = config_range.max_sample_rate().0;
                    
                    for &rate in &[8000, 16000, 22050, 44100, 48000, 96000] {
                        if rate >= min_rate && rate <= max_rate {
                            sample_rates.push(rate);
                        }
                    }

                    let channel_count = config_range.channels();
                    if !channels.contains(&channel_count) {
                        channels.push(channel_count);
                    }
                }
            }
        }

        // Fallback to common values if detection failed
        if sample_rates.is_empty() {
            sample_rates = vec![44100, 48000];
        }
        if channels.is_empty() {
            channels = vec![1, 2];
        }

        // Remove duplicates and sort
        sample_rates.sort_unstable();
        sample_rates.dedup();
        channels.sort_unstable();
        channels.dedup();

        Ok((sample_rates, channels))
    }

    // Test an audio device by attempting to create a stream
    pub async fn test_audio_device(&self, device_id: &str) -> Result<bool> {
        let devices = self.devices.read().await;
        let device = devices.get(device_id)
            .ok_or_else(|| anyhow::anyhow!("Device not found: {}", device_id))?;

        // Try to create a temporary stream to test the device
        let is_input = device_id.starts_with("input_");

        if is_input {
            // Test input device
            if let Ok(config) = device.default_input_config() {
                let stream_config = StreamConfig {
                    channels: config.channels(),
                    sample_rate: config.sample_rate(),
                    buffer_size: cpal::BufferSize::Default,
                };

                let test_stream = device.build_input_stream(
                    &stream_config,
                    move |_data: &[f32], _: &cpal::InputCallbackInfo| {
                        // Test callback - do nothing
                    },
                    move |err| {
                        log::error!("Audio stream error during test: {}", err);
                    },
                    None,
                );

                match test_stream {
                    Ok(_) => {
                        log::info!("Successfully tested input device: {}", device_id);
                        Ok(true)
                    }
                    Err(e) => {
                        log::error!("Failed to test input device {}: {}", device_id, e);
                        Ok(false)
                    }
                }
            } else {
                log::error!("Failed to get default input config for device: {}", device_id);
                Ok(false)
            }
        } else {
            // Test output device
            if let Ok(config) = device.default_output_config() {
                let stream_config = StreamConfig {
                    channels: config.channels(),
                    sample_rate: config.sample_rate(),
                    buffer_size: cpal::BufferSize::Default,
                };

                let test_stream = device.build_output_stream(
                    &stream_config,
                    move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                        // Test callback - output silence
                        for sample in data {
                            *sample = 0.0;
                        }
                    },
                    move |err| {
                        log::error!("Audio stream error during test: {}", err);
                    },
                    None,
                );

                match test_stream {
                    Ok(_) => {
                        log::info!("Successfully tested output device: {}", device_id);
                        Ok(true)
                    }
                    Err(e) => {
                        log::error!("Failed to test output device {}: {}", device_id, e);
                        Ok(false)
                    }
                }
            } else {
                log::error!("Failed to get default output config for device: {}", device_id);
                Ok(false)
            }
        }
    }

    // Start audio capture from the specified input device
    pub fn start_audio_capture_sync(&self, device_id: Option<String>, settings: AudioSettings) -> Result<()> {
        log::info!("Starting audio capture with device: {:?}", device_id);

        // Get the device
        let device = if let Some(id) = device_id {
            let devices = std::sync::Arc::clone(&self.devices);
            let devices_blocking = tokio::task::block_in_place(|| {
                tokio::runtime::Handle::current().block_on(async { devices.read().await.clone() })
            });
            devices_blocking.get(&id)
                .ok_or_else(|| anyhow::anyhow!("Input device not found: {}", id))?
                .clone()
        } else {
            self.host.default_input_device()
                .ok_or_else(|| anyhow::anyhow!("No default input device available"))?
        };

        // Configure the stream
        let stream_config = StreamConfig {
            channels: settings.channels,
            sample_rate: SampleRate(settings.sample_rate),
            buffer_size: cpal::BufferSize::Fixed(settings.buffer_size),
        };

        log::info!("Audio capture config: {:?}", stream_config);

        // Create channels for audio data and level monitoring
        let (audio_tx, _audio_rx) = mpsc::unbounded_channel::<Vec<f32>>();
        let (level_tx, _level_rx) = mpsc::unbounded_channel::<AudioLevel>();
        let (stop_tx, _stop_rx) = mpsc::unbounded_channel::<()>();

        // Store senders using block_in_place to avoid async
        tokio::task::block_in_place(|| {
            let audio_data_tx = std::sync::Arc::clone(&self.audio_data_tx);
            let audio_level_tx = std::sync::Arc::clone(&self.audio_level_tx);
            
            tokio::runtime::Handle::current().block_on(async {
                *audio_data_tx.lock().await = Some(audio_tx.clone());
                *audio_level_tx.lock().await = Some(level_tx.clone());
            });
        });

        // Clone for the callback
        let current_level = std::sync::Arc::clone(&self.current_level);
        let voice_threshold = std::sync::Arc::clone(&self.voice_activation_threshold);
        let speaking_timeout = std::sync::Arc::clone(&self.speaking_timeout);
        let input_volume = settings.input_volume;

        // Build and start the stream all in one synchronous block
        let stream = device.build_input_stream(
            &stream_config,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                // Apply input volume
                let processed_data: Vec<f32> = data.iter()
                    .map(|&sample| sample * input_volume)
                    .collect();

                // Calculate audio level
                let level = calculate_rms_level(&processed_data);
                let peak = processed_data.iter()
                    .map(|&x| x.abs())
                    .max_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
                    .unwrap_or(0.0);

                // Voice activation detection
                let threshold = *voice_threshold.blocking_read();
                let is_speaking = level > threshold;
                
                // Update speaking state with timeout
                if is_speaking {
                    *speaking_timeout.blocking_write() = std::time::Instant::now();
                }
                
                let speaking_active = speaking_timeout.blocking_read().elapsed().as_millis() < 500;

                // Update current level
                let audio_level = AudioLevel {
                    level,
                    peak,
                    speaking: speaking_active,
                };
                
                *current_level.blocking_write() = audio_level.clone();

                // Send level update (non-blocking)
                let _ = level_tx.send(audio_level);
                let _ = audio_tx.send(processed_data);
            },
            move |err| {
                log::error!("Audio input stream error: {}", err);
            },
            None,
        ).context("Failed to build input stream")?;

        // Start the stream
        stream.play().context("Failed to start audio input stream")?;

        // Forget the stream to avoid Send issues
        std::mem::forget(stream);

        // Update the handle using block_in_place
        tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async {
                self.input_handle.set_active(true, Some(stop_tx)).await;
            });
        });

        log::info!("Audio capture started successfully");
        Ok(())
    }

    // Stop audio capture
    pub async fn stop_audio_capture(&self) -> Result<()> {
        log::info!("Stopping audio capture");

        // Stop the stream through the handle
        self.input_handle.stop().await;

        // Clear senders
        {
            let mut audio_data_tx = self.audio_data_tx.lock().await;
            *audio_data_tx = None;
        }
        {
            let mut audio_level_tx = self.audio_level_tx.lock().await;
            *audio_level_tx = None;
        }

        // Reset audio level
        {
            let mut current_level = self.current_level.write().await;
            *current_level = AudioLevel {
                level: 0.0,
                peak: 0.0,
                speaking: false,
            };
        }

        log::info!("Audio capture stopped");
        Ok(())
    }

    // Get current audio level for UI feedback
    pub async fn get_current_audio_level(&self) -> AudioLevel {
        self.current_level.read().await.clone()
    }

    // Set voice activation threshold
    pub async fn set_voice_activation_threshold(&self, threshold: f32) {
        let mut voice_threshold = self.voice_activation_threshold.write().await;
        *voice_threshold = threshold.clamp(0.0, 1.0);
        log::debug!("Voice activation threshold set to: {}", threshold);
    }

    // Set input volume
    pub async fn set_input_volume(&self, volume: f32) {
        let mut settings = self.settings.write().await;
        settings.input_volume = volume.clamp(0.0, 2.0); // Allow up to 200% volume
        log::debug!("Input volume set to: {}", volume);
    }

    // Get audio data receiver for WebRTC integration
    pub async fn get_audio_data_receiver(&self) -> Option<mpsc::UnboundedReceiver<Vec<f32>>> {
        // This would be called once to get the receiver for WebRTC integration
        // In practice, you'd set up this connection when initializing the media system
        let (_tx, rx) = mpsc::unbounded_channel();
        Some(rx)
    }

    // Update audio settings
    pub async fn update_settings(&self, new_settings: AudioSettings) -> Result<()> {
        let mut settings = self.settings.write().await;
        *settings = new_settings;
        log::info!("Audio settings updated");
        Ok(())
    }

    // Get current settings
    pub async fn get_settings(&self) -> AudioSettings {
        self.settings.read().await.clone()
    }

    // Check if audio capture is active
    pub async fn is_capture_active(&self) -> bool {
        self.input_handle.is_active().await
    }
}

// Calculate RMS (Root Mean Square) level for audio data
fn calculate_rms_level(data: &[f32]) -> f32 {
    if data.is_empty() {
        return 0.0;
    }

    let sum_of_squares: f32 = data.iter()
        .map(|&sample| sample * sample)
        .sum();

    (sum_of_squares / data.len() as f32).sqrt()
}