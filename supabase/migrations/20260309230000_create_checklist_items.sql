create table public.checklist_items (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  title text not null,
  assigned_person_id uuid references public.people (id),
  completed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  check (
    (completed = false and completed_at is null)
    or (completed = true and completed_at is not null)
  )
);

alter table public.checklist_items enable row level security;

create policy "authenticated users can read checklist items"
on public.checklist_items
for select
to authenticated
using (true);

create index checklist_items_project_id_idx
on public.checklist_items (project_id);

create index checklist_items_assigned_person_id_idx
on public.checklist_items (assigned_person_id);

create index checklist_items_project_id_completed_idx
on public.checklist_items (project_id, completed);
