create or replace function public.current_person_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with active_account as (
    select ua.person_id
    from public.user_accounts ua
    where lower(ua.email) = public.current_user_email()
      and ua.active = true
    limit 1
  ),
  matched_person as (
    select
      case
        when count(*) = 1 then (array_agg(p.id order by p.id))[1]
        else null
      end as person_id
    from public.people p
    where lower(coalesce(p.email, '')) = public.current_user_email()
      and p.active = true
  )
  select coalesce(
    (select person_id from active_account),
    (select person_id from matched_person)
  )
$$;

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
    select id, full_name, title, photo_url, office_id, supervisor_person_id, annual_salary,
           availability_hours_per_week, email, active
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
          'annualSalary', person_row.annual_salary,
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

create or replace function public.can_self_track_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_person_id() is not null
    and exists (
      select 1
      from public.projects p
      where p.id = target_project_id
        and p.active = true
    )
$$;

create or replace function public.list_time_tracker_projects_for_current_user()
returns table (
  id uuid,
  name text,
  photo_url text,
  managing_office_id uuid,
  lead_person_id uuid,
  active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.photo_url,
    p.managing_office_id,
    p.lead_person_id,
    p.active
  from public.projects p
  where public.current_person_id() is not null
    and p.active = true
  order by p.name
$$;

revoke all on function public.list_time_tracker_projects_for_current_user() from public;
grant execute on function public.list_time_tracker_projects_for_current_user() to authenticated;
