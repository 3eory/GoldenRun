import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anon) {
  console.warn(
    "[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not set. " +
      "Copy frontend/.env.example to frontend/.env and fill them in."
  );
}

export const supabase = createClient(url ?? "http://localhost", anon ?? "public-anon", {
  realtime: { params: { eventsPerSecond: 5 } },
});

export const PUBLIC_DELAY_MINUTES = Number(
  import.meta.env.VITE_PUBLIC_DELAY_MINUTES ?? 0
);
