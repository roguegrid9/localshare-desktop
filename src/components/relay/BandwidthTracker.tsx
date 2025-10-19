import { useState, useEffect } from 'react';
import { X, AlertCircle, Zap, Check, TrendingUp, Database, Wifi, Shield, ShieldAlert, RefreshCw, Globe, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';

interface RelaySubscription {
  id: string;
  status: string;
  plan_type: string;
  bandwidth_used: number;
  bandwidth_limit: number;
  max_connections: number;
  renews_at?: string;
  current_period_end?: string;
}

interface BandwidthTrackerProps {
  token: string;
  onClose: () => void;
  onStartTrial?: () => void;
}

export function BandwidthTracker({ token, onClose, onStartTrial }: BandwidthTrackerProps) {
  const [subscription, setSubscription] = useState<RelaySubscription | null>(null);
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null);
  const [checkingSubscription, setCheckingSubscription] = useState(true);
  const { networkStatus, loading: networkLoading, checkNetworkStatus } = useNetworkStatus();
  const [showNATInfo, setShowNATInfo] = useState(false);

  useEffect(() => {
    checkSubscriptionStatus();
    if (hasSubscription) {
      const interval = setInterval(checkSubscriptionStatus, 30000); // Poll every 30s
      return () => clearInterval(interval);
    }
  }, [token, hasSubscription]);

  const checkSubscriptionStatus = async () => {
    // Only show loading on initial load, not on background refreshes
    const isInitialLoad = hasSubscription === null;
    if (isInitialLoad) {
      setCheckingSubscription(true);
    }

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
      setHasSubscription(false);
    } finally {
      if (isInitialLoad) {
        setCheckingSubscription(false);
      }
    }
  };

  const formatBandwidth = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  };

  const getBandwidthPercentage = () => {
    if (!subscription) return 0;
    return Math.min((subscription.bandwidth_used / subscription.bandwidth_limit) * 100, 100);
  };

  const getBandwidthColor = () => {
    const percentage = getBandwidthPercentage();
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-blue-500';
  };

  const formatRenewalDate = (dateString?: string) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getNATTypeExplanation = (natType: string) => {
    const explanations: Record<string, string> = {
      'Full Cone': 'Best for P2P - Direct connections work perfectly',
      'Restricted Cone': 'Good for P2P - Direct connections work well',
      'Port Restricted Cone': 'Moderate for P2P - Most direct connections work',
      'Symmetric': 'Difficult for P2P - May require relay servers',
      'Unknown': 'NAT type not yet detected'
    };
    return explanations[natType] || 'NAT configuration determines P2P capability';
  };

  const getConnectionQualityColor = (quality?: string) => {
    switch (quality) {
      case 'excellent': return 'success';
      case 'good': return 'accent';
      case 'fair': return 'warning';
      default: return 'destructive';
    }
  };

  const natTypes = [
    {
      name: 'Full Cone NAT',
      p2pCapability: 'Excellent',
      color: 'text-green-400',
      icon: Shield,
      description: 'Best for P2P - All direct connections work perfectly. Any external host can send data to your internal address.'
    },
    {
      name: 'Restricted Cone NAT',
      p2pCapability: 'Very Good',
      color: 'text-green-400',
      icon: Shield,
      description: 'Great for P2P - Direct connections work well. Only hosts you\'ve contacted can send data back to you.'
    },
    {
      name: 'Port Restricted Cone NAT',
      p2pCapability: 'Good',
      color: 'text-blue-400',
      icon: Shield,
      description: 'Good for P2P - Most direct connections work. Similar to Restricted Cone but also filters by port number.'
    },
    {
      name: 'Symmetric NAT',
      p2pCapability: 'Poor',
      color: 'text-yellow-400',
      icon: ShieldAlert,
      description: 'Difficult for P2P - Usually requires relay servers. Uses different ports for each destination, making hole-punching unreliable.'
    },
    {
      name: 'Unknown',
      p2pCapability: 'Unknown',
      color: 'text-gray-400',
      icon: AlertCircle,
      description: 'NAT type not yet detected. Run a network check to determine your configuration.'
    }
  ];

  // Loading state
  if (checkingSubscription) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-primary h-full">
        <div className="text-center">
          <TrendingUp className="w-8 h-8 text-accent-solid animate-pulse mx-auto mb-4" />
          <p className="text-text-secondary">Loading bandwidth data...</p>
        </div>
      </div>
    );
  }

  // Free state - no subscription
  if (hasSubscription === false) {
    return (
      <div className="flex-1 flex flex-col bg-bg-primary h-full">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-border bg-bg-surface">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-gradient-start to-accent-gradient-end flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-heading font-bold text-text-primary">Network Dashboard</h1>
                <div className="text-sm text-text-secondary">Monitor your network usage</div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Free State Content */}
        <div className="flex-1 overflow-y-auto p-6" style={{ scrollBehavior: 'auto' }}>
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Network Status Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Globe className="w-6 h-6 text-accent-solid" />
                      Network Status
                    </CardTitle>
                    <CardDescription>Your current network connectivity and NAT configuration</CardDescription>
                  </div>
                  <button
                    onClick={checkNetworkStatus}
                    disabled={networkLoading}
                    className="rounded-lg p-2 text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-50"
                    title="Refresh network status"
                  >
                    <RefreshCw className={`w-4 h-4 ${networkLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {networkStatus ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 rounded-lg bg-bg-muted">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm text-text-secondary">NAT Type</span>
                            <button
                              onClick={() => setShowNATInfo(!showNATInfo)}
                              className="text-text-secondary hover:text-accent-solid transition-colors"
                              title="Learn about NAT types"
                            >
                              <Info className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {networkStatus.needs_relay ? (
                            <ShieldAlert className="w-4 h-4 text-yellow-400" />
                          ) : (
                            <Shield className="w-4 h-4 text-green-400" />
                          )}
                        </div>
                        <p className="text-lg font-semibold text-text-primary mb-1">{networkStatus.nat_type}</p>
                        <p className="text-xs text-text-secondary">{getNATTypeExplanation(networkStatus.nat_type)}</p>
                      </div>

                      <div className="p-4 rounded-lg bg-bg-muted">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-text-secondary">Connection Quality</span>
                          <Badge variant={getConnectionQualityColor(networkStatus.connection_quality)}>
                            {networkStatus.connection_quality}
                          </Badge>
                        </div>
                        <p className="text-lg font-semibold text-text-primary mb-1">
                          {networkStatus.needs_relay ? 'Relay Recommended' : 'Direct P2P Ready'}
                        </p>
                        <p className="text-xs text-text-secondary">
                          {networkStatus.needs_relay
                            ? 'Your network may benefit from relay servers'
                            : 'Direct peer-to-peer connections supported'
                          }
                        </p>
                      </div>
                    </div>


                    {showNATInfo && (
                      <div className="p-4 rounded-lg border border-accent-solid/20 bg-accent-solid/5 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-text-primary">NAT Types & P2P Capability</h4>
                          <button
                            onClick={() => setShowNATInfo(false)}
                            className="text-text-secondary hover:text-text-primary transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="space-y-2">
                          {natTypes.map((type) => {
                            const Icon = type.icon;
                            return (
                              <div key={type.name} className="p-3 rounded-lg bg-bg-muted">
                                <div className="flex items-start gap-3">
                                  <Icon className={`w-4 h-4 ${type.color} flex-shrink-0 mt-0.5`} />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                      <span className="text-sm font-medium text-text-primary">{type.name}</span>
                                      <Badge variant={
                                        type.p2pCapability === 'Excellent' || type.p2pCapability === 'Very Good' ? 'success' :
                                        type.p2pCapability === 'Good' ? 'accent' :
                                        type.p2pCapability === 'Poor' ? 'warning' : 'default'
                                      } className="flex-shrink-0">
                                        {type.p2pCapability}
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-text-secondary">{type.description}</p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <Wifi className="w-8 h-8 text-text-secondary mx-auto mb-2 animate-pulse" />
                    <p className="text-sm text-text-secondary">Checking network status...</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Upgrade Benefits Card */}
            <Card className="border-accent-solid/20 bg-gradient-to-br from-accent-solid/10 to-accent-gradient-end/10">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-accent-solid/20 flex items-center justify-center">
                    <Zap className="w-5 h-5 text-accent-solid" />
                  </div>
                  <div>
                    <CardTitle>Upgrade to Pro</CardTitle>
                    <CardDescription>Guaranteed connectivity & powerful features</CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-text-primary font-medium">FRP Relay Fallback</p>
                      <p className="text-text-secondary text-sm">Always connect, even behind strict firewalls</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-text-primary font-medium">40 Concurrent Connections</p>
                      <p className="text-text-secondary text-sm">Share multiple services simultaneously</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-text-primary font-medium">250GB Bandwidth/Month</p>
                      <p className="text-text-secondary text-sm">Generous data allowance for your projects</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-text-primary font-medium">Public HTTPS Tunnels</p>
                      <p className="text-text-secondary text-sm">Share via simple links with custom subdomains</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-text-primary font-medium">6 Global Locations</p>
                      <p className="text-text-secondary text-sm">Choose servers close to your users</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-text-primary font-medium">Usage Analytics</p>
                      <p className="text-text-secondary text-sm">Track bandwidth and tunnel performance</p>
                    </div>
                  </div>
                </div>

                <div className="bg-bg-surface rounded-lg p-4">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-3xl font-bold text-text-primary">$3.99</span>
                    <span className="text-text-secondary">/month</span>
                  </div>
                  <p className="text-text-secondary text-sm">Cancel anytime</p>
                </div>

                {onStartTrial && (
                  <Button
                    onClick={onStartTrial}
                    className="w-full bg-gradient-to-r from-accent-gradient-start to-accent-gradient-end hover:opacity-90 transition-opacity"
                  >
                    <Zap className="w-5 h-5 mr-2" />
                    Subscribe Now
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Info Banner */}
            <Card className="bg-blue-500/10 border-blue-500/20">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 text-sm text-blue-300">
                    <p className="font-medium mb-1">Flexible Subscription</p>
                    <p className="text-blue-300/80">Get access to all Pro features. Cancel anytime with no long-term commitment.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Paid state - bandwidth tracker
  return (
    <div className="flex-1 flex flex-col bg-bg-primary h-full">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border bg-bg-surface">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-gradient-start to-accent-gradient-end flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-heading font-bold text-text-primary">Network Dashboard</h1>
              <div className="text-sm text-text-secondary">Monitor your network usage</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Bandwidth Content */}
      <div className="flex-1 overflow-y-auto p-6" style={{ scrollBehavior: 'auto' }}>
        <div className="max-w-4xl mx-auto space-y-6">
          {subscription ? (
            <>
              {/* Current Usage Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="w-6 h-6 text-accent-solid" />
                        Bandwidth Usage
                      </CardTitle>
                      <CardDescription>
                        {formatRenewalDate(subscription.renews_at || subscription.current_period_end)
                          ? `Renews ${formatRenewalDate(subscription.renews_at || subscription.current_period_end)}`
                          : 'Track your bandwidth consumption this billing period'
                        }
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-text-secondary mb-1">Max Connections</div>
                      <div className="text-2xl font-bold text-text-primary">{subscription.max_connections}</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <div className="flex justify-between items-baseline mb-3">
                      <span className="text-text-secondary">Current Usage</span>
                      <div className="text-right">
                        <span className="text-text-primary font-semibold text-lg">
                          {formatBandwidth(subscription.bandwidth_used)}
                        </span>
                        <span className="text-text-secondary text-sm"> / {formatBandwidth(subscription.bandwidth_limit)}</span>
                      </div>
                    </div>
                    <div className="relative w-full h-8 bg-bg-muted rounded-full overflow-hidden">
                      <div
                        className={`absolute top-0 left-0 h-full transition-all duration-300 ${getBandwidthColor()}`}
                        style={{ width: `${getBandwidthPercentage()}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center mt-3">
                      <Badge variant={subscription.status === 'active' ? 'success' : 'default'}>
                        {subscription.status}
                      </Badge>
                      <p className="text-sm text-text-secondary">
                        {getBandwidthPercentage().toFixed(1)}% used
                      </p>
                    </div>
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
                          : 'Consider monitoring your usage closely'}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Network Status Card - Paid State */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Globe className="w-6 h-6 text-accent-solid" />
                        Network Status
                      </CardTitle>
                      <CardDescription>Your current network connectivity and NAT configuration</CardDescription>
                    </div>
                    <button
                      onClick={checkNetworkStatus}
                      disabled={networkLoading}
                      className="rounded-lg p-2 text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-50"
                      title="Refresh network status"
                    >
                      <RefreshCw className={`w-4 h-4 ${networkLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {networkStatus ? (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-lg bg-bg-muted">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm text-text-secondary">NAT Type</span>
                              <button
                                onClick={() => setShowNATInfo(!showNATInfo)}
                                className="text-text-secondary hover:text-accent-solid transition-colors"
                                title="Learn about NAT types"
                              >
                                <Info className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            {networkStatus.needs_relay ? (
                              <ShieldAlert className="w-4 h-4 text-yellow-400" />
                            ) : (
                              <Shield className="w-4 h-4 text-green-400" />
                            )}
                          </div>
                          <p className="text-lg font-semibold text-text-primary mb-1">{networkStatus.nat_type}</p>
                          <p className="text-xs text-text-secondary">{getNATTypeExplanation(networkStatus.nat_type)}</p>
                        </div>

                        <div className="p-4 rounded-lg bg-bg-muted">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-text-secondary">Connection Quality</span>
                            <Badge variant={getConnectionQualityColor(networkStatus.connection_quality)}>
                              {networkStatus.connection_quality}
                            </Badge>
                          </div>
                          <p className="text-lg font-semibold text-text-primary mb-1">
                            {networkStatus.needs_relay ? 'Relay Protected' : 'Direct P2P Ready'}
                          </p>
                          <p className="text-xs text-text-secondary">
                            {networkStatus.needs_relay
                              ? 'Your Pro subscription provides relay fallback'
                              : 'Direct peer-to-peer connections supported'
                            }
                          </p>
                        </div>
                      </div>

                      {showNATInfo && (
                        <div className="p-4 rounded-lg border border-accent-solid/20 bg-accent-solid/5 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-text-primary">NAT Types & P2P Capability</h4>
                            <button
                              onClick={() => setShowNATInfo(false)}
                              className="text-text-secondary hover:text-text-primary transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="space-y-2">
                            {natTypes.map((type) => {
                              const Icon = type.icon;
                              return (
                                <div key={type.name} className="p-3 rounded-lg bg-bg-muted">
                                  <div className="flex items-start gap-3">
                                    <Icon className={`w-4 h-4 ${type.color} flex-shrink-0 mt-0.5`} />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between gap-2 mb-1">
                                        <span className="text-sm font-medium text-text-primary">{type.name}</span>
                                        <Badge variant={
                                          type.p2pCapability === 'Excellent' || type.p2pCapability === 'Very Good' ? 'success' :
                                          type.p2pCapability === 'Good' ? 'accent' :
                                          type.p2pCapability === 'Poor' ? 'warning' : 'default'
                                        } className="flex-shrink-0">
                                          {type.p2pCapability}
                                        </Badge>
                                      </div>
                                      <p className="text-xs text-text-secondary">{type.description}</p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <Wifi className="w-8 h-8 text-text-secondary mx-auto mb-2 animate-pulse" />
                      <p className="text-sm text-text-secondary">Checking network status...</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-6 h-6 text-text-secondary" />
                  No Active Subscription
                </CardTitle>
                <CardDescription>
                  Start a subscription to track your bandwidth usage
                </CardDescription>
              </CardHeader>
              <CardContent>
                {onStartTrial && (
                  <Button
                    onClick={onStartTrial}
                    className="bg-gradient-to-r from-accent-gradient-start to-accent-gradient-end hover:opacity-90 transition-opacity"
                  >
                    Subscribe Now
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
