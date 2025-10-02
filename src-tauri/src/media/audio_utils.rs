// src-tauri/src/media/audio_utils.rs - Audio processing utilities for WebRTC integration

use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};
use anyhow::Result;

/// Audio sample format conversion utilities
pub struct AudioConverter {
    pub input_sample_rate: u32,
    pub output_sample_rate: u32,
    pub input_channels: u16,
    pub output_channels: u16,
}

impl AudioConverter {
    pub fn new(
        input_sample_rate: u32,
        output_sample_rate: u32,
        input_channels: u16,
        output_channels: u16,
    ) -> Self {
        Self {
            input_sample_rate,
            output_sample_rate,
            input_channels,
            output_channels,
        }
    }

    /// Convert audio sample rate using linear interpolation
    /// In production, you'd want to use a proper resampling library like `rubato`
    pub fn resample(&self, input: &[f32]) -> Vec<f32> {
        if self.input_sample_rate == self.output_sample_rate {
            return input.to_vec();
        }

        let ratio = self.output_sample_rate as f64 / self.input_sample_rate as f64;
        let output_len = (input.len() as f64 * ratio) as usize;
        let mut output = vec![0.0f32; output_len];

        for i in 0..output_len {
            let input_index = (i as f64 / ratio) as usize;
            if input_index < input.len() {
                output[i] = input[input_index];
            }
        }

        output
    }

    /// Convert between mono and stereo
    pub fn convert_channels(&self, input: &[f32]) -> Vec<f32> {
        match (self.input_channels, self.output_channels) {
            (1, 2) => {
                // Mono to stereo: duplicate each sample
                let mut output = Vec::with_capacity(input.len() * 2);
                for &sample in input {
                    output.push(sample);
                    output.push(sample);
                }
                output
            }
            (2, 1) => {
                // Stereo to mono: average left and right channels
                let mut output = Vec::with_capacity(input.len() / 2);
                for chunk in input.chunks_exact(2) {
                    let mono_sample = (chunk[0] + chunk[1]) / 2.0;
                    output.push(mono_sample);
                }
                output
            }
            _ => input.to_vec(), // Same channel count or unsupported conversion
        }
    }

    /// Full conversion pipeline
    pub fn convert(&self, input: &[f32]) -> Vec<f32> {
        let channel_converted = self.convert_channels(input);
        self.resample(&channel_converted)
    }
}

/// Audio processing effects
pub struct AudioProcessor {
    // Noise gate parameters
    gate_threshold: f32,
    gate_ratio: f32,
    
    // Simple high-pass filter for noise reduction
    high_pass_cutoff: f32,
    previous_input: f32,
    previous_output: f32,
}

impl AudioProcessor {
    pub fn new() -> Self {
        Self {
            gate_threshold: 0.01,
            gate_ratio: 0.1,
            high_pass_cutoff: 80.0, // 80 Hz cutoff
            previous_input: 0.0,
            previous_output: 0.0,
        }
    }

    /// Apply noise gate to reduce background noise
    pub fn apply_noise_gate(&mut self, samples: &mut [f32]) {
        for sample in samples {
            let level = sample.abs();
            
            if level < self.gate_threshold {
                *sample *= self.gate_ratio; // Reduce amplitude below threshold
            }
        }
    }

    /// Simple high-pass filter to remove low-frequency noise
    pub fn apply_high_pass_filter(&mut self, samples: &mut [f32], sample_rate: f32) {
        let rc = 1.0 / (2.0 * std::f32::consts::PI * self.high_pass_cutoff);
        let dt = 1.0 / sample_rate;
        let alpha = rc / (rc + dt);

        for sample in samples {
            let output = alpha * (self.previous_output + *sample - self.previous_input);
            self.previous_input = *sample;
            self.previous_output = output;
            *sample = output;
        }
    }

    /// Apply volume/gain adjustment
    pub fn apply_gain(&self, samples: &mut [f32], gain: f32) {
        for sample in samples {
            *sample *= gain;
            // Prevent clipping
            *sample = sample.clamp(-1.0, 1.0);
        }
    }

    /// Process audio with all enabled effects
    pub fn process(&mut self, samples: &mut [f32], sample_rate: f32, settings: &AudioProcessingSettings) {
        if settings.high_pass_filter {
            self.apply_high_pass_filter(samples, sample_rate);
        }
        
        if settings.noise_gate {
            self.apply_noise_gate(samples);
        }
        
        if settings.gain != 1.0 {
            self.apply_gain(samples, settings.gain);
        }
    }

