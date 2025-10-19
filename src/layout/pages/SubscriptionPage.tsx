import { useState, useEffect } from 'react';
import { Check, Sparkles, Shield, Zap, Globe } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StripeCheckoutModal } from '@/components/subscription/StripeCheckoutModal';

interface SubscriptionPageProps {
  onRefresh?: () => void;
}

interface RelaySubscription {
  status: string;
  vps_id: string | null;
}

export function SubscriptionPage({ onRefresh }: SubscriptionPageProps) {
  const [relaySubscription, setRelaySubscription] = useState<RelaySubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);

  useEffect(() => {
    loadSubscriptionStatus();
  }, []);

  const loadSubscriptionStatus = async () => {
    try {
      // Get auth token
      const authToken = await invoke<string>('get_auth_token');
      setToken(authToken);

      // Check relay subscription status
      const response = await fetch(
        'https://roguegrid9-coordinator.fly.dev/api/v1/relay/subscription',
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setRelaySubscription(data.subscription || null);
      }
    } catch (error) {
      console.error('Failed to load subscription status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgradeClick = () => {
    if (token) {
      setShowCheckout(true);
    }
  };

  const handleCheckoutSuccess = () => {
    loadSubscriptionStatus();
    if (onRefresh) {
      onRefresh();
    }
  };

  const isProUser = relaySubscription?.status === 'active';

  const freeFeatures = [
    'Unlimited P2P connections',
    'Community grids',
    'Basic relay fallback',
    'Standard support',
  ];

  const proFeatures = [
    '40 concurrent connections',
    '250GB monthly bandwidth',
    '6 global server locations',
    'Guaranteed P2P connectivity',
    'Priority relay routing',
    'Advanced network analytics',
    'Priority support',
  ];

  return (
    <div className="w-full h-full bg-black overflow-y-auto">
      <div className="max-w-6xl mx-auto px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-heading font-semibold text-text-primary mb-3">
            Choose Your Plan
          </h1>
          <p className="text-text-secondary text-lg">
            Upgrade to Pro for unlimited relay access and premium features
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Free Tier Card */}
          <Card className="relative border-border bg-bg-surface shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-10 h-10 rounded-lg bg-bg-muted flex items-center justify-center">
                  <Zap className="w-5 h-5 text-text-secondary" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-2xl">Free</CardTitle>
                {!isProUser && (
                  <Badge className="bg-green-600 hover:bg-green-600 text-white border-none px-2 py-0.5 text-xs">
                    Current Plan
                  </Badge>
                )}
              </div>
              <CardDescription className="text-text-secondary">
                Perfect for getting started
              </CardDescription>
            </CardHeader>

            <CardContent className="pb-6">
              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-heading font-bold text-text-primary">$0</span>
                  <span className="text-text-tertiary text-sm">/month</span>
                </div>
              </div>

              <ul className="space-y-3">
                {freeFeatures.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                    <span className="text-text-secondary text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>

            <CardFooter>
              <button
                disabled={!isProUser}
                className="w-full py-2.5 rounded-lg border border-border bg-bg-muted text-text-secondary font-medium disabled:opacity-50 cursor-not-allowed"
              >
                {isProUser ? 'Not Active' : 'Current Plan'}
              </button>
            </CardFooter>
          </Card>

          {/* Pro Tier Card */}
          <Card className="relative border-accent-solid bg-bg-surface shadow-lg hover:shadow-2xl transition-all hover:scale-[1.02]">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent-gradient-start to-accent-gradient-end flex items-center justify-center shadow-glow">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-2xl">Pro Relay</CardTitle>
                {isProUser && (
                  <Badge className="bg-green-600 hover:bg-green-600 text-white border-none px-2 py-0.5 text-xs">
                    Current Plan
                  </Badge>
                )}
              </div>
              <CardDescription className="text-text-secondary">
                Professional relay with guaranteed connectivity
              </CardDescription>
            </CardHeader>

            <CardContent className="pb-6">
              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-heading font-bold bg-gradient-to-r from-accent-gradient-start to-accent-gradient-end bg-clip-text text-transparent">
                    $3.99
                  </span>
                  <span className="text-text-tertiary text-sm">/month</span>
                </div>
              </div>

              <ul className="space-y-3">
                {proFeatures.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-accent-solid flex-shrink-0 mt-0.5" />
                    <span className="text-text-primary text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>

            <CardFooter>
              {isProUser ? (
                <button
                  disabled
                  className="w-full py-2.5 rounded-lg bg-gradient-to-r from-accent-gradient-start to-accent-gradient-end text-white font-semibold shadow-glow opacity-50 cursor-not-allowed"
                >
                  Current Plan
                </button>
              ) : (
                <button
                  onClick={handleUpgradeClick}
                  disabled={loading || !token}
                  className="w-full py-2.5 rounded-lg bg-gradient-to-r from-accent-gradient-start to-accent-gradient-end hover:from-accent-gradient-start/90 hover:to-accent-gradient-end/90 text-white font-semibold transition-all shadow-glow hover:shadow-[0_0_30px_rgba(123,92,255,0.7)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Upgrade Now
                </button>
              )}
            </CardFooter>
          </Card>
        </div>

        {/* Features Comparison */}
        <div className="mt-16 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-6 rounded-lg bg-bg-surface border border-border">
              <Shield className="w-8 h-8 text-accent-solid mx-auto mb-3" />
              <h3 className="font-heading font-semibold text-text-primary mb-2">
                Secure & Private
              </h3>
              <p className="text-sm text-text-secondary">
                End-to-end encrypted P2P connections with optional relay fallback
              </p>
            </div>

            <div className="text-center p-6 rounded-lg bg-bg-surface border border-border">
              <Globe className="w-8 h-8 text-accent-solid mx-auto mb-3" />
              <h3 className="font-heading font-semibold text-text-primary mb-2">
                Global Network
              </h3>
              <p className="text-sm text-text-secondary">
                Connect from anywhere with servers across 6 continents
              </p>
            </div>

            <div className="text-center p-6 rounded-lg bg-bg-surface border border-border">
              <Zap className="w-8 h-8 text-accent-solid mx-auto mb-3" />
              <h3 className="font-heading font-semibold text-text-primary mb-2">
                Lightning Fast
              </h3>
              <p className="text-sm text-text-secondary">
                Optimized routing for minimal latency and maximum throughput
              </p>
            </div>
          </div>
        </div>

        {/* FAQ Note */}
        <div className="mt-12 text-center">
          <p className="text-text-tertiary text-sm">
            Cancel anytime. Questions? Contact support@roguegrid.com
          </p>
        </div>
      </div>

      {/* Stripe Checkout Modal */}
      {token && (
        <StripeCheckoutModal
          token={token}
          isOpen={showCheckout}
          onClose={() => setShowCheckout(false)}
          onSuccess={handleCheckoutSuccess}
        />
      )}
    </div>
  );
}
