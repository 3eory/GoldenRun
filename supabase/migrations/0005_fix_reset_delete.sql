-- 0005_fix_reset_delete.sql — Supabase blocks DELETE without WHERE

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
