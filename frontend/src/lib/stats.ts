import type { LocationRow, EventRow } from "./types";

const EARTH_RADIUS_MI = 3958.7613;

export function haversineMiles(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(h));
}

export type TripStats = {
  totalMiles: number;
  milesToday: number;
  days: number;
  topSpeedMph: number;
  avgSpeedMph: number;
  statesVisited: string[];
  lastPing: LocationRow | null;
  lastPingAgeMs: number | null;
};

function kmhToMph(kmh: number | null | undefined) {
  if (kmh == null) return 0;
  return kmh * 0.621371;
}

export function computeStats(
  locations: LocationRow[],
  statesResolver?: (loc: LocationRow) => string | null
): TripStats {
  if (locations.length === 0) {
    return {
      totalMiles: 0,
      milesToday: 0,
      days: 0,
      topSpeedMph: 0,
      avgSpeedMph: 0,
      statesVisited: [],
      lastPing: null,
      lastPingAgeMs: null,
    };
  }

  // Incoming rows are expected in chronological order (ascending timestamp).
  let total = 0;
  let today = 0;
  let top = 0;
  let speedSum = 0;
  let speedSamples = 0;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();

  const states = new Set<string>();

  for (let i = 0; i < locations.length; i++) {
    const cur = locations[i];
    if (i > 0) {
      const prev = locations[i - 1];
      // Drop GPS glitches — >500mph in a single sample means bad fix
      const d = haversineMiles(prev, cur);
      const dtHrs =
        (new Date(cur.timestamp).getTime() - new Date(prev.timestamp).getTime()) /
        3_600_000;
      const implied = dtHrs > 0 ? d / dtHrs : 0;
      if (implied < 500 && d < 50) {
        total += d;
        if (new Date(cur.timestamp).getTime() >= todayMs) {
          today += d;
        }
      }
    }

    const mph = kmhToMph(cur.speed);
    if (mph > top) top = mph;
    if (mph > 0) {
      speedSum += mph;
      speedSamples += 1;
    }

    if (statesResolver) {
      const st = statesResolver(cur);
      if (st) states.add(st);
    }
  }

  const first = new Date(locations[0].timestamp).getTime();
  const last = new Date(locations[locations.length - 1].timestamp).getTime();
  const days = Math.max(1, Math.ceil((last - first) / 86_400_000));
  const avg = speedSamples > 0 ? speedSum / speedSamples : 0;

  const lastPing = locations[locations.length - 1];
  return {
    totalMiles: total,
    milesToday: today,
    days,
    topSpeedMph: top,
    avgSpeedMph: avg,
    statesVisited: Array.from(states).sort(),
    lastPing,
    lastPingAgeMs: Date.now() - last,
  };
}

export function sortByTime<T extends { timestamp: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

export function sinceHuman(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function formatMiles(n: number): string {
  if (n < 10) return n.toFixed(1);
  return Math.round(n).toLocaleString();
}

export function eventCount(events: EventRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1;
  return counts;
}

export function averageSpeedMphOverLastMiles(
  locations: LocationRow[],
  miles: number
): number | null {
  if (locations.length < 2) return null;

  // Work backwards accumulating distance until we hit `miles`.
  let dist = 0;
  let i = locations.length - 1;
  const end = locations[i];
  let start = end;

  while (i > 0 && dist < miles) {
    const cur = locations[i];
    const prev = locations[i - 1];
    const d = haversineMiles(prev, cur);
    const dtHrs =
      (new Date(cur.timestamp).getTime() - new Date(prev.timestamp).getTime()) /
      3_600_000;
    const implied = dtHrs > 0 ? d / dtHrs : 0;
    // Ignore obvious glitches.
    if (implied < 500 && d < 50) {
      dist += d;
      start = prev;
    }
    i -= 1;
  }

  if (dist < 1) return null;
  const dtHrs =
    (new Date(end.timestamp).getTime() - new Date(start.timestamp).getTime()) /
    3_600_000;
  if (dtHrs <= 0) return null;
  const mph = dist / dtHrs;
  if (!Number.isFinite(mph) || mph < 1) return null;
  return mph;
}
