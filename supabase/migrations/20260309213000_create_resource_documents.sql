create table public.resource_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  file_url text not null,
  file_type text,
  project_id uuid,
  category text,
  description text,
  uploaded_by_person_id uuid,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.resource_documents enable row level security;

create policy "authenticated users can read resource documents"
on public.resource_documents
for select
to authenticated
using (true);
