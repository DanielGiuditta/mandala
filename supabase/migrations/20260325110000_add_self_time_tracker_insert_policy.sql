create or replace function public.can_self_track_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_person_id() is not null
    and (
      public.can_manage_project(target_project_id)
      or public.is_assigned_to_project(target_project_id)
    )
$$;

drop policy if exists "authenticated users can insert self manual time entries"
on public.time_entries;

create policy "authenticated users can insert self manual time entries"
on public.time_entries
for insert
to authenticated
with check (
  person_id = public.current_person_id()
  and public.can_self_track_project(project_id)
  and source = 'manual'
  and (
    assignment_id is null
    or exists (
      select 1
      from public.assignments a
      where a.id = time_entries.assignment_id
        and a.project_id = time_entries.project_id
        and a.person_id = time_entries.person_id
    )
  )
);
