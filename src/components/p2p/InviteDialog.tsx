// src/components/p2p/InviteDialog.tsx - Updated for grid context
import { useEffect, useRef } from "react";

type InviteDialogProps = {
  open: boolean;
  fromUserId: string;
  fromDisplayName?: string;
  gridName?: string; // NEW: Grid context
  onAccept: (peerUserId: string) => void;
  onDecline: (peerUserId: string) => void;
  onClose?: () => void;
};

export default function InviteDialog({
  open,
  fromUserId,
  fromDisplayName,
  gridName,
  onAccept,
  onDecline,
  onClose,
}: InviteDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const primaryBtnRef = useRef<HTMLButtonElement | null>(null);

  // Close on ESC & basic focus trap
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose?.();
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Autofocus primary button on open
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => primaryBtnRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  if (!open) return null;

  const name = fromDisplayName || fromUserId;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-modal="true"
      role="dialog"
      aria-labelledby="invite-title"
      aria-describedby="invite-desc"
    >
      {/* overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onClose?.()}
      />

      {/* dialog box */}
      <div
        ref={dialogRef}
        className="relative mx-4 w-full max-w-md rounded-2xl border border-white/10 bg-neutral-900 p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#FF8A00] to-[#FF3D00] text-sm font-semibold text-white">
            {gridName ? gridName.slice(0, 2).toUpperCase() : "P2P"}
          </div>
          <div className="min-w-0">
            <h2 id="invite-title" className="text-base font-semibold">
              Grid session invite
            </h2>
            <p id="invite-desc" className="mt-1 text-sm text-neutral-300">
              <span className="font-medium">{name}</span> wants to start a P2P
              session with you{gridName && (
                <span> in <span className="font-medium text-orange-400">{gridName}</span></span>
              )}.
            </p>
          </div>
        </div>

        {/* Grid context info */}
        {gridName && (
          <div className="mt-3 rounded-lg bg-white/5 p-3">
            <div className="flex items-center gap-2 text-xs text-white/60">
              <div className="h-2 w-2 rounded-full bg-orange-400"></div>
              <span>Grid: {gridName}</span>
            </div>
          </div>
        )}

        {/* actions */}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 active:scale-[0.98]"
            onClick={() => {
              onDecline(fromUserId);
              onClose?.();
            }}
          >
            Decline
          </button>
          <button
            ref={primaryBtnRef}
            type="button"
            className="rounded-xl bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] px-3 py-2 text-sm font-semibold text-white hover:opacity-90 active:scale-[0.98]"
            onClick={() => {
              onAccept(fromUserId);
              onClose?.();
            }}
          >
            Accept & Connect
          </button>
        </div>

        {/* close button */}
        <button
          aria-label="Close"
          className="absolute right-3 top-3 rounded-md p-1 text-neutral-400 hover:bg-white/10 hover:text-white"
          onClick={() => onClose?.()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M18 6L6 18M6 6l12 12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}