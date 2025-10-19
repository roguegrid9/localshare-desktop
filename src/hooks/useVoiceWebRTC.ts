// src/hooks/useVoiceWebRTC.ts - Browser WebRTC for voice channels
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { toast } from '../components/ui/sonner';

interface VoicePeerConnection {
  userId: string;
  username?: string;
  connection: RTCPeerConnection;
  audioElement?: HTMLAudioElement;
}

interface UseVoiceWebRTCProps {
  channelId: string | null;
  gridId: string | null;
  localAudioStream: MediaStream | null;
}

interface VoiceWebRTCSignalPayload {
  channel_id: string;
  grid_id: string;
  to_user_id: string;
  signal_data: {
    type: string;
    sdp?: string;
    candidate?: any;
  };
}

export function useVoiceWebRTC({ channelId, gridId, localAudioStream }: UseVoiceWebRTCProps) {
  const [peerConnections, setPeerConnections] = useState<Map<string, VoicePeerConnection>>(new Map());
  const [remoteParticipants, setRemoteParticipants] = useState<string[]>([]);

  // Send WebRTC signal via Tauri command
  const sendSignal = useCallback(async (toUserId: string, signalData: any) => {
    if (!channelId || !gridId) return;

    try {
      await invoke('send_voice_webrtc_signal', {
        channelId,
        gridId,
        toUserId,
        signalData
      });
    } catch (error) {
      console.error('Failed to send WebRTC signal:', error);
    }
  }, [channelId, gridId]);

  const peerConnectionsRef = useRef<Map<string, VoicePeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);

  // Update ref when state changes
  useEffect(() => {
    peerConnectionsRef.current = peerConnections;
  }, [peerConnections]);

  useEffect(() => {
    localStreamRef.current = localAudioStream;
  }, [localAudioStream]);

  // Create peer connection for a participant
  const createPeerConnection = useCallback(async (participantId: string, username?: string): Promise<RTCPeerConnection> => {
    console.log(`Creating peer connection for ${participantId} (${username || 'unknown'})`);

    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    const pc = new RTCPeerConnection(configuration);

    // Add local audio track if available
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        console.log(`Adding local track to peer connection for ${participantId}`);
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`Sending ICE candidate to ${participantId}`);
        sendSignal(participantId, {
          type: 'ice-candidate',
          candidate: event.candidate.toJSON()
        });
      }
    };

    // Handle remote tracks
    pc.ontrack = (event) => {
      console.log(`Received remote track from ${participantId}:`, event.track.kind);

      if (event.track.kind === 'audio') {
        // Create audio element for this participant
        const audioElement = new Audio();
        audioElement.srcObject = event.streams[0];
        audioElement.autoplay = true;
        audioElement.play().catch(err => {
          console.error(`Failed to play audio from ${participantId}:`, err);
        });

        // Update peer connection with audio element
        setPeerConnections(prev => {
          const newMap = new Map(prev);
          const existing = newMap.get(participantId);
          if (existing) {
            existing.audioElement = audioElement;
            newMap.set(participantId, existing);
          }
          return newMap;
        });
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`Peer connection to ${participantId} state: ${pc.connectionState}`);

      if (pc.connectionState === 'connected') {
        toast.success(`Connected to ${username || participantId}`);
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        toast(`Disconnected from ${username || participantId}`);
      }
    };

    return pc;
  }, [sendSignal, toast]);

  // Connect to a participant (create offer)
  const connectToParticipant = useCallback(async (participantId: string, username?: string) => {
    if (!channelId || !gridId) {
      console.error('Cannot connect: missing channelId or gridId');
      return;
    }

    if (peerConnectionsRef.current.has(participantId)) {
      console.log(`Already connected to ${participantId}`);
      return;
    }

    try {
      console.log(`Initiating connection to ${participantId}`);

      const pc = await createPeerConnection(participantId, username);

      // Store peer connection
      const voicePeer: VoicePeerConnection = {
        userId: participantId,
        username,
        connection: pc
      };

      setPeerConnections(prev => new Map(prev).set(participantId, voicePeer));

      // Create and send offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });

      await pc.setLocalDescription(offer);

      console.log(`Sending offer to ${participantId}`);
      sendSignal(participantId, {
        type: 'offer',
        sdp: offer.sdp
      });

    } catch (error) {
      console.error(`Failed to connect to ${participantId}:`, error);
      toast.error(`Failed to connect to ${username || participantId}`);
    }
  }, [channelId, gridId, createPeerConnection, sendSignal, toast]);

  // Handle incoming WebRTC signals via Tauri WebSocket events
  useEffect(() => {
    if (!channelId || !gridId) return;

    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen<VoiceWebRTCSignalPayload>('websocket_message', (event) => {
        const message: any = event.payload;

        // Only handle voice WebRTC signals for our channel
        if (message.type !== 'voice_webrtc_signal') return;
        if (message.payload?.channel_id !== channelId) return;

        const handleSignal = async () => {
          const payload = message.payload;
          const { signal_data, to_user_id: fromUserId } = payload;

          console.log(`Received voice WebRTC signal from ${fromUserId}:`, signal_data.type);

      try {
        // Get or create peer connection
        let voicePeer = peerConnectionsRef.current.get(fromUserId);

        if (!voicePeer && (signal_data.type === 'offer' || signal_data.type === 'ice-candidate')) {
          console.log(`Creating peer connection for incoming signal from ${fromUserId}`);
          const pc = await createPeerConnection(fromUserId);
          voicePeer = {
            userId: fromUserId,
            connection: pc
          };
          setPeerConnections(prev => new Map(prev).set(fromUserId, voicePeer!));
        }

        if (!voicePeer) {
          console.warn(`No peer connection for ${fromUserId}`);
          return;
        }

        const pc = voicePeer.connection;

        // Handle different signal types
        if (signal_data.type === 'offer') {
          console.log(`Processing offer from ${fromUserId}`);

          await pc.setRemoteDescription(new RTCSessionDescription({
            type: 'offer',
            sdp: signal_data.sdp
          }));

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          console.log(`Sending answer to ${fromUserId}`);
          sendSignal(fromUserId, {
            type: 'answer',
            sdp: answer.sdp
          });

        } else if (signal_data.type === 'answer') {
          console.log(`Processing answer from ${fromUserId}`);

          await pc.setRemoteDescription(new RTCSessionDescription({
            type: 'answer',
            sdp: signal_data.sdp
          }));

        } else if (signal_data.type === 'ice-candidate') {
          console.log(`Processing ICE candidate from ${fromUserId}`);

          await pc.addIceCandidate(new RTCIceCandidate(signal_data.candidate));
        }

        } catch (error) {
          console.error(`Failed to handle signal from ${fromUserId}:`, error);
        }
      };

        handleSignal();
      });

      console.log('Listening for voice WebRTC signals');
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [channelId, gridId, createPeerConnection, sendSignal]);

  // Add local audio track to all existing connections when it becomes available
  useEffect(() => {
    if (!localAudioStream) return;

    console.log('Adding local audio stream to all peer connections');

    peerConnections.forEach((voicePeer, participantId) => {
      const pc = voicePeer.connection;

      // Remove old tracks
      pc.getSenders().forEach(sender => {
        if (sender.track) {
          pc.removeTrack(sender);
        }
      });

      // Add new tracks
      localAudioStream.getTracks().forEach(track => {
        console.log(`Adding track to connection with ${participantId}`);
        pc.addTrack(track, localAudioStream);
      });
    });
  }, [localAudioStream, peerConnections]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      peerConnectionsRef.current.forEach((voicePeer) => {
        voicePeer.connection.close();
        if (voicePeer.audioElement) {
          voicePeer.audioElement.pause();
          voicePeer.audioElement.srcObject = null;
        }
      });
      peerConnectionsRef.current.clear();
    };
  }, []);

  // Memoize the array conversion to prevent infinite loops
  const peerConnectionsArray = useMemo(() => {
    return Array.from(peerConnections.values());
  }, [peerConnections]);

  return {
    peerConnections: peerConnectionsArray,
    connectToParticipant,
    remoteParticipants
  };
}
