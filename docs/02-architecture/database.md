# Database Notes

## Database-first rules

- Model the domain explicitly before building screens.
- Use SQL migrations for every schema change.
- Keep enum-like concepts centralized and documented.
- Treat RLS and storage policies as first-class deliverables.

## Tables to expect early

- offices
- people
- projects
- assignments
- checklist_items
- time_entries
- resource_documents

After the core operational tables, add the minimum authorization support tables:

- user_accounts
- role_assignments
- client_project_access

Lightweight `checklist_items` are in scope for V1. Advanced workflow tables such as approvals or stage-gating rules should not be introduced unless the product docs are expanded beyond the current V1 scope.

Project-lead permissions should be derived from `projects.lead_person_id`, not modeled as a separate table in V1.

## Current integrity baseline

- enforce foreign keys once the core tables exist
- add indexes on office, person, project, and assignment relationship columns
- add reporting indexes on fields such as `projects.stage`, `time_entries.date`, and `resource_documents.created_at`
- keep authorization scope keys indexed, especially `role_assignments.office_id` and `client_project_access.project_id`
- store optional project imagery on `projects.photo_url`; do not invent a separate project-media entity in V1 unless the product docs expand
- store optional person imagery on `people.photo_url`; do not invent a separate person-media entity in V1 unless the product docs expand

## RLS baseline for authorization work

- partner access is instance-wide
- admin access is office-scoped
- office-scoped people policies should anchor on `people.office_id`
- office-scoped project management policies should anchor on `projects.managing_office_id`
- project-lead policies should derive from the linked user account's `person_id = projects.lead_person_id`
- employee contribution policies should derive from active assignment or lead relationships
- client policies should derive only from explicit `client_project_access`
- salary and hourly-cost reads should remain internal and should not be exposed to client users
- client access should start with restricted project summary data unless the product docs later add explicit client-visibility fields for documents, checklist items, or time

## Recommended process

1. Write or update domain invariants.
2. Create migration.
3. Add or update policies.
4. Add seed data for the changed flow.
5. Update this doc if the contract changed.

## Query philosophy

- Build explicit list queries for dashboard and detail views.
- Rollups should be reproducible from source records.
- Avoid burying critical business logic in UI-only code.
