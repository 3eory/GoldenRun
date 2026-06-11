import { useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { featureCollection, point } from "@turf/helpers";
import type { EventRow, LocationRow } from "../lib/types";
import { EVENT_META } from "../lib/types";
import { ROUTE_START, ROUTE_END } from "../lib/route";

type Props = {
  locations: LocationRow[];
  events: EventRow[];
  styleUrl?: string;
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

const ENDPOINTS_SRC = "route-endpoints";
const ENDPOINTS_LAYER = "route-endpoints-pins";

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

export default function Map({ locations, events, styleUrl, onEventClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const loadedRef = useRef(false);
  const didInitialFitRef = useRef(false);
  const currentStyleRef = useRef<string | null>(null);
  const onEventClickRef = useRef(onEventClick);
  onEventClickRef.current = onEventClick;

  const eventsGeo = useMemo(() => buildEventsGeoJSON(events), [events]);
  const last = locations[locations.length - 1];

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
      attributionControl: true,
      cooperativeGestures: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    const addOverlays = () => {
      simplifyBasemap(map);

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
      map.addSource(EVENTS_SRC, { type: "geojson", data: eventsGeo as any });
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
      map.addSource(CURSOR_SRC, {
        type: "geojson",
        data: last
          ? (point([last.lon, last.lat]) as any)
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
      addOverlays();
    });
    map.on("style.load", () => {
      if (!loadedRef.current) return;
      addOverlays();
    });

    return () => {
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
      didInitialFitRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    didInitialFitRef.current = false; // refit after style change
    map.setStyle(next);
  }, [styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    if (didInitialFitRef.current) return;

    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend(ROUTE_START);
    bounds.extend(ROUTE_END);
    if (last) bounds.extend([last.lon, last.lat]);

    map.fitBounds(bounds, {
      padding: { top: 200, bottom: 60, left: 340, right: 60 },
      duration: 800,
      maxZoom: 10,
    });
    didInitialFitRef.current = true;
  }, [last]);

  return <div ref={containerRef} className="h-full w-full" />;
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
