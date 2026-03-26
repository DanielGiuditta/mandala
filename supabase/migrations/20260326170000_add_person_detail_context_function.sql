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
      annual_salary,
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
      p.annual_salary,
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
