-- Durable desktop session ownership prevents another device/web timer from
-- finalizing a disconnected agent's session. Receipts make retries idempotent.
create function public.require_active_desktop_person()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare person uuid := public.current_person_id();
begin
  if person is null or not exists(select 1 from public.people p where p.id = person and p.active)
    or not exists(select 1 from public.user_accounts u where lower(u.email) = public.current_user_email() and u.active) then
    raise exception 'An active internal employee account is required.';
  end if;
  return person;
end $$;
revoke all on function public.require_active_desktop_person() from public, anon, authenticated;
create table public.desktop_work_sessions (
  id uuid primary key,
  person_id uuid not null references public.people(id),
  project_id uuid not null references public.projects(id),
  started_at timestamptz not null,
  last_activity_at timestamptz not null,
  entry_date date not null,
  stopped_at timestamptz,
  time_entry_id uuid references public.time_entries(id)
);
create unique index desktop_one_unfinished_session
  on public.desktop_work_sessions(person_id) where stopped_at is null;
alter table public.desktop_work_sessions enable row level security;
-- No direct API grants: access is through the self-only functions below.
revoke all on public.desktop_work_sessions from anon, authenticated;
alter table public.active_work_sessions add column desktop_session_id uuid
  references public.desktop_work_sessions(id);

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

create function public.touch_desktop_work_session(session_id uuid, activity_at timestamptz)
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

create function public.finish_desktop_work_session(session_id uuid, stopped_at timestamptz)
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

-- Retain the existing online behavior, but serialize all starts/stops on the
-- same person lock and prevent legacy/web calls from taking an agent's lease.
alter function public.start_self_work_session(uuid,date,boolean) rename to start_online_work_session;
alter function public.stop_self_work_session(date) rename to stop_online_work_session;
alter function public.touch_self_work_session() rename to touch_online_work_session;
alter function public.pause_stale_self_work_session(date) rename to pause_stale_online_work_session;
revoke all on function public.start_online_work_session(uuid,date,boolean) from public, anon, authenticated;
revoke all on function public.stop_online_work_session(date) from public, anon, authenticated;
revoke all on function public.touch_online_work_session() from public, anon, authenticated;
revoke all on function public.pause_stale_online_work_session(date) from public, anon, authenticated;

create function public.start_self_work_session(target_project_id uuid, entry_date date, confirm_switch boolean default false)
returns table(project_id uuid, started_at timestamptz, stopped_project_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(public.current_person_id()::text, 0));
  if exists(select 1 from public.active_work_sessions a where a.person_id = public.current_person_id() and a.desktop_session_id is not null) then
    raise exception 'Use the Windows agent on the original workstation to stop or switch this timer.';
  end if;
  return query select * from public.start_online_work_session(target_project_id, entry_date, confirm_switch);
end $$;
create function public.stop_self_work_session(entry_date date)
returns table(project_id uuid, started_at timestamptz, stopped_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(public.current_person_id()::text, 0));
  if exists(select 1 from public.active_work_sessions a where a.person_id = public.current_person_id() and a.desktop_session_id is not null) then
    raise exception 'Stop this timer in the Windows agent on its original workstation.';
  end if;
  return query select * from public.stop_online_work_session(entry_date);
end $$;
create function public.touch_self_work_session()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(public.current_person_id()::text, 0));
  if not exists(select 1 from public.active_work_sessions a where a.person_id = public.current_person_id() and a.desktop_session_id is not null) then
    perform public.touch_online_work_session();
  end if;
end $$;
create function public.pause_stale_self_work_session(entry_date date)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(public.current_person_id()::text, 0));
  if exists(select 1 from public.active_work_sessions a where a.person_id = public.current_person_id() and a.desktop_session_id is not null) then return false; end if;
  return public.pause_stale_online_work_session(entry_date);
end $$;
revoke all on function public.start_desktop_work_session(uuid,uuid,date) from public;
revoke all on function public.touch_desktop_work_session(uuid,timestamptz) from public;
revoke all on function public.finish_desktop_work_session(uuid,timestamptz) from public;
revoke all on function public.start_self_work_session(uuid,date,boolean) from public;
revoke all on function public.stop_self_work_session(date) from public;
revoke all on function public.touch_self_work_session() from public;
revoke all on function public.pause_stale_self_work_session(date) from public;
grant execute on function public.start_desktop_work_session(uuid,uuid,date), public.touch_desktop_work_session(uuid,timestamptz), public.finish_desktop_work_session(uuid,timestamptz), public.start_self_work_session(uuid,date,boolean), public.stop_self_work_session(date), public.touch_self_work_session(), public.pause_stale_self_work_session(date) to authenticated;

-- Live authorization for each preview fetch; no public/client access or service key.
create function public.authorize_resource_preview(resource_id uuid)
returns table(id uuid, server_path text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_active_desktop_person();
  return query select r.id, r.server_path from public.resource_documents r
    left join public.projects p on p.id = r.project_id
    where r.id = resource_id and r.server_path is not null and (
      (r.project_id is null and public.can_access_shared_library()) or
      (r.project_id is not null and public.can_view_internal_project(p.id, p.managing_office_id, p.lead_person_id))
    );
end $$;
revoke all on function public.authorize_resource_preview(uuid) from public;
grant execute on function public.authorize_resource_preview(uuid) to authenticated;
