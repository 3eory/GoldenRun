export type LocationRow = {
  id: number;
  lat: number;
  lon: number;
  timestamp: string;
  speed: number | null;
  battery: number | null;
  accuracy: number | null;
  altitude?: number | null;
};

export type EventType = "gas" | "food" | "sight" | "sleep" | "note";

export type EventRow = {
  id: number;
  type: EventType;
  title: string;
  notes: string | null;
  lat: number;
  lon: number;
  timestamp: string;
  cost: number | null;
};

export const EVENT_META: Record<EventType, { emoji: string; label: string; color: string }> = {
  gas:   { emoji: "⛽", label: "Gas",     color: "#e85d2a" },
  food:  { emoji: "🍔", label: "Food",    color: "#c89b57" },
  sight: { emoji: "📸", label: "Sight",   color: "#3f6b49" },
  sleep: { emoji: "🏕️", label: "Sleep",   color: "#4b6fb0" },
  note:  { emoji: "📝", label: "Note",    color: "#6b6b6b" },
};
