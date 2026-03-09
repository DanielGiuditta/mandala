create table public.time_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  person_id uuid not null,
  project_id uuid not null,
  assignment_id uuid,
  date date not null,
  hours numeric(6, 2) not null,
  notes text,
  source text,
  check (hours > 0)
);

alter table public.time_entries enable row level security;

create policy "authenticated users can read time entries"
on public.time_entries
for select
to authenticated
using (true);
