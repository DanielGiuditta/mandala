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
- time_entries
- resource_documents

Advanced workflow tables such as approvals or checklist items should not be introduced unless the product docs are expanded beyond the current V1 scope.

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
