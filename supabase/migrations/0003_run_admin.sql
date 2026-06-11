-- 0003_run_admin.sql — Cannonball run controls (start time + reset)

-- Stores a run start time in app_config and exposes:
--   - get_run_info(): public read of run_start
--   - set_run_start(p_secret, p_started_at): admin write
--   - reset_run(p_secret): admin destructive wipe of locations/events + run_start
--
-- Admin secret is stored at app_config.key='admin_secret'.
-- You must insert it once from the Supabase SQL editor:
--
--   insert into public.app_config (key, value)
--   values ('admin_secret', '<long random string>')
--   on conflict (key) do update set value = excluded.value;

create or replace function public.get_run_info()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  started text;
begin
  select value into started from public.app_config where key = 'run_start';
  return jsonb_build_object('run_start', started);
end
$$;

revoke all on function public.get_run_info() from public;
grant execute on function public.get_run_info() to anon, authenticated;

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
end
$$;

revoke all on function public.set_run_start(text,timestamptz) from public;
grant execute on function public.set_run_start(text,timestamptz) to anon, authenticated;

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

  -- Reset serial sequences for cleaner IDs.
  perform setval(pg_get_serial_sequence('public.locations','id'), 1, false);
  perform setval(pg_get_serial_sequence('public.events','id'), 1, false);
end
$$;

revoke all on function public.reset_run(text) from public;
grant execute on function public.reset_run(text) to anon, authenticated;

