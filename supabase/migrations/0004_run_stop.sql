-- 0004_run_stop.sql — stop run (freeze tracking, preserve data)

-- Adds run_stop to app_config and exposes:
--   - stop_run(p_secret, p_stopped_at): admin write — blocks new locations/events
--   - is_run_stopped(): server-side check for edge function + insert_event
-- Updates get_run_info(), set_run_start(), reset_run(), insert_event()

create or replace function public.is_run_stopped()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(
    select 1
    from public.app_config
    where key = 'run_stop'
      and value is not null
      and value <> ''
  );
$$;

revoke all on function public.is_run_stopped() from public;
grant execute on function public.is_run_stopped() to anon, authenticated;

create or replace function public.get_run_info()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  started text;
  stopped text;
begin
  select value into started from public.app_config where key = 'run_start';
  select value into stopped from public.app_config where key = 'run_stop';
  return jsonb_build_object(
    'run_start', started,
    'run_stop', stopped
  );
end
$$;

create or replace function public.set_run_start(
  p_secret text,
  p_started_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  expected text;
begin
  select value into expected from public.app_config where key = 'admin_secret';
  if expected is null or expected = '' then
    raise exception 'Admin secret not configured (insert into public.app_config)';
  end if;
  if p_secret is distinct from expected then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  insert into public.app_config (key, value)
  values ('run_start', p_started_at::text)
  on conflict (key) do update set value = excluded.value;

  delete from public.app_config where key = 'run_stop';
end
$$;

create or replace function public.stop_run(
  p_secret text,
  p_stopped_at timestamptz default now()
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  expected text;
begin
  select value into expected from public.app_config where key = 'admin_secret';
  if expected is null or expected = '' then
    raise exception 'Admin secret not configured (insert into public.app_config)';
  end if;
  if p_secret is distinct from expected then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  insert into public.app_config (key, value)
  values ('run_stop', p_stopped_at::text)
  on conflict (key) do update set value = excluded.value;
end
$$;

revoke all on function public.stop_run(text,timestamptz) from public;
grant execute on function public.stop_run(text,timestamptz) to anon, authenticated;

create or replace function public.reset_run(
  p_secret text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  expected text;
begin
  select value into expected from public.app_config where key = 'admin_secret';
  if expected is null or expected = '' then
    raise exception 'Admin secret not configured (insert into public.app_config)';
  end if;
  if p_secret is distinct from expected then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  delete from public.locations where true;
  delete from public.events where true;
  delete from public.app_config where key = 'run_start';
  delete from public.app_config where key = 'run_stop';

  perform setval(pg_get_serial_sequence('public.locations','id'), 1, false);
  perform setval(pg_get_serial_sequence('public.events','id'), 1, false);
end
$$;

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
  if public.is_run_stopped() then
    raise exception 'Run has been stopped';
  end if;

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
