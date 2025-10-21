// src/components/ConnectionBadge.tsx
import { useMemo, useState, useEffect } from "react";
import { useP2P } from "../context/P2PProvider";
import { listen } from "@tauri-apps/api/event";

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
  const [connectionType, setConnectionType] = useState<string | null>(null);

  // Listen for P2P connection type updates
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen("p2p_connection_established", (event: any) => {
        const { connection_type } = event.payload;
        setConnectionType(connection_type);
      });
    };

    setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const wsColor = useMemo(() => {
    if (status === "connected") return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
    if (status === "connecting") return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
    return "bg-red-500/20 text-red-300 border-red-500/30";
  }, [status]);

  // Get connection type label
  const connectionTypeLabel = useMemo(() => {
    if (!connectionType) return null;
    switch (connectionType) {
      case "direct_p2p":
        return "P2P";
      case "stun_assisted":
        return "STUN";
      case "turn_relay":
        return "TURN";
      default:
        return null;
    }
  }, [connectionType]);

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

  // Build comprehensive tooltip
  const tooltipText = useMemo(() => {
    const parts = [`Connection status: ${label}`];
    if (connectionTypeLabel) {
      parts.push(`Type: ${connectionTypeLabel}`);
    }
    if (status === "connected") {
      parts.push("Both users must have the app for P2P to work");
    }
    return parts.join(" • ");
  }, [label, connectionTypeLabel, status]);

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
      title={tooltipText}
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
      {connectionTypeLabel && status === "connected" && (
        <span className="ml-1.5 text-[10px] opacity-75">({connectionTypeLabel})</span>
      )}
      {p2pDot}
    </button>
  );
}
