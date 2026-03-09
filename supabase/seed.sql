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

insert into public.people (
  id,
  full_name,
  title,
  office_id,
  annual_salary,
  availability_hours_per_week,
  email,
  active
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'Anjali Menon',
    'Partner',
    '00000000-0000-0000-0000-000000000001',
    185000.00,
    40.00,
    'anjali.menon@mandala.local',
    true
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'Vikram Rao',
    'Partner',
    '00000000-0000-0000-0000-000000000002',
    182000.00,
    40.00,
    'vikram.rao@mandala.local',
    true
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    'Meera Joseph',
    'Partner',
    '00000000-0000-0000-0000-000000000003',
    178000.00,
    40.00,
    'meera.joseph@mandala.local',
    true
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    'Arjun Thomas',
    'Project Architect',
    '00000000-0000-0000-0000-000000000001',
    116000.00,
    40.00,
    'arjun.thomas@mandala.local',
    true
  ),
  (
    '10000000-0000-0000-0000-000000000005',
    'Nisha Varghese',
    'Designer',
    '00000000-0000-0000-0000-000000000002',
    92000.00,
    40.00,
    'nisha.varghese@mandala.local',
    true
  ),
  (
    '10000000-0000-0000-0000-000000000006',
    'Devika Paul',
    'Project Coordinator',
    '00000000-0000-0000-0000-000000000003',
    78000.00,
    35.00,
    'devika.paul@mandala.local',
    true
  )
on conflict (id) do update
set
  full_name = excluded.full_name,
  title = excluded.title,
  office_id = excluded.office_id,
  annual_salary = excluded.annual_salary,
  availability_hours_per_week = excluded.availability_hours_per_week,
  email = excluded.email,
  active = excluded.active;

update public.offices
set partner_person_id = case id
  when '00000000-0000-0000-0000-000000000001' then '10000000-0000-0000-0000-000000000001'
  when '00000000-0000-0000-0000-000000000002' then '10000000-0000-0000-0000-000000000002'
  when '00000000-0000-0000-0000-000000000003' then '10000000-0000-0000-0000-000000000003'
  else partner_person_id
end
where id in (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003'
);
