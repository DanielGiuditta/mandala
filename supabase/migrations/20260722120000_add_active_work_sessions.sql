create table public.active_work_sessions (
  person_id uuid primary key references public.people (id) on delete cascade,
  project_id uuid not null references public.projects (id),
  started_at timestamptz not null default timezone('utc', now()),
  last_activity_at timestamptz not null default timezone('utc', now())
);

create index active_work_sessions_project_id_idx
on public.active_work_sessions (project_id);

alter table public.active_work_sessions enable row level security;

create policy "users can read their own active work session"
on public.active_work_sessions
for select
to authenticated
using (person_id = public.current_person_id());

create or replace function public.has_active_work_session()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.active_work_sessions aws
    where aws.person_id = public.current_person_id()
  )
$$;

create or replace function public.can_work_on_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.active_work_sessions aws
    where aws.person_id = public.current_person_id()
      and aws.project_id <> target_project_id
  )
$$;

create or replace function public.start_self_work_session(
  target_project_id uuid,
  entry_date date,
  confirm_switch boolean default false
)
returns table (
  project_id uuid,
  started_at timestamptz,
  stopped_project_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_person uuid := public.current_person_id();
  existing_session public.active_work_sessions%rowtype;
  has_existing_session boolean := false;
  now_at timestamptz := clock_timestamp();
  assignment_id uuid;
  elapsed_hours numeric;
begin
  if current_person is null then
    raise exception 'Finish account setup to track time.';
  end if;

  if entry_date is null then
    raise exception 'Entry date is required.';
  end if;

  if not public.can_self_track_project(target_project_id) then
    raise exception 'Selected project is unavailable.';
  end if;

  select *
  into existing_session
  from public.active_work_sessions
  where person_id = current_person
  for update;

  has_existing_session := found;

  if has_existing_session
    and now_at > existing_session.last_activity_at + interval '5 minutes' then
    elapsed_hours := round(
      (extract(epoch from (
        existing_session.last_activity_at + interval '5 minutes' - existing_session.started_at
      )) / 3600)::numeric,
      2
    );

    if elapsed_hours > 0 then
      select case
        when count(*) = 1 then (array_agg(a.id))[1]
        else null
      end
      into assignment_id
      from public.assignments a
      where a.active = true
        and a.person_id = current_person
        and a.project_id = existing_session.project_id
        and (a.start_date is null or a.start_date <= entry_date)
        and (a.end_date is null or a.end_date >= entry_date);

      insert into public.time_entries (
        assignment_id, date, hours, notes, person_id, project_id, source
      )
      values (
        assignment_id, entry_date, elapsed_hours, null, current_person,
        existing_session.project_id, 'manual'
      );
    end if;

    delete from public.active_work_sessions where person_id = current_person;
    has_existing_session := false;
  end if;

  if has_existing_session and existing_session.project_id = target_project_id then
    return query
    select existing_session.project_id, existing_session.started_at, null::uuid;
    return;
  end if;

  if has_existing_session then
    if not confirm_switch then
      raise exception 'Confirm the active-project switch before starting another timer.';
    end if;

    elapsed_hours := round(
      (extract(epoch from now_at - existing_session.started_at) / 3600)::numeric,
      2
    );

    if elapsed_hours > 0 then
      select case
        when count(*) = 1 then (array_agg(a.id))[1]
        else null
      end
      into assignment_id
      from public.assignments a
      where a.active = true
        and a.person_id = current_person
        and a.project_id = existing_session.project_id
        and (a.start_date is null or a.start_date <= entry_date)
        and (a.end_date is null or a.end_date >= entry_date);

      insert into public.time_entries (
        assignment_id,
        date,
        hours,
        notes,
        person_id,
        project_id,
        source
      )
      values (
        assignment_id,
        entry_date,
        elapsed_hours,
        null,
        current_person,
        existing_session.project_id,
        'manual'
      );
    end if;

    update public.active_work_sessions
    set
      project_id = target_project_id,
      started_at = now_at,
      last_activity_at = now_at
    where person_id = current_person;

    return query
    select target_project_id, now_at, existing_session.project_id;
    return;
  end if;

  insert into public.active_work_sessions (
    person_id,
    project_id,
    started_at,
    last_activity_at
  )
  values (
    current_person,
    target_project_id,
    now_at,
    now_at
  );

  return query select target_project_id, now_at, null::uuid;
end;
$$;

create or replace function public.stop_self_work_session(entry_date date)
returns table (
  project_id uuid,
  started_at timestamptz,
  stopped_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_person uuid := public.current_person_id();
  existing_session public.active_work_sessions%rowtype;
  now_at timestamptz := clock_timestamp();
  stop_at timestamptz;
  assignment_id uuid;
  elapsed_hours numeric;
begin
  if current_person is null then
    raise exception 'Finish account setup to track time.';
  end if;

  if entry_date is null then
    raise exception 'Entry date is required.';
  end if;

  select *
  into existing_session
  from public.active_work_sessions
  where person_id = current_person
  for update;

  if not found then
    raise exception 'There is no active project timer.';
  end if;

  stop_at := least(
    now_at,
    existing_session.last_activity_at + interval '5 minutes'
  );
  elapsed_hours := round(
    (extract(epoch from stop_at - existing_session.started_at) / 3600)::numeric,
    2
  );

  if elapsed_hours > 0 then
    select case
      when count(*) = 1 then (array_agg(a.id))[1]
      else null
    end
    into assignment_id
    from public.assignments a
    where a.active = true
      and a.person_id = current_person
      and a.project_id = existing_session.project_id
      and (a.start_date is null or a.start_date <= entry_date)
      and (a.end_date is null or a.end_date >= entry_date);

    insert into public.time_entries (
      assignment_id,
      date,
      hours,
      notes,
      person_id,
      project_id,
      source
    )
    values (
      assignment_id,
      entry_date,
      elapsed_hours,
      null,
      current_person,
      existing_session.project_id,
      'manual'
    );
  end if;

  delete from public.active_work_sessions
  where person_id = current_person;

  return query select existing_session.project_id, existing_session.started_at, stop_at;
end;
$$;

create or replace function public.touch_self_work_session()
returns void
language sql
security definer
set search_path = public
as $$
  update public.active_work_sessions
  set last_activity_at = clock_timestamp()
  where person_id = public.current_person_id()
$$;

create or replace function public.pause_stale_self_work_session(entry_date date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  stale boolean;
begin
  select exists (
    select 1
    from public.active_work_sessions aws
    where aws.person_id = public.current_person_id()
      and aws.last_activity_at + interval '5 minutes' < clock_timestamp()
  )
  into stale;

  if stale then
    perform public.stop_self_work_session(entry_date);
  end if;

  return stale;
end;
$$;

alter policy "authorized users can insert projects"
on public.projects
with check (
  public.can_manage_projects_for_office(managing_office_id)
  and not public.has_active_work_session()
);

alter policy "authorized users can update projects"
on public.projects
using (
  public.can_manage_projects_for_office(managing_office_id)
  and public.can_work_on_project(id)
)
with check (
  public.can_manage_projects_for_office(managing_office_id)
  and public.can_work_on_project(id)
);

alter policy "authorized users can insert assignments"
on public.assignments
with check (
  public.can_manage_project(project_id)
  and public.can_work_on_project(project_id)
);

alter policy "authorized users can update assignments"
on public.assignments
using (
  public.can_manage_project(project_id)
  and public.can_work_on_project(project_id)
)
with check (
  public.can_manage_project(project_id)
  and public.can_work_on_project(project_id)
);

alter policy "authorized users can insert checklist items"
on public.checklist_items
with check (
  public.can_contribute_to_project(project_id)
  and public.can_work_on_project(project_id)
);

alter policy "authorized users can update checklist items"
on public.checklist_items
using (
  public.can_contribute_to_project(project_id)
  and public.can_work_on_project(project_id)
)
with check (
  public.can_contribute_to_project(project_id)
  and public.can_work_on_project(project_id)
);

alter policy "authorized users can insert project documents"
on public.resource_documents
with check (
  project_id is not null
  and public.can_contribute_to_project(project_id)
  and public.can_work_on_project(project_id)
);

alter policy "authorized users can update project documents"
on public.resource_documents
using (
  project_id is not null
  and public.can_contribute_to_project(project_id)
  and public.can_work_on_project(project_id)
)
with check (
  project_id is not null
  and public.can_contribute_to_project(project_id)
  and public.can_work_on_project(project_id)
);

alter policy "authorized users can update time entries"
on public.time_entries
using (
  public.can_manage_project(project_id)
  and public.can_work_on_project(project_id)
)
with check (
  public.can_manage_project(project_id)
  and public.can_work_on_project(project_id)
);

alter policy "authenticated users can insert self manual time entries"
on public.time_entries
with check (
  person_id = public.current_person_id()
  and public.can_self_track_project(project_id)
  and public.can_work_on_project(project_id)
  and source = 'manual'
  and (
    assignment_id is null
    or exists (
      select 1
      from public.assignments a
      where a.id = time_entries.assignment_id
        and a.project_id = time_entries.project_id
        and a.person_id = time_entries.person_id
    )
  )
);

revoke all on function public.has_active_work_session() from public;
grant execute on function public.has_active_work_session() to authenticated;

revoke all on function public.can_work_on_project(uuid) from public;
grant execute on function public.can_work_on_project(uuid) to authenticated;

revoke all on function public.start_self_work_session(uuid, date, boolean) from public;
grant execute on function public.start_self_work_session(uuid, date, boolean) to authenticated;

revoke all on function public.stop_self_work_session(date) from public;
grant execute on function public.stop_self_work_session(date) to authenticated;

revoke all on function public.touch_self_work_session() from public;
grant execute on function public.touch_self_work_session() to authenticated;

revoke all on function public.pause_stale_self_work_session(date) from public;
grant execute on function public.pause_stale_self_work_session(date) to authenticated;
