// Supabase Edge Function — OwnTracks webhook
//
// Deploy:
//   supabase secrets set OWNTRACKS_SHARED_SECRET="<long random string>"
//   supabase functions deploy owntracks --no-verify-jwt
//
// The --no-verify-jwt flag is required because OwnTracks can't send a
// Supabase JWT. We authenticate instead with our own bearer token.
//
// Point OwnTracks at: https://<project-ref>.functions.supabase.co/owntracks
//   Settings -> Mode: HTTP
//   Headers: Authorization: Bearer <OWNTRACKS_SHARED_SECRET>

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OWNTRACKS_SHARED_SECRET = Deno.env.get("OWNTRACKS_SHARED_SECRET") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function unauthorized() {
  return new Response("unauthorized", { status: 401 });
}

function ok(body: unknown = []) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function extractBearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

Deno.serve(async (req) => {
  if (req.method === "GET") {
    return new Response("owntracks webhook ok", { status: 200 });
  }
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  if (!OWNTRACKS_SHARED_SECRET) {
    console.error("OWNTRACKS_SHARED_SECRET not set");
    return new Response("misconfigured", { status: 500 });
  }

  const provided = extractBearer(req);
  if (provided !== OWNTRACKS_SHARED_SECRET) {
    return unauthorized();
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  // OwnTracks sends either a single object or occasionally an array.
  const items = Array.isArray(payload) ? payload : [payload];

  const rows = items
    .filter((p) => p && p._type === "location" && typeof p.lat === "number" && typeof p.lon === "number")
    .map((p) => ({
      lat: p.lat,
      lon: p.lon,
      timestamp: typeof p.tst === "number"
        ? new Date(p.tst * 1000).toISOString()
        : new Date().toISOString(),
      speed: typeof p.vel === "number" ? p.vel : null, // km/h in OwnTracks
      battery: typeof p.batt === "number" ? p.batt : null,
      accuracy: typeof p.acc === "number" ? p.acc : null,
      altitude: typeof p.alt === "number" ? p.alt : null,
      raw: p,
    }));

  if (rows.length === 0) {
    // Non-location ping (e.g. _type: "lwt"). Acknowledge without inserting.
    return ok();
  }

  const { data: active, error: activeErr } = await supabase.rpc("is_run_active");
  if (activeErr) {
    console.error("is_run_active error", activeErr);
    return new Response("status check failed", { status: 500 });
  }
  if (!active) {
    // Run not started or stopped — acknowledge OwnTracks but do not record.
    return ok([]);
  }

  const { error } = await supabase.from("locations").insert(rows);
  if (error) {
    console.error("insert error", error);
    return new Response("insert failed", { status: 500 });
  }

  // OwnTracks expects an array of "friend" cards; empty array is fine.
  return ok([]);
});
