import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import simplify from "@turf/simplify";
import { featureCollection, lineString, point } from "@turf/helpers";
import type { EventRow, LocationRow } from "../lib/types";
import { EVENT_META } from "../lib/types";
import {
  ROUTE_START,
  ROUTE_END,
  routeOverviewCenter,
  routeOverviewZoom,
} from "../lib/route";
import { haversineMiles } from "../lib/stats";

type Props = {
  locations: LocationRow[];
  events: EventRow[];
  styleUrl?: string;
  loading?: boolean;
  onEventClick?: (e: EventRow) => void;
};

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
const DEFAULT_STYLE =
  (import.meta.env.VITE_MAPBOX_STYLE as string | undefined) ??
  "mapbox://styles/mapbox/dark-v11";
const INIT_LNG = Number(import.meta.env.VITE_MAP_INITIAL_LNG ?? -98.5795);
const INIT_LAT = Number(import.meta.env.VITE_MAP_INITIAL_LAT ?? 39.8283);
const INIT_ZOOM = Number(import.meta.env.VITE_MAP_INITIAL_ZOOM ?? 3.5);

if (TOKEN) mapboxgl.accessToken = TOKEN;

const EVENTS_SRC = "events";
const EVENTS_CIRCLE_LAYER = "events-markers";
const EVENTS_EMOJI_LAYER = "events-emojis";

const CURSOR_SRC = "cursor";
const CURSOR_HALO_LAYER = "cursor-halo";
const CURSOR_LAYER = "cursor-pulse";

const ROUTE_SRC = "route-driven";
const ROUTE_HALO_LAYER = "route-driven-halo";
const ROUTE_LAYER = "route-driven-line";

const ENDPOINTS_SRC = "route-endpoints";
const ENDPOINTS_LAYER = "route-endpoints-pins";

type MapViewMode = "location" | "route";

function buildEventsGeoJSON(events: EventRow[]) {
  return featureCollection(
    events.map((e) =>
      point([e.lon, e.lat], {
        id: e.id,
        type: e.type,
        title: e.title,
        notes: e.notes ?? "",
        emoji: EVENT_META[e.type]?.emoji ?? "📍",
        color: EVENT_META[e.type]?.color ?? "#000",
        timestamp: e.timestamp,
        cost: e.cost ?? null,
      })
    )
  );
}

function buildEndpointsGeoJSON() {
  return featureCollection([
    point(ROUTE_START, { role: "start", label: "Start" }),
    point(ROUTE_END, { role: "end", label: "Finish" }),
  ]);
}

// We only break the drawn line on a true GPS teleport (an impossibly fast jump
// that indicates a bad fix). Plain coverage gaps — e.g. OwnTracks being closed
// for a while — are bridged with a straight connector so the route stays
// continuous. This affects rendering only; speed/distance stats live in
// stats.ts and are unchanged.
function isGpsGlitch(prev: LocationRow, cur: LocationRow) {
  const d = haversineMiles(prev, cur);
  const dtHrs =
    (new Date(cur.timestamp).getTime() - new Date(prev.timestamp).getTime()) /
    3_600_000;
  const implied = dtHrs > 0 ? d / dtHrs : 0;
  return implied >= 600;
}

function buildRouteGeoJSON(locations: LocationRow[]) {
  if (locations.length < 2) return featureCollection([]);

  const segments: [number, number][][] = [];
  let current: [number, number][] = [[locations[0].lon, locations[0].lat]];

  for (let i = 1; i < locations.length; i++) {
    const prev = locations[i - 1];
    const cur = locations[i];
    if (isGpsGlitch(prev, cur)) {
      if (current.length >= 2) segments.push(current);
      current = [[cur.lon, cur.lat]];
    } else {
      current.push([cur.lon, cur.lat]);
    }
  }
  if (current.length >= 2) segments.push(current);
  if (segments.length === 0) return featureCollection([]);

  return featureCollection(
    segments.map((seg) => {
      let geom = lineString(seg);
      if (seg.length > 100) {
        geom = simplify(geom, { tolerance: 0.0001, highQuality: false });
      }
      return geom;
    })
  );
}

