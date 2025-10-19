import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import { CheckCircle, AlertCircle, X, CreditCard } from 'lucide-react';
import { Spinner } from '../ui/spinner';

interface TrialSignupModalProps {
  token: string;
  onClose: () => void;
  onStarted: () => void;
}

const LOCATIONS = [
  { id: 'us-east', name: 'US East (New York)', flag: '🇺🇸', description: 'Best for East Coast USA' },
  { id: 'us-west', name: 'US West (San Francisco)', flag: '🇺🇸', description: 'Best for West Coast USA' },
  { id: 'eu-west', name: 'EU West (London)', flag: '🇬🇧', description: 'Best for Europe' },
  { id: 'ap-southeast', name: 'Asia Pacific (Singapore)', flag: '🇸🇬', description: 'Best for Asia' },
];

export function TrialSignupModal({ token, onClose, onStarted }: TrialSignupModalProps) {
  const [selectedLocation, setSelectedLocation] = useState('us-east');
  const [starting, setStarting] = useState(false);
  const [waitingForPayment, setWaitingForPayment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Poll for subscription activation
  const startPollingForSubscription = () => {
    console.log('[TrialSignup] Starting subscription polling...');
    let attempts = 0;
    const maxAttempts = 150; // 5 minutes at 2 second intervals
    const interval = 2000; // 2 seconds

    const checkSubscription = async () => {
      console.log(`[TrialSignup] Polling attempt ${attempts + 1}/${maxAttempts}`);
      try {
        const response = await fetch('https://roguegrid9-coordinator.fly.dev/api/v1/relay/subscription', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          console.log('[TrialSignup] Subscription response:', data);

          // Check if subscription is active
          if (data.subscription && data.subscription.status === 'active') {
            // Success! Clear polling and notify parent
            console.log('[TrialSignup] Subscription active! Closing modal.');
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }

            setWaitingForPayment(false);
            onStarted(); // Refresh dashboard
            onClose(); // Close modal
            return;
          } else {
            console.log('[TrialSignup] Subscription not active yet, continuing to poll...');
          }
        } else {
          console.error('[TrialSignup] Subscription check failed:', response.status);
        }

        // Continue polling if not found yet
        attempts++;
        if (attempts >= maxAttempts) {
          // Timeout after 5 minutes
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setWaitingForPayment(false);
          setError('Subscription activation timed out. Please refresh the page or contact support.');
        }
      } catch (err) {
        console.error('Error checking subscription:', err);
        // Continue polling on error
        attempts++;
        if (attempts >= maxAttempts) {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setWaitingForPayment(false);
          setError('Failed to detect subscription. Please refresh the page.');
        }
      }
    };

    // Start immediate check
    checkSubscription();

    // Then poll every 2 seconds
    pollingIntervalRef.current = window.setInterval(checkSubscription, interval);
  };

  const handleStartSubscription = async () => {
    setStarting(true);
    setError(null);

    try {
      // Create Stripe checkout session
      const response = await fetch('https://roguegrid9-coordinator.fly.dev/api/v1/relay/checkout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          location: selectedLocation,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create checkout session');
      }

      const data = await response.json();

      if (data.url) {
        // Open Stripe checkout in browser
        console.log('[TrialSignup] Opening Stripe checkout:', data.url);
        await open(data.url);

        // Start polling for subscription activation
        console.log('[TrialSignup] Checkout opened, starting polling...');
        setWaitingForPayment(true);
        setStarting(false);
        startPollingForSubscription();
      } else if (data.message) {
        // Stripe not configured, subscription created directly
        onStarted();
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStarting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4">
        <div className="rounded-xl border border-white/10 bg-[#111319] shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-white/10">
            <div>
              <h2 className="text-xl font-semibold text-white">Subscribe to Pro</h2>
              <p className="text-sm text-white/60 mt-1">Get unlimited relay access</p>
            </div>
            <button
              onClick={onClose}
              disabled={starting}
              className="rounded-lg p-1.5 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-5">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {waitingForPayment && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 flex items-start gap-3">
                <Spinner className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-blue-400 font-medium">Waiting for payment completion...</p>
                  <p className="text-xs text-blue-400/70 mt-1">
                    Complete your payment in the browser. This will update automatically.
                  </p>
                </div>
              </div>
            )}

            {/* Location Selector */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-white/80">
                Select Server Location
              </label>
              <div className="space-y-2">
                {LOCATIONS.map(location => (
                  <button
                    key={location.id}
                    onClick={() => setSelectedLocation(location.id)}
                    disabled={starting || waitingForPayment}
                    className={`w-full flex items-center gap-4 p-3 rounded-lg border transition-all disabled:opacity-50 ${
                      selectedLocation === location.id
                        ? 'border-[#FF8A00] bg-gradient-to-r from-[#FF8A00]/10 to-[#FF3D00]/10'
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                  >
                    <span className="text-2xl">{location.flag}</span>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium text-white">{location.name}</div>
                      <div className="text-xs text-white/50">{location.description}</div>
                    </div>
                    {selectedLocation === location.id && (
                      <CheckCircle className="w-4 h-4 text-[#FF8A00]" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment Notice */}
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
              <div className="flex items-start gap-3">
                <CreditCard className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-blue-300 font-medium mb-1">
                    Payment processing via Stripe
                  </p>
                  <p className="text-xs text-blue-300/70">
                    Your subscription will be billed monthly. Cancel anytime from settings.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-white/10 p-6 flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={starting || waitingForPayment}
              className="px-4 py-2 text-white/60 hover:text-white transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleStartSubscription}
              disabled={starting || waitingForPayment}
              className="px-6 py-2.5 bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] hover:from-[#FF9A10] hover:to-[#FF4D10] disabled:from-gray-700 disabled:to-gray-700 text-white rounded-lg transition-all flex items-center gap-2 font-medium disabled:opacity-50"
            >
              {starting ? (
                <>
                  <Spinner className="w-4 h-4" />
                  <span>Processing...</span>
                </>
              ) : waitingForPayment ? (
                <>
                  <Spinner className="w-4 h-4" />
                  <span>Waiting for Payment...</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  <span>Continue to Payment</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
