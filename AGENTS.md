# AGENTS.md

## Purpose

This repository is the source of truth for an internal tracker used by a multi-office architecture firm to manage projects, people, staffing, time, and document resources.

Read these files before making changes:

- `docs/01-product/prd.md`
- `docs/01-product/domain-model.md`
- `docs/01-product/field-definitions.md`
- `docs/01-product/ui-domain-mapping.md`
- `docs/02-architecture/architecture.md`
- `docs/02-architecture/database.md`
- `docs/03-design/design-contract.md`
- `docs/04-delivery/definition-of-done.md`

## Core product rules

- Offices are the primary organizational unit.
- Do not introduce divisions or cost centers unless the docs are explicitly updated to add them back.
- People belong to a home office.
- Projects may originate in one office and be managed by another office.
- Projects must model both `originatingOfficeId` and `managingOfficeId`.
- Assignments represent planned staffing hours per week.
- Time tracking is lightweight and manual, with optional Windows tracker input.
- Salary is stored on the person record and hourly cost is derived from salary.
- "Resource" means a document or library asset, not a person or staffing slot.

## Implementation rules

- Do not invent entities, enums, fields, or relationships.
- If a field is unclear, prefer the domain docs over UI wording.
- Update docs when business meaning changes.
- Keep changes scoped to the requested feature.
- Reuse shared packages and existing patterns before creating new ones.

## Build order preference

When implementing the core model, prefer this order:

1. Office
2. Person
3. Project
4. Assignment
5. TimeEntry
6. ResourceDocument

## Validation

Before closing work:

- confirm the implementation matches `docs/01-product/domain-model.md`
- confirm no division/cost-center concepts were added
- confirm naming matches `docs/01-product/ui-domain-mapping.md`
- document any deviations
