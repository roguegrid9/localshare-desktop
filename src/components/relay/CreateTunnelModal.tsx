import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Spinner } from '../ui/spinner';

interface SubdomainAvailability {
  subdomain: string;
  available: boolean;
  reason?: string;
  full_domain?: string;
}

interface CreateTunnelModalProps {
  token: string;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateTunnelModal({ token, onClose, onCreated }: CreateTunnelModalProps) {
  const [subdomain, setSubdomain] = useState('');
  const [localPort, setLocalPort] = useState(3000);
  const [protocol, setProtocol] = useState('https');
  const [checking, setChecking] = useState(false);
  const [availability, setAvailability] = useState<SubdomainAvailability | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced subdomain check
  useEffect(() => {
    if (subdomain.length < 3) {
      setAvailability(null);
      return;
    }

    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        const result = await invoke<SubdomainAvailability>('check_subdomain_command', {
          subdomain: subdomain.toLowerCase(),
        });
        setAvailability(result);
      } catch (err) {
        console.error('Failed to check subdomain:', err);
      } finally {
        setChecking(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [subdomain]);

  const handleCreate = async () => {
    if (!availability?.available) return;

    setCreating(true);
    setError(null);

    try {
      await invoke('create_tunnel_command', {
        token,
        subdomain: subdomain.toLowerCase(),
        localPort,
        protocol,
      });

      onCreated();
      onClose();
    } catch (err) {
      setError(err as string);
    } finally {
      setCreating(false);
    }
  };

  const handleSubdomainChange = (value: string) => {
    // Only allow lowercase alphanumeric and hyphens
    const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSubdomain(cleaned);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg shadow-xl w-full max-w-lg">
        <div className="border-b border-gray-700 p-6 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-white">Create Public Tunnel</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Subdomain Input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Subdomain
            </label>
            <div className="flex items-center gap-2 bg-gray-800 rounded-lg border border-gray-700 focus-within:border-blue-500 transition-colors">
              <input
                type="text"
                value={subdomain}
                onChange={(e) => handleSubdomainChange(e.target.value)}
                placeholder="myapp"
                minLength={3}
                maxLength={32}
                className="flex-1 bg-transparent px-4 py-2.5 text-white placeholder-gray-500 outline-none"
              />
              <span className="px-4 py-2.5 text-gray-400 bg-gray-700/50 border-l border-gray-700">
                .roguegrid9.com
              </span>
            </div>

            {/* Availability Status */}
            {checking && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Spinner className="w-4 h-4" />
                <span>Checking availability...</span>
              </div>
            )}
            {availability && !checking && (
              <div className={`flex items-center gap-2 text-sm ${availability.available ? 'text-green-400' : 'text-red-400'}`}>
                {availability.available ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Available: {availability.full_domain}</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    <span>{availability.reason}</span>
                  </>
                )}
              </div>
            )}

            <p className="text-xs text-gray-500">
              3-32 characters, lowercase letters, numbers, and hyphens only
            </p>
          </div>

          {/* Local Port */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Local Port
            </label>
            <input
              type="number"
              value={localPort}
              onChange={(e) => setLocalPort(parseInt(e.target.value) || 0)}
              min={1}
              max={65535}
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <p className="text-xs text-gray-500">
              The port your local application is running on
            </p>
          </div>

          {/* Protocol */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Protocol
            </label>
            <select
              value={protocol}
              onChange={(e) => setProtocol(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500 transition-colors"
            >
              <option value="https">HTTPS</option>
              <option value="http">HTTP</option>
              <option value="tcp">TCP</option>
            </select>
          </div>

          {/* Preview */}
          {availability?.available && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
              <p className="text-sm text-gray-300 mb-2">
                <strong className="text-white">Your tunnel will be:</strong>
              </p>
              <p className="text-blue-400 font-mono text-sm">
                {protocol}://{availability.full_domain} → localhost:{localPort}
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-gray-700 p-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={creating}
            className="px-4 py-2 text-gray-300 hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!availability?.available || creating}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            {creating && <Spinner className="w-4 h-4" />}
            {creating ? 'Creating...' : 'Create Tunnel'}
          </button>
        </div>
      </div>
    </div>
  );
}
