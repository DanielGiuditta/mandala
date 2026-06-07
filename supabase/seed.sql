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
  supervisor_person_id,
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
    null,
    2400000.00,
    40.00,
    'anjali.menon@kolam.local',
    true
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'Vikram Rao',
    'Partner',
    '00000000-0000-0000-0000-000000000002',
    null,
    2340000.00,
    40.00,
    'vikram.rao@kolam.local',
    true
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    'Meera Joseph',
    'Partner',
    '00000000-0000-0000-0000-000000000003',
    null,
    2280000.00,
    40.00,
    'meera.joseph@kolam.local',
    true
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    'Arjun Thomas',
    'Project Architect',
    '00000000-0000-0000-0000-000000000001',
    null,
    1140000.00,
    40.00,
    'arjun.thomas@kolam.local',
    true
  ),
  (
    '10000000-0000-0000-0000-000000000005',
    'Nisha Varghese',
    'Designer',
    '00000000-0000-0000-0000-000000000002',
    null,
    720000.00,
    40.00,
    'nisha.varghese@kolam.local',
    true
  ),
  (
    '10000000-0000-0000-0000-000000000006',
    'Devika Paul',
    'Project Coordinator',
    '00000000-0000-0000-0000-000000000003',
    null,
    600000.00,
    35.00,
    'devika.paul@kolam.local',
    true
  )
on conflict (id) do update
set
  full_name = excluded.full_name,
  title = excluded.title,
  office_id = excluded.office_id,
  supervisor_person_id = excluded.supervisor_person_id,
  annual_salary = excluded.annual_salary,
  availability_hours_per_week = excluded.availability_hours_per_week,
  email = excluded.email,
  active = excluded.active;

update public.people
set supervisor_person_id = case id
  when '10000000-0000-0000-0000-000000000004' then '10000000-0000-0000-0000-000000000001'
  when '10000000-0000-0000-0000-000000000005' then '10000000-0000-0000-0000-000000000002'
  when '10000000-0000-0000-0000-000000000006' then '10000000-0000-0000-0000-000000000003'
  else null
end
where id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000005',
  '10000000-0000-0000-0000-000000000006'
);

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
  photo_url,
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
    null,
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
    null,
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
    null,
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
  photo_url = excluded.photo_url,
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
    8.00,
    '2026-03-01',
    '2026-08-31',
    'Advisory support during planning while primary work remains in Calicut.',
    true
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000006',
    16.00,
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
    8.00,
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

insert into public.time_entries (
  id,
  person_id,
  project_id,
  assignment_id,
  date,
  hours,
  notes,
  source
)
values
  (
    '40000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000004',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '2026-03-02',
    7.50,
    'Consultant coordination and design review.',
    'manual'
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000004',
    '20000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000002',
    '2026-03-03',
    2.50,
    'Cross-office planning workshop support.',
    'windows-tracker'
  ),
  (
    '40000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000006',
    '20000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000003',
    '2026-03-03',
    5.00,
    'Meeting prep and follow-up log.',
    'manual'
  ),
  (
    '40000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000005',
    '20000000-0000-0000-0000-000000000003',
    null,
    '2026-03-04',
    5.50,
    'Concept sketches entered without assignment link.',
    'manual'
  ),
  (
    '40000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000005',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000005',
    '2026-03-05',
    3.50,
    'Interior graphics package updates.',
    'windows-tracker'
  )
on conflict (id) do update
set
  person_id = excluded.person_id,
  project_id = excluded.project_id,
  assignment_id = excluded.assignment_id,
  date = excluded.date,
  hours = excluded.hours,
  notes = excluded.notes,
  source = excluded.source;

insert into public.resource_documents (
  id,
  name,
  file_url,
  file_type,
  project_id,
  category,
  description,
  uploaded_by_person_id,
  created_at
)
values
  (
    '50000000-0000-0000-0000-000000000001',
    'Malabar Arts Center Brief',
    'https://files.kolam.local/projects/malabar-arts-center/brief.pdf',
    'pdf',
    '20000000-0000-0000-0000-000000000001',
    'brief',
    'Client brief and project goals for the arts center expansion.',
    '10000000-0000-0000-0000-000000000004',
    '2026-02-05T10:00:00Z'
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    'Bangalore Civic Hub Site Plan',
    'https://files.kolam.local/projects/bangalore-civic-hub/site-plan.dwg',
    'dwg',
    '20000000-0000-0000-0000-000000000002',
    'drawing',
    'Base site plan package shared across managing and originating offices.',
    '10000000-0000-0000-0000-000000000006',
    '2026-03-02T15:30:00Z'
  ),
  (
    '50000000-0000-0000-0000-000000000003',
    'Waterfront Housing Moodboard',
    'https://files.kolam.local/projects/kochi-waterfront-housing/moodboard.png',
    'png',
    '20000000-0000-0000-0000-000000000003',
    'reference',
    'Early concept reference board for the residential waterfront package.',
    '10000000-0000-0000-0000-000000000005',
    '2026-03-04T09:15:00Z'
  ),
  (
    '50000000-0000-0000-0000-000000000004',
    'kolam Presentation Template',
    'https://files.kolam.local/library/templates/presentation-template.pptx',
    'pptx',
    null,
    'template',
    'Shared internal presentation template for project reviews and client updates.',
    '10000000-0000-0000-0000-000000000001',
    '2026-01-10T08:00:00Z'
  ),
  (
    '50000000-0000-0000-0000-000000000005',
    'Facade Material Reference Library',
    'https://files.kolam.local/library/references/facade-material-reference.pdf',
    'pdf',
    null,
    'reference',
    'Shared facade precedent and material guidance for early design work.',
    '10000000-0000-0000-0000-000000000002',
    '2026-01-20T11:45:00Z'
  )
