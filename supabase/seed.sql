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

insert into public.projects (
  id,
  name,
  client_name,
  description,
  originating_office_id,
  managing_office_id,
  lead_person_id,
  stage,
  start_date,
  target_completion_date,
  active
)
values
  (
    '20000000-0000-0000-0000-000000000001',
    'Malabar Arts Center',
    'Kerala Cultural Trust',
    'Adaptive reuse and expansion for a regional arts and performance venue.',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000004',
    'active',
    '2026-01-15',
    '2026-12-30',
    true
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    'Bangalore Civic Hub',
    'South Metro Development Board',
    'Mixed-use civic and community building managed across offices.',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000003',
    'planning',
    '2026-03-01',
    '2027-05-15',
    true
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    'Kochi Waterfront Housing',
    'Blue Tide Communities',
    'Residential master planning and phased waterfront housing package.',
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    'proposal',
    '2026-02-10',
    '2027-11-20',
    true
  )
on conflict (id) do update
set
  name = excluded.name,
  client_name = excluded.client_name,
  description = excluded.description,
  originating_office_id = excluded.originating_office_id,
  managing_office_id = excluded.managing_office_id,
  lead_person_id = excluded.lead_person_id,
  stage = excluded.stage,
  start_date = excluded.start_date,
  target_completion_date = excluded.target_completion_date,
  active = excluded.active;

insert into public.assignments (
  id,
  project_id,
  person_id,
  assigned_hours_per_week,
  start_date,
  end_date,
  notes,
  active
)
values
  (
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000004',
    24.00,
    '2026-01-15',
    '2026-06-30',
    'Lead project architect for core design and consultant coordination.',
    true
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000004',
    10.00,
    '2026-03-01',
    '2026-08-31',
    'Advisory support during planning while primary work remains in Calicut.',
    true
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000006',
    20.00,
    '2026-03-01',
    '2026-12-31',
    'Project coordination and meeting follow-up for the managing office.',
    true
  ),
  (
    '30000000-0000-0000-0000-000000000004',
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000005',
    18.00,
    '2026-02-10',
    '2026-09-30',
    'Residential concept design and presentation support.',
    true
  ),
  (
    '30000000-0000-0000-0000-000000000005',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000005',
    12.00,
    '2026-02-01',
    '2026-05-31',
    'Interior and graphics package support alongside other active assignments.',
    true
  )
on conflict (id) do update
set
  project_id = excluded.project_id,
  person_id = excluded.person_id,
  assigned_hours_per_week = excluded.assigned_hours_per_week,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  notes = excluded.notes,
  active = excluded.active;
