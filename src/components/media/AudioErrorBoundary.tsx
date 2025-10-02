// src/components/media/AudioErrorBoundary.tsx - Error boundary for audio system failures
import { useState, useEffect } from 'react';
import type { ReactNode, ComponentType } from 'react';
import { listen } from '@tauri-apps/api/event';
import { AlertTriangle, RefreshCw, Settings } from 'lucide-react';
import type { MediaManagerError } from '../../types/media';

interface AudioErrorBoundaryProps {
  children: ReactNode;
  fallback?: ComponentType<{ error: string; suggestion?: string; onRetry?: () => void }>;
}

interface AudioUnavailableStateProps {
  message?: string;
  error?: string;
  suggestion?: string;
  onRetry?: () => void;
  className?: string;
}

// Default fallback component for audio unavailable state
export const AudioUnavailableState = ({ 
  message, 
  error, 
  suggestion, 
  onRetry,
  className = '' 
}: AudioUnavailableStateProps) => {
  return (
    <div className={`flex flex-col items-center justify-center p-6 rounded-lg bg-orange-500/10 border border-orange-500/20 ${className}`}>
      <AlertTriangle className="w-12 h-12 text-orange-400 mb-4" />
      
      <h3 className="text-lg font-medium text-orange-300 mb-2">
        Audio System Unavailable
      </h3>
      
      <p className="text-sm text-orange-200/80 text-center mb-4 max-w-md">
        {message || error || 'The audio system is temporarily unavailable'}
      </p>
      
      {suggestion && (
        <p className="text-xs text-orange-200/60 text-center mb-4 max-w-md">
          Suggestion: {suggestion}
        </p>
      )}
      
      <div className="flex gap-2">
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500/20 border border-orange-500/30 text-orange-300 hover:bg-orange-500/30 transition-colors text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        )}
        
        <button
          onClick={() => {
            // Could open system audio settings or show help
            console.log('Open audio settings help');
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 transition-colors text-sm"
        >
          <Settings className="w-4 h-4" />
          Help
        </button>
      </div>
      
      <div className="mt-4 p-3 rounded bg-white/5 border border-white/10">
        <p className="text-xs text-white/50 text-center">
          Voice channels will use browser audio as fallback
        </p>
      </div>
    </div>
  );
};

// Error boundary component that listens for backend errors
export const AudioErrorBoundary = ({ 
  children, 
  fallback: FallbackComponent = AudioUnavailableState 
}: AudioErrorBoundaryProps) => {
  const [hasError, setHasError] = useState(false);
  const [errorInfo, setErrorInfo] = useState<{
    error: string;
    suggestion?: string;
  } | null>(null);

  // Listen for media manager errors from Tauri backend
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    
    const setupErrorListener = async () => {
      try {
        unlisten = await listen<MediaManagerError>('media_manager_error', (event) => {
          console.error('Media manager error caught by boundary:', event.payload);
          
          setHasError(true);
          setErrorInfo({
            error: event.payload.error,
            suggestion: event.payload.suggestion
          });
        });
      } catch (error) {
        console.warn('Failed to set up audio error listener:', error);
      }
    };
    
    setupErrorListener();
    
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Retry function to reset error state
  const handleRetry = () => {
    setHasError(false);
    setErrorInfo(null);
    // Could also trigger re-initialization of audio system here
  };

  if (hasError && errorInfo) {
    return (
      <FallbackComponent 
        error={errorInfo.error}
        suggestion={errorInfo.suggestion}
        onRetry={handleRetry}
      />
    );
  }

  return <>{children}</>;
};

// Compact audio status indicator for minimal UI space
export const AudioStatusIndicator = ({ 
  available, 
  error, 
  className = '' 
}: { 
  available: boolean; 
  error?: string; 
  className?: string;
}) => {
  if (available) {
    return (
      <div className={`flex items-center gap-1 text-green-400 ${className}`}>
        <div className="w-2 h-2 bg-green-400 rounded-full" />
        <span className="text-xs">Audio Ready</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1 text-orange-400 ${className}`}>
      <AlertTriangle className="w-3 h-3" />
      <span className="text-xs" title={error}>
        Audio Limited
      </span>
    </div>
  );
};

// Hook to use audio error boundary state
export const useAudioErrorState = () => {
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    
    const setupListener = async () => {
      try {
        unlisten = await listen<MediaManagerError>('media_manager_error', (event) => {
          setHasError(true);
          setErrorMessage(event.payload.error);
        });
      } catch (error) {
        console.warn('Failed to set up error listener:', error);
      }
    };
    
    setupListener();
    
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const clearError = () => {
    setHasError(false);
    setErrorMessage('');
  };

  return { hasError, errorMessage, clearError };
};