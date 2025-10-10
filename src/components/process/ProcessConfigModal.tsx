import { useState, useEffect } from 'react';
import { X, Settings, CheckCircle, AlertCircle, Info, FileText, Search, Radio, Rocket, Lock, Monitor, Cloud, HelpCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { 
  ProcessConfigModalProps, 
  SimpleProcessConfig, 
  DetectedProcess,
  ValidationError 
} from '../../types/process';

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

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
      <h3 className="text-sm font-medium text-white/80">{title}</h3>
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
    <div className="flex justify-between items-center py-2 border-b border-white/5">
      <span className="text-sm text-white/60">{label}</span>
      <span className="text-sm text-white font-mono">{value}</span>
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
    success: "bg-green-500/10 border-green-500/20 text-green-400",
    info: "bg-blue-500/10 border-blue-500/20 text-blue-400"
  };
  
  return (
    <div className={cx(baseClasses, variantClasses[variant])}>
      {children}
    </div>
  );
}

function ComingSoonBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-lg border border-white/10 bg-white/5 space-y-3">
      {children}
    </div>
  );
}

function ComingSoonItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm text-white/60 flex items-center gap-2">
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
      className="text-sm text-orange-400 hover:text-orange-300 transition-colors inline-flex items-center gap-1"
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
  
  const [config, setConfig] = useState<SimpleProcessConfig>({
    name: generateDefaultName(detectedProcess),
    description: '',
    pid: detectedProcess.pid,
    port: detectedProcess.port,
    command: detectedProcess.command,
    working_dir: detectedProcess.working_dir,
    executable_path: detectedProcess.executable_path,
    process_name: detectedProcess.name,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-2xl mx-4">
        <div className="rounded-xl border border-white/10 bg-[#111319] shadow-2xl max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] flex items-center justify-center">
                <Settings className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Configure Process</h2>
                <p className="text-sm text-white/60">Set up sharing for your process</p>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="rounded-lg p-1 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-120px)]">
            <div className="p-6 space-y-6">
              {/* Process Information Section */}
              <Section title={<div className="flex items-center gap-2"><FileText className="w-4 h-4" />Process Information</div>}>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-white/80 mb-2">
                      Process Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="name"
                      type="text"
                      value={config.name}
                      onChange={(e) => setConfig({ ...config, name: e.target.value })}
                      placeholder="My Process"
                      required
                      autoFocus
                      className={cx(
                        "w-full px-3 py-2 bg-white/5 border rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-colors",
                        getFieldError('name') ? "border-red-500/50" : "border-white/10"
                      )}
                    />
                    {getFieldError('name') && (
                      <p className="mt-1 text-sm text-red-400 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {getFieldError('name')}
                      </p>
                    )}
                  </div>
                  
                  <div>
                    <label htmlFor="description" className="block text-sm font-medium text-white/80 mb-2">
                      Description (optional)
                    </label>
                    <textarea
                      id="description"
                      value={config.description}
                      onChange={(e) => setConfig({ ...config, description: e.target.value })}
                      placeholder="Describe what this process does..."
                      rows={3}
                      className={cx(
                        "w-full px-3 py-2 bg-white/5 border rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-colors resize-none",
                        getFieldError('description') ? "border-red-500/50" : "border-white/10"
                      )}
                    />
                    {getFieldError('description') && (
                      <p className="mt-1 text-sm text-red-400 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {getFieldError('description')}
                      </p>
                    )}
                  </div>
                </div>
              </Section>
              
              {/* Detected Information Section */}
              <Section title={<div className="flex items-center gap-2"><Search className="w-4 h-4" />Detected Information</div>}>
                <div className="bg-white/5 rounded-lg p-4 space-y-1">
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
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <span className="text-red-300 text-sm flex-1">{submitError}</span>
                  <button
                    onClick={() => setSubmitError(null)}
                    className="text-red-400 hover:text-red-300 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {submitSuccess && (
                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-green-300 text-sm">Process shared successfully!</span>
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-white/10 bg-white/5">
              <button
                type="button"
                onClick={onCancel}
                disabled={isSubmitting}
                className="px-4 py-2 text-white/60 hover:text-white transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] text-white font-medium rounded-lg hover:shadow-lg transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Creating...' : 'Share Process'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}