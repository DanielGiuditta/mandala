create table public.assignments (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null,
  person_id uuid not null,
  assigned_hours_per_week numeric(6, 2) not null,
  start_date date,
  end_date date,
  notes text,
  active boolean not null default true,
  check (assigned_hours_per_week >= 0),
  check (start_date is null or end_date is null or end_date >= start_date)
);

alter table public.assignments enable row level security;

create policy "authenticated users can read assignments"
on public.assignments
for select
to authenticated
using (true);
