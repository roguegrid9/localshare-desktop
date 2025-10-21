import React from 'react';
import { Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
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
  const handleProcessSelect = (process: DetectedProcess) => {
    // No longer need to track selected process since we go directly to config modal
    console.log('Legacy handleProcessSelect:', process);
  };

  const handleCreateProcess = (process: DetectedProcess) => {
    onCreateProcess?.(process);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden p-0">
        <DialogHeader className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg border border-border bg-bg-muted flex items-center justify-center">
              <Search className="w-5 h-5 text-text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">Discover Processes</DialogTitle>
              <DialogDescription>Find and share running processes</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 overflow-y-auto max-h-[calc(85vh-120px)]">
          <ProcessDiscoveryPanel
            onProcessSelect={handleProcessSelect}
            onCreateProcess={handleCreateProcess}
            className="border-0 bg-transparent rounded-none"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}