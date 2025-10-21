import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AlertCircle } from 'lucide-react';
import { Spinner } from '../ui/spinner';

interface CreateTunnelModalProps {
  token: string;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateTunnelModal({ token, onClose, onCreated }: CreateTunnelModalProps) {
  const [localPort, setLocalPort] = useState(3000);
  const [protocol, setProtocol] = useState('https');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);

    try {
      await invoke('create_tunnel_command', {
        token,
        subdomain: '', // Empty = auto-generate
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

          {/* Ephemeral Warning */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-200">
              <p className="font-medium mb-1">⚡ Temporary Tunnel</p>
              <p className="text-amber-300/80">
                Your tunnel will get a fun auto-generated name (like <span className="font-mono">purple-dragon-7824</span>).
                It will stop working when you close the app.
              </p>
            </div>
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
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <p className="text-sm text-gray-300 mb-2">
              <strong className="text-white">Your tunnel will be:</strong>
            </p>
            <p className="text-blue-400 font-mono text-sm">
              {protocol}://<span className="text-purple-400">[auto-generated]</span>.localshare.tech → localhost:{localPort}
            </p>
          </div>
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
            disabled={creating}
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
