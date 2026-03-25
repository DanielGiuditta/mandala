create or replace function public.is_supervisor_of_person(target_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.people p
    where p.id = target_person_id
      and p.supervisor_person_id = public.current_person_id()
  )
$$;

drop policy if exists "authorized users can read time entries" on public.time_entries;
create policy "authorized users can read time entries"
on public.time_entries
for select
to authenticated
using (
  person_id = public.current_person_id()
  or public.is_supervisor_of_person(person_id)
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

drop policy if exists "authorized users can update time entries" on public.time_entries;
create policy "authorized users can update time entries"
on public.time_entries
for update
to authenticated
using (
  public.can_manage_project(project_id)
  or public.is_supervisor_of_person(person_id)
)
with check (
  public.can_manage_project(project_id)
  or public.is_supervisor_of_person(person_id)
);
