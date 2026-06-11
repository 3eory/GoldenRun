import { useEffect, useMemo, useState } from "react";
import type { LocationRow } from "../lib/types";
import {
  averageSpeedMphOverLastMiles,
  computeStats,
  formatMiles,
  sinceHuman,
} from "../lib/stats";
import { computeRouteProgress } from "../lib/route";
import { ROUTE_NAME } from "../config/cannonball";
import { supabase } from "../lib/supabase";

type Props = {
  locations: LocationRow[];
};

type RunInfo = {
  runStart: string | null;
};

const ADMIN_SECRET =
  (import.meta.env.VITE_ADMIN_RPC_SECRET as string | undefined) ?? "";

export default function Stats({ locations }: Props) {
  const [, tick] = useState(0);
  const [runInfo, setRunInfo] = useState<RunInfo>({ runStart: null });
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminSecret, setAdminSecret] = useState("");
  const [adminErr, setAdminErr] = useState<string | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let on = true;
    supabase
      .rpc("get_run_info")
      .then(({ data, error }) => {
        if (!on) return;
        if (error) {
          console.warn("[get_run_info]", error.message);
          return;
        }
        const start = (data as any)?.run_start ?? null;
        setRunInfo({ runStart: typeof start === "string" ? start : null });
      })
    return () => {
      on = false;
    };
  }, []);

  const baseStats = useMemo(() => computeStats(locations), [locations]);
  const progress = useMemo(
    () => computeRouteProgress(baseStats.totalMiles),
    [baseStats.totalMiles]
  );

  const live = baseStats.lastPingAgeMs != null && baseStats.lastPingAgeMs < 10 * 60_000;
  const lastLabel =
    baseStats.lastPingAgeMs == null
      ? "—"
      : sinceHuman(baseStats.lastPingAgeMs);

  const speedLabel =
    baseStats.lastPing?.speed != null && baseStats.lastPing.speed > 0
      ? `${Math.round(baseStats.lastPing.speed * 0.621371)} mph`
      : "—";

  const avg50 = useMemo(
    () => averageSpeedMphOverLastMiles(locations, 50),
    [locations]
  );
  const etaHours =
    avg50 && avg50 > 1 ? progress.remainingMi / avg50 : null;
  const etaLabel =
    etaHours != null && Number.isFinite(etaHours)
      ? formatDurationHours(etaHours)
      : "—";
  const arrivalLabel =
    etaHours != null && Number.isFinite(etaHours)
      ? new Date(Date.now() + etaHours * 3_600_000).toLocaleString(undefined, {
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
        })
      : "—";

  const pct = progress.totalMi > 0 ? Math.min(1, progress.coveredMi / progress.totalMi) : 0;
  const startedLabel = runInfo.runStart
    ? new Date(runInfo.runStart).toLocaleString(undefined, {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        day: "numeric",
      })
    : "—";

  return (
    <div
      className="rounded-2xl text-white/90 shadow-xl border border-white/10 bg-zinc-900/85 backdrop-blur-md p-4 w-full max-w-[320px] font-display"
      style={{ fontFeatureSettings: '"tnum" 1, "lnum" 1' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold tracking-tight">{ROUTE_NAME}</div>
        <span
          className={
            "text-[10px] font-bold px-2 py-0.5 rounded-full border " +
            (live
              ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/40"
              : "bg-white/5 text-white/40 border-white/10")
          }
        >
          {live ? "LIVE" : "OFFLINE"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <Stat label="Covered"   value={`${formatMiles(progress.coveredMi)} mi`} />
        <Stat label="Remaining" value={`${formatMiles(progress.remainingMi)} mi`} />
      </div>

      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Total route</div>
        <div className="text-xl font-semibold tabular-nums">{formatMiles(progress.totalMi)} mi</div>
        <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-red-400 via-orange-400 to-amber-300 transition-[width] duration-500"
            style={{ width: `${(pct * 100).toFixed(1)}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10">
        <Mini label="Speed"     value={speedLabel} />
        <Mini label="Last ping" value={lastLabel} />
        <Mini label="Off route" value={`${formatMiles(progress.offRouteMi)} mi`} />
      </div>

      <div className="grid grid-cols-3 gap-2 pt-3">
        <Mini label="Started" value={startedLabel} />
        <Mini label="ETA" value={etaLabel} />
        <Mini label="Arrival" value={arrivalLabel} />
      </div>

      <div className="pt-3 flex items-center justify-between">
        <button
          type="button"
          className="text-xs text-white/50 hover:text-white/80 transition"
          onClick={() => {
            setAdminOpen((v) => !v);
            setAdminErr(null);
          }}
        >
          Run admin
        </button>
        {adminOpen && (
          <div className="text-[10px] text-white/35">
            Needs admin password
          </div>
        )}
      </div>

      {adminOpen && (
        <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-[10px] uppercase tracking-wider text-white/40 mb-2">
            Admin
          </div>
          <input
            className="w-full rounded-lg bg-black/30 border border-white/10 px-2.5 py-2 text-sm outline-none focus:border-white/30"
            placeholder="Admin password"
            type="password"
            value={adminSecret}
            onChange={(e) => setAdminSecret(e.target.value)}
          />
          {adminErr && (
            <div className="text-xs text-red-300 mt-2">{adminErr}</div>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-white text-zinc-900 hover:bg-white/90 disabled:opacity-60"
              disabled={adminBusy}
              onClick={async () => {
                setAdminBusy(true);
                setAdminErr(null);
                try {
                  const secret = adminSecret || ADMIN_SECRET;
                  const { error } = await supabase.rpc("set_run_start", {
                    p_secret: secret,
                    p_started_at: new Date().toISOString(),
                  });
                  if (error) throw error;
                  setRunInfo({ runStart: new Date().toISOString() });
                } catch (e: any) {
                  setAdminErr(e.message ?? String(e));
                } finally {
                  setAdminBusy(false);
                }
              }}
            >
              Set start to now
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-red-500/90 text-white hover:bg-red-500 disabled:opacity-60"
              disabled={adminBusy}
              onClick={async () => {
                const ok = window.confirm(
                  "Reset the run? This permanently deletes ALL locations and events."
                );
                if (!ok) return;
                setAdminBusy(true);
                setAdminErr(null);
                try {
                  const secret = adminSecret || ADMIN_SECRET;
                  const { error } = await supabase.rpc("reset_run", {
                    p_secret: secret,
                  });
                  if (error) throw error;
                  setRunInfo({ runStart: null });
                  window.location.reload();
                } catch (e: any) {
                  setAdminErr(e.message ?? String(e));
                } finally {
                  setAdminBusy(false);
                }
              }}
            >
              Reset the run
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/5 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className="text-lg font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className="text-xs font-semibold tabular-nums mt-0.5 truncate">{value}</div>
    </div>
  );
}

function formatDurationHours(hours: number): string {
  const totalMin = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
