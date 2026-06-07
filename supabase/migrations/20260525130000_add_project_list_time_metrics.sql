create or replace function public.get_project_list_time_metrics(input_project_ids uuid[])
returns table (
  project_id uuid,
  total_hours numeric,
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
  time_totals as (
    select
      te.project_id,
      coalesce(sum(te.hours), 0)::numeric as total_hours,
      coalesce(sum(te.hours * (coalesce(p.annual_salary, 0)::numeric / 2080.0)), 0)::numeric
        as rough_labor_cost
    from public.time_entries te
    left join public.people p
      on p.id = te.person_id
    where te.project_id in (select id from visible_projects)
    group by te.project_id
  )
  select
    vp.id as project_id,
    coalesce(tt.total_hours, 0)::numeric as total_hours,
    case
      when public.can_view_compensation() then coalesce(tt.rough_labor_cost, 0)::numeric
      else null::numeric
    end as rough_labor_cost
  from visible_projects vp
  left join time_totals tt
    on tt.project_id = vp.id
$$;

revoke all on function public.get_project_list_time_metrics(uuid[]) from public;
grant execute on function public.get_project_list_time_metrics(uuid[]) to authenticated;
