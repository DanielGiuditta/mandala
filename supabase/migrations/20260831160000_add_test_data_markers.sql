-- Recovered on 2026-10-26 from production's migration history
-- (supabase_migrations.schema_migrations, version 20260831160000). It was applied
-- on 31 August 2026 but no copy of the repository contained the file.

alter table public.people
add column is_test_data boolean not null default false;

alter table public.projects
add column is_test_data boolean not null default false;

alter table public.user_accounts
add column is_test_data boolean not null default false;

comment on column public.people.is_test_data is
  'Internal maintenance marker for non-production people records. It does not grant or restrict access.';

comment on column public.projects.is_test_data is
  'Internal maintenance marker for non-production project records. It does not grant or restrict access.';

comment on column public.user_accounts.is_test_data is
  'Internal maintenance marker for non-production application accounts. It does not replace the active access control.';

create index people_test_data_idx
on public.people (id)
where is_test_data = true;

create index projects_test_data_idx
on public.projects (id)
where is_test_data = true;

create index user_accounts_test_data_idx
on public.user_accounts (id)
where is_test_data = true;
