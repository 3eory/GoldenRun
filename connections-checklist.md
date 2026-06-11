# Connections & Setup Checklist

Everything you personally need to sign up for, install, or copy/paste before (and during) the build. Work top-down — later items depend on earlier ones.

---

## 1. Accounts to Create (all free tiers)

- [ ] **Supabase** — https://supabase.com
  - Create a new project (pick a region close to where you'll start the trip)
  - Save the **Project URL** and **anon public API key** (Project Settings → API)
  - Save the **service role key** (only used server-side in the Edge Function — never ship to the frontend)
- [ ] **Mapbox** — https://account.mapbox.com/auth/signup
  - Create account, grab a **public access token** (starts with `pk.`)
  - Optional: create a URL-restricted token once the site is deployed
- [ ] **Netlify** — https://app.netlify.com/signup
  - Sign up with GitHub so deploys are automatic on push
- [ ] **GitHub** — if you don't already have an account, create one; we'll put the repo here

---

## 2. Phone App

- [ ] Install **OwnTracks** on your iPhone (App Store, free)
- [ ] In the app, go to Settings → **Mode: HTTP**
- [ ] Set the **URL** to your Supabase Edge Function endpoint (we'll give you the exact URL after deploy, format: `https://<project-ref>.functions.supabase.co/owntracks`)
- [ ] Add an **Authorization header** with a shared secret (we'll generate one — treat it like a password)
- [ ] Set reporting interval: **"Move" mode, every 5 minutes**
- [ ] Grant **Always Allow** location permission (required for background updates while driving)

---

## 3. Secrets You'll Paste Into the Project

Keep these in a password manager until you need them. You'll paste them into two places: `frontend/.env` and the Supabase Edge Function secrets panel.

| Secret | Where it lives | Who sees it |
|---|---|---|
| `SUPABASE_URL` | frontend `.env` + edge fn | public (fine) |
| `SUPABASE_ANON_KEY` | frontend `.env` | public (fine) |
| `SUPABASE_SERVICE_ROLE_KEY` | edge fn env only | **secret** |
| `OWNTRACKS_SHARED_SECRET` | edge fn env + OwnTracks header | **secret** |
| `LOG_PAGE_PASSWORD` | frontend `.env` (hashed) | **secret** |
| `MAPBOX_TOKEN` | frontend `.env` | public (URL-restrict it) |

---

## 4. One-Time Decisions Before You Leave

- [ ] Pick a **domain or Netlify subdomain** (e.g. `billys-trip.netlify.app`)
- [ ] Pick the **password for `/log`** (simple phrase you can type one-handed at a gas station)
- [ ] Decide whether the public site should show **live location** or **delayed by 30 min** (safety vs. coolness tradeoff)
- [ ] Charging: bring a **car USB-C charger** — OwnTracks in the background burns ~5-10% battery/hour

---

## 5. Pre-Trip Test (do this a week before departure)

- [ ] Drive around your neighborhood for 20 min with OwnTracks running
- [ ] Confirm new rows appear in Supabase `locations` table
- [ ] Open the site on a friend's phone — confirm map updates and route draws
- [ ] Submit a test entry at `/log` — confirm pin appears on map with correct icon
- [ ] Kill the app, reopen — confirm it resumes logging (iOS sometimes suspends)
- [ ] Toggle airplane mode for 10 min while driving — confirm queued pings flush when reconnected

---

## 6. Nice-to-Haves (skip if short on time)

- [ ] Custom domain via Namecheap/Cloudflare
- [ ] Uptime monitor (https://uptimerobot.com free) pinging the site every 5 min
- [ ] Photo support on `/log` (uploads to Supabase Storage)
- [ ] Shareable day-summary card auto-posted to a Discord/SMS thread
