import { CANNONBALL_WAYPOINTS } from "../config/cannonball";

const coords = CANNONBALL_WAYPOINTS.map((w) => w.coord);

export const ROUTE_TOTAL_MI = 2800;

export const ROUTE_START: [number, number] = coords[0];
export const ROUTE_END: [number, number] = coords[coords.length - 1];

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