    /// Update noise gate settings
    pub fn set_gate_parameters(&mut self, threshold: f32, ratio: f32) {
        self.gate_threshold = threshold.clamp(0.0, 1.0);
        self.gate_ratio = ratio.clamp(0.0, 1.0);
    }
}

#[derive(Debug, Clone)]
pub struct AudioProcessingSettings {
    pub noise_gate: bool,
    pub high_pass_filter: bool,
    pub gain: f32,
    pub noise_gate_threshold: f32,
    pub noise_gate_ratio: f32,
}

impl Default for AudioProcessingSettings {
    fn default() -> Self {
        Self {
            noise_gate: true,
            high_pass_filter: true,
            gain: 1.0,
            noise_gate_threshold: 0.01,
            noise_gate_ratio: 0.1,
        }
    }
}

/// Audio buffer for managing real-time audio streams
pub struct AudioBuffer {
    buffer: Arc<Mutex<Vec<f32>>>,
    capacity: usize,
    pub sender: mpsc::UnboundedSender<Vec<f32>>,
    receiver: Arc<Mutex<mpsc::UnboundedReceiver<Vec<f32>>>>,
}

impl AudioBuffer {
    pub fn new(capacity: usize) -> Self {
        let (sender, receiver) = mpsc::unbounded_channel();
        
        Self {
            buffer: Arc::new(Mutex::new(Vec::with_capacity(capacity))),
            capacity,
            sender,
            receiver: Arc::new(Mutex::new(receiver)),
        }
    }

    /// Add audio data to the buffer
    pub async fn push(&self, data: Vec<f32>) -> Result<()> {
        let mut buffer = self.buffer.lock().await;
        
        // If buffer would exceed capacity, remove old data
        while buffer.len() + data.len() > self.capacity {
            let remove_count = (buffer.len() + data.len() - self.capacity).min(buffer.len());
            buffer.drain(0..remove_count);
        }
        
        buffer.extend(data);
        Ok(())
    }

    /// Get audio data from the buffer
    pub async fn pop(&self, requested_samples: usize) -> Vec<f32> {
        let mut buffer = self.buffer.lock().await;
        
        if buffer.len() >= requested_samples {
            buffer.drain(0..requested_samples).collect()
        } else {
            // Return what we have and pad with silence
            let available = buffer.drain(..).collect::<Vec<_>>();
            let mut result = available;
            result.resize(requested_samples, 0.0);
            result
        }
    }

    /// Get current buffer size
    pub async fn len(&self) -> usize {
        self.buffer.lock().await.len()
    }

    /// Check if buffer is empty
    pub async fn is_empty(&self) -> bool {
        self.buffer.lock().await.is_empty()
    }

    /// Clear the buffer
    pub async fn clear(&self) -> Result<()> {
        let mut buffer = self.buffer.lock().await;
        buffer.clear();
        Ok(())
    }

    /// Process buffered audio in chunks for WebRTC
    pub async fn get_webrtc_chunk(&self, chunk_size: usize) -> Option<Vec<f32>> {
        let mut receiver = self.receiver.lock().await;
        
        // Try to receive new audio data
        while let Ok(new_data) = receiver.try_recv() {
            let _ = self.push(new_data).await;
        }
        
        // Return a chunk if we have enough data
        if self.len().await >= chunk_size {
            Some(self.pop(chunk_size).await)
        } else {
            None
        }
    }
}

/// Utility function to convert f32 audio samples to i16 for WebRTC
pub fn f32_to_i16_samples(input: &[f32]) -> Vec<i16> {
    input.iter()
        .map(|&sample| {
            let scaled = sample * 32767.0;
            scaled.clamp(-32768.0, 32767.0) as i16
        })
        .collect()
}

/// Utility function to convert i16 samples back to f32
pub fn i16_to_f32_samples(input: &[i16]) -> Vec<f32> {
    input.iter()
        .map(|&sample| sample as f32 / 32767.0)
        .collect()
}

/// Audio format definitions for WebRTC compatibility
#[derive(Debug, Clone)]
pub struct AudioFormat {
    pub sample_rate: u32,
    pub channels: u16,
    pub sample_format: AudioSampleFormat,
}

#[derive(Debug, Clone)]
pub enum AudioSampleFormat {
    F32,
    I16,
    I32,
}

impl AudioFormat {
    /// Standard WebRTC audio format (Opus codec preference)
    pub fn webrtc_standard() -> Self {
        Self {
            sample_rate: 48000,
            channels: 2,
            sample_format: AudioSampleFormat::F32,
        }
    }

