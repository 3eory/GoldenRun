import { CANNONBALL_WAYPOINTS } from "../config/cannonball";

const coords = CANNONBALL_WAYPOINTS.map((w) => w.coord);

export const ROUTE_TOTAL_MI = 2800;

export const ROUTE_START: [number, number] = coords[0];
export const ROUTE_END: [number, number] = coords[coords.length - 1];

/** Fixed overview for the full Cannonball corridor (NYC → California). */
export const ROUTE_OVERVIEW_CENTER_DESKTOP: [number, number] = [-93.0, 39.5];
export const ROUTE_OVERVIEW_CENTER_MOBILE: [number, number] = [-96.0, 39.5];
export const ROUTE_OVERVIEW_ZOOM_DESKTOP = 3.1;
export const ROUTE_OVERVIEW_ZOOM_MOBILE = 2.6;

export function routeOverviewCenter(): [number, number] {
  if (typeof window === "undefined") return ROUTE_OVERVIEW_CENTER_DESKTOP;
  return window.matchMedia("(max-width: 1023px)").matches
    ? ROUTE_OVERVIEW_CENTER_MOBILE
    : ROUTE_OVERVIEW_CENTER_DESKTOP;
}

export function routeOverviewZoom(): number {
  if (typeof window === "undefined") return ROUTE_OVERVIEW_ZOOM_DESKTOP;
  return window.matchMedia("(max-width: 1023px)").matches
    ? ROUTE_OVERVIEW_ZOOM_MOBILE
    : ROUTE_OVERVIEW_ZOOM_DESKTOP;
}

export function getRouteOverviewBounds(): [[number, number], [number, number]] {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const w of CANNONBALL_WAYPOINTS) {
    const [lng, lat] = w.coord;
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

export type RouteProgress = {
  coveredMi: number;
  remainingMi: number;
  totalMi: number;
  offRouteMi: number;
  nearestCoord: [number, number] | null;
};

export function computeRouteProgress(coveredMi: number): RouteProgress {
  const covered = Math.max(0, coveredMi);
  return {
    coveredMi: covered,
    remainingMi: Math.max(0, ROUTE_TOTAL_MI - covered),
    totalMi: ROUTE_TOTAL_MI,
    offRouteMi: 0,
    nearestCoord: null,
  };
}