export default function Map({ locations, events, styleUrl, loading, onEventClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const loadedRef = useRef(false);
  const didInitialFitRef = useRef(false);
  const currentStyleRef = useRef<string | null>(null);
  const onEventClickRef = useRef(onEventClick);
  const viewModeRef = useRef<MapViewMode>("location");
  onEventClickRef.current = onEventClick;

  const [viewMode, setViewMode] = useState<MapViewMode>("location");
  const [mapReady, setMapReady] = useState(false);

  const eventsGeo = useMemo(() => buildEventsGeoJSON(events), [events]);
  const routeGeo = useMemo(() => buildRouteGeoJSON(locations), [locations]);
  const last = locations[locations.length - 1];

  const locationsRef = useRef(locations);
  const eventsRef = useRef(events);
  const lastRef = useRef(last);
  const routeGeoRef = useRef(routeGeo);
  const eventsGeoRef = useRef(eventsGeo);
  locationsRef.current = locations;
  eventsRef.current = events;
  lastRef.current = last;
  routeGeoRef.current = routeGeo;
  eventsGeoRef.current = eventsGeo;

  const applyMapView = useCallback((mode: MapViewMode) => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;

    map.stop();

    if (mode === "location") {
      const padding = focusPadding();
      const cur = lastRef.current;
      if (cur) {
        map.flyTo({
          center: [cur.lon, cur.lat],
          zoom: 9,
          duration: 800,
          padding,
          essential: true,
        });
      } else {
        map.flyTo({
          center: [INIT_LNG, INIT_LAT],
          zoom: INIT_ZOOM,
          duration: 800,
          essential: true,
        });
      }
      return;
    }

    map.flyTo({
      center: routeOverviewCenter(),
      zoom: routeOverviewZoom(),
      padding: routeOverviewPadding(),
      duration: 1000,
      essential: true,
    });
  }, []);

  const setMapView = useCallback(
    (mode: MapViewMode) => {
      viewModeRef.current = mode;
      setViewMode(mode);

      const run = () => applyMapView(mode);
      if (mapRef.current?.isStyleLoaded()) {
        run();
      } else {
        mapRef.current?.once("load", run);
        mapRef.current?.once("style.load", run);
      }
    },
    [applyMapView]
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!TOKEN) {
      containerRef.current.innerHTML =
        "<div class='h-full w-full flex items-center justify-center text-sm text-white/60 p-6 text-center bg-zinc-900'>Set <code>VITE_MAPBOX_TOKEN</code> in <code>frontend/.env</code> to render the map.</div>";
      return;
    }
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: styleUrl ?? DEFAULT_STYLE,
      center: [last?.lon ?? INIT_LNG, last?.lat ?? INIT_LAT],
      zoom: last ? 5 : INIT_ZOOM,
      projection: "mercator",
      pitch: 0,
      maxPitch: 0,
      dragRotate: false,
      touchPitch: false,
      attributionControl: true,
      cooperativeGestures: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    const addOverlays = () => {
      simplifyBasemap(map);

      // Driven route
      safeRemoveLayer(map, ROUTE_LAYER);
      safeRemoveLayer(map, ROUTE_HALO_LAYER);
      safeRemoveSource(map, ROUTE_SRC);
      map.addSource(ROUTE_SRC, { type: "geojson", data: routeGeoRef.current as any });
      map.addLayer({
        id: ROUTE_HALO_LAYER,
        type: "line",
        source: ROUTE_SRC,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#1e3a5f",
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, 12, 5, 9, 8, 6, 12, 9],
          "line-opacity": 0.85,
        },
      });
      map.addLayer({
        id: ROUTE_LAYER,
        type: "line",
        source: ROUTE_SRC,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#3ea8ff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, 7, 5, 5.5, 8, 4, 12, 6],
          "line-opacity": 0.95,
        },
      });

      // Endpoints
      safeRemoveLayer(map, ENDPOINTS_LAYER);
      safeRemoveSource(map, ENDPOINTS_SRC);
      map.addSource(ENDPOINTS_SRC, { type: "geojson", data: buildEndpointsGeoJSON() as any });
      map.addLayer({
        id: ENDPOINTS_LAYER,
        type: "circle",
        source: ENDPOINTS_SRC,
        paint: {
          "circle-radius": 7,
          "circle-color": [
            "match",
            ["get", "role"],
            "start", "#31c26d",
            "end", "#c23168",
            "#888",
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#0b0f14",
        },
      });

      // Events
      safeRemoveLayer(map, EVENTS_EMOJI_LAYER);
      safeRemoveLayer(map, EVENTS_CIRCLE_LAYER);
      safeRemoveSource(map, EVENTS_SRC);
      map.addSource(EVENTS_SRC, { type: "geojson", data: eventsGeoRef.current as any });
      map.addLayer({
        id: EVENTS_CIRCLE_LAYER,
        type: "circle",
        source: EVENTS_SRC,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 4, 10, 6, 14, 8],
          "circle-color": ["get", "color"],
          "circle-opacity": 0.95,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#0b0f14",
        },
      });
      map.addLayer({
        id: EVENTS_EMOJI_LAYER,
        type: "symbol",
        source: EVENTS_SRC,
        layout: {
          "text-field": ["get", "emoji"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 3, 14, 10, 18, 14, 22],
          "text-allow-overlap": true,
          "text-anchor": "center",
        },
        paint: { "text-opacity": 0.95 },
      });

      // Cursor
      safeRemoveLayer(map, CURSOR_LAYER);
      safeRemoveLayer(map, CURSOR_HALO_LAYER);
      safeRemoveSource(map, CURSOR_SRC);
      const curLast = lastRef.current;
      map.addSource(CURSOR_SRC, {
        type: "geojson",
        data: curLast
          ? (point([curLast.lon, curLast.lat]) as any)
          : (featureCollection([]) as any),
      });
      map.addLayer({
        id: CURSOR_HALO_LAYER,
        type: "circle",
        source: CURSOR_SRC,
        paint: {
          "circle-radius": 18,
          "circle-color": "#ff4d4d",
          "circle-opacity": 0.25,
          "circle-blur": 0.6,
        },
      });
      map.addLayer({
        id: CURSOR_LAYER,
        type: "circle",
        source: CURSOR_SRC,
        paint: {
          "circle-radius": 7,
          "circle-color": "#ff4d4d",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
        },
      });

      // Handlers (bind once per style load; Mapbox clears them on setStyle)
      map.off("click", EVENTS_CIRCLE_LAYER, showEventPopup);
      map.off("click", EVENTS_EMOJI_LAYER, showEventPopup);
      map.on("click", EVENTS_CIRCLE_LAYER, showEventPopup);
      map.on("click", EVENTS_EMOJI_LAYER, showEventPopup);
      map.on("mouseenter", EVENTS_CIRCLE_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", EVENTS_CIRCLE_LAYER, () => (map.getCanvas().style.cursor = ""));
      map.on("mouseenter", EVENTS_EMOJI_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", EVENTS_EMOJI_LAYER, () => (map.getCanvas().style.cursor = ""));

      map.off("click", ENDPOINTS_LAYER, showEndpointPopup);
      map.on("click", ENDPOINTS_LAYER, showEndpointPopup);
    };

    const showEventPopup = (e: mapboxgl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const props = f.properties as any;
      const id = Number(props.id);
      const ev = events.find((x) => x.id === id);
      if (ev && onEventClickRef.current) onEventClickRef.current(ev);

      const coords = (f.geometry as any).coordinates.slice() as [number, number];
      const title = ev?.title ?? String(props.title ?? "");
      const emoji = ev ? EVENT_META[ev.type]?.emoji ?? "📍" : String(props.emoji ?? "📍");
      const when = new Date(ev?.timestamp ?? props.timestamp).toLocaleString();

      const rawNotes = ev?.notes ?? (props.notes === "null" ? "" : String(props.notes ?? ""));
      const notes =
        rawNotes && rawNotes.trim().length > 0
          ? `<div class='mt-2'>
               <div class='text-[10px] uppercase tracking-wider opacity-60'>Notes</div>
               <div class='mt-1 text-sm' style='white-space:pre-wrap'>${escapeHtml(rawNotes)}</div>
             </div>`
          : "";

      const rawCost = ev?.cost ?? (props.cost === "null" ? null : props.cost);
      const cost =
        rawCost != null && rawCost !== ""
          ? `<div class='mt-2 text-xs opacity-60'>$${Number(rawCost).toFixed(2)}</div>`
          : "";
      new mapboxgl.Popup({ closeButton: true, maxWidth: "280px" })
        .setLngLat(coords)
        .setHTML(
          `<div style="color:#0b0f14;font-family:Inter,ui-sans-serif,system-ui">
             <div style="font-weight:600">${emoji} ${escapeHtml(title)}</div>
             <div style="font-size:12px;opacity:.65">${when}</div>
             ${notes}
             ${cost}
           </div>`
        )
        .addTo(map);
    };

    const showEndpointPopup = (e: mapboxgl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const coords = (f.geometry as any).coordinates.slice() as [number, number];
      const props = f.properties as any;
      new mapboxgl.Popup({ closeButton: true })
        .setLngLat(coords)
        .setHTML(`<div class='font-semibold'>${escapeHtml(String(props.label))}</div>`)
        .addTo(map);
    };

    map.on("load", () => {
      loadedRef.current = true;
      currentStyleRef.current = styleUrl ?? DEFAULT_STYLE;
      map.setProjection("mercator");
      addOverlays();
      setMapReady(true);
    });
    map.on("style.load", () => {
      if (!loadedRef.current) return;
      map.setProjection("mercator");
      addOverlays();
    });

    return () => {
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
      didInitialFitRef.current = false;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const src = map.getSource(ROUTE_SRC) as mapboxgl.GeoJSONSource | undefined;
    src?.setData(routeGeo as any);
  }, [routeGeo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const src = map.getSource(EVENTS_SRC) as mapboxgl.GeoJSONSource | undefined;
    src?.setData(eventsGeo as any);
  }, [eventsGeo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !last) return;
    const src = map.getSource(CURSOR_SRC) as mapboxgl.GeoJSONSource | undefined;
    src?.setData(point([last.lon, last.lat]) as any);
  }, [last]);

  // Live theme switching.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const next = styleUrl ?? DEFAULT_STYLE;
    if (currentStyleRef.current === next) return;
    currentStyleRef.current = next;
    map.setStyle(next);
    map.once("style.load", () => {
      map.setProjection("mercator");
      applyMapView(viewModeRef.current);
    });
  }, [styleUrl, applyMapView]);

  useEffect(() => {
    if (!mapReady || loading || didInitialFitRef.current) return;
    applyMapView("location");
    didInitialFitRef.current = true;
  }, [mapReady, loading, applyMapView]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {TOKEN && (
        <div className="absolute z-20 top-3 left-3 lg:top-auto lg:left-auto lg:bottom-4 lg:right-3 flex items-center gap-1 rounded-xl border border-white/10 bg-zinc-900/90 backdrop-blur-md p-1 shadow-lg pointer-events-auto touch-manipulation">
          <ViewButton
            active={viewMode === "location"}
            label="Me"
            title="Focus on my location"
            onClick={() => setMapView("location")}
          />
          <ViewButton
            active={viewMode === "route"}
            label="Route"
            title="Show full route"
            onClick={() => setMapView("route")}
          />
        </div>
      )}
    </div>
  );
}

