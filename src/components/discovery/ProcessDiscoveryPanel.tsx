import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, Monitor, Terminal, Server, Database, Globe, Gamepad2, ChevronDown, ChevronRight, AlertCircle, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { DetectedProcess, ScanScope } from '../../types/process';

interface ProcessDiscoveryPanelProps {
  onProcessSelect?: (process: DetectedProcess) => void;
  onCreateProcess?: (process: DetectedProcess) => void;
  className?: string;
}

export default function ProcessDiscoveryPanel({ 
  onProcessSelect, 
  onCreateProcess,
  className = ''
}: ProcessDiscoveryPanelProps) {
  // Remove unused props to fix TypeScript warnings
  const _ = { onProcessSelect };
  const [isScanning, setIsScanning] = useState(false);
  const [detectedProcesses, setDetectedProcesses] = useState<DetectedProcess[]>([]);
  const [scanScope, setScanScope] = useState<ScanScope>('Localhost');
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);

  // Auto-scan on mount
  useEffect(() => {
    performQuickScan();
  }, []);

  const performQuickScan = useCallback(async () => {
    setIsScanning(true);
    setError(null);
    
    try {
      const processes = await invoke<DetectedProcess[]>('quick_scan_processes');
      setDetectedProcesses(processes);
      setLastScanTime(new Date());
      console.log('Quick scan completed:', processes);
    } catch (err) {
      console.error('Quick scan failed:', err);
      setError(err as string);
    } finally {
      setIsScanning(false);
    }
  }, []);

  const performFullScan = useCallback(async () => {
    setIsScanning(true);
    setError(null);
    
    try {
      const processes = await invoke<DetectedProcess[]>('scan_processes', { 
        scope: scanScope 
      });
      setDetectedProcesses(processes);
      setLastScanTime(new Date());
      console.log('Full scan completed:', processes);
    } catch (err) {
      console.error('Full scan failed:', err);
      setError(err as string);
    } finally {
      setIsScanning(false);
    }
  }, [scanScope]);

  // Removed analyzeSpecificPort since we don't use re-analyze button anymore

  const getProcessIcon = (process: DetectedProcess) => {
    const name = process.name.toLowerCase();
    const command = process.command.toLowerCase();
    
    // Handle unknown processes (PID 0)
    if (process.pid === 0) {
      // Try to guess by port number
      if (process.port === 25565) return <Gamepad2 className="w-4 h-4 text-green-500" />;
      if (process.port === 7777) return <Gamepad2 className="w-4 h-4 text-blue-500" />;
      if (process.port === 80 || process.port === 443 || process.port === 8080) return <Globe className="w-4 h-4 text-orange-500" />;
      if (process.port === 3306 || process.port === 5432 || process.port === 6379) return <Database className="w-4 h-4 text-purple-500" />;
      if (process.port >= 3000 && process.port <= 9000) return <Globe className="w-4 h-4 text-yellow-500" />;
      return <Server className="w-4 h-4 text-gray-400" />;
    }
    
    if (name.includes('java') && (command.includes('minecraft') || process.port === 25565)) {
      return <Gamepad2 className="w-4 h-4 text-green-500" />;
    }
    if (name.includes('terraria') || process.port === 7777) {
      return <Gamepad2 className="w-4 h-4 text-blue-500" />;
    }
    if (name.includes('node') || command.includes('npm') || command.includes('yarn')) {
      return <Globe className="w-4 h-4 text-yellow-500" />;
    }
    if (name.includes('python') && (command.includes('runserver') || command.includes('flask'))) {
      return <Globe className="w-4 h-4 text-blue-400" />;
    }
    if (name.includes('postgres') || name.includes('mysql') || name.includes('redis')) {
      return <Database className="w-4 h-4 text-purple-500" />;
    }
    if (command.includes('serve') || command.includes('http')) {
      return <Server className="w-4 h-4 text-orange-500" />;
    }
    
    return <Terminal className="w-4 h-4 text-gray-400" />;
  };

  const getProcessDescription = (process: DetectedProcess) => {
    const name = process.name.toLowerCase();
    const command = process.command.toLowerCase();
    
    // Handle unknown processes (PID 0) - guess by port
    if (process.pid === 0) {
      if (process.port === 25565) return 'Minecraft Server (Guessed)';
      if (process.port === 7777) return 'Terraria Server (Guessed)';
      if (process.port === 80) return 'HTTP Server (Guessed)';
      if (process.port === 443) return 'HTTPS Server (Guessed)';
      if (process.port === 8080) return 'HTTP Alt Server (Guessed)';
      if (process.port === 3306) return 'MySQL Database (Guessed)';
      if (process.port === 5432) return 'PostgreSQL Database (Guessed)';
      if (process.port === 6379) return 'Redis Cache (Guessed)';
      if (process.port >= 3000 && process.port <= 9000) return 'Development Server (Guessed)';
      return process.name;
    }
    
    if (name.includes('java') && (command.includes('minecraft') || process.port === 25565)) {
      return 'Minecraft Server';
    }
    if (name.includes('terraria') || process.port === 7777) {
      return 'Terraria Server';
    }
    if (name.includes('node')) {
      if (command.includes('next')) return 'Next.js Development Server';
      if (command.includes('vite')) return 'Vite Development Server';
      if (command.includes('webpack')) return 'Webpack Dev Server';
      return 'Node.js Application';
    }
    if (name.includes('python')) {
      if (command.includes('manage.py')) return 'Django Application';
      if (command.includes('flask')) return 'Flask Application';
      if (command.includes('runserver')) return 'Python Web Server';
      return 'Python Application';
    }
    if (name.includes('postgres')) return 'PostgreSQL Database';
    if (name.includes('mysql')) return 'MySQL Database';
    if (name.includes('redis')) return 'Redis Cache';
    
    return process.name;
  };

  const handleProcessSelect = (process: DetectedProcess) => {
    // Directly trigger process configuration modal instead of showing buttons
    onCreateProcess?.(process);
  };

  // Removed handleCreateProcess since we handle it directly in handleProcessSelect

  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    
    if (diffSeconds < 60) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    return `${Math.floor(diffMinutes / 60)}h ago`;
  };

  return (
    <div className={`bg-white/5 border border-white/10 rounded-lg ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-white hover:text-white/80 transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          <Search className="w-4 h-4" />
          <span className="font-medium">Process Discovery</span>
          {detectedProcesses.length > 0 && (
            <span className="text-xs bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] text-white px-2 py-0.5 rounded-full">
              {detectedProcesses.length}
            </span>
          )}
        </button>
        
        <div className="flex items-center gap-2">
          {lastScanTime && (
            <span className="text-xs text-white/40" title={lastScanTime.toLocaleString()}>
              {formatRelativeTime(lastScanTime)}
            </span>
          )}
          <button
            onClick={performQuickScan}
            disabled={isScanning}
            className="p-1.5 rounded-lg bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-opacity"
            title="Quick scan common ports"
          >
            <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Scan Controls */}
          <div className="flex items-center gap-2">
            <select
              value={typeof scanScope === 'string' ? scanScope : 'Custom'}
              onChange={(e) => setScanScope(e.target.value as ScanScope)}
              className="px-3 py-2 bg-[#111319] border border-white/10 rounded-lg text-white text-sm focus:border-[#FF8A00] focus:outline-none focus:ring-1 focus:ring-[#FF8A00] disabled:opacity-50 appearance-none"
              style={{ 
                backgroundColor: '#111319',
                color: 'white'
              }}
              disabled={isScanning}
            >
              <option value="Localhost" className="bg-[#111319] text-white">Localhost</option>
              <option value="Docker" className="bg-[#111319] text-white">Docker Containers</option>
              <option value="Custom" className="bg-[#111319] text-white">Custom Range</option>
            </select>
            
            <button
              onClick={performFullScan}
              disabled={isScanning}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white text-sm transition-colors"
            >
              {isScanning ? 'Scanning...' : 'Full Scan'}
            </button>
          </div>

          {/* Error Display */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span className="text-red-300 text-sm flex-1">{error}</span>
              <button
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Loading State */}
          {isScanning && (
            <div className="flex items-center justify-center gap-2 p-6 text-white/60">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>Scanning for processes...</span>
            </div>
          )}

          {/* Process List */}
          {!isScanning && detectedProcesses.length > 0 && (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {detectedProcesses.map((process) => (
                <div
                  key={`${process.pid}-${process.port}`}
                  className="p-3 border border-white/10 bg-white/5 hover:bg-white/10 rounded-lg cursor-pointer transition-all"
                  onClick={() => handleProcessSelect(process)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      {getProcessIcon(process)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-white truncate">
                            {getProcessDescription(process)}
                          </span>
                          <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded">
                            Port {process.port}
                          </span>
                          {process.pid > 0 ? (
                            <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded">
                              PID {process.pid}
                            </span>
                          ) : (
                            <span className="text-xs bg-yellow-600/20 text-yellow-400 px-2 py-0.5 rounded" title="Process owned by another user">
                              No Access
                            </span>
                          )}
                        </div>
                        
                        <div className="text-sm text-white/60 mb-2">
                          <div className="truncate">{process.command}</div>
                          <div className="text-xs text-white/40 mt-1">
                            {process.working_dir}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isScanning && detectedProcesses.length === 0 && (
            <div className="text-center py-8 text-white/40">
              <Monitor className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm mb-2">No processes detected</p>
              <p className="text-xs text-white/30">
                Run a scan to discover processes running on your system
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}