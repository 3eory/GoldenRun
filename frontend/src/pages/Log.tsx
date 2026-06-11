import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { EventType } from "../lib/types";
import { EVENT_META } from "../lib/types";

const LOG_PASSWORD = (import.meta.env.VITE_LOG_PAGE_PASSWORD as string | undefined) ?? "";
const LOG_RPC_SECRET = (import.meta.env.VITE_LOG_RPC_SECRET as string | undefined) ?? "";
const UNLOCK_KEY = "goldenrun.log.unlocked";

const TYPES: EventType[] = ["gas", "food", "sight", "sleep", "note"];

type Coords = { lat: number; lon: number } | null;

export default function Log() {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);

  const [type, setType] = useState<EventType>("gas");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [cost, setCost] = useState("");
  const [coords, setCoords] = useState<Coords>(null);
  const [locating, setLocating] = useState(false);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [runInactive, setRunInactive] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(UNLOCK_KEY) === "1") setUnlocked(true);
  }, []);

  useEffect(() => {
    supabase.rpc("get_run_info").then(({ data, error }) => {
      if (error) return;
      const row = data as { run_start?: unknown; run_stop?: unknown; is_active?: unknown };
      const hasStart = typeof row.run_start === "string" && row.run_start.length > 0;
      const hasStop = typeof row.run_stop === "string" && row.run_stop.length > 0;
      const isActive =
        typeof row.is_active === "boolean" ? row.is_active : hasStart && !hasStop;
      setRunInactive(!isActive);
    });
  }, []);

  useEffect(() => {
    if (unlocked && !coords) grabLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

  function grabLocation() {
    if (!("geolocation" in navigator)) {
      setLocErr("Geolocation not supported");
      return;
    }
    setLocating(true);
    setLocErr(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocating(false);
      },
      (err) => {
        setLocErr(err.message);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  }

  function tryUnlock(e: FormEvent) {
    e.preventDefault();
    if (!LOG_PASSWORD) {
      setPwError("VITE_LOG_PAGE_PASSWORD not set in frontend/.env");
      return;
    }
    if (password === LOG_PASSWORD) {
      sessionStorage.setItem(UNLOCK_KEY, "1");
      setUnlocked(true);
      setPwError(null);
    } else {
      setPwError("Nope, try again.");
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (runInactive) {
      setToast("Error: Run is not active — start the run from the map first");
      return;
    }
    if (!coords) {
      setLocErr("Need a location first");
      return;
    }
    if (!title.trim()) return;
    if (!LOG_RPC_SECRET) {
      setToast("VITE_LOG_RPC_SECRET not set");
      return;
    }
    setSubmitting(true);
    setToast(null);
    const parsedCost = cost.trim() === "" ? null : Number(cost);
    const { error } = await supabase.rpc("insert_event", {
      p_secret: LOG_RPC_SECRET,
      p_type: type,
      p_title: title.trim(),
      p_notes: notes.trim() || null,
      p_lat: coords.lat,
      p_lon: coords.lon,
      p_cost: parsedCost != null && !Number.isNaN(parsedCost) ? parsedCost : null,
      p_timestamp: new Date().toISOString(),
    });
    setSubmitting(false);
    if (error) {
      setToast(`Error: ${error.message}`);
      return;
    }
    setToast("Logged ✓");
    setTitle("");
    setNotes("");
    setCost("");
    setTimeout(() => setToast(null), 2500);
  }

  if (!unlocked) {
    return (
      <div className="min-h-full flex items-center justify-center p-6">
        <form onSubmit={tryUnlock} className="panel p-6 w-full max-w-sm flex flex-col gap-3">
          <div className="text-center text-3xl">🔒</div>
          <h1 className="text-center font-semibold text-lg">Locked</h1>
          <input
            autoFocus
            type="password"
            className="input"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {pwError && <div className="text-sm text-sunset">{pwError}</div>}
          <button type="submit" className="btn-primary">Unlock</button>
          <Link to="/" className="text-center text-xs text-ink/50 hover:text-ink">← back to map</Link>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-full flex items-start justify-center p-4 md:p-6">
      <form onSubmit={submit} className="panel p-5 w-full max-w-lg flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-sm text-ink/60 hover:text-ink">← map</Link>
          <h1 className="font-semibold">New entry</h1>
          <div className="w-12" />
        </div>

        <div>
          <div className="label mb-1.5">Type</div>
          <div className="grid grid-cols-5 gap-1.5">
            {TYPES.map((t) => {
              const m = EVENT_META[t];
              const on = t === type;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={
                    "flex flex-col items-center gap-1 py-2 rounded-xl border transition " +
                    (on
                      ? "bg-ink text-paper border-ink"
                      : "bg-white border-black/10 hover:border-ink/40")
                  }
                >
                  <span className="text-xl leading-none">{m.emoji}</span>
                  <span className="text-[11px] font-medium">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="label mb-1.5">Title</div>
          <input
            className="input"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Shell station, Tulsa"
          />
        </div>

        <div>
          <div className="label mb-1.5">Notes (optional)</div>
          <textarea
            className="input min-h-[80px] resize-y"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Filled up, bought bad gas-station coffee."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="label mb-1.5">Cost ($)</div>
            <input
              className="input"
              inputMode="decimal"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="42.17"
            />
          </div>
          <div>
            <div className="label mb-1.5">Location</div>
            <button
              type="button"
              onClick={grabLocation}
              className="btn-ghost w-full border border-black/10"
              disabled={locating}
            >
              {locating
                ? "Locating…"
                : coords
                ? `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`
                : "Get current location"}
            </button>
          </div>
        </div>
        {locErr && <div className="text-xs text-sunset">{locErr}</div>}

        {runInactive && (
          <div className="text-sm text-sunset text-center">
            Run is not active — start it from the map admin panel first.
          </div>
        )}

        <button type="submit" className="btn-primary" disabled={submitting || !coords || runInactive}>
          {submitting ? "Saving…" : "Save entry"}
        </button>
        {toast && (
          <div
            className={
              "text-center text-sm " +
              (toast.startsWith("Error") ? "text-sunset" : "text-forest")
            }
          >
            {toast}
          </div>
        )}
      </form>
    </div>
  );
}
