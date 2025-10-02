import React from 'react';
import { X, Search } from 'lucide-react';
import ProcessDiscoveryPanel from './ProcessDiscoveryPanel';
import type { DetectedProcess } from '../../types/process';

interface ProcessDiscoveryModalProps {
  open: boolean;
  onClose: () => void;
  onCreateProcess?: (process: DetectedProcess) => void;
}

export default function ProcessDiscoveryModal({
  open,
  onClose,
  onCreateProcess
}: ProcessDiscoveryModalProps) {
  // Removed selectedProcess state since we don't use it anymore with the simplified flow

  const handleProcessSelect = (process: DetectedProcess) => {
    // No longer need to track selected process since we go directly to config modal
    console.log('Legacy handleProcessSelect:', process);
  };

  const handleCreateProcess = (process: DetectedProcess) => {
    onCreateProcess?.(process);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-3xl mx-4">
        <div className="rounded-xl border border-white/10 bg-[#111319] shadow-2xl max-h-[85vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] flex items-center justify-center">
                <Search className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Discover Processes</h2>
                <p className="text-sm text-white/60">Find and share running processes</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(85vh-120px)]">
            <ProcessDiscoveryPanel
              onProcessSelect={handleProcessSelect}
              onCreateProcess={handleCreateProcess}
              className="border-0 bg-transparent rounded-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}