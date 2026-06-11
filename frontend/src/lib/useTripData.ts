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
    runStart: typeof row?.run_start === "string" ? row.run_start : null,
    runStop: typeof row?.run_stop === "string" ? row.run_stop : null,
  };
}

function inRunWindow(
  timestamp: string,
  runStart: string | null,
  runStop: string | null
) {
  if (runStart && timestamp < runStart) return false;
  if (runStop && timestamp > runStop) return false;
  return true;
}

function filterByRun<T extends { timestamp: string }>(
  rows: T[],
  runStart: string | null,
  runStop: string | null
) {
  return rows.filter((r) => inRunWindow(r.timestamp, runStart, runStop));
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

        let locQ = supabase
          .from("locations")
          .select("id,lat,lon,timestamp,speed,battery,accuracy,altitude")
          .gte("timestamp", since)
          .order("timestamp", { ascending: true })
          .limit(20000);
        if (cutoff) locQ = locQ.lte("timestamp", cutoff);
        if (runStart) locQ = locQ.gte("timestamp", runStart);
        if (runStop) locQ = locQ.lte("timestamp", runStop);

        let evQ = supabase
          .from("events")
          .select("id,type,title,notes,lat,lon,timestamp,cost")
          .gte("timestamp", since)
          .order("timestamp", { ascending: true })
          .limit(5000);
        if (runStart) evQ = evQ.gte("timestamp", runStart);
        if (runStop) evQ = evQ.lte("timestamp", runStop);

        const [{ data: locs, error: le }, { data: evs, error: ee }] = await Promise.all([
          locQ,
          evQ,
        ]);
        if (cancelled) return;
        if (le) throw le;
        if (ee) throw ee;

        setLocations((locs as LocationRow[]) ?? []);
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
