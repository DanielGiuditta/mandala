create type public.authorization_role as enum (
  'partner',
  'admin'
);

create table public.user_accounts (
  id uuid primary key default extensions.gen_random_uuid(),
  person_id uuid references public.people (id),
  email text not null,
  active boolean not null default true
);

create unique index user_accounts_email_lower_idx
on public.user_accounts ((lower(email)));

create unique index user_accounts_person_id_unique_idx
on public.user_accounts (person_id)
where person_id is not null;

alter table public.user_accounts enable row level security;

create policy "users can read their own user account"
on public.user_accounts
for select
to authenticated
using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

create table public.role_assignments (
  id uuid primary key default extensions.gen_random_uuid(),
  user_account_id uuid not null references public.user_accounts (id),
  role public.authorization_role not null,
  office_id uuid references public.offices (id),
  assigned_by_user_account_id uuid not null references public.user_accounts (id),
  active boolean not null default true,
  check (
    (role = 'partner' and office_id is null)
    or (role = 'admin' and office_id is not null)
  )
);

create unique index role_assignments_partner_unique_idx
on public.role_assignments (user_account_id, role)
where office_id is null;

create unique index role_assignments_office_unique_idx
on public.role_assignments (user_account_id, role, office_id)
where office_id is not null;

create index role_assignments_user_account_id_idx
on public.role_assignments (user_account_id);

create index role_assignments_office_id_idx
on public.role_assignments (office_id);

alter table public.role_assignments enable row level security;

create policy "users can read their own role assignments"
on public.role_assignments
for select
to authenticated
using (
  exists (
    select 1
    from public.user_accounts ua
    where ua.id = role_assignments.user_account_id
      and lower(ua.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

create table public.client_project_access (
  id uuid primary key default extensions.gen_random_uuid(),
  user_account_id uuid not null references public.user_accounts (id),
  project_id uuid not null references public.projects (id),
  active boolean not null default true
);

create unique index client_project_access_unique_idx
on public.client_project_access (user_account_id, project_id);

create index client_project_access_user_account_id_idx
on public.client_project_access (user_account_id);

create index client_project_access_project_id_idx
on public.client_project_access (project_id);

alter table public.client_project_access enable row level security;

create policy "users can read their own client project access"
on public.client_project_access
for select
to authenticated
using (
  exists (
    select 1
    from public.user_accounts ua
    where ua.id = client_project_access.user_account_id
      and lower(ua.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);