on conflict (id) do update
set
  name = excluded.name,
  file_url = excluded.file_url,
  file_type = excluded.file_type,
  project_id = excluded.project_id,
  category = excluded.category,
  description = excluded.description,
  uploaded_by_person_id = excluded.uploaded_by_person_id,
  created_at = excluded.created_at;

insert into public.checklist_items (
  id,
  project_id,
  title,
  assigned_person_id,
  completed,
  created_at,
  completed_at
)
values
  (
    '60000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Confirm consultant kickoff agenda',
    '10000000-0000-0000-0000-000000000004',
    false,
    '2026-03-01T09:00:00Z',
    null
  ),
  (
    '60000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'Upload revised arts center brief',
    '10000000-0000-0000-0000-000000000005',
    true,
    '2026-02-28T14:30:00Z',
    '2026-03-02T10:15:00Z'
  ),
  (
    '60000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000002',
    'Prepare planning workshop checklist',
    '10000000-0000-0000-0000-000000000006',
    false,
    '2026-03-02T11:00:00Z',
    null
  ),
  (
    '60000000-0000-0000-0000-000000000004',
    '20000000-0000-0000-0000-000000000003',
    'Review waterfront precedent set',
    null,
    false,
    '2026-03-03T08:45:00Z',
    null
  ),
  (
    '60000000-0000-0000-0000-000000000005',
    '20000000-0000-0000-0000-000000000002',
    'Send revised civic hub notes to client',
    '10000000-0000-0000-0000-000000000003',
    true,
    '2026-03-01T16:00:00Z',
    '2026-03-03T17:20:00Z'
  )
on conflict (id) do update
set
  project_id = excluded.project_id,
  title = excluded.title,
  assigned_person_id = excluded.assigned_person_id,
  completed = excluded.completed,
  created_at = excluded.created_at,
  completed_at = excluded.completed_at;

insert into public.user_accounts (
  id,
  person_id,
  email,
  active
)
values
  (
    '70000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'anjali.menon@kolam.local',
    true
  ),
  (
    '70000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    'vikram.rao@kolam.local',
    true
  ),
  (
    '70000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000003',
    'meera.joseph@kolam.local',
    true
  ),
  (
    '70000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000004',
    'arjun.thomas@kolam.local',
    true
  ),
  (
    '70000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000005',
    'nisha.varghese@kolam.local',
    true
  ),
  (
    '70000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000006',
    'devika.paul@kolam.local',
    true
  ),
  (
    '70000000-0000-0000-0000-000000000007',
    null,
    'client@kerala-cultural-trust.example',
    true
  )
on conflict (id) do update
set
  person_id = excluded.person_id,
  email = excluded.email,
  active = excluded.active;

insert into public.role_assignments (
  id,
  user_account_id,
  role,
  office_id,
  assigned_by_user_account_id,
  active
)
values
  (
    '80000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001',
    'partner',
    null,
    '70000000-0000-0000-0000-000000000001',
    true
  ),
  (
    '80000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000006',
    'admin',
    '00000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000001',
    true
  ),
  (
    '80000000-0000-0000-0000-000000000003',
    '70000000-0000-0000-0000-000000000006',
    'admin',
    '00000000-0000-0000-0000-000000000003',
    '70000000-0000-0000-0000-000000000001',
    true
  )
on conflict (id) do update
set
  user_account_id = excluded.user_account_id,
  role = excluded.role,
  office_id = excluded.office_id,
  assigned_by_user_account_id = excluded.assigned_by_user_account_id,
  active = excluded.active;

insert into public.client_project_access (
  id,
  user_account_id,
  project_id,
  active
)
values
  (
    '90000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000007',
    '20000000-0000-0000-0000-000000000001',
    true
  )
on conflict (id) do update
set
  user_account_id = excluded.user_account_id,
  project_id = excluded.project_id,
  active = excluded.active;
