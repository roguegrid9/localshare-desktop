import { useState, useEffect } from 'react';
import { Settings, CheckCircle, AlertCircle, FileText, Search, Radio, Rocket, Lock, Monitor, Cloud, HelpCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { cn } from '../../lib/utils';
import type {
  ProcessConfigModalProps,
  SimpleProcessConfig,
  DetectedProcess,
  ValidationError
} from '../../types/process';
import { detectProtocol } from '../../utils/protocolDetection';

// Generate default name based on detected process
function generateDefaultName(detected: DetectedProcess): string {
  const command = detected.command.toLowerCase();
  
  // Development servers
  if (command.includes('npm run dev') || command.includes('yarn dev')) {
    return 'Dev Server';
  }
  
  if (command.includes('vite')) {
    return 'Vite Server';
  }
  
  if (command.includes('webpack')) {
    return 'Webpack Server';
  }
  
  // Python servers
  if (command.includes('manage.py runserver')) {
    return 'Django Server';
  }
  
  if (command.includes('flask run')) {
    return 'Flask Server';
  }
  
  if (command.includes('uvicorn') || command.includes('fastapi')) {
    return 'FastAPI Server';
  }
  
  // Game servers
  if (command.includes('server.jar')) {
    return 'Minecraft Server';
  }
  
  if (command.includes('terraria')) {
    return 'Terraria Server';
  }
  
  // Databases
  if (detected.name === 'postgres') {
    return 'PostgreSQL Database';
  }
  
  if (detected.name === 'mysql') {
    return 'MySQL Database';
  }
  
  if (detected.name === 'redis-server') {
    return 'Redis Database';
  }
  
  // Fallback
  return `${detected.name} (Port ${detected.port})`;
}

// Validate process configuration
function validateProcessConfig(config: SimpleProcessConfig): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // Name validation
  if (!config.name.trim()) {
    errors.push({ field: 'name', message: 'Process name is required' });
  }
  
  if (config.name.length > 255) {
    errors.push({ field: 'name', message: 'Process name must be less than 255 characters' });
  }
  
  // Description validation
  if (config.description && config.description.length > 5000) {
    errors.push({ field: 'description', message: 'Description must be less than 5000 characters' });
  }
  
  return errors;
}

interface SectionProps {
  title: string | React.ReactNode;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-text-primary">{title}</h3>
      {children}
    </div>
  );
}

interface InfoItemProps {
  label: string;
  value: string | number;
}

function InfoItem({ label, value }: InfoItemProps) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-border">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-sm text-text-primary font-mono">{value}</span>
    </div>
  );
}

interface InfoBoxProps {
  variant: 'success' | 'info';
  children: React.ReactNode;
}

function InfoBox({ variant, children }: InfoBoxProps) {
  const baseClasses = "p-3 rounded-lg border text-sm";
  const variantClasses = {
    success: "bg-success/10 border-success/20 text-success",
    info: "bg-info/10 border-info/20 text-info"
  };

  return (
    <div className={cn(baseClasses, variantClasses[variant])}>
      {children}
    </div>
  );
}

function ComingSoonBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-lg border border-border bg-bg-muted space-y-3">
      {children}
    </div>
  );
}

function ComingSoonItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm text-text-secondary flex items-center gap-2">
      {children}
    </div>
  );
}

function LearnMoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        // TODO: Implement proper link handling for Tauri
        console.log('Navigate to:', href);
      }}
      className="text-sm text-accent-solid hover:opacity-hover transition-colors inline-flex items-center gap-1"
    >
      {children}
      <HelpCircle className="w-3 h-3" />
    </button>
  );
}

