import { useState, useRef, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';

interface StripeCheckoutModalProps {
  token: string;
  location?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function StripeCheckoutModal({
  token,
  location = 'us-east',
  isOpen,
  onClose,
  onSuccess,
}: StripeCheckoutModalProps) {
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Fetch checkout URL when modal opens
  useEffect(() => {
    if (isOpen && !checkoutUrl) {
      fetchCheckoutUrl();
    }
  }, [isOpen]);

  // Poll for subscription activation
  const startPollingForSubscription = () => {
    console.log('[StripeCheckout] Starting subscription polling...');
    let attempts = 0;
    const maxAttempts = 150; // 5 minutes at 2 second intervals

    const checkSubscription = async () => {
      console.log(`[StripeCheckout] Polling attempt ${attempts + 1}/${maxAttempts}`);
      try {
        const response = await fetch(
          'https://roguegrid9-coordinator.fly.dev/api/v1/relay/subscription',
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          console.log('[StripeCheckout] Subscription response:', data);

          // Check if subscription is active
          if (data.subscription && data.subscription.status === 'active') {
            // Success! Clear polling and notify parent
            console.log('[StripeCheckout] Subscription active! Closing modal.');
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }

            onSuccess();
            onClose();
            return;
          }
        }

        // Continue polling if not found yet
        attempts++;
        if (attempts >= maxAttempts) {
          // Timeout after 5 minutes
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setError('Subscription activation timed out. Please refresh the page or contact support.');
        }
      } catch (err) {
        console.error('Error checking subscription:', err);
        attempts++;
        if (attempts >= maxAttempts) {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setError('Failed to detect subscription. Please refresh the page.');
        }
      }
    };

    // Start immediate check
    checkSubscription();

    // Then poll every 2 seconds
    pollingIntervalRef.current = window.setInterval(checkSubscription, 2000);
  };

  const fetchCheckoutUrl = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        'https://roguegrid9-coordinator.fly.dev/api/v1/relay/checkout',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            location,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create checkout session');
      }

      const data = await response.json();

      if (data.url) {
        setCheckoutUrl(data.url);
        setLoading(false);

        // Start polling for subscription activation
        startPollingForSubscription();
      } else if (data.message) {
        // Stripe not configured, subscription created directly
        onSuccess();
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop - Pure black OLED */}
      <div
        className="absolute inset-0 bg-black/95 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full h-full max-w-6xl max-h-[90vh] m-8 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 bg-bg-surface border border-border rounded-t-lg">
          <div>
            <h2 className="text-xl font-heading font-semibold text-text-primary">
              Complete Your Purchase
            </h2>
            <p className="text-sm text-text-secondary mt-1">
              Secure payment powered by Stripe
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 bg-bg-primary border-x border-border relative overflow-hidden">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg-primary">
              <div className="text-center">
                <Loader2 className="w-12 h-12 text-accent-solid animate-spin mx-auto mb-4" />
                <p className="text-text-secondary">Loading checkout...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg-primary">
              <div className="text-center max-w-md px-6">
                <div className="bg-error/10 border border-error/20 rounded-lg p-6">
                  <p className="text-error text-sm">{error}</p>
                  <button
                    onClick={onClose}
                    className="mt-4 px-4 py-2 bg-bg-surface border border-border rounded-lg text-text-primary hover:bg-bg-hover transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {checkoutUrl && !error && (
            <iframe
              ref={iframeRef}
              src={checkoutUrl}
              className="w-full h-full border-0"
              title="Stripe Checkout"
              onLoad={() => setLoading(false)}
            />
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-bg-surface border border-t-0 border-border rounded-b-lg">
          <p className="text-xs text-text-tertiary text-center">
            Your payment information is processed securely by Stripe. We never see your card details.
          </p>
        </div>
      </div>
    </div>
  );
}
