import { useEffect, useMemo, useState } from "react";

export type SplashProps = {
  statusText?: string;
  progress?: number; // 0..1
  build?: string;
  netStatus?: "connected" | "connecting" | "offline";
  tips?: string[];
  onRetry?: () => void;
  onDiagnostics?: () => void;
};

const DEFAULT_TIPS = [
  "Starting services…",
  "Contacting coordinator…",
  "Checking session…",
  "Preparing UI…",
];

const cls = {
  root:
    "min-h-screen w-screen bg-[#0A0B0D] text-white flex flex-col relative overflow-hidden",
  center: "flex-1 grid place-items-center px-6",
  stack: "flex flex-col items-center gap-5",
  logoWrap:
    "relative w-[88px] h-[88px] rounded-2xl bg-[#0F1116]/80 border border-white/10 grid place-items-center shadow-[inset_0_-4px_12px_rgba(255,255,255,0.06)]",
  logo: "w-[56px] h-auto",
  status:
    "text-[15px] text-gray-300/90 font-medium tracking-wide transition-opacity duration-200",
  barTrack:
    "h-2.5 w-[360px] max-w-sm rounded-full bg-white/10 overflow-hidden ring-1 ring-inset ring-white/10",
  barFill:
    "h-full rounded-full bg-gradient-to-r from-[#FF8A00] via-[#FF6B00] to-[#FF3D00] transition-[width] duration-500 ease-[cubic-bezier(.22,1,.36,1)]",
  row: "mt-3 flex items-center justify-between w-[360px] max-w-sm text-[12px] text-gray-400",
  chip:
    "rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-gray-300",
  ghostBtn:
    "px-3 py-1.5 text-[12px] rounded-lg border border-white/10 text-gray-200/90 hover:bg-white/5 transition",
};

export default function SplashScreen({
  statusText,
  progress,
  build,
  netStatus = "connecting",
  tips,
  onRetry,
  onDiagnostics,
}: SplashProps) {
  const msgs = useMemo(() => (tips?.length ? tips : DEFAULT_TIPS), [tips]);
  const [idx, setIdx] = useState(0);
  const [currentStatus, setCurrentStatus] = useState("");
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (statusText) return;
    const t = setInterval(
      () => setIdx((i) => (i + 1) % msgs.length),
      1800
    );
    return () => clearInterval(t);
  }, [statusText, msgs.length]);

  useEffect(() => {
    const next = statusText ?? msgs[idx];
    if (next !== currentStatus) {
      setFading(true);
      const t = setTimeout(() => {
        setCurrentStatus(next);
        setFading(false);
      }, 120);
      return () => clearTimeout(t);
    }
  }, [statusText, msgs, idx, currentStatus]);

  const pct =
    progress === undefined
      ? undefined
      : Math.max(0, Math.min(100, Math.round(progress * 100)));

  return (
    <div className={cls.root}>
      <main className={cls.center}>
        <div className={cls.stack}>
          <div className={cls.logoWrap}>
            <img src="/assets/logo1.svg" alt="RogueGrid9" className={cls.logo} />
          </div>

          <div
            className={`${cls.status} ${fading ? "opacity-50" : "opacity-100"}`}
            aria-live="polite"
          >
            {currentStatus}
          </div>

          <div className="flex flex-col items-center gap-3 mt-6">
            <div
              className={cls.barTrack}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct ?? undefined}
              aria-label="Loading progress"
            >
              {pct === undefined ? (
                <div className="h-full w-1/2 animate-[shimmer_1.8s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent rounded-full" />
              ) : (
                <div className={cls.barFill} style={{ width: `${pct}%` }} />
              )}
            </div>

            <div className={cls.row}>
              <span className="font-mono tracking-wider">
                {build ? `build ${build}` : "build dev"}
              </span>

              <span className="inline-flex items-center gap-2">
                <NetDot status={netStatus} />
                <span className="capitalize">{netStatus}</span>
              </span>
            </div>
          </div>

          {netStatus === "offline" && (
            <div className="mt-4 flex items-center gap-2">
              <span className={cls.chip}>Coordinator unreachable</span>
              {onRetry && (
                <button onClick={onRetry} className={cls.ghostBtn}>
                  Retry
                </button>
              )}
              {onDiagnostics && (
                <button onClick={onDiagnostics} className={cls.ghostBtn}>
                  Diagnostics
                </button>
              )}
            </div>
          )}
        </div>
      </main>

      <style>{`
        @keyframes shimmer {
          0%   { transform: translateX(-60%); opacity: .2; }
          50%  { opacity: .7; }
          100% { transform: translateX(120%); opacity: .2; }
        }
      `}</style>
    </div>
  );
}

function NetDot({ status }: { status: SplashProps["netStatus"] }) {
  const map = {
    connected: "#22c55e",
    offline: "#ef4444",
    connecting: "#f59e0b",
  } as const;
  const c = map[status ?? "connecting"];
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${
        status === "connecting" ? "animate-pulse" : ""
      }`}
      style={{ background: c, boxShadow: `0 0 8px ${c}66` }}
      aria-hidden
    />
  );
}
