create table public.people (
  id uuid primary key default extensions.gen_random_uuid(),
  full_name text not null,
  title text,
  office_id uuid not null,
  annual_salary numeric(12, 2) not null,
  availability_hours_per_week numeric(6, 2) not null,
  email text,
  active boolean not null default true,
  check (annual_salary >= 0),
  check (availability_hours_per_week >= 0)
);

alter table public.people enable row level security;

create policy "authenticated users can read people"
on public.people
for select
to authenticated
using (true);