    /// Lower quality format for bandwidth-constrained scenarios
    pub fn webrtc_low_quality() -> Self {
        Self {
            sample_rate: 16000,
            channels: 1,
            sample_format: AudioSampleFormat::I16,
        }
    }

    /// High quality format for optimal audio
    pub fn webrtc_high_quality() -> Self {
        Self {
            sample_rate: 48000,
            channels: 2,
            sample_format: AudioSampleFormat::F32,
        }
    }
}

/// Audio chunk for WebRTC transmission
#[derive(Debug, Clone)]
pub struct AudioChunk {
    pub data: Vec<f32>,
    pub sample_rate: u32,
    pub channels: u16,
    pub timestamp: std::time::Instant,
}

impl AudioChunk {
    pub fn new(data: Vec<f32>, sample_rate: u32, channels: u16) -> Self {
        Self {
            data,
            sample_rate,
            channels,
            timestamp: std::time::Instant::now(),
        }
    }

    /// Get duration of this audio chunk in milliseconds
    pub fn duration_ms(&self) -> u64 {
        let samples_per_channel = self.data.len() / self.channels as usize;
        let duration_seconds = samples_per_channel as f64 / self.sample_rate as f64;
        (duration_seconds * 1000.0) as u64
    }

    /// Convert to bytes for network transmission
    pub fn to_bytes(&self) -> Vec<u8> {
        let i16_samples = f32_to_i16_samples(&self.data);
        let mut bytes = Vec::with_capacity(i16_samples.len() * 2);
        
        for sample in i16_samples {
            bytes.extend_from_slice(&sample.to_le_bytes());
        }
        
        bytes
    }

    /// Create from bytes received over network
    pub fn from_bytes(bytes: &[u8], sample_rate: u32, channels: u16) -> Result<Self> {
        if bytes.len() % 2 != 0 {
            return Err(anyhow::anyhow!("Invalid audio data length"));
        }

        let mut i16_samples = Vec::with_capacity(bytes.len() / 2);
        
        for chunk in bytes.chunks_exact(2) {
            let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
            i16_samples.push(sample);
        }

        let f32_samples = i16_to_f32_samples(&i16_samples);
        
        Ok(Self::new(f32_samples, sample_rate, channels))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_converter_mono_to_stereo() {
        let converter = AudioConverter::new(44100, 44100, 1, 2);
        let input = vec![0.5, 0.3, 0.1];
        let output = converter.convert_channels(&input);
        
        assert_eq!(output, vec![0.5, 0.5, 0.3, 0.3, 0.1, 0.1]);
    }

    #[test]
    fn test_audio_converter_stereo_to_mono() {
        let converter = AudioConverter::new(44100, 44100, 2, 1);
        let input = vec![0.4, 0.6, 0.2, 0.8];
        let output = converter.convert_channels(&input);
        
        assert_eq!(output, vec![0.5, 0.5]); // Averages: (0.4+0.6)/2, (0.2+0.8)/2
    }

    #[test]
    fn test_sample_format_conversion() {
        let f32_samples = vec![0.5, -0.5, 1.0, -1.0];
        let i16_samples = f32_to_i16_samples(&f32_samples);
        let converted_back = i16_to_f32_samples(&i16_samples);
        
        // Should be approximately equal (within floating point precision)
        for (original, converted) in f32_samples.iter().zip(converted_back.iter()) {
            assert!((original - converted).abs() < 0.01);
        }
    }

    #[test]
    fn test_audio_chunk_duration() {
        let sample_rate = 48000;
        let channels = 2;
        let samples_per_channel = 480; // 10ms worth of samples
        let data = vec![0.0; samples_per_channel * channels as usize];
        
        let chunk = AudioChunk::new(data, sample_rate, channels);
        assert_eq!(chunk.duration_ms(), 10);
    }

    #[test]
    fn test_audio_chunk_serialization() {
        let original_data = vec![0.5, -0.3, 0.8, -0.1];
        let chunk = AudioChunk::new(original_data.clone(), 48000, 2);
        
        let bytes = chunk.to_bytes();
        let restored_chunk = AudioChunk::from_bytes(&bytes, 48000, 2).unwrap();
        
        // Check that data is approximately preserved
        assert_eq!(chunk.data.len(), restored_chunk.data.len());
        for (orig, restored) in chunk.data.iter().zip(restored_chunk.data.iter()) {
            assert!((orig - restored).abs() < 0.01);
        }
    }
}
