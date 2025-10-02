import React, { useState } from 'react';
import { X, Hash, Volume2, MessageCircle } from 'lucide-react';
import { useChannels } from '../../hooks/useChannels';
import type { CreateChannelRequest, CreateVoiceChannelRequest } from '../../types/messaging';

type ChannelType = 'text' | 'voice';

type CreateChannelModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: (channelData: { name: string; type: ChannelType; description?: string }) => void;
  gridId: string;
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// Fun random name generators (keeping your existing ones)
const randomNameLists = {
  adjectives: [
    'cosmic', 'ninja', 'turbo', 'mega', 'super', 'ultra', 'epic', 'legendary', 'mystical', 'quantum',
    'digital', 'cyber', 'neon', 'retro', 'funky', 'groovy', 'jazzy', 'snappy', 'zippy', 'bouncy',
    'crispy', 'fluffy', 'sparkly', 'shiny', 'glittery', 'fuzzy', 'cozy', 'chill', 'rad', 'wild',
    'chaotic', 'random', 'secret', 'hidden', 'mysterious', 'ancient', 'forbidden', 'enchanted',
    'magical', 'electric', 'atomic', 'stellar', 'galactic', 'infinite', 'supreme', 'ultimate'
  ],
  nouns: [
    'penguins', 'pandas', 'llamas', 'unicorns', 'dragons', 'wizards', 'ninjas', 'pirates', 'robots',
    'cats', 'dogs', 'foxes', 'owls', 'eagles', 'dolphins', 'sharks', 'tigers', 'lions', 'bears',
    'pancakes', 'waffles', 'cookies', 'pizza', 'tacos', 'burgers', 'donuts', 'cake', 'ice-cream',
    'coffee', 'tea', 'soda', 'juice', 'smoothies', 'cocktails', 'bytes', 'pixels', 'code', 'bugs',
    'features', 'scripts', 'functions', 'loops', 'arrays', 'objects', 'variables', 'constants',
    'rockets', 'spaceships', 'satellites', 'planets', 'stars', 'galaxies', 'meteors', 'comets',
    'crystals', 'gems', 'treasures', 'artifacts', 'relics', 'portals', 'dimensions', 'realms'
  ],
  places: [
    'lab', 'cave', 'tower', 'fortress', 'castle', 'palace', 'temple', 'shrine', 'vault', 'bunker',
    'garage', 'attic', 'basement', 'kitchen', 'library', 'study', 'workshop', 'studio', 'arena',
    'dome', 'zone', 'sector', 'district', 'realm', 'dimension', 'world', 'universe', 'galaxy',
    'station', 'base', 'outpost', 'hideout', 'sanctuary', 'refuge', 'haven', 'oasis', 'paradise',
    'corner', 'spot', 'nook', 'cranny', 'space', 'room', 'chamber', 'hall', 'plaza', 'square'
  ]
};

const generateRandomChannelName = (channelType: ChannelType): string => {
  const { adjectives, nouns, places } = randomNameLists;
  
  const getRandomItem = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
  
  const patterns = [
    () => `${getRandomItem(adjectives)}-${getRandomItem(nouns)}`,
    () => `${getRandomItem(nouns)}-${getRandomItem(places)}`,
    () => `${getRandomItem(adjectives)}-${getRandomItem(places)}`,
    () => `the-${getRandomItem(adjectives)}-${getRandomItem(nouns)}`,
    () => `${getRandomItem(nouns)}-and-${getRandomItem(nouns)}`,
    () => `${getRandomItem(adjectives)}-${getRandomItem(adjectives)}-${getRandomItem(nouns)}`,
  ];
  
  // Add type-specific patterns
  if (channelType === 'voice') {
    patterns.push(
      () => `voice-of-${getRandomItem(nouns)}`,
      () => `${getRandomItem(adjectives)}-voices`,
      () => `talk-with-${getRandomItem(nouns)}`
    );
  } else {
    patterns.push(
      () => `chat-about-${getRandomItem(nouns)}`,
      () => `${getRandomItem(adjectives)}-discussions`,
      () => `text-and-${getRandomItem(nouns)}`
    );
  }
  
  const selectedPattern = getRandomItem(patterns);
  return selectedPattern();
};

