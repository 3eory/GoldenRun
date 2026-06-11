import type { LocationRow } from "./types";

// Lightweight US-states point-in-polygon, loaded on demand.
// We use the public US states GeoJSON hosted by PublicaMundi (no key required).
// https://github.com/PublicaMundi/MappingAPI/blob/master/data/geojson/us-states.json
const GEOJSON_URL =
  "https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json";

type PolyFeature = {
  name: string;
  bbox: [number, number, number, number]; // minLon, minLat, maxLon, maxLat
  rings: number[][][]; // [polygon][vertex][lon,lat]
};

let cache: PolyFeature[] | null = null;
let loading: Promise<PolyFeature[]> | null = null;

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

async function load(): Promise<PolyFeature[]> {
  if (cache) return cache;
  if (loading) return loading;
  loading = fetch(GEOJSON_URL)
    .then((r) => r.json())
    .then((gj: any) => {
      const out: PolyFeature[] = [];
      for (const f of gj.features ?? []) {
        const name = f.properties?.name ?? f.properties?.NAME ?? "Unknown";
        const geom = f.geometry;
        if (!geom) continue;
        const rings: number[][][] = [];
        if (geom.type === "Polygon") {
          rings.push(geom.coordinates[0]);
        } else if (geom.type === "MultiPolygon") {
          for (const poly of geom.coordinates) rings.push(poly[0]);
        }
        if (rings.length === 0) continue;
        let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
        for (const r of rings) {
          for (const [lng, lat] of r) {
            if (lng < minLon) minLon = lng;
            if (lng > maxLon) maxLon = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
          }
        }
        out.push({ name, bbox: [minLon, minLat, maxLon, maxLat], rings });
      }
      cache = out;
      return out;
    });
  return loading;
}

export function ensureStatesLoaded(): Promise<void> {
  return load().then(() => undefined);
}

export function resolveState(loc: LocationRow): string | null {
  if (!cache) return null;
  const { lat, lon } = loc;
  for (const f of cache) {
    const [minLon, minLat, maxLon, maxLat] = f.bbox;
    if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue;
    for (const ring of f.rings) {
      if (pointInRing(lon, lat, ring)) return f.name;
    }
  }
  return null;
}
