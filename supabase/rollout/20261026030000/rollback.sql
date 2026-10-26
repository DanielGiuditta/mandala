-- Restores the previous state exactly (policy as last defined in 20260722120000).
grant insert on table public.time_entries to anon, authenticated;
create policy "authenticated users can insert self manual time entries"
on public.time_entries
for insert
to authenticated
with check (
  person_id = public.current_person_id()
  and public.can_self_track_project(project_id)
  and public.can_work_on_project(project_id)
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
delete from supabase_migrations.schema_migrations where version = '20261026030000';
