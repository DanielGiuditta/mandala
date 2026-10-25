-- Rollback for 20261024210000_keep_all_desktop_time. Run ONLY if needed, and only
-- while no Agent 1.0.18 is installed anywhere: 1.0.18 calls the extended start (with started_seconds_ago)
-- this removes. Single transaction:
--   psql "$PROD_DB_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f apply-guards.sql -f rollback.sql
--
-- Restores the exact 20260907090000 start/touch/finish bodies (copied verbatim
-- below) and removes the internal helper. The six added receipt columns are
-- kept: the restored functions ignore them and no saved data is dropped.

drop function public.start_desktop_work_session(uuid, uuid, date, numeric, text, text);

create function public.start_desktop_work_session(session_id uuid, target_project_id uuid, entry_date date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  person uuid := public.require_active_desktop_person();
  receipt public.desktop_work_sessions%rowtype;
  now_at timestamptz := clock_timestamp();
begin
  if person is null or session_id is null or entry_date is null then
    raise exception 'An active employee account and session details are required.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(person::text, 0));
  select * into receipt from public.desktop_work_sessions d where d.id = session_id;
  if found then
    if receipt.person_id <> person or receipt.project_id <> target_project_id or receipt.entry_date <> entry_date then
      raise exception 'Session identity mismatch.';
    end if;
    return to_jsonb(receipt);
  end if;
  if not public.can_self_track_project(target_project_id) then
    raise exception 'Selected project is unavailable.';
  end if;
  if exists(select 1 from public.active_work_sessions where person_id = person) then
    raise exception 'Stop the existing timer on its original device before starting work here.';
  end if;
  if entry_date < (now_at at time zone 'UTC')::date - 1 or entry_date > (now_at at time zone 'UTC')::date + 1 then
    raise exception 'Check the workstation date.';
  end if;
  insert into public.desktop_work_sessions(id, person_id, project_id, started_at, last_activity_at, entry_date)
    values (session_id, person, target_project_id, now_at, now_at, entry_date)
    returning * into receipt;
  insert into public.active_work_sessions(person_id, project_id, started_at, last_activity_at, desktop_session_id)
    values(person, target_project_id, now_at, now_at, session_id);
  return to_jsonb(receipt);
end $$;

create or replace function public.touch_desktop_work_session(session_id uuid, activity_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare person uuid := public.require_active_desktop_person();
begin
  if person is null then raise exception 'An active employee account is required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(person::text, 0));
  if not exists(select 1 from public.desktop_work_sessions d where d.id = session_id
    and d.person_id = person and d.stopped_at is null
    and activity_at between d.started_at and least(clock_timestamp() + interval '1 minute', d.started_at + interval '24 hours')) then
    raise exception 'Session or workstation clock is invalid.';
  end if;
  update public.desktop_work_sessions d set last_activity_at = greatest(d.last_activity_at, activity_at)
    where d.id = session_id and d.person_id = person;
  update public.active_work_sessions set last_activity_at = greatest(last_activity_at, activity_at)
    where person_id = person and desktop_session_id = session_id;
end $$;

create or replace function public.finish_desktop_work_session(session_id uuid, stopped_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  person uuid := public.require_active_desktop_person();
  receipt public.desktop_work_sessions%rowtype;
  entry_id uuid;
  elapsed numeric;
begin
  if person is null then raise exception 'An active employee account is required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(person::text, 0));
  select * into receipt from public.desktop_work_sessions d where d.id = session_id and d.person_id = person for update;
  if not found then raise exception 'Session is unavailable for this employee.'; end if;
  if receipt.stopped_at is not null then return to_jsonb(receipt); end if;
  if stopped_at is null or stopped_at < receipt.started_at or stopped_at > clock_timestamp() + interval '1 minute'
    or stopped_at > receipt.started_at + interval '24 hours' then
    raise exception 'Session end time is invalid. Preserve diagnostics for IT.';
  end if;
  if not exists(select 1 from public.active_work_sessions where person_id = person and desktop_session_id = session_id) then
    raise exception 'Session ownership changed. Preserve diagnostics for IT.';
  end if;
  -- Recheck authorization on upload. Revoked access must not silently import time.
  if not public.can_self_track_project(receipt.project_id) then
    raise exception 'Project access changed. Preserve pending time for IT.';
  end if;
  elapsed := round((extract(epoch from stopped_at - receipt.started_at) / 3600)::numeric, 2);
  if elapsed > 0 then
    insert into public.time_entries(person_id, project_id, date, hours, source)
      values(person, receipt.project_id, receipt.entry_date, elapsed, 'windows-tracker') returning id into entry_id;
  end if;
  update public.desktop_work_sessions d set stopped_at = finish_desktop_work_session.stopped_at, time_entry_id = entry_id
    where d.id = session_id returning * into receipt;
  delete from public.active_work_sessions where person_id = person and desktop_session_id = session_id;
  return to_jsonb(receipt);
end $$;

drop function public.set_desktop_session_stop(uuid, timestamptz);

revoke all on function public.start_desktop_work_session(uuid,uuid,date) from public;
grant execute on function public.start_desktop_work_session(uuid,uuid,date) to authenticated;

do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'delete from supabase_migrations.schema_migrations where version = ''20261024210000''';
  end if;
end $$;
notify pgrst, 'reload schema';
