import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Map from "../components/Map";
import Stats from "../components/Stats";
import Timeline from "../components/Timeline";
import { useTripData } from "../lib/useTripData";
import {
  getStoredMapThemeMode,
  resolveMapStyle,
  setStoredMapThemeMode,
  type MapThemeMode,
} from "../lib/mapTheme";

export default function Home() {
  const { locations, events, runInfo, setRunInfo, loading, error } = useTripData();
  const [mapThemeMode, setMapThemeMode] = useState<MapThemeMode>(() => {
    try {
      return getStoredMapThemeMode();
    } catch {
      return "auto";
    }
  });
  const [clockTick, setClockTick] = useState(0);

  useEffect(() => {
    // Re-evaluate auto mode on the hour so it flips around day/night.
    const id = setInterval(() => setClockTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const styleUrl = useMemo(
    () => resolveMapStyle(mapThemeMode, new Date()),
    [mapThemeMode, clockTick]
  );

  return (
    <div className="h-full w-full flex flex-col lg:grid lg:grid-cols-[1fr_380px] lg:grid-rows-[auto_1fr] bg-zinc-950 text-white">
      <header className="lg:col-span-2 flex items-center justify-between px-4 md:px-6 py-3 border-b border-white/5 bg-black/40 backdrop-blur">
        <div className="flex items-baseline gap-3">
          <h1 className="font-semibold text-lg tracking-tight">Golden Run</h1>
          <div className="text-xs text-white/40 hidden sm:block">
            {loading ? "loading…" : error ? `error: ${error}` : "tracking"}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle
            mode={mapThemeMode}
            onChange={(m) => {
              setMapThemeMode(m);
              try {
                setStoredMapThemeMode(m);
              } catch {
                // ignore
              }
            }}
          />
          <Link to="/log" className="text-sm text-white/70 hover:text-white transition">
            Log entry →
          </Link>
        </div>
      </header>

      <div className="relative flex-1 min-h-[45vh] lg:min-h-0 lg:row-span-1">
        <Map locations={locations} events={events} styleUrl={styleUrl} loading={loading} />
        <div className="absolute left-3 md:left-4 top-3 z-10 hidden lg:block">
          <Stats locations={locations} runInfo={runInfo} onRunInfoChange={setRunInfo} />
        </div>
      </div>

      <aside className="shrink-0 lg:border-l border-t lg:border-t-0 border-white/5 bg-zinc-950 flex flex-col lg:min-h-0 lg:overflow-hidden">
        <div className="lg:hidden p-3 pb-0">
          <Stats locations={locations} runInfo={runInfo} onRunInfoChange={setRunInfo} className="max-w-none" />
        </div>
        <div className="p-3 lg:p-4 flex flex-col min-h-[30vh] lg:min-h-0 flex-1 lg:overflow-hidden">
          <Timeline events={events} />
        </div>
      </aside>
    </div>
  );
}

function ThemeToggle({
  mode,
  onChange,
}: {
  mode: MapThemeMode;
  onChange: (m: MapThemeMode) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
      <button
        className={btn(mode === "auto")}
        onClick={() => onChange("auto")}
        type="button"
        title="Auto (day/night)"
      >
        Auto
      </button>
      <button
        className={btn(mode === "dark")}
        onClick={() => onChange("dark")}
        type="button"
        title="Dark"
      >
        Dark
      </button>
      <button
        className={btn(mode === "light")}
        onClick={() => onChange("light")}
        type="button"
        title="Light"
      >
        Light
      </button>
    </div>
  );
}

function btn(active: boolean) {
  return (
    "px-2.5 py-1 text-[11px] font-semibold rounded-lg transition " +
    (active
      ? "bg-white text-zinc-900"
      : "text-white/60 hover:text-white hover:bg-white/5")
  );
}
