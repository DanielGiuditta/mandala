# Architecture

## Suggested top-level shape

- `apps/web` — user-facing application
- `apps/desktop-agent` — Windows companion app for V1 project selection and time capture
- `packages/ui` — shared components and tokens
- `packages/domain` — shared schemas, types, enums, and pure business logic
- `packages/db` — database clients, generated types, query helpers
- `supabase` — local config, migrations, policies, seed data

## Why this shape

The product has two interfaces with shared domain rules:
1. the web application
2. a Windows companion app for V1 time capture

A monorepo avoids duplicating domain types, permission enums, workflow keys, and design-system primitives.

## Build strategy

Lay the core model down first, then build vertical slices:
1. Offices
2. People
3. Projects
4. Assignments
5. Native time capture + time rollups
6. Resources + storage
7. Checklist items
8. Auth + authorization skeleton
9. Project and people list/detail flows
10. Dashboard
11. Advanced workflow and approvals only if scope expands beyond V1

For V1, the authorization skeleton should add:

- `UserAccount` for login identity
- `RoleAssignment` for elevated `partner` and office-scoped `admin` permissions
- `ClientProjectAccess` for explicit client entitlements
- derived project-lead permissions from `Project.leadPersonId`
- derived employee permissions from the `UserAccount` to `Person` link and active project relationships

Office-scoped admin checks should use:

- `Person.officeId` for person management
- `Project.managingOfficeId` for project staffing, stage, time, checklist, and document management

## Boundaries

- UI packages should not own business rules.
- Database packages should not own presentation decisions.
- Shared domain package owns canonical enums and validation.
- Shared domain package should also own authorization role enums and scope rules.
- Authorization roles must not be stored in `Person.title`.
- App code composes modules; it should not redefine domain constants.
