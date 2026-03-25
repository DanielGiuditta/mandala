drop policy if exists "users can read their own user account" on public.user_accounts;
create policy "authorized users can read visible user accounts"
on public.user_accounts
for select
to authenticated
using (
  lower(email) = public.current_user_email()
  or exists (
    select 1
    from public.people p
    where p.id = user_accounts.person_id
      and public.can_view_person(p.id, p.office_id)
  )
);

drop policy if exists "users can read their own role assignments" on public.role_assignments;
create policy "authorized users can read visible role assignments"
on public.role_assignments
for select
to authenticated
using (
  exists (
    select 1
    from public.user_accounts ua
    where ua.id = role_assignments.user_account_id
      and (
        lower(ua.email) = public.current_user_email()
        or exists (
          select 1
          from public.people p
          where p.id = ua.person_id
            and public.can_view_person(p.id, p.office_id)
        )
      )
  )
);
