// Bandwidth Display Component
import { useBandwidthTracking } from '../../hooks/useBandwidthTracking';
import { AlertTriangle, Wifi, WifiOff, Clock, Database } from 'lucide-react';
import { formatBytes } from '../../utils/gridRelay';
import { useState } from 'react';

interface BandwidthDisplayProps {
  gridId: string;
  onPurchaseClick?: () => void;
  className?: string;
}

export function BandwidthDisplay({ gridId, onPurchaseClick, className = '' }: BandwidthDisplayProps) {
  const tracking = useBandwidthTracking({
    gridId,
    enabled: true,
    autoConnect: false,
    onQuotaWarning: (level) => {
      console.warn(`Bandwidth quota warning: ${level}% used`);
    },
    onQuotaExceeded: () => {
      console.error('Bandwidth quota exceeded!');
    },
  });

  const [showDetails, setShowDetails] = useState(false);

  // Determine warning color
  const getUsageColor = () => {
    if (tracking.isQuotaExceeded || tracking.isExpired) return 'text-red-500';
    if (tracking.percentUsed >= 95) return 'text-red-500';
    if (tracking.percentUsed >= 90) return 'text-orange-500';
    if (tracking.percentUsed >= 80) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getProgressColor = () => {
    if (tracking.isQuotaExceeded || tracking.isExpired) return 'bg-red-500';
    if (tracking.percentUsed >= 95) return 'bg-red-500';
    if (tracking.percentUsed >= 90) return 'bg-orange-500';
    if (tracking.percentUsed >= 80) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  // Connection status indicator
  const getConnectionIcon = () => {
    if (tracking.isConnected) {
      return <Wifi className="w-4 h-4 text-green-500" />;
    } else if (tracking.isConnecting) {
      return <Wifi className="w-4 h-4 text-yellow-500 animate-pulse" />;
    } else {
      return <WifiOff className="w-4 h-4 text-gray-400" />;
    }
  };

  const getConnectionLabel = () => {
    switch (tracking.connectionState) {
      case 'connected-p2p':
        return 'P2P';
      case 'connected-stun':
        return 'STUN';
      case 'connected-turn':
        return 'Relay';
      case 'attempting-p2p':
        return 'Connecting P2P...';
      case 'attempting-stun':
        return 'Trying STUN...';
      case 'attempting-turn':
        return 'Connecting Relay...';
      case 'failed':
        return 'Failed';
      case 'quota-exceeded':
        return 'Quota Exceeded';
      default:
        return 'Idle';
    }
  };

  if (!tracking.hasAllocation) {
    return (
      <div className={`p-4 bg-[#0B0D10] rounded-xl border border-white/10 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-white/40" />
            <div>
              <span className="text-white/60">Relay Service Not Configured</span>
              <div className="text-xs text-white/40 mt-1">
                P2P connections will be attempted without relay fallback
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-[#0B0D10] rounded-xl border border-white/10 ${className}`}>
      {/* Header */}
      <div
        className="p-4 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setShowDetails(!showDetails)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getConnectionIcon()}
            <div>
              <div className="text-sm text-white/80">
                {getConnectionLabel()}
                {tracking.isConnected && tracking.connectionType !== 'unknown' && (
                  <span className="ml-2 text-xs text-white/40">
                    ({tracking.connectionType.toUpperCase()})
                  </span>
                )}
              </div>
              <div className={`text-xs ${getUsageColor()}`}>
                {tracking.usedGB.toFixed(2)} / {tracking.purchasedGB} GB
                ({tracking.percentUsed.toFixed(1)}%)
              </div>
            </div>
          </div>

          {/* Warning indicators */}
          <div className="flex items-center gap-2">
            {(tracking.isQuotaExceeded || tracking.isExpired) && (
              <AlertTriangle className="w-5 h-5 text-red-500" />
            )}
            {tracking.quotaWarningLevel && !tracking.isQuotaExceeded && (
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 w-full bg-white/10 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${getProgressColor()}`}
            style={{ width: `${Math.min(tracking.percentUsed, 100)}%` }}
          />
        </div>
      </div>

      {/* Expanded details */}
      {showDetails && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/10 pt-3">
          {/* Bandwidth stats */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-white/60">Sent</div>
              <div className="text-white">{formatBytes(tracking.bytesSent)}</div>
            </div>
            <div>
              <div className="text-white/60">Received</div>
              <div className="text-white">{formatBytes(tracking.bytesReceived)}</div>
            </div>
            <div>
              <div className="text-white/60">Remaining</div>
              <div className="text-white">{tracking.remainingGB.toFixed(2)} GB</div>
            </div>
            <div>
              <div className="text-white/60">Latency</div>
              <div className="text-white">
                {tracking.roundTripTime ? `${(tracking.roundTripTime * 1000).toFixed(0)}ms` : 'N/A'}
              </div>
            </div>
          </div>

          {/* Expiration */}
          {tracking.expiresAt && (
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-white/60">
                <Clock className="w-4 h-4" />
                <span>Expires in:</span>
              </div>
              <div className={tracking.isExpired ? 'text-red-500' : 'text-white'}>
                {tracking.getTimeUntilExpiration()}
              </div>
            </div>
          )}

          {/* Warnings */}
          {tracking.isQuotaExceeded && (
            <div className="p-3 bg-red-900/20 border border-red-500/30 rounded text-sm text-red-400">
              ⚠️ Bandwidth quota exceeded. Purchase more to continue using relay servers.
            </div>
          )}

          {tracking.isExpired && (
            <div className="p-3 bg-red-900/20 border border-red-500/30 rounded text-sm text-red-400">
              ⚠️ Bandwidth allocation expired. Purchase a new allocation to continue.
            </div>
          )}

          {tracking.quotaWarningLevel && !tracking.isQuotaExceeded && (
            <div className="p-3 bg-yellow-900/20 border border-yellow-500/30 rounded text-sm text-yellow-400">
              ⚠️ {tracking.quotaWarningLevel}% of bandwidth quota used. Consider purchasing more.
            </div>
          )}

          {/* Purchase button */}
          {onPurchaseClick && tracking.needsPurchase && (
            <button
              onClick={onPurchaseClick}
              className="w-full px-4 py-2 bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] text-white rounded-xl font-medium hover:opacity-90 transition-opacity"
            >
              Purchase More Bandwidth
            </button>
          )}

          {/* Relay mode info */}
          <div className="text-xs text-white/40 text-center">
            Mode: {tracking.relayMode.replace('_', ' ').toUpperCase()}
          </div>
        </div>
      )}
    </div>
  );
}
