// src/hooks/useRustAudioStream.ts - Receives audio from Rust and creates MediaStream
import { useState, useEffect, useRef, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';

interface AudioChunkPayload {
  session_id: string;
  track_id: string;
  samples: number[];
  sample_rate: number;
  channels: number;
  timestamp: number;
}

export function useRustAudioStream(sessionId: string | null) {
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [isActive, setIsActive] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const audioBufferRef = useRef<Float32Array[]>([]);
  const bufferPositionRef = useRef(0);

  // Initialize audio context and create MediaStream from Rust audio
  const initializeAudioStream = useCallback(async () => {
    if (!sessionId || audioContextRef.current) return;

    try {
      console.log('Initializing Rust audio stream for session:', sessionId);

      // Create AudioContext
      const audioContext = new AudioContext({ sampleRate: 48000 });
      audioContextRef.current = audioContext;

      // Create ScriptProcessor to feed audio chunks
      // Buffer size: 4096 samples (~85ms at 48kHz)
      const scriptProcessor = audioContext.createScriptProcessor(4096, 2, 2);
      scriptProcessorRef.current = scriptProcessor;

      // Create destination to get MediaStream
      const destination = audioContext.createMediaStreamDestination();
      destinationRef.current = destination;

      // Connect script processor to destination
      scriptProcessor.connect(destination);

      // Process audio: feed buffered chunks to output
      scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
        const outputBuffer = audioProcessingEvent.outputBuffer;
        const leftChannel = outputBuffer.getChannelData(0);
        const rightChannel = outputBuffer.getChannelData(1);

        // Fill output from our buffer
        for (let i = 0; i < outputBuffer.length; i++) {
          if (audioBufferRef.current.length > 0 && bufferPositionRef.current < audioBufferRef.current[0].length) {
            // We have buffered data
            const chunk = audioBufferRef.current[0];
            leftChannel[i] = chunk[bufferPositionRef.current];
            rightChannel[i] = chunk[bufferPositionRef.current]; // Mono to stereo
            bufferPositionRef.current++;

            // If we've consumed this chunk, remove it
            if (bufferPositionRef.current >= chunk.length) {
              audioBufferRef.current.shift();
              bufferPositionRef.current = 0;
            }
          } else {
            // No data, output silence
            leftChannel[i] = 0;
            rightChannel[i] = 0;
          }
        }
      };

      // Get the MediaStream
      const stream = destination.stream;
      setAudioStream(stream);
      setIsActive(true);

      console.log('Rust audio stream initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Rust audio stream:', error);
    }
  }, [sessionId]);

  // Listen for audio chunks from Rust
  useEffect(() => {
    if (!sessionId) return;

    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      try {
        unlisten = await listen<AudioChunkPayload>('audio_chunk_ready', (event) => {
          const payload = event.payload;

          // Only process chunks for our session
          if (payload.session_id !== sessionId) return;

          // Convert samples array to Float32Array
          const samples = new Float32Array(payload.samples);

          // Add to buffer
          audioBufferRef.current.push(samples);

          // Keep buffer reasonable size (max 100 chunks = ~2 seconds)
          if (audioBufferRef.current.length > 100) {
            console.warn('Audio buffer overflow, dropping old chunks');
            audioBufferRef.current = audioBufferRef.current.slice(-50);
          }
        });

        console.log('Listening for audio chunks from Rust for session:', sessionId);
      } catch (error) {
        console.error('Failed to setup audio chunk listener:', error);
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [sessionId]);

  // Initialize when session ID is available
  useEffect(() => {
    if (sessionId && !audioStream) {
      initializeAudioStream();
    }
  }, [sessionId, audioStream, initializeAudioStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
      }
      if (destinationRef.current) {
        destinationRef.current.disconnect();
        destinationRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      audioBufferRef.current = [];
    };
  }, []);

  return {
    audioStream,
    isActive,
    initializeAudioStream
  };
}
