drop policy if exists "authorized users can insert managed user accounts" on public.user_accounts;
create policy "authorized users can insert managed user accounts"
on public.user_accounts
for insert
to authenticated
with check (
  person_id is not null
  and exists (
    select 1
    from public.people p
    where p.id = user_accounts.person_id
      and public.can_manage_people_for_office(p.office_id)
  )
);

drop policy if exists "partners can insert managed role assignments" on public.role_assignments;
create policy "partners can insert managed role assignments"
on public.role_assignments
for insert
to authenticated
with check (
  public.has_partner_role()
  and exists (
    select 1
    from public.user_accounts ua
    left join public.people p
      on p.id = ua.person_id
    where ua.id = role_assignments.user_account_id
      and (
        role_assignments.role = 'partner'
        or (
          role_assignments.role = 'admin'
          and p.id is not null
          and public.can_manage_people_for_office(p.office_id)
        )
      )
  )
);
