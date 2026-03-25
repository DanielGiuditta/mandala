drop policy if exists "authorized users can insert people" on public.people;

create policy "authorized users can insert people"
on public.people
for insert
to authenticated
with check (public.can_manage_people_for_office(office_id));
