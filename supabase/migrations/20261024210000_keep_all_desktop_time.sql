-- Desktop time is never blocked or dropped (owner decision, 24 October 2026).
--
-- 1. A new Start never fails because another computer still holds an open
--    session for the same person. The newest start ends the older open session
--    at its last server-known activity plus five minutes, never after the new
--    start, so nobody is locked out and no interval is counted twice.
-- 2. The computer that held the older session can still upload its own stop
--    later. It is accepted up to the moment the newer session began.
-- 3. A start recorded while offline, or confirmed late, is uploaded with how
--    long ago it began. The server backdates it, but never into time already
--    saved for that person; if a later session exists, this one ends there.
--
-- The five-minute idle rule is unchanged and still enforced by the agent.
-- start_desktop_work_session keeps its name and first three arguments, so
-- installed 1.0.17 agents and the LAN gateway allowlist keep working.

alter table public.desktop_work_sessions
  add column confirmed_at timestamptz,
  add column stop_limit_at timestamptz,
  add column superseded_by uuid references public.desktop_work_sessions(id),
  add column client_finished_at timestamptz;

comment on column public.desktop_work_sessions.confirmed_at is
  'Server time the start was accepted. Later than started_at when the agent started offline or the confirmation was slow.';
comment on column public.desktop_work_sessions.stop_limit_at is
  'Latest allowed stop because a later session for the same person began then. Null means only the 24-hour cap applies.';
comment on column public.desktop_work_sessions.superseded_by is
  'The later session (usually on another computer) that ended this one.';
comment on column public.desktop_work_sessions.client_finished_at is
  'Server time the owning agent uploaded its own stop. Null on a session closed by the server until its agent reports.';

-- Sets a session's stop and keeps its single time entry in step. Internal only.
create function public.set_desktop_session_stop(target_session_id uuid, new_stop timestamptz)
returns public.desktop_work_sessions
language plpgsql security definer set search_path = public as $$
declare
  receipt public.desktop_work_sessions%rowtype;
  entry public.time_entries%rowtype;
  elapsed numeric;
begin
  select * into receipt from public.desktop_work_sessions d where d.id = target_session_id for update;
  elapsed := round((extract(epoch from new_stop - receipt.started_at) / 3600)::numeric, 2);

  if receipt.time_entry_id is not null then
    select * into entry from public.time_entries t where t.id = receipt.time_entry_id;
  end if;

  if entry.id is null and elapsed > 0 then
    insert into public.time_entries(person_id, project_id, date, hours, source)
      values (receipt.person_id, receipt.project_id, receipt.entry_date, elapsed, 'windows-tracker')
      returning * into entry;
  elsif entry.id is not null and entry.source = 'windows-tracker' and elapsed > 0 then
    update public.time_entries t set hours = elapsed where t.id = entry.id;
  elsif entry.id is not null and entry.source = 'windows-tracker' then
    update public.desktop_work_sessions d set time_entry_id = null where d.id = target_session_id;
    delete from public.time_entries t where t.id = entry.id;
    entry := null;
  end if;
  -- A corrected entry (source changed by a lead) is left as corrected.

  update public.desktop_work_sessions d
    set stopped_at = new_stop, time_entry_id = entry.id
    where d.id = target_session_id
    returning * into receipt;
  return receipt;
end $$;
revoke all on function public.set_desktop_session_stop(uuid, timestamptz) from public, anon, authenticated;

drop function public.start_desktop_work_session(uuid, uuid, date);

