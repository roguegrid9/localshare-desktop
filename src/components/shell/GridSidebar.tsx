import { Hash, Mic as MicIcon, Video, Plus } from "lucide-react";
import { cx } from "@/utils/cx";
import * as React from "react";

// If you already have these types, import them instead.
// import type { Process } from "@/types/process";
// import type { Channel } from "@/types/grid";

type Process = {
  id: string;
  name: string;
  owner: string;
  type: "terminal" | "web" | "game";
  port?: number;
  status: "running" | "starting" | "stopped";
  cpu?: number;
  mem?: number;
};

type Channel = {
  id: string;
  type: "text" | "voice" | "video";
  name: string;
  unread?: number;
};

type Selected =
  | { kind: "process"; id: string }
  | { kind: "channel"; id: string }
  | null;

export default function GridSidebar({
  gridName,
  processes,
  channels,
  selected,
  onSelect,
  onAddProcess,
  onAddChannel,
  onToggleMembers,
}: {
  gridName: string;
  processes: ReadonlyArray<Process>;
  channels: ReadonlyArray<Channel>;
  selected: Selected;
  onSelect: (sel: Exclude<Selected, null>) => void;
  onAddProcess: () => void;
  onAddChannel: () => void;
  onToggleMembers: () => void;
}) {
  return (
    <aside className="h-full w-[280px] shrink-0 border-r border-white/10 bg-[#0E1116] p-3 flex flex-col gap-4 overflow-y-auto">
      {/* Grid header with Members toggle */}
      <div className="px-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm text-white/70">Grid</div>
            <div className="font-semibold truncate">{gridName}</div>
          </div>
          <button
            onClick={onToggleMembers}
            className="text-xs px-2 py-1 rounded border border-white/10 hover:bg-white/5"
          >
            Members
          </button>
        </div>
      </div>

      {/* Processes */}
      <section>
        <div className="flex items-center justify-between px-2 mb-2">
          <h3 className="text-xs uppercase tracking-wide text-white/50">Processes</h3>
          <button
            onClick={onAddProcess}
            className="text-xs px-2 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>

        <div className="space-y-1">
          {processes.map((p) => {
            const isActive = selected?.kind === "process" && selected.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => onSelect({ kind: "process", id: p.id })}
                className={cx(
                  "w-full text-left px-2 py-2 rounded-lg border transition flex items-center gap-2",
                  isActive
                    ? "border-white/30 bg-white/[0.06]"
                    : "border-white/10 hover:border-white/20 hover:bg-white/5"
                )}
              >
                <TypeBadge t={p.type} />
                <div className="min-w-0">
                  <div className="text-sm truncate">{p.name}</div>
                  <div className="text-[10px] text-white/50 truncate">
                    {p.owner}
                    {p.port ? ` • :${p.port}` : ""}
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2 text-xs text-white/60">
                  <StatusDot status={p.status} />
                  {typeof p.cpu === "number" && <span>{p.cpu}% CPU</span>}
                </div>
              </button>
            );
          })}

          {/* Optional: empty hint */}
          {processes.length === 0 && (
            <div className="px-2 py-2 text-xs text-white/40 border border-dashed border-white/10 rounded-lg">
              No processes yet
            </div>
          )}
        </div>
      </section>

      {/* Channels */}
      <section>
        <div className="flex items-center justify-between px-2 mb-2">
          <h3 className="text-xs uppercase tracking-wide text-white/50">Channels</h3>
          <button
            onClick={onAddChannel}
            className="text-xs px-2 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>

        <div className="space-y-1">
          {channels.map((c) => {
            const isActive = selected?.kind === "channel" && selected.id === c.id;
            return (
              <button
                key={c.id}
                onClick={() => onSelect({ kind: "channel", id: c.id })}
                className={cx(
                  "w-full text-left px-2 py-2 rounded-lg border transition flex items-center gap-2",
                  isActive
                    ? "border-white/30 bg-white/[0.06]"
                    : "border-white/10 hover:border-white/20 hover:bg-white/5"
                )}
              >
                <span className="w-8 grid place-items-center">
                  {c.type === "text" && <Hash className="h-3.5 w-3.5" />}
                  {c.type === "voice" && <MicIcon className="h-3.5 w-3.5" />}
                  {c.type === "video" && <Video className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{c.name}</div>
                </div>
                {!!c.unread && (
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-white text-black">
                    {c.unread}
                  </span>
                )}
              </button>
            );
          })}

          {/* Optional: empty hint */}
          {channels.length === 0 && (
            <div className="px-2 py-2 text-xs text-white/40 border border-dashed border-white/10 rounded-lg">
              No channels yet
            </div>
          )}
        </div>
      </section>
    </aside>
  );
}

/* ---------- small local UI helpers ---------- */

function TypeBadge({ t }: { t: Process["type"] }) {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
      {t === "terminal" && "TERM"}
      {t === "web" && "WEB"}
      {t === "game" && "GAME"}
    </span>
  );
}

function StatusDot({ status }: { status: Process["status"] }) {
  const cls =
    status === "running"
      ? "bg-green-400"
      : status === "starting"
      ? "bg-yellow-400"
      : "bg-white/30";
  return <span className={cx("inline-block h-2 w-2 rounded-full", cls)} />;
}
