import { useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { BandwidthTracker } from './BandwidthTracker';
import { CreateTunnelModal } from './CreateTunnelModal';
import { TrialSignupModal } from './TrialSignupModal';

interface NetworkMenuProps {
  token: string;
  isConnected?: boolean;
}

/**
 * NetworkMenu - Integration component for FRP Relay
 *
 * Usage in navigation:
 *
 * ```tsx
 * import { NetworkMenu } from './components/relay';
 *
 * function Navigation() {
 *   const { token } = useAuth();
 *
 *   return (
 *     <nav>
 *       <NetworkMenu token={token} />
 *     </nav>
 *   );
 * }
 * ```
 */
export function NetworkMenu({ token, isConnected = false }: NetworkMenuProps) {
  const [showDashboard, setShowDashboard] = useState(false);
  const [showCreateTunnel, setShowCreateTunnel] = useState(false);
  const [showTrialSignup, setShowTrialSignup] = useState(false);

  const handleDashboardClose = () => {
    setShowDashboard(false);
  };

  const handleCreateTunnel = () => {
    setShowCreateTunnel(true);
  };

  const handleStartTrial = () => {
    setShowTrialSignup(true);
  };

  const handleTunnelCreated = () => {
    setShowCreateTunnel(false);
    // Optionally refresh dashboard
  };

  const handleTrialStarted = () => {
    setShowTrialSignup(false);
    // Optionally refresh dashboard or connect
  };

  return (
    <>
      {/* Menu Button */}
      <button
        onClick={() => setShowDashboard(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors relative"
        title="Network Dashboard"
      >
        {isConnected ? (
          <Wifi className="w-5 h-5 text-green-400" />
        ) : (
          <WifiOff className="w-5 h-5 text-gray-400" />
        )}
        <span className="text-sm text-gray-300">Network</span>

        {/* Connection indicator dot */}
        {isConnected && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-green-400 rounded-full" />
        )}
      </button>

      {/* Modals */}
      {showDashboard && (
        <BandwidthTracker
          token={token}
          onClose={handleDashboardClose}
          onCreateTunnel={handleCreateTunnel}
          onStartTrial={handleStartTrial}
        />
      )}

      {showCreateTunnel && (
        <CreateTunnelModal
          token={token}
          onClose={() => setShowCreateTunnel(false)}
          onCreated={handleTunnelCreated}
        />
      )}

      {showTrialSignup && (
        <TrialSignupModal
          token={token}
          onClose={() => setShowTrialSignup(false)}
          onStarted={handleTrialStarted}
        />
      )}
    </>
  );
}
