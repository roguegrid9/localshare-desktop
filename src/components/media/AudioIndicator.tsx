// src/components/media/AudioIndicator.tsx - Speaking/mute visual indicators
import { useState, useEffect } from 'react';
import type { AudioVisualizationData } from '../../types/media';

interface AudioIndicatorProps {
  audioEnabled: boolean;
  muted: boolean;
  speaking: boolean;
  audioLevel?: number;
  size?: 'sm' | 'md' | 'lg';
  showLevel?: boolean;
  className?: string;
}

interface AudioLevelBarProps {
  level: number;
  size: 'sm' | 'md' | 'lg';
  speaking: boolean;
}

const AudioLevelBar = ({ level, size, speaking }: AudioLevelBarProps) => {
  const barCount = size === 'sm' ? 3 : size === 'md' ? 5 : 7;
  const bars = Array.from({ length: barCount }, (_, i) => i);
  
  const getBarHeight = () => {
    switch (size) {
      case 'sm': return 'h-2';
      case 'lg': return 'h-4';
      default: return 'h-3';
    }
  };
  
  const getBarWidth = () => {
    switch (size) {
      case 'sm': return 'w-0.5';
      case 'lg': return 'w-1';
      default: return 'w-0.5';
    }
  };
  
  const activeBarCount = Math.ceil(level * barCount);
  
  return (
    <div className="flex items-end gap-0.5">
      {bars.map((i) => {
        const isActive = i < activeBarCount;
        const barIntensity = (i + 1) / barCount;
        
        return (
          <div
            key={i}
            className={`
              ${getBarWidth()} ${getBarHeight()} rounded-sm transition-all duration-75
              ${isActive 
                ? speaking
                  ? barIntensity < 0.5 
                    ? 'bg-green-400' 
                    : barIntensity < 0.8 
                      ? 'bg-yellow-400' 
                      : 'bg-red-400'
                  : 'bg-green-400/70'
                : 'bg-white/20'
              }
            `}
            style={{
              height: isActive ? undefined : '2px'
            }}
          />
        );
      })}
    </div>
  );
};

export default function AudioIndicator({
  audioEnabled,
  muted,
  speaking,
  audioLevel = 0,
  size = 'md',
  showLevel = true,
  className = ''
}: AudioIndicatorProps) {
  const [animatedLevel, setAnimatedLevel] = useState(0);
  
  // Smooth audio level animation
  useEffect(() => {
    if (!audioEnabled) {
      setAnimatedLevel(0);
      return;
    }
    
    const targetLevel = muted ? 0 : audioLevel;
    const animationFrame = requestAnimationFrame(() => {
      setAnimatedLevel(prev => {
        const diff = targetLevel - prev;
        const step = diff * 0.3; // Smooth interpolation
        return Math.abs(step) < 0.001 ? targetLevel : prev + step;
      });
    });
    
    return () => cancelAnimationFrame(animationFrame);
  }, [audioLevel, audioEnabled, muted]);
  
  // Get icon size classes
  const getIconSize = () => {
    switch (size) {
      case 'sm': return 'w-3 h-3';
      case 'lg': return 'w-5 h-5';
      default: return 'w-4 h-4';
    }
  };
  
  // Get container size classes
  const getContainerSize = () => {
    switch (size) {
      case 'sm': return 'w-6 h-6';
      case 'lg': return 'w-10 h-10';
      default: return 'w-8 h-8';
    }
  };
  
  // Get speaking animation classes
  const getSpeakingClasses = () => {
    if (!audioEnabled || muted) return '';
    
    if (speaking && animatedLevel > 0.1) {
      return 'animate-pulse border-green-400/50 bg-green-500/20';
    }
    
    return '';
  };
  
  const iconSize = getIconSize();
  const containerSize = getContainerSize();
  const speakingClasses = getSpeakingClasses();
  
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Main audio indicator */}
      <div className={`
        ${containerSize} rounded-full border flex items-center justify-center transition-all duration-200
        ${!audioEnabled 
          ? 'bg-red-500/20 border-red-500/30 text-red-300'
          : muted
            ? 'bg-orange-500/20 border-orange-500/30 text-orange-300'
            : `bg-white/10 border-white/20 text-white/70 ${speakingClasses}`
        }
      `}>
        {!audioEnabled ? (
          // Audio disabled icon
          <svg className={iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-3a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
        ) : muted ? (
          // Muted icon
          <svg className={iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-3a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
        ) : speaking && animatedLevel > 0.05 ? (
          // Speaking with sound waves
          <svg className={iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-3a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
        ) : (
          // Normal microphone icon
          <svg className={iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        )}
      </div>
      
      {/* Audio level visualization */}
      {showLevel && audioEnabled && !muted && (
        <AudioLevelBar 
          level={animatedLevel} 
          size={size} 
          speaking={speaking}
        />
      )}
      
      {/* Speaking indicator text (for larger sizes) */}
      {size === 'lg' && audioEnabled && !muted && speaking && animatedLevel > 0.1 && (
        <span className="text-xs text-green-400 font-medium">
          Speaking
        </span>
      )}
    </div>
  );
}

// Export additional components for standalone use
export const SimpleAudioIndicator = ({ 
  enabled, 
  muted, 
  speaking 
}: { 
  enabled: boolean; 
  muted: boolean; 
  speaking: boolean;
}) => (
  <AudioIndicator
    audioEnabled={enabled}
    muted={muted}
    speaking={speaking}
    size="sm"
    showLevel={false}
  />
);

export const AudioLevelIndicator = ({ 
  level, 
  speaking 
}: { 
  level: number; 
  speaking: boolean;
}) => (
  <AudioLevelBar level={level} size="md" speaking={speaking} />
);
