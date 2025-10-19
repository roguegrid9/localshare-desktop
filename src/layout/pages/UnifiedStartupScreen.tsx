import { useEffect, useState } from "react";
import { Radar } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export interface UnifiedStartupScreenProps {
  statusText?: string;
  progress?: number; // 0-100
}

const DEFAULT_MESSAGES = [
  "Initializing...",
  "Checking authentication...",
  "Setting up session...",
  "Preparing interface...",
];

export default function UnifiedStartupScreen({
  statusText,
  progress,
}: UnifiedStartupScreenProps) {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [displayedStatus, setDisplayedStatus] = useState("");
  const [fading, setFading] = useState(false);

  // Cycle through default messages if no statusText provided
  useEffect(() => {
    if (statusText) return;

    const interval = setInterval(() => {
      setCurrentMessageIndex((prev) => (prev + 1) % DEFAULT_MESSAGES.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [statusText]);

  // Smooth status text transitions
  useEffect(() => {
    const nextStatus = statusText ?? DEFAULT_MESSAGES[currentMessageIndex];

    if (nextStatus !== displayedStatus) {
      setFading(true);
      const timeout = setTimeout(() => {
        setDisplayedStatus(nextStatus);
        setFading(false);
      }, 150);
      return () => clearTimeout(timeout);
    }
  }, [statusText, currentMessageIndex, displayedStatus]);

  return (
    <div className="relative h-screen w-screen bg-black flex items-center justify-center overflow-hidden">
      <div className="flex flex-col items-center gap-8 text-center max-w-md px-6">
        {/* Logo */}
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent-gradient-start to-accent-gradient-end flex items-center justify-center shadow-2xl">
            <Radar className="w-12 h-12 text-white" />
          </div>
        </div>

        {/* Status Text */}
        <p
          className={`text-sm text-white/60 uppercase tracking-widest transition-opacity duration-150 ${
            fading ? "opacity-40" : "opacity-100"
          }`}
        >
          {displayedStatus}
        </p>

        {/* Progress Bar */}
        <div className="w-full max-w-xs">
          <Progress
            value={progress}
            className="h-2 bg-white/10"
          />
        </div>

        {/* Build/Brand Info */}
        <div className="mt-8 flex items-center gap-2 text-xs text-white/30 uppercase tracking-wider">
          <span className="inline-block w-2 h-2 rounded-full bg-accent-solid shadow-[0_0_8px_var(--accent-glow)]" />
          <span>RogueGrid</span>
        </div>
      </div>
    </div>
  );
}
