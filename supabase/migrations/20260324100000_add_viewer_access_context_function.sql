-- Consolidate viewer access resolution into a single database call.
-- This replaces multiple PostgREST roundtrips from the app server with one RPC.
-- The function runs as the caller and derives identity from auth.jwt(),
-- so it remains bounded by the existing RLS policies on the auth-support tables.

drop function if exists public.get_viewer_access_context(text);
drop function if exists public.get_viewer_access_context();

create function public.get_viewer_access_context()
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

  result := jsonb_build_object(
    'found', true,
    'userAccount', jsonb_build_object(
      'id', ua_row.id,
      'personId', ua_row.person_id,
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

  if ua_row.person_id is not null then
    select id, full_name, title, photo_url, office_id, annual_salary,
           availability_hours_per_week, email, active
    into person_row
    from public.people
    where id = ua_row.person_id;

    if person_row is not null then
      result := result || jsonb_build_object(
        'person', jsonb_build_object(
          'id', person_row.id,
          'fullName', person_row.full_name,
          'title', person_row.title,
          'photoUrl', person_row.photo_url,
          'officeId', person_row.office_id,
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
            where a.person_id = ua_row.person_id
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
