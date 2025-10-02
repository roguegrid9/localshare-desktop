// src/hooks/useChannels.ts - Updated with separated channel commands
import { useState, useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useTauriCommands } from './useTauriCommands';
import type { 
  ChannelInfo,
  CreateChannelRequest,
  CreateVoiceChannelRequest,
  CreateDirectMessageResponse,
  UseChannelsReturn,
} from '../types/messaging';
import {
  sortChannels,
  filterChannelsByType,
  isDirectMessage,
  canAccessChannel
} from '../utils/messaging';

export function useChannels(gridId: string): UseChannelsReturn {
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commands = useTauriCommands();

  // Load channels for the grid
  const loadChannels = useCallback(async () => {
    if (!gridId) return;

    try {
      setLoading(true);
      setError(null);
      
      const channelList = await commands.getGridChannels(gridId);
      setChannels(channelList);
    } catch (err) {
      console.error('Failed to load channels:', err);
      setError(err as string);
    } finally {
      setLoading(false);
    }
  }, [gridId, commands]);

  // Create a text channel using the new separated command
  const createTextChannel = useCallback(async (request: CreateChannelRequest): Promise<ChannelInfo> => {
    try {
      setError(null);
      
      console.log('Creating text channel with request:', request);
      
      // Call the new separated text channel command
      const newChannel = await commands.createTextChannel(gridId, {
        name: request.name,
        description: request.description,
        is_private: request.is_private,
        max_members: request.max_members,
      });
      
      console.log('Text channel created:', newChannel);
      
      // Add to local state
      setChannels(prev => [...prev, newChannel]);
      
      return newChannel;
    } catch (err) {
      console.error('Failed to create text channel:', err);
      setError(err as string);
      throw err;
    }
  }, [gridId, commands]);

  // Create a voice channel using the new separated command
  const createVoiceChannel = useCallback(async (request: CreateVoiceChannelRequest): Promise<ChannelInfo> => {
    try {
      setError(null);
      
      console.log('Creating voice channel with request:', request);
      
      // Call the new separated voice channel command with all voice settings
      const newChannel = await commands.createVoiceChannel(
        gridId,
        request.name,
        request.description,
        request.is_private,
        request.max_members,
        request.auto_routing_threshold,
        request.default_quality,
        request.push_to_talk_default,
        request.noise_suppression,
        request.echo_cancellation,
        request.auto_gain_control,
        request.voice_activation_threshold,
        request.allow_guest_participants,
        request.max_session_duration_minutes,
        request.recording_enabled,
      );
      
      console.log('Voice channel created:', newChannel);
      
      // Add to local state
      setChannels(prev => [...prev, newChannel]);
      
      return newChannel;
    } catch (err) {
      console.error('Failed to create voice channel:', err);
      setError(err as string);
      throw err;
    }
  }, [gridId, commands]);

  // Join a channel
  const joinChannel = useCallback(async (channelId: string): Promise<void> => {
    try {
      setError(null);
      await commands.joinChannel(gridId, channelId);
      
      // Refresh channels to get updated member status
      await loadChannels();
    } catch (err) {
      console.error('Failed to join channel:', err);
      setError(err as string);
      throw err;
    }
  }, [gridId, commands, loadChannels]);

  // Leave a channel
  const leaveChannel = useCallback(async (channelId: string): Promise<void> => {
    try {
      setError(null);
      await commands.leaveChannel(gridId, channelId);
      
      // Remove channel from local state
      setChannels(prev => prev.filter(c => c.id !== channelId));
    } catch (err) {
      console.error('Failed to leave channel:', err);
      setError(err as string);
      throw err;
    }
  }, [gridId, commands]);

  // Create direct message channel
  const createDirectMessage = useCallback(async (targetUserId: string): Promise<CreateDirectMessageResponse> => {
    try {
      setError(null);
      const response = await commands.createDirectMessage(gridId, targetUserId);
      
      // Add channel if it's new
      if (!response.existed_before) {
        setChannels(prev => [...prev, response.channel]);
      }
      
      return response;
    } catch (err) {
      console.error('Failed to create direct message:', err);
      setError(err as string);
      throw err;
    }
  }, [gridId, commands]);

  // Refresh channels
  const refreshChannels = useCallback(async (): Promise<void> => {
    await loadChannels();
  }, [loadChannels]);

  // Listen for channel-related events
  useEffect(() => {
    let unsubscribers: Array<() => void> = [];

    const setupChannelListeners = async () => {
      try {
        // Channel created event
        const unsubChannelCreated = await listen<{ grid_id: string; channel: ChannelInfo }>(
          'channel_created',
          (event) => {
            const { grid_id, channel } = event.payload;
            
            // Only update if it's for the current grid
            if (grid_id === gridId) {
              setChannels(prev => {
                // Avoid duplicates
                if (prev.some(c => c.id === channel.id)) return prev;
                return [...prev, channel];
              });
            }
          }
        );
        unsubscribers.push(unsubChannelCreated);

        // Channel updated event
        const unsubChannelUpdated = await listen<{ grid_id: string; channel: ChannelInfo }>(
          'channel_updated',
          (event) => {
            const { grid_id, channel } = event.payload;
            
            if (grid_id === gridId) {
              setChannels(prev => 
                prev.map(c => c.id === channel.id ? channel : c)
              );
            }
          }
        );
        unsubscribers.push(unsubChannelUpdated);

        // Channel deleted event
        const unsubChannelDeleted = await listen<{ grid_id: string; channel_id: string }>(
          'channel_deleted',
          (event) => {
            const { grid_id, channel_id } = event.payload;
            
            if (grid_id === gridId) {
              setChannels(prev => prev.filter(c => c.id !== channel_id));
            }
          }
        );
        unsubscribers.push(unsubChannelDeleted);

        // User joined/left channel events (to update member counts)
        const unsubUserJoinedChannel = await listen<{ 
          grid_id: string; 
          channel_id: string; 
          user_id: string;
          member_count: number;
        }>(
          'user_joined_channel',
          (event) => {
            const { grid_id, channel_id, member_count } = event.payload;
            
            if (grid_id === gridId) {
              setChannels(prev => 
                prev.map(c => 
                  c.id === channel_id 
                    ? { ...c, member_count }
                    : c
                )
              );
            }
          }
        );
        unsubscribers.push(unsubUserJoinedChannel);

        const unsubUserLeftChannel = await listen<{ 
          grid_id: string; 
          channel_id: string; 
          user_id: string;
          member_count: number;
        }>(
          'user_left_channel',
          (event) => {
            const { grid_id, channel_id, member_count } = event.payload;
            
            if (grid_id === gridId) {
              setChannels(prev => 
                prev.map(c => 
                  c.id === channel_id 
                    ? { ...c, member_count }
                    : c
                )
              );
            }
          }
        );
        unsubscribers.push(unsubUserLeftChannel);

      } catch (error) {
        console.warn('Failed to setup channel event listeners:', error);
      }
    };

    setupChannelListeners();

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [gridId]);

  // Load channels when grid changes
  useEffect(() => {
    if (!gridId) {
      setChannels([]);
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const channelList = await commands.getGridChannels(gridId);
        setChannels(channelList);
      } catch (err) {
        console.error('Failed to load channels:', err);
        setError(err as string);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [gridId]);

  // Utility functions
  const getChannelById = useCallback((channelId: string): ChannelInfo | undefined => {
    return channels.find(c => c.id === channelId);
  }, [channels]);

  const getTextChannels = useCallback((): ChannelInfo[] => {
    return filterChannelsByType(channels, 'text').filter(c => !isDirectMessage(c));
  }, [channels]);

  const getVoiceChannels = useCallback((): ChannelInfo[] => {
    return filterChannelsByType(channels, 'voice');
  }, [channels]);

  const getDirectMessages = useCallback((): ChannelInfo[] => {
    return channels.filter(c => isDirectMessage(c));
  }, [channels]);

  const getSortedChannels = useCallback((): ChannelInfo[] => {
    return sortChannels(channels);
  }, [channels]);

  const getAccessibleChannels = useCallback((): ChannelInfo[] => {
    return channels.filter(c => canAccessChannel(c));
  }, [channels]);

  return {
    // State
    channels,
    loading,
    error,
    
    // Separated channel creation operations
    createTextChannel,
    createVoiceChannel,
    
    // Generic operations
    joinChannel,
    leaveChannel,
    refreshChannels,
    
    // Direct messages
    createDirectMessage,
    
    // Utilities
    getChannelById,
    getTextChannels,
    getVoiceChannels,
    getDirectMessages,
    getSortedChannels,
    getAccessibleChannels
  };
}