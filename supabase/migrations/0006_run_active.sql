-- 0006_run_active.sql — tracking only allowed while run is active (started, not stopped)

create or replace function public.is_run_active()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(
    select 1
    from public.app_config
    where key = 'run_start'
      and value is not null
      and value <> ''
  )
  and not public.is_run_stopped();
$$;

revoke all on function public.is_run_active() from public;
grant execute on function public.is_run_active() to anon, authenticated;

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
    'run_stop', stopped,
    'is_active', public.is_run_active()
  );
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
  if not public.is_run_active() then
    if public.is_run_stopped() then
      raise exception 'Run has been stopped';
    end if;
    raise exception 'Run has not started';
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
