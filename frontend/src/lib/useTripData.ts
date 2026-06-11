import { useEffect, useState } from "react";
import { PUBLIC_DELAY_MINUTES, supabase } from "./supabase";
import type { EventRow, LocationRow } from "./types";
import { sortByTime } from "./stats";

const LOOKBACK_DAYS = 30;

function lookbackIso() {
  return new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
}

function cutoffIso() {
  if (PUBLIC_DELAY_MINUTES <= 0) return null;
  return new Date(Date.now() - PUBLIC_DELAY_MINUTES * 60_000).toISOString();
}

export function useTripData() {
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      setLoading(true);
      try {
        const since = lookbackIso();
        const cutoff = cutoffIso();

        let locQ = supabase
          .from("locations")
          .select("id,lat,lon,timestamp,speed,battery,accuracy,altitude")
          .gte("timestamp", since)
          .order("timestamp", { ascending: true })
          .limit(20000);
        if (cutoff) locQ = locQ.lte("timestamp", cutoff);

        const evQ = supabase
          .from("events")
          .select("id,type,title,notes,lat,lon,timestamp,cost")
          .gte("timestamp", since)
          .order("timestamp", { ascending: true })
          .limit(5000);

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
          setEvents((prev) => sortByTime([...prev, row]));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return { locations, events, loading, error };
}
