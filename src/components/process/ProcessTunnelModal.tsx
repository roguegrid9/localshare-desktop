import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Globe, CheckCircle2, AlertCircle, Loader2, Edit2, Trash2, ExternalLink, Copy } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { toast } from '../ui/sonner';

export interface ProcessTunnel {
  id: string;
  process_id: string;
  grid_id: string;
  subdomain: string;
  public_url: string;
  local_port: number;
  protocol: string;
  status: string;
  bandwidth_used: number;
  created_at: string;
}

interface ProcessTunnelModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  processId: string;
  gridId: string;
  processName: string;
  serviceType?: string;
  existingTunnel?: ProcessTunnel | null;
  onTunnelCreated?: (tunnel: ProcessTunnel) => void;
  onTunnelUpdated?: () => void;
  onTunnelDeleted?: () => void;
}

export function ProcessTunnelModal({
  isOpen,
  onClose,
  token,
  processId,
  gridId,
  processName,
  serviceType,
  existingTunnel,
  onTunnelCreated,
  onTunnelUpdated,
  onTunnelDeleted,
}: ProcessTunnelModalProps) {
  const [mode, setMode] = useState<'create' | 'edit' | 'view'>('create');
  const [subdomain, setSubdomain] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout>();

  // Determine mode based on existing tunnel
  useEffect(() => {
    if (existingTunnel) {
      setMode('view');
      setSubdomain(existingTunnel.subdomain);
    } else {
      setMode('create');
      // Auto-suggest subdomain from process name
      const suggested = sanitizeSubdomain(processName);
      setSubdomain(suggested);
    }
  }, [existingTunnel, processName, isOpen]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsValidating(false);
      setIsAvailable(null);
      setValidationError(null);
      setIsSubmitting(false);
      setIsDeleting(false);
      setCopied(false);
    }
  }, [isOpen]);

  // Sanitize subdomain input
  const sanitizeSubdomain = (input: string): string => {
    return input
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-')
      .slice(0, 32);
  };

  // Validate subdomain format
  const validateSubdomainFormat = (sub: string): string | null => {
    if (sub.length < 3) {
      return 'Subdomain must be at least 3 characters';
    }
    if (sub.length > 32) {
      return 'Subdomain must be at most 32 characters';
    }
    if (!/^[a-z0-9-]+$/.test(sub)) {
      return 'Only lowercase letters, numbers, and hyphens allowed';
    }
    if (sub.startsWith('-') || sub.endsWith('-')) {
      return 'Subdomain cannot start or end with a hyphen';
    }
    if (/--/.test(sub)) {
      return 'Subdomain cannot contain consecutive hyphens';
    }
    return null;
  };

  // Check subdomain availability (debounced)
  useEffect(() => {
    if (!subdomain || mode === 'view') return;

    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Validate format first
    const formatError = validateSubdomainFormat(subdomain);
    if (formatError) {
      setValidationError(formatError);
      setIsAvailable(null);
      return;
    }

    setValidationError(null);
    setIsValidating(true);

    // Debounce availability check
    debounceTimerRef.current = setTimeout(async () => {
      try {
        // For edit mode, if subdomain hasn't changed, skip check
        if (mode === 'edit' && existingTunnel && subdomain === existingTunnel.subdomain) {
          setIsAvailable(true);
          setIsValidating(false);
          return;
        }

        const available = await invoke<boolean>('check_tunnel_subdomain_availability', {
          token,
          subdomain,
        });
        setIsAvailable(available);
      } catch (error) {
        console.error('Failed to check subdomain availability:', error);
        setValidationError('Failed to check availability. Please try again.');
        setIsAvailable(null);
      } finally {
        setIsValidating(false);
      }
    }, 500);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [subdomain, mode, existingTunnel, token]);

  // Auto-detect protocol
  const getProtocol = (): string => {
    if (existingTunnel) return existingTunnel.protocol;
    if (serviceType === 'http') return 'https';
    return 'tcp';
  };

  // Get full URL preview
  const getUrlPreview = (): string => {
    const protocol = getProtocol();
    const domain = 'localshare.tech';
    if (protocol === 'https') {
      return `https://${subdomain}.${domain}`;
    }
    return `${subdomain}.${domain}`;
  };

  // Handle subdomain input change
  const handleSubdomainChange = (value: string) => {
    const sanitized = sanitizeSubdomain(value);
    setSubdomain(sanitized);
  };

  // Handle create tunnel
  const handleCreate = async () => {
    if (!subdomain || !isAvailable) return;

    setIsSubmitting(true);
    try {
      const tunnel = await invoke<ProcessTunnel>('create_process_tunnel', {
        token,
        processId,
        gridId,
        subdomain,
      });

      toast.success('Public tunnel created successfully!');
      onTunnelCreated?.(tunnel);
      onClose();
    } catch (error: any) {
      console.error('Failed to create tunnel:', error);
      const errorMsg = String(error);

      if (errorMsg.includes('subscription')) {
        toast.error('Paid relay subscription required to create public tunnels');
      } else if (errorMsg.includes('subdomain')) {
        toast.error('Subdomain is no longer available. Please try another.');
        setIsAvailable(false);
      } else {
        toast.error(`Failed to create tunnel: ${errorMsg}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle update tunnel
  const handleUpdate = async () => {
    if (!subdomain || !isAvailable || !existingTunnel) return;

    setIsSubmitting(true);
    try {
      await invoke('update_process_tunnel_subdomain', {
        token,
        processId,
        newSubdomain: subdomain,
      });

      toast.success('Tunnel subdomain updated successfully!');
      onTunnelUpdated?.();
      setMode('view');
    } catch (error: any) {
      console.error('Failed to update tunnel:', error);
      const errorMsg = String(error);

      if (errorMsg.includes('subdomain')) {
        toast.error('Subdomain is no longer available. Please try another.');
        setIsAvailable(false);
      } else {
        toast.error(`Failed to update tunnel: ${errorMsg}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle delete tunnel
  const handleDelete = async () => {
    if (!existingTunnel) return;

    if (!confirm('Are you sure you want to delete this public tunnel? This cannot be undone.')) {
      return;
    }

    setIsDeleting(true);
    try {
      await invoke('delete_process_tunnel', {
        token,
        processId,
      });

      toast.success('Public tunnel deleted successfully');
      onTunnelDeleted?.();
      onClose();
    } catch (error) {
      console.error('Failed to delete tunnel:', error);
      toast.error(`Failed to delete tunnel: ${error}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('URL copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      toast.error('Failed to copy URL');
    }
  };

  const handleClose = () => {
    if (!isSubmitting && !isDeleting) {
      onClose();
    }
  };

  const protocol = getProtocol();
  const isFormValid = subdomain && isAvailable && !validationError && !isValidating && !!token;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
              <Globe className="h-5 w-5 text-blue-400" />
            </div>
            {mode === 'create' ? 'Create Public Tunnel' :
             mode === 'edit' ? 'Edit Tunnel Subdomain' :
             'Public Tunnel'}
          </DialogTitle>
          <DialogDescription>{processName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Authentication Error */}
          {!token && mode !== 'view' && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4">
              <div className="flex gap-2 text-xs text-red-200/80">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium mb-1">Authentication Required</p>
                  <p>Please wait for authentication to complete before creating a tunnel.</p>
                </div>
              </div>
            </div>
          )}
          {/* Protocol Display */}
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-4">
            <div className="text-xs text-blue-300/80 mb-1">Protocol</div>
            <div className="text-sm font-mono text-blue-300">
              {protocol.toUpperCase()}
              {serviceType && (
                <span className="ml-2 text-xs text-blue-400/60">
                  (auto-detected from {serviceType})
                </span>
              )}
            </div>
          </div>

          {/* Subdomain Input (only in create/edit mode) */}
          {(mode === 'create' || mode === 'edit') && (
            <div className="space-y-2">
              <Label htmlFor="subdomain">
                Subdomain
                {mode === 'create' && (
                  <span className="text-muted-foreground ml-2">(3-32 characters)</span>
                )}
              </Label>
              <div className="relative">
                <Input
                  id="subdomain"
                  type="text"
                  value={subdomain}
                  onChange={(e) => handleSubdomainChange(e.target.value)}
                  placeholder="my-awesome-server"
                  className={
                    validationError ? "border-red-500/40 focus-visible:ring-red-500/60" :
                    isAvailable ? "border-green-500/40 focus-visible:ring-green-500/60" :
                    ""
                  }
                  disabled={isSubmitting}
                  maxLength={32}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  {isValidating && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />}
                  {!isValidating && isAvailable && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                  {!isValidating && isAvailable === false && <AlertCircle className="w-4 h-4 text-red-400" />}
                </div>
              </div>
              {validationError && (
                <p className="text-xs text-red-400">{validationError}</p>
              )}
              {!validationError && isAvailable === false && (
                <p className="text-xs text-red-400">This subdomain is already taken</p>
              )}
              {!validationError && isAvailable && (
                <p className="text-xs text-green-400">Subdomain is available!</p>
              )}
            </div>
          )}

          {/* URL Preview */}
          {subdomain && (mode === 'create' || mode === 'edit') && (
            <div className="rounded-lg border bg-muted p-4">
              <div className="text-xs text-muted-foreground mb-2">Public URL Preview</div>
              <code className="text-sm text-blue-300 font-mono break-all">
                {getUrlPreview()}
              </code>
            </div>
          )}

          {/* View Mode: Show existing tunnel details */}
          {mode === 'view' && existingTunnel && (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-green-300/80">Public URL</div>
                  <Badge variant="success" className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {existingTunnel.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-sm text-green-300 font-mono break-all flex-1">
                    {existingTunnel.public_url}
                  </code>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      onClick={() => handleCopyUrl(existingTunnel.public_url)}
                      size="sm"
                      variant="outline"
                      className="border-green-500/30 hover:bg-green-500/10"
                    >
                      {copied ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 mr-1" />
                          Copy
                        </>
                      )}
                    </Button>
                    {existingTunnel.protocol === 'https' && (
                      <Button
                        onClick={() => window.open(existingTunnel.public_url, '_blank')}
                        size="sm"
                        variant="outline"
                        className="border-green-500/30 hover:bg-green-500/10"
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-1" />
                        Open
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border bg-muted p-3">
                  <div className="text-xs text-muted-foreground mb-1">Subdomain</div>
                  <div className="text-sm font-mono">{existingTunnel.subdomain}</div>
                </div>
                <div className="rounded-lg border bg-muted p-3">
                  <div className="text-xs text-muted-foreground mb-1">Protocol</div>
                  <div className="text-sm uppercase">{existingTunnel.protocol}</div>
                </div>
              </div>
            </div>
          )}

          {/* Info Box */}
          {mode === 'create' && (
            <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
              <div className="flex gap-2 text-xs text-yellow-200/80">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium mb-1">Paid Subscription Required</p>
                  <p>Public tunnels require an active paid relay subscription. Free and trial accounts cannot create tunnels.</p>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            {mode === 'create' && (
              <>
                <Button
                  onClick={handleClose}
                  variant="outline"
                  className="flex-1"
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!isFormValid || isSubmitting}
                  className="flex-1"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Tunnel'
                  )}
                </Button>
              </>
            )}

            {mode === 'edit' && (
              <>
                <Button
                  onClick={() => {
                    setMode('view');
                    setSubdomain(existingTunnel?.subdomain || '');
                  }}
                  variant="outline"
                  className="flex-1"
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdate}
                  disabled={!isFormValid || isSubmitting}
                  className="flex-1"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Update Subdomain'
                  )}
                </Button>
              </>
            )}

            {mode === 'view' && (
              <>
                <Button
                  onClick={() => setMode('edit')}
                  variant="outline"
                  className="flex-1"
                  disabled={isDeleting}
                >
                  <Edit2 className="w-4 h-4 mr-2" />
                  Edit Subdomain
                </Button>
                <Button
                  onClick={handleDelete}
                  variant="destructive"
                  className="flex-1"
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Tunnel
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
