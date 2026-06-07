create or replace function public.can_view_compensation()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_partner_role() or public.has_admin_role()
$$;

revoke all on function public.can_view_compensation() from public;
grant execute on function public.can_view_compensation() to authenticated;

drop policy if exists "authenticated users can read people" on public.people;
drop policy if exists "authorized users can read people" on public.people;

create policy "authorized users can read people"
on public.people
for select
to authenticated
using (public.can_view_person(id, office_id));

revoke select on table public.people from anon, authenticated;
grant select (
  id,
  full_name,
  title,
  photo_url,
  office_id,
  supervisor_person_id,
  availability_hours_per_week,
  email,
  active
) on table public.people to authenticated;

create or replace function public.list_people_compensation(
  target_person_ids uuid[] default null
)
returns table (
  person_id uuid,
  annual_salary numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as person_id,
    p.annual_salary
  from public.people p
  where public.can_view_compensation()
    and (
      target_person_ids is null
      or p.id = any(target_person_ids)
    )
  order by p.id
$$;

revoke all on function public.list_people_compensation(uuid[]) from public;
grant execute on function public.list_people_compensation(uuid[]) to authenticated;

create or replace function public.get_viewer_access_context()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  result jsonb;
  ua_row record;
  person_row record;
  office_row record;
  resolved_person_id uuid;
  viewer_email text;
begin
  viewer_email := public.current_user_email();

  if viewer_email = '' then
    return jsonb_build_object('found', false);
  end if;

  select id, person_id, email, active
  into ua_row
  from public.user_accounts
  where lower(email) = viewer_email
  limit 1;

  if ua_row is null then
    return jsonb_build_object('found', false);
  end if;

  resolved_person_id := public.current_person_id();

  result := jsonb_build_object(
    'found', true,
    'userAccount', jsonb_build_object(
      'id', ua_row.id,
      'personId', resolved_person_id,
      'email', ua_row.email,
      'active', ua_row.active
    ),
    'roleAssignments', coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'id', ra.id,
          'userAccountId', ra.user_account_id,
          'role', ra.role::text,
          'officeId', ra.office_id,
          'assignedByUserAccountId', ra.assigned_by_user_account_id,
          'active', ra.active
        ))
        from public.role_assignments ra
        where ra.user_account_id = ua_row.id
          and ra.active = true
      ),
      '[]'::jsonb
    ),
    'clientProjectAccess', coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'id', cpa.id,
          'userAccountId', cpa.user_account_id,
          'projectId', cpa.project_id,
          'active', cpa.active
        ))
        from public.client_project_access cpa
        where cpa.user_account_id = ua_row.id
          and cpa.active = true
      ),
      '[]'::jsonb
    )
  );

  if resolved_person_id is not null then
    select
      id,
      full_name,
      title,
      photo_url,
      office_id,
      supervisor_person_id,
      null::numeric as annual_salary,
      availability_hours_per_week,
      email,
      active
    into person_row
    from public.people
    where id = resolved_person_id;

    if person_row is not null then
      result := result || jsonb_build_object(
        'person', jsonb_build_object(
          'id', person_row.id,
          'fullName', person_row.full_name,
          'title', person_row.title,
          'photoUrl', person_row.photo_url,
          'officeId', person_row.office_id,
          'supervisorPersonId', person_row.supervisor_person_id,
          'annualSalary', null,
          'availabilityHoursPerWeek', person_row.availability_hours_per_week,
          'email', person_row.email,
          'active', person_row.active
        )
      );

      select id, name
      into office_row
      from public.offices
      where id = person_row.office_id;

      if office_row is not null then
        result := result || jsonb_build_object(
          'office', jsonb_build_object(
            'id', office_row.id,
            'name', office_row.name
          )
        );
      end if;

      result := result || jsonb_build_object(
        'activeAssignedProjectIds', coalesce(
          (
            select jsonb_agg(distinct a.project_id)
            from public.assignments a
            where a.person_id = resolved_person_id
              and a.active = true
          ),
          '[]'::jsonb
        )
      );
    end if;
  end if;

  return result;
end;
$$;

revoke all on function public.get_viewer_access_context() from public;
grant execute on function public.get_viewer_access_context() to authenticated;

