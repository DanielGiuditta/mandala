# AGENTS.md for apps/web

This folder owns screen composition, routes, server actions, and feature wiring for the web app.

## Before editing in this folder

Read:
1. `../../docs/01-product/prd.md`
2. `../../docs/01-product/domain-model.md`
3. `../../docs/03-design/design-contract.md` for UI changes
4. `../../docs/04-delivery/definition-of-done.md`

## Rules

- Keep business logic out of route components when it belongs in `packages/domain`.
- Keep reusable visual building blocks out of app-specific feature files when they belong in `packages/ui`.
- Prefer server-safe data fetching patterns and typed boundaries.
- Keep tables, forms, and dashboards driven by documented domain names and enums.
- Do not add fake placeholder copy or fake statuses unless explicitly requested.

## Screen implementation checklist

- route or page matches documented scope
- empty, loading, error, and permission states are handled
- filters and table columns use documented entity fields
- actions obey documented behavior and stage constraints
- UI reuses shared components and tokens
