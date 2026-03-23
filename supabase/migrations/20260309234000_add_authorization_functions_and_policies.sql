create or replace function public.current_user_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.current_user_account_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ua.id
  from public.user_accounts ua
  where lower(ua.email) = public.current_user_email()
    and ua.active = true
  limit 1
$$;

create or replace function public.current_person_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ua.person_id
  from public.user_accounts ua
  where lower(ua.email) = public.current_user_email()
    and ua.active = true
  limit 1
$$;

create or replace function public.has_partner_role()
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
      and ra.role = 'partner'
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
  select exists (
    select 1
    from public.role_assignments ra
    where ra.user_account_id = public.current_user_account_id()
      and ra.role = 'admin'
      and ra.office_id = target_office_id
      and ra.active = true
  )
$$;

create or replace function public.has_client_project_access(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.client_project_access cpa
    where cpa.user_account_id = public.current_user_account_id()
      and cpa.project_id = target_project_id
      and cpa.active = true
  )
$$;

create or replace function public.is_assigned_to_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assignments a
    where a.project_id = target_project_id
      and a.person_id = public.current_person_id()
      and a.active = true
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
    or public.is_admin_for_office(target_office_id)
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
    or public.is_admin_for_office(managing_office_id)
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
    or public.is_admin_for_office(managing_office_id)
    or public.current_person_id() = lead_person_id
    or public.is_assigned_to_project(target_project_id)
$$;

drop policy if exists "authenticated users can read offices" on public.offices;
create policy "authorized users can read offices"
on public.offices
for select
to authenticated
using (public.current_person_id() is not null);

drop policy if exists "authenticated users can read people" on public.people;
create policy "authorized users can read people"
on public.people
for select
to authenticated
using (public.can_view_person(id, office_id));

drop policy if exists "authenticated users can read projects" on public.projects;
create policy "authorized users can read projects"
on public.projects
for select
to authenticated
using (public.can_view_project(id, managing_office_id, lead_person_id));

drop policy if exists "authenticated users can read assignments" on public.assignments;
create policy "authorized users can read assignments"
on public.assignments
for select
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = assignments.project_id
      and public.can_view_internal_project(
        p.id,
        p.managing_office_id,
        p.lead_person_id
      )
  )
);

drop policy if exists "authenticated users can read time entries" on public.time_entries;
create policy "authorized users can read time entries"
on public.time_entries
for select
to authenticated
using (
  person_id = public.current_person_id()
  or exists (
    select 1
    from public.projects p
    where p.id = time_entries.project_id
      and public.can_view_internal_project(
        p.id,
        p.managing_office_id,
        p.lead_person_id
      )
  )
);

drop policy if exists "authenticated users can read resource documents" on public.resource_documents;
create policy "authorized users can read resource documents"
on public.resource_documents
for select
to authenticated
using (
  (project_id is null and public.current_person_id() is not null)
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

drop policy if exists "authenticated users can read checklist items" on public.checklist_items;
create policy "authorized users can read checklist items"
on public.checklist_items
for select
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = checklist_items.project_id
      and public.can_view_internal_project(
        p.id,
        p.managing_office_id,
        p.lead_person_id
      )
  )
);
