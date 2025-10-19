// src/components/terminal/PortSharingModal.tsx
import { useState } from 'react';
import { useTauriCommands } from '../../hooks/useTauriCommands';
import { toast } from '../ui/sonner';
import { Spinner } from '../ui/spinner';

interface PortSharingModalProps {
  isOpen: boolean;
  onClose: () => void;
  gridId: string;
  sessionId: string;
  sessionName?: string;
}

type TunnelType = 'http' | 'tcp';

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export default function PortSharingModal({
  isOpen,
  onClose,
  gridId,
  sessionId,
  sessionName
}: PortSharingModalProps) {
  const [port, setPort] = useState<string>('');
  const [tunnelType, setTunnelType] = useState<TunnelType>('http');
  const [serviceName, setServiceName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { createManualPortShare } = useTauriCommands();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!port || isNaN(Number(port))) {
      toast.error('Please enter a valid port number');
      return;
    }

    const portNumber = Number(port);
    if (portNumber < 1 || portNumber > 65535) {
      toast.error('Port must be between 1 and 65535');
      return;
    }

    try {
      setIsSubmitting(true);
      
      const shareId = await createManualPortShare(
        gridId,
        portNumber,
        tunnelType,
        serviceName || `${sessionName || 'Terminal'} - Port ${port}`
      );
      
      toast.success(`Port ${port} is now being shared!`);
      handleClose();
    } catch (error) {
      console.error('Failed to share port:', error);
      toast.error(`Failed to share port: ${error}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setPort('');
    setTunnelType('http');
    setServiceName('');
    setIsSubmitting(false);
    onClose();
  };

  const getTunnelTypeDescription = (type: TunnelType): string => {
    switch (type) {
      case 'http':
        return 'For web servers, APIs, and websites';
      case 'tcp':
        return 'For games, databases, and custom applications';
    }
  };

  const getTunnelTypeIcon = (type: TunnelType): string => {
    switch (type) {
      case 'http':
        return '🌐';
      case 'tcp':
        return '🔌';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-2xl border border-white/10 bg-[#0a0b0f] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 p-6">
          <div>
            <h2 className="text-xl font-semibold">Share a Port</h2>
            <p className="text-white/60 text-sm mt-1">
              Make a service running in this terminal accessible to grid members
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-lg p-2 text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Port Number */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Port Number <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="e.g., 3000, 8080, 25565"
              min="1"
              max="65535"
              required
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-orange-400/50 focus:border-orange-400 transition-colors"
            />
            <p className="mt-1 text-xs text-white/50">
              The port your service is listening on
            </p>
          </div>

          {/* Service Type */}
          <div>
            <label className="block text-sm font-medium text-white mb-3">
              What type of service is this?
            </label>
            <div className="space-y-2">
              {(['http', 'tcp'] as TunnelType[]).map((type) => (
                <label
                  key={type}
                  className={cx(
                    "flex items-center p-3 rounded-lg border cursor-pointer transition-colors",
                    tunnelType === type
                      ? "border-orange-400 bg-orange-500/10"
                      : "border-white/10 hover:border-white/20 hover:bg-white/5"
                  )}
                >
                  <input
                    type="radio"
                    name="tunnelType"
                    value={type}
                    checked={tunnelType === type}
                    onChange={(e) => setTunnelType(e.target.value as TunnelType)}
                    className="w-4 h-4 text-orange-500 bg-white/5 border-white/10 focus:ring-orange-400/50"
                  />
                  <div className="ml-3 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-white">
                      <span>{getTunnelTypeIcon(type)}</span>
                      <span className="capitalize">{type === 'http' ? 'Web Server' : 'Application'}</span>
                    </div>
                    <div className="text-xs text-white/60 mt-1">
                      {getTunnelTypeDescription(type)}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Service Name (Optional) */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Service Name <span className="text-white/50">(optional)</span>
            </label>
            <input
              type="text"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              placeholder={`${sessionName || 'Terminal'} - Port ${port || 'XXXX'}`}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-orange-400/50 focus:border-orange-400 transition-colors"
            />
            <p className="mt-1 text-xs text-white/50">
              A friendly name to help identify this service
            </p>
          </div>

          {/* Info Box */}
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-4">
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 text-blue-400 mt-0.5">
                <svg fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <div className="font-medium text-blue-300 mb-1">How it works</div>
                <div className="text-sm text-blue-200 space-y-1">
                  <p>• Grid members will get a shareable link to access your service</p>
                  <p>• Your service must be running on the specified port</p>
                  <p>• You can stop sharing anytime from the grid workspace</p>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            
            <button
              type="submit"
              disabled={isSubmitting || !port}
              className={cx(
                "px-6 py-2 rounded-lg font-medium transition-all",
                "bg-gradient-to-r from-orange-500 to-red-500 text-white",
                "hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-orange-400/50",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <Spinner className="h-4 w-4" />
                  <span>Sharing...</span>
                </div>
              ) : (
                'Share Port'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
