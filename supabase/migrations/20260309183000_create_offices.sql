create extension if not exists pgcrypto with schema extensions;

create table public.offices (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  location text,
  partner_person_id uuid,
  active boolean not null default true
);

alter table public.offices enable row level security;

create policy "authenticated users can read offices"
on public.offices
for select
to authenticated
using (true);