create or replace function public.get_person_detail_context(target_person_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  with target_person as (
    select
      id,
      full_name,
      title,
      photo_url,
      office_id,
      supervisor_person_id,
      null::numeric as annual_salary,
      availability_hours_per_week,
      email,
      active
    from public.people
    where id = target_person_id
  ),
  home_office as (
    select o.id, o.name
    from public.offices o
    where o.id = (select office_id from target_person)
  ),
  supervisor as (
    select
      p.id,
      p.full_name,
      p.title,
      p.photo_url,
      p.office_id,
      p.supervisor_person_id,
      null::numeric as annual_salary,
      p.availability_hours_per_week,
      p.email,
      p.active
    from public.people p
    where p.id = (select supervisor_person_id from target_person)
  ),
  assignments as (
    select
      id,
      person_id,
      project_id,
      assigned_hours_per_week,
      start_date,
      end_date,
      notes,
      active
    from public.assignments
    where person_id = target_person_id
  ),
  time_entries as (
    select
      id,
      person_id,
      project_id,
      assignment_id,
      date,
      hours,
      notes,
      source
    from public.time_entries
    where person_id = target_person_id
  ),
  checklist_items as (
    select
      id,
      project_id,
      title,
      completed,
      created_at,
      completed_at
    from public.checklist_items
    where assigned_person_id = target_person_id
  ),
  project_ids as (
    select project_id from assignments
    union
    select project_id from time_entries
    union
    select project_id from checklist_items
  ),
  projects as (
    select
      id,
      name,
      photo_url,
      stage,
      managing_office_id,
      active
    from public.projects
    where id in (select project_id from project_ids)
  ),
  managing_offices as (
    select o.id, o.name
    from public.offices o
    where o.id in (select distinct managing_office_id from projects)
  ),
  user_account as (
    select id, person_id, email, active
    from public.user_accounts
    where person_id = target_person_id
    limit 1
  ),
  role_assignments as (
    select
      id,
      user_account_id,
      role,
      office_id,
      assigned_by_user_account_id,
      active
    from public.role_assignments
    where user_account_id = (select id from user_account)
  )
  select
    case
      when exists (select 1 from target_person) then
        jsonb_build_object(
          'found', true,
          'person', (select to_jsonb(tp) from target_person tp),
          'office', (select to_jsonb(ho) from home_office ho),
          'supervisor', (select to_jsonb(s) from supervisor s),
          'assignments', coalesce(
            (
              select jsonb_agg(to_jsonb(a) order by a.active desc, a.start_date asc nulls last)
              from assignments a
            ),
            '[]'::jsonb
          ),
          'timeEntries', coalesce(
            (
              select jsonb_agg(to_jsonb(te) order by te.date desc)
              from time_entries te
            ),
            '[]'::jsonb
          ),
          'checklistItems', coalesce(
            (
              select jsonb_agg(to_jsonb(ci) order by ci.completed asc, ci.created_at desc)
              from checklist_items ci
            ),
            '[]'::jsonb
          ),
          'projects', coalesce(
            (
              select jsonb_agg(to_jsonb(p) order by p.name asc)
              from projects p
            ),
            '[]'::jsonb
          ),
          'managingOffices', coalesce(
            (
              select jsonb_agg(to_jsonb(mo) order by mo.name asc)
              from managing_offices mo
            ),
            '[]'::jsonb
          ),
          'userAccount', (select to_jsonb(ua) from user_account ua),
          'roleAssignments', coalesce(
            (
              select jsonb_agg(to_jsonb(ra) order by ra.role asc, ra.office_id asc nulls first)
              from role_assignments ra
            ),
            '[]'::jsonb
          )
        )
      else
        jsonb_build_object('found', false)
    end
$$;

revoke all on function public.get_person_detail_context(uuid) from public;
grant execute on function public.get_person_detail_context(uuid) to authenticated;

create or replace function public.get_project_detail_context(target_project_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  with target_project as (
    select
      id,
      name,
      client_name,
      description,
      photo_url,
      originating_office_id,
      managing_office_id,
      lead_person_id,
      stage,
      start_date,
      target_completion_date,
      active
    from public.projects
    where id = target_project_id
  ),
  assignments as (
    select
      id,
      project_id,
      person_id,
      assigned_hours_per_week,
      start_date,
      end_date,
      notes,
      active
    from public.assignments
    where project_id = target_project_id
  ),
  checklist_items as (
    select
      id,
      project_id,
      title,
      assigned_person_id,
      completed,
      created_at,
      completed_at
    from public.checklist_items
    where project_id = target_project_id
  ),
  documents as (
    select
      id,
      name,
      file_url,
      file_type,
      project_id,
      category,
      description,
      uploaded_by_person_id,
      created_at
    from public.resource_documents
    where project_id = target_project_id
  ),
  time_entries as (
    select
      id,
      person_id,
      project_id,
      assignment_id,
      date,
      hours,
      notes,
      source
    from public.time_entries
    where project_id = target_project_id
  ),
  related_people as (
    select
      p.id,
      p.full_name,
      p.title,
      p.photo_url,
      p.office_id,
      p.supervisor_person_id,
      null::numeric as annual_salary,
      p.availability_hours_per_week,
      p.email,
      p.active
    from public.people p
    where p.id in (
      select lead_person_id
      from target_project
      where lead_person_id is not null
      union
      select person_id from assignments
      union
      select assigned_person_id
      from checklist_items
      where assigned_person_id is not null
      union
      select person_id from time_entries
      union
      select uploaded_by_person_id
      from documents
      where uploaded_by_person_id is not null
    )
  ),
  related_offices as (
    select o.id, o.name
    from public.offices o
    where o.id in (
      select originating_office_id from target_project
      union
      select managing_office_id from target_project
      union
      select office_id from related_people
    )
  )
  select
    case
      when exists (select 1 from target_project) then
        jsonb_build_object(
          'found', true,
          'project', (select to_jsonb(tp) from target_project tp),
          'assignments', coalesce(
            (
              select jsonb_agg(to_jsonb(a) order by a.start_date asc nulls last, a.id asc)
              from assignments a
            ),
            '[]'::jsonb
          ),
          'checklistItems', coalesce(
            (
              select jsonb_agg(to_jsonb(ci) order by ci.completed asc, ci.created_at asc, ci.id asc)
              from checklist_items ci
            ),
            '[]'::jsonb
          ),
          'documents', coalesce(
            (
              select jsonb_agg(to_jsonb(d) order by d.created_at desc, d.id asc)
              from documents d
            ),
            '[]'::jsonb
          ),
          'timeEntries', coalesce(
            (
              select jsonb_agg(to_jsonb(te) order by te.date desc, te.id asc)
              from time_entries te
            ),
            '[]'::jsonb
          ),
          'people', coalesce(
            (
              select jsonb_agg(to_jsonb(p) order by p.full_name asc, p.id asc)
              from related_people p
            ),
            '[]'::jsonb
          ),
          'offices', coalesce(
            (
              select jsonb_agg(to_jsonb(o) order by o.name asc, o.id asc)
              from related_offices o
            ),
            '[]'::jsonb
          )
        )
      else
        jsonb_build_object('found', false)
    end
$$;

revoke all on function public.get_project_detail_context(uuid) from public;
grant execute on function public.get_project_detail_context(uuid) to authenticated;

create or replace function public.get_project_list_metrics(input_project_ids uuid[])
returns table (
  project_id uuid,
  planned_hours_per_week numeric,
  rough_labor_cost numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with requested_projects as (
    select distinct unnest(coalesce(input_project_ids, '{}'::uuid[])) as project_id
  ),
  visible_projects as (
    select p.id
    from public.projects p
    where p.id in (select project_id from requested_projects)
      and public.can_view_internal_project(
        p.id,
        p.managing_office_id,
        p.lead_person_id
      )
  ),
  assignment_totals as (
    select
      a.project_id,
      coalesce(sum(a.assigned_hours_per_week), 0)::numeric as planned_hours_per_week
    from public.assignments a
    where a.active = true
      and a.project_id in (select id from visible_projects)
    group by a.project_id
  ),
  time_costs as (
    select
      te.project_id,
      case
        when public.can_view_compensation() then
          coalesce(sum(te.hours * (coalesce(p.annual_salary, 0)::numeric / 2080.0)), 0)::numeric
        else null::numeric
      end as rough_labor_cost
    from public.time_entries te
    left join public.people p
      on p.id = te.person_id
    where te.project_id in (select id from visible_projects)
    group by te.project_id
  )
  select
    vp.id as project_id,
    coalesce(at.planned_hours_per_week, 0)::numeric as planned_hours_per_week,
    case
      when public.can_view_compensation() then coalesce(tc.rough_labor_cost, 0)::numeric
      else null::numeric
    end as rough_labor_cost
  from visible_projects vp
  left join assignment_totals at
    on at.project_id = vp.id
  left join time_costs tc
    on tc.project_id = vp.id
$$;

revoke all on function public.get_project_list_metrics(uuid[]) from public;
grant execute on function public.get_project_list_metrics(uuid[]) to authenticated;
