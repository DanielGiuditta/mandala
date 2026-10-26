-- Read-only. Fails with FAIL: ... unless the migration is fully in place.
do $$
begin
  if has_table_privilege('authenticated', 'public.time_entries', 'INSERT')
     or has_table_privilege('anon', 'public.time_entries', 'INSERT') then
    raise exception 'FAIL: API roles can still insert time entries.';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'time_entries' and cmd = 'INSERT') then
    raise exception 'FAIL: an insert policy remains on time_entries.';
  end if;
  if not has_table_privilege('authenticated', 'public.time_entries', 'SELECT')
     or not has_table_privilege('authenticated', 'public.time_entries', 'UPDATE')
     or (select count(*) from pg_policies where schemaname = 'public' and tablename = 'time_entries' and cmd in ('SELECT', 'UPDATE')) <> 2 then
    raise exception 'FAIL: reading or correcting time entries changed.';
  end if;
  if not has_function_privilege('authenticated', 'public.start_desktop_work_session(uuid,uuid,date,numeric,text,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.finish_desktop_work_session(uuid,timestamptz)', 'execute')
     or not has_function_privilege('authenticated', 'public.stop_self_work_session(date)', 'execute') then
    raise exception 'FAIL: employees can no longer call the tracker functions.';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261026030000') then
    raise exception 'FAIL: 20261026030000 is not recorded.';
  end if;
end $$;
select count(*) as time_entries, sum(hours) as hours from public.time_entries;