export default function ProcessConfigModal({
  detectedProcess,
  gridId,
  onSuccess,
  onCancel
}: ProcessConfigModalProps) {

  // Auto-detect protocol based on port and process information
  const detectedProtocolInfo = detectProtocol(
    detectedProcess.port,
    detectedProcess.name,
    detectedProcess.command
  );

  const [config, setConfig] = useState<SimpleProcessConfig>({
    name: generateDefaultName(detectedProcess),
    description: '',
    pid: detectedProcess.pid,
    port: detectedProcess.port,
    command: detectedProcess.command,
    working_dir: detectedProcess.working_dir,
    executable_path: detectedProcess.executable_path,
    process_name: detectedProcess.name,
    service_type: detectedProcess.service_type || detectedProtocolInfo.service_type,
    protocol: detectedProcess.protocol || detectedProtocolInfo.protocol,
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  
  // Clear errors when fields change
  useEffect(() => {
    setErrors([]);
    setSubmitError(null);
  }, [config.name, config.description]);
  
  const getFieldError = (field: string) => {
    return errors.find(err => err.field === field)?.message;
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    const validationErrors = validateProcessConfig(config);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    
    setIsSubmitting(true);
    setErrors([]);
    setSubmitError(null);
    
    try {
      // Create process via Tauri command (this will handle both local state and API calls)
      const processId = await invoke<string>('create_shared_process', {
        gridId,
        config
      });

      // Auto-host the grid to make the process connectable
      try {
        await invoke('auto_host_grid', { gridId });
        console.log('Grid auto-hosted after process creation');
      } catch (error) {
        console.warn('Failed to auto-host grid:', error);
      }

      setSubmitSuccess(true);

      // Show success briefly then call onSuccess
      setTimeout(() => {
        onSuccess(processId);
      }, 1000);
    } catch (err) {
      console.error('Failed to create process:', err);
      setSubmitError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden p-0">
        <DialogHeader className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg border border-border bg-bg-muted flex items-center justify-center">
              <Settings className="w-5 h-5 text-text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">Configure Process</DialogTitle>
              <DialogDescription>Set up sharing for your process</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-120px)]">
            <div className="p-6 space-y-6">
              {/* Process Information Section */}
              <Section title={<div className="flex items-center gap-2"><FileText className="w-4 h-4" />Process Information</div>}>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name" className="mb-2">
                      Process Name <span className="text-error">*</span>
                    </Label>
                    <Input
                      id="name"
                      type="text"
                      value={config.name}
                      onChange={(e) => setConfig({ ...config, name: e.target.value })}
                      placeholder="My Process"
                      required
                      autoFocus
                      className={cn(getFieldError('name') && "border-error")}
                    />
                    {getFieldError('name') && (
                      <p className="mt-1 text-sm text-error flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {getFieldError('name')}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="description" className="mb-2">
                      Description (optional)
                    </Label>
                    <textarea
                      id="description"
                      value={config.description}
                      onChange={(e) => setConfig({ ...config, description: e.target.value })}
                      placeholder="Describe what this process does..."
                      rows={3}
                      className={cn(
                        "flex w-full rounded-md border border-border bg-bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-solid focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-disabled resize-none",
                        getFieldError('description') && "border-error"
                      )}
                    />
                    {getFieldError('description') && (
                      <p className="mt-1 text-sm text-error flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {getFieldError('description')}
                      </p>
                    )}
                  </div>
                </div>
              </Section>
              
              {/* Detected Information Section */}
              <Section title={<div className="flex items-center gap-2"><Search className="w-4 h-4" />Detected Information</div>}>
                <div className="bg-bg-muted rounded-lg p-4 space-y-1">
                  <InfoItem label="Process" value={config.process_name} />
                  <InfoItem label="Port" value={config.port} />
                  <InfoItem label="PID" value={config.pid} />
                  <InfoItem label="Command" value={config.command} />
                  <InfoItem label="Directory" value={config.working_dir} />
                </div>
              </Section>
              
              {/* Sharing Section */}
              <Section title={<div className="flex items-center gap-2"><Radio className="w-4 h-4" />Sharing</div>}>
                <InfoBox variant="success">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    <div>
                      <div className="font-medium">P2P Network Sharing (Always Enabled)</div>
                      <div className="text-xs opacity-80 mt-1">Grid members can connect to this process</div>
                    </div>
                  </div>
                </InfoBox>
              </Section>
              
              {/* Coming Soon Section */}
              <Section title={<div className="flex items-center gap-2"><Rocket className="w-4 h-4" />Advanced Features (Coming Soon)</div>}>
                <ComingSoonBox>
                  <ComingSoonItem><Lock className="w-3 h-3" />Cloud Backups & AI Analysis</ComingSoonItem>
                  <ComingSoonItem><Monitor className="w-3 h-3" />Cross-Machine Deployment</ComingSoonItem>
                  <ComingSoonItem><Cloud className="w-3 h-3" />VPS Deployment Options</ComingSoonItem>
                  
                  <LearnMoreLink href="/features">
                    Learn More About Upcoming Features
                  </LearnMoreLink>
                </ComingSoonBox>
              </Section>

              {/* Error and Success Messages */}
              {submitError && (
                <div className="flex items-center gap-2 p-3 bg-error/10 border border-error/20 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-error" />
                  <span className="text-error text-sm flex-1">{submitError}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSubmitError(null)}
                    className="h-6 w-6 text-error hover:text-error"
                  >
                    <AlertCircle className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {submitSuccess && (
                <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/20 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-success" />
                  <span className="text-success text-sm">Process shared successfully!</span>
                </div>
              )}
            </div>

            <DialogFooter className="p-6 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="default"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Creating...' : 'Share Process'}
              </Button>
            </DialogFooter>
          </form>
      </DialogContent>
    </Dialog>
  );
}