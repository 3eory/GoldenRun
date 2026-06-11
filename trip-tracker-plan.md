# 🗺️ Cross-Country Trip Tracker — System Plan

---

## 1. 📱 OwnTracks (Phone App)

- Install **OwnTracks** on your iPhone
- Set it to **HTTP mode** (not MQTT) — it will POST a JSON payload with your lat/lng to a URL you define
- Configure the interval (every 5 min is a good balance of battery vs. accuracy)
- It sends: `lat`, `lon`, `timestamp`, `battery`, `speed`, and `accuracy`

---

## 2. ☁️ Backend — Supabase (Free)

Supabase gives you a Postgres database + auto-generated REST API with no server to manage.

### `locations` table — receives OwnTracks pings

| Column | Type |
|---|---|
| id | int |
| lat | float |
| lon | float |
| timestamp | timestamptz |
| speed | float |
| battery | int |

### `events` table — your manual logs

| Column | Type |
|---|---|
| id | int |
| type | text (`gas`, `food`, `sight`, `sleep`, `note`) |
| title | text |
| notes | text |
| lat | float |
| lon | float |
| timestamp | timestamptz |
| cost | float (optional) |

A simple **Supabase Edge Function** acts as the OwnTracks webhook — it receives the POST from your phone and inserts a row into `locations`.

---

## 3. 🌐 Frontend — Static Website

Hosted free on **Netlify** or **Vercel**. Built with React + the following panels:

### Live Map (Mapbox or Leaflet)
- Animated route line of everywhere you've been
- Live "you are here" pin
- Markers for your manual events (gas ⛽, food 🍔, sights 📸, etc.)

### Trip Stats Bar
- Total miles driven
- Days on the road
- States visited
- Avg speed / top speed
- Miles today vs. total

### Event Log / Timeline
- Scrollable feed of your manual entries
- Filterable by type

---

## 4. ✏️ Manual Logging — Two Options

### Option A — Simple Password-Protected Web Form ✅ Recommended
A hidden `/log` page on your own website. You open it on your phone, fill in type + notes + optional cost, hit submit. It writes directly to the `events` table in Supabase. No extra app needed.

### Option B — Notion or Google Sheets as a CMS
Log entries in a Notion database or Google Sheet while you drive. The frontend fetches from the Notion API or Sheets API and merges it with location data. More flexible for rich notes/photos, but slightly more setup.

---

## 5. 🔄 How It All Flows

```
iPhone (OwnTracks)
    → POST every 5 min
    → Supabase Edge Function
    → locations table

You (manual log form)
    → /log page on your site
    → events table

Website (anyone with the link)
    → fetches locations + events from Supabase
    → renders map + stats + timeline
```

---

## 6. 📋 Setup Checklist

- [ ] Create free Supabase project, set up 2 tables
- [ ] Deploy Edge Function to receive OwnTracks webhook
- [ ] Install OwnTracks, point it at your Edge Function URL
- [ ] Build and deploy frontend to Netlify
- [ ] Test end-to-end before you leave
