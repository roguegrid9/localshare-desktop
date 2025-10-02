// Complete Grid Relay Settings Component - Example Usage
import { useState } from 'react';
import { BandwidthDisplay } from './BandwidthDisplay';
import { RelayModeSelector } from './RelayModeSelector';
import { PurchaseBandwidthModal } from './PurchaseBandwidthModal';
import { useBandwidthTracking } from '../../hooks/useBandwidthTracking';
import { Settings } from 'lucide-react';

interface GridRelaySettingsProps {
  gridId: string;
  className?: string;
}

/**
 * Complete relay settings component that combines:
 * - Connection manager with fallback logic
 * - Bandwidth tracking and display
 * - Relay mode selection
 * - Purchase modal
 */
export function GridRelaySettings({ gridId, className = '' }: GridRelaySettingsProps) {
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);

  // Use bandwidth tracking hook
  const tracking = useBandwidthTracking({
    gridId,
    enabled: true,
    autoConnect: false, // Manual connection
    onQuotaWarning: (level) => {
      console.warn(`⚠️ Bandwidth quota at ${level}%`);
      // Could show a toast notification here
    },
    onQuotaExceeded: () => {
      console.error('❌ Bandwidth quota exceeded!');
      setIsPurchaseModalOpen(true); // Auto-open purchase modal
    },
    onConnectionFailed: (error) => {
      console.error('Connection failed:', error);
      // Could show error toast here
    },
  });

  const handlePurchaseSuccess = () => {
    // Refresh bandwidth info after purchase
    tracking.refresh();
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 text-gray-200">
        <Settings className="w-5 h-5" />
        <h2 className="text-lg font-semibold">Relay Settings</h2>
      </div>

      {/* Bandwidth Display */}
      <BandwidthDisplay
        gridId={gridId}
        onPurchaseClick={() => setIsPurchaseModalOpen(true)}
      />

      {/* Connection Controls */}
      <div className="flex gap-2">
        {!tracking.isConnected && !tracking.isConnecting && (
          <button
            onClick={tracking.connect}
            disabled={tracking.needsPurchase}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Connect
          </button>
        )}

        {tracking.isConnected && (
          <button
            onClick={tracking.disconnect}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium transition-colors"
          >
            Disconnect
          </button>
        )}

        {tracking.isConnecting && (
          <div className="px-4 py-2 bg-yellow-600 text-white rounded font-medium">
            Connecting...
          </div>
        )}
      </div>

      {/* Relay Mode Selector */}
      {tracking.relayConfig && (
        <RelayModeSelector
          gridId={gridId}
          currentMode={tracking.relayConfig.relay_mode as any}
          onModeChanged={(mode) => {
            console.log('Relay mode changed to:', mode);
            tracking.refresh(); // Refresh config after mode change
          }}
        />
      )}

      {/* Connection Stats (when connected) */}
      {tracking.isConnected && (
        <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
          <div className="text-sm text-gray-400 mb-2">Connection Statistics</div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-gray-500">Type</div>
              <div className="text-gray-200">{tracking.connectionType.toUpperCase()}</div>
            </div>
            <div>
              <div className="text-gray-500">Latency</div>
              <div className="text-gray-200">
                {tracking.roundTripTime ? `${(tracking.roundTripTime * 1000).toFixed(0)}ms` : 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-gray-500">Packets Lost</div>
              <div className="text-gray-200">{tracking.packetsLost}</div>
            </div>
            <div>
              <div className="text-gray-500">Total Usage</div>
              <div className="text-gray-200">
                {((tracking.totalBytes) / (1024 * 1024)).toFixed(2)} MB
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Purchase Modal */}
      <PurchaseBandwidthModal
        gridId={gridId}
        isOpen={isPurchaseModalOpen}
        onClose={() => setIsPurchaseModalOpen(false)}
        onSuccess={handlePurchaseSuccess}
      />
    </div>
  );
}
