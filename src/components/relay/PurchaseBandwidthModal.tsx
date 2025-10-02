// Purchase Bandwidth Modal Component
import { useState } from 'react';
import { X, AlertCircle, CheckCircle } from 'lucide-react';
import { purchaseGridBandwidth, type PaymentIntent } from '../../utils/gridRelay';

interface PurchaseBandwidthModalProps {
  gridId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function PurchaseBandwidthModal({ gridId, isOpen, onClose, onSuccess }: PurchaseBandwidthModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentIntent, setPaymentIntent] = useState<PaymentIntent | null>(null);

  if (!isOpen) return null;

  const handlePurchase = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      const intent = await purchaseGridBandwidth(
        gridId,
        100, // 100 GB
        1    // 1 month
      );

      setPaymentIntent(intent);
      console.log('Payment intent created:', intent);

      // Build Stripe Checkout URL
      // In test mode, Stripe checkout URLs follow this pattern:
      // https://checkout.stripe.com/c/pay/{CLIENT_SECRET}
      const stripeCheckoutUrl = `https://checkout.stripe.com/c/pay/${intent.client_secret}`;

      console.log('Redirecting to Stripe:', stripeCheckoutUrl);

      // Show success message before redirect
      setTimeout(() => {
        // Redirect to Stripe Checkout
        window.location.href = stripeCheckoutUrl;
      }, 1000);

    } catch (err) {
      const errorStr = err instanceof Error ? err.message : String(err);

      // Check if relay service is not configured
      if (errorStr.includes('404')) {
        setError('Relay service is not configured on this server. Please contact your administrator to enable relay bandwidth purchases.');
      } else {
        setError(errorStr || 'Failed to create payment');
      }

      console.error('Purchase failed:', err);
      setIsProcessing(false);
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
      <div className="relative bg-[#111319] rounded-xl border border-white/10 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-xl font-semibold text-white">Purchase Bandwidth</h2>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Bandwidth Package Display */}
          <div className="p-6 bg-[#0B0D10] rounded-xl border border-[#FF8A00]/30">
            <div className="text-center">
              <div className="text-3xl font-bold text-white mb-2">100 GB</div>
              <div className="text-white/60 text-sm mb-4">Relay Bandwidth</div>
              <div className="text-4xl font-bold text-[#FF8A00]">$5</div>
              <div className="text-white/40 text-sm mt-1">per month</div>
            </div>
          </div>

          {/* Info */}
          <div className="flex items-start gap-2 p-3 bg-blue-900/20 border border-blue-500/30 rounded text-sm text-blue-400">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium">About Relay Bandwidth</div>
              <div className="text-blue-400/70 mt-1">
                Relay bandwidth is only used when direct P2P connection fails. Most connections
                use P2P and don't consume relay bandwidth.
              </div>
            </div>
          </div>

          {/* Success message */}
          {paymentIntent && (
            <div className="flex items-start gap-2 p-3 bg-green-900/20 border border-green-500/30 rounded text-sm text-green-400">
              <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                Payment intent created! Redirecting to payment...
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-900/20 border border-red-500/30 rounded text-sm text-red-400">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>{error}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-white/10">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-white/60 hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handlePurchase}
            disabled={isProcessing}
            className="px-6 py-2 bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] text-white rounded-xl font-medium transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? 'Processing...' : 'Purchase for $5'}
          </button>
        </div>
      </div>
    </div>
  );
}
