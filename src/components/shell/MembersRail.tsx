import * as React from "react";
import { cx } from "@/utils/cx";
import { useGridDetails } from "@/hooks/useGridDetails";

export default function MembersRail({ gridId }: { gridId: string }) {
  const { members, isLoading, error } = useGridDetails(gridId);

  return (
    <aside className="h-full w-[260px] shrink-0 border-l border-white/10 bg-bg-surface p-3 overflow-y-auto">
      <div className="px-2 mb-3">
        <h3 className="text-xs uppercase tracking-[0.1em] font-semibold text-white/60">Members</h3>
      </div>

      {isLoading ? (
        <div className="px-2 py-2 text-white/50 text-sm">Loading…</div>
      ) : error ? (
        <div className="px-2 py-2 text-red-400 text-sm">Failed to load members.</div>
      ) : members.length === 0 ? (
        <div className="px-2 py-2 text-white/40 text-sm">No members yet</div>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-colors duration-150 cursor-pointer"
              title={m.name}
            >
              <span
                className={cx(
                  "h-2.5 w-2.5 rounded-full",
                  m.online
                    ? "bg-green-500"
                    : "bg-white/20"
                )}
                aria-label={m.online ? "online" : "offline"}
              />
              <div className="text-sm flex-1 truncate font-medium">{m.name}</div>
              <div className="text-[10px] text-white/50 uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/5">
                {m.role}
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
