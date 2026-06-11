-- 0001_init.sql — Golden Run trip tracker schema
-- Run with: supabase db push    (after `supabase link --project-ref <ref>`)

set check_function_bodies = off;

-- ────────────────────────────────────────────────────────────────────────────
-- Tables
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.locations (
  id          bigserial primary key,
  lat         double precision not null,
  lon         double precision not null,
  timestamp   timestamptz      not null default now(),
  speed       double precision,
  battery     integer,
  accuracy    double precision,
  altitude    double precision,
  raw         jsonb
);

create index if not exists locations_timestamp_idx on public.locations (timestamp desc);

create table if not exists public.events (
  id          bigserial primary key,
  type        text not null check (type in ('gas','food','sight','sleep','note')),
  title       text not null,
  notes       text,
  lat         double precision not null,
  lon         double precision not null,
  timestamp   timestamptz      not null default now(),
  cost        numeric(10,2)
);

create index if not exists events_timestamp_idx on public.events (timestamp desc);
create index if not exists events_type_idx on public.events (type);

-- ────────────────────────────────────────────────────────────────────────────
-- Row-level security
-- ────────────────────────────────────────────────────────────────────────────

alter table public.locations enable row level security;
alter table public.events    enable row level security;

-- Public read. (Delay/masking for safety is handled at the query level
-- in the frontend via VITE_PUBLIC_DELAY_MINUTES.)
drop policy if exists "locations read"  on public.locations;
drop policy if exists "events read"     on public.events;

create policy "locations read" on public.locations
  for select using (true);

create policy "events read" on public.events
  for select using (true);

-- No client inserts allowed on locations — only the edge function via
-- the service role key may insert. (Service role bypasses RLS entirely.)
-- No insert/update/delete policies are defined -> all such attempts denied.

-- Events can only be inserted via the insert_event() RPC below, which
-- validates a shared secret. No direct INSERT policy is created.

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: insert_event — only path to add manual events from the browser
-- ────────────────────────────────────────────────────────────────────────────
-- Security model:
--   - Function runs as SECURITY DEFINER (owner = postgres, bypasses RLS)
--   - Caller must pass p_secret matching the app.settings.log_secret GUC
--   - Set that GUC once with:
--       alter database postgres set app.settings.log_secret = '<random string>';
--       select pg_reload_conf();
--     (Supabase dashboard: Project Settings -> Database -> Custom Postgres Config)
--   - The same string goes into the frontend as VITE_LOG_RPC_SECRET.

create or replace function public.insert_event(
  p_secret text,
  p_type   text,
  p_title  text,
  p_notes  text,
  p_lat    double precision,
  p_lon    double precision,
  p_cost   numeric default null,
  p_timestamp timestamptz default now()
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  expected text := current_setting('app.settings.log_secret', true);
  new_id bigint;
begin
  if expected is null or expected = '' then
    raise exception 'Server log secret not configured';
  end if;

  if p_secret is distinct from expected then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if p_type not in ('gas','food','sight','sleep','note') then
    raise exception 'Invalid event type: %', p_type;
  end if;

  insert into public.events (type, title, notes, lat, lon, cost, timestamp)
  values (p_type, p_title, p_notes, p_lat, p_lon, p_cost, p_timestamp)
  returning id into new_id;

  return new_id;
end
$$;

revoke all on function public.insert_event(text,text,text,text,double precision,double precision,numeric,timestamptz) from public;
grant execute on function public.insert_event(text,text,text,text,double precision,double precision,numeric,timestamptz) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- Realtime — publish both tables
-- ────────────────────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.locations;
alter publication supabase_realtime add table public.events;
