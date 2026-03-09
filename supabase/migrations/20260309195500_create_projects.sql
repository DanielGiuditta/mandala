create type public.project_stage as enum (
  'proposal',
  'planning',
  'active',
  'construction',
  'completed',
  'onHold'
);

create table public.projects (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  client_name text,
  description text,
  originating_office_id uuid not null,
  managing_office_id uuid not null,
  lead_person_id uuid,
  stage public.project_stage not null default 'proposal',
  start_date date,
  target_completion_date date,
  active boolean not null default true
);

alter table public.projects enable row level security;

create policy "authenticated users can read projects"
on public.projects
for select
to authenticated
using (true);
