// VU Meter - Canvas-based audio level visualization
// Uses requestAnimationFrame for smooth 60fps animation (NOT setInterval)

import { useEffect, useRef } from "react";

interface VUMeterProps {
  level: number;            // 0..1
  speaking?: boolean;
  width?: number;           // px
  height?: number;          // px
  backgroundColor?: string;
  fillColor?: string;       // idle color
  speakingColor?: string;   // speaking color
  smoothing?: number;       // 0..1
  className?: string;
}

export function VUMeter({
  level,
  speaking = false,
  width = 32,
  height = 4,
  backgroundColor = "rgba(255, 255, 255, 0.1)",
  fillColor = "rgba(58, 175, 255, 0.6)",
  speakingColor = "rgba(34, 197, 94, 0.8)",
  smoothing = 0.3,
  className = "",
}: VUMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const currentLevelRef = useRef(0);
  const targetLevelRef = useRef(level);
  const speakingRef = useRef(speaking);

  // keep live values in refs (no re-init of RAF loop)
  useEffect(() => { targetLevelRef.current = level; }, [level]);
  useEffect(() => { speakingRef.current = speaking; }, [speaking]);

  // setup canvas sizing & (re)draw loop only when size/colors/smoothing change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // size for DPR
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // equivalent to scale, but resets first

    const draw = () => {
      // smooth towards target level
      const target = targetLevelRef.current;
      currentLevelRef.current += (target - currentLevelRef.current) * smoothing;
      const lvl = Math.max(0, Math.min(1, currentLevelRef.current));

      // clear + bg
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);

      // bar
      ctx.fillStyle = speakingRef.current ? speakingColor : fillColor;
      ctx.fillRect(0, 0, width * lvl, height);

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current != null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [width, height, backgroundColor, fillColor, speakingColor, smoothing]);

  return (
    <canvas
      ref={canvasRef}
      className={`rounded-full ${className}`}
      aria-hidden="true"  // decorative
    />
  );
}
