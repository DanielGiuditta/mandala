alter table public.role_assignments
drop constraint if exists role_assignments_check;

alter table public.role_assignments
drop constraint if exists role_assignments_scope_check;

alter table public.role_assignments
add constraint role_assignments_scope_check
check (
  (role = 'partner' and office_id is null)
  or role = 'admin'
);

create or replace function public.has_exact_super_user_override()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_accounts ua
    where lower(ua.email) = 'danielgiuditta@gmail.com'
      and lower(ua.email) = public.current_user_email()
      and ua.active = true
  )
$$;

create or replace function public.has_partner_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_exact_super_user_override()
    or exists (
      select 1
      from public.role_assignments ra
      where ra.user_account_id = public.current_user_account_id()
        and ra.role = 'partner'
        and ra.active = true
    )
$$;

create or replace function public.has_admin_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.role_assignments ra
    where ra.user_account_id = public.current_user_account_id()
      and ra.role = 'admin'
      and ra.active = true
  )
$$;

create or replace function public.is_admin_for_office(target_office_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_admin_role()
$$;

create or replace function public.has_active_lead_project()
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
      where p.lead_person_id = public.current_person_id()
        and p.active = true
    )
$$;

create or replace function public.can_view_person(
  target_person_id uuid,
  target_office_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_partner_role()
    or public.has_admin_role()
    or public.has_active_lead_project()
    or public.current_person_id() = target_person_id
$$;

create or replace function public.can_view_project(
  target_project_id uuid,
  managing_office_id uuid,
  lead_person_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_partner_role()
    or public.has_admin_role()
    or public.has_active_lead_project()
    or public.current_person_id() = lead_person_id
    or public.is_assigned_to_project(target_project_id)
    or public.has_client_project_access(target_project_id)
$$;

create or replace function public.can_view_internal_project(
  target_project_id uuid,
  managing_office_id uuid,
  lead_person_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_partner_role()
    or public.has_admin_role()
    or public.has_active_lead_project()
    or public.current_person_id() = lead_person_id
    or public.is_assigned_to_project(target_project_id)
$$;

create or replace function public.can_manage_people_for_office(target_office_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_partner_role() or public.has_admin_role()
$$;

create or replace function public.can_manage_projects_for_office(target_office_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_partner_role() or public.has_admin_role()
$$;

create or replace function public.can_manage_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target_project_id
      and (
        public.has_partner_role()
        or public.has_admin_role()
        or public.current_person_id() = p.lead_person_id
      )
  )
$$;

create or replace function public.can_contribute_to_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.can_manage_project(target_project_id)
    or public.is_assigned_to_project(target_project_id)
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
    and (
      public.can_manage_project(target_project_id)
      or public.is_assigned_to_project(target_project_id)
    )
$$;

create or replace function public.can_access_shared_library()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_partner_role() or public.has_admin_role()
$$;

drop policy if exists "authenticated users can read resource documents"
on public.resource_documents;

drop policy if exists "authorized users can read resource documents"
on public.resource_documents;

create policy "authorized users can read resource documents"
on public.resource_documents
for select
to authenticated
using (
  (project_id is null and public.can_access_shared_library())
  or exists (
    select 1
    from public.projects p
    where p.id = resource_documents.project_id
      and public.can_view_internal_project(
        p.id,
        p.managing_office_id,
        p.lead_person_id
      )
  )
);

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
  where p.active = true
    and public.can_self_track_project(p.id)
  order by p.name
$$;

revoke all on function public.has_exact_super_user_override() from public;
grant execute on function public.has_exact_super_user_override() to authenticated;

revoke all on function public.has_admin_role() from public;
grant execute on function public.has_admin_role() to authenticated;

revoke all on function public.has_active_lead_project() from public;
grant execute on function public.has_active_lead_project() to authenticated;

revoke all on function public.can_access_shared_library() from public;
grant execute on function public.can_access_shared_library() to authenticated;

revoke all on function public.list_time_tracker_projects_for_current_user() from public;
grant execute on function public.list_time_tracker_projects_for_current_user() to authenticated;
