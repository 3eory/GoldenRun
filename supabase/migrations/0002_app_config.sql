-- 0002_app_config.sql — replace GUC-based secret with a locked-down table
-- Needed because Supabase's managed Postgres disallows ALTER DATABASE ... SET.

-- ────────────────────────────────────────────────────────────────────────────
-- Config table — no one can read it directly
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.app_config (
  key   text primary key,
  value text not null
);

alter table public.app_config enable row level security;
-- No policies -> anon/authenticated clients get nothing. Only SECURITY
-- DEFINER functions (running as the table owner) can read it.

revoke all on table public.app_config from anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- Swap insert_event() over to read from app_config instead of current_setting
-- ────────────────────────────────────────────────────────────────────────────

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
  expected text;
  new_id bigint;
begin
  select value into expected from public.app_config where key = 'log_secret';

  if expected is null or expected = '' then
    raise exception 'Server log secret not configured (insert into public.app_config)';
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
