export type MapThemeMode = "auto" | "dark" | "light";

const KEY = "goldenrun.mapThemeMode";

export function getStoredMapThemeMode(): MapThemeMode {
  const v = localStorage.getItem(KEY);
  if (v === "dark" || v === "light" || v === "auto") return v;
  return "auto";
}

export function setStoredMapThemeMode(mode: MapThemeMode) {
  localStorage.setItem(KEY, mode);
}

export function resolveMapStyle(mode: MapThemeMode, at: Date = new Date()) {
  if (mode === "dark") return "mapbox://styles/mapbox/dark-v11";
  if (mode === "light") return "mapbox://styles/mapbox/outdoors-v12";

  const hour = at.getHours();
  const isNight = hour >= 19 || hour < 7;
  return isNight
    ? "mapbox://styles/mapbox/dark-v11"
    : "mapbox://styles/mapbox/outdoors-v12";
}

