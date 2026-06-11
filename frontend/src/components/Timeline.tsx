import { useMemo, useState } from "react";
import type { EventRow, EventType } from "../lib/types";
import { EVENT_META } from "../lib/types";

type Props = {
  events: EventRow[];
  onSelect?: (e: EventRow) => void;
};

const ALL_TYPES: EventType[] = ["gas", "food", "sight", "sleep", "note"];

export default function Timeline({ events, onSelect }: Props) {
  const [active, setActive] = useState<Set<EventType>>(new Set(ALL_TYPES));

  const filtered = useMemo(() => {
    const out = events.filter((e) => active.has(e.type));
    out.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return out;
  }, [events, active]);

  function toggle(t: EventType) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      if (next.size === 0) return new Set(ALL_TYPES);
      return next;
    });
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/70 text-white/90 flex flex-col h-full overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">Timeline</div>
        <div className="text-xs text-white/40">{filtered.length} entries</div>
      </div>
      <div className="px-4 pb-2 flex flex-wrap gap-1.5">
        {ALL_TYPES.map((t) => {
          const on = active.has(t);
          const m = EVENT_META[t];
          return (
            <button
              key={t}
              onClick={() => toggle(t)}
              className={
                "px-2.5 py-1 rounded-full text-xs font-medium border transition " +
                (on
                  ? "bg-white text-zinc-900 border-white"
                  : "bg-transparent border-white/10 text-white/50 hover:border-white/30")
              }
            >
              <span className="mr-1">{m.emoji}</span>
              {m.label}
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {filtered.length === 0 ? (
          <div className="p-6 text-sm text-white/40 text-center">No entries yet.</div>
        ) : (
          <ul className="flex flex-col">
            {filtered.map((e) => (
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
                      {new Date(e.timestamp).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
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
