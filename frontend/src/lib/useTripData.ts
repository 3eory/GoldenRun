import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PUBLIC_DELAY_MINUTES, supabase } from "./supabase";
import type { EventRow, LocationRow } from "./types";
import { sortByTime } from "./stats";

const LOOKBACK_DAYS = 30;

export type RunInfo = {
  runStart: string | null;
  runStop: string | null;
};

function lookbackIso() {
  return new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
}

function cutoffIso() {
  if (PUBLIC_DELAY_MINUTES <= 0) return null;
  return new Date(Date.now() - PUBLIC_DELAY_MINUTES * 60_000).toISOString();
}

function parseRunInfo(data: unknown): RunInfo {
  const row = data as { run_start?: unknown; run_stop?: unknown } | null;
  return {
    // Normalize to canonical ISO (`...Z`) immediately. Postgres returns these as
    // `2026-06-13 23:30:31.233+00` (space separator, bare `+00` offset), which (a)
    // breaks raw string comparisons against ISO location timestamps and (b) is
    // rejected by `new Date()` in Safari. Storing clean ISO makes every downstream
    // query, filter, and Date() call unambiguous.
    runStart: toIso(row?.run_start),
    runStop: toIso(row?.run_stop),
  };
}

// Compare by parsed epoch time, not raw strings: location timestamps are ISO
// (`2026-06-13T23:43:00.000Z`) while run_start/run_stop come back from Postgres
// as `timestamptz::text` (`2026-06-13 23:43:00+00`). A string compare would put
// the `T` (84) above the space (32) and wrongly drop the final day's pings.
//
// We also normalize the Postgres format to ISO 8601 first: the space separator
// and bare `+00` offset are rejected by stricter parsers (e.g. Safari).
function asTime(value: string): number {
  let v = value.trim().replace(" ", "T");
  // Normalize timezone: `+00`/`-05` -> `+00:00`, and append `Z` if no offset.
  const tzMatch = v.match(/([+-]\d{2})(:?\d{2})?$/);
  if (tzMatch) {
    if (!tzMatch[2]) v = `${v}:00`;
  } else if (!v.endsWith("Z")) {
    v = `${v}Z`;
  }
  return new Date(v).getTime();
}

function toIso(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = asTime(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function inRunWindow(
  timestamp: string,
  runStart: string | null,
  runStop: string | null
) {
  const t = asTime(timestamp);
  if (Number.isNaN(t)) return false;
  if (runStart) {
    const start = asTime(runStart);
    if (!Number.isNaN(start) && t < start) return false;
  }
  if (runStop) {
    const stop = asTime(runStop);
    if (!Number.isNaN(stop) && t > stop) return false;
  }
  return true;
}

function filterByRun<T extends { timestamp: string }>(
  rows: T[],
  runStart: string | null,
  runStop: string | null
) {
  return rows.filter((r) => inRunWindow(r.timestamp, runStart, runStop));
}

// Supabase caps each request at 1000 rows regardless of .limit(), so a long
// run (>1000 pings) silently truncates unless we page through the table.
const PAGE_SIZE = 1000;
const MAX_LOCATION_ROWS = 100_000;

async function fetchAllLocations(
  since: string,
  cutoff: string | null,
  runStart: string | null,
  runStop: string | null
): Promise<LocationRow[]> {
  const all: LocationRow[] = [];
  for (let from = 0; all.length < MAX_LOCATION_ROWS; from += PAGE_SIZE) {
    let q = supabase
      .from("locations")
      .select("id,lat,lon,timestamp,speed,battery,accuracy,altitude")
      .gte("timestamp", since)
      .order("timestamp", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (cutoff) q = q.lte("timestamp", cutoff);
    if (runStart) q = q.gte("timestamp", runStart);
    if (runStop) q = q.lte("timestamp", runStop);

    const { data, error } = await q;
    if (error) throw error;
    const rows = (data as LocationRow[]) ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

export function useTripData() {
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [runInfo, setRunInfo] = useState<RunInfo>({ runStart: null, runStop: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const runStartRef = useRef<string | null>(null);
  const runStopRef = useRef<string | null>(null);
  runStartRef.current = runInfo.runStart;
  runStopRef.current = runInfo.runStop;

  const fetchRunInfo = useCallback(async () => {
    const { data, error: runErr } = await supabase.rpc("get_run_info");
    if (runErr) throw runErr;
    const info = parseRunInfo(data);
    runStartRef.current = info.runStart;
    runStopRef.current = info.runStop;
    setRunInfo(info);
    return info;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      setLoading(true);
      try {
        const since = lookbackIso();
        const cutoff = cutoffIso();
        const info = await fetchRunInfo();
        const { runStart, runStop } = info;

        let evQ = supabase
          .from("events")
          .select("id,type,title,notes,lat,lon,timestamp,cost")
          .gte("timestamp", since)
          .order("timestamp", { ascending: true })
          .limit(1000);
        if (runStart) evQ = evQ.gte("timestamp", runStart);
        if (runStop) evQ = evQ.lte("timestamp", runStop);

        const [locs, { data: evs, error: ee }] = await Promise.all([
          fetchAllLocations(since, cutoff, runStart, runStop),
          evQ,
        ]);
        if (cancelled) return;
        if (ee) throw ee;

        setLocations(locs);
        setEvents((evs as EventRow[]) ?? []);
        setError(null);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadInitial();

    const channel = supabase
      .channel("trip-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "locations" },
        (payload) => {
          const row = payload.new as LocationRow;
          if (!inRunWindow(row.timestamp, runStartRef.current, runStopRef.current)) return;
          const cutoff = cutoffIso();
          if (cutoff && row.timestamp > cutoff) return;
          setLocations((prev) => sortByTime([...prev, row]));
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events" },
        (payload) => {
          const row = payload.new as EventRow;
          if (!inRunWindow(row.timestamp, runStartRef.current, runStopRef.current)) return;
          setEvents((prev) => sortByTime([...prev, row]));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [fetchRunInfo]);

  const visibleLocations = useMemo(
    () => filterByRun(locations, runInfo.runStart, runInfo.runStop),
    [locations, runInfo.runStart, runInfo.runStop]
  );
  const visibleEvents = useMemo(
    () => filterByRun(events, runInfo.runStart, runInfo.runStop),
    [events, runInfo.runStart, runInfo.runStop]
  );

  return {
    locations: visibleLocations,
    events: visibleEvents,
    runInfo,
    setRunInfo,
    fetchRunInfo,
    loading,
    error,
  };
}
