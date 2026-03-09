alter table public.people
add constraint people_office_id_fkey
foreign key (office_id) references public.offices (id);

alter table public.offices
add constraint offices_partner_person_id_fkey
foreign key (partner_person_id) references public.people (id);

alter table public.projects
add constraint projects_originating_office_id_fkey
foreign key (originating_office_id) references public.offices (id),
add constraint projects_managing_office_id_fkey
foreign key (managing_office_id) references public.offices (id),
add constraint projects_lead_person_id_fkey
foreign key (lead_person_id) references public.people (id);

alter table public.assignments
add constraint assignments_project_id_fkey
foreign key (project_id) references public.projects (id),
add constraint assignments_person_id_fkey
foreign key (person_id) references public.people (id);

alter table public.time_entries
add constraint time_entries_person_id_fkey
foreign key (person_id) references public.people (id),
add constraint time_entries_project_id_fkey
foreign key (project_id) references public.projects (id),
add constraint time_entries_assignment_id_fkey
foreign key (assignment_id) references public.assignments (id);

alter table public.resource_documents
add constraint resource_documents_project_id_fkey
foreign key (project_id) references public.projects (id),
add constraint resource_documents_uploaded_by_person_id_fkey
foreign key (uploaded_by_person_id) references public.people (id);

create index people_office_id_idx
on public.people (office_id);

create index offices_partner_person_id_idx
on public.offices (partner_person_id);

create index projects_originating_office_id_idx
on public.projects (originating_office_id);

create index projects_managing_office_id_idx
on public.projects (managing_office_id);

create index projects_lead_person_id_idx
on public.projects (lead_person_id);

create index projects_stage_idx
on public.projects (stage);

create index assignments_project_id_idx
on public.assignments (project_id);

create index assignments_person_id_idx
on public.assignments (person_id);

create index time_entries_person_id_idx
on public.time_entries (person_id);

create index time_entries_project_id_idx
on public.time_entries (project_id);

create index time_entries_assignment_id_idx
on public.time_entries (assignment_id);

create index time_entries_date_idx
on public.time_entries (date);

create index resource_documents_project_id_idx
on public.resource_documents (project_id);

create index resource_documents_uploaded_by_person_id_idx
on public.resource_documents (uploaded_by_person_id);

create index resource_documents_created_at_idx
on public.resource_documents (created_at);
