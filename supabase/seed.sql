insert into public.offices (
  id,
  name,
  location,
  partner_person_id,
  active
)
values
  (
    '00000000-0000-0000-0000-000000000001',
    'Calicut',
    'Calicut',
    null,
    true
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'Bangalore',
    'Bangalore',
    null,
    true
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'Kochi',
    'Kochi',
    null,
    true
  )
on conflict (id) do update
set
  name = excluded.name,
  location = excluded.location,
  partner_person_id = excluded.partner_person_id,
  active = excluded.active;
