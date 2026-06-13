import { useMemo } from "react";
import type { EventRow } from "../lib/types";
import { EVENT_META } from "../lib/types";

type Props = {
  events: EventRow[];
  onSelect?: (e: EventRow) => void;
};

export default function Timeline({ events, onSelect }: Props) {
  const sorted = useMemo(() => {
    return [...events].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [events]);

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/70 text-white/90 flex flex-col h-full overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">Timeline</div>
        <div className="text-xs text-white/40">{sorted.length} entries</div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {sorted.length === 0 ? (
          <div className="p-6 text-sm text-white/40 text-center">No entries yet.</div>
        ) : (
          <ul className="flex flex-col">
            {sorted.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => onSelect?.(e)}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/5 flex gap-3 items-start"
                >
                  <div className="text-xl leading-none mt-0.5">{EVENT_META[e.type].emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <div className="font-semibold truncate">{e.title}</div>
                      {e.cost != null && (
                        <div className="text-xs text-white/50">${Number(e.cost).toFixed(2)}</div>
                      )}
                    </div>
                    <div className="text-xs text-white/40">
                      {new Date(e.timestamp).toLocaleString("en-US", {
                        timeZone: "America/New_York",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}{" "}
                      EST
                    </div>
                    {e.notes && (
                      <div className="text-sm text-white/70 mt-0.5 line-clamp-2">{e.notes}</div>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
