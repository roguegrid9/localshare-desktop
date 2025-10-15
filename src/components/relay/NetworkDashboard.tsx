import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Wifi,
  WifiOff,
  Plus,
  Trash2,
  ExternalLink,
  AlertCircle,
  X,
  Activity,
  Database,
  Settings as SettingsIcon,
  Globe,
  Clock,
  TrendingUp,
  Server,
  Copy,
  Check,
  RefreshCw,
  Link as LinkIcon,
  Zap,
  Shield,
  ShieldAlert
} from 'lucide-react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

interface FRPStatus {
  connected: boolean;
  tunnels_active: number;
  server_addr?: string;
  uptime_seconds: number;
}

interface RelaySubscription {
  id: string;
  status: string;
  plan_type: string;
  bandwidth_used: number;
  bandwidth_limit: number;
  max_connections: number;
}

interface Tunnel {
  id: string;
  subdomain: string;
  local_port: number;
  protocol: string;
  status: string;
  bandwidth_used: number;
}

interface NetworkDashboardProps {
  token: string;
  onClose: () => void;
  onCreateTunnel?: () => void;
  onStartTrial?: () => void;
}

export function NetworkDashboard({ token, onClose, onCreateTunnel, onStartTrial }: NetworkDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'tunnels' | 'bandwidth' | 'settings'>('overview');
  const [status, setStatus] = useState<FRPStatus | null>(null);
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<RelaySubscription | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null); // null = loading, true/false = has/no subscription
  const [checkingSubscription, setCheckingSubscription] = useState(true);
  const { networkStatus, loading: networkLoading, checkNetworkStatus } = useNetworkStatus();

  useEffect(() => {
    checkSubscriptionStatus();
  }, [token]);

  useEffect(() => {
    if (hasSubscription) {
      loadData();
      const interval = setInterval(loadData, 5000); // Poll every 5s
      return () => clearInterval(interval);
    }
  }, [token, hasSubscription]);

  const checkSubscriptionStatus = async () => {
    setCheckingSubscription(true);
    try {
      const response = await fetch('https://roguegrid9-coordinator.fly.dev/api/v1/relay/subscription', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setHasSubscription(data.has_subscription);
      if (data.subscription) {
        setSubscription(data.subscription);
      }
    } catch (err) {
      console.error('Failed to check subscription status:', err);
      // Default to showing free state if we can't check
      setHasSubscription(false);
    } finally {
      setCheckingSubscription(false);
    }
  };

  const loadData = async () => {
    try {
      const [statusResult, tunnelsResult] = await Promise.all([
        invoke<FRPStatus>('get_frp_status'),
        invoke<Tunnel[]>('list_tunnels_command', { token }),
      ]);

      setStatus(statusResult);
      setTunnels(tunnelsResult);
      setError(null);
    } catch (err) {
      console.error('Failed to load network data:', err);
      setError(err as string);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setTimeout(() => setRefreshing(false), 500);
  };

  const handleConnect = async () => {
    setLoading(true);
    setError(null);

    try {
      await invoke('connect_frp_relay', { token });
      await loadData();
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    setError(null);

    try {
      await invoke('disconnect_frp_relay');
      await loadData();
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTunnel = async (tunnelId: string) => {
    if (!confirm('Are you sure you want to delete this tunnel?')) return;

    try {
      await invoke('delete_tunnel_command', { token, tunnelId });
      await loadData();
    } catch (err) {
      setError(err as string);
    }
  };

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedUrl(type);
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const formatBandwidth = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const getBandwidthPercentage = () => {
    if (!subscription) return 0;
    return Math.min((subscription.bandwidth_used / subscription.bandwidth_limit) * 100, 100);
  };

  const getBandwidthColor = () => {
    const percentage = getBandwidthPercentage();
    if (percentage >= 90) return 'text-red-400 bg-red-500/20';
    if (percentage >= 75) return 'text-yellow-400 bg-yellow-500/20';
    return 'text-blue-400 bg-blue-500/20';
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
      case 'running':
        return 'bg-green-500';
      case 'stopped':
      case 'inactive':
        return 'bg-gray-500';
      default:
        return 'bg-yellow-500';
    }
  };

  // Show loading state while checking subscription
  if (checkingSubscription) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0B0D10] h-full">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-[#FF8A00] animate-spin mx-auto mb-4" />
          <p className="text-white/60">Checking subscription status...</p>
        </div>
      </div>
    );
  }

  // Show free state if no subscription
  if (hasSubscription === false) {
    return (
      <div className="flex-1 flex flex-col bg-[#0B0D10] h-full">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-white/10 bg-[#111319]">
          <div className="flex items-center justify-between p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF8A00] to-[#FF3D00] flex items-center justify-center">
                <Wifi className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Network Dashboard</h1>
                <div className="text-white/60">FRP Relay & Tunnel Management</div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-white/60 hover:text-white hover:bg-white/10"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Free State Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Network Status Card */}
            <div className="rounded-xl border border-white/10 bg-[#111319] p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Globe className="w-6 h-6 text-blue-400" />
                  Your Network Status
                </h2>
                <button
                  onClick={checkNetworkStatus}
                  disabled={networkLoading}
                  className="rounded-lg p-2 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-50"
                  title="Refresh network status"
                >
                  <RefreshCw className={`w-4 h-4 ${networkLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <div className="space-y-4">
                {/* Connection Quality Status */}
                <div className={`flex items-start gap-3 p-4 rounded-lg border ${
                  networkStatus?.connection_quality === "excellent" ? "bg-green-500/10 border-green-500/20" :
                  networkStatus?.connection_quality === "good" ? "bg-blue-500/10 border-blue-500/20" :
                  networkStatus?.connection_quality === "fair" ? "bg-yellow-500/10 border-yellow-500/20" :
                  "bg-red-500/10 border-red-500/20"
                }`}>
                  {networkStatus?.needs_relay ? (
                    <ShieldAlert className="w-6 h-6 text-red-400 flex-shrink-0 mt-1" />
                  ) : networkStatus?.stun_available ? (
                    <Shield className="w-6 h-6 text-green-400 flex-shrink-0 mt-1" />
                  ) : (
                    <WifiOff className="w-6 h-6 text-gray-400 flex-shrink-0 mt-1" />
                  )}
                  <div className="flex-1">
                    <p className="text-white font-medium mb-1">
                      {networkStatus?.connection_quality === "excellent" ? "Excellent Connection" :
                       networkStatus?.connection_quality === "good" ? "Good Connection" :
                       networkStatus?.connection_quality === "fair" ? "Fair Connection" :
                       networkStatus?.needs_relay ? "Limited Connection" :
                       "Checking Connection..."}
                    </p>
                    <p className="text-white/60 text-sm mb-2">
                      {networkStatus?.needs_relay ? (
                        "Your network has restrictive NAT/firewall. Direct P2P connections may not work reliably."
                      ) : networkStatus?.connection_quality === "excellent" ? (
                        "Your network supports direct peer-to-peer connections perfectly. No relay needed."
                      ) : networkStatus?.connection_quality === "good" ? (
                        "Your network supports direct P2P connections with good reliability."
                      ) : (
                        "Your network may have some connectivity restrictions."
                      )}
                    </p>
                    {networkStatus && (
                      <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${networkStatus.stun_available ? 'bg-green-500' : 'bg-red-500'}`} />
                          <span className="text-white/70">STUN {networkStatus.stun_available ? 'Available' : 'Unavailable'}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${networkStatus.turn_available ? 'bg-green-500' : 'bg-red-500'}`} />
                          <span className="text-white/70">TURN {networkStatus.turn_available ? 'Available' : 'Unavailable'}</span>
                        </div>
                        <div className="col-span-2 flex items-center gap-1.5">
                          <span className="text-white/50">NAT Type: </span>
                          <span className="text-white/70 font-mono">{networkStatus.nat_type}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Relay Recommendation */}
                {networkStatus?.needs_relay && (
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                    <AlertCircle className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-1" />
                    <div className="flex-1">
                      <p className="text-white font-medium mb-1">Relay Recommended</p>
                      <p className="text-white/60 text-sm">
                        Your network requires relay servers for reliable connectivity. Upgrade to Pro for guaranteed connections via FRP relay servers.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Upgrade Benefits Card */}
            <div className="rounded-xl border border-[#FF8A00]/20 bg-gradient-to-br from-[#FF8A00]/10 to-[#FF3D00]/10 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-[#FF8A00]/20 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-[#FF8A00]" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Upgrade to Pro</h2>
                  <p className="text-white/60 text-sm">Guaranteed connectivity & powerful features</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-white font-medium">FRP Relay Fallback</p>
                    <p className="text-white/60 text-sm">Always connect, even behind strict firewalls</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-white font-medium">40 Concurrent Connections</p>
                    <p className="text-white/60 text-sm">Share multiple services simultaneously</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-white font-medium">250GB Bandwidth/Month</p>
                    <p className="text-white/60 text-sm">Generous data allowance for your projects</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-white font-medium">Public HTTPS Tunnels</p>
                    <p className="text-white/60 text-sm">Share via simple links with custom subdomains</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-white font-medium">6 Global Locations</p>
                    <p className="text-white/60 text-sm">Choose servers close to your users</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-white font-medium">Usage Analytics</p>
                    <p className="text-white/60 text-sm">Track bandwidth and tunnel performance</p>
                  </div>
                </div>
              </div>

              <div className="bg-white/5 rounded-lg p-4 mb-4">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-3xl font-bold text-white">$3.99</span>
                  <span className="text-white/60">/month</span>
                </div>
                <p className="text-white/60 text-sm">Cancel anytime</p>
              </div>

              <button
                onClick={onStartTrial}
                className="w-full py-3 px-6 bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] hover:from-[#FF9A10] hover:to-[#FF4D10] text-white font-medium rounded-lg transition-all flex items-center justify-center gap-2"
              >
                <Zap className="w-5 h-5" />
                Subscribe Now
              </button>
            </div>

            {/* Info Banner */}
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-sm text-blue-300">
                <p className="font-medium mb-1">Flexible Subscription</p>
                <p className="text-blue-300/80">Get access to all Pro features. Cancel anytime with no long-term commitment.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show paid state (existing dashboard)
  return (
    <div className="flex-1 flex flex-col bg-[#0B0D10] h-full">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-white/10 bg-[#111319]">
        <div className="flex items-center justify-between p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF8A00] to-[#FF3D00] flex items-center justify-center">
              <Wifi className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Network Dashboard</h1>
              <div className="text-white/60 flex items-center gap-2">
                FRP Relay & Tunnel Management
                {status?.connected ? (
                  <span className="flex items-center gap-1 text-green-400 text-sm">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse block" />
                    Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-gray-400 text-sm">
                    <span className="w-2 h-2 rounded-full bg-gray-400 block" />
                    Disconnected
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="rounded-lg p-2 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-white/60 hover:text-white hover:bg-white/10"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-t border-white/10">
          {[
            { id: 'overview', label: 'Overview', icon: Activity },
            { id: 'tunnels', label: 'Tunnels', icon: Globe },
            { id: 'bandwidth', label: 'Bandwidth', icon: TrendingUp },
            { id: 'settings', label: 'Settings', icon: SettingsIcon },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-[#FF8A00] text-white bg-white/5'
                  : 'border-transparent text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="m-6 bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={() => setError(null)}
                className="text-xs text-red-400/80 hover:text-red-400 mt-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="p-6 space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Connection Status */}
              <div className="rounded-xl border border-white/10 bg-[#111319] p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Wifi className="w-5 h-5 text-blue-400" />
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    status?.connected ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {status?.connected ? 'Online' : 'Offline'}
                  </span>
                </div>
                <h3 className="text-2xl font-bold text-white mb-1">
                  {status?.connected ? 'Connected' : 'Disconnected'}
                </h3>
                <p className="text-sm text-white/60">Relay Status</p>
              </div>

              {/* Active Tunnels */}
              <div className="rounded-xl border border-white/10 bg-[#111319] p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                    <Globe className="w-5 h-5 text-purple-400" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-white mb-1">
                  {tunnels.length}
                </h3>
                <p className="text-sm text-white/60">Active Tunnels</p>
              </div>

              {/* Bandwidth Used */}
              <div className="rounded-xl border border-white/10 bg-[#111319] p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                    <Database className="w-5 h-5 text-orange-400" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-white mb-1">
                  {subscription ? formatBandwidth(subscription.bandwidth_used) : '0 MB'}
                </h3>
                <p className="text-sm text-white/60">Bandwidth Used</p>
              </div>

              {/* Uptime */}
              <div className="rounded-xl border border-white/10 bg-[#111319] p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-green-400" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-white mb-1">
                  {status?.connected ? formatUptime(status.uptime_seconds) : '0m'}
                </h3>
                <p className="text-sm text-white/60">Connection Uptime</p>
              </div>
            </div>

            {/* Relay Connection */}
            <div className="rounded-xl border border-white/10 bg-[#111319] p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Server className="w-5 h-5" />
                Relay Connection
              </h3>

              {status?.connected ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-white/5">
                    <div>
                      <p className="text-sm text-white/60 mb-1">Server Address</p>
                      <p className="text-white font-mono text-sm">
                        {status.server_addr || 'Unknown'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-white/60 mb-1">Uptime</p>
                      <p className="text-white font-medium">{formatUptime(status.uptime_seconds)}</p>
                    </div>
                  </div>

                  <button
                    onClick={handleDisconnect}
                    disabled={loading}
                    className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors font-medium"
                  >
                    {loading ? 'Disconnecting...' : 'Disconnect Relay'}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <p className="text-white/80 mb-2">
                      Connect to the FRP relay to enable P2P fallback and public tunnels.
                    </p>
                    <ul className="text-sm text-white/60 space-y-1">
                      <li className="flex items-center gap-2">
                        <Zap className="w-3 h-3" />
                        Reliable connectivity even behind NAT/firewalls
                      </li>
                      <li className="flex items-center gap-2">
                        <Globe className="w-3 h-3" />
                        Create public HTTPS tunnels for your services
                      </li>
                      <li className="flex items-center gap-2">
                        <LinkIcon className="w-3 h-3" />
                        Share applications with anyone via URL
                      </li>
                    </ul>
                  </div>

                  <button
                    onClick={handleConnect}
                    disabled={loading}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors font-medium"
                  >
                    {loading ? 'Connecting...' : 'Connect to Relay'}
                  </button>
                </div>
              )}
            </div>

            {/* Subscription Info */}
            {subscription && (
              <div className="rounded-xl border border-white/10 bg-[#111319] p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Subscription Details</h3>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-white/60 mb-1">Plan</p>
                      <p className="text-white font-medium capitalize">{subscription.plan_type}</p>
                    </div>
                    <div>
                      <p className="text-sm text-white/60 mb-1">Status</p>
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                        subscription.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {subscription.status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* No Subscription State */}
            {!subscription && !loading && onStartTrial && (
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-8 text-center">
                <div className="w-16 h-16 rounded-xl bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
                  <Zap className="w-8 h-8 text-blue-400" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">Subscribe to Pro</h3>
                <p className="text-white/80 mb-6 max-w-md mx-auto">
                  Get 40 concurrent connections, 250GB bandwidth, and unlimited tunnels
                </p>
                <button
                  onClick={onStartTrial}
                  className="px-6 py-3 bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] hover:opacity-90 text-white rounded-lg font-medium transition-opacity"
                >
                  Subscribe Now
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'tunnels' && (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">Public Tunnels</h2>
                <p className="text-sm text-white/60 mt-1">
                  Share your local services via public HTTPS URLs
                </p>
              </div>
              {onCreateTunnel && (
                <button
                  onClick={onCreateTunnel}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] hover:opacity-90 text-white rounded-lg font-medium transition-opacity"
                >
                  <Plus className="w-4 h-4" />
                  Create Tunnel
                </button>
              )}
            </div>

            {tunnels.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-[#111319] p-12 text-center">
                <div className="w-16 h-16 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-4">
                  <Globe className="w-8 h-8 text-white/40" />
                </div>
                <h3 className="text-lg font-medium text-white mb-2">No tunnels yet</h3>
                <p className="text-sm text-white/60 mb-6 max-w-md mx-auto">
                  Create a tunnel to expose your local services to the internet with a public HTTPS URL
                </p>
                {onCreateTunnel && (
                  <button
                    onClick={onCreateTunnel}
                    className="px-4 py-2 bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] hover:opacity-90 text-white rounded-lg font-medium transition-opacity"
                  >
                    Create Your First Tunnel
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {tunnels.map(tunnel => (
                  <div
                    key={tunnel.id}
                    className="rounded-xl border border-white/10 bg-[#111319] p-6"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-2 h-2 rounded-full ${getStatusColor(tunnel.status)}`} />
                          <h3 className="text-lg font-semibold text-white">
                            {tunnel.subdomain}.roguegrid9.com
                          </h3>
                          <span className="px-2 py-0.5 bg-white/10 text-white/80 text-xs rounded uppercase font-medium">
                            {tunnel.protocol}
                          </span>
                        </div>
                        <p className="text-sm text-white/60 mb-3">
                          Forwarding to localhost:{tunnel.local_port}
                        </p>

                        <div className="flex items-center gap-2">
                          <a
                            href={`https://${tunnel.subdomain}.roguegrid9.com`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Open URL
                          </a>
                          <button
                            onClick={() => copyToClipboard(`https://${tunnel.subdomain}.roguegrid9.com`, tunnel.id)}
                            className="inline-flex items-center gap-1 text-sm text-white/60 hover:text-white"
                          >
                            {copiedUrl === tunnel.id ? (
                              <>
                                <Check className="w-3 h-3 text-green-400" />
                                <span className="text-green-400">Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                Copy URL
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteTunnel(tunnel.id)}
                        className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete tunnel"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                      <div>
                        <p className="text-xs text-white/60 mb-1">Status</p>
                        <p className="text-sm text-white font-medium capitalize">{tunnel.status}</p>
                      </div>
                      <div>
                        <p className="text-xs text-white/60 mb-1">Bandwidth Used</p>
                        <p className="text-sm text-white font-medium">{formatBandwidth(tunnel.bandwidth_used)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'bandwidth' && (
          <div className="p-6 space-y-6">
            <h2 className="text-xl font-semibold text-white">Bandwidth Usage</h2>

            {subscription ? (
              <>
                {/* Current Usage */}
                <div className="rounded-xl border border-white/10 bg-[#111319] p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Current Usage</h3>

                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-white/60">Usage this period</span>
                        <span className="text-white font-medium">
                          {formatBandwidth(subscription.bandwidth_used)} / {formatBandwidth(subscription.bandwidth_limit)}
                        </span>
                      </div>
                      <div className="relative w-full h-3 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`absolute top-0 left-0 h-full transition-all duration-300 ${
                            getBandwidthPercentage() >= 90 ? 'bg-red-500' :
                            getBandwidthPercentage() >= 75 ? 'bg-yellow-500' : 'bg-blue-500'
                          }`}
                          style={{ width: `${getBandwidthPercentage()}%` }}
                        />
                      </div>
                      <p className="text-xs text-white/60 mt-2">
                        {getBandwidthPercentage().toFixed(1)}% of quota used
                      </p>
                    </div>

                    {getBandwidthPercentage() >= 75 && (
                      <div className={`p-4 rounded-lg border ${
                        getBandwidthPercentage() >= 90
                          ? 'bg-red-500/10 border-red-500/20'
                          : 'bg-yellow-500/10 border-yellow-500/20'
                      }`}>
                        <p className={`text-sm flex items-center gap-2 ${
                          getBandwidthPercentage() >= 90 ? 'text-red-400' : 'text-yellow-400'
                        }`}>
                          <AlertCircle className="w-4 h-4" />
                          {getBandwidthPercentage() >= 90
                            ? 'You\'re approaching your bandwidth limit'
                            : 'Consider upgrading your plan for more bandwidth'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Per-Tunnel Breakdown */}
                {tunnels.length > 0 && (
                  <div className="rounded-xl border border-white/10 bg-[#111319] p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Bandwidth by Tunnel</h3>

                    <div className="space-y-3">
                      {tunnels.map(tunnel => {
                        const percentage = subscription.bandwidth_limit > 0
                          ? (tunnel.bandwidth_used / subscription.bandwidth_limit) * 100
                          : 0;

                        return (
                          <div key={tunnel.id} className="p-4 rounded-lg bg-white/5">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-white font-medium">
                                {tunnel.subdomain}.roguegrid9.com
                              </span>
                              <span className="text-white/80 text-sm">
                                {formatBandwidth(tunnel.bandwidth_used)}
                              </span>
                            </div>
                            <div className="relative w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div
                                className="absolute top-0 left-0 h-full bg-blue-500"
                                style={{ width: `${Math.min(percentage, 100)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Subscription Details */}
                <div className="rounded-xl border border-white/10 bg-[#111319] p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Plan Details</h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-white/5">
                      <p className="text-sm text-white/60 mb-1">Plan Type</p>
                      <p className="text-white font-medium capitalize">{subscription.plan_type}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-white/5">
                      <p className="text-sm text-white/60 mb-1">Max Connections</p>
                      <p className="text-white font-medium">{subscription.max_connections}</p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-white/10 bg-[#111319] p-12 text-center">
                <Database className="w-12 h-12 text-white/40 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">No Active Subscription</h3>
                <p className="text-sm text-white/60 mb-6">
                  Start a subscription to track your bandwidth usage
                </p>
                {onStartTrial && (
                  <button
                    onClick={onStartTrial}
                    className="px-4 py-2 bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] hover:opacity-90 text-white rounded-lg font-medium transition-opacity"
                  >
                    Subscribe Now
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="p-6 space-y-6">
            <h2 className="text-xl font-semibold text-white">Connection Settings</h2>

            {/* Connection Status */}
            <div className="rounded-xl border border-white/10 bg-[#111319] p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Connection Information</h3>

              <div className="space-y-3">
                {status?.server_addr && (
                  <div className="flex justify-between p-3 rounded-lg bg-white/5">
                    <span className="text-white/60">Server Address</span>
                    <span className="text-white font-mono text-sm">{status.server_addr}</span>
                  </div>
                )}
                <div className="flex justify-between p-3 rounded-lg bg-white/5">
                  <span className="text-white/60">Connection Status</span>
                  <span className={`font-medium ${status?.connected ? 'text-green-400' : 'text-gray-400'}`}>
                    {status?.connected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                {status?.connected && (
                  <div className="flex justify-between p-3 rounded-lg bg-white/5">
                    <span className="text-white/60">Uptime</span>
                    <span className="text-white">{formatUptime(status.uptime_seconds)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Auto-reconnect */}
            <div className="rounded-xl border border-white/10 bg-[#111319] p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Preferences</h3>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                  <div>
                    <p className="text-white font-medium">Auto-reconnect</p>
                    <p className="text-sm text-white/60">Automatically reconnect on network changes</p>
                  </div>
                  <div className="w-12 h-6 rounded-full bg-blue-500 flex items-center">
                    <div className="w-5 h-5 rounded-full bg-white ml-auto mr-0.5" />
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-white/5 opacity-50">
                  <div>
                    <p className="text-white font-medium">Notifications</p>
                    <p className="text-sm text-white/60">Get notified of bandwidth warnings</p>
                  </div>
                  <div className="w-12 h-6 rounded-full bg-gray-600 flex items-center">
                    <div className="w-5 h-5 rounded-full bg-white ml-0.5" />
                  </div>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-6">
              <h3 className="text-lg font-semibold text-red-300 mb-4">Danger Zone</h3>
              <p className="text-sm text-red-200 mb-4">
                These actions will affect your active connections
              </p>

              <div className="space-y-3">
                {status?.connected && (
                  <button
                    onClick={handleDisconnect}
                    className="w-full px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 rounded-lg font-medium transition-colors"
                  >
                    Disconnect All Connections
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm('Are you sure you want to delete all tunnels? This cannot be undone.')) {
                      tunnels.forEach(tunnel => handleDeleteTunnel(tunnel.id));
                    }
                  }}
                  disabled={tunnels.length === 0}
                  className="w-full px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Delete All Tunnels ({tunnels.length})
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
