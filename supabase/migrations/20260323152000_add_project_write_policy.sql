create or replace function public.can_manage_projects_for_office(target_office_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_partner_role()
    or public.is_admin_for_office(target_office_id)
$$;

create policy "authorized users can insert projects"
on public.projects
for insert
to authenticated
with check (public.can_manage_projects_for_office(managing_office_id));

create policy "authorized users can update projects"
on public.projects
for update
to authenticated
using (public.can_manage_projects_for_office(managing_office_id))
with check (public.can_manage_projects_for_office(managing_office_id));
