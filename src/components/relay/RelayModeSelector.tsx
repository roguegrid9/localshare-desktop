// Relay Mode Selector Component
import { useState } from 'react';
import { updateGridRelayMode, relayModeToString, getRelayModeDescription, type RelayMode } from '../../utils/gridRelay';
import { Wifi, Shield, Zap } from 'lucide-react';

interface RelayModeSelectorProps {
  gridId: string;
  currentMode: RelayMode;
  onModeChanged?: (mode: RelayMode) => void;
  className?: string;
}

const RELAY_MODES: { mode: RelayMode; icon: React.ReactNode }[] = [
  { mode: 'p2p_first', icon: <Zap className="w-5 h-5" /> },
  { mode: 'relay_only', icon: <Shield className="w-5 h-5" /> },
  { mode: 'p2p_only', icon: <Wifi className="w-5 h-5" /> },
];

export function RelayModeSelector({ gridId, currentMode, onModeChanged, className = '' }: RelayModeSelectorProps) {
  const [selectedMode, setSelectedMode] = useState<RelayMode>(currentMode);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleModeChange = async (mode: RelayMode) => {
    if (mode === selectedMode || isUpdating) return;

    setIsUpdating(true);
    setError(null);

    try {
      await updateGridRelayMode(gridId, mode);
      setSelectedMode(mode);

      if (onModeChanged) {
        onModeChanged(mode);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update relay mode');
      console.error('Failed to update relay mode:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className={`bg-gray-800 rounded-lg border border-gray-700 p-4 ${className}`}>
      <div className="mb-3">
        <h3 className="text-sm font-medium text-gray-200">Connection Mode</h3>
        <p className="text-xs text-gray-400 mt-1">
          Choose how this grid connects to other peers
        </p>
      </div>

      {/* Mode selector buttons */}
      <div className="space-y-2">
        {RELAY_MODES.map(({ mode, icon }) => {
          const isSelected = selectedMode === mode;
          const isDisabled = isUpdating;

          return (
            <button
              key={mode}
              onClick={() => handleModeChange(mode)}
              disabled={isDisabled}
              className={`
                w-full p-3 rounded-lg border transition-all text-left
                ${isSelected
                  ? 'bg-blue-900/30 border-blue-500/50 text-blue-400'
                  : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
                }
                ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <div className="flex items-start gap-3">
                <div className={isSelected ? 'text-blue-400' : 'text-gray-500'}>
                  {icon}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">
                    {relayModeToString(mode)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {getRelayModeDescription(mode)}
                  </div>
                </div>
                {isSelected && (
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-blue-500 rounded-full" />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-3 p-2 bg-red-900/20 border border-red-500/30 rounded text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Current mode indicator */}
      <div className="mt-3 text-xs text-gray-500 text-center">
        {isUpdating ? 'Updating...' : `Active: ${relayModeToString(selectedMode)}`}
      </div>
    </div>
  );
}