export default function CreateChannelModal({
  open,
  onClose,
  onSuccess,
  gridId
}: CreateChannelModalProps) {
  const [channelName, setChannelName] = useState('');
  const [channelType, setChannelType] = useState<ChannelType>('text');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Voice channel settings (with defaults)
  const [voiceSettings, setVoiceSettings] = useState({
    defaultQuality: 'medium' as const,
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: true,
    pushToTalkDefault: false,
  });

  const { createTextChannel, createVoiceChannel } = useChannels(gridId);

  const channelTypes = [
    {
      id: 'text' as const,
      name: 'Text',
      description: 'Chat with messages and files',
      icon: Hash,
      color: 'text-blue-400 bg-blue-500/10'
    },
    {
      id: 'voice' as const,
      name: 'Voice',
      description: 'Voice conversations',
      icon: Volume2,
      color: 'text-green-400 bg-green-500/10'
    }
    // Removed video option as requested
  ];

  const validateChannelName = (name: string): string | null => {
    if (!name.trim()) return null; // Allow empty names now
    if (name.length < 2) return 'Channel name must be at least 2 characters';
    if (name.length > 50) return 'Channel name must be less than 50 characters';
    if (!/^[a-zA-Z0-9\s\-_]+$/.test(name)) {
      return 'Channel name can only contain letters, numbers, spaces, hyphens, and underscores';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // If no name provided, generate a random one
    let finalChannelName = channelName.trim();
    if (!finalChannelName) {
      finalChannelName = generateRandomChannelName(channelType);
    }
    
    // Validate the final name (after potential generation)
    const nameError = validateChannelName(finalChannelName);
    if (nameError) {
      setError(nameError);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      let newChannel;
      
      if (channelType === 'voice') {
        // Create voice channel with voice-specific settings
        const voiceRequest: CreateVoiceChannelRequest = {
          name: finalChannelName,
          description: description.trim() || undefined,
          is_private: false,
          max_members: undefined,
          // Voice-specific settings
          default_quality: voiceSettings.defaultQuality,
          noise_suppression: voiceSettings.noiseSuppression,
          echo_cancellation: voiceSettings.echoCancellation,
          auto_gain_control: voiceSettings.autoGainControl,
          push_to_talk_default: voiceSettings.pushToTalkDefault,
          auto_routing_threshold: 8, // Default to 8 participants before routing
          voice_activation_threshold: 0.01, // Default voice activation threshold
          allow_guest_participants: false,
          max_session_duration_minutes: 480, // 8 hours default
          recording_enabled: false,
        };
        
        newChannel = await createVoiceChannel(voiceRequest);
      } else {
        // Create text channel
        const textRequest: CreateChannelRequest = {
          name: finalChannelName,
          description: description.trim() || undefined,
          is_private: false,
          max_members: undefined,
        };
        
        newChannel = await createTextChannel(textRequest);
      }

      console.log('Channel created successfully:', newChannel);
      
      // Call success callback
      onSuccess({
        name: finalChannelName,
        type: channelType,
        description: description.trim() || undefined
      });

      // Reset form
      handleClose();
      
    } catch (err) {
      console.error('Failed to create channel:', err);
      setError(typeof err === 'string' ? err : 'Failed to create channel. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setChannelName('');
      setChannelType('text');
      setDescription('');
      setError(null);
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-md mx-4">
        <div className="rounded-xl border border-white/10 bg-[#111319] p-6 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Create Channel</h2>
                <p className="text-sm text-white/60">Add a new channel to your grid</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              disabled={loading}
              className="rounded-lg p-1 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Channel Type Selection */}
            <div>
              <label className="block text-sm font-medium text-white mb-3">
                Channel Type
              </label>
              <div className="grid grid-cols-1 gap-2">
                {channelTypes.map((type) => {
                  const Icon = type.icon;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setChannelType(type.id)}
                      className={cx(
                        "flex items-center gap-3 p-3 rounded-lg border transition-all text-left",
                        channelType === type.id
                          ? "border-[#FF8A00] bg-[#FF8A00]/10"
                          : "border-white/10 bg-white/5 hover:bg-white/10"
                      )}
                    >
                      <div className={cx(
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        type.color
                      )}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{type.name}</div>
                        <div className="text-xs text-white/60">{type.description}</div>
                      </div>
                      {channelType === type.id && (
                        <div className="w-2 h-2 rounded-full bg-[#FF8A00]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Voice Settings (only shown for voice channels) */}
            {channelType === 'voice' && (
              <div className="bg-white/5 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-medium text-white">Voice Settings</h3>
                
                <div className="space-y-3">
                  <label className="flex items-center justify-between">
                    <span className="text-sm text-white/80">Noise Suppression</span>
                    <input
                      type="checkbox"
                      checked={voiceSettings.noiseSuppression}
                      onChange={(e) => setVoiceSettings(prev => ({ ...prev, noiseSuppression: e.target.checked }))}
                      className="rounded"
                    />
                  </label>
                  
                  <label className="flex items-center justify-between">
                    <span className="text-sm text-white/80">Echo Cancellation</span>
                    <input
                      type="checkbox"
                      checked={voiceSettings.echoCancellation}
                      onChange={(e) => setVoiceSettings(prev => ({ ...prev, echoCancellation: e.target.checked }))}
                      className="rounded"
                    />
                  </label>
                  
                  <label className="flex items-center justify-between">
                    <span className="text-sm text-white/80">Auto Gain Control</span>
                    <input
                      type="checkbox"
                      checked={voiceSettings.autoGainControl}
                      onChange={(e) => setVoiceSettings(prev => ({ ...prev, autoGainControl: e.target.checked }))}
                      className="rounded"
                    />
                  </label>

                  <div>
                    <label className="block text-sm text-white/80 mb-2">Default Quality</label>
                    <select
                      value={voiceSettings.defaultQuality}
                      onChange={(e) => setVoiceSettings(prev => ({ ...prev, defaultQuality: e.target.value as 'low' | 'medium' | 'high' }))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white"
                    >
                      <option value="low">Low (16kHz)</option>
                      <option value="medium">Medium (44kHz)</option>
                      <option value="high">High (48kHz)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Channel Name */}
            <div>
              <label htmlFor="channelName" className="block text-sm font-medium text-white mb-2">
                Channel Name
              </label>
              <input
                id="channelName"
                type="text"
                value={channelName}
                onChange={(e) => {
                  setChannelName(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Leave empty for random name, or enter custom name"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 focus:border-[#FF8A00] focus:outline-none focus:ring-1 focus:ring-[#FF8A00]"
                maxLength={50}
                disabled={loading}
                autoFocus
              />
              <div className="flex justify-between mt-1">
                <span className="text-xs text-white/40">
                  {channelName.trim() ? 'Letters, numbers, spaces, hyphens, and underscores only' : 'Will generate a fun random name if left empty'}
                </span>
                <span className="text-xs text-white/40">
                  {channelName.length}/50
                </span>
              </div>
            </div>

            {/* Description (Optional) */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-white mb-2">
                Description <span className="text-white/60 font-normal">(optional)</span>
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's this channel for?"
                rows={3}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 focus:border-[#FF8A00] focus:outline-none focus:ring-1 focus:ring-[#FF8A00] resize-none"
                maxLength={200}
                disabled={loading}
              />
              <div className="flex justify-end mt-1">
                <span className="text-xs text-white/40">
                  {description.length}/200
                </span>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="flex-1 rounded-lg border border-white/20 bg-transparent px-4 py-2 font-medium text-white hover:bg-white/5 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-lg bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] px-4 py-2 font-medium text-white hover:from-[#FF8A00]/90 hover:to-[#FF3D00]/90 disabled:opacity-50 transition-all"
              >
                {loading ? 'Creating...' : `Create ${channelType === 'voice' ? 'Voice' : 'Text'} Channel`}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}