// Hide basemap clutter so the map stays clean at a country-wide zoom.
// Removes roads, transit, POIs, building fills, and small labels — keeps
// water, land, admin boundaries (state + country), and place labels.
function simplifyBasemap(map: mapboxgl.Map) {
  const HIDE_PREFIXES = [
    "road",
    "bridge",
    "tunnel",
    "motorway",
    "highway",
    "trunk",
    "primary",
    "secondary",
    "tertiary",
    "street",
    "path",
    "pedestrian",
    "rail",
    "transit",
    "aeroway",
    "ferry",
    "building",
    "poi",
    "airport",
    "waterway-label",
    "natural-point-label",
    "natural-line-label",
  ];
  const style = map.getStyle();
  if (!style?.layers) return;
  for (const layer of style.layers) {
    const id = layer.id.toLowerCase();
    if (HIDE_PREFIXES.some((p) => id.includes(p))) {
      try {
        map.setLayoutProperty(layer.id, "visibility", "none");
      } catch {
        // some layers don't support visibility toggle — skip silently
      }
    }
  }
}

function safeRemoveLayer(map: mapboxgl.Map, id: string) {
  if (map.getLayer(id)) {
    try {
      map.removeLayer(id);
    } catch {
      // ignore
    }
  }
}

function safeRemoveSource(map: mapboxgl.Map, id: string) {
  if (map.getSource(id)) {
    try {
      map.removeSource(id);
    } catch {
      // ignore
    }
  }
}

function routeOverviewPadding(): mapboxgl.PaddingOptions {
  const mobile = window.matchMedia("(max-width: 1023px)").matches;
  if (mobile) return { top: 56, bottom: 56, left: 32, right: 32 };
  return { top: 120, bottom: 48, left: 360, right: 400 };
}

function focusPadding(): mapboxgl.PaddingOptions {
  const mobile = window.matchMedia("(max-width: 1023px)").matches;
  if (mobile) return { top: 72, bottom: 320, left: 24, right: 24 };
  return { top: 180, bottom: 48, left: 360, right: 48 };
}

function ViewButton({
  active,
  label,
  title,
  onClick,
}: {
  active: boolean;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={
        "px-3 py-2 text-[11px] font-semibold rounded-lg transition touch-manipulation pointer-events-auto " +
        (active
          ? "bg-white text-zinc-900"
          : "text-white/60 hover:text-white hover:bg-white/5")
      }
    >
      {label}
    </button>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
