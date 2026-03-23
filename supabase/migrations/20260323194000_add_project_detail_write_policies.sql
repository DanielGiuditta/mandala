create or replace function public.can_manage_people_for_office(target_office_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_partner_role()
    or public.is_admin_for_office(target_office_id)
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
        or public.is_admin_for_office(p.managing_office_id)
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

create policy "authorized users can update people"
on public.people
for update
to authenticated
using (public.can_manage_people_for_office(office_id))
with check (public.can_manage_people_for_office(office_id));

create policy "authorized users can insert assignments"
on public.assignments
for insert
to authenticated
with check (public.can_manage_project(project_id));

create policy "authorized users can update assignments"
on public.assignments
for update
to authenticated
using (public.can_manage_project(project_id))
with check (public.can_manage_project(project_id));

create policy "authorized users can insert checklist items"
on public.checklist_items
for insert
to authenticated
with check (public.can_contribute_to_project(project_id));

create policy "authorized users can update checklist items"
on public.checklist_items
for update
to authenticated
using (public.can_contribute_to_project(project_id))
with check (public.can_contribute_to_project(project_id));

create policy "authorized users can insert project documents"
on public.resource_documents
for insert
to authenticated
with check (
  project_id is not null
  and public.can_contribute_to_project(project_id)
);

create policy "authorized users can update project documents"
on public.resource_documents
for update
to authenticated
using (
  project_id is not null
  and public.can_contribute_to_project(project_id)
)
with check (
  project_id is not null
  and public.can_contribute_to_project(project_id)
);

create policy "authorized users can update time entries"
on public.time_entries
for update
to authenticated
using (public.can_manage_project(project_id))
with check (public.can_manage_project(project_id));
