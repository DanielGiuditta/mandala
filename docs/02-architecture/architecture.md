# Architecture

## Suggested top-level shape

- `apps/web` — user-facing application
- `apps/desktop-agent` — optional Windows tray app for timer convenience and future activity signals
- `packages/ui` — shared components and tokens
- `packages/domain` — shared schemas, types, enums, and pure business logic
- `packages/db` — database clients, generated types, query helpers
- `supabase` — local config, migrations, policies, seed data

## Why this shape

The product has two interfaces with shared domain rules:
1. the web application
2. an optional Windows companion agent

A monorepo avoids duplicating domain types, permission enums, workflow keys, and design-system primitives.

## Build strategy

Lay the core model down first, then build vertical slices:
1. Offices
2. People
3. Projects
4. Assignments
5. Time entries + rollups
6. Resources + storage
7. Auth + authorization skeleton
8. Project and people list/detail flows
9. Dashboard
10. Advanced workflow and approvals only if scope expands beyond V1

## Boundaries

- UI packages should not own business rules.
- Database packages should not own presentation decisions.
- Shared domain package owns canonical enums and validation.
- App code composes modules; it should not redefine domain constants.
