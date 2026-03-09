# AGENTS.md for packages/domain

This folder owns business language and business rules.

## Rules

- Centralize entity types, enums, validation, and derived calculations here.
- Prefer explicit invariants over convenience helpers.
- Do not leak database-only shapes into domain APIs unless clearly intentional.
- Any change here may require updates to docs and tests.

## Required sync points

If you change business meaning, update:
- `../../docs/01-product/domain-model.md`
- `../../docs/01-product/workflow-stages.md` when stages change
