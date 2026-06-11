# Golden Run

A cross-country trip tracker. Your iPhone pings location via **OwnTracks** to a **Supabase** Edge Function, and a **Vite + React + Mapbox** site renders your live route, trip stats, and a timeline of manual entries (gas, food, sights, sleep, notes). Hosted free on **Netlify**.

```
iPhone OwnTracks ──► Supabase Edge Function ──► locations table
       You on /log ──► Supabase RPC        ──► events    table
Netlify site ◄── realtime subscribe ──────────┘
```

- [`frontend/`](frontend) — the public website
- [`supabase/`](supabase) — database migration + OwnTracks webhook edge function
- [`connections-checklist.md`](connections-checklist.md) — accounts, tokens, and phone setup
- [`trip-tracker-plan.md`](trip-tracker-plan.md) — original product spec

---

## Quick start

### 0. Prerequisites

- Node 20+
- A Supabase project — https://supabase.com (free tier is fine)
- The Supabase CLI — `brew install supabase/tap/supabase`
- A Mapbox public token — https://account.mapbox.com

### 1. Database

```bash
supabase link --project-ref <YOUR_PROJECT_REF>
supabase db push
```

Then set the log-page secret used by the `insert_event` RPC. In the Supabase **SQL Editor**, run:

```sql
insert into public.app_config (key, value)
values ('log_secret', '<pick a long random string>')
on conflict (key) do update set value = excluded.value;
```

The `app_config` table has RLS with no read policies, so anon clients can't read it — only the `SECURITY DEFINER` RPC can. Remember that random string; it becomes `VITE_LOG_RPC_SECRET` in the frontend.

### Optional: admin secret (start time + reset run)

If you want to use **Set start to now** and **Reset the run** in the UI, set an admin secret:

```sql
insert into public.app_config (key, value)
values ('admin_secret', '<pick another long random string>')
on conflict (key) do update set value = excluded.value;
```

Then set `VITE_ADMIN_RPC_SECRET` in `frontend/.env` to the same string.

### 2. OwnTracks webhook (Edge Function)

```bash
# pick another long random string — this is what OwnTracks will send
supabase secrets set OWNTRACKS_SHARED_SECRET="<random>"
supabase functions deploy owntracks --no-verify-jwt
```

Your webhook URL is:
```
https://<project-ref>.functions.supabase.co/owntracks
```

In the **OwnTracks** iPhone app:

1. Settings → **Mode: HTTP**
2. URL: paste the above
3. Headers → add `Authorization: Bearer <OWNTRACKS_SHARED_SECRET>`
4. Set reporting interval to 5 min, Significant + Move modes on
5. Grant **Always Allow** location permission

### 3. Frontend

```bash
cd frontend
cp .env.example .env   # fill in VITE_* values
npm install
npm run dev
```

Open http://localhost:5173 — you should see the map; hit `/log` to file a test entry.

### 4. Deploy to Netlify

1. Push this repo to GitHub
2. Netlify → **Add new site → Import from GitHub** → pick the repo
3. Build settings are already in [`netlify.toml`](netlify.toml) (base = `frontend`, publish = `dist`)
4. Add the same `VITE_*` env vars in **Site settings → Environment variables**
5. Deploy. Bookmark the resulting URL.

---

## How each piece works

| File | Does |
|---|---|
| [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) | Creates `locations` + `events` tables, locks them down with RLS (public read only), and defines the `insert_event` RPC that gates writes with a shared secret. |
| [`supabase/functions/owntracks/index.ts`](supabase/functions/owntracks/index.ts) | Receives OwnTracks POSTs, checks the `Authorization: Bearer` header, inserts into `locations` using the service-role key. |
| [`frontend/src/lib/useTripData.ts`](frontend/src/lib/useTripData.ts) | Fetches the last 30 days of both tables and subscribes to realtime `INSERT`s so the map updates without reloading. |
| [`frontend/src/components/Map.tsx`](frontend/src/components/Map.tsx) | Mapbox GL JS map with a Douglas-Peucker-simplified route line, emoji event pins, and a pulsing "you are here" dot. |
| [`frontend/src/lib/stats.ts`](frontend/src/lib/stats.ts) | Haversine distance, top/avg speed, states visited, miles-today vs total. Drops GPS glitch samples. |
| [`frontend/src/lib/states.ts`](frontend/src/lib/states.ts) | Client-side point-in-polygon against a public US-states GeoJSON (no extra API calls). |
| [`frontend/src/pages/Log.tsx`](frontend/src/pages/Log.tsx) | Password-gated entry form. Grabs current location via `navigator.geolocation`, inserts via `insert_event` RPC. |

---

## Security model (short version)

- `locations` and `events` are publicly **readable** — the whole point of the site is to share the trip
- Neither table has an INSERT policy, so the anon key cannot write
- Location rows are only inserted via the edge function (service-role key) after a shared-secret header check
- Event rows are only inserted via the `insert_event` RPC after a shared-secret argument check
- `VITE_LOG_PAGE_PASSWORD` is a soft gate (lives in the JS bundle); `VITE_LOG_RPC_SECRET` is what actually protects writes and is also in the bundle — so anyone who grabs the built JS can post events. That's fine for a trip tracker; rotate the secret if you need to lock it down.
- For real safety, set `VITE_PUBLIC_DELAY_MINUTES=30` so the public map lags your actual location.

---

## Scripts

In `frontend/`:

- `npm run dev` — local dev server
- `npm run build` — production build (same as Netlify runs)
- `npm run typecheck` — tsc only

---

## Pre-trip checklist

See [`connections-checklist.md`](connections-checklist.md) — the shortest path is:

1. Create Supabase + Mapbox + Netlify accounts
2. `supabase db push` and set the `app.settings.log_secret` GUC
3. `supabase functions deploy owntracks`
4. Fill `frontend/.env`, deploy to Netlify
5. Configure OwnTracks on the phone
6. Test drive before you leave

Have a good run.
