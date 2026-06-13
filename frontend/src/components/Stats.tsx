import { useEffect, useMemo, useState } from "react";
import type { LocationRow } from "../lib/types";
import { computeStats, formatMiles } from "../lib/stats";
import { computeRouteProgress } from "../lib/route";
import {
  ROUTE_NAME,
  RUN_COVERED_MILES_OVERRIDE,
  RUN_ELAPSED_OVERRIDE_MS,
} from "../config/cannonball";
import { supabase } from "../lib/supabase";
import type { RunInfo } from "../lib/useTripData";

type Props = {
  locations: LocationRow[];
  runInfo: RunInfo;
  onRunInfoChange: (info: RunInfo) => void;
  className?: string;
};

export default function Stats({
  locations,
  runInfo,
  onRunInfoChange,
  className,
}: Props) {
  const [, tick] = useState(0);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminSecret, setAdminSecret] = useState("");
  const [adminErr, setAdminErr] = useState<string | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);

  const hasPassword = adminSecret.trim().length > 0;
  const running = runInfo.runStart != null && runInfo.runStop == null;
  const stopped = runInfo.runStop != null;

  function requirePassword(): string | null {
    const secret = adminSecret.trim();
    if (!secret) {
      setAdminErr("Enter admin password first");
      return null;
    }
    return secret;
  }

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  const baseStats = useMemo(() => computeStats(locations), [locations]);
  const progress = useMemo(
    () => computeRouteProgress(baseStats.totalMiles),
    [baseStats.totalMiles]
  );

  const live =
    running &&
    baseStats.lastPingAgeMs != null &&
    baseStats.lastPingAgeMs < 10 * 60_000;

  const speedLabel =
    baseStats.lastPing?.speed != null && baseStats.lastPing.speed > 0
      ? `${Math.round(baseStats.lastPing.speed * 0.621371)} mph`
      : "—";

  const avgSpeedLabel =
    baseStats.avgSpeedMph > 0 ? `${Math.round(baseStats.avgSpeedMph)} mph` : "—";

  // Once stopped, the "route" becomes the actual distance driven. An optional
  // manual override takes precedence over the computed GPS distance.
  const coveredMi =
    stopped && RUN_COVERED_MILES_OVERRIDE != null
      ? RUN_COVERED_MILES_OVERRIDE
      : progress.coveredMi;
  const totalMi = stopped ? coveredMi : progress.totalMi;
  const remainingMi = stopped ? 0 : progress.remainingMi;

  // Elapsed time counter — freezes at the stop time once stopped. Once stopped,
  // an optional manual override takes precedence over the recorded timestamps.
  const computedElapsedMs = runInfo.runStart
    ? (runInfo.runStop
        ? new Date(runInfo.runStop).getTime()
        : Date.now()) - new Date(runInfo.runStart).getTime()
    : null;
  const elapsedMs =
    stopped && RUN_ELAPSED_OVERRIDE_MS != null
      ? RUN_ELAPSED_OVERRIDE_MS
      : computedElapsedMs;
  const timeLabel = elapsedMs != null ? formatElapsedClock(elapsedMs) : "—";

  const pct = totalMi > 0 ? Math.min(1, coveredMi / totalMi) : 0;
  const startedLabel = runInfo.runStart ? formatEstShort(runInfo.runStart) : "—";
  const arrivalLabel = runInfo.runStop ? formatEstShort(runInfo.runStop) : "—";

  const statusLabel = stopped ? "STOPPED" : !runInfo.runStart ? "IDLE" : live ? "LIVE" : "OFFLINE";
  const statusClass = stopped
    ? "bg-amber-500/15 text-amber-300 border-amber-400/40"
    : live
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/40"
      : "bg-white/5 text-white/40 border-white/10";

  return (
    <div
      className={`rounded-2xl text-white/90 shadow-xl border border-white/10 bg-zinc-900/85 backdrop-blur-md p-4 w-full max-w-[320px] font-display ${className ?? ""}`}
      style={{ fontFeatureSettings: '"tnum" 1, "lnum" 1' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold tracking-tight">{ROUTE_NAME}</div>
        <span
          className={
            "text-[10px] font-bold px-2 py-0.5 rounded-full border " + statusClass
          }
        >
          {statusLabel}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <Stat label="Covered"   value={`${formatMiles(coveredMi)} mi`} />
        <Stat label="Remaining" value={`${formatMiles(remainingMi)} mi`} />
        <Stat label="Time"      value={timeLabel} />
      </div>

      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Total route</div>
        <div className="text-xl font-semibold tabular-nums">{formatMiles(totalMi)} mi</div>
        <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-red-400 via-orange-400 to-amber-300 transition-[width] duration-500"
            style={{ width: `${(pct * 100).toFixed(1)}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
        <Mini label="Current speed" value={speedLabel} />
        <Mini label="Avg speed"     value={avgSpeedLabel} />
      </div>

      <div className="grid grid-cols-2 gap-2 pt-3">
        <Mini label="Started" value={startedLabel} />
        <Mini label="Arrival" value={arrivalLabel} />
      </div>
      <div className="pt-1.5 text-[10px] text-white/35">All times in EST</div>

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
            placeholder="Admin password (required)"
            type="password"
            value={adminSecret}
            onChange={(e) => {
              setAdminSecret(e.target.value);
              if (adminErr) setAdminErr(null);
            }}
          />
          {adminErr && (
            <div className="text-xs text-red-300 mt-2">{adminErr}</div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-white text-zinc-900 hover:bg-white/90 disabled:opacity-60"
              disabled={adminBusy || !hasPassword || running}
              onClick={async () => {
                const secret = requirePassword();
                if (!secret) return;
                setAdminBusy(true);
                setAdminErr(null);
                try {
                  const startedAt = new Date().toISOString();
                  const { error } = await supabase.rpc("set_run_start", {
                    p_secret: secret,
                    p_started_at: startedAt,
                  });
                  if (error) throw error;
                  onRunInfoChange({ runStart: startedAt, runStop: null });
                } catch (e: any) {
                  setAdminErr(e.message ?? String(e));
                } finally {
                  setAdminBusy(false);
                }
              }}
            >
              Start run
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-amber-500/90 text-white hover:bg-amber-500 disabled:opacity-60"
              disabled={adminBusy || !hasPassword || !running}
              onClick={async () => {
                const secret = requirePassword();
                if (!secret) return;
                const ok = window.confirm(
                  "Stop the run? Tracking will freeze — no new locations or log entries will be saved."
                );
                if (!ok) return;
                setAdminBusy(true);
                setAdminErr(null);
                try {
                  const stoppedAt = new Date().toISOString();
                  const { error } = await supabase.rpc("stop_run", {
                    p_secret: secret,
                    p_stopped_at: stoppedAt,
                  });
                  if (error) throw error;
                  onRunInfoChange({ ...runInfo, runStop: stoppedAt });
                } catch (e: any) {
                  setAdminErr(e.message ?? String(e));
                } finally {
                  setAdminBusy(false);
                }
              }}
            >
              Stop run
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-red-500/90 text-white hover:bg-red-500 disabled:opacity-60"
              disabled={adminBusy || !hasPassword}
              onClick={async () => {
                const secret = requirePassword();
                if (!secret) return;
                const ok = window.confirm(
                  "Reset the run? This permanently deletes ALL locations and events."
                );
                if (!ok) return;
                setAdminBusy(true);
                setAdminErr(null);
                try {
                  const { error } = await supabase.rpc("reset_run", {
                    p_secret: secret,
                  });
                  if (error) throw error;
                  onRunInfoChange({ runStart: null, runStop: null });
                  window.location.reload();
                } catch (e: any) {
                  setAdminErr(e.message ?? String(e));
                } finally {
                  setAdminBusy(false);
                }
              }}
            >
              Reset run
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/5 p-2">
      <div className="text-[10px] uppercase tracking-wider text-white/40 truncate">{label}</div>
      <div className="text-base font-semibold tabular-nums mt-0.5 truncate">{value}</div>
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

function formatElapsedClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatEstShort(input: Date | string): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
