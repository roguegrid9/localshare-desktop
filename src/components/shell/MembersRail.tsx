import * as React from "react";
import { cx } from "@/utils/cx";
import { useGridDetails } from "@/hooks/useGridDetails";

export default function MembersRail({ gridId }: { gridId: string }) {
  const { members, isLoading, error } = useGridDetails(gridId);

  return (
    <aside className="h-full w-[260px] shrink-0 border-l border-white/10 bg-[#0E1116] p-3 overflow-y-auto">
      <div className="px-2 mb-2">
        <h3 className="text-xs uppercase tracking-wide text-white/50">Members</h3>
      </div>

      {isLoading ? (
        <div className="px-2 py-2 text-white/50 text-sm">Loading…</div>
      ) : error ? (
        <div className="px-2 py-2 text-red-400 text-sm">Failed to load members.</div>
      ) : members.length === 0 ? (
        <div className="px-2 py-2 text-white/40 text-sm">No members yet</div>
      ) : (
        <div className="space-y-1">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-2 px-2 py-2 rounded-lg border border-white/10"
              title={m.name}
            >
              <span
                className={cx(
                  "h-2 w-2 rounded-full",
                  m.online ? "bg-green-500" : "bg-white/20"
                )}
                aria-label={m.online ? "online" : "offline"}
              />
              <div className="text-sm flex-1 truncate">{m.name}</div>
              <div className="text-[10px] text-white/50 uppercase">{m.role}</div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
