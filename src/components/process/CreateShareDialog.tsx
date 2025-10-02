import React, { useState } from 'react';
import { X, Globe, Lock, Clock, Users, Loader2, Check } from 'lucide-react';
import {
  createProcessShare,
  checkSubdomainAvailability,
  type CreateProcessShareRequest
} from '../../api/coordinator';

interface CreateShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  processId: string;
  gridId: string;
  processName: string;
  onShareCreated: () => void;
}

export function CreateShareDialog({
  isOpen,
  onClose,
  processId,
  gridId,
  processName,
  onShareCreated
}: CreateShareDialogProps) {
  const [subdomain, setSubdomain] = useState('');
  const [customName, setCustomName] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [maxUsers, setMaxUsers] = useState(10);
  const [expiresInHours, setExpiresInHours] = useState(720); // 30 days
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [subdomainAvailable, setSubdomainAvailable] = useState<boolean | null>(null);
  const [checkingSubdomain, setCheckingSubdomain] = useState(false);

  const handleSubdomainChange = async (value: string) => {
    const normalized = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSubdomain(normalized);
    setSubdomainAvailable(null);

    if (normalized.length >= 3) {
      setCheckingSubdomain(true);
      try {
        console.log('🔍 Checking subdomain availability for:', normalized);
        const result = await checkSubdomainAvailability(normalized);
        console.log('✅ Subdomain check result:', result);
        setSubdomainAvailable(result.available);
        if (!result.available && result.reason) {
          setError(result.reason);
        } else {
          setError('');
        }
      } catch (err) {
        console.error('❌ Failed to check subdomain:', err);
        // Show a user-friendly error
        setError('Unable to check subdomain availability. Please try again.');
      } finally {
        setCheckingSubdomain(false);
      }
    }
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

    setIsCreating(true);
    setError('');

    try {
      // Get RogueGrid JWT token from Tauri storage
      const token = await window.__TAURI__.core.invoke('get_auth_token');

      if (!token) {
        throw new Error('Not authenticated');
      }

      const request: CreateProcessShareRequest = {
        subdomain,
        customName: customName || undefined,
        isPublic,
        requiresPassword,
        password: requiresPassword ? password : undefined,
        maxConcurrentUsers: maxUsers,
        expiresInHours
      };

      const share = await createProcessShare(token, gridId, processId, request);

      // Register the share with Tauri
      await window.__TAURI__.core.invoke('register_process_share', {
        shareId: share.id,
        processId: share.process_id,
        port: 8000, // You may want to pass this from props
        subdomain: share.subdomain,
        customName: share.custom_name
      });

      onShareCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create share');
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#0B0D10] border border-white/10 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">
            Share Process: {processName}
          </h2>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4">
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
                placeholder="my-app"
                className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-white pr-20"
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
              <div className="text-sm text-red-400 mt-2">
                Not available
              </div>
            )}
          </div>

          {/* Custom Name */}
          <div>
            <label className="block text-white/80 text-sm font-medium mb-2">
              Display Name (Optional)
            </label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="My Awesome Server"
              className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-white"
              maxLength={100}
            />
          </div>

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

          {/* Max Users */}
          <div>
            <label className="block text-white/80 text-sm font-medium mb-2 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Max Concurrent Visitors
            </label>
            <input
              type="number"
              value={maxUsers}
              onChange={(e) => setMaxUsers(parseInt(e.target.value) || 10)}
              min={1}
              max={100}
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

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded p-3 text-red-300 text-sm">
              {error}
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
