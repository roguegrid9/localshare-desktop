import React, { useState, useEffect } from 'react';
import { X, Globe, Lock, Clock, Users, Loader2, Check, AlertCircle } from 'lucide-react';
import {
  createGridShare,
  checkSubdomainAvailability,
  addProcessToGridShare,
  addChannelToGridShare,
  type CreateGridShareRequest,
} from '../../api/coordinator';
import { invoke } from '@tauri-apps/api/core';

interface GridShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  gridId: string;
  gridName: string;
  processes: Array<{ id: string; name: string; port?: number }>;
  channels: Array<{ id: string; name: string; type: string }>;
  onShareCreated: () => void;
}

export function GridShareDialog({
  isOpen,
  onClose,
  gridId,
  gridName,
  processes,
  channels,
  onShareCreated
}: GridShareDialogProps) {
  const [subdomain, setSubdomain] = useState('');
  const [displayName, setDisplayName] = useState(gridName || '');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [maxVisitors, setMaxVisitors] = useState(50);
  const [expiresInHours, setExpiresInHours] = useState(720); // 30 days
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [subdomainAvailable, setSubdomainAvailable] = useState<boolean | null>(null);
  const [checkingSubdomain, setCheckingSubdomain] = useState(false);

  // Process/channel selection
  const [selectedProcesses, setSelectedProcesses] = useState<Set<string>>(new Set());
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());

  const handleSubdomainChange = async (value: string) => {
    const normalized = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSubdomain(normalized);
    setSubdomainAvailable(null);

    if (normalized.length >= 3) {
      setCheckingSubdomain(true);
      try {
        const result = await checkSubdomainAvailability(normalized);
        setSubdomainAvailable(result.available);
        if (!result.available && result.reason) {
          setError(result.reason);
        } else {
          setError('');
        }
      } catch (err) {
        console.error('Failed to check subdomain:', err);
        setError('Unable to check subdomain availability. Please try again.');
      } finally {
        setCheckingSubdomain(false);
      }
    }
  };

  const toggleProcess = (processId: string) => {
    const newSet = new Set(selectedProcesses);
    if (newSet.has(processId)) {
      newSet.delete(processId);
    } else {
      newSet.add(processId);
    }
    setSelectedProcesses(newSet);
  };

  const toggleChannel = (channelId: string) => {
    const newSet = new Set(selectedChannels);
    if (newSet.has(channelId)) {
      newSet.delete(channelId);
    } else {
      newSet.add(channelId);
    }
    setSelectedChannels(newSet);
  };

  const handleCreate = async () => {
    if (!subdomain || subdomain.length < 3) {
      setError('Subdomain must be at least 3 characters');
      return;
    }

    if (subdomainAvailable === false) {
      setError('This subdomain is not available');
      return;
    }

    if (requiresPassword && !password) {
      setError('Please enter a password');
      return;
    }

    if (selectedProcesses.size === 0 && selectedChannels.size === 0) {
      setError('Please select at least one process or channel to share');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      // Get auth token from Tauri
      const token = await invoke<string>('get_auth_token');

      if (!token) {
        throw new Error('Not authenticated');
      }

      // Create grid share
      const shareRequest: CreateGridShareRequest = {
        grid_id: gridId,
        subdomain,
        display_name: displayName || undefined,
        description: description || undefined,
        is_public: isPublic,
        requires_password: requiresPassword,
        password: requiresPassword ? password : undefined,
        max_concurrent_visitors: maxVisitors,
        expires_in_hours: expiresInHours > 0 ? expiresInHours : undefined,
      };

      const gridShare = await createGridShare(token, shareRequest);

      // Add selected processes
      for (const processId of selectedProcesses) {
        const process = processes.find(p => p.id === processId);
        if (process) {
          await addProcessToGridShare(token, gridShare.id, {
            process_id: processId,
            exposed_port: process.port || 8000,
          });

          // Start tunnel for this process
          try {
            await invoke('start_tunnel', {
              gridShareId: gridShare.id,
              processId: processId,
              localPort: process.port || 8000,
            });
          } catch (tunnelErr) {
            console.error(`Failed to start tunnel for process ${processId}:`, tunnelErr);
            // Continue even if tunnel fails
          }
        }
      }

      // Add selected channels
      for (const channelId of selectedChannels) {
        await addChannelToGridShare(token, gridShare.id, {
          channel_id: channelId,
        });
      }

      onShareCreated();
      onClose();
    } catch (err: any) {
      console.error('Failed to create grid share:', err);
      setError(err.message || 'Failed to create grid share');
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#0B0D10] border border-white/10 rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">
            Share Grid: {gridName}
          </h2>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-6">
          {/* Subdomain */}
          <div>
            <label className="block text-white/80 text-sm font-medium mb-2">
              Subdomain *
            </label>
            <div className="relative">
              <input
                type="text"
                value={subdomain}
                onChange={(e) => handleSubdomainChange(e.target.value)}
                placeholder="my-grid"
                className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-white pr-32"
                maxLength={63}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">
                .roguegrid9.com
              </span>
            </div>
            {checkingSubdomain && (
              <div className="flex items-center gap-2 mt-2 text-sm text-white/60">
                <Loader2 className="w-3 h-3 animate-spin" />
                Checking availability...
              </div>
            )}
            {!checkingSubdomain && subdomainAvailable === true && (
              <div className="flex items-center gap-2 mt-2 text-sm text-green-400">
                <Check className="w-3 h-3" />
                Available!
              </div>
            )}
            {!checkingSubdomain && subdomainAvailable === false && (
              <div className="flex items-center gap-2 mt-2 text-sm text-red-400">
                <AlertCircle className="w-3 h-3" />
                Not available
              </div>
            )}
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-white/80 text-sm font-medium mb-2">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="My Development Grid"
              className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-white"
              maxLength={100}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-white/80 text-sm font-medium mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this grid for?"
              className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-white h-20 resize-none"
              maxLength={500}
            />
          </div>

          {/* Select Processes */}
          <div>
            <label className="block text-white/80 text-sm font-medium mb-2">
              Processes to Share
            </label>
            <div className="space-y-2 max-h-40 overflow-y-auto bg-black/20 rounded p-2">
              {processes.length === 0 ? (
                <p className="text-white/40 text-sm">No processes available</p>
              ) : (
                processes.map((process) => (
                  <label
                    key={process.id}
                    className="flex items-center gap-2 cursor-pointer hover:bg-white/5 p-2 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={selectedProcesses.has(process.id)}
                      onChange={() => toggleProcess(process.id)}
                      className="w-4 h-4"
                    />
                    <span className="text-white/80 text-sm">{process.name}</span>
                    {process.port && (
                      <span className="text-white/40 text-xs">:{process.port}</span>
                    )}
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Select Channels */}
          <div>
            <label className="block text-white/80 text-sm font-medium mb-2">
              Channels to Share
            </label>
            <div className="space-y-2 max-h-40 overflow-y-auto bg-black/20 rounded p-2">
              {channels.length === 0 ? (
                <p className="text-white/40 text-sm">No channels available</p>
              ) : (
                channels.map((channel) => (
                  <label
                    key={channel.id}
                    className="flex items-center gap-2 cursor-pointer hover:bg-white/5 p-2 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={selectedChannels.has(channel.id)}
                      onChange={() => toggleChannel(channel.id)}
                      className="w-4 h-4"
                    />
                    <span className="text-white/80 text-sm">{channel.name}</span>
                    <span className="text-white/40 text-xs">({channel.type})</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Settings */}
          <div className="space-y-4 pt-4 border-t border-white/10">
            {/* Public/Private */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="w-4 h-4"
                />
                <Globe className="w-4 h-4 text-white/60" />
                <span className="text-white/80">Public (anyone with link can access)</span>
              </label>
            </div>

            {/* Password Protection */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={requiresPassword}
                  onChange={(e) => setRequiresPassword(e.target.checked)}
                  className="w-4 h-4"
                />
                <Lock className="w-4 h-4 text-white/60" />
                <span className="text-white/80">Require password</span>
              </label>
              {requiresPassword && (
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-white"
                />
              )}
            </div>

            {/* Max Visitors */}
            <div>
              <label className="block text-white/80 text-sm font-medium mb-2 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Max Concurrent Visitors
              </label>
              <input
                type="number"
                value={maxVisitors}
                onChange={(e) => setMaxVisitors(parseInt(e.target.value) || 50)}
                min={1}
                max={200}
                className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-white"
              />
            </div>

            {/* Expiration */}
            <div>
              <label className="block text-white/80 text-sm font-medium mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Expires In
              </label>
              <select
                value={expiresInHours}
                onChange={(e) => setExpiresInHours(parseInt(e.target.value))}
                className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-white"
              >
                <option value={24}>24 hours</option>
                <option value={168}>7 days</option>
                <option value={720}>30 days</option>
                <option value={0}>Never</option>
              </select>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded p-3 text-red-300 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={handleCreate}
              disabled={isCreating || !subdomain || subdomainAvailable === false}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white px-4 py-2 rounded font-medium flex items-center justify-center gap-2"
            >
              {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
              {isCreating ? 'Creating...' : 'Create Share'}
            </button>
            <button
              onClick={onClose}
              disabled={isCreating}
              className="px-4 py-2 border border-white/10 rounded text-white/80 hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
