-- Read-only checks right after applying 20261024210000_keep_all_desktop_time:
--   PGOPTIONS='-c default_transaction_read_only=on' psql "$PROD_DB_URL" -X -v ON_ERROR_STOP=1 -f verify.sql
-- Compare the baseline rows printed at the end with the precheck output: the
-- migration itself must not change any receipt, timer or time entry.

-- 1. Six new receipt columns, nothing else.
do $$
declare cols text;
begin
  select string_agg(column_name, ',' order by ordinal_position) into cols
    from information_schema.columns where table_schema = 'public' and table_name = 'desktop_work_sessions';
  if cols is distinct from 'id,person_id,project_id,started_at,last_activity_at,entry_date,stopped_at,time_entry_id,confirmed_at,stop_limit_at,superseded_by,client_finished_at,agent_version,device_name' then
    raise exception 'FAIL: unexpected desktop_work_sessions columns: %', cols;
  end if;
end $$;

-- 2. Function bodies are exactly the repository's new versions; the old
--    three-argument start is gone.
do $$
declare
  expected jsonb := jsonb_build_object(
    'start_desktop_work_session(session_id uuid, target_project_id uuid, entry_date date, started_seconds_ago numeric, agent_version text, device_name text)', '4b958c7e96c80ac0645f4621f7248b77',
    'touch_desktop_work_session(session_id uuid, activity_at timestamp with time zone)', '98ba32dbc5226261f9cd7e3294e413fd',
    'finish_desktop_work_session(session_id uuid, stopped_at timestamp with time zone)', 'cf47c83960eaf4102fea4c787195dd0e',
    'set_desktop_session_stop(target_session_id uuid, new_stop timestamp with time zone)', '13e99fbc8d671ac2ddadb184f22e3c50',
    'require_active_desktop_person()', '75968d285ce0161a975a344fee5a2458');
  actual jsonb;
begin
  select jsonb_object_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', md5(p.prosrc)) into actual
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('start_desktop_work_session', 'touch_desktop_work_session', 'finish_desktop_work_session',
                       'require_active_desktop_person', 'set_desktop_session_stop');
  if actual is distinct from expected then
    raise exception 'FAIL: session functions differ from the repository. Expected % but found %', expected, actual;
  end if;
end $$;

-- 3. Employees can call start/touch/finish; nobody can call the internal helper.
do $$
begin
  if not has_function_privilege('authenticated', 'public.start_desktop_work_session(uuid,uuid,date,numeric,text,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.touch_desktop_work_session(uuid,timestamptz)', 'execute')
     or not has_function_privilege('authenticated', 'public.finish_desktop_work_session(uuid,timestamptz)', 'execute') then
    raise exception 'FAIL: authenticated users cannot execute the session functions.';
  end if;
  if has_function_privilege('authenticated', 'public.set_desktop_session_stop(uuid,timestamptz)', 'execute')
     or has_function_privilege('anon', 'public.set_desktop_session_stop(uuid,timestamptz)', 'execute') then
    raise exception 'FAIL: set_desktop_session_stop is callable by API users.';
  end if;
end $$;

-- 4. Recorded in the migration history (when the table exists).
do $$
declare recorded boolean;
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'select exists (select 1 from supabase_migrations.schema_migrations where version = ''20261024210000'')' into recorded;
    if not recorded then raise exception 'FAIL: 20261024210000 is not recorded in the migration history.'; end if;
  end if;
end $$;

-- 5. Same baseline queries as the precheck (expect identical results).
select count(*) as receipts, count(*) filter (where stopped_at is null) as open_receipts,
       max(started_at) as latest_start
  from public.desktop_work_sessions;
select source, count(*) as entries, sum(hours) as hours from public.time_entries group by source order by source;
select d.id, p.full_name, d.project_id, d.started_at, d.last_activity_at
  from public.desktop_work_sessions d join public.people p on p.id = d.person_id
 where d.stopped_at is null order by d.started_at;
