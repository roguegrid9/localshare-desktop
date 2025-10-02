// src/components/ConnectionBadge.tsx
import { useMemo } from "react";
import { useP2P } from "../context/P2PProvider";

type NetStatus = "connected" | "connecting" | "offline";

type Props = {
  status: NetStatus;
  onClick?: () => void;
  className?: string;
  showLabel?: boolean;
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function ConnectionBadge({
  status,
  onClick,
  className,
  showLabel = true,
}: Props) {
  const { p2pReady } = useP2P();

  const wsColor = useMemo(() => {
    if (status === "connected") return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
    if (status === "connecting") return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
    return "bg-red-500/20 text-red-300 border-red-500/30";
  }, [status]);

  // A tiny dot to reflect P2P readiness (independent from WS)
  const p2pDot =
    status === "connected" ? (
      <span
        title={p2pReady ? "P2P ready" : "P2P initializing"}
        className={cx(
          "ml-2 inline-block h-2 w-2 rounded-full",
          p2pReady ? "bg-emerald-400" : "bg-yellow-400"
        )}
      />
    ) : null;

  const label =
    status === "connected"
      ? "Online"
      : status === "connecting"
      ? "Connecting…"
      : "Offline";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "inline-flex items-center rounded-xl border px-2.5 py-1 text-xs",
        "hover:opacity-90 active:scale-[0.98]",
        wsColor,
        className
      )}
      title="Connection status"
    >
      <span
        className={cx(
          "mr-1 inline-block h-2 w-2 rounded-full",
          status === "connected"
            ? "bg-emerald-400"
            : status === "connecting"
            ? "bg-yellow-400"
            : "bg-red-400"
        )}
        aria-hidden
      />
      {showLabel && <span className="font-medium">{label}</span>}
      {p2pDot}
    </button>
  );
}
