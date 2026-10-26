-- Read-only pre-checks for migration 20261024210000_keep_all_desktop_time.
-- Run in a read-only session:
--   psql -X -v ON_ERROR_STOP=1 -c "set session characteristics as transaction read only" -f precheck.sql
-- Each DO block raises "STOP: ..." and ends the run if production is not in the
-- exact state this migration was written and tested against.

select current_database() as database, current_user as role,
       current_setting('default_transaction_read_only') as read_only, now() as checked_at;

-- 1. Not applied yet; show the recorded history around it.
do $$
declare
  history_columns text;
  recorded text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise notice 'No supabase_migrations.schema_migrations table; history will not be recorded.';
    return;
  end if;
  select string_agg(column_name, ',' order by ordinal_position) into history_columns
    from information_schema.columns where table_schema = 'supabase_migrations' and table_name = 'schema_migrations';
  execute 'select string_agg(version, '','' order by version) from supabase_migrations.schema_migrations where version >= ''20260700000000''' into recorded;
  raise notice 'Migration history columns: %; recorded since July: %', history_columns, coalesce(recorded, 'none');
  if position('20261024210000' in coalesce(recorded, '')) > 0 then
    raise exception 'STOP: 20261024210000 is already recorded as applied.';
  end if;
end $$;

-- 2. The receipts table has exactly the columns from 20260907090000.
do $$
declare cols text;
begin
  select string_agg(column_name, ',' order by ordinal_position) into cols
    from information_schema.columns where table_schema = 'public' and table_name = 'desktop_work_sessions';
  if cols is distinct from 'id,person_id,project_id,started_at,last_activity_at,entry_date,stopped_at,time_entry_id' then
    raise exception 'STOP: desktop_work_sessions columns differ from the repository: %', cols;
  end if;
end $$;

-- 3. The session functions are byte-for-byte the repository's 20260907090000 versions
--    (md5 of each function body), and nothing from the new migration exists yet.
do $$
declare
  expected jsonb := jsonb_build_object(
    'start_desktop_work_session(session_id uuid, target_project_id uuid, entry_date date)', '052b21e740ec666de05b6fa8a72ce636',
    'touch_desktop_work_session(session_id uuid, activity_at timestamp with time zone)', '822ec657df81b334853a6e168aa49277',
    'finish_desktop_work_session(session_id uuid, stopped_at timestamp with time zone)', 'e7bce23c7402a23a276a9dfe69f2afd6',
    'require_active_desktop_person()', '75968d285ce0161a975a344fee5a2458');
  actual jsonb;
begin
  select jsonb_object_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', md5(p.prosrc)) into actual
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('start_desktop_work_session', 'touch_desktop_work_session', 'finish_desktop_work_session',
                       'require_active_desktop_person', 'set_desktop_session_stop');
  if actual is distinct from expected then
    raise exception 'STOP: production session functions differ from the repository. Expected % but found %', expected, actual;
  end if;
end $$;

-- 4. Installed agents can call the functions today.
do $$
begin
  if not has_function_privilege('authenticated', 'public.start_desktop_work_session(uuid,uuid,date)', 'execute')
     or not has_function_privilege('authenticated', 'public.touch_desktop_work_session(uuid,timestamptz)', 'execute')
     or not has_function_privilege('authenticated', 'public.finish_desktop_work_session(uuid,timestamptz)', 'execute') then
    raise exception 'STOP: authenticated users cannot execute the current session functions.';
  end if;
end $$;

-- 5. Baseline to compare after the migration (the migration changes no rows).
select count(*) as receipts, count(*) filter (where stopped_at is null) as open_receipts,
       max(started_at) as latest_start
  from public.desktop_work_sessions;
select source, count(*) as entries, sum(hours) as hours from public.time_entries group by source order by source;
select d.id, p.full_name, d.project_id, d.started_at, d.last_activity_at
  from public.desktop_work_sessions d join public.people p on p.id = d.person_id
 where d.stopped_at is null order by d.started_at;
select person_id, project_id, started_at, last_activity_at, desktop_session_id
  from public.active_work_sessions order by started_at;
select count(*) as overlapping_receipt_pairs
  from public.desktop_work_sessions a
  join public.desktop_work_sessions b on a.person_id = b.person_id and a.id < b.id
 where tstzrange(a.started_at, coalesce(a.stopped_at, 'infinity')) && tstzrange(b.started_at, coalesce(b.stopped_at, 'infinity'))
   and a.stopped_at is distinct from a.started_at and b.stopped_at is distinct from b.started_at;
