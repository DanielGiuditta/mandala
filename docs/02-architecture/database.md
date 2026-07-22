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
- active_work_sessions (one current session per person; finalized work remains in `time_entries`)

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
- enforce the one-active-session-per-person rule with a unique `active_work_sessions.person_id` key; session start, stop, switch, and idle pause must be transactional with the corresponding `TimeEntry` write
- one exact email, `danielgiuditta@gmail.com`, may receive a bootstrap runtime override without adding a new stored role

## RLS baseline for authorization work

- partner access is instance-wide
- admin access is also instance-wide in the current contract
- project-lead policies should derive from the linked user account's `person_id = projects.lead_person_id`
- project-lead read policies should allow system-wide employee and project reads once the viewer leads at least one active project
- employee contribution policies should derive from active assignment relationships
- self time-tracker policies may resolve the current internal person from the linked user account or, when needed, a unique `people.email` match for the signed-in email
- self time-tracker project selection should be limited to projects the current viewer may write to
- client policies should derive only from explicit `client_project_access`
- salary and hourly-cost reads should remain restricted to admins, partners, and the bootstrap override
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
- Prefer additive SQL read functions for heavy list/detail views when they replace multiple round trips without weakening RLS.
