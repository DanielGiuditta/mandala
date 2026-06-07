create or replace function public.get_project_list_metrics(input_project_ids uuid[])
returns table (
  project_id uuid,
  planned_hours_per_week numeric,
  rough_labor_cost numeric
)
language sql
stable
set search_path = public
as $$
  with requested_projects as (
    select distinct unnest(coalesce(input_project_ids, '{}'::uuid[])) as project_id
  ),
  assignment_totals as (
    select
      a.project_id,
      coalesce(sum(a.assigned_hours_per_week), 0)::numeric as planned_hours_per_week
    from public.assignments a
    where
      a.active = true
      and a.project_id in (select project_id from requested_projects)
    group by a.project_id
  ),
  time_costs as (
    select
      te.project_id,
      coalesce(sum(te.hours * (coalesce(p.annual_salary, 0)::numeric / 2080.0)), 0)::numeric as rough_labor_cost
    from public.time_entries te
    left join public.people p
      on p.id = te.person_id
    where te.project_id in (select project_id from requested_projects)
    group by te.project_id
  )
  select
    rp.project_id,
    coalesce(at.planned_hours_per_week, 0)::numeric as planned_hours_per_week,
    coalesce(tc.rough_labor_cost, 0)::numeric as rough_labor_cost
  from requested_projects rp
  left join assignment_totals at
    on at.project_id = rp.project_id
  left join time_costs tc
    on tc.project_id = rp.project_id
$$;

revoke all on function public.get_project_list_metrics(uuid[]) from public;
grant execute on function public.get_project_list_metrics(uuid[]) to authenticated;

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
      p.annual_salary,
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