create function public.start_desktop_work_session(
  session_id uuid,
  target_project_id uuid,
  entry_date date,
  started_seconds_ago numeric default 0
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  person uuid := public.require_active_desktop_person();
  receipt public.desktop_work_sessions%rowtype;
  open_receipt public.desktop_work_sessions%rowtype;
  web_session public.active_work_sessions%rowtype;
  now_at timestamptz := clock_timestamp();
  start_at timestamptz;
  later_stop timestamptz;
  limit_at timestamptz;
  superseding uuid;
  web_stop timestamptz;
  web_hours numeric;
begin
  if person is null or session_id is null or target_project_id is null or entry_date is null then
    raise exception 'An active employee account and session details are required.';
  end if;
  if started_seconds_ago is null or started_seconds_ago < 0 or started_seconds_ago > 7 * 86400 then
    raise exception 'Session start is outside the accepted range. Preserve diagnostics for IT.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(person::text, 0));

  select * into receipt from public.desktop_work_sessions d where d.id = session_id;
  if found then
    if receipt.person_id <> person or receipt.project_id <> target_project_id or receipt.entry_date <> entry_date then
      raise exception 'Session identity mismatch.';
    end if;
    return to_jsonb(receipt) || jsonb_build_object('server_now', now_at);
  end if;
  if not public.can_self_track_project(target_project_id) then
    raise exception 'Selected project is unavailable.';
  end if;

  -- Backdate an offline or slow start, but never into time already saved.
  start_at := now_at - make_interval(secs => started_seconds_ago::double precision);
  loop
    select max(d.stopped_at) into later_stop from public.desktop_work_sessions d
      where d.person_id = person and d.started_at <= start_at and d.stopped_at > start_at;
    exit when later_stop is null;
    start_at := later_stop;
  end loop;
  if start_at > now_at then
    start_at := now_at;
  end if;
  if entry_date < (start_at at time zone 'UTC')::date - 1 or entry_date > (start_at at time zone 'UTC')::date + 1 then
    raise exception 'Check the workstation date.';
  end if;

  -- A session that began later (on another computer) ends this one.
  select d.id, d.started_at into superseding, limit_at from public.desktop_work_sessions d
    where d.person_id = person and d.started_at > start_at
    order by d.started_at limit 1;

  -- An earlier open session elsewhere ends where this one begins.
  select * into open_receipt from public.desktop_work_sessions d
    where d.person_id = person and d.stopped_at is null for update;
  if found and open_receipt.started_at <= start_at then
    perform public.set_desktop_session_stop(open_receipt.id, greatest(open_receipt.started_at, least(
      open_receipt.last_activity_at + interval '5 minutes',
      start_at,
      open_receipt.started_at + interval '24 hours')));
    delete from public.active_work_sessions a where a.person_id = person and a.desktop_session_id = open_receipt.id;
  else
    open_receipt := null;
  end if;

  -- A web sidebar timer is closed the same way the web closes a stale timer.
  select * into web_session from public.active_work_sessions a
    where a.person_id = person and a.desktop_session_id is null for update;
  if found and web_session.started_at <= start_at then
    web_stop := greatest(web_session.started_at, least(web_session.last_activity_at + interval '5 minutes', start_at));
    web_hours := round((extract(epoch from web_stop - web_session.started_at) / 3600)::numeric, 2);
    if web_hours > 0 then
      insert into public.time_entries(person_id, project_id, date, hours, source)
        values (person, web_session.project_id, entry_date, web_hours, 'manual');
    end if;
    delete from public.active_work_sessions a where a.person_id = person;
  elsif found and (limit_at is null or web_session.started_at < limit_at) then
    limit_at := web_session.started_at;
    superseding := null;
  end if;

  if limit_at is null then
    insert into public.desktop_work_sessions(id, person_id, project_id, started_at, last_activity_at, entry_date, confirmed_at)
      values (session_id, person, target_project_id, start_at, start_at, entry_date, now_at)
      returning * into receipt;
    insert into public.active_work_sessions(person_id, project_id, started_at, last_activity_at, desktop_session_id)
      values (person, target_project_id, start_at, start_at, session_id);
  else
    -- Already ended by a later session: the agent uploads its own stop, capped at limit_at.
    insert into public.desktop_work_sessions(
      id, person_id, project_id, started_at, last_activity_at, entry_date, confirmed_at,
      stopped_at, stop_limit_at, superseded_by)
      values (session_id, person, target_project_id, start_at, start_at, entry_date, now_at,
        start_at, limit_at, superseding)
      returning * into receipt;
  end if;

  if open_receipt.id is not null then
    update public.desktop_work_sessions d
      set stop_limit_at = start_at, superseded_by = session_id
      where d.id = open_receipt.id;
  end if;
  -- server_now lets the agent map times it recorded offline onto server time.
  return to_jsonb(receipt) || jsonb_build_object('server_now', now_at);
end $$;

create or replace function public.touch_desktop_work_session(session_id uuid, activity_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare person uuid := public.require_active_desktop_person();
begin
  if person is null then raise exception 'An active employee account is required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(person::text, 0));
  if exists(select 1 from public.desktop_work_sessions d where d.id = session_id and d.person_id = person
    and d.stopped_at is not null and d.stop_limit_at is not null and d.client_finished_at is null) then
    raise exception 'AGENT-SESSION-SUPERSEDED: This account started work on another computer. Time on this computer was saved up to then. Press Stop here.';
  end if;
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
  requested_stop timestamptz := finish_desktop_work_session.stopped_at;
  final_stop timestamptz;
begin
  if person is null then raise exception 'An active employee account is required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(person::text, 0));
  select * into receipt from public.desktop_work_sessions d where d.id = session_id and d.person_id = person for update;
  if not found then raise exception 'Session is unavailable for this employee.'; end if;
  -- Already finished by its own agent (or before this migration): idempotent.
  if receipt.stopped_at is not null and (receipt.client_finished_at is not null or receipt.stop_limit_at is null) then
    return to_jsonb(receipt);
  end if;
  if requested_stop is null or requested_stop < receipt.started_at or requested_stop > clock_timestamp() + interval '1 minute'
    or requested_stop > receipt.started_at + interval '24 hours' then
    raise exception 'Session end time is invalid. Preserve diagnostics for IT.';
  end if;
  -- Recheck authorization on upload. Revoked access must not silently import time.
  if not public.can_self_track_project(receipt.project_id) then
    raise exception 'Project access changed. Preserve pending time for IT.';
  end if;

  if receipt.stopped_at is not null then
    -- Closed by the server when a later session began: accept this agent's own
    -- stop, but never past the moment the later session started.
    final_stop := greatest(receipt.started_at, least(requested_stop, receipt.stop_limit_at));
  else
    if not exists(select 1 from public.active_work_sessions where person_id = person and desktop_session_id = session_id) then
      raise exception 'Session ownership changed. Preserve diagnostics for IT.';
    end if;
    final_stop := requested_stop;
    delete from public.active_work_sessions where person_id = person and desktop_session_id = session_id;
  end if;

  perform public.set_desktop_session_stop(session_id, final_stop);
  update public.desktop_work_sessions d set client_finished_at = clock_timestamp()
    where d.id = session_id returning * into receipt;
  return to_jsonb(receipt);
end $$;

revoke all on function public.start_desktop_work_session(uuid, uuid, date, numeric) from public;
grant execute on function public.start_desktop_work_session(uuid, uuid, date, numeric) to authenticated;